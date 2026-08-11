package extend_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/extend"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/podexec"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionstore"
	"github.com/prometheus/client_golang/prometheus"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const (
	sessionID = "0123456789abcdef0123456789abcdef"
	userID    = "user-a"
)

func unix(sec int64) time.Time { return time.Unix(sec, 0).UTC() }

// assertCounter đọc một counter từ registry. `label` rỗng = counter không nhãn.
//
// Đọc qua Gather chứ không giữ con trỏ tới collector: đó đúng là thứ /metrics
// trả về, nên test đo cái người vận hành sẽ thấy chứ không phải một biến trong
// bộ nhớ tình cờ trùng tên.
func assertCounter(t *testing.T, reg *prometheus.Registry, name, label string, want float64) {
	t.Helper()
	families, err := reg.Gather()
	if err != nil {
		t.Fatalf("Gather: %v", err)
	}
	for _, f := range families {
		if f.GetName() != name {
			continue
		}
		for _, m := range f.GetMetric() {
			if label == "" && len(m.GetLabel()) == 0 {
				if got := m.GetCounter().GetValue(); got != want {
					t.Errorf("%s = %v, muốn %v", name, got, want)
				}
				return
			}
			for _, lp := range m.GetLabel() {
				if lp.GetValue() == label {
					if got := m.GetCounter().GetValue(); got != want {
						t.Errorf("%s{%s} = %v, muốn %v", name, label, got, want)
					}
					return
				}
			}
		}
		t.Errorf("%s: không có series nào mang nhãn %q", name, label)
		return
	}
	t.Errorf("registry không có metric %s", name)
}

// ------------------------------------------------------------------ test double

// fakeStore trả lần lượt các bản chụp hash cho mỗi lượt Get.
//
// Danh sách chứ không phải một giá trị: cả `Extend` lẫn `classify` đều đọc hash,
// và toàn bộ điểm của việc phân loại là hash ĐÃ ĐỔI giữa hai lượt đọc. Một store
// trả mãi một giá trị sẽ làm mọi ca "revision đã đổi" thành bất khả thi.
type fakeStore struct {
	snaps []snap
	n     int
}

type snap struct {
	sess *sessionstore.Session
	err  error
}

func (f *fakeStore) Get(context.Context, string) (*sessionstore.Session, error) {
	i := f.n
	if i >= len(f.snaps) {
		i = len(f.snaps) - 1 // lần đọc thừa lặp lại bản cuối
	}
	f.n++
	s := f.snaps[i]
	return s.sess, s.err
}

func alive(revision, createdAt int64) snap {
	return snap{sess: &sessionstore.Session{
		UserID:    userID,
		PodName:   "sandbox-1",
		Namespace: "dlp-sandbox",
		Status:    sessionstore.StatusRunning,
		ExpiresAt: 1_800_000_000,
		Revision:  revision,
		CreatedAt: createdAt,
	}}
}

// fakeClient là SessionServiceClient trả lần lượt các câu trả lời đã dựng sẵn.
type fakeClient struct {
	orchestratorv1.SessionServiceClient
	replies []reply
	n       int
	gotRev  []int64
}

type reply struct {
	resp *orchestratorv1.ExtendSessionResponse
	err  error
}

func (f *fakeClient) ExtendSession(
	_ context.Context, in *orchestratorv1.ExtendSessionRequest, _ ...grpc.CallOption,
) (*orchestratorv1.ExtendSessionResponse, error) {
	f.gotRev = append(f.gotRev, in.GetExpectedRevision())
	i := f.n
	if i >= len(f.replies) {
		i = len(f.replies) - 1
	}
	f.n++
	r := f.replies[i]
	return r.resp, r.err
}

func okReply(expiresAt int64, hardCap bool) reply {
	return reply{resp: &orchestratorv1.ExtendSessionResponse{
		Session:        &orchestratorv1.Session{ExpiresAt: timestamppb.New(unix(expiresAt))},
		HardCapReached: hardCap,
	}}
}

func failedPrecondition() reply {
	return reply{err: status.Error(codes.FailedPrecondition, "bất kỳ văn xuôi nào")}
}

func newExtender(t *testing.T, store *fakeStore, client *fakeClient) (*extend.Extender, *prometheus.Registry) {
	t.Helper()
	reg := prometheus.NewRegistry()
	return extend.New(client, store, slog.New(slog.NewTextHandler(io.Discard, nil)), metrics.New(reg)), reg
}

// ------------------------------------------------------------------ ca test

