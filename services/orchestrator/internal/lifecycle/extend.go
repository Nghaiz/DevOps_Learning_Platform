package lifecycle

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/pool"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

//go:embed extend.lua
var extendLua string

var extendScript = redis.NewScript(extendLua)

// Tiền tố phân loại trong error_reply của extend.lua. Redis không cho script trả
// mã lỗi có cấu trúc, nên đây là kênh duy nhất — giữ khớp KHÍT với file .lua.
const (
	extendErrNotFound = "extend: notfound:"
	extendErrState    = "extend: state:"
	extendErrRevision = "extend: revision:"
	extendErrHardCap  = "extend: hardcap:"
)

// Extend đẩy idle-deadline của một session đang chạy về phía trước.
//
// ⛔ CÔNG THỨC CÓ THỂ KÉO LÙI HẠN, VÀ ĐÓ LÀ ĐIỀU PLAN PIN NGUYÊN VĂN:
// `expires_at = min(now + extend_seconds, created_at + HARD_CAP)` (B5). Hệ quả
// cụ thể: session tạo với SESSION_TTL=1h, tới heartbeat ĐẦU TIÊN với
// EXTEND_DEFAULT=300s thì hạn tụt từ t0+1h xuống t0+~6ph. Nói cách khác,
// SESSION_TTL chỉ là hạn cho tới lần gia hạn đầu; sau đó expires_at luôn bám
// EXTEND_DEFAULT. Điều này có thể ĐÚNG với ý định (đây là idle-deadline, không
// phải tổng thời lượng), nhưng nó va với AC "đóng WS → nối lại cùng {id} trong
// TTL vào đúng pod cũ" — cửa sổ nối lại khi đó chỉ còn EXTEND_DEFAULT chứ không
// phải SESSION_TTL. Hiện thực theo đúng công thức đã pin và ghi lại ở đây;
// muốn hạn chỉ tiến không lùi thì đổi thành max(current, min(...)) — một dòng.
func (s *Service) Extend(
	ctx context.Context, req *orchestratorv1.ExtendSessionRequest,
) (*orchestratorv1.Session, bool, error) {
	sessionID := req.GetSessionId()
	userID := req.GetUserId()

	if userID == "" {
		return nil, false, status.Error(codes.InvalidArgument,
			"user_id bắt buộc — server không suy ra chủ sở hữu")
	}
	if req.GetExtendSeconds() < 0 {
		return nil, false, status.Error(codes.InvalidArgument, "extend_seconds âm")
	}

	sessionKey, err := rediskeys.Session(sessionID)
	if err != nil {
		// Không tách "id sai định dạng" khỏi "không tìm thấy": id tới thẳng từ
		// client, và hai thông báo khác nhau là một oracle bé xíu để dò id.
		return nil, false, status.Error(codes.NotFound, "session không tồn tại")
	}
	sessionPodKey, err := rediskeys.SessionPod(sessionID)
	if err != nil {
		return nil, false, status.Error(codes.NotFound, "session không tồn tại")
	}

	extend := s.cfg.ExtendDefault
	if req.GetExtendSeconds() > 0 {
		extend = time.Duration(req.GetExtendSeconds()) * time.Second
	}

	now := s.now()
	res, err := extendScript.Run(ctx, s.rdb,
		[]string{sessionKey, sessionPodKey},
		userID,
		req.GetExpectedRevision(),
		now.Unix(),
		int64(extend/time.Second),
		int64(s.cfg.HardCap/time.Second),
		// Dùng LẠI hằng của pool, không khai lại: claim.lua và extend.lua đều
		// đặt TTL cho `session:{id}:pod` dài hơn hash đúng khoảng này, và hai
		// giá trị lệch nhau nghĩa là reaper tầng 1 mù ở một trong hai đường.
		int64(pool.PodPointerGrace/time.Second),
	).Slice()
	if err != nil {
		return nil, false, s.mapExtendError(err)
	}

	hardCapReached, err := applyExtendResult(res)
	if err != nil {
		return nil, false, status.Errorf(codes.Internal, "%v", err)
	}

	// Đọc lại để trả về Session ĐẦY ĐỦ. Một lượt Redis nữa trên đường gia hạn
	// (không phải đường nóng của stdin/stdout — G7 gọi cái này theo nhịp traffic
	// chứ không theo từng byte), đổi lấy việc không phải nhân bản logic dựng
	// Session từ giá trị script trả về.
	sess, err := Load(ctx, s.rdb, sessionID)
	if errors.Is(err, ErrSessionNotFound) {
		// Hết hạn đúng giữa script và lượt đọc lại. Hiếm, nhưng có thật.
		return nil, false, status.Error(codes.NotFound, "session không tồn tại")
	}
	if err != nil {
		return nil, false, status.Errorf(codes.Unavailable, "đọc lại session vừa gia hạn: %v", err)
	}

	s.met.ExtendTotal.WithLabelValues("ok").Inc()

	// ⛔ THROTTLE AUDIT: chỉ ghi lần gia hạn CHẠM TRẦN CỨNG.
	//
	// Gia hạn là heartbeat — G7 gọi nó theo nhịp traffic, nên ghi mọi lần sẽ đổ
	// hàng nghìn dòng mỗi phiên vào một bảng nhật ký vòng đời và chôn vùi năm
	// sự kiện thật sự đáng đọc. Câu hỏi "phiên còn sống không" đã có
	// `lastActiveAt` trong Redis trả lời. Lần chạm trần thì khác: nó HIẾM, nó
	// giải thích vì sao phiên sắp chết, và nó là thứ người ta đi tìm khi sinh
	// viên khiếu nại "đang làm thì mất bài".
	if hardCapReached {
		s.audit(ctx, auditEvent{
			SessionID: sess.ID,
			UserID:    sess.UserID,
			Event:     auditEventExtended,
			Tier:      sess.Tier,
			PodName:   sess.PodName,
			Namespace: sess.Namespace,
			Detail:    "chạm trần cứng, không gia hạn thêm được",
		})
	}

	return sess.ToProto(), hardCapReached, nil
}

