package pool

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// sessionExistsMarker là đoạn chữ trong error_reply của claim.lua khi
// `EXISTS session:{id}` trả 1. Redis không cho script trả mã lỗi có cấu trúc,
// nên khớp chuỗi là đường duy nhất — giữ nó trùng KHÍT với claim.lua.
//
// Chuỗi này KHÔNG còn là điều kiện DUY NHẤT kích hoạt đọc-lại (xem
// ClaimIdempotent): nó chỉ dùng để phân loại, nên một lần đổi câu chữ ở Lua
// làm mất phân loại chứ không làm mất cơ chế bảo vệ.
const sessionExistsMarker = "claim: session da ton tai"

// readBackTimeout giới hạn lượt đọc-lại. Ngắn có chủ ý: nó chạy trên đường
// đang-lỗi, và một Redis đang chết không được kéo dài thêm lời gọi của user.
const readBackTimeout = 3 * time.Second

// ErrSessionOwnedByAnother là ca không bao giờ được lặng lẽ đi qua: hash
// `session:{id}` tồn tại nhưng userId trong đó KHÔNG phải người đang gọi.
//
// Với sessionID 128-bit thì trùng ngẫu nhiên là không thể — nên nếu ca này xảy
// ra, hoặc bộ sinh id hỏng, hoặc có ai đó đang thăm dò. Cả hai đều phải nổ ra
// chứ không được trả về podName của người khác.
var ErrSessionOwnedByAnother = errors.New("pool: session:{id} đã tồn tại nhưng thuộc user khác")

// ErrClaimMayHaveWritten nói: lượt claim này thất bại, và ta KHÔNG loại trừ
// được khả năng Redis ĐÃ ghi state.
//
// ⛔ ĐÂY LÀ TÍN HIỆU ĐIỀU KHIỂN CHO TẦNG TRÊN, KHÔNG PHẢI MÔ TẢ LỖI.
// Caller (B3) dùng nó để quyết định CÓ ĐƯỢC NHẢ KHOÁ idempotency HAY KHÔNG.
// Nhả nhầm khoá khi script đã chạy trọn nghĩa là: retry hợp lệ của user sinh
// sessionID MỚI, claim POD THỨ HAI, còn pod thứ nhất rò tới hết TTL — và vì
// hash `session:{id}` của nó TỒN TẠI nên heuristic "pod mồ côi" của reaper (B7)
// không bao giờ thấy. Mỗi lần như vậy là −1 trên trần 4 pod (D16).
//
// Thà giữ một khoá thừa 10 phút (user thử lại được, và đường replay trả đúng
// session cũ) còn hơn rò một pod vĩnh viễn.
var ErrClaimMayHaveWritten = errors.New("pool: claim thất bại nhưng KHÔNG loại trừ được việc Redis đã ghi")

// ClaimIdempotent gọi Claim, và biến MỌI lỗi không-chắc-chắn thành ĐỌC LẠI.
//
// ⛔ VÌ SAO ĐỌC LẠI TRÊN MỌI LỖI, KHÔNG CHỈ TRÊN "session da ton tai":
// bản đầu chỉ đọc lại khi claim.lua trả đúng marker đó — và nhánh ấy là MÃ
// CHẾT, vì CreateSession sinh sessionID 128-bit mới ở mỗi lời gọi nên
// `EXISTS session:{id}` bên trong script không bao giờ bằng 1 cho một lời gọi
// thật. Trong khi đó, chế độ hỏng THẬT mà plan mô tả lại là loại khác hẳn:
// script chạy TRỌN VẸN trên server rồi reply mất ở tầng mạng (timeout TCP).
// Lúc đó lỗi trả về là một timeout bình thường, không mang marker nào, và cơ
// chế bảo vệ nằm ở đúng chỗ không ai đi qua.
//
// Nên điều kiện đúng không phải "lỗi có nói session tồn tại không" mà là
// "ta có CHẮC CHẮN Redis chưa ghi gì không". Chỉ hai lỗi cho phép chắc chắn:
// ErrPoolEmpty (script trả sentinel, không ghi) và ErrInvalidClaimParams
// (chưa gửi script đi). Mọi lỗi còn lại phải đi đọc lại.
func ClaimIdempotent(ctx context.Context, rdb redis.Cmdable, p ClaimParams) (string, error) {
	pod, claimErr := Claim(ctx, rdb, p)
	if claimErr == nil {
		return pod, nil
	}
	// Hai ca CHẮC CHẮN chưa ghi gì — trả thẳng, caller nhả khoá được an toàn.
	if errors.Is(claimErr, ErrPoolEmpty) || errors.Is(claimErr, ErrInvalidClaimParams) {
		return "", claimErr
	}

	sessionKey, keyErr := rediskeys.Session(p.SessionID)
	if keyErr != nil {
		return "", keyErr
	}

	// ctx TÁCH RỜI: lỗi vừa rồi rất có thể LÀ ctx bị huỷ (user đóng tab, deadline
	// gRPC hết). Đọc lại bằng chính ctx đã chết thì lượt đọc không bao giờ rời
	// khỏi process, và ta rơi thẳng vào nhánh "không xác định" trong 100% các ca
	// huỷ — tức là mất luôn khả năng phân biệt mà hàm này tồn tại vì nó.
	probeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), readBackTimeout)
	defer cancel()

	vals, readErr := rdb.HMGet(probeCtx, sessionKey,
		rediskeys.FieldPodName, rediskeys.FieldUserID).Result()
	if readErr != nil {
		return "", fmt.Errorf("%w (lỗi gốc: %w; đọc lại cũng hỏng: %w)",
			ErrClaimMayHaveWritten, claimErr, readErr)
	}

	podName, _ := vals[0].(string)
	userID, _ := vals[1].(string)

	if podName == "" {
		// Không có hash, hoặc có mà chưa có podName ⇒ script KHÔNG ghi trọn
		// (nó tự hoàn tác khi abort giữa chừng). Trả lỗi GỐC: caller biết chắc
		// chưa có state nào và nhả khoá idempotency được.
		return "", claimErr
	}
	if userID != p.UserID {
		return "", fmt.Errorf("%w (session=%q)", ErrSessionOwnedByAnother, p.SessionID)
	}

	// Script ĐÃ chạy trọn cho đúng session này. Lượt claim coi như THÀNH CÔNG —
	// đây chính là ca "retry mất phản hồi" mà B3 mô tả.
	return podName, nil
}

// IsSessionExistsReply cho biết lỗi có phải guard `EXISTS session:{id}` của
// claim.lua hay không. Chỉ dùng để phân loại/log; KHÔNG dùng làm điều kiện
// kích hoạt đọc-lại (xem ClaimIdempotent).
func IsSessionExistsReply(err error) bool {
	return err != nil && strings.Contains(err.Error(), sessionExistsMarker)
}
