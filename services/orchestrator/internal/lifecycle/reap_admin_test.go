package lifecycle

import (
	"context"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
	"google.golang.org/grpc/codes"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// ─────────────────────────────────────────────────────── P13 D15 — admin reap
//
// Trước chặng này admin bấm "kết thúc phiên" của người khác và nhận NOT_FOUND:
// `reap.lua` chốt `actor.userId == session.userId`, còn đường vòng
// `system_component` đòi mTLS + CN trong allowlist. Nút có mặt, hành động thì
// không — một no-op đội lốt "không tìm thấy". D15 mở nhánh actor thứ ba.
//
// Các test dưới đây chạy trên Redis THẬT (newTestRedis skip khi thiếu REDIS_URL)
// vì thứ phải chứng minh nằm ở chỗ Go gặp Lua, không ở chỗ Go gặp Go.

// TestReapActorQuyetDinhBoKiemChuSoHuu — bảng THUẦN, không cần Redis.
//
// ⛔ ĐÂY LÀ CỔNG QUYỀN CỦA CẢ ĐƯỜNG REAP, viết dưới dạng bảng để mỗi biến thể
// actor có đúng một dòng và việc thêm một nhánh mới mà quên nghĩ tới ba câu hỏi
// này là không thể im lặng. Dòng đầu là dòng quan trọng nhất: một `UserID`
// thường KHÔNG BAO GIỜ được bỏ kiểm — kể cả khi id đó tình cờ là của một admin.
// Vai trò là chuyện của BFF; ở đây chỉ có "nhánh nào của oneof".
func TestReapActorQuyetDinhBoKiemChuSoHuu(t *testing.T) {
	tests := []struct {
		name       string
		actor      ReapActor
		wantBypass bool
		wantLabel  string
		wantDetail string
	}{
		{
			name:       "user thường: giữ kiểm chủ sở hữu",
			actor:      ReapActor{UserID: "u1"},
			wantBypass: false,
			wantLabel:  "user",
			wantDetail: "reap bởi user",
		},
		{
			name:       "id của admin đi QUA NHÁNH user_id: vẫn giữ kiểm",
			actor:      ReapActor{UserID: "adm-1"},
			wantBypass: false,
			wantLabel:  "user",
			wantDetail: "reap bởi user",
		},
		{
			name:       "hệ thống: bỏ kiểm, ghi tên component",
			actor:      ReapActor{System: true, Component: "reaper"},
			wantBypass: true,
			wantLabel:  "system",
			wantDetail: "reap bởi hệ thống: reaper",
		},
		{
			name:       "admin: bỏ kiểm, và ID ADMIN đi vào audit",
			actor:      ReapActor{AdminUserID: "adm-1"},
			wantBypass: true,
			wantLabel:  "admin",
			wantDetail: "reap bởi admin adm-1",
		},
		{
			name:       "System thắng khi cả hai cùng đặt (không thể qua oneof, nhưng hướng an toàn)",
			actor:      ReapActor{System: true, Component: "reaper", AdminUserID: "adm-1"},
			wantBypass: true,
			wantLabel:  "system",
			wantDetail: "reap bởi hệ thống: reaper",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.actor.bypassOwnerCheck(); got != tt.wantBypass {
				t.Errorf("bypassOwnerCheck = %v, cần %v", got, tt.wantBypass)
			}
			if got := tt.actor.label(); got != tt.wantLabel {
				t.Errorf("label = %q, cần %q", got, tt.wantLabel)
			}
			if got := tt.actor.auditDetail(); got != tt.wantDetail {
				t.Errorf("auditDetail = %q, cần %q", got, tt.wantDetail)
			}
		})
	}
}

