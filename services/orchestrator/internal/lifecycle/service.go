package lifecycle

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/k8s"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/pool"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

//go:embed idem_release.lua
var idemReleaseLua string

//go:embed idem_promote.lua
var idemPromoteLua string

var (
	idemReleaseScript = redis.NewScript(idemReleaseLua)
	idemPromoteScript = redis.NewScript(idemPromoteLua)
)

const (
	// idemTTL khớp con số đã pin trong plan (`SET idem:{key} … NX EX 600`).
	// Ngắn hơn TTL session có chủ ý: khoá này chống F5 và gRPC retry, không
	// phải chống người dùng bấm "Start" lại sau nửa tiếng.
	idemTTL = 10 * time.Minute

	// idemPendingPrefix đánh dấu pha "đã nhận việc, chưa claim xong".
	// Xem idem_promote.lua để biết vì sao hai pha là bắt buộc.
	idemPendingPrefix = "pending:"

	// coldPathAttempts giới hạn số lần tạo-rồi-claim khi pool rỗng.
	//
	// Cần > 1 vì pod ta vừa tạo đi qua `pool:free`, nên một request đồng thời
	// có thể cướp mất trước khi ta claim. Cần NHỎ vì mỗi vòng là một pod thật
	// ăn quota — với trần 4 pod (D16), retry rộng tay biến một cơn tranh chấp
	// thành cạn quota cho tất cả mọi người.
	coldPathAttempts = 2

	// cleanupTimeout là ngân sách cho đường dọn dẹp (nhả/nâng khoá idem).
	// Nó chạy trên ctx TÁCH RỜI — xem cleanupContext.
	cleanupTimeout = 5 * time.Second
)

// cleanupContext tách đường dọn dẹp khỏi ctx của caller.
//
// ⛔ Lỗi đưa ta tới đường dọn dẹp RẤT THƯỜNG là chính ctx bị huỷ. Nhả khoá bằng
// ctx đã chết thì lệnh không bao giờ rời process: khoá kẹt đủ 10 phút, và mọi
// retry trong khoảng đó rơi vào nhánh replay với thông báo sai.
func cleanupContext(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.WithoutCancel(ctx), cleanupTimeout)
}

// Provisioner là phần warm-pool mà lifecycle cần. Interface (không phải
// *pool.Manager) để test đường cold-path không phải dựng cluster.
type Provisioner interface {
	// Provision tạo một pod, chờ Ready, công bố vào pool:free.
	Provision(ctx context.Context) (string, error)
	// Trigger thúc replenish, không chặn.
	Trigger()
}

// Config là phần cấu hình lifecycle cần từ env.
type Config struct {
	Namespace  string
	SessionTTL time.Duration
	// HardCap là trần TUYỆT ĐỐI tính từ created_at, không gia hạn được (D11).
	// Nó chặn `ttl_seconds` do client gửi ở CreateSession VÀ là trần của
	// ExtendSession (B5) — một con số, hai chỗ dùng.
	HardCap time.Duration

	// ExtendDefault là khoảng đẩy thêm khi client gửi `extend_seconds = 0`
	// (D11: 300s). Xem Extend() để biết vì sao con số này thực tế quyết định
	// hạn của session sau lần gia hạn đầu tiên, chứ không phải SESSION_TTL.
	ExtendDefault time.Duration
}

// Service hiện thực CreateSession / ClaimSession / GetSession.
//
// Trả THẲNG lỗi gRPC (`status.Error`) thay vì lỗi miền rồi để tầng trên dịch:
// consumer duy nhất của package này là grpcserver, và một tầng dịch lỗi nữa chỉ
// tạo thêm chỗ để mã lỗi trôi — mà mã lỗi ở đây LÀ contract (NotFound vs
// PermissionDenied là quyết định chống-oracle, không phải chi tiết trình bày).
type Service struct {
	rdb  redis.UniversalClient
	pool Provisioner
	pods PodAccess
	// db có thể là nil: chạy không Postgres là chế độ hợp lệ ở giai đoạn này
	// (audit là B8, và không đường session nào ĐỌC Postgres). Xem audit().
	db  AuditDB
	cfg Config
	log *slog.Logger
	met *metrics.Metrics

	now          func() time.Time
	newSessionID func() (string, error)
}

