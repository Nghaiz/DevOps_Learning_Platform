package lifecycle

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/prometheus/client_golang/prometheus/testutil"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
)

// fakeAuditDB ghi lại câu lệnh, và lỗi được thì lỗi.
type fakeAuditDB struct {
	mu     sync.Mutex
	events []string
	// rows giữ TOÀN BỘ args của mỗi lần Exec, theo đúng thứ tự cột trong câu
	// INSERT của audit.go: session_id, user_id, event, tier, pod_name,
	// namespace, expires_at, detail. `events` một mình chỉ trả lời "sự kiện gì
	// đã xảy ra"; P13 D15 còn phải trả lời "AI làm", và câu đó nằm ở `detail`.
	rows [][]any
	err  error
}

func (f *fakeAuditDB) Exec(_ context.Context, _ string, args ...any) (pgconn.CommandTag, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return pgconn.CommandTag{}, f.err
	}
	f.rows = append(f.rows, append([]any(nil), args...))
	if len(args) >= 3 {
		if ev, ok := args[2].(string); ok {
			f.events = append(f.events, ev)
		}
	}
	return pgconn.CommandTag{}, nil
}

func (f *fakeAuditDB) recorded() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.events...)
}

// rowsFor trả các dòng audit của MỘT loại sự kiện, đã sao chép ra ngoài khoá.
func (f *fakeAuditDB) rowsFor(event string) [][]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out [][]any
	for _, r := range f.rows {
		if len(r) >= 3 {
			if ev, ok := r[2].(string); ok && ev == event {
				out = append(out, append([]any(nil), r...))
			}
		}
	}
	return out
}

// withAudit gắn một AuditDB giả vào harness có sẵn.
func withAudit(h *harness, db AuditDB) { h.svc.db = db }

// TestPostgresChetThiCreateSessionVAN ThanhCong (AC §Chức năng, M-3).
//
// ⛔ AUDIT KHÔNG ĐƯỢC CHẶN ĐƯỜNG CLAIM. Một bảng nhật ký hạ được cả nền tảng là
// đúng thứ B8 cấm. Bất biến này được nêu trong doc của `AuditDB` như lý do tồn
// tại của interface đó — nhưng trước bản này KHÔNG có test nào gác nó, vì mọi
// harness đều truyền db = nil và `audit()` return ngay dòng đầu.
func TestPostgresChetThiCreateSessionVanThanhCong(t *testing.T) {
	h := newHarness(t)
	db := &fakeAuditDB{err: errors.New("connection refused")}
	withAudit(h, db)
	h.seedWarmPod(t, "sandbox-warm01")

	sess, err := h.svc.Create(context.Background(), createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("CreateSession phải thành công dù Postgres chết, nhận: %v", err)
	}
	if sess.GetPodName() == "" {
		t.Fatal("session không có pod")
	}
	if v := testutil.ToFloat64(h.met.AuditWriteFailuresTotal); v != 1 {
		t.Fatalf("dlp_audit_write_failures_total = %v, cần 1 — đây là tín hiệu DUY NHẤT cho biết audit trail đang thủng", v)
	}
}

// TestAuditGhiDungSuKienChoVongDoiSession.
func TestAuditGhiDungSuKienChoVongDoiSession(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	db := &fakeAuditDB{}
	withAudit(h, db)
	h.seedWarmPod(t, "sandbox-warm01", "sandbox-warm02")

	sess, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := h.svc.Reap(ctx, sess.GetId(), ReapActor{UserID: "u1"}); err != nil {
		t.Fatalf("Reap: %v", err)
	}

	got := db.recorded()
	want := []string{auditEventCreated, auditEventReaped}
	if len(got) != len(want) {
		t.Fatalf("audit ghi %v, cần %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("audit ghi %v, cần %v", got, want)
		}
	}
	if v := testutil.ToFloat64(h.met.AuditWriteFailuresTotal); v != 0 {
		t.Fatalf("audit_write_failures = %v, cần 0", v)
	}
}