// TestGiaHanThanhCong — đường thẳng: đọc revision, gửi đúng nó, nhận hạn mới.
func TestGiaHanThanhCong(t *testing.T) {
	store := &fakeStore{snaps: []snap{alive(7, 1_700_000_000)}}
	client := &fakeClient{replies: []reply{okReply(1_800_000_300, false)}}
	e, reg := newExtender(t, store, client)

	res, err := e.Extend(context.Background(), sessionID, userID)
	if err != nil {
		t.Fatalf("Extend: %v", err)
	}
	if res.Outcome != podexec.ExtendOK {
		t.Errorf("Outcome = %v, muốn ExtendOK", res.Outcome)
	}
	if res.ExpiresAt != 1_800_000_300 {
		t.Errorf("ExpiresAt = %d, muốn 1800000300", res.ExpiresAt)
	}
	// `expected_revision` phải là revision ĐỌC TỪ HASH. Gửi 0 ("bỏ qua kiểm")
	// biên dịch được, chạy được, và vô hiệu hoá toàn bộ optimistic lock mà
	// revision sinh ra — không test nào khác bắt được việc đó.
	if len(client.gotRev) != 1 || client.gotRev[0] != 7 {
		t.Errorf("expected_revision gửi đi = %v, muốn [7]", client.gotRev)
	}
	assertCounter(t, reg, "dlp_gateway_extend_total", "ok", 1)
}

// TestHardCapReachedVanLaThanhCong — bị trần CẮT khác hẳn ĐÃ QUA trần.
func TestHardCapReachedVanLaThanhCong(t *testing.T) {
	store := &fakeStore{snaps: []snap{alive(1, 1_700_000_000)}}
	client := &fakeClient{replies: []reply{okReply(1_800_000_000, true)}}
	e, reg := newExtender(t, store, client)

	res, err := e.Extend(context.Background(), sessionID, userID)
	if err != nil {
		t.Fatalf("Extend: %v", err)
	}
	if res.Outcome != podexec.ExtendOK {
		t.Fatalf("Outcome = %v, muốn ExtendOK — phiên VẪN CHẠY khi mới chạm trần", res.Outcome)
	}
	if !res.HardCapReached {
		t.Error("HardCapReached = false, muốn true để cầu phát `expiring`")
	}
	assertCounter(t, reg, "dlp_gateway_extend_total", "hard_cap", 1)
}

// TestVaRevisionThiDocLaiRoiThuLaiDungMotLan.
//
// Đây là hợp đồng G7: FailedPrecondition → đọc lại → xác minh còn đúng chủ +
// còn sống → thử lại ĐÚNG một lần. Ca này khoá cả ba vế, và đặc biệt khoá việc
// lần thử thứ hai phải mang revision MỚI — thử lại với revision cũ là gửi lại
// một request đã biết chắc sẽ hỏng.
func TestVaRevisionThiDocLaiRoiThuLaiDungMotLan(t *testing.T) {
	store := &fakeStore{snaps: []snap{
		alive(7, 1_700_000_000), // lượt đọc của try #1
		alive(9, 1_700_000_000), // classify thấy revision đã nhảy 7 → 9
		alive(9, 1_700_000_000), // lượt đọc của try #2
	}}
	client := &fakeClient{replies: []reply{
		failedPrecondition(),
		okReply(1_800_000_300, false),
	}}
	e, reg := newExtender(t, store, client)

	res, err := e.Extend(context.Background(), sessionID, userID)
	if err != nil {
		t.Fatalf("Extend: %v", err)
	}
	if res.Outcome != podexec.ExtendOK {
		t.Errorf("Outcome = %v, muốn ExtendOK sau khi thử lại", res.Outcome)
	}
	if want := []int64{7, 9}; len(client.gotRev) != 2 || client.gotRev[0] != want[0] || client.gotRev[1] != want[1] {
		t.Errorf("revision gửi đi = %v, muốn %v — lần thử lại phải mang revision MỚI", client.gotRev, want)
	}
	assertCounter(t, reg, "dlp_gateway_extend_revision_retry_total", "", 1)
	assertCounter(t, reg, "dlp_gateway_extend_total", "ok", 1)
}