// applyExtendResult đọc mảng script trả về. Chỉ lấy cờ hard-cap; các giá trị
// khác được đọc lại từ hash để tránh hai nguồn cùng mô tả một session.
func applyExtendResult(res []interface{}) (hardCapReached bool, err error) {
	if len(res) < 3 {
		return false, fmt.Errorf("extend.lua trả %d phần tử, cần >= 3", len(res))
	}
	flag, ok := res[2].(int64)
	if !ok {
		return false, fmt.Errorf("extend.lua trả cờ hard-cap kiểu %T, cần int64", res[2])
	}
	return flag == 1, nil
}

// mapExtendError dịch error_reply của Lua sang mã gRPC.
//
// Mỗi nhánh là một QUYẾT ĐỊNH riêng, không phải bốn cách nói cùng một chuyện:
// NotFound đóng oracle dò id; FailedPrecondition bảo client đọc lại rồi thử lại;
// Unavailable bảo nó thử lại nguyên trạng.
func (s *Service) mapExtendError(err error) error {
	msg := err.Error()
	switch {
	case strings.Contains(msg, extendErrNotFound):
		s.met.ExtendTotal.WithLabelValues("not_found").Inc()
		return status.Error(codes.NotFound, "session không tồn tại")

	case strings.Contains(msg, extendErrRevision):
		// Client cầm revision cũ ⇒ có tiến trình khác vừa ghi. Nó phải đọc lại,
		// XÁC MINH còn đúng chủ + còn sống, rồi mới thử lại — đó là hợp đồng mà
		// G7 hiện thực (thử đúng MỘT lần, vẫn lệch thì đóng 4404).
		s.met.ExtendTotal.WithLabelValues("revision_mismatch").Inc()
		return status.Errorf(codes.FailedPrecondition, "%s", trimLuaPrefix(msg, extendErrRevision))

	case strings.Contains(msg, extendErrState):
		s.met.ExtendTotal.WithLabelValues("bad_state").Inc()
		return status.Errorf(codes.FailedPrecondition, "%s", trimLuaPrefix(msg, extendErrState))

	case strings.Contains(msg, extendErrHardCap):
		s.met.ExtendTotal.WithLabelValues("hard_cap").Inc()
		return status.Error(codes.FailedPrecondition,
			"đã qua trần cứng của phiên, không gia hạn thêm được")

	default:
		s.met.ExtendTotal.WithLabelValues("error").Inc()
		return status.Errorf(codes.Unavailable, "gia hạn session: %v", err)
	}
}

// trimLuaPrefix cắt tiền tố phân loại để thông báo ra ngoài không mang chi tiết
// nội bộ của script.
func trimLuaPrefix(msg, prefix string) string {
	if i := strings.Index(msg, prefix); i >= 0 {
		return strings.TrimSpace(msg[i+len(prefix):])
	}
	return msg
}