// NewService dựng lifecycle service, và TỪ CHỐI cấu hình mâu thuẫn ngay tại đây.
//
// ⛔ VÌ SAO VALIDATE Ở ĐÂY CHỨ KHÔNG PHẢI TRONG config.Load: trần 24h là hằng
// của pool (`pool.MaxTTLSeconds`), nơi `EXPIRE` thật sự bị chặn. Nhân bản con số
// đó sang package config là cách nó trôi đi. Không có cổng này thì `HARD_CAP=48h`
// qua được config, orchestrator lên xanh, mọi probe xanh — và 100%
// CreateSession chết bằng một lỗi 5xx-class nói về "TTLSeconds", không nói gì
// về HARD_CAP. Đo được: `SESSION_TTL=30h HARD_CAP=48h` → `Unavailable: pool:
// TTLSeconds phải trong (0, 86400] (nhận 108000)`.
func NewService(
	rdb redis.UniversalClient,
	provisioner Provisioner,
	pods PodAccess,
	db AuditDB,
	cfg Config,
	log *slog.Logger,
	met *metrics.Metrics,
) (*Service, error) {
	if cfg.SessionTTL <= 0 {
		return nil, fmt.Errorf("lifecycle: SESSION_TTL phải > 0 (nhận %s)", cfg.SessionTTL)
	}
	if cfg.HardCap <= 0 {
		return nil, fmt.Errorf("lifecycle: HARD_CAP phải > 0 (nhận %s)", cfg.HardCap)
	}
	if cfg.SessionTTL > cfg.HardCap {
		return nil, fmt.Errorf("lifecycle: SESSION_TTL (%s) > HARD_CAP (%s): mọi session sẽ bị cắt xuống trần cứng",
			cfg.SessionTTL, cfg.HardCap)
	}
	if maxCap := time.Duration(pool.MaxTTLSeconds) * time.Second; cfg.HardCap > maxCap {
		return nil, fmt.Errorf("lifecycle: HARD_CAP (%s) vượt trần kỹ thuật của claim (%s) — mọi CreateSession sẽ thất bại",
			cfg.HardCap, maxCap)
	}
	if cfg.Namespace == "" {
		return nil, fmt.Errorf("lifecycle: Namespace rỗng")
	}
	if cfg.ExtendDefault <= 0 {
		return nil, fmt.Errorf("lifecycle: EXTEND_DEFAULT phải > 0 (nhận %s)", cfg.ExtendDefault)
	}
	if cfg.ExtendDefault > cfg.HardCap {
		// Không phải lỗi chết người (min() trong extend.lua vẫn cắt), nhưng nó
		// nghĩa là EXTEND_DEFAULT không còn tác dụng gì — mọi lần gia hạn đều
		// chạm trần cứng. Một giá trị vô nghĩa là thứ không ai phát hiện ra.
		return nil, fmt.Errorf("lifecycle: EXTEND_DEFAULT (%s) > HARD_CAP (%s): mọi lần gia hạn đều chạm trần cứng",
			cfg.ExtendDefault, cfg.HardCap)
	}

	return &Service{
		rdb:          rdb,
		pool:         provisioner,
		pods:         pods,
		db:           db,
		cfg:          cfg,
		log:          log,
		met:          met,
		now:          time.Now,
		newSessionID: NewSessionID,
	}, nil
}

