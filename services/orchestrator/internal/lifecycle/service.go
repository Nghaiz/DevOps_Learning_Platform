package lifecycle

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/pool"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

//go:embed idem_release.lua
var idemReleaseLua string

var idemReleaseScript = redis.NewScript(idemReleaseLua)

const (
	// idemTTL khớp con số đã pin trong plan (`SET idem:{key} … NX EX 600`).
	// Ngắn hơn TTL session có chủ ý: khoá này chống F5 và gRPC retry, không
	// phải chống người dùng bấm "Start" lại sau nửa tiếng.
	idemTTL = 10 * time.Minute

	// coldPathAttempts giới hạn số lần tạo-rồi-claim khi pool rỗng.
	//
	// Cần > 1 vì pod ta vừa tạo đi qua `pool:free`, nên một request đồng thời
	// có thể cướp mất trước khi ta claim. Cần NHỎ vì mỗi vòng là một pod thật
	// ăn quota — với trần 4 pod (D16), retry rộng tay biến một cơn tranh chấp
	// thành cạn quota cho tất cả mọi người.
	coldPathAttempts = 2
)

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
	// Ở đây nó chặn `ttl_seconds` do client gửi; B5 sẽ dùng cùng con số cho
	// ExtendSession.
	HardCap time.Duration
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
	cfg  Config
	log  *slog.Logger
	met  *metrics.Metrics

	now          func() time.Time
	newSessionID func() (string, error)
}

// NewService dựng lifecycle service.
func NewService(
	rdb redis.UniversalClient,
	provisioner Provisioner,
	cfg Config,
	log *slog.Logger,
	met *metrics.Metrics,
) *Service {
	return &Service{
		rdb:          rdb,
		pool:         provisioner,
		cfg:          cfg,
		log:          log,
		met:          met,
		now:          time.Now,
		newSessionID: NewSessionID,
	}
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

	acquired, err := s.rdb.SetNX(ctx, idemKey, sessionID, idemTTL).Result()
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "đặt khoá idempotency: %v", err)
	}
	if !acquired {
		return s.replayIdempotent(ctx, idemKey, userID)
	}

	sess, err := s.claimWithColdPath(ctx, sessionID, userID, tier, ttl)
	if err != nil {
		// Nhả khoá để lần thử sau của user không nhận về một session không bao
		// giờ được tạo. Giữ khoá lại nghĩa là user kẹt 10 phút với lỗi
		// "session của idempotency_key này không có pod" mà chẳng làm gì được.
		s.releaseIdem(ctx, idemKey, sessionID)
		return nil, err
	}
	return sess.ToProto(), nil
}

// replayIdempotent trả lại đúng session cũ khi idempotency_key đã dùng.
func (s *Service) replayIdempotent(
	ctx context.Context, idemKey, userID string,
) (*orchestratorv1.Session, error) {
	existingID, err := s.rdb.Get(ctx, idemKey).Result()
	if errors.Is(err, redis.Nil) {
		// Khoá hết hạn đúng giữa SetNX và Get. Hiếm, nhưng có thật.
		return nil, status.Error(codes.Aborted,
			"khoá idempotency vừa hết hạn giữa chừng — gọi lại với cùng idempotency_key")
	}
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "đọc khoá idempotency: %v", err)
	}

	sess, err := Load(ctx, s.rdb, existingID)
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
	// Đóng gói lại params ở MỖI lần thử, không tính một lần rồi dùng lại:
	// TTL bắt đầu đếm từ lúc CLAIM, không phải lúc create (B4). Đường cold có
	// thể mất hàng chục giây chờ pod Ready — dùng lại mốc thời gian cũ nghĩa là
	// session sinh ra đã mất sẵn ngần ấy giây, và ExpiresAtUnix có thể lùi về
	// trước NowUnix làm chính validate() của pool từ chối.
	attempt := func(path string) (*Session, error) {
		now := s.now()
		start := now
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
			return nil, err
		}
		s.met.ClaimDuration.WithLabelValues(path).Observe(s.now().Sub(start).Seconds())

		// Thúc replenish NGAY sau khi claim thành công: pool vừa hụt một pod và
		// người kế tiếp sẽ tới trước tick sau.
		s.pool.Trigger()

		sess, err := Load(ctx, s.rdb, sessionID)
		if err != nil {
			return nil, fmt.Errorf("đọc lại session vừa claim: %w", err)
		}
		return sess, nil
	}

	sess, err := attempt(metrics.PathWarm)
	if err == nil {
		return sess, nil
	}
	if !errors.Is(err, pool.ErrPoolEmpty) {
		return nil, s.mapClaimError(err)
	}

	s.met.ColdPathTotal.Inc()
	s.log.Warn("pool rỗng — rẽ cold path, sẽ tạo pod đồng bộ",
		slog.String("session_id", sessionID))

	for i := 0; i < coldPathAttempts; i++ {
		if _, err := s.pool.Provision(ctx); err != nil {
			if errors.Is(err, pool.ErrPoolQuotaBlocked) {
				return nil, status.Error(codes.ResourceExhausted,
					"đã đạt trần số sandbox đồng thời của cluster; thử lại sau ít phút")
			}
			return nil, status.Errorf(codes.Internal, "tạo pod cho cold path: %v", err)
		}

		sess, err := attempt(metrics.PathCold)
		if err == nil {
			return sess, nil
		}
		if !errors.Is(err, pool.ErrPoolEmpty) {
			return nil, s.mapClaimError(err)
		}
		// Pod ta vừa tạo bị một request đồng thời claim mất. Thử thêm một vòng.
		s.log.Warn("pod vừa tạo bị claim mất trước khi tới lượt mình",
			slog.String("session_id", sessionID), slog.Int("attempt", i+1))
	}

	return nil, status.Error(codes.ResourceExhausted,
		"không giữ được pod nào sau khi tạo; hệ thống đang quá tải, thử lại")
}

func (s *Service) mapClaimError(err error) error {
	if errors.Is(err, pool.ErrSessionOwnedByAnother) {
		// Không thể xảy ra với sessionID 128-bit. Nếu xảy ra thì hoặc bộ sinh
		// id hỏng, hoặc có người đang thăm dò — cả hai đều phải ồn ào.
		s.log.Error("session id đụng độ giữa hai user", slog.String("err", err.Error()))
		return status.Error(codes.Internal, "xung đột định danh session")
	}
	return status.Errorf(codes.Unavailable, "claim pod: %v", err)
}

// releaseIdem nhả khoá best-effort. Lỗi chỉ log: đường này đã đang xử lý một
// lỗi khác, và khoá tự hết hạn sau idemTTL.
func (s *Service) releaseIdem(ctx context.Context, idemKey, sessionID string) {
	if err := idemReleaseScript.Run(ctx, s.rdb, []string{idemKey}, sessionID).Err(); err != nil &&
		!errors.Is(err, redis.Nil) {
		s.log.Warn("không nhả được khoá idempotency; nó sẽ tự hết hạn",
			slog.String("err", err.Error()))
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
