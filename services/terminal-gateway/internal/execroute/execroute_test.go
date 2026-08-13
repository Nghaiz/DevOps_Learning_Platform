package execroute_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/authz"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/execroute"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/podexec"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionstore"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/testjwt"
	"github.com/prometheus/client_golang/prometheus"
)

const (
	testOrigin  = "https://app.example.test"
	testSession = "sess-abc123"
	testUser    = "user-owner"
)

// spySessions đếm số lần Redis bị chạm VÀ số lần khe WS bị xin.
//
// ⛔ `AcquireWS` ở đây là điểm chính của cả file, không phải phần thừa cho đủ bộ.
// `execroute.SessionReader` cố ý KHÔNG khai nó, nhưng một implement dùng type
// assertion (`if a, ok := deps.Sessions.(interface{ AcquireWS(...) }); ok`) vẫn
// gọi tới được — và khi đó bấm "Check" sẽ đá văng terminal đang mở của chính
// người học (trần D17=1). Không đếm thì chế độ hỏng đó lọt qua toàn bộ suite.
type spySessions struct {
	getCalls     atomic.Int32
	acquireCalls atomic.Int32
	sess         *sessionstore.Session
	getErr       error
}

func (s *spySessions) Get(context.Context, string) (*sessionstore.Session, error) {
	s.getCalls.Add(1)
	if s.getErr != nil {
		return nil, s.getErr
	}
	return s.sess, nil
}

func (s *spySessions) AcquireWS(context.Context, string, int, int64) (func(context.Context) error, error) {
	s.acquireCalls.Add(1)
	return func(context.Context) error { return nil }, nil
}

// fakeRunner thay lời gọi apiserver thật: ghi lại Target + script rồi trả kết
// quả dựng sẵn.
//
// Ghi lại `Target` là điểm chính — nó cho test khẳng định `podName`/`namespace`
// tới từ REDIS chứ không từ URL hay body. Thiếu phép khẳng định đó thì một
// implement lấy pod từ input vẫn cho suite xanh, và ô AC "verifyScript chạy
// TRONG pod cô lập" trở thành lời hứa suông.
type fakeRunner struct {
	mu      sync.Mutex
	targets []podexec.Target
	scripts []string

	result podexec.OneShotResult
	err    error
	delay  time.Duration
}

func (f *fakeRunner) Run(ctx context.Context, t podexec.Target, script string) (podexec.OneShotResult, error) {
	f.mu.Lock()
	f.targets = append(f.targets, t)
	f.scripts = append(f.scripts, script)
	f.mu.Unlock()

	if f.delay > 0 {
		select {
		case <-time.After(f.delay):
		case <-ctx.Done():
			return podexec.OneShotResult{}, ctx.Err()
		}
	}
	return f.result, f.err
}

func (f *fakeRunner) calls() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.targets)
}

func (f *fakeRunner) last() (podexec.Target, string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.targets) == 0 {
		return podexec.Target{}, ""
	}
	return f.targets[len(f.targets)-1], f.scripts[len(f.scripts)-1]
}

type harness struct {
	srv      *httptest.Server
	signer   *testjwt.Signer
	sessions *spySessions
	runner   *fakeRunner
	// logs giữ MỌI dòng handler phát ra, ở mức ồn nhất (Debug). Dấu vết kiểm toán
	// của đường nóng (nợ P2 §1) chỉ kiểm được nếu test đọc được log thật.
	logs *bytes.Buffer
}

func activeSession() *sessionstore.Session {
	return &sessionstore.Session{
		UserID:    testUser,
		PodName:   "sandbox-real-pod",
		Namespace: "dlp-sandboxes",
		Status:    sessionstore.StatusRunning,
		ExpiresAt: time.Now().Add(time.Hour).Unix(),
	}
}

