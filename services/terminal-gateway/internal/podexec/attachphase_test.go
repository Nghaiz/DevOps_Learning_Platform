package podexec

import (
	"context"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
)

// ---------------------------------------------------------------- trợ giúp

func metricMoi(t *testing.T) *metrics.Metrics {
	t.Helper()
	return metrics.New(prometheus.NewRegistry())
}

// docChang trả (số mẫu, tổng giây) của một nhãn `phase`.
func docChang(t *testing.T, met *metrics.Metrics, phase string) (uint64, float64) {
	t.Helper()
	h, err := met.AttachPhase.GetMetricWithLabelValues(phase)
	if err != nil {
		t.Fatalf("lấy histogram %q: %v", phase, err)
	}
	var m dto.Metric
	if err := h.(prometheus.Metric).Write(&m); err != nil {
		t.Fatalf("đọc histogram %q: %v", phase, err)
	}
	return m.GetHistogram().GetSampleCount(), m.GetHistogram().GetSampleSum()
}

func docIncomplete(t *testing.T, met *metrics.Metrics, reason string) float64 {
	t.Helper()
	c, err := met.AttachPhaseIncompleteTotal.GetMetricWithLabelValues(reason)
	if err != nil {
		t.Fatalf("lấy counter incomplete %q: %v", reason, err)
	}
	var m dto.Metric
	if err := c.Write(&m); err != nil {
		t.Fatalf("đọc counter incomplete %q: %v", reason, err)
	}
	return m.GetCounter().GetValue()
}

// khangDinhIncomplete đòi ĐÚNG một nhãn tăng và nhãn kia đứng yên.
//
// Vế "nhãn kia đứng yên" mới là vế có giá trị: không có nó thì một hiện thực
// dán mọi ca vào cùng một lý do vẫn xanh, và khi đó hai nhãn chỉ là trang trí.
func khangDinhIncomplete(t *testing.T, met *metrics.Metrics, muon string) {
	t.Helper()
	for _, r := range []string{metrics.ReasonMissingMark, metrics.ReasonOutOfOrder} {
		got := docIncomplete(t, met, r)
		can := 0.0
		if r == muon {
			can = 1
		}
		if got != can {
			t.Fatalf("incomplete{reason=%q} = %v, muốn %v", r, got, can)
		}
	}
}

var moiChang = []string{
	metrics.PhaseWaitInit, metrics.PhaseBuildExec,
	metrics.PhaseUpgrade, metrics.PhaseStreams, metrics.PhasePTY,
}

// ---------------------------------------------------------------- ca thuận

// TestNamChangCongLaiBangDungTong là bất biến TRUNG TÂM của phép đo: bảng phân
// bổ chỉ đọc được nếu nó phủ ĐÚNG khoảng mà histogram tổng đo.
//
// Không có ca này thì một hook đặt mốc sai chỗ vẫn cho ra năm con số trông hợp
// lý, chỉ là chúng cộng lại không ra tổng — và không ai phát hiện được vì mỗi
// con số riêng lẻ đều nằm trong khoảng hợp lý.
func TestNamChangCongLaiBangDungTong(t *testing.T) {
	met := metricMoi(t)

	t0 := time.Now()
	at := newAttachTimer(t0)
	at.markInit(t0.Add(10 * time.Millisecond))
	at.markExec(t0.Add(35 * time.Millisecond))
	at.markUpgrade(t0.Add(200 * time.Millisecond))
	at.markStreams(t0.Add(210 * time.Millisecond))
	ready := t0.Add(750 * time.Millisecond)

	at.observe(met, ready)

	var tong float64
	for _, p := range moiChang {
		n, s := docChang(t, met, p)
		if n != 1 {
			t.Fatalf("chặng %q: có %d mẫu, muốn 1", p, n)
		}
		tong += s
	}
	if muon := ready.Sub(t0).Seconds(); tong != muon {
		t.Fatalf("tổng năm chặng = %.6fs, tổng thật = %.6fs", tong, muon)
	}
	for _, r := range []string{metrics.ReasonMissingMark, metrics.ReasonOutOfOrder} {
		if got := docIncomplete(t, met, r); got != 0 {
			t.Fatalf("incomplete{reason=%q} = %v, muốn 0", r, got)
		}
	}
}

func TestTungChangDungGiaTri(t *testing.T) {
	met := metricMoi(t)

	t0 := time.Now()
	at := newAttachTimer(t0)
	at.markInit(t0.Add(10 * time.Millisecond))
	at.markExec(t0.Add(35 * time.Millisecond))
	at.markUpgrade(t0.Add(200 * time.Millisecond))
	at.markStreams(t0.Add(210 * time.Millisecond))
	at.observe(met, t0.Add(750*time.Millisecond))

	muon := map[string]float64{
		metrics.PhaseWaitInit:  0.010,
		metrics.PhaseBuildExec: 0.025,
		metrics.PhaseUpgrade:   0.165,
		metrics.PhaseStreams:   0.010,
		metrics.PhasePTY:       0.540,
	}
	for p, v := range muon {
		_, s := docChang(t, met, p)
		if diff := s - v; diff > 1e-9 || diff < -1e-9 {
			t.Fatalf("chặng %q = %.6fs, muốn %.6fs", p, s, v)
		}
	}
}