// Create cấp một session mới và claim pod cho nó ngay trong cùng lời gọi.
//
// MỘT LỜI GỌI, KHÔNG PHẢI HAI: sơ đồ luồng của phase-1 pin rõ
// `tRPC session.create → orchestrator.CreateSession → claim pod từ pool`, và
// BFF mint sandbox token với `exp = expires_at` NGAY SAU đó — nên expires_at
// phải có thật khi Create trả về. ClaimSession vì thế là đường ĐỌC LẠI idempotent
// (xem Claim), không phải một bước tạo thứ hai.
func (s *Service) Create(
	ctx context.Context, req *orchestratorv1.CreateSessionRequest,
) (*orchestratorv1.Session, error) {
	userID := req.GetUserId()

	// Fail-closed theo comment của SandboxTier trong proto: server KHÔNG được
	// suy ra tier mặc định — client quên set mà server đoán hộ nghĩa là âm thầm
	// chạy lab ở mức cô lập yếu hơn ý định người gọi.
	tier := req.GetTier()
	if tier == orchestratorv1.SandboxTier_SANDBOX_TIER_UNSPECIFIED {
		return nil, status.Error(codes.InvalidArgument,
			"tier bắt buộc: SANDBOX_TIER_UNSPECIFIED bị từ chối, server không đoán mức cô lập")
	}
	if tier != orchestratorv1.SandboxTier_SANDBOX_TIER_SYSBOX {
		// Giá trị HỢP LỆ của contract nhưng chưa triển khai — Unimplemented,
		// không phải InvalidArgument. Nói "tham số sai" về một tier đúng chuẩn
		// sẽ đẩy người tích hợp đi sửa nhầm chỗ.
		return nil, status.Errorf(codes.Unimplemented,
			"tier %s chưa được triển khai ở giai đoạn này; cluster mới cài RuntimeClass Sysbox", tier)
	}

	// rediskeys.Idem validate CẢ HAI đoạn: userID và idempotency_key. Key thứ
	// hai tới thẳng từ client và proto không ràng buộc nội dung, nên đây là bề
	// mặt tấn công thật (`:` trong đó sẽ nhảy scope sang khoá của user khác).
	idemKey, err := rediskeys.Idem(userID, req.GetIdempotencyKey())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "%v", err)
	}

	ttl, err := s.resolveTTL(req.GetTtlSeconds())
	if err != nil {
		return nil, err
	}

	sessionID, err := s.newSessionID()
	if err != nil {
		return nil, status.Errorf(codes.Internal, "%v", err)
	}

	pendingValue := idemPendingPrefix + sessionID
	acquired, err := s.rdb.SetNX(ctx, idemKey, pendingValue, idemTTL).Result()
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "đặt khoá idempotency: %v", err)
	}
	if !acquired {
		return s.replayIdempotent(ctx, idemKey, userID)
	}

	sess, claimErr := s.claimWithColdPath(ctx, sessionID, userID, tier, ttl)
	if claimErr != nil {
		// THỨ TỰ QUAN TRỌNG: quyết định nhả khoá đọc lỗi GỐC (còn nguyên chuỗi
		// sentinel), rồi mới map sang mã gRPC. Map trước là cắt đứt chuỗi đó —
		// `status.Error` không wrap — và releaseIdemIfSafe sẽ nhả nhầm khoá
		// trong đúng ca mà nó tồn tại để chặn.
		s.releaseIdemIfSafe(ctx, idemKey, pendingValue, claimErr)
		return nil, s.toStatus(claimErr)
	}

	// Nâng khoá lên giá trị cuối. Lỗi ở đây KHÔNG làm hỏng lời gọi: session đã
	// tồn tại thật, và khoá kẹt ở `pending:` chỉ khiến một retry (hiếm) nhận
	// "đang xử lý, thử lại" thay vì nhận ngay session — phiền, không sai.
	s.promoteIdem(ctx, idemKey, pendingValue, sessionID)

	// MỘT dòng audit cho CreateSession, không phải hai.
	//
	// Ở kiến trúc này create và claim là MỘT thao tác nguyên khối (xem doc của
	// Create), nên `created` mang luôn podName/expiresAt — tức là nó đã trả lời
	// đủ câu hỏi forensic "lúc nào user X nhận pod Y, hạn tới đâu". Đẻ thêm một
	// dòng `claimed` cùng mốc thời gian chỉ làm bảng dài gấp đôi mà không thêm
	// sự thật nào. `claimed` để dành cho ngày nào có đường claim tách rời thật.
	expiresAt := time.Unix(sess.ExpiresAt, 0)
	s.audit(ctx, auditEvent{
		SessionID: sess.ID,
		UserID:    sess.UserID,
		Event:     auditEventCreated,
		Tier:      sess.Tier,
		PodName:   sess.PodName,
		Namespace: sess.Namespace,
		ExpiresAt: &expiresAt,
	})

	return sess.ToProto(), nil
}

