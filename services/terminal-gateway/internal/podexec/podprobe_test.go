package podexec

import (
	"errors"
	"testing"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// Package NỘI BỘ (không phải `podexec_test`) vì `podGone` không xuất — và nó
// không nên xuất: thứ phần còn lại của hệ dùng là `PodGoneFunc`.

func podChay() *corev1.Pod {
	return &corev1.Pod{Status: corev1.PodStatus{Phase: corev1.PodRunning}}
}

func TestPodGone_PhanLoai(t *testing.T) {
	nowish := metav1.Now()
	dangXoa := podChay()
	dangXoa.DeletionTimestamp = &nowish

	ca := []struct {
		ten     string
		pod     *corev1.Pod
		err     error
		muon    bool
		muonLoi bool
	}{
		{ten: "pod đang chạy ⇒ CÒN", pod: podChay(), muon: false},
		{
			// ⛔ CA TRUNG TÂM. Pod bị xoá giữ NGUYÊN phase Running suốt grace
			// 30s; chỉ deletionTimestamp nói ra. Một phép kiểm chỉ đọc phase sẽ
			// trả "còn sống" ở đúng cửa sổ mà hàm này tồn tại để bắt.
			ten: "pod đang bị xoá (phase vẫn Running) ⇒ MẤT",
			pod: dangXoa, muon: true,
		},
		{ten: "phase Failed ⇒ MẤT", pod: &corev1.Pod{Status: corev1.PodStatus{Phase: corev1.PodFailed}}, muon: true},
		{ten: "phase Succeeded ⇒ MẤT", pod: &corev1.Pod{Status: corev1.PodStatus{Phase: corev1.PodSucceeded}}, muon: true},
		{
			ten:  "NotFound ⇒ MẤT, và KHÔNG phải lỗi",
			err:  apierrors.NewNotFound(schema.GroupResource{Resource: "pods"}, "sandbox-x"),
			muon: true,
		},
		{
			// Lỗi khác NotFound KHÔNG được đọc thành "mất". Đây đúng lớp bẫy
			// `probe-failing-open-makes-ac-lie`: lỗi của LỆNH bị đọc thành kết
			// quả của HỆ.
			ten:  "apiserver 503 ⇒ trả lỗi để người gọi fail-open",
			err:  errors.New("etcdserver: request timed out"),
			muon: false, muonLoi: true,
		},
	}

	for _, c := range ca {
		t.Run(c.ten, func(t *testing.T) {
			got, err := podGone(c.pod, c.err)
			if (err != nil) != c.muonLoi {
				t.Fatalf("err = %v, muốn có lỗi = %v", err, c.muonLoi)
			}
			if got != c.muon {
				t.Fatalf("podGone = %v, muốn %v", got, c.muon)
			}
		})
	}
}
