package podexec_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/prometheus/client_golang/prometheus"
	"k8s.io/client-go/tools/remotecommand"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/drain"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/podexec"
)

// Drain — chặng 3.H.
//
// Bối cảnh: `http.Server.Shutdown` KHÔNG theo dõi kết nối đã hijack, mà WS sau
// 101 chính là hijack. Nên trước 3.H, SIGTERM làm process thoát trong khi các
// goroutine phiên còn đang chạy — `defer` trả khe WS không bao giờ chạy, và
// người dùng ăn 429 SESSION_IN_USE tới hàng chục phút (đo được trên cụm).

// dungCauDrain dựng một Bridge + server WS, trả về bridge và kết nối client.
// Tách khỏi `bridgeHarness` của bridge_test.go vì ca này cần chính con trỏ
// Bridge để gọi Drain — thứ harness kia cố ý không phơi ra.
func dungCauDrain(t *testing.T, chay func(ctx context.Context, o remotecommand.StreamOptions) error) (*drain.Coordinator, *websocket.Conn, chan struct{}) {
	t.Helper()

	reg := prometheus.NewRegistry()
	b := podexec.New(
		func(podexec.Target) (remotecommand.Executor, error) {
			return execChay(chay), nil
		},
		func(context.Context, string) (bool, error) { return true, nil },
		stubExtenderDrain{},
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		metrics.New(reg),
	)
	dc := drain.New()
	b.SetDrain(dc)

	servedXong := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer close(servedXong)
		c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			Subprotocols:       []string{"dlp.terminal.v1"},
			InsecureSkipVerify: true,
		})
		if err != nil {
			return
		}
		defer func() { _ = c.CloseNow() }()
		// Bao trọn handler đúng như wsroute làm — đó là ranh giới mà bản đầu của
		// 3.H đặt sai và chỉ phép đo trên cụm mới lộ ra.
		xong := dc.Enter()
		defer xong()
		b.Serve(r.Context(), c, podexec.Target{
			SessionID: "sess-drain",
			PodName:   "sandbox-deadbeef",
			Namespace: "dlp-sandbox",
			ExpiresAt: time.Now().Add(time.Hour).Unix(),
			UserID:    "user-a",
		})
	}))
	t.Cleanup(srv.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)
	c, resp, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http"), &websocket.DialOptions{
		HTTPClient:   srv.Client(),
		Subprotocols: []string{"dlp.terminal.v1"},
	})
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { _ = c.CloseNow() })
	return dc, c, servedXong
}

type execChayFn func(ctx context.Context, o remotecommand.StreamOptions) error

func execChay(f execChayFn) remotecommand.Executor { return execChayImpl{f} }

type execChayImpl struct{ f execChayFn }

func (e execChayImpl) Stream(remotecommand.StreamOptions) error { return nil }
func (e execChayImpl) StreamWithContext(ctx context.Context, o remotecommand.StreamOptions) error {
	return e.f(ctx, o)
}

type stubExtenderDrain struct{}

func (stubExtenderDrain) Extend(context.Context, string, string) (podexec.ExtendResult, error) {
	return podexec.ExtendResult{}, nil
}

// ⛔ Ô GÁC CHÍNH CỦA 3.H Ở TẦNG UNIT.
//
// Phiên đang chạy + Drain ⇒ client phải nhận ĐÚNG `1012 SERVICE_RESTART`, không
// phải một cú đứt trần. `1012` đã nằm trong contract §6 và FE đã implement kèm
// test từ lâu, nhưng trước 3.H KHÔNG đường nào của gateway phát nó — đúng loại
// khuyết tật với `4408` mà 1.G-1 đã gỡ.
func TestDrainDongPhienBang1012(t *testing.T) {
	batDau := make(chan struct{})
	dc, c, servedXong := dungCauDrain(t, func(ctx context.Context, o remotecommand.StreamOptions) error {
		close(batDau)
		<-ctx.Done() // shell "chạy mãi" cho tới khi bị huỷ
		return ctx.Err()
	})

	// `init` là bắt buộc (contract §3 bước 4): thiếu nó gateway chờ 3s rồi tự
	// dùng 80x24, và ca đo sẽ lẫn với đường timeout đó.
	if err := c.Write(context.Background(), websocket.MessageText,
		[]byte(`{"type":"init","cols":120,"rows":34}`)); err != nil {
		t.Fatalf("gửi init: %v", err)
	}
	select {
	case <-batDau:
	case <-time.After(10 * time.Second):
		t.Fatal("stream không bao giờ khởi động")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if conTreo := dc.Drain(ctx); conTreo != 0 {
		t.Fatalf("Drain còn treo %d phiên — phải drain sạch", conTreo)
	}

	// Đọc tới khi socket đóng và kiểm ĐÚNG mã.
	_, _, err := c.Read(context.Background())
	if got := websocket.CloseStatus(err); got != websocket.StatusServiceRestart {
		t.Fatalf("close code muốn 1012 SERVICE_RESTART, nhận %d (err=%v) — "+
			"-1 nghĩa là đứt KHÔNG kèm close code, tức chính chế độ hỏng 3.H đang vá", got, err)
	}

	select {
	case <-servedXong:
	case <-time.After(5 * time.Second):
		t.Fatal("Serve chưa trả về sau Drain — defer trả khe WS vì thế cũng chưa chạy")
	}
}

// ⛔ ĐỐI CHỨNG: Drain phải ĐỢI, không chỉ ra hiệu rồi trả về.
//
// Thiếu vế này thì Drain trả về ngay, `main` return, process thoát — và ta quay
// lại đúng chế độ hỏng cũ trong khi mọi test khác vẫn xanh. Ở đây shell cố tình
// ngâm 300ms sau khi ctx bị huỷ; Drain phải chờ qua mốc đó.
func TestDrainDoiPhienDutHan(t *testing.T) {
	batDau := make(chan struct{})
	daDut := make(chan struct{})
	dc, c, _ := dungCauDrain(t, func(ctx context.Context, o remotecommand.StreamOptions) error {
		close(batDau)
		<-ctx.Done()
		time.Sleep(300 * time.Millisecond)
		close(daDut)
		return ctx.Err()
	})

	if err := c.Write(context.Background(), websocket.MessageText,
		[]byte(`{"type":"init","cols":120,"rows":34}`)); err != nil {
		t.Fatalf("gửi init: %v", err)
	}
	select {
	case <-batDau:
	case <-time.After(10 * time.Second):
		t.Fatal("stream không bao giờ khởi động")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	dc.Drain(ctx)

	select {
	case <-daDut:
	default:
		t.Fatal("Drain trả về TRƯỚC khi phiên dứt — nó chỉ ra hiệu chứ không đợi, " +
			"nên process sẽ thoát trước khi defer trả khe WS kịp chạy")
	}
}

// Drain lúc KHÔNG có phiên nào phải trả về ngay và không panic (đường chạy khi
// gateway restart lúc rảnh — phổ biến hơn cả ca có phiên).
func TestDrainKhongCoPhienTraVeNgay(t *testing.T) {
	dc := drain.New()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if conTreo := dc.Drain(ctx); conTreo != 0 {
		t.Fatalf("không phiên nào đang mở mà Drain báo còn treo %d", conTreo)
	}
}
