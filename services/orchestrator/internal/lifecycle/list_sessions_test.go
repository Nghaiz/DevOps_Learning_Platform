package lifecycle

import (
	"context"
	"sort"
	"strconv"
	"strings"
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

// TestListSessionsBienTrangChinhXac — cursor rơi ĐÚNG mép trang.
//
// Ca này là chỗ phân trang keyset hay sai một-đơn-vị nhất: `sort.Search` phải
// tìm id LỚN HƠN cursor, không phải "lớn hơn hoặc bằng". Dùng `>=` thì phần tử
// cuối trang trước xuất hiện LẠI ở đầu trang sau; lấy nhầm cursor (id ĐẦU trang
// thay vì CUỐI) thì mất nguyên phần giữa.
//
// n=4, limit=2 ⇒ đúng 2 trang chia chẵn, không dư. Trang 1 kết thúc ĐÚNG ở mép,
// nên next_cursor phải là phần tử cuối của nửa đầu và trang 2 phải là nửa sau,
// KHÔNG lệch một dòng theo bất kỳ chiều nào.
func TestListSessionsBienTrangChinhXac(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	const n = 4
	names := make([]string, 0, n)
	for i := 0; i < n; i++ {
		names = append(names, "sandbox-edge"+strconv.Itoa(i))
	}
	h.seedWarmPod(t, names...)

	all := make([]string, 0, n)
	for i := 0; i < n; i++ {
		sess, err := h.svc.Create(ctx, createReq("u1", "e"+strconv.Itoa(i)))
		if err != nil {
			t.Fatalf("Create %d: %v", i, err)
		}
		all = append(all, sess.GetId())
	}
	sort.Strings(all) // ĐÚNG thứ tự mà ListSessions phải trả.

	p1, err := h.svc.ListSessions(ctx, &orchestratorv1.ListSessionsRequest{UserId: "u1", Limit: 2})
	if err != nil {
		t.Fatalf("trang 1: %v", err)
	}
	if got := idsOf(p1); !equalIDs(got, all[:2]) {
		t.Fatalf("trang 1 = %v, cần %v", got, all[:2])
	}
	if p1.GetNextCursor() != all[1] {
		t.Fatalf("next_cursor = %q, cần %q (id CUỐI trang 1, không phải id đầu)",
			p1.GetNextCursor(), all[1])
	}

	p2, err := h.svc.ListSessions(ctx, &orchestratorv1.ListSessionsRequest{
		UserId: "u1", Limit: 2, Cursor: p1.GetNextCursor(),
	})
	if err != nil {
		t.Fatalf("trang 2: %v", err)
	}
	if got := idsOf(p2); !equalIDs(got, all[2:]) {
		t.Fatalf("trang 2 = %v, cần %v — lệch một dòng nghĩa là sort.Search dùng >= thay vì >",
			got, all[2:])
	}
	// Chia chẵn ⇒ hết dữ liệu ĐÚNG ở mép; next_cursor phải rỗng, KHÔNG được trỏ
	// sang một trang rỗng thứ ba (vòng lặp thừa ở FE và một ô "còn nữa" nói dối).
	if p2.GetNextCursor() != "" {
		t.Fatalf("next_cursor sau trang cuối = %q, cần rỗng", p2.GetNextCursor())
	}
}

// TestListSessionsXoaGiuaHaiTrangKhongLamLechCuaSo — một session BIẾN MẤT giữa
// hai lượt gọi không được làm trang sau nhảy qua một dòng.
//
// Đây là lý do phân trang ở đây là keyset (cursor = id) chứ không phải OFFSET:
// với offset, xoá một phần tử ở TRƯỚC cursor kéo mọi thứ lùi một chỗ và dòng
// ngay sau cửa sổ bị bỏ qua vĩnh viễn — không lỗi, không dấu vết, chỉ thiếu.
func TestListSessionsXoaGiuaHaiTrangKhongLamLechCuaSo(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	const n = 5
	names := make([]string, 0, n)
	for i := 0; i < n; i++ {
		names = append(names, "sandbox-del"+strconv.Itoa(i))
	}
	h.seedWarmPod(t, names...)

	all := make([]string, 0, n)
	for i := 0; i < n; i++ {
		sess, err := h.svc.Create(ctx, createReq("u1", "d"+strconv.Itoa(i)))
		if err != nil {
			t.Fatalf("Create %d: %v", i, err)
		}
		all = append(all, sess.GetId())
	}
	sort.Strings(all)

	p1, err := h.svc.ListSessions(ctx, &orchestratorv1.ListSessionsRequest{UserId: "u1", Limit: 2})
	if err != nil {
		t.Fatalf("trang 1: %v", err)
	}
	if got := idsOf(p1); !equalIDs(got, all[:2]) {
		t.Fatalf("trang 1 = %v, cần %v", got, all[:2])
	}

	// Xoá hash của phần tử ĐẦU TIÊN — nó nằm TRƯỚC cursor. Với offset thì đây
	// là ca làm lệch cửa sổ; với keyset thì không được ảnh hưởng gì.
	key, kErr := rediskeys.Session(all[0])
	if kErr != nil {
		t.Fatalf("rediskeys.Session: %v", kErr)
	}
	if err := h.rdb.Del(ctx, key).Err(); err != nil {
		t.Fatalf("DEL session: %v", err)
	}

	p2, err := h.svc.ListSessions(ctx, &orchestratorv1.ListSessionsRequest{
		UserId: "u1", Limit: 2, Cursor: p1.GetNextCursor(),
	})
	if err != nil {
		t.Fatalf("trang 2: %v", err)
	}
	if got := idsOf(p2); !equalIDs(got, all[2:4]) {
		t.Fatalf("trang 2 = %v, cần %v — xoá một dòng TRƯỚC cursor đã làm lệch cửa sổ",
			got, all[2:4])
	}
}

// TestListSessionsXoaChinhCursorVanDiTiep — xoá đúng session mà cursor trỏ tới.
//
// Cursor là một GIÁ TRỊ id, không phải con trỏ vào một hàng còn tồn tại, nên
// `sort.Search(> cursor)` vẫn định vị đúng chỗ kể cả khi hàng đó đã biến mất.
// Ai đó đổi sang "tìm INDEX của cursor rồi +1" sẽ làm ca này nhảy về đầu — và
// nó là ca THƯỜNG XẢY RA: session hết hạn đúng lúc người dùng bấm "trang sau".
func TestListSessionsXoaChinhCursorVanDiTiep(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	const n = 4
	names := make([]string, 0, n)
	for i := 0; i < n; i++ {
		names = append(names, "sandbox-cur"+strconv.Itoa(i))
	}
	h.seedWarmPod(t, names...)

	all := make([]string, 0, n)
	for i := 0; i < n; i++ {
		sess, err := h.svc.Create(ctx, createReq("u1", "c"+strconv.Itoa(i)))
		if err != nil {
			t.Fatalf("Create %d: %v", i, err)
		}
		all = append(all, sess.GetId())
	}
	sort.Strings(all)

	cursor := all[1] // id cuối trang 1 với limit=2
	key, kErr := rediskeys.Session(cursor)
	if kErr != nil {
		t.Fatalf("rediskeys.Session: %v", kErr)
	}
	if err := h.rdb.Del(ctx, key).Err(); err != nil {
		t.Fatalf("DEL session cursor: %v", err)
	}

	p2, err := h.svc.ListSessions(ctx, &orchestratorv1.ListSessionsRequest{
		UserId: "u1", Limit: 2, Cursor: cursor,
	})
	if err != nil {
		t.Fatalf("trang 2 với cursor đã bị xoá: %v", err)
	}
	if got := idsOf(p2); !equalIDs(got, all[2:]) {
		t.Fatalf("trang 2 = %v, cần %v — cursor phải là một GIÁ TRỊ so sánh được, "+
			"không phải con trỏ vào một hàng còn sống", got, all[2:])
	}
}

// TestTrangThaiTerminalKhopEnum — `isTerminalSessionStatus` phải khớp ĐÚNG định
// nghĩa của contract ("status < EXPIRED" là còn sống) cho MỌI giá trị của enum
// SessionStatus, kể cả giá trị được thêm sau này.
//
// ⛔ VÌ SAO KHÔNG CHỈ LIỆT KÊ BA CHUỖI. Hàm kia giữ ba chuỗi NGẮN viết tay
// ("EXPIRED"/"REAPED"/"FAILED"), tách rời khỏi enum proto VÀ tách rời khỏi các
// literal trong reaper.go + *.lua. Một test liệt kê lại đúng ba chuỗi đó chỉ
// chép lại khẳng định đang được kiểm — nó không thể đỏ. Duyệt TỪ enum thì một
// `SESSION_STATUS_<X> = 8` thêm vào ngày mai sẽ làm ô này đỏ và bắt người thêm
// nó quyết định X là trạng thái cuối hay không, thay vì để mặc định "còn sống"
// trôi vào danh sách phiên của /me.
func TestTrangThaiTerminalKhopEnum(t *testing.T) {
	const prefix = "SESSION_STATUS_"
	firstTerminal := int32(orchestratorv1.SessionStatus_SESSION_STATUS_EXPIRED)

	seen := 0
	for value, full := range orchestratorv1.SessionStatus_name {
		short := strings.TrimPrefix(full, prefix)
		if short == full {
			t.Fatalf("enum %q không mang tiền tố %q — statusPrefix trong session.go đã lệch", full, prefix)
		}
		seen++
		wantTerminal := value >= firstTerminal
		if got := isTerminalSessionStatus(short); got != wantTerminal {
			t.Errorf("isTerminalSessionStatus(%q) = %v, cần %v (enum = %d, EXPIRED = %d)",
				short, got, wantTerminal, value, firstTerminal)
		}
	}
	// Đối chứng dương cho chính vòng lặp: nếu map enum rỗng thì mọi assert ở
	// trên biến mất và ô này xanh mà không kiểm gì (green-that-proves-nothing).
	if seen < 8 {
		t.Fatalf("chỉ duyệt %d giá trị enum — vòng lặp không chạy đủ, mọi assert ở trên vô nghĩa", seen)
	}

	// Và khớp NGƯỢC với reaper: hai chuỗi mà reaper.go coi là "session còn sống,
	// pod đang phục vụ nó" (`status != CLAIMED && != RUNNING` ⇒ bỏ qua) phải
	// KHÔNG bao giờ bị hàm này coi là trạng thái cuối. Hai bộ literal nằm ở hai
	// package và không có gì buộc chúng khớp nhau ngoài dòng này.
	for _, alive := range []string{"CLAIMED", "RUNNING"} {
		if isTerminalSessionStatus(alive) {
			t.Errorf("%q bị coi là trạng thái cuối, nhưng reaper.go coi nó là session ĐANG SỐNG", alive)
		}
	}
}

// TestSortAndDedupe — SCAN của Redis ĐƯỢC PHÉP trả một key nhiều lần (rehash
// giữa lượt quét). Không khử trùng thì /me hiện cùng một phiên hai lần.
//
// Ép Redis trả trùng một cách xác định là không làm được, nên bất biến được gác
// ở đây: đầu ra TĂNG DẦN NGHIÊM NGẶT và giữ đủ tập giá trị.
func TestSortAndDedupe(t *testing.T) {
	for _, tc := range []struct {
		name string
		in   []string
		want []string
	}{
		{"rỗng", nil, nil},
		{"một phần tử", []string{"b"}, []string{"b"}},
		{"chưa sắp", []string{"c", "a", "b"}, []string{"a", "b", "c"}},
		{"trùng liền nhau", []string{"a", "a", "b"}, []string{"a", "b"}},
		{"trùng rời nhau", []string{"b", "a", "b", "a"}, []string{"a", "b"}},
		{"toàn trùng", []string{"x", "x", "x"}, []string{"x"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := sortAndDedupe(append([]string(nil), tc.in...))
			if !equalIDs(got, tc.want) {
				t.Fatalf("sortAndDedupe(%v) = %v, cần %v", tc.in, got, tc.want)
			}
			for i := 1; i < len(got); i++ {
				if got[i-1] >= got[i] {
					t.Fatalf("đầu ra không tăng dần nghiêm ngặt tại %d: %v", i, got)
				}
			}
		})
	}
}

// idsOf rút danh sách id theo ĐÚNG thứ tự response trả.
func idsOf(resp *orchestratorv1.ListSessionsResponse) []string {
	out := make([]string, 0, len(resp.GetSessions()))
	for _, s := range resp.GetSessions() {
		out = append(out, s.GetId())
	}
	return out
}

// equalIDs so sánh CÓ thứ tự — thứ tự chính là thứ phân trang phụ thuộc vào,
// nên một phép so sánh bỏ qua thứ tự sẽ bỏ lọt đúng lỗi đang được gác.
func equalIDs(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
