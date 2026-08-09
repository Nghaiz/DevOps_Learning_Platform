package k8s

import (
	"errors"
	"testing"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// forbidden dựng đúng shape lỗi apiserver trả khi ResourceQuota chặn:
// 403 Forbidden, reason Forbidden, message mở đầu bằng "exceeded quota:".
func forbidden(msg string) error {
	return apierrors.NewForbidden(
		schema.GroupResource{Resource: "pods"}, "sandbox-abc", errors.New(msg),
	)
}

// TestIsQuotaExceededTachDungMotNhanh — chạm quota phải tách khỏi mọi lỗi khác.
//
// Nhầm hướng nào cũng đắt: coi quota là lỗi thì warm-pool backoff cấp số nhân +
// log ERROR đúng lúc nền tảng đang chạy hết công suất (D16 trần 4 pod); coi một
// lỗi thật là quota thì sự cố hạ tầng bị nuốt thành WARN và không ai điều tra.
func TestIsQuotaExceededTachDungMotNhanh(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{
			"quota chặn — 403 + 'exceeded quota'",
			forbidden(`exceeded quota: dlp-sandbox-quota, requested: requests.cpu=500m, used: requests.cpu=2100m, limited: requests.cpu=2100m`),
			true,
		},
		{
			"403 nhưng là RBAC thiếu quyền — KHÔNG phải quota",
			forbidden(`pods is forbidden: User "system:serviceaccount:dlp-platform:orchestrator" cannot create resource "pods"`),
			false,
		},
		{
			"VAP từ chối — cũng không phải quota, phải backoff + log nguyên văn",
			forbidden(`ValidatingAdmissionPolicy 'platform-sandbox-isolation' denied request: Pod sandbox BẮT BUỘC set spec.runtimeClassName`),
			false,
		},
		{
			"lỗi mạng thuần — không phải lỗi API",
			errors.New("dial tcp 10.96.0.1:443: connect: connection refused"),
			false,
		},
		{
			"404 mang chữ exceeded quota trong tên — mã lỗi phải khớp TRƯỚC chuỗi",
			apierrors.NewNotFound(schema.GroupResource{Resource: "pods"}, "exceeded quota"),
			false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsQuotaExceeded(tt.err); got != tt.want {
				t.Fatalf("IsQuotaExceeded(%v) = %v, cần %v", tt.err, got, tt.want)
			}
		})
	}
}

// TestIsQuotaExceededXuyenQuaWrap — lỗi từ podClient.Create đã bị %w bọc lại,
// nên nhận diện phải đi xuyên wrap. Không thì nhánh quota chẳng bao giờ chạy
// trên đường thật, chỉ chạy trong test.
func TestIsQuotaExceededXuyenQuaWrap(t *testing.T) {
	raw := forbidden("exceeded quota: dlp-sandbox-quota, requested: pods=1")
	wrapped := errWrap(raw)
	if !IsQuotaExceeded(wrapped) {
		t.Fatal("IsQuotaExceeded không xuyên qua fmt.Errorf(%%w) — nhánh quota sẽ chết trên đường thật")
	}
}

func errWrap(err error) error {
	return &wrapErr{err}
}

type wrapErr struct{ err error }

func (w *wrapErr) Error() string { return "k8s: tạo pod \"sandbox-abc\": " + w.err.Error() }
func (w *wrapErr) Unwrap() error { return w.err }

func TestIsNotFoundPhoiLai(t *testing.T) {
	if !IsNotFound(apierrors.NewNotFound(schema.GroupResource{Resource: "pods"}, "x")) {
		t.Fatal("IsNotFound phải nhận NotFound")
	}
	if IsNotFound(forbidden("x")) {
		t.Fatal("IsNotFound không được nhận Forbidden")
	}
}