func newHarness(t *testing.T, sessions *spySessions, runner *fakeRunner) *harness {
	t.Helper()
	signer := testjwt.NewSigner(t, "kid-1")
	jwks := testjwt.NewJWKSServer(t, signer)

	logs := &bytes.Buffer{}
	mux := http.NewServeMux()
	execroute.Register(mux, execroute.Deps{
		Log:            slog.New(slog.NewTextHandler(logs, &slog.HandlerOptions{Level: slog.LevelDebug})),
		Verifier:       authz.NewVerifier(authz.NewJWKSCache(jwks.URL), testjwt.Issuer),
		Sessions:       sessions,
		Runner:         runner,
		Metrics:        metrics.New(prometheus.NewRegistry()),
		AllowedOrigins: []string{testOrigin},
		Timeout:        2 * time.Second,
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return &harness{srv: srv, signer: signer, sessions: sessions, runner: runner, logs: logs}
}

func validClaims() testjwt.Claims {
	return testjwt.Claims{
		Subject:   testUser,
		SessionID: testSession,
		Audience:  "gateway",
		Issuer:    testjwt.Issuer,
		ExpiresAt: time.Now().Add(time.Hour),
	}
}

type result struct {
	Status int
	Body   []byte
}

func (r *result) decode(t *testing.T, into any) {
	t.Helper()
	if err := json.Unmarshal(r.Body, into); err != nil {
		t.Fatalf("giải mã body %q: %v", string(r.Body), err)
	}
}

func (r *result) code(t *testing.T) string {
	t.Helper()
	var body struct {
		Code string `json:"code"`
	}
	r.decode(t, &body)
	return body.Code
}

// post gửi một lượt chấm đủ header hợp lệ, rồi cho phép sửa từng phần.
func (h *harness) post(t *testing.T, sessionID, rawBody string, mutate ...func(*http.Request)) *result {
	t.Helper()
	r, err := http.NewRequest(http.MethodPost, h.srv.URL+"/exec/session/"+sessionID, strings.NewReader(rawBody))
	if err != nil {
		t.Fatalf("dựng request: %v", err)
	}
	r.Header.Set("Origin", testOrigin)
	r.Header.Set("Content-Type", "application/json")
	r.AddCookie(&http.Cookie{Name: execroute.CookieName, Value: h.signer.Mint(validClaims())}) //nolint:gosec
	for _, m := range mutate {
		m(r)
	}

	resp, err := h.srv.Client().Do(r)
	if err != nil {
		t.Fatalf("gọi exec: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("đọc body: %v", err)
	}
	return &result{Status: resp.StatusCode, Body: body}
}

// withCookie thay cookie mặc định bằng token khác (hoặc bỏ hẳn nếu raw rỗng).
func withCookie(raw string) func(*http.Request) {
	return func(r *http.Request) {
		r.Header.Del("Cookie")
		if raw != "" {
			r.AddCookie(&http.Cookie{Name: execroute.CookieName, Value: raw}) //nolint:gosec
		}
	}
}

func defaultBody() string { return `{"script":"kubectl get cm app-config"}` }

// ---------------------------------------------------------------- happy path

func TestExecPassesExitCodeAndUsesRedisTarget(t *testing.T) {
	sessions := &spySessions{sess: activeSession()}
	runner := &fakeRunner{result: podexec.OneShotResult{ExitCode: 0, Output: "ok\n"}}
	h := newHarness(t, sessions, runner)

	res := h.post(t, testSession, defaultBody())
	if res.Status != http.StatusOK {
		t.Fatalf("status = %d, muốn 200 (body %q)", res.Status, string(res.Body))
	}

	var body struct {
		ExitCode  int    `json:"exitCode"`
		Output    string `json:"output"`
		Truncated bool   `json:"truncated"`
	}
	res.decode(t, &body)
	if body.ExitCode != 0 || body.Output != "ok\n" || body.Truncated {
		t.Fatalf("body = %+v, muốn exitCode=0 output=\"ok\\n\" truncated=false", body)
	}

	target, script := runner.last()
	// Vế quyết định của ô AC "verifyScript chạy TRONG pod cô lập": đích tới từ
	// hash Redis, không từ path `{id}` lẫn body.
	if target.PodName != "sandbox-real-pod" || target.Namespace != "dlp-sandboxes" {
		t.Fatalf("target = %+v, muốn pod/namespace lấy từ Redis", target)
	}
	if target.SessionID != testSession || target.UserID != testUser {
		t.Fatalf("target = %+v, muốn sessionID/userID khớp session", target)
	}
	if script != "kubectl get cm app-config" {
		t.Fatalf("script = %q, muốn nguyên văn từ body", script)
	}
}

// TestExecDoesNotTakeWSSlot khẳng định bước i KHÔNG chạy.
//
// Trần D17=1 nghĩa là khe WS đang bị terminal của người học chiếm. Một lượt chấm
// xin thêm khe sẽ hoặc bị 429, hoặc (tệ hơn) đá văng terminal đang mở — đúng lúc
// người ta vừa bấm "Check" xong.
func TestExecDoesNotTakeWSSlot(t *testing.T) {
	sessions := &spySessions{sess: activeSession()}
	h := newHarness(t, sessions, &fakeRunner{})

	if res := h.post(t, testSession, defaultBody()); res.Status != http.StatusOK {
		t.Fatalf("status = %d, muốn 200", res.Status)
	}
	if n := sessions.acquireCalls.Load(); n != 0 {
		t.Fatalf("AcquireWS được gọi %d lần — lượt chấm KHÔNG được chiếm khe WS", n)
	}
}

// TestExecNonZeroExitIsNotAnError: "bài chưa đúng" phải khác "hệ thống hỏng".
func TestExecNonZeroExitIsNotAnError(t *testing.T) {
	runner := &fakeRunner{result: podexec.OneShotResult{ExitCode: 1, Output: "chua tao configmap\n"}}
	h := newHarness(t, &spySessions{sess: activeSession()}, runner)

	res := h.post(t, testSession, defaultBody())
	if res.Status != http.StatusOK {
		t.Fatalf("status = %d, muốn 200 — exit code khác 0 là KẾT QUẢ, không phải lỗi", res.Status)
	}
	var body struct {
		ExitCode int `json:"exitCode"`
	}
	res.decode(t, &body)
	if body.ExitCode != 1 {
		t.Fatalf("exitCode = %d, muốn 1", body.ExitCode)
	}
}

func TestExecTruncatedFlagReachesCaller(t *testing.T) {
	runner := &fakeRunner{result: podexec.OneShotResult{ExitCode: 0, Output: "abc", Truncated: true}}
	h := newHarness(t, &spySessions{sess: activeSession()}, runner)

	var body struct {
		Truncated bool `json:"truncated"`
	}
	h.post(t, testSession, defaultBody()).decode(t, &body)
	if !body.Truncated {
		t.Fatal("truncated = false — cờ cắt cỡ phải tới được caller, nếu không FE im lặng hiện output cụt")
	}
}

// ---------------------------------------------------------------- authz a→h

func TestExecDeniesForeignOrigin(t *testing.T) {
	sessions := &spySessions{sess: activeSession()}
	h := newHarness(t, sessions, &fakeRunner{})

	res := h.post(t, testSession, defaultBody(), func(r *http.Request) {
		r.Header.Set("Origin", "https://evil.example")
	})
	if res.Status != http.StatusForbidden || res.code(t) != "ORIGIN_NOT_ALLOWED" {
		t.Fatalf("status/code = %d/%s, muốn 403/ORIGIN_NOT_ALLOWED", res.Status, res.code(t))
	}
}

// TestExecAllowsMissingOrigin: người gọi hợp lệ là BFF (server-to-server), nó
// KHÔNG gửi Origin. Fail-closed ở đây sẽ chặn đúng đường duy nhất được dùng thật.
func TestExecAllowsMissingOrigin(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, &fakeRunner{})
	res := h.post(t, testSession, defaultBody(), func(r *http.Request) {
		r.Header.Del("Origin")
	})
	if res.Status != http.StatusOK {
		t.Fatalf("status = %d, muốn 200 (body %q)", res.Status, string(res.Body))
	}
}

func TestExecRequiresCookie(t *testing.T) {
	sessions := &spySessions{sess: activeSession()}
	h := newHarness(t, sessions, &fakeRunner{})

	res := h.post(t, testSession, defaultBody(), withCookie(""))
	if res.Status != http.StatusUnauthorized || res.code(t) != "UNAUTHENTICATED" {
		t.Fatalf("status/code = %d/%s, muốn 401/UNAUTHENTICATED", res.Status, res.code(t))
	}
	if n := sessions.getCalls.Load(); n != 0 {
		t.Fatalf("Redis bị hỏi %d lần cho một request chưa xác thực", n)
	}
}

func TestExecRejectsInvalidToken(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, &fakeRunner{})
	res := h.post(t, testSession, defaultBody(), withCookie("khong-phai-jwt"))
	if res.Status != http.StatusUnauthorized || res.code(t) != "UNAUTHENTICATED" {
		t.Fatalf("status/code = %d/%s, muốn 401/UNAUTHENTICATED", res.Status, res.code(t))
	}
}

// TestExecSidMismatchDiesBeforeRedis — bước e chạy TRƯỚC bước f (contract §3b).
//
// Đây là thứ khoá kênh phụ liệt kê session: "id không tồn tại" và "id của người
// khác" phải trả CÙNG một mã, và không cái nào được chạm Redis.
func TestExecSidMismatchDiesBeforeRedis(t *testing.T) {
	sessions := &spySessions{sess: activeSession()}
	runner := &fakeRunner{}
	h := newHarness(t, sessions, runner)

	res := h.post(t, "sess-cua-nguoi-khac", defaultBody())
	if res.Status != http.StatusForbidden || res.code(t) != "FORBIDDEN" {
		t.Fatalf("status/code = %d/%s, muốn 403/FORBIDDEN", res.Status, res.code(t))
	}
	if n := sessions.getCalls.Load(); n != 0 {
		t.Fatalf("Redis bị hỏi %d lần — bước e phải chạy trước bước f", n)
	}
	if n := runner.calls(); n != 0 {
		t.Fatalf("script chạy %d lần cho một session không thuộc về token", n)
	}
}

// TestExecForgedTokenFailsOwnerCheck — vế g của luật 10.
//
// BFF thật không bao giờ mint được token này (nó chỉ mint sid của session vừa
// tạo cho chính user đó), nên ca này BẮT BUỘC phải forge — đúng lý do
// `testjwt` tồn tại.
func TestExecForgedTokenFailsOwnerCheck(t *testing.T) {
	sess := activeSession()
	sess.UserID = "user-chu-that-su"
	sessions := &spySessions{sess: sess}
	runner := &fakeRunner{}
	h := newHarness(t, sessions, runner)

	res := h.post(t, testSession, defaultBody())
	if res.Status != http.StatusForbidden || res.code(t) != "FORBIDDEN" {
		t.Fatalf("status/code = %d/%s, muốn 403/FORBIDDEN", res.Status, res.code(t))
	}
	if n := runner.calls(); n != 0 {
		t.Fatalf("script chạy %d lần trong pod của NGƯỜI KHÁC", n)
	}
}

func TestExecSessionNotFound(t *testing.T) {
	sessions := &spySessions{getErr: sessionstore.ErrNotFound}
	h := newHarness(t, sessions, &fakeRunner{})

	res := h.post(t, testSession, defaultBody())
	if res.Status != http.StatusNotFound || res.code(t) != "SESSION_NOT_FOUND" {
		t.Fatalf("status/code = %d/%s, muốn 404/SESSION_NOT_FOUND", res.Status, res.code(t))
	}
}

func TestExecRejectsInactiveSession(t *testing.T) {
	sess := activeSession()
	sess.Status = "REAPED"
	runner := &fakeRunner{}
	h := newHarness(t, &spySessions{sess: sess}, runner)

	res := h.post(t, testSession, defaultBody())
	if res.Status != http.StatusConflict || res.code(t) != "SESSION_NOT_ACTIVE" {
		t.Fatalf("status/code = %d/%s, muốn 409/SESSION_NOT_ACTIVE", res.Status, res.code(t))
	}
	if n := runner.calls(); n != 0 {
		t.Fatalf("script chạy %d lần trên một session đã chết", n)
	}
}

func TestExecRedisErrorIsInternal(t *testing.T) {
	sessions := &spySessions{getErr: errors.New("redis chet")}
	h := newHarness(t, sessions, &fakeRunner{})

	res := h.post(t, testSession, defaultBody())
	if res.Status != http.StatusInternalServerError || res.code(t) != "INTERNAL" {
		t.Fatalf("status/code = %d/%s, muốn 500/INTERNAL", res.Status, res.code(t))
	}
	// Lý do thật chỉ vào log — body không được mang chi tiết hạ tầng.
	if bytes.Contains(res.Body, []byte("redis chet")) {
		t.Fatalf("body rò lý do nội bộ: %q", string(res.Body))
	}
}

// ---------------------------------------------------------------- thân request

func TestExecRejectsUnknownBodyField(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, &fakeRunner{})
	res := h.post(t, testSession, `{"script":"true","command":"rm -rf /"}`)
	if res.Status != http.StatusBadRequest || res.code(t) != "BAD_REQUEST" {
		t.Fatalf("status/code = %d/%s, muốn 400/BAD_REQUEST — field lạ phải bị từ chối (luật 3)",
			res.Status, res.code(t))
	}
}