// TestMarkFailedGhiDuocDongAuditFailed (C-4).
//
// ⛔ Bản đầu gọi audit() với Tier RỖNG ⇒ `protoTierToPG[""]` rỗng ⇒ audit return
// sớm, log ERROR ĐỔ LỖI SAI CHỖ ("tier không ánh xạ được") và tăng
// `dlp_audit_write_failures_total` vì một lý do khác hẳn thứ counter mô tả.
// Hệ quả kép: sự kiện `failed` KHÔNG BAO GIỜ tới Postgres, và mỗi session ma
// thành một báo động sai nếu ai đó gắn alert vào counter kia.
func TestMarkFailedGhiDuocDongAuditFailed(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	db := &fakeAuditDB{}
	withAudit(h, db)
	h.seedWarmPod(t, "sandbox-warm01")

	sess, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	before := testutil.ToFloat64(h.met.AuditWriteFailuresTotal)

	if err := h.svc.MarkFailed(ctx, sess.GetId(), "pod biến mất khỏi cluster"); err != nil {
		t.Fatalf("MarkFailed: %v", err)
	}

	got := db.recorded()
	if len(got) != 2 || got[1] != auditEventFailed {
		t.Fatalf("audit ghi %v, cần [created failed] — sự kiện `failed` không tới được Postgres", got)
	}
	if after := testutil.ToFloat64(h.met.AuditWriteFailuresTotal); after != before {
		t.Fatalf("audit_write_failures tăng %v→%v cho một lượt ghi THÀNH CÔNG — counter đang báo động sai",
			before, after)
	}
}

// TestReapExpiredGhiDuocDongAuditExpired (H-4).
//
// Đường đời PHỔ BIẾN NHẤT của session là hết hạn tự nhiên. Trước bản này nó
// không để lại sự kiện kết thúc nào — nhật ký dừng ở `created` cho đa số phiên,
// tức câu hỏi forensic mà B8 sinh ra để trả lời thì không trả lời được.
//
// Lúc ReapExpired chạy, hash `session:{id}` ĐÃ biến mất; userId/tier chỉ còn đọc
// được từ hash `pod:{name}` — đó là lý do claim.lua ghi chúng ở đó.
func TestReapExpiredGhiDuocDongAuditExpired(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-warm01")

	sess, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	podName := sess.GetPodName()

	// Mô phỏng hết hạn: hash session biến mất, hash pod còn.
	sessionKey, _ := rediskeysSession(t, sess.GetId())
	if err := h.rdb.Del(ctx, sessionKey).Err(); err != nil {
		t.Fatalf("DEL: %v", err)
	}

	db := &fakeAuditDB{}
	withAudit(h, db)

	if err := h.svc.ReapExpired(ctx, sess.GetId(), podName); err != nil {
		t.Fatalf("ReapExpired: %v", err)
	}

	got := db.recorded()
	if len(got) != 1 || got[0] != auditEventExpired {
		t.Fatalf("audit ghi %v, cần [expired] — đường đời phổ biến nhất không có sự kiện kết thúc", got)
	}
	if deleted := h.pods.deletedNames(); len(deleted) != 1 || deleted[0] != podName {
		t.Fatalf("xoá pod %v, cần [%s]", deleted, podName)
	}
}

// TestTierLaThiKhongDoanVaCoTinHieu.
func TestTierLaThiKhongDoanVaCoTinHieu(t *testing.T) {
	h := newHarness(t)
	db := &fakeAuditDB{}
	withAudit(h, db)

	h.svc.audit(context.Background(), auditEvent{
		SessionID: "s1", UserID: "u1", Event: auditEventCreated, Tier: "SANDBOX_TIER_KHONG_CO_THAT",
	})

	if got := db.recorded(); len(got) != 0 {
		t.Fatalf("audit ghi %v — tier lạ phải bị chặn TRƯỚC khi tới enum của Postgres", got)
	}
	if v := testutil.ToFloat64(h.met.AuditWriteFailuresTotal); v != 1 {
		t.Fatalf("audit_write_failures = %v, cần 1", v)
	}
}