// TestVaRevisionHaiLanThiGone — hết ngân sách thử lại.
func TestVaRevisionHaiLanThiGone(t *testing.T) {
	store := &fakeStore{snaps: []snap{
		alive(7, 1_700_000_000),
		alive(9, 1_700_000_000),
		alive(9, 1_700_000_000),
		alive(11, 1_700_000_000), // classify lần hai: vẫn nhảy tiếp
	}}
	client := &fakeClient{replies: []reply{failedPrecondition(), failedPrecondition()}}
	e, reg := newExtender(t, store, client)

	res, err := e.Extend(context.Background(), sessionID, userID)
	if err != nil {
		t.Fatalf("Extend: %v", err)
	}
	if res.Outcome != podexec.ExtendGone {
		t.Errorf("Outcome = %v, muốn ExtendGone — G7 nói vẫn lệch thì đóng 4404", res.Outcome)
	}
	if len(client.gotRev) != 2 {
		t.Errorf("gọi RPC %d lần, muốn đúng 2 — thử lại VÔ HẠN là nối dài cuộc đua", len(client.gotRev))
	}
	assertCounter(t, reg, "dlp_gateway_extend_total", "gone", 1)
}

// ⛔ TestQuaTranCungThiHardCapChuKhongPhaiGone — ca lôi ra lý do `classify` tồn tại.
//
// `mapExtendError` của orchestrator trả CÙNG MỘT `FailedPrecondition` cho cả ba
// nguyên nhân. Nếu gateway coi mọi FailedPrecondition là "va revision" thì phiên
// chạm trần cứng sẽ: thử lại một lần (vô ích), rồi đóng `4404` — báo cho sinh
// viên "phiên bị thu hồi" thay vì "bạn đã dùng hết 2 giờ". Bằng chứng phân biệt
// KHÔNG phải chuỗi lỗi mà là hash: revision KHÔNG đổi, chủ đúng, còn sống.
func TestQuaTranCungThiHardCapChuKhongPhaiGone(t *testing.T) {
	store := &fakeStore{snaps: []snap{
		alive(7, 1_700_000_000),
		alive(7, 1_700_000_000), // classify: revision Y NGUYÊN ⇒ không phải race
	}}
	client := &fakeClient{replies: []reply{failedPrecondition()}}
	e, reg := newExtender(t, store, client)

	res, err := e.Extend(context.Background(), sessionID, userID)
	if err != nil {
		t.Fatalf("Extend: %v", err)
	}
	if res.Outcome != podexec.ExtendHardCap {
		t.Fatalf("Outcome = %v, muốn ExtendHardCap (→ close 4409)", res.Outcome)
	}
	if len(client.gotRev) != 1 {
		t.Errorf("gọi RPC %d lần, muốn 1 — chạm trần cứng thì thử lại là vô nghĩa", len(client.gotRev))
	}
	assertCounter(t, reg, "dlp_gateway_extend_total", "hard_cap", 1)
}

// TestTrangThaiCuoiDoiThiGone — reaper vừa chuyển session sang EXPIRED.
func TestTrangThaiCuoiDoiThiGone(t *testing.T) {
	expired := alive(7, 1_700_000_000)
	expired.sess.Status = "EXPIRED"
	store := &fakeStore{snaps: []snap{expired}}
	e, reg := newExtender(t, store, &fakeClient{replies: []reply{okReply(1, false)}})

	res, err := e.Extend(context.Background(), sessionID, userID)
	if err != nil {
		t.Fatalf("Extend: %v", err)
	}
	if res.Outcome != podexec.ExtendGone {
		t.Errorf("Outcome = %v, muốn ExtendGone", res.Outcome)
	}
	assertCounter(t, reg, "dlp_gateway_extend_total", "gone", 1)
}

// TestChuLechThiGoneVaKhongGoiRPC.
//
// Gateway đọc được chủ sở hữu từ chính hash, nên nó tự trả lời được. Gọi RPC
// rồi chờ orchestrator nói "not found" là mượn oracle của người khác cho một câu
// mình đã có đáp án — thêm một round-trip trên đường nóng của heartbeat.
func TestChuLechThiGoneVaKhongGoiRPC(t *testing.T) {
	other := alive(7, 1_700_000_000)
	other.sess.UserID = "user-b"
	store := &fakeStore{snaps: []snap{other}}
	client := &fakeClient{replies: []reply{okReply(1, false)}}
	e, _ := newExtender(t, store, client)

	res, err := e.Extend(context.Background(), sessionID, userID)
	if err != nil {
		t.Fatalf("Extend: %v", err)
	}
	if res.Outcome != podexec.ExtendGone {
		t.Errorf("Outcome = %v, muốn ExtendGone", res.Outcome)
	}
	if len(client.gotRev) != 0 {
		t.Error("đã gọi ExtendSession dù hash nói chủ lệch — thừa một round-trip trên đường heartbeat")
	}
}