// TestExecRejectsEmptyScript: `sh` đọc EOF ngay thì thoát 0, tức MỌI step thành
// pass. Một lỗi ở BFF khi đó hiện ra dưới dạng "bài nào cũng đúng".
func TestExecRejectsEmptyScript(t *testing.T) {
	runner := &fakeRunner{}
	h := newHarness(t, &spySessions{sess: activeSession()}, runner)

	res := h.post(t, testSession, `{"script":""}`)
	if res.Status != http.StatusBadRequest || res.code(t) != "BAD_REQUEST" {
		t.Fatalf("status/code = %d/%s, muốn 400/BAD_REQUEST", res.Status, res.code(t))
	}
	if n := runner.calls(); n != 0 {
		t.Fatalf("script rỗng vẫn chạy %d lần — mọi step sẽ pass", n)
	}
}

func TestExecRejectsMalformedBody(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, &fakeRunner{})
	res := h.post(t, testSession, `{khong phai json`)
	if res.Status != http.StatusBadRequest {
		t.Fatalf("status = %d, muốn 400", res.Status)
	}
}

func TestExecRejectsOversizedBody(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, &fakeRunner{})
	huge := `{"script":"` + strings.Repeat("a", 128*1024) + `"}`
	res := h.post(t, testSession, huge)
	if res.Status != http.StatusBadRequest {
		t.Fatalf("status = %d, muốn 400 — body vượt trần phải bị cắt ở tầng đọc", res.Status)
	}
}