// TestReapAdminKetThucDuocPhienCuaNguoiKhac — ô AC 13.G, vế "kết thúc được".
//
// Khẳng định BỐN thứ trong một lượt, vì chúng chỉ có nghĩa cùng nhau: phiên
// chết, pod bị xoá, KHE QUOTA được trả lại, và audit ghi đúng ai giết phiên của
// ai. Thiếu vế quota thì "kết thúc được" vẫn để lại một chỗ rò mà repo này đã
// đo một lần (pool:claimed giữ 6 tên trong khi cụm có 1 pod).
func TestReapAdminKetThucDuocPhienCuaNguoiKhac(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	db := &fakeAuditDB{}
	withAudit(h, db)

	sess := startSession(t, h) // chủ phiên là "u1"
	podName := sess.GetPodName()

	before, err := h.svc.GetCapacity(ctx, &orchestratorv1.GetCapacityRequest{})
	if err != nil {
		t.Fatalf("GetCapacity trước: %v", err)
	}
	if before.GetActiveSessions() != 1 {
		t.Fatalf("activeSessions trước = %d, cần 1 — harness không ở trạng thái mong đợi",
			before.GetActiveSessions())
	}

	got, err := h.svc.Reap(ctx, sess.GetId(), ReapActor{AdminUserID: "adm-1"})
	if err != nil {
		// Không khẳng định MÃ lỗi ở đây: trước D15 chỗ này trả NOT_FOUND, còn một
		// bản vá hỏng có thể trả mã khác. Điều phải đỏ là "đường admin lại đóng",
		// không phải "đóng bằng đúng mã cũ" — dán nhãn sai vào một lượt đỏ là cách
		// người triage đi nhầm hướng.
		t.Fatalf("admin reap phiên của u1 THẤT BẠI (%v) — đường mà D15 mở đã đóng lại", err)
	}
	if got.GetStatus() != orchestratorv1.SessionStatus_SESSION_STATUS_REAPED {
		t.Fatalf("status = %v, cần REAPED", got.GetStatus())
	}

	// Pod thật sự bị xoá — không chỉ đổi một dòng trong Redis.
	if names := h.pods.deletedNames(); len(names) != 1 || names[0] != podName {
		t.Fatalf("pod đã xoá = %v, cần [%s]", names, podName)
	}

	// KHE QUOTA TRẢ LẠI: đọc bằng chính đại lượng trang quản trị hiển thị
	// (GetCapacity.activeSessions = LLEN pool:claimed), không bằng một phép đếm
	// riêng chỉ test này biết.
	after, err := h.svc.GetCapacity(ctx, &orchestratorv1.GetCapacityRequest{})
	if err != nil {
		t.Fatalf("GetCapacity sau: %v", err)
	}
	if after.GetActiveSessions() != before.GetActiveSessions()-1 {
		t.Fatalf("activeSessions %d → %d, cần giảm đúng 1 — khe quota không được trả lại",
			before.GetActiveSessions(), after.GetActiveSessions())
	}
	claimed, _ := h.rdb.LRange(ctx, rediskeys.PoolClaimed, 0, -1).Result()
	for _, n := range claimed {
		if n == podName {
			t.Fatal("pod vẫn nằm trong pool:claimed — reaper sẽ coi nó là rác mãi")
		}
	}

	// AUDIT PHÍA ORCHESTRATOR. Dòng `reaped` phải mang CHỦ PHIÊN ở cột user_id
	// (nhật ký nói về phiên của ai) và ID ADMIN trong detail (nói ai đã giết
	// nó). Ghi id admin vào cột user_id sẽ là một dòng SAI — tệ hơn dòng thiếu.
	rows := db.rowsFor(auditEventReaped)
	if len(rows) != 1 {
		t.Fatalf("có %d dòng audit 'reaped', cần đúng 1", len(rows))
	}
	if owner, _ := rows[0][1].(string); owner != "u1" {
		t.Errorf("audit.user_id = %q, cần %q (CHỦ phiên, không phải admin)", owner, "u1")
	}
	detail, _ := rows[0][7].(string)
	if !strings.Contains(detail, "adm-1") {
		t.Errorf("audit.detail = %q — không nêu tên admin nào, tức không trả lời được "+
			"câu hỏi duy nhất khiến bảng này tồn tại", detail)
	}

	// Metric: nhãn actor phải là "admin", không lẫn vào "user".
	if v := testutil.ToFloat64(h.met.ReapTotal.WithLabelValues("admin", "ok")); v != 1 {
		t.Errorf("dlp_reap_total{actor=admin,result=ok} = %v, cần 1", v)
	}
	if v := testutil.ToFloat64(h.met.ReapTotal.WithLabelValues("user", "ok")); v != 0 {
		t.Errorf("dlp_reap_total{actor=user,result=ok} = %v, cần 0 — lượt reap của admin "+
			"đang bị đếm như của người dùng thường", v)
	}
}

