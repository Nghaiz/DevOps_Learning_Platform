package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

const (
	// listSessionsScanCount là gợi ý COUNT cho SCAN — cùng con số
	// reaper.sessionScanCount dùng, và cùng lý do: SCAN chứ không KEYS, vì KEYS
	// chặn Redis đơn luồng đang phục vụ đường claim của người dùng.
	listSessionsScanCount = 200

	// listSessionsHardCeiling chặn MỘT lượt gọi ListSessions khỏi phải giữ vô
	// hạn session id trong bộ nhớ nếu cluster lệch hẳn quy mô thiết kế (D16:
	// tối đa vài chục session sống cùng lúc). Vượt trần này thì trang ĐẦU vẫn
	// đúng (ta dừng SCAN sớm, không mất id đã thấy) — chỉ những id ở rất xa mới
	// không vào được kết quả của LƯỢT NÀY; gọi lại với cursor sẽ tiếp tục quét.
	listSessionsHardCeiling = 5000

	// defaultListSessionsLimit khớp `limit = 0` của contract (C3).
	defaultListSessionsLimit = 20
	maxListSessionsLimit     = 100
)

// ListSessions liệt kê session ĐANG SỐNG (status < EXPIRED), lọc theo user_id
// khi khác rỗng. Xem session.proto cho lý do KHÔNG có authz vai trò ở tầng này
// (BFF quyết định ai được gửi user_id rỗng hay user_id của người khác).
func (s *Service) ListSessions(
	ctx context.Context, req *orchestratorv1.ListSessionsRequest,
) (*orchestratorv1.ListSessionsResponse, error) {
	userID := req.GetUserId()
	if userID != "" {
		if err := rediskeys.ValidateID(userID); err != nil {
			// user_id KHÔNG khớp pattern id (hash session:{id} không bao giờ
			// ghi được userId dạng đó — xem rediskeys.ValidateID) không thể
			// khớp bất kỳ session nào; từ chối ngay thay vì âm thầm trả rỗng,
			// vì rỗng đọc ra y hệt "user chưa có session nào".
			return nil, status.Errorf(codes.InvalidArgument, "user_id: %v", err)
		}
	}

	limit := int(req.GetLimit())
	switch {
	case limit == 0:
		limit = defaultListSessionsLimit
	case limit < 0 || limit > maxListSessionsLimit:
		return nil, status.Errorf(codes.InvalidArgument,
			"limit phải trong [1,%d] hoặc 0 (=%d); nhận %d", maxListSessionsLimit, defaultListSessionsLimit, req.GetLimit())
	}

	cursor := req.GetCursor()

	// ⛔ KHÔNG CÓ INDEX RIÊNG THEO user_id — xem comment trong session.proto.
	// Quét TOÀN BỘ session:*, lọc + sắp id tăng dần trong bộ nhớ, rồi cắt trang
	// bằng cursor = id cuối trang trước. Ở quy mô hiện tại (D16) đây là lựa
	// chọn ĐÚNG; listSessionsHardCeiling chặn ca lệch quy mô.
	ids, err := s.scanLiveSessionIDs(ctx, userID)
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "quét session: %v", err)
	}
	sort.Strings(ids)

	start := 0
	if cursor != "" {
		// Vị trí đầu tiên có id > cursor — "lớn HƠN", không phải "lớn hơn
		// hoặc bằng": cursor LÀ id cuối của trang trước, trang này bắt đầu
		// NGAY SAU nó.
		start = sort.Search(len(ids), func(i int) bool { return ids[i] > cursor })
	}
	end := start + limit
	if end > len(ids) {
		end = len(ids)
	}
	page := ids[start:end]

	nextCursor := ""
	if end < len(ids) {
		nextCursor = page[len(page)-1]
	}

	sessions := make([]*orchestratorv1.Session, 0, len(page))
	for _, id := range page {
		sess, loadErr := Load(ctx, s.rdb, id)
		if loadErr != nil {
			if errors.Is(loadErr, ErrSessionNotFound) {
				// Session bị reap/hết hạn giữa lượt SCAN và lượt Load này —
				// đây là ảnh-chụp-rồi-đọc-lại, không phải bất biến. Bỏ qua
				// thay vì làm hỏng cả trang vì một session vừa biến mất.
				continue
			}
			return nil, status.Errorf(codes.Unavailable, "đọc session %s: %v", id, loadErr)
		}
		sessions = append(sessions, sess.ToProto())
	}

	return &orchestratorv1.ListSessionsResponse{
		Sessions:   sessions,
		NextCursor: nextCursor,
	}, nil
}

// scanLiveSessionIDs quét `session:*` bằng SCAN (cùng cơ chế
// reaper.sweepGhostSessions — không KEYS), lọc bỏ key phụ (`:pod`/`:ws`), lọc
// theo userID khi khác rỗng, và loại session ở trạng thái TERMINAL. userID
// rỗng = không lọc theo user (mọi user).
func (s *Service) scanLiveSessionIDs(ctx context.Context, userID string) ([]string, error) {
	var ids []string
	var cursor uint64
	for {
		keys, next, err := s.rdb.Scan(ctx, cursor, "session:*", listSessionsScanCount).Result()
		if err != nil {
			return nil, fmt.Errorf("SCAN session:*: %w", err)
		}
		cursor = next

		for _, key := range keys {
			id := strings.TrimPrefix(key, "session:")
			if strings.Contains(id, ":") {
				continue // `:pod` / `:ws`, không phải hash session
			}

			vals, hmErr := s.rdb.HMGet(ctx, key, rediskeys.FieldUserID, rediskeys.FieldStatus).Result()
			if hmErr != nil {
				return nil, fmt.Errorf("HMGET %s: %w", key, hmErr)
			}
			sessUserID, _ := vals[0].(string)
			sessStatus, _ := vals[1].(string)

			if sessUserID == "" {
				continue // hash biến mất giữa SCAN và HMGET
			}
			if userID != "" && sessUserID != userID {
				continue
			}
			if isTerminalSessionStatus(sessStatus) {
				continue
			}

			ids = append(ids, id)
			if len(ids) >= listSessionsHardCeiling {
				return ids, nil
			}
		}

		if cursor == 0 {
			return ids, nil
		}
	}
}

// isTerminalSessionStatus khớp "status < EXPIRED" của contract (C3), đọc theo
// chiều ngược: EXPIRED, REAPED, FAILED là ba trạng thái CUỐI (session.proto) —
// một session đã vào một trong ba trạng thái này không bao giờ quay lại sống.
// So bằng chuỗi NGẮN lưu trong Redis (xem statusPrefix trong session.go),
// không phải tên đầy đủ của enum proto.
func isTerminalSessionStatus(short string) bool {
	switch short {
	case "EXPIRED", "REAPED", "FAILED":
		return true
	default:
		return false
	}
}
