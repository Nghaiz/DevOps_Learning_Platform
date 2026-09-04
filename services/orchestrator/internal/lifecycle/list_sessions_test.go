package lifecycle

import (
	"context"
	"strconv"
	"testing"

	"google.golang.org/grpc/codes"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// TestListSessionsLocTheoUser — user_id khác rỗng chỉ trả session của ĐÚNG
// user đó.
func TestListSessionsLocTheoUser(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-w1", "sandbox-w2")

	sessA, err := h.svc.Create(ctx, createReq("userA", "kA"))
	if err != nil {
		t.Fatalf("Create A: %v", err)
	}
	if _, err := h.svc.Create(ctx, createReq("userB", "kB")); err != nil {
		t.Fatalf("Create B: %v", err)
	}

	resp, err := h.svc.ListSessions(ctx, &orchestratorv1.ListSessionsRequest{UserId: "userA"})
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if len(resp.GetSessions()) != 1 {
		t.Fatalf("Sessions = %d, cần 1 (chỉ userA)", len(resp.GetSessions()))
	}
	if resp.GetSessions()[0].GetId() != sessA.GetId() {
		t.Errorf("id = %q, cần %q", resp.GetSessions()[0].GetId(), sessA.GetId())
	}
}

// TestListSessionsUserRongTraMoiUser — user_id rỗng KHÔNG lọc (mọi user) —
// đây là nhánh CHỈ admin được gửi (xem session.proto), lifecycle tin caller.
func TestListSessionsUserRongTraMoiUser(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-w1", "sandbox-w2")

	if _, err := h.svc.Create(ctx, createReq("userA", "kA")); err != nil {
		t.Fatalf("Create A: %v", err)
	}
	if _, err := h.svc.Create(ctx, createReq("userB", "kB")); err != nil {
		t.Fatalf("Create B: %v", err)
	}

	resp, err := h.svc.ListSessions(ctx, &orchestratorv1.ListSessionsRequest{})
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if len(resp.GetSessions()) != 2 {
		t.Fatalf("Sessions = %d, cần 2 (user_id rỗng = mọi user)", len(resp.GetSessions()))
	}
}

// TestListSessionsLoaiTrangThaiTerminal — EXPIRED/REAPED/FAILED không bao giờ
// vào kết quả, dù hash vẫn còn trong Redis (TTL chưa rụng / reapGrace 5 phút).
func TestListSessionsLoaiTrangThaiTerminal(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-w1")

	sess, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	for _, terminal := range []string{"EXPIRED", "REAPED", "FAILED"} {
		t.Run(terminal, func(t *testing.T) {
			key, kErr := rediskeys.Session(sess.GetId())
			if kErr != nil {
				t.Fatalf("rediskeys.Session: %v", kErr)
			}
			if err := h.rdb.HSet(ctx, key, rediskeys.FieldStatus, terminal).Err(); err != nil {
				t.Fatalf("HSET status: %v", err)
			}

			resp, err := h.svc.ListSessions(ctx, &orchestratorv1.ListSessionsRequest{UserId: "u1"})
			if err != nil {
				t.Fatalf("ListSessions: %v", err)
			}
			if len(resp.GetSessions()) != 0 {
				t.Fatalf("status=%s vẫn xuất hiện trong ListSessions: %+v", terminal, resp.GetSessions())
			}
		})
	}
}

// TestListSessionsPhanTrangCursor — cursor = id cuối trang trước; trang kế
// tiếp bắt đầu SAU nó. Không trùng, không bỏ sót, hội tụ.
func TestListSessionsPhanTrangCursor(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	const n = 5
	names := make([]string, 0, n)
	for i := 0; i < n; i++ {
		names = append(names, "sandbox-page"+strconv.Itoa(i))
	}
	h.seedWarmPod(t, names...)

	want := map[string]bool{}
	for i := 0; i < n; i++ {
		sess, err := h.svc.Create(ctx, createReq("u1", "k"+strconv.Itoa(i)))
		if err != nil {
			t.Fatalf("Create %d: %v", i, err)
		}
		want[sess.GetId()] = true
	}

	seen := map[string]bool{}
	cursor := ""
	pages := 0
	for {
		resp, err := h.svc.ListSessions(ctx, &orchestratorv1.ListSessionsRequest{
			UserId: "u1", Limit: 2, Cursor: cursor,
		})
		if err != nil {
			t.Fatalf("ListSessions cursor=%q: %v", cursor, err)
		}
		if len(resp.GetSessions()) == 0 {
			t.Fatalf("trang rỗng bất ngờ ở cursor=%q, đã thấy %d/%d", cursor, len(seen), n)
		}
		for _, s := range resp.GetSessions() {
			if seen[s.GetId()] {
				t.Fatalf("id %q lặp lại giữa các trang", s.GetId())
			}
			seen[s.GetId()] = true
		}
		pages++
		if pages > n {
			t.Fatal("phân trang không hội tụ — cursor không tiến")
		}
		if resp.GetNextCursor() == "" {
			break
		}
		cursor = resp.GetNextCursor()
	}

	if len(seen) != n {
		t.Fatalf("tổng số id thấy qua mọi trang = %d, cần %d", len(seen), n)
	}
	for id := range want {
		if !seen[id] {
			t.Errorf("id %q không xuất hiện ở bất kỳ trang nào", id)
		}
	}
}

// TestListSessionsLimitBienTraiDung — 0 → mặc định 20, 1..100 giữ nguyên,
// ngoài khoảng → InvalidArgument (C3).
func TestListSessionsLimitBienTraiDung(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	tests := []struct {
		name  string
		limit int32
		want  codes.Code
	}{
		{"0 = mặc định 20", 0, codes.OK},
		{"1 = tối thiểu", 1, codes.OK},
		{"100 = tối đa", 100, codes.OK},
		{"âm", -1, codes.InvalidArgument},
		{"101 vượt trần", 101, codes.InvalidArgument},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := h.svc.ListSessions(ctx, &orchestratorv1.ListSessionsRequest{Limit: tt.limit})
			wantCode(t, err, tt.want)
		})
	}
}

// TestListSessionsRong — không session nào ⇒ trang rỗng + next_cursor rỗng,
// KHÔNG lỗi. Trạng thái bình thường lúc cluster vừa khởi động.
func TestListSessionsRong(t *testing.T) {
	h := newHarness(t)
	resp, err := h.svc.ListSessions(context.Background(), &orchestratorv1.ListSessionsRequest{})
	if err != nil {
		t.Fatalf("ListSessions trên pool rỗng: %v", err)
	}
	if len(resp.GetSessions()) != 0 || resp.GetNextCursor() != "" {
		t.Fatalf("pool rỗng nhưng resp = %+v", resp)
	}
}

// TestListSessionsUserIDSaiDinhDangBiTuChoi — user_id chứa ':' không thể khớp
// bất kỳ session nào (rediskeys.ValidateID chặn ':' trong userId lúc ghi) —
// InvalidArgument thay vì âm thầm trả rỗng (rỗng đọc y hệt "chưa có session").
func TestListSessionsUserIDSaiDinhDangBiTuChoi(t *testing.T) {
	h := newHarness(t)
	_, err := h.svc.ListSessions(context.Background(), &orchestratorv1.ListSessionsRequest{UserId: "a:b"})
	wantCode(t, err, codes.InvalidArgument)
}
