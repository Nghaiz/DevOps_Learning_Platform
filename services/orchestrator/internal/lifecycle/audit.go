package lifecycle

import (
	"context"
	_ "embed"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

//go:embed mark_failed.lua
var markFailedLua string

var markFailedScript = redis.NewScript(markFailedLua)

// Giá trị của pg enum `session_event` (apps/web/src/server/db/schema.ts).
//
// Đây là contract LIÊN NGÔN NGỮ: Drizzle định nghĩa enum, Go ghi giá trị. Gõ sai
// một chữ thì INSERT lỗi ở runtime chứ không phải lúc compile — nên chúng nằm ở
// đúng một chỗ, và test đối chiếu với schema.ts.
const (
	auditEventCreated  = "created"
	auditEventClaimed  = "claimed"
	auditEventExtended = "extended"
	auditEventExpired  = "expired"
	auditEventReaped   = "reaped"
	auditEventFailed   = "failed"
)

// Giá trị của pg enum `sandbox_tier` — CHỮ THƯỜNG, KHÔNG phải tên enum proto.
// Postgres dùng `sysbox|gvisor|kata`, proto dùng `SANDBOX_TIER_SYSBOX`. Ghi
// thẳng tên proto vào là INSERT lỗi với thông báo về enum, không về chỗ sai.
var protoTierToPG = map[string]string{
	"SANDBOX_TIER_SYSBOX": "sysbox",
	"SANDBOX_TIER_GVISOR": "gvisor",
	"SANDBOX_TIER_KATA":   "kata",
}

// auditWriteTimeout giới hạn một lượt ghi audit. Ngắn có chủ ý: audit chạy trên
// đường trả về của RPC, và một Postgres chậm KHÔNG được biến thành độ trễ claim.
const auditWriteTimeout = 3 * time.Second

// auditEvent là một dòng của `sessions_audit`.
//
// MỘT DÒNG MỖI SỰ KIỆN, không phải một dòng mỗi session. Bảng này là nhật ký
// bất biến; trạng thái HIỆN TẠI chỉ Redis trả lời (plan.md §4 no-derived-fields).
type auditEvent struct {
	SessionID string
	UserID    string
	Event     string
	Tier      string // tên enum proto; được dịch sang giá trị PG khi ghi
	PodName   string
	Namespace string
	ExpiresAt *time.Time
	Detail    string
}

// audit ghi một sự kiện, KHÔNG BAO GIỜ làm hỏng lời gọi đang chạy.
//
// ⛔ AUDIT KHÔNG ĐƯỢC CHẶN ĐƯỜNG CLAIM (B8). Postgres chết mà CreateSession
// cũng chết theo nghĩa là một bảng nhật ký hạ được cả nền tảng. Lỗi ở đây chỉ
// log ERROR + tăng counter — và counter đó là tín hiệu DUY NHẤT cho biết audit
// trail đang thủng, nên nó phải có mặt trong alert.
//
// ctx TÁCH RỜI: audit chạy sau khi công việc chính đã xong, nên một ctx vừa hết
// hạn không được kéo theo việc mất dòng nhật ký của chính công việc đã thành công.
func (s *Service) audit(ctx context.Context, ev auditEvent) {
	if s.db == nil {
		// Chạy không Postgres là chế độ hợp lệ ở giai đoạn này (xem
		// buildSessionEngine). Không log mỗi sự kiện — sẽ thành spam; cảnh báo
		// một lần lúc khởi động là đủ.
		return
	}

	writeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), auditWriteTimeout)
	defer cancel()

	tier := protoTierToPG[ev.Tier]
	if tier == "" {
		// Không đoán: một tier lạ ghi vào sẽ nổ ở tầng enum của Postgres với
		// thông báo không chỉ về đây.
		s.log.Error("audit: tier không ánh xạ được sang enum Postgres",
			slog.String("tier", ev.Tier), slog.String("session_id", ev.SessionID))
		s.met.AuditWriteFailuresTotal.Inc()
		return
	}

	const q = `
		INSERT INTO sessions_audit
			(session_id, user_id, event, tier, pod_name, namespace, expires_at, detail)
		VALUES ($1, $2, $3::session_event, $4::sandbox_tier, $5, $6, $7, $8)`

	nullable := func(s string) interface{} {
		if s == "" {
			return nil
		}
		return s
	}

	if _, err := s.db.Exec(writeCtx, q,
		ev.SessionID, ev.UserID, ev.Event, tier,
		nullable(ev.PodName), nullable(ev.Namespace), ev.ExpiresAt, nullable(ev.Detail),
	); err != nil {
		s.met.AuditWriteFailuresTotal.Inc()
		s.log.Error("audit: ghi sessions_audit thất bại — RPC VẪN thành công, nhưng audit trail đang thủng",
			slog.String("session_id", ev.SessionID),
			slog.String("event", ev.Event),
			slog.String("err", err.Error()))
	}
}

// AuditDB là phần pgxpool mà lifecycle cần. Interface (không phải *pgxpool.Pool)
// để test kiểm được nhánh "Postgres chết mà RPC vẫn thành công" — chính bất biến
// quan trọng nhất của B8 — mà không phải dựng một Postgres hỏng.
type AuditDB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// Nếu chữ ký Exec của pgxpool đổi, dòng này không compile thay vì lỗi runtime.
var _ AuditDB = (*pgxpool.Pool)(nil)