// ---------------------------------------------------------------- ca từ chối

// TestThieuMocThiKhongPhatMauNao gác nhánh "hook không chạy".
//
// Xảy ra thật khi executor rơi sang SPDY (đường đó dựng RoundTripper riêng nên
// WrapTransport của ta không nằm trên nó). Một chặng `0s` trông y hệt "chặng đó
// rất nhanh", nên phải loại cả lượt.
func TestThieuMocThiKhongPhatMauNao(t *testing.T) {
	for _, tc := range []struct {
		ten string
		bo  func(*attachTimer, time.Time)
	}{
		{"thiếu init", func(a *attachTimer, t0 time.Time) {
			a.markExec(t0.Add(35 * time.Millisecond))
			a.markUpgrade(t0.Add(200 * time.Millisecond))
			a.markStreams(t0.Add(210 * time.Millisecond))
		}},
		{"thiếu upgrade — ca SPDY", func(a *attachTimer, t0 time.Time) {
			a.markInit(t0.Add(10 * time.Millisecond))
			a.markExec(t0.Add(35 * time.Millisecond))
			a.markStreams(t0.Add(210 * time.Millisecond))
		}},
		{"thiếu streams", func(a *attachTimer, t0 time.Time) {
			a.markInit(t0.Add(10 * time.Millisecond))
			a.markExec(t0.Add(35 * time.Millisecond))
			a.markUpgrade(t0.Add(200 * time.Millisecond))
		}},
	} {
		t.Run(tc.ten, func(t *testing.T) {
			met := metricMoi(t)
			t0 := time.Now()
			at := newAttachTimer(t0)
			tc.bo(at, t0)

			at.observe(met, t0.Add(750*time.Millisecond))

			for _, p := range moiChang {
				if n, _ := docChang(t, met, p); n != 0 {
					t.Fatalf("chặng %q phát %d mẫu — lượt thiếu mốc phải bị loại HẲN", p, n)
				}
			}
			// Nhãn phải là `missing_mark`, KHÔNG phải `out_of_order`. Mốc rỗng
			// là năm 1 nên nó cũng thoả `Before`; một hiện thực hỏi `Before`
			// trước sẽ dán nhãn mọi hook-không-chạy thành "lệch lịch" — chôn
			// một lỗi hệ thống dưới một nhãn nói rằng mọi thứ vẫn bình thường.
			khangDinhIncomplete(t, met, metrics.ReasonMissingMark)
		})
	}
}

// TestMocLechThuTuThiBiLoaiChuKhongKepVe0 là ca chống ĐỘT BIẾN quan trọng nhất
// của file này.
//
// `markStreams` tới từ goroutine `copyStdin` mà client-go SPAWN (`v2.go:95`),
// nên thứ tự của nó với byte stdout đầu tiên không được ngôn ngữ đảm bảo. Một
// hiện thực kẹp hiệu số âm về 0 sẽ làm MỌI ca khác trong file này vẫn xanh —
// chỉ ca này đỏ. Không có nó thì bảng phân bổ sẽ âm thầm bịa số cho đúng những
// lượt bất thường mà ta cần nhìn thấy nhất.
func TestMocLechThuTuThiBiLoaiChuKhongKepVe0(t *testing.T) {
	met := metricMoi(t)

	t0 := time.Now()
	at := newAttachTimer(t0)
	at.markInit(t0.Add(10 * time.Millisecond))
	at.markExec(t0.Add(35 * time.Millisecond))
	at.markUpgrade(t0.Add(200 * time.Millisecond))
	// `streams` SAU `ready` — lập lịch goroutine trễ hơn byte stdout đầu tiên.
	at.markStreams(t0.Add(800 * time.Millisecond))

	at.observe(met, t0.Add(750*time.Millisecond))

	for _, p := range moiChang {
		if n, _ := docChang(t, met, p); n != 0 {
			t.Fatalf("chặng %q phát %d mẫu — lượt lệch thứ tự phải bị loại, không kẹp về 0", p, n)
		}
	}
	khangDinhIncomplete(t, met, metrics.ReasonOutOfOrder)
}

// ---------------------------------------------------------------- hook streams

