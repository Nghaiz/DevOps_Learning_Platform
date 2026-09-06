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
	// tối đa vài chục session sống cùng lúc — trần cứng đo được là 23 pod).
	//
	// ⛔ CHẠM TRẦN NÀY LÀ LỖI, KHÔNG PHẢI MỘT TRANG NGẮN HƠN. Bản đầu cắt SCAN
	// rồi trả về phần đã thấy kèm chú thích "trang ĐẦU vẫn đúng". Chú thích đó
	// SAI, và sai theo kiểu im lặng:
	//
	//   · SCAN trả key theo thứ tự KHÔNG xác định, còn phân trang thì sắp id
	//     tăng dần SAU KHI quét. Cắt ở 5000 nghĩa là bộ 5000 id giữ lại là một
	//     tập TUỲ Ý — id nhỏ nhất của cụm có thể nằm trong phần chưa quét, nên
	//     trang "đầu" hoàn toàn có thể thiếu đúng những dòng phải đứng đầu;
	//   · "gọi lại với cursor sẽ quét tiếp" cũng sai: lượt sau quét lại TỪ ĐẦU
	//     với một thứ tự SCAN khác, nên những id < cursor mà lượt trước bỏ lỡ
	//     không bao giờ vào được kết quả nữa.
	//
	// Hai chế độ hỏng đó đều là "danh sách thiếu dòng mà không ai biết". Với
	// trần 23 pod, chạm 5000 session SỐNG nghĩa là Redis đang giữ rác — một sự
	// cố cần người nhìn, chứ không phải một trang để render. Nên: lỗi, có thông
	// báo nói rõ phải làm gì.
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
		if errors.Is(err, errListSessionsTooMany) {
			return nil, status.Errorf(codes.ResourceExhausted,
				"quét được hơn %d session đang sống — vượt xa trần thiết kế của cụm (vài chục). "+
					"Phân trang KHÔNG còn đúng ở quy mô này (xem listSessionsHardCeiling), nên RPC từ chối "+
					"thay vì trả một trang thiếu dòng. Nhiều khả năng Redis đang giữ session rác: kiểm "+
					"`SCAN session:*` và reaper trước khi nâng trần.", listSessionsHardCeiling)
		}
		return nil, status.Errorf(codes.Unavailable, "quét session: %v", err)
	}
	ids = sortAndDedupe(ids)

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
	// `len(page) > 0` là thừa với `limit >= 1` (end > start bất cứ khi nào
	// end < len(ids)) — giữ lại vì nhánh sai duy nhất ở đây là một panic index
	// -1 trong một RPC chỉ ĐỌC, và ai đó bỏ nhánh `limit == 0` phía trên sẽ mở
	// đúng cửa đó.
	if end < len(ids) && len(page) > 0 {
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
				return nil, errListSessionsTooMany
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

// errListSessionsTooMany là sentinel cho "vượt listSessionsHardCeiling".
//
// Sentinel chứ không phải một *status.Error dựng thẳng trong scanLiveSessionIDs:
// hàm đó không biết gì về gRPC, và trộn tầng vận chuyển vào một helper quét
// Redis là cách một package bắt đầu phải import grpc ở mọi nơi.
var errListSessionsTooMany = errors.New("lifecycle: quá nhiều session sống cho một lượt ListSessions")

// sortAndDedupe sắp id tăng dần VÀ bỏ trùng.
//
// ⛔ KHỬ TRÙNG LÀ BẮT BUỘC, KHÔNG PHẢI PHÒNG XA. `SCAN` của Redis chỉ bảo đảm
// mỗi phần tử tồn tại suốt lượt quét được trả về ÍT NHẤT MỘT LẦN — nó ĐƯỢC PHÉP
// trả cùng một key nhiều lần khi bảng hash bị rehash giữa chừng (thêm/bớt key
// trong lúc quét, đúng thứ xảy ra liên tục trên `session:*`). Không khử thì một
// trang có thể hiện CÙNG một phiên hai lần trong "phiên đang mở" của /me, và
// TestListSessionsPhanTrangCursor không bắt được vì nó chỉ kiểm trùng GIỮA các
// trang.
//
// Tách thành hàm riêng để có chỗ gác được: ép Redis trả trùng một cách xác định
// là không làm được, nhưng bất biến "đầu ra tăng dần nghiêm ngặt" thì kiểm trực
// tiếp được (TestSortAndDedupe).
func sortAndDedupe(ids []string) []string {
	if len(ids) < 2 {
		return ids
	}
	sort.Strings(ids)
	out := ids[:1]
	for _, id := range ids[1:] {
		if id != out[len(out)-1] {
			out = append(out, id)
		}
	}
	return out
}
