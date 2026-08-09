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

	podName, _ := res[0].(string)
	alreadyReaped := len(res) >= 5 && res[4] == int64(1)

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
	if err := s.rdb.LRem(cleanupCtx, rediskeys.PoolClaimed, 0, podName).Err(); err != nil {
		s.log.Warn("không gỡ được pod khỏi pool:claimed",
			slog.String("pod", podName), slog.String("err", err.Error()))
	}
}

// ReapSystem là đường reaper NỘI BỘ gọi vào.
//
// Đi qua đúng Reap() mà RPC dùng, không phải một đường ghi riêng: mọi bất biến
// (idempotency, đánh-dấu-trước-xoá-sau, dọn index, audit) chỉ có MỘT hiện thực.
// Một đường ghi thứ hai là chỗ để hai bên trôi khỏi nhau trong im lặng.
//
// KHÔNG đi qua interceptor gRPC nên không cần mTLS — nó chạy trong cùng process,
// và đó chính là lý do việc từ chối `system_component` từ ngoài (khi mTLS tắt)
// không chặn bất cứ thứ gì đang chạy.
func (s *Service) ReapSystem(ctx context.Context, sessionID, component string) error {
	_, err := s.Reap(ctx, sessionID, ReapActor{System: true, Component: component})
	if err != nil && status.Code(err) == codes.NotFound {
		// Session biến mất giữa lúc reaper quyết định và lúc nó gọi — đúng kết
		// quả mong muốn, không phải lỗi.
		return nil
	}
	return err
}

// MarkFailed chuyển một session ma sang FAILED (pod đã biến mất khỏi cluster).
//
// KHÔNG xoá session: FE cần đọc được lý do phiên chết thay vì thấy 404 trần.
// TTL của hash vẫn chạy nên nó tự biến mất sau đó.
func (s *Service) MarkFailed(ctx context.Context, sessionID, reason string) error {
	sessionKey, err := rediskeys.Session(sessionID)
	if err != nil {
		return err
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
			Event:     auditEventFailed,
			Detail:    reason,
		})
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