// replayIdempotent trả lại đúng session cũ khi idempotency_key đã dùng.
func (s *Service) replayIdempotent(
	ctx context.Context, idemKey, userID string,
) (*orchestratorv1.Session, error) {
	raw, err := s.rdb.Get(ctx, idemKey).Result()
	if errors.Is(err, redis.Nil) {
		// Khoá hết hạn đúng giữa SetNX và Get. Hiếm, nhưng có thật.
		return nil, status.Error(codes.Aborted,
			"khoá idempotency vừa hết hạn giữa chừng — gọi lại với cùng idempotency_key")
	}
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "đọc khoá idempotency: %v", err)
	}

	// ⛔ PHA `pending:` PHẢI ĐƯỢC TÁCH RIÊNG, TRƯỚC KHI ĐỌC SESSION.
	//
	// Không tách thì "một lời gọi khác ĐANG xử lý" và "session ĐÃ kết thúc" ra
	// cùng một ErrSessionNotFound, và nhánh dưới sẽ trả về "session này đã kết
	// thúc; dùng idempotency_key mới" — một khẳng định SAI SỰ THẬT, và làm theo
	// nó chính là tạo pod thứ hai. Đây là ca double-click nút Start, không phải
	// ca hiếm: đo được với hai lời gọi đồng thời cách nhau 80ms.
	if pendingID, ok := strings.CutPrefix(raw, idemPendingPrefix); ok {
		// Pha pending mang HAI nghĩa khác nhau, và phải tách:
		//   (a) lời gọi kia đang chạy thật, chưa ghi gì;
		//   (b) lời gọi kia đã claim XONG nhưng mất reply nên chưa kịp nâng khoá.
		// Phân biệt bằng chính hash `session:{id}` — SSOT là nó, không phải khoá
		// idem. Không tách thì ca (b) khoá user ra ngoài session CỦA CHÍNH HỌ
		// suốt 10 phút TTL, dù pod đã claim xong và đang chạy.
		if sess, loadErr := Load(ctx, s.rdb, pendingID); loadErr == nil {
			if _, ownErr := sess.OwnedBy(userID); ownErr != nil {
				s.log.Error("khoá idempotency pending trỏ tới session của user khác",
					slog.String("session_id", sess.ID))
				return nil, status.Error(codes.Internal, "trạng thái idempotency không nhất quán")
			}
			s.promoteIdem(ctx, idemKey, raw, pendingID)
			return sess.ToProto(), nil
		}
		s.log.Info("lời gọi đồng thời cùng idempotency_key đang xử lý",
			slog.String("session_id_dang_tao", pendingID))
		return nil, status.Error(codes.Unavailable,
			"một lời gọi khác với cùng idempotency_key đang được xử lý; thử lại với CÙNG key (đừng đổi key)")
	}

	sess, err := Load(ctx, s.rdb, raw)
	if errors.Is(err, ErrSessionNotFound) {
		// Khoá còn nhưng session đã kết thúc (bị reap sớm). KHÔNG tạo session
		// mới ở đây: hai lời gọi đồng thời rơi vào nhánh này sẽ cùng tạo, tức
		// là hai pod cho một ý định — đúng thứ khoá này tồn tại để chặn.
		return nil, status.Error(codes.FailedPrecondition,
			"session của idempotency_key này đã kết thúc; dùng idempotency_key mới")
	}
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "đọc lại session: %v", err)
	}

	// Khoá đã scope theo user (`idem:{userId}:{key}`) nên về lý thuyết không
	// chạm được session của người khác. Kiểm lại vẫn là đúng: đây là nơi DUY
	// NHẤT một sessionId đi ra ngoài mà không do lời gọi này sinh ra, và một
	// lỗi ở tầng key sẽ biến nó thành đường rò sessionId sang user khác.
	if _, err := sess.OwnedBy(userID); err != nil {
		s.log.Error("khoá idempotency trỏ tới session của user khác — kiểm lại rediskeys.Idem",
			slog.String("session_id", sess.ID))
		return nil, status.Error(codes.Internal, "trạng thái idempotency không nhất quán")
	}
	return sess.ToProto(), nil
}