// TestEnumSessionEventKhopVoiSchemaTS (M-8).
//
// ⛔ CONTRACT LIÊN NGÔN NGỮ KHÔNG CÓ CỔNG NÀO TRƯỚC BẢN NÀY. Drizzle định nghĩa
// `session_event`, Go ghi các giá trị đó bằng CHUỖI. Chiều trôi IM LẶNG là thêm
// giá trị ở schema.ts mà quên Go: không lỗi nào báo, chỉ là một sự kiện không
// bao giờ được ghi — chính xác là chuyện đã xảy ra với `expired` (H-4). Chiều
// ngược lại thì INSERT nổ ở runtime.
//
// Cùng mô hình với `redis-key-vectors.json` của 1.B0.3: một nguồn, hai bản đọc.
func TestEnumSessionEventKhopVoiSchemaTS(t *testing.T) {
	schemaPath := filepath.Join("..", "..", "..", "..", "apps", "web", "src", "server", "db", "schema.ts")
	// #nosec G304 — đường dẫn là hằng ghép trong chính test, không tới từ input.
	raw, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("đọc %s: %v — nếu file đã chuyển chỗ thì SỬA đường dẫn, đừng bỏ test", schemaPath, err)
	}

	block := regexp.MustCompile(`(?s)pgEnum\('session_event',\s*\[(.*?)\]`).FindSubmatch(raw)
	if block == nil {
		t.Fatal("không tìm thấy pgEnum('session_event', …) trong schema.ts — cổng contract vừa mù")
	}
	values := regexp.MustCompile(`'([a-z_]+)'`).FindAllStringSubmatch(string(block[1]), -1)

	fromTS := make(map[string]bool, len(values))
	for _, m := range values {
		fromTS[m[1]] = true
	}
	fromGo := map[string]bool{
		auditEventCreated:  true,
		auditEventClaimed:  true,
		auditEventExtended: true,
		auditEventExpired:  true,
		auditEventReaped:   true,
		auditEventFailed:   true,
	}

	var missingInGo, missingInTS []string
	for v := range fromTS {
		if !fromGo[v] {
			missingInGo = append(missingInGo, v)
		}
	}
	for v := range fromGo {
		if !fromTS[v] {
			missingInTS = append(missingInTS, v)
		}
	}
	if len(missingInGo) > 0 {
		t.Errorf("schema.ts có %v mà Go không khai — sự kiện đó sẽ KHÔNG BAO GIỜ được ghi, im lặng",
			missingInGo)
	}
	if len(missingInTS) > 0 {
		t.Errorf("Go khai %v mà schema.ts không có — INSERT sẽ nổ ở runtime", missingInTS)
	}
}

// TestMoiGiaTriEnumDeuCoCallSite — một hằng không ai dùng là một sự kiện không
// bao giờ được ghi, và nó trông y hệt một sự kiện chưa từng xảy ra.
func TestMoiGiaTriEnumDeuCoCallSite(t *testing.T) {
	pkg, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("đọc thư mục package: %v", err)
	}
	var body strings.Builder
	for _, e := range pkg {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".go") ||
			strings.HasSuffix(e.Name(), "_test.go") || e.Name() == "audit.go" {
			continue
		}
		b, err := os.ReadFile(e.Name())
		if err != nil {
			t.Fatalf("đọc %s: %v", e.Name(), err)
		}
		body.Write(b)
	}
	src := body.String()

	for name, konst := range map[string]string{
		"auditEventCreated":  "auditEventCreated",
		"auditEventExtended": "auditEventExtended",
		"auditEventExpired":  "auditEventExpired",
		"auditEventReaped":   "auditEventReaped",
		"auditEventFailed":   "auditEventFailed",
	} {
		if !strings.Contains(src, konst) {
			t.Errorf("%s không có call-site sản phẩm nào — sự kiện đó không bao giờ vào sessions_audit", name)
		}
	}
	// auditEventClaimed CỐ Ý chưa có call-site: ở kiến trúc này create và claim
	// là một thao tác nguyên khối nên `created` đã mang đủ podName/expiresAt.
	// Nó để dành cho ngày có đường claim tách rời thật — ghi lại ở đây để lần
	// sau không ai tưởng đó là sót.
	_ = auditEventClaimed
}

// rediskeysSession bọc lại helper để test không phải import thêm.
func rediskeysSession(t *testing.T, id string) (string, error) {
	t.Helper()
	sess := &Session{ID: id}
	_ = sess
	return "session:" + id, nil
}

var _ = orchestratorv1.SessionStatus_SESSION_STATUS_REAPED
