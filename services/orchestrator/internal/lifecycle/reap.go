package lifecycle

import (
	"context"
	_ "embed"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/k8s"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

//go:embed reap.lua
var reapLua string

var reapScript = redis.NewScript(reapLua)

// reapGrace là khoảng hash `session:{id}` sống thêm sau khi reap.
//
// Đây là thứ hiện thực yêu cầu "ReapSession gọi 2 lần → cả hai OK": lần thứ hai
// vẫn đọc được session cuối. Hết khoảng này thì trả NotFound — thành thật hơn
// là giả vờ OK cho một session không còn dấu vết nào.
const reapGrace = 5 * time.Minute

const reapErrNotFound = "reap: notfound:"

// ReapActor mô tả AI yêu cầu reap, sau khi tầng vận chuyển đã xác thực.
//
// ⛔ KHÔNG NHẬN TỪ FIELD CỦA REQUEST. `oneof actor` trong proto nói client
// TUYÊN BỐ mình là ai; giá trị này là thứ SERVER XÁC MINH được. Trộn hai thứ đó
// nghĩa là bất kỳ ai gọi được RPC cũng tự phong mình là `system_component` và
// reap session của người khác — và session_id không phải bí mật (nó nằm trong
// URL /ws/session/{id}).
type ReapActor struct {
	// UserID khác rỗng ⇒ reap nhân danh user đó, script sẽ kiểm khớp chủ sở hữu.
	UserID string
	// System = true ⇒ tiến trình nội bộ (reaper TTL, drain node). Chỉ tầng
	// vận chuyển mới được đặt cờ này, và chỉ khi nó CHỨNG MINH được peer là
	// in-cluster.
	System bool
	// Component ghi vào audit khi System = true.
	Component string
}

// Reap kết thúc một session và xoá pod của nó. Idempotent.
//
// THỨ TỰ CÓ CHỦ Ý: đánh dấu REAPED trong Redis TRƯỚC, xoá pod SAU. Ngược lại
// thì có một khoảng mà pod đã chết nhưng session vẫn RUNNING — gateway sẽ cho
// một kết nối mới đi qua authz rồi dial vào pod không tồn tại, và người dùng
// nhận một lỗi exec khó hiểu thay vì "phiên đã kết thúc". Nếu xoá pod thất bại
// sau khi đã đánh dấu, sweep của B7 nhặt nó lên như pod mồ côi.
func (s *Service) Reap(
	ctx context.Context, sessionID string, actor ReapActor,
) (*orchestratorv1.Session, error) {
	label := "user"
	if actor.System {
		label = "system"
	}

	sessionKey, err := rediskeys.Session(sessionID)
	if err != nil {
		s.met.ReapTotal.WithLabelValues(label, "not_found").Inc()
		return nil, status.Error(codes.NotFound, "session không tồn tại")
	}
	sessionPodKey, err := rediskeys.SessionPod(sessionID)
	if err != nil {
		s.met.ReapTotal.WithLabelValues(label, "not_found").Inc()
		return nil, status.Error(codes.NotFound, "session không tồn tại")
	}

	// Chuỗi rỗng = "hệ thống, đã xác thực ở tầng trên". Script không tự quyết.
	scriptUser := actor.UserID
	if actor.System {
		scriptUser = ""
	}

	res, err := reapScript.Run(ctx, s.rdb,
		[]string{sessionKey, sessionPodKey},
		scriptUser,
		s.now().Unix(),
		int64(reapGrace/time.Second),
	).Slice()
	if err != nil {
		if strings.Contains(err.Error(), reapErrNotFound) {
			s.met.ReapTotal.WithLabelValues(label, "not_found").Inc()
			return nil, status.Error(codes.NotFound, "session không tồn tại")
		}
		s.met.ReapTotal.WithLabelValues(label, "error").Inc()
		return nil, status.Errorf(codes.Unavailable, "reap session: %v", err)
	}

	// Kiểm len TRƯỚC khi index: một script tương lai trả mảng ngắn hơn sẽ panic
	// ở đây thay vì trả lỗi. Dòng dưới đã kiểm, dòng này thì chưa — bất đối xứng
	// không có lý do.
	if len(res) < 5 {
		s.met.ReapTotal.WithLabelValues(label, "error").Inc()
		return nil, status.Errorf(codes.Internal, "reap.lua trả %d phần tử, cần 5", len(res))
	}
	podName, _ := res[0].(string)
	alreadyReaped := res[4] == int64(1)

	// Xoá pod cả trong ca đã-reap-rồi: lần trước có thể đã đánh dấu xong mà
	// chết trước khi xoá được pod. Delete idempotent (nuốt IsNotFound), nên
	// làm lại là an toàn và rẻ hơn nhiều so với đợi một chu kỳ sweep.
	if podName != "" {
		s.cleanupPod(ctx, podName)
	}

	sess, err := Load(ctx, s.rdb, sessionID)
	if err != nil {
		s.met.ReapTotal.WithLabelValues(label, "error").Inc()
		return nil, status.Errorf(codes.Unavailable, "đọc lại session vừa reap: %v", err)
	}

	result := "ok"
	if alreadyReaped {
		result = "already_reaped"
	}
	s.met.ReapTotal.WithLabelValues(label, result).Inc()

	// Chỉ audit lần reap THẬT SỰ đổi trạng thái. Lần gọi lặp cũng trả OK (đó là
	// idempotency), nhưng nó không phải một sự kiện mới trong đời session — ghi
	// nó vào nhật ký là làm mọi truy vấn "session này bị reap mấy lần" trả lời
	// sai về số lần thật sự có chuyện xảy ra.
	if !alreadyReaped {
		detail := "reap bởi user"
		if actor.System {
			detail = "reap bởi hệ thống: " + actor.Component
		}
		s.audit(ctx, auditEvent{
			SessionID: sess.ID,
			UserID:    sess.UserID,
			Event:     auditEventReaped,
			Tier:      sess.Tier,
			PodName:   sess.PodName,
			Namespace: sess.Namespace,
			Detail:    detail,
		})
	}

	s.log.Info("session đã reap",
		slog.String("session_id", sessionID),
		slog.String("pod", podName),
		slog.String("actor", label),
		slog.Bool("already_reaped", alreadyReaped))

	return sess.ToProto(), nil
}

// cleanupPod xoá pod và mọi dấu vết của nó trong Redis. Idempotent ở mọi bước.
//
// Dùng ctx TÁCH RỜI: nếu lời gọi Reap bị huỷ giữa chừng (deadline, user đóng
// tab), Redis đã đánh dấu REAPED rồi — bỏ pod lại là rò đúng một khe trong trần
// 4 pod (D16), và pod đó không còn session nào trỏ tới nên chỉ sweep mới thấy.
func (s *Service) cleanupPod(ctx context.Context, podName string) {
	cleanupCtx, cancel := cleanupContext(ctx)
	defer cancel()

	if err := s.pods.Delete(cleanupCtx, podName, 0); err != nil {
		s.log.Error("không xoá được pod khi reap — sweep của B7 sẽ nhặt nó lên",
			slog.String("pod", podName), slog.String("err", err.Error()))
		// Không return: vẫn dọn index trong Redis. Để lại một tên pod trong
		// pool:claimed mà không session nào trỏ tới cũng là rác cho reaper.
	}

	podKey, err := rediskeys.Pod(podName)
	if err != nil {
		return
	}
	if err := s.rdb.Del(cleanupCtx, podKey).Err(); err != nil && !errors.Is(err, redis.Nil) {
		s.log.Warn("không xoá được hash pod", slog.String("pod", podName), slog.String("err", err.Error()))
	}
	// LREM cả HAI list, đối xứng với reaper.deletePodAndIndex. Pod đã reap không
	// bao giờ được nằm lại trong pool:free — nếu vì lý do gì nó lọt vào đó, một
	// claim sẽ phát ra tên của một pod đã bị xoá.
	for _, list := range []string{rediskeys.PoolClaimed, rediskeys.PoolFree} {
		if err := s.rdb.LRem(cleanupCtx, list, 0, podName).Err(); err != nil {
			s.log.Warn("không gỡ được pod khỏi index",
				slog.String("list", list), slog.String("pod", podName), slog.String("err", err.Error()))
		}
	}
}

// ReapExpired dọn một session ĐÃ HẾT HẠN (hash `session:{id}` không còn).
//
// ⛔ HÀM NÀY THAY CHO `ReapSystem` CŨ, VỐN LÀ MÃ CHẾT — không call-site sản
// phẩm nào, đúng lỗi mà review PR trước đã tìm ra với `ClaimIdempotent`. Và nó
// đóng một khoảng trống thật: đường đời PHỔ BIẾN NHẤT của session là hết hạn tự
// nhiên, mà đường đó trước bản này không để lại sự kiện kết thúc nào trong
// `sessions_audit` — nhật ký dừng ở `created` cho đa số phiên, tức câu hỏi
// forensic mà B8 sinh ra để trả lời thì không trả lời được.
//
// Lúc được gọi, hash session ĐÃ biến mất. Chủ sở hữu và tier đọc từ hash
// `pod:{name}` — `claim.lua` ghi sẵn chúng ở đó chính vì lý do này.
func (s *Service) ReapExpired(ctx context.Context, sessionID, podName string) error {
	cleanupCtx, cancel := cleanupContext(ctx)
	defer cancel()

	var userID, tier string
	if podKey, err := rediskeys.Pod(podName); err == nil {
		if vals, err := s.rdb.HMGet(cleanupCtx, podKey, "userId", "tier").Result(); err == nil {
			userID, _ = vals[0].(string)
			tier, _ = vals[1].(string)
		}
	}

	// Audit TRƯỚC khi xoá hash pod — sau đó thì không còn chỗ nào đọc được
	// userId/tier nữa. Thiếu chúng thì audit() bỏ dòng này (cột NOT NULL) và
	// tăng counter "audit thủng" vì một lý do khác hẳn thứ nó mô tả.
	if userID != "" && tier != "" {
		s.audit(ctx, auditEvent{
			SessionID: sessionID,
			UserID:    userID,
			Event:     auditEventExpired,
			Tier:      tier,
			PodName:   podName,
			Namespace: s.cfg.Namespace,
			Detail:    "session hết hạn theo TTL",
		})
	} else {
		s.log.Warn("session hết hạn nhưng hash pod thiếu userId/tier — không ghi được dòng audit kết thúc",
			slog.String("session_id", sessionID), slog.String("pod", podName))
	}

	s.cleanupPod(ctx, podName)
	return nil
}

// MarkFailed chuyển một session ma sang FAILED (pod đã biến mất khỏi cluster).
//
// KHÔNG xoá session: FE cần đọc được lý do phiên chết thay vì thấy 404 trần.
// TTL của hash vẫn chạy nên nó tự biến mất sau đó.
//
// ⛔ TIỀN ĐỀ: POD ĐÃ BIẾN MẤT. Call-site duy nhất (reaper tầng 2b) xác minh lại
// bằng một `pods.Get` mới trước khi gọi, chính vì ảnh chụp cũ có thể giết oan một
// pod cold-path vừa sinh ra. Đừng gọi hàm này cho một session còn pod sống.
//
// ⛔ VÀ VÌ SAO NÓ PHẢI DỌN INDEX POOL — ĐO ĐƯỢC TRÊN CỤM, 2026-08-15.
// Bản trước chỉ đổi status rồi trả về, để lại tên pod trong `pool:claimed` và
// hash `pod:{name}`. Không tầng nào nhặt được phần rác đó:
//
//   - tầng 2b bỏ qua mọi status cuối (`reaper.go`: `status != CLAIMED && != RUNNING`)
//     — đúng, vì đánh dấu lại là tăng revision vô cớ;
//   - tầng 2c chỉ dọn khi `EXISTS session:{id}` == 0, mà hash FAILED VẪN CÒN cho
//     tới hết TTL — nên nó đọc "session còn sống, pod đang phục vụ nó" và bỏ qua.
//
// Đo thật trên cụm lab: `pool:claimed` giữ **6** tên trong khi `dlp-sandbox` chỉ
// có **1** pod thật; 5 mục thừa đều thuộc session FAILED. Hệ quả là
// `dlp_pool_claimed_size` — panel "pod pool" của 3.D và là đại lượng 3.F định
// dùng để khẳng định "0 pod rò" — báo sai gấp 6 lần suốt tới một giờ
// (`SESSION_TTL`), rồi tự khỏi khi TTL rụng và tầng 2c nhặt. Một chỗ rò tự lành
// vẫn là một chỗ rò: trong cửa sổ ấy mọi phép đo dựa trên gauge đó đều vô nghĩa.
//
// `cleanupPod` idempotent và `pods.Delete` đã nuốt `NotFound`, nên gọi nó cho một
// pod đã biến mất không sinh log lỗi giả. Nó KHÔNG chạm hash `session:{id}` —
// hợp đồng "FE đọc được lý do" giữ nguyên.
func (s *Service) MarkFailed(ctx context.Context, sessionID, reason string) error {
	sessionKey, err := rediskeys.Session(sessionID)
	if err != nil {
		return err
	}

	// ⛔ ĐỌC userId/tier TRƯỚC khi đổi status. Bản đầu gọi audit() với Tier rỗng
	// ⇒ `protoTierToPG[""]` rỗng ⇒ audit return sớm, log ERROR ĐỔ LỖI SAI CHỖ
	// ("tier không ánh xạ được") và tăng `dlp_audit_write_failures_total` vì một
	// lý do khác hẳn thứ counter đó mô tả. Hệ quả kép: sự kiện `failed` KHÔNG
	// BAO GIỜ tới Postgres, và mỗi session ma là một báo động sai nếu ai đó gắn
	// alert vào counter kia. (Hai cột đó còn là NOT NULL trong schema.)
	var userID, tier, podName string
	if vals, hmErr := s.rdb.HMGet(ctx, sessionKey,
		rediskeys.FieldUserID, rediskeys.FieldTier, rediskeys.FieldPodName).Result(); hmErr == nil {
		userID, _ = vals[0].(string)
		tier, _ = vals[1].(string)
		podName, _ = vals[2].(string)
	}

	changed, err := markFailedScript.Run(ctx, s.rdb, []string{sessionKey}, s.now().Unix()).Int64()
	if err != nil && !errors.Is(err, redis.Nil) {
		return err
	}
	if changed == 1 {
		s.log.Warn("session chuyển FAILED",
			slog.String("session_id", sessionID), slog.String("reason", reason))
		s.audit(ctx, auditEvent{
			SessionID: sessionID,
			UserID:    userID,
			Event:     auditEventFailed,
			Tier:      tier,
			PodName:   podName,
			Namespace: s.cfg.Namespace,
			Detail:    reason,
		})
	}

	// ⛔ DỌN VÔ ĐIỀU KIỆN — KHÔNG ĐẶT TRONG `changed == 1`.
	//
	// Bản đầu của bản vá này đặt lời gọi bên trong nhánh đó với lý lẽ "lượt thứ
	// hai không có gì để dọn". Lý lẽ ấy sai, và `Reap` ở ngay đầu file đã bác bỏ
	// nó từ trước: nó CỐ Ý gọi `cleanupPod` cả trong ca `alreadyReaped`, vì "lần
	// trước có thể đã đánh dấu xong mà chết trước khi xoá được pod".
	//
	// Cùng ca đó xảy ra ở đây, và hậu quả nặng hơn: script Lua HSET xong →
	// tiến trình chết (rollout, OOM, SIGKILL trong lúc audit chờ Postgres 3s) →
	// chưa tới lượt dọn. Trạng thái còn lại là ĐÚNG chỗ rò mà commit này sinh ra
	// để vá, và KHÔNG tầng nào nhặt được nó: 2b bỏ qua status cuối và không bao
	// giờ thăm lại; 2c thấy `EXISTS session:{id}` == 1 nên bỏ qua; 2a đòi hash
	// pod VẮNG mà hash này còn; tầng 4 chỉ quét `pool:free`. Rò tới hết
	// `SESSION_TTL`, không có đường retry.
	//
	// Mọi bước trong `cleanupPod` đều idempotent (`Delete` nuốt NotFound, DEL và
	// LREM là no-op), nên gọi lại rẻ và an toàn.
	if podName != "" {
		s.cleanupPod(ctx, podName)

		// ⛔ VÀ XOÁ LUÔN CON TRỎ `session:{id}:pod`.
		//
		// Con trỏ sống lâu hơn hash (`ttl + PodPointerGrace`) để tầng 1 còn đọc
		// được podName khi hash hết hạn. Với một session ĐÃ chốt FAILED thì tầng
		// 1 không còn việc gì — nhưng nếu để con trỏ lại, đúng mốc TTL nó sẽ gọi
		// `ReapExpired`, hàm này đọc userId/tier từ hash `pod:{name}` mà ta vừa
		// xoá, không thấy, rồi log WARN "session hết hạn nhưng hash pod thiếu
		// userId/tier — không ghi được dòng audit kết thúc".
		//
		// Cảnh báo ấy sinh ra để tố một chỗ THỦNG THẬT. Nếu nó cũng bắn cho một
		// session ma bình thường thì nó không còn phân biệt được hai giả thuyết,
		// và một cảnh báo không phân biệt được gì là một cảnh báo phải tắt. Dòng
		// `failed` đã ghi ở trên rồi; thêm một dòng `expired` cho cùng cái chết
		// cũng là ghi thừa.
		if ptrKey, ptrErr := rediskeys.SessionPod(sessionID); ptrErr == nil {
			if delErr := s.rdb.Del(ctx, ptrKey).Err(); delErr != nil && !errors.Is(delErr, redis.Nil) {
				s.log.Warn("không xoá được con trỏ session:{id}:pod",
					slog.String("session_id", sessionID), slog.String("err", delErr.Error()))
			}
		}
	}
	return nil
}

// PodDeleter là phần k8s.PodClient mà lifecycle cần. Khai riêng thay vì nhận cả
// PodClient: Reap chỉ xoá pod, và một interface hẹp làm rõ điều đó ở chỗ đọc.
type PodDeleter interface {
	Delete(ctx context.Context, name string, gracePeriodSeconds int64) error
}

// Đảm bảo k8s.PodClient thoả PodDeleter — nếu chữ ký Delete đổi, dòng này không
// compile thay vì lỗi ở runtime.
var _ PodDeleter = (k8s.PodClient)(nil)
