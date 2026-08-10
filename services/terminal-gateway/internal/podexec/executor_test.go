package podexec

import (
	"net/url"
	"strings"
	"testing"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// newTestClientset dựng clientset THẬT trỏ vào một host không tồn tại.
//
// Không có I/O nào xảy ra: `RESTClient().Post()…URL()` chỉ dựng URL trong bộ
// nhớ. Dùng clientset thật thay vì fake để phép kiểm chạy qua ĐÚNG đường mã hoá
// tham số mà production dùng (`scheme.ParameterCodec`) — một fake có thể serialize
// khác đi và làm test khẳng định một chuỗi không bao giờ xuất hiện thật.
func newTestClientset(t *testing.T) kubernetes.Interface {
	t.Helper()
	cs, err := kubernetes.NewForConfig(&rest.Config{Host: "https://apiserver.test"})
	if err != nil {
		t.Fatalf("dựng clientset: %v", err)
	}
	return cs
}

func execQuery(t *testing.T, u *url.URL) url.Values {
	t.Helper()
	q, err := url.ParseQuery(u.RawQuery)
	if err != nil {
		t.Fatalf("parse query: %v", err)
	}
	return q
}

// ⛔ `stderr=false` khi `tty=true` — quyết định có số đo đứng sau.
//
// Spike đo: đặt `Stderr: true` cùng `TTY: true` KHÔNG sinh lỗi ở bất kỳ tầng nào,
// và writer truyền vào KHÔNG BAO GIỜ nhận byte (`v2.go:80`: `if p.Stderr != nil
// && !p.Tty`). Plan bản cũ viết "apiserver từ chối" — sai, và im lặng nguy hiểm
// hơn từ chối: không exception, không log, không cách phân biệt với "chương
// trình không ghi stderr". Ca này ràng buộc quyết định đó vào một phép kiểm.
func TestExecURLDatDungCoTTYVaKhongCoStderr(t *testing.T) {
	u := execURL(newTestClientset(t), Target{PodName: "sandbox-x1", Namespace: "dlp-sandbox"},
		[]string{"tmux", "new-session", "-A", "-s", "dlp"})
	q := execQuery(t, u)

	for _, param := range []string{"tty", "stdin", "stdout"} {
		if got := q.Get(param); got != "true" {
			t.Errorf("%s=%q, muốn \"true\"", param, got)
		}
	}

	// ⚠ `stderr` VẮNG HẲN khỏi query chứ không phải `stderr=false`, và đó là
	// hành vi đúng: `PodExecOptions.Stderr` mang tag `omitempty`, nên giá trị
	// zero không được mã hoá. Vắng ⇒ apiserver decode về zero value ⇒ false.
	//
	// Khẳng định theo dạng "KHÔNG được bật" thay vì "phải bằng chuỗi 'false'":
	// ràng buộc thật là ngữ nghĩa, và một test đòi đúng chuỗi "false" sẽ dụ
	// người sau đi "sửa" encoding cho khớp test.
	if got := q.Get("stderr"); got == "true" {
		t.Errorf("stderr=%q — bật stderr cùng TTY thì writer KHÔNG BAO GIỜ nhận byte "+
			"và không có lỗi nào báo (client-go v2.go:80)", got)
	}
}

// Đích của exec phải là ĐÚNG pod/namespace được truyền vào — và ở production,
// hai giá trị đó tới từ hash `session:{id}` trong Redis, không từ URL của client.
func TestExecURLTroDungPodVaNamespace(t *testing.T) {
	u := execURL(newTestClientset(t), Target{PodName: "sandbox-x1", Namespace: "dlp-sandbox"},
		[]string{"sh"})

	if !strings.Contains(u.Path, "/namespaces/dlp-sandbox/pods/sandbox-x1/exec") {
		t.Fatalf("path = %q — không trỏ đúng pod/namespace", u.Path)
	}
}

// Lệnh đi vào URL nguyên vẹn theo THỨ TỰ argv. Ghép sai thứ tự thì `tmux
// new-session -A -s dlp` biến thành một lệnh khác, và triệu chứng là "reconnect
// không vào lại được phiên cũ" — cách nguyên nhân rất xa.
func TestExecURLGiuNguyenThuTuArgv(t *testing.T) {
	cmd := []string{"tmux", "new-session", "-A", "-s", "dlp"}
	u := execURL(newTestClientset(t), Target{PodName: "p", Namespace: "ns"}, cmd)

	got := execQuery(t, u)["command"]
	if len(got) != len(cmd) {
		t.Fatalf("command = %q, muốn %q", got, cmd)
	}
	for i := range cmd {
		if got[i] != cmd[i] {
			t.Fatalf("command = %q, muốn %q", got, cmd)
		}
	}
}