// TestReapAdminTrenPhienDaKetThucLaNoOp — phiên đã ở trạng thái cuối.
//
// Ca này CÓ THẬT ở đường admin: `/admin/sessions` là một danh sách đã tải, phiên
// có thể chết giữa lúc admin đọc và lúc admin bấm. Nó phải là no-op OK, không
// phải lỗi — và tuyệt đối không được trừ khe quota lần thứ hai hay ghi thêm một
// dòng "reaped" thứ hai (khi đó câu hỏi "phiên này bị reap mấy lần" trả lời sai).
func TestReapAdminTrenPhienDaKetThucLaNoOp(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	db := &fakeAuditDB{}
	withAudit(h, db)

	sess := startSession(t, h)

	first, err := h.svc.Reap(ctx, sess.GetId(), ReapActor{AdminUserID: "adm-1"})
	if err != nil {
		t.Fatalf("admin reap lần 1: %v", err)
	}
	afterFirst, err := h.svc.GetCapacity(ctx, &orchestratorv1.GetCapacityRequest{})
	if err != nil {
		t.Fatalf("GetCapacity: %v", err)
	}

	second, err := h.svc.Reap(ctx, sess.GetId(), ReapActor{AdminUserID: "adm-2"})
	if err != nil {
		t.Fatalf("admin reap lần 2 phải OK (idempotent), nhận: %v", err)
	}
	if second.GetRevision() != first.GetRevision() {
		t.Fatalf("revision đổi giữa hai lần reap: %d → %d — một gateway đang cầm "+
			"revision đúng sẽ tưởng có ai vừa ghi", first.GetRevision(), second.GetRevision())
	}

	afterSecond, err := h.svc.GetCapacity(ctx, &orchestratorv1.GetCapacityRequest{})
	if err != nil {
		t.Fatalf("GetCapacity: %v", err)
	}
	if afterSecond.GetActiveSessions() != afterFirst.GetActiveSessions() {
		t.Fatalf("activeSessions %d → %d ở lượt reap THỨ HAI — khe quota bị trả lại hai lần",
			afterFirst.GetActiveSessions(), afterSecond.GetActiveSessions())
	}
	if rows := db.rowsFor(auditEventReaped); len(rows) != 1 {
		t.Fatalf("có %d dòng audit 'reaped' sau hai lượt, cần đúng 1", len(rows))
	}
	if v := testutil.ToFloat64(h.met.ReapTotal.WithLabelValues("admin", "already_reaped")); v != 1 {
		t.Errorf("dlp_reap_total{actor=admin,result=already_reaped} = %v, cần 1", v)
	}
}

// TestReapNhanhUserVanKhongReapDuocPhienNguoiKhac — vế "không nới cái gì khác".
//
// D15 mở MỘT nhánh. Nếu sau chặng này nhánh `user_id` cũng bỏ kiểm chủ sở hữu
// thì "biết id = xoá được phiên người khác" quay lại, và nó quay lại IM LẶNG —
// mọi test chức năng của đường user vẫn xanh. Dùng chính id của admin để chặn
// cách hiểu sai hấp dẫn nhất: "admin thì gửi kiểu gì cũng được".
func TestReapNhanhUserVanKhongReapDuocPhienNguoiKhac(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h) // chủ là "u1"

	_, err := h.svc.Reap(ctx, sess.GetId(), ReapActor{UserID: "adm-1"})
	wantCode(t, err, codes.NotFound)

	if names := h.pods.deletedNames(); len(names) != 0 {
		t.Fatalf("pod %v đã bị xoá dù reap bị từ chối", names)
	}
	if _, _, err := h.svc.Extend(ctx, extendReq(sess.GetId(), "u1", 0, 0)); err != nil {
		t.Fatalf("phiên của u1 hỏng sau một lần reap bị từ chối: %v", err)
	}
}

// TestReapActorRongBiTuChoi — tuyến phòng thủ thứ hai của D15.
//
// `scriptUser` rỗng = reap.lua BỎ kiểm chủ sở hữu, và một `ReapActor{}` rơi vào
// đó qua đường MẶC ĐỊNH của Go chứ không qua bypassOwnerCheck(). Tức trước cổng
// này, một struct quên gán mang quyền cao nhất của cả đường reap — im lặng.
func TestReapActorRongBiTuChoi(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)

	_, err := h.svc.Reap(ctx, sess.GetId(), ReapActor{})
	wantCode(t, err, codes.InvalidArgument)

	if names := h.pods.deletedNames(); len(names) != 0 {
		t.Fatalf("pod %v đã bị xoá bởi một actor rỗng", names)
	}
}
