package ideroute

import (
	"bufio"
	"context"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/podexec"
)

// extendCallTimeout là trần của MỘT lượt ExtendSession chạy nền. Lượt gia hạn
// hỏng không giết gì cả (cùng lý lẽ với cầu terminal): nhịp sau thử lại.
const extendCallTimeout = 10 * time.Second

// activity biến hoạt động IDE thành ExtendSession, tối đa một lượt mỗi `every`
// cho một phiên — cùng nhịp với heartbeat terminal (podexec.ExtendInterval).
//
// HOẠT ĐỘNG LÀ GÌ, và vì sao khác terminal một chút: terminal đếm stdin/stdout
// thật và bỏ ping/pong. IDE thì phần lớn thời gian chạy trên MỘT WebSocket sống
// lâu, nên đếm request HTTP thôi là mù đúng lúc người học đang gõ trong editor.
// Ở đây tính: (1) mỗi request được chấp nhận (tải trang, asset, nâng cấp WS),
// (2) byte người học gửi LÊN qua kết nối đã nâng cấp. Chiều pod → trình duyệt
// KHÔNG tính.
//
// ⚠ GIỚI HẠN ĐÃ BIẾT, CHƯA ĐO: frontend Theia tự gửi keepalive qua chính kết
// nối đó (pong của engine.io; ping JSON-RPC của trạng thái kết nối khi lâu
// không có tin tới). Byte ấy không phân biệt được với byte người gõ nếu không
// giải mã giao thức của Theia, nên một tab IDE mở mà bỏ quên vẫn được tính là
// có người và giữ phiên tới trần cứng — khác terminal. Trần cứng vẫn chặn trên.
// Lọc chính xác cần đo khung thật trên pod; xem báo cáo D7.
type activity struct {
	ext   podexec.Extender
	every time.Duration
	log   *slog.Logger
	now   func() time.Time

	mu   sync.Mutex
	last map[string]time.Time
}

func newActivity(ext podexec.Extender, every time.Duration, log *slog.Logger) *activity {
	if every <= 0 {
		every = podexec.ExtendInterval
	}
	return &activity{ext: ext, every: every, log: log, now: time.Now, last: map[string]time.Time{}}
}

// touch ghi nhận một dấu hiệu hoạt động. Không bao giờ chặn người gọi: lượt gọi
// RPC chạy nền, vì `touch` nằm trên đường copy byte của WebSocket.
//
// `userID` là `sub` của token ĐÃ VERIFY ở chuỗi authz, không bao giờ từ client.
func (a *activity) touch(sessionID, userID string) {
	if a.ext == nil {
		return
	}
	now := a.now()

	a.mu.Lock()
	if t, ok := a.last[sessionID]; ok && now.Sub(t) < a.every {
		a.mu.Unlock()
		return
	}
	a.last[sessionID] = now
	// Dọn mục quá một nhịp: chúng tương đương HOÀN TOÀN với "không có mục" (điều
	// kiện ở trên), nên xoá không đổi hành vi — chỉ chặn map phình theo mọi phiên
	// từng mở IDE trong đời tiến trình. Chạy trên nhánh hiếm (≤ 1 lần/nhịp/phiên).
	for id, t := range a.last {
		if now.Sub(t) >= a.every {
			delete(a.last, id)
		}
	}
	a.mu.Unlock()

	go a.extend(sessionID, userID)
}

func (a *activity) extend(sessionID, userID string) {
	ctx, cancel := context.WithTimeout(context.Background(), extendCallTimeout)
	defer cancel()

	res, err := a.ext.Extend(ctx, sessionID, userID)
	if err != nil {
		a.log.Warn("IDE: gia hạn session thất bại — sẽ thử lại ở hoạt động sau",
			slog.String("session_id", sessionID), slog.String("err", err.Error()))
		return
	}
	if res.Outcome != podexec.ExtendOK {
		// Phiên đã mất / qua trần cứng. Request kế tiếp sẽ bị chuỗi authz từ chối
		// ở bước f/h — route IDE không có kênh nào khác để báo cho FE.
		a.log.Info("IDE: phiên không còn gia hạn được",
			slog.String("session_id", sessionID), slog.Int("outcome", int(res.Outcome)))
	}
}

// isUpgrade: request xin nâng cấp giao thức (WebSocket của Theia).
func isUpgrade(r *http.Request) bool {
	if r.Header.Get("Upgrade") == "" {
		return false
	}
	for _, v := range r.Header.Values("Connection") {
		for _, tok := range strings.Split(v, ",") {
			if strings.EqualFold(strings.TrimSpace(tok), "upgrade") {
				return true
			}
		}
	}
	return false
}

// activityWriter bọc ResponseWriter của một request nâng cấp để byte client gửi
// LÊN sau khi nâng cấp đi qua `onRead`.
//
// ReverseProxy lấy kết nối bằng `http.NewResponseController(rw).Hijack()` rồi
// `io.Copy(backend, conn)` — đọc thẳng từ `conn`. Nên bọc `Hijack` là đủ thấy
// mọi byte chiều lên; `Unwrap` giữ Flush/các khả năng khác đi xuyên qua.
type activityWriter struct {
	http.ResponseWriter
	onRead func()
}

func (w *activityWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *activityWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	conn, brw, err := http.NewResponseController(w.ResponseWriter).Hijack()
	if err != nil {
		return nil, nil, err
	}
	return &activityConn{Conn: conn, onRead: w.onRead}, brw, nil
}

type activityConn struct {
	net.Conn
	onRead func()
}

func (c *activityConn) Read(p []byte) (int, error) {
	n, err := c.Conn.Read(p)
	if n > 0 {
		c.onRead()
	}
	return n, err
}