// claimWithColdPath claim từ pool; pool rỗng thì tạo pod đồng bộ rồi claim lại.
func (s *Service) claimWithColdPath(
	ctx context.Context,
	sessionID, userID string,
	tier orchestratorv1.SandboxTier,
	ttl time.Duration,
) (*Session, error) {
	// ⛔ ĐO TỪ ĐÂY, KHÔNG PHẢI TỪ BÊN TRONG attempt().
	//
	// AC là "claim từ warm-pool p95 < 1s" — tức thời gian NGƯỜI DÙNG chờ để có
	// pod. Bản đầu đặt mốc bên trong attempt() nên nhãn `warm` chỉ bao đúng một
	// lượt EVALSHA (~1ms): histogram đó KHÔNG THỂ đỏ, nên dùng nó để chứng minh
	// AC là tautology. Tệ hơn ở nhãn `cold`: mốc nằm SAU s.pool.Provision(), nên
	// hàng chục giây chờ pod Ready — đúng thứ làm cold path chậm — rơi ra ngoài
	// histogram, và số đo sẽ nói ngược lại chính comment ở metrics.go.
	start := s.now()

	// Đóng gói lại params ở MỖI lần thử, không tính một lần rồi dùng lại:
	// TTL bắt đầu đếm từ lúc CLAIM, không phải lúc create (B4). Đường cold có
	// thể mất hàng chục giây chờ pod Ready — dùng lại mốc thời gian cũ nghĩa là
	// session sinh ra đã mất sẵn ngần ấy giây, và ExpiresAtUnix có thể lùi về
	// trước NowUnix làm chính validate() của pool từ chối.
	attempt := func(path string) (*Session, error) {
		now := s.now()
		_, err := pool.ClaimIdempotent(ctx, s.rdb, pool.ClaimParams{
			SessionID:     sessionID,
			UserID:        userID,
			Namespace:     s.cfg.Namespace,
			Tier:          tier.String(),
			NowUnix:       now.Unix(),
			ExpiresAtUnix: now.Add(ttl).Unix(),
			TTLSeconds:    int64(ttl / time.Second),
		})
		if err != nil {
			// dlp_claim_total đếm MỖI lượt thử đúng một lần, ở ĐÚNG chỗ kết quả
			// của lượt đó được biết — không phải ở nơi gọi attempt(). path="warm"
			// gặp ErrPoolEmpty ở đây rồi rẽ sang cold path KHÔNG bị đếm lại lần
			// hai: attempt(cold) là một lượt thử THẬT KHÁC, tự đếm lấy kết quả
			// của chính nó khi tới lượt nó chạy.
			result := metrics.ResultError
			if errors.Is(err, pool.ErrPoolEmpty) {
				result = metrics.ResultPoolEmpty
			}
			s.met.ClaimTotal.WithLabelValues(path, result).Inc()
			return nil, err
		}

		// Thúc replenish NGAY sau khi claim thành công: pool vừa hụt một pod và
		// người kế tiếp sẽ tới trước tick sau.
		s.pool.Trigger()

		sess, err := Load(ctx, s.rdb, sessionID)
		if err != nil {
			// Claim ĐÃ ghi xong; chỉ lượt đọc lại hỏng. Bọc
			// ErrClaimMayHaveWritten để releaseIdemIfSafe GIỮ khoá — nhả nó ở
			// đây là mở lại đúng cửa C-1 qua một cánh khác. Vẫn đếm result=error:
			// đây KHÔNG phải ErrPoolEmpty nên không có nhãn riêng cho nó.
			s.met.ClaimTotal.WithLabelValues(path, metrics.ResultError).Inc()
			return nil, fmt.Errorf("%w: đọc lại session vừa claim: %w",
				pool.ErrClaimMayHaveWritten, err)
		}

		// ⛔ Pod đã claim phải CÒN SỐNG trước khi giao tên nó cho người dùng.
		//
		// claim.lua chỉ hỏi Redis; nó không biết apiserver nói gì. Đo 2026-08-16
		// (concurrent-build-load §6.2): một pod trong pool:free bị xoá ngoài đường
		// reaper (`kubectl delete pod` — nhưng evict/node pressure đi ĐÚNG đường
		// hỏng này), lượt startSession kế phát ra tên pod đã chết và MỌI exec sau
		// đó trả NotFound: người học nhận một terminal không bao giờ nối được, và
		// không lỗi nào nói vì sao. Reaper tầng 4 có quét pool:free, nhưng giữa
		// hai lượt quét là một cửa sổ, và người rơi vào cửa sổ đó là sinh viên.
		//
		// KHÔNG tự thử lại ở đây: hash session đã ghi, khoá idempotency đang
		// pending trỏ vào nó, và "đổi pod cho một session" không có script nguyên
		// tử nào. Thành thật hơn: đánh dấu FAILED (FE đọc được lý do, MarkFailed
		// tự rút pod khỏi pool để lượt kế KHÔNG gặp lại nó) và trả lỗi để client
		// tạo lại — FE sinh idempotency_key mới mỗi lần bấm, nên lượt kế là một
		// claim mới thật, không phải replay của session FAILED này.
		if alive, aliveErr := s.podAlive(ctx, sess.PodName); aliveErr != nil {
			// apiserver không trả lời KHÔNG phải bằng chứng pod chết — không chặn
			// claim vì thế; exec sau sẽ tự lộ nếu pod thật sự mất. Log để cửa sổ
			// mù này có dấu vết thay vì vô hình.
			s.log.Warn("không kiểm được pod sau claim — giao tiếp tục",
				slog.String("session_id", sessionID), slog.String("pod", sess.PodName),
				slog.String("err", aliveErr.Error()))
		} else if !alive {
			s.met.ClaimDeadPodTotal.Inc()
			s.log.Error("pod ấm đã chết trước khi giao — đánh dấu FAILED và rút khỏi pool",
				slog.String("session_id", sessionID), slog.String("pod", sess.PodName))
			if mfErr := s.MarkFailed(ctx, sessionID, "pod đã biến mất trước khi giao cho người dùng"); mfErr != nil {
				s.log.Error("không đánh dấu FAILED được — reaper tầng 2b sẽ nhặt",
					slog.String("session_id", sessionID), slog.String("err", mfErr.Error()))
			}
			s.met.ClaimTotal.WithLabelValues(path, metrics.ResultError).Inc()
			// Bọc ErrClaimMayHaveWritten: claim ĐÃ ghi, releaseIdemIfSafe phải GIỮ
			// khoá — nhả nó là mở lại cửa C-1 (hai session cho một key).
			return nil, fmt.Errorf("%w: pod %s đã chết trước khi giao; tạo lại phiên với idempotency_key mới",
				pool.ErrClaimMayHaveWritten, sess.PodName)
		}

		s.met.ClaimDuration.WithLabelValues(path).Observe(s.now().Sub(start).Seconds())
		s.met.ClaimTotal.WithLabelValues(path, metrics.ResultOK).Inc()
		return sess, nil
	}

	sess, err := attempt(metrics.PathWarm)
	if err == nil {
		return sess, nil
	}
	if !errors.Is(err, pool.ErrPoolEmpty) {
		// Lỗi GỐC, chưa map — xem toStatus.
		return nil, err
	}

	s.met.ColdPathTotal.Inc()
	s.log.Warn("pool rỗng — rẽ cold path, sẽ tạo pod đồng bộ",
		slog.String("session_id", sessionID))

	for i := 0; i < coldPathAttempts; i++ {
		if _, err := s.pool.Provision(ctx); err != nil {
			if errors.Is(err, pool.ErrPoolQuotaBlocked) {
				// Provision() thất bại TRƯỚC khi attempt() kịp chạy, nên đây là
				// chỗ DUY NHẤT đếm được kết quả này — không nằm trong attempt().
				s.met.ClaimTotal.WithLabelValues(metrics.PathCold, metrics.ResultQuotaBlocked).Inc()
				return nil, status.Error(codes.ResourceExhausted,
					"đã đạt trần số sandbox đồng thời của cluster; thử lại sau ít phút")
			}
			s.met.ClaimTotal.WithLabelValues(metrics.PathCold, metrics.ResultError).Inc()
			return nil, status.Errorf(codes.Internal, "tạo pod cho cold path: %v", err)
		}

		sess, err := attempt(metrics.PathCold)
		if err == nil {
			return sess, nil
		}
		if !errors.Is(err, pool.ErrPoolEmpty) {
			// Trả lỗi GỐC, chưa map sang status. Xem toStatus: `status.Error`
			// KHÔNG wrap, nên map ở đây sẽ cắt đứt chuỗi sentinel mà
			// releaseIdemIfSafe dựa vào — và hậu quả là nhả nhầm khoá.
			return nil, err
		}
		// Pod ta vừa tạo bị một request đồng thời claim mất. Thử thêm một vòng.
		s.log.Warn("pod vừa tạo bị claim mất trước khi tới lượt mình",
			slog.String("session_id", sessionID), slog.Int("attempt", i+1))
	}

	return nil, status.Error(codes.ResourceExhausted,
		"không giữ được pod nào sau khi tạo; hệ thống đang quá tải, thử lại")
}