// ---------------------------------------------------------------- lỗi khi chạy

func TestExecRunnerFailureIsBadGateway(t *testing.T) {
	runner := &fakeRunner{err: errors.New("apiserver 500")}
	h := newHarness(t, &spySessions{sess: activeSession()}, runner)

	res := h.post(t, testSession, defaultBody())
	if res.Status != http.StatusBadGateway || res.code(t) != "EXEC_FAILED" {
		t.Fatalf("status/code = %d/%s, muốn 502/EXEC_FAILED", res.Status, res.code(t))
	}
	if bytes.Contains(res.Body, []byte("apiserver")) {
		t.Fatalf("body rò lý do nội bộ: %q", string(res.Body))
	}
}

// TestExecTimeoutIsNotAFail: script treo phải trả LỖI, không phải "fail".
//
// Trả "fail" cho một lượt hết hạn sẽ bắt người học đi sửa bài trong khi thứ hỏng
// là cụm — và không dấu vết nào trong FE nói khác đi.
func TestExecTimeoutIsNotAFail(t *testing.T) {
	runner := &fakeRunner{delay: time.Hour}
	sessions := &spySessions{sess: activeSession()}

	signer := testjwt.NewSigner(t, "kid-1")
	jwks := testjwt.NewJWKSServer(t, signer)
	mux := http.NewServeMux()
	execroute.Register(mux, execroute.Deps{
		Log:            slog.New(slog.NewTextHandler(io.Discard, nil)),
		Verifier:       authz.NewVerifier(authz.NewJWKSCache(jwks.URL), testjwt.Issuer),
		Sessions:       sessions,
		Runner:         runner,
		Metrics:        metrics.New(prometheus.NewRegistry()),
		AllowedOrigins: []string{testOrigin},
		Timeout:        50 * time.Millisecond,
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	h := &harness{srv: srv, signer: signer, sessions: sessions, runner: runner}
	res := h.post(t, testSession, defaultBody())
	if res.Status != http.StatusBadGateway || res.code(t) != "EXEC_FAILED" {
		t.Fatalf("status/code = %d/%s, muốn 502/EXEC_FAILED — quá hạn KHÔNG phải exitCode khác 0",
			res.Status, res.code(t))
	}
}

// --- Dấu vết kiểm toán đường nóng (nợ P2 §1) --------------------------------
//
// Trước chặng này gateway CHỈ log lượt bị từ chối. Một lượt chấm thành công —
// mã vừa chạy trong pod của một người thật — không để lại dòng nào, nên câu hỏi
// "ai đã chạy gì, ở đâu, lúc nào" không có nguồn nào trả lời được.

// auditLine trả dòng log kiểm toán của lượt chấm, hoặc "" nếu không có.
func auditLine(logs string) string {
	for _, line := range strings.Split(logs, "\n") {
		if strings.Contains(line, "chạy exec one-shot") {
			return line
		}
	}
	return ""
}

func TestExecGhiDauVetKiemToanKhiThanhCong(t *testing.T) {
	sessions := &spySessions{sess: activeSession()}
	runner := &fakeRunner{result: podexec.OneShotResult{ExitCode: 3, Output: "sai roi\n"}}
	h := newHarness(t, sessions, runner)

	if res := h.post(t, testSession, defaultBody()); res.Status != http.StatusOK {
		t.Fatalf("status = %d, muốn 200", res.Status)
	}

	line := auditLine(h.logs.String())
	if line == "" {
		t.Fatalf("không có dòng kiểm toán nào cho lượt chấm thành công\n--- log ---\n%s", h.logs.String())
	}

	// Bốn trường là tối thiểu để dòng log đứng tên được: AI (user), CÁI GÌ
	// (exit_code), Ở ĐÂU (pod + namespace). Thiếu bất kỳ trường nào thì dòng log
	// vẫn tồn tại nhưng không dùng để điều tra được — đúng chế độ hỏng mà nợ P2
	// §1 mô tả, chỉ khác là lần này nó im lặng hơn.
	for _, want := range []string{
		"session_id=" + testSession,
		"user_id=" + testUser,
		"pod=sandbox-real-pod",
		"namespace=dlp-sandboxes",
		"exit_code=3",
	} {
		if !strings.Contains(line, want) {
			t.Errorf("dòng kiểm toán thiếu %q\n--- dòng ---\n%s", want, line)
		}
	}
}

// TestExecKiemToanKhongChoNoiDungBaiLamVaoLog là vế "đừng log quá tay".
//
// Output tới 8 KiB mỗi lượt và là BÀI LÀM của người học, không phải dữ kiện kiểm
// toán; script thì đến từ đĩa nên log lại cũng chỉ là chép đĩa vào Loki. Một
// dòng kiểm toán phình ra như vậy sẽ bị người vận hành tắt, và khi đó ta mất cả
// dấu vết lẫn công sức thêm nó.
func TestExecKiemToanKhongChoNoiDungBaiLamVaoLog(t *testing.T) {
	const output = "NOI-DUNG-BAI-LAM-KHONG-DUOC-VAO-LOG"
	const script = "SCRIPT-CHAM-KHONG-DUOC-VAO-LOG"

	sessions := &spySessions{sess: activeSession()}
	runner := &fakeRunner{result: podexec.OneShotResult{ExitCode: 0, Output: output}}
	h := newHarness(t, sessions, runner)

	body, err := json.Marshal(map[string]string{"script": script})
	if err != nil {
		t.Fatalf("dựng body: %v", err)
	}
	if res := h.post(t, testSession, string(body)); res.Status != http.StatusOK {
		t.Fatalf("status = %d, muốn 200", res.Status)
	}

	// Đối chứng dương: output THẬT SỰ đã đi qua handler (nếu không, phép khẳng
	// định bên dưới xanh vì lý do sai — chuỗi không có trong log vì nó chưa từng
	// tồn tại ở đâu cả).
	if got, _ := runner.last(); got.PodName == "" {
		t.Fatalf("runner chưa từng được gọi — phép kiểm dưới sẽ xanh vì lý do sai")
	}
	for _, leak := range []string{output, script} {
		if strings.Contains(h.logs.String(), leak) {
			t.Errorf("log chứa %q — dữ liệu bài làm không thuộc về dấu vết kiểm toán\n--- log ---\n%s",
				leak, h.logs.String())
		}
	}
}

// TestExecKhongGhiKiemToanKhiBiTuChoi là ĐỐI CHỨNG ÂM của hai test trên.
//
// Thiếu nó, một implement log vô điều kiện ở đầu handler vẫn cho cả hai test kia
// xanh — và khi đó "dòng kiểm toán" nói rằng script đã chạy trong pod ở đúng
// những lượt mà nó chưa bao giờ chạy. Sai theo hướng đó tệ hơn là không có log.
func TestExecKhongGhiKiemToanKhiBiTuChoi(t *testing.T) {
	sessions := &spySessions{sess: activeSession()}
	runner := &fakeRunner{}
	h := newHarness(t, sessions, runner)

	// Token của người khác → dừng ở bước g, KHÔNG chạm pod.
	foreign := validClaims()
	foreign.Subject = "user-nguoi-khac"
	res := h.post(t, testSession, defaultBody(), withCookie(h.signer.Mint(foreign)))
	if res.Status != http.StatusForbidden {
		t.Fatalf("status = %d, muốn 403", res.Status)
	}
	if runner.calls() != 0 {
		t.Fatalf("runner chạy %d lần, muốn 0 — lượt bị từ chối không được chạm pod", runner.calls())
	}
	if line := auditLine(h.logs.String()); line != "" {
		t.Fatalf("có dòng kiểm toán cho lượt BỊ TỪ CHỐI — nó khẳng định script đã chạy trong pod:\n%s", line)
	}
}

var jwtLike = regexp.MustCompile(`eyJ[A-Za-z0-9_-]{10,}`)

// TestLuat8_LogKiemToanKhongChuaToken mở rộng luật 8 sang execroute.
//
// wsroute đã có phép kiểm này từ phase-1; execroute thì tới chặng này mới bắt
// đầu log ở đường THÀNH CÔNG, tức mới có chỗ để token lọt vào. Log đi tới Loki
// và ở lại đó nhiều tuần, nên token trong log là token đã lộ.
func TestLuat8_LogKiemToanKhongChuaToken(t *testing.T) {
	sessions := &spySessions{sess: activeSession()}
	h := newHarness(t, sessions, &fakeRunner{result: podexec.OneShotResult{ExitCode: 0}})

	// Một lượt thành công + một lượt token hỏng: cả hai nhánh log đều phải sạch.
	h.post(t, testSession, defaultBody())
	h.post(t, testSession, defaultBody(), withCookie("eyJhbGciOiJub25lIn0.e30."))

	if m := jwtLike.FindString(h.logs.String()); m != "" {
		t.Fatalf("log chứa chuỗi giống JWT: %q\n--- log ---\n%s", m, h.logs.String())
	}
}