// TestSessionBienMatThiGone.
func TestSessionBienMatThiGone(t *testing.T) {
	store := &fakeStore{snaps: []snap{{err: sessionstore.ErrNotFound}}}
	e, _ := newExtender(t, store, &fakeClient{replies: []reply{okReply(1, false)}})

	res, err := e.Extend(context.Background(), sessionID, userID)
	if err != nil {
		t.Fatalf("Extend: %v", err)
	}
	if res.Outcome != podexec.ExtendGone {
		t.Errorf("Outcome = %v, muốn ExtendGone", res.Outcome)
	}
}

// TestHashThieuCreatedAtThiLoiChuKhongPhaiHardCap.
//
// `extend.lua` trả `state:` cho hash thiếu `createdAt`, cùng mã gRPC với hai
// nhánh kia. Nếu classify chỉ kiểm status rồi mặc định "hard cap", một hash
// hỏng sẽ hiện ra với sinh viên là "hết thời lượng" và với người trực là không
// gì cả — sự cố dữ liệu bị chôn dưới một thông báo vòng đời bình thường.
func TestHashThieuCreatedAtThiLoiChuKhongPhaiHardCap(t *testing.T) {
	store := &fakeStore{snaps: []snap{
		alive(7, 1_700_000_000),
		alive(7, 0), // createdAt mất
	}}
	e, reg := newExtender(t, store, &fakeClient{replies: []reply{failedPrecondition()}})

	_, err := e.Extend(context.Background(), sessionID, userID)
	if err == nil {
		t.Fatal("Extend trả nil — hash hỏng phải nổi lên thành lỗi, không phải một outcome vòng đời")
	}
	assertCounter(t, reg, "dlp_gateway_extend_total", "error", 1)
}

// TestLoiHaTangTraErrorChuKhongPhaiGone.
//
// Orchestrator đang rollout trả Unavailable. Coi nó là `gone` là giết terminal
// của sinh viên vì gateway không hỏi được người khác — cầu phải thấy `error` để
// còn thử lại ở nhịp sau.
func TestLoiHaTangTraErrorChuKhongPhaiGone(t *testing.T) {
	store := &fakeStore{snaps: []snap{alive(7, 1_700_000_000)}}
	client := &fakeClient{replies: []reply{{err: status.Error(codes.Unavailable, "đang rollout")}}}
	e, reg := newExtender(t, store, client)

	res, err := e.Extend(context.Background(), sessionID, userID)
	if err == nil {
		t.Fatal("Extend trả nil error cho Unavailable")
	}
	if res.Outcome == podexec.ExtendGone {
		t.Error("Outcome = ExtendGone cho một lỗi hạ tầng — biến rollout thành mất phiên")
	}
	assertCounter(t, reg, "dlp_gateway_extend_total", "error", 1)
}

// TestNotFoundVaPermissionDeniedDeuLaGone.
func TestNotFoundVaPermissionDeniedDeuLaGone(t *testing.T) {
	for _, code := range []codes.Code{codes.NotFound, codes.PermissionDenied} {
		t.Run(code.String(), func(t *testing.T) {
			store := &fakeStore{snaps: []snap{alive(7, 1_700_000_000)}}
			client := &fakeClient{replies: []reply{{err: status.Error(code, "x")}}}
			e, _ := newExtender(t, store, client)

			res, err := e.Extend(context.Background(), sessionID, userID)
			if err != nil {
				t.Fatalf("Extend: %v", err)
			}
			if res.Outcome != podexec.ExtendGone {
				t.Errorf("Outcome = %v, muốn ExtendGone", res.Outcome)
			}
		})
	}
}

// TestLoiDocRedisKhongThanhGone — Redis chớp tắt không phải câu trả lời "session
// đã mất". Fail-open đúng hướng: giữ phiên, thử lại nhịp sau.
func TestLoiDocRedisKhongThanhGone(t *testing.T) {
	boom := errors.New("redis: connection refused")
	store := &fakeStore{snaps: []snap{{err: boom}}}
	e, _ := newExtender(t, store, &fakeClient{replies: []reply{okReply(1, false)}})

	res, err := e.Extend(context.Background(), sessionID, userID)
	if err == nil {
		t.Fatal("Extend nuốt lỗi Redis")
	}
	if res.Outcome == podexec.ExtendGone {
		t.Error("Outcome = ExtendGone cho lỗi đọc Redis — mất Redis không đồng nghĩa mất session")
	}
}