// podAlive hỏi apiserver xem pod còn phục vụ được không.
//
// `(false, nil)` là câu trả lời CHẮC ("không còn / pha cuối / đang bị xoá");
// `err != nil` là "không biết" — caller phải phân biệt hai ca này, vì coi
// "không biết" là "chết" sẽ giết oan claim mỗi khi apiserver chậm.
//
// ⛔ `k8s.IsDoomed`, KHÔNG phải `IsTerminal`: pod đang bị xoá giữ nguyên
// `phase: Running` suốt grace period, nên phép kiểm chỉ đọc phase sẽ cho qua
// đúng cái pod mà hàm này sinh ra để chặn.
func (s *Service) podAlive(ctx context.Context, name string) (bool, error) {
	pod, err := s.pods.Get(ctx, name)
	if k8s.IsNotFound(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return !k8s.IsDoomed(pod), nil
}

// toStatus chuyển lỗi GỐC sang mã gRPC, và để yên thứ đã là status.
//
// Tồn tại vì `status.Error` KHÔNG hiện thực Unwrap: bọc sớm là cắt đứt chuỗi
// sentinel (`pool.ErrClaimMayHaveWritten`, `pool.ErrInvalidClaimParams`) mà các
// quyết định phía trên dựa vào. Nên map là việc CUỐI CÙNG trên đường lỗi.
func (s *Service) toStatus(err error) error {
	if err == nil {
		return nil
	}
	if _, ok := status.FromError(err); ok && status.Code(err) != codes.Unknown {
		return err
	}
	return s.mapClaimError(err)
}

func (s *Service) mapClaimError(err error) error {
	if errors.Is(err, pool.ErrSessionOwnedByAnother) {
		// Không thể xảy ra với sessionID 128-bit. Nếu xảy ra thì hoặc bộ sinh
		// id hỏng, hoặc có người đang thăm dò — cả hai đều phải ồn ào.
		s.log.Error("session id đụng độ giữa hai user", slog.String("err", err.Error()))
		return status.Error(codes.Internal, "xung đột định danh session")
	}
	if errors.Is(err, pool.ErrInvalidClaimParams) {
		// KHÔNG phải Unavailable. Gộp lỗi đầu vào vào mã "hạ tầng tạm hỏng"
		// khiến retry policy của gRPC thử lại vĩnh viễn một request không bao
		// giờ thành công, và dashboard đọc nó như sự cố hạ tầng. Ca thật đã đo
		// được: HARD_CAP vượt trần 24h ⇒ mọi CreateSession trả Unavailable.
		s.log.Error("tham số claim không hợp lệ — đây là lỗi cấu hình/lập trình, không phải sự cố",
			slog.String("err", err.Error()))
		return status.Errorf(codes.InvalidArgument, "%v", err)
	}
	return status.Errorf(codes.Unavailable, "claim pod: %v", err)
}

// releaseIdemIfSafe nhả khoá CHỈ KHI chắc chắn Redis chưa ghi state nào.
//
// ⛔ ĐÂY LÀ CHỖ MÀ MỘT "DỌN DẸP" NGÂY THƠ TẠO RA POD THỨ HAI. Bản đầu nhả khoá
// trên MỌI lỗi. Kịch bản hỏng, hoàn toàn im lặng: `claim.lua` chạy TRỌN VẸN
// trên server, reply mất ở tầng mạng (timeout TCP — đúng ca mà plan mô tả).
// Caller nhận error, nhả khoá, và client retry ĐÚNG THEO CONTRACT với cùng
// idempotency_key → SetNX thành công → sessionID MỚI → claim POD THỨ HAI. Pod
// thứ nhất rò hết TTL, và vì hash `session:{id}` của nó TỒN TẠI nên heuristic
// "pod mồ côi" của reaper (B7) không bao giờ thấy. Mỗi lần là −1 trên trần 4
// pod (D16); ba lần là nền tảng chết mà không lỗi nào giải thích.
//
// pool.ErrClaimMayHaveWritten là tín hiệu "không loại trừ được đã ghi". Gặp nó
// thì GIỮ khoá: một khoá thừa sống 10 phút (user thử lại được, đường replay trả
// đúng session cũ) rẻ hơn nhiều so với một pod rò vĩnh viễn.
func (s *Service) releaseIdemIfSafe(ctx context.Context, idemKey, pendingValue string, claimErr error) {
	if errors.Is(claimErr, pool.ErrClaimMayHaveWritten) {
		s.log.Warn("GIỮ khoá idempotency: không loại trừ được claim đã ghi Redis",
			slog.String("err", claimErr.Error()))
		return
	}

	// ctx TÁCH RỜI: lỗi đưa ta tới đây rất thường LÀ ctx bị huỷ, và nhả khoá
	// bằng ctx đã chết thì lệnh không bao giờ rời process — khoá kẹt đủ 10 phút
	// và mọi retry trong khoảng đó rơi vào nhánh replay.
	cleanupCtx, cancel := cleanupContext(ctx)
	defer cancel()

	if err := idemReleaseScript.Run(cleanupCtx, s.rdb, []string{idemKey}, pendingValue).Err(); err != nil &&
		!errors.Is(err, redis.Nil) {
		s.log.Warn("không nhả được khoá idempotency; nó sẽ tự hết hạn",
			slog.String("err", err.Error()))
	}
}

// promoteIdem nâng khoá từ `pending:{id}` lên `{id}` sau khi claim thành công.
func (s *Service) promoteIdem(ctx context.Context, idemKey, pendingValue, sessionID string) {
	cleanupCtx, cancel := cleanupContext(ctx)
	defer cancel()

	if err := idemPromoteScript.Run(cleanupCtx, s.rdb,
		[]string{idemKey}, pendingValue, sessionID).Err(); err != nil && !errors.Is(err, redis.Nil) {
		s.log.Warn("không nâng được khoá idempotency khỏi pha pending",
			slog.String("session_id", sessionID), slog.String("err", err.Error()))
	}
}

// resolveTTL áp default và trần cứng.
func (s *Service) resolveTTL(ttlSeconds int32) (time.Duration, error) {
	if ttlSeconds < 0 {
		return 0, status.Error(codes.InvalidArgument, "ttl_seconds âm")
	}
	ttl := s.cfg.SessionTTL
	if ttlSeconds > 0 {
		ttl = time.Duration(ttlSeconds) * time.Second
	}
	if s.cfg.HardCap > 0 && ttl > s.cfg.HardCap {
		// Cắt, KHÔNG từ chối — trần cứng là chính sách server, và client vẫn
		// thấy sự thật vì `expires_at` trong response mang giá trị đã cắt.
		ttl = s.cfg.HardCap
	}
	if ttl < time.Second {
		return 0, status.Error(codes.Internal, "SESSION_TTL/HARD_CAP cấu hình sai: TTL hiệu lực < 1s")
	}
	return ttl, nil
}

// Claim là đường ĐỌC LẠI idempotent của một session đã có pod.
//
// CreateSession đã claim pod (xem Create), nên ở P1 RPC này KHÔNG tạo thêm gì.
// Nó tồn tại để giữ contract kín: client gọi lại sau khi mất phản hồi vẫn lấy
// được đúng session cũ mà không phải mở đường tạo thứ hai — mở đường đó là mời
// một pod thứ hai vào đúng chỗ mà cả B3 lẫn claim.lua đang chặn.
func (s *Service) Claim(
	ctx context.Context, req *orchestratorv1.ClaimSessionRequest,
) (*orchestratorv1.Session, error) {
	sess, err := s.loadOwned(ctx, req.GetSessionId(), req.GetUserId())
	if err != nil {
		return nil, err
	}
	if sess.PodName == "" {
		return nil, status.Error(codes.FailedPrecondition, "session chưa có pod")
	}
	return sess.ToProto(), nil
}

// Get trả trạng thái session của chính người gọi.
func (s *Service) Get(
	ctx context.Context, req *orchestratorv1.GetSessionRequest,
) (*orchestratorv1.Session, error) {
	sess, err := s.loadOwned(ctx, req.GetSessionId(), req.GetUserId())
	if err != nil {
		return nil, err
	}
	return sess.ToProto(), nil
}

// loadOwned gộp "đọc" và "kiểm chủ sở hữu" thành MỘT đường trả lỗi.
//
// Gộp có chủ ý: "không tồn tại" và "của người khác" phải ra cùng codes.NotFound.
// Tách thành hai nhánh là mời một ngày nào đó ai đó thêm log/mã khác nhau cho
// hai ca, và oracle dò id sống lại. Xem Session.OwnedBy.
func (s *Service) loadOwned(ctx context.Context, sessionID, userID string) (*Session, error) {
	if userID == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id bắt buộc — server không suy ra chủ sở hữu")
	}
	sess, err := Load(ctx, s.rdb, sessionID)
	if errors.Is(err, ErrSessionNotFound) {
		return nil, status.Error(codes.NotFound, "session không tồn tại")
	}
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "đọc session: %v", err)
	}
	if _, err := sess.OwnedBy(userID); err != nil {
		return nil, status.Error(codes.NotFound, "session không tồn tại")
	}
	return sess, nil
}