// TestStdinDatMocLucVAORead chứ không phải lúc Read TRẢ VỀ.
//
// Nguồn stdin thật là `io.Pipe`: `Read` chặn tới khi có người ghi. Đo lúc trả
// về là đo thời gian người dùng gõ phím đầu tiên — một con số vừa vô nghĩa vừa
// lớn hơn cả phiên, và nó sẽ nuốt trọn chặng `pty` vào chặng `streams`.
//
// Ca này dựng đúng cảnh đó: gọi Read trên một pipe KHÔNG ai ghi, rồi khẳng định
// mốc đã được đặt trong khi Read vẫn đang chặn.
func TestStdinDatMocLucVAORead(t *testing.T) {
	pr, pw := io.Pipe()
	defer func() { _ = pw.Close() }()

	at := newAttachTimer(time.Now())
	r := &timedStdinReader{r: pr, t: at}

	dangDoc := make(chan struct{})
	go func() {
		close(dangDoc)
		_, _ = r.Read(make([]byte, 8)) // chặn: chưa ai ghi vào pipe
	}()
	<-dangDoc

	// Chờ tới khi mốc xuất hiện; nếu hiện thực đặt mốc lúc Read TRẢ VỀ thì nó
	// không bao giờ xuất hiện và ca này hết giờ.
	han := time.After(2 * time.Second)
	for {
		at.mu.Lock()
		co := !at.streams.IsZero()
		at.mu.Unlock()
		if co {
			return
		}
		select {
		case <-han:
			t.Fatal("Read đang chặn mà mốc `streams` chưa được đặt — mốc đang đặt lúc Read TRẢ VỀ")
		case <-time.After(time.Millisecond):
		}
	}
}

func TestStdinChiDatMocLanDau(t *testing.T) {
	at := newAttachTimer(time.Now())
	r := &timedStdinReader{r: nopReader{}, t: at}

	if _, err := r.Read(make([]byte, 4)); err != nil {
		t.Fatalf("read 1: %v", err)
	}
	at.mu.Lock()
	dau := at.streams
	at.mu.Unlock()

	time.Sleep(2 * time.Millisecond)
	if _, err := r.Read(make([]byte, 4)); err != nil {
		t.Fatalf("read 2: %v", err)
	}
	at.mu.Lock()
	sau := at.streams
	at.mu.Unlock()

	if !dau.Equal(sau) {
		t.Fatalf("mốc `streams` bị ghi đè ở lượt Read thứ hai: %v → %v", dau, sau)
	}
}

type nopReader struct{}

func (nopReader) Read(p []byte) (int, error) { return len(p), nil }

// ---------------------------------------------------------------- hook upgrade

func TestUpgradeWrapperDatMocQuaContext(t *testing.T) {
	at := newAttachTimer(time.Now())
	ctx := withAttachTimer(context.Background(), at)

	rt := UpgradeTimingWrapper(roundTripperFunc(func(*http.Request) (*http.Response, error) {
		time.Sleep(5 * time.Millisecond)
		return &http.Response{StatusCode: http.StatusSwitchingProtocols, Body: http.NoBody}, nil
	}))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://apiserver/exec", nil)
	if err != nil {
		t.Fatalf("dựng request: %v", err)
	}
	if _, err := rt.RoundTrip(req); err != nil {
		t.Fatalf("round trip: %v", err)
	}

	at.mu.Lock()
	defer at.mu.Unlock()
	if at.upgrade.IsZero() {
		t.Fatal("mốc `upgrade` chưa được đặt — wrapper không tìm thấy timer trong context")
	}
	if d := at.upgrade.Sub(at.start); d < 5*time.Millisecond {
		t.Fatalf("mốc `upgrade` đặt sau %v — phải đặt SAU khi RoundTrip trả về, không phải trước", d)
	}
}

// TestUpgradeWrapperKhongPanicKhiVangTimer: clientset dùng chung transport với
// đường exec ở một số cấu hình, và mọi request KHÔNG-attach đều không có timer
// trong context. Wrapper phải đi qua chúng im lặng.
func TestUpgradeWrapperKhongPanicKhiVangTimer(t *testing.T) {
	rt := UpgradeTimingWrapper(roundTripperFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody}, nil
	}))

	req, err := http.NewRequest(http.MethodGet, "http://apiserver/api/v1/pods", nil)
	if err != nil {
		t.Fatalf("dựng request: %v", err)
	}
	if _, err := rt.RoundTrip(req); err != nil {
		t.Fatalf("round trip không có timer phải đi qua im lặng, nhận: %v", err)
	}
}

// TestUpgradeChiGiuLuotDauTien: `NewFallbackExecutor` có thể thử WS rồi SPDY,
// tức HAI lượt RoundTrip trong cùng một lượt attach. Giữ lượt cuối thì chặng
// `upgrade` nuốt luôn thời gian của lượt hỏng và `streams` thành số âm.
func TestUpgradeChiGiuLuotDauTien(t *testing.T) {
	t0 := time.Now()
	at := newAttachTimer(t0)

	at.markUpgrade(t0.Add(100 * time.Millisecond))
	at.markUpgrade(t0.Add(400 * time.Millisecond))

	at.mu.Lock()
	defer at.mu.Unlock()
	if d := at.upgrade.Sub(t0); d != 100*time.Millisecond {
		t.Fatalf("mốc `upgrade` = %v, muốn lượt ĐẦU (100ms)", d)
	}
}
