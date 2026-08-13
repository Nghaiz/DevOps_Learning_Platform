// spike-exec — spike 1.A-1: WS ⇄ pods/exec (rủi ro #1 toàn dự án, score 20).
//
// ĐÂY LÀ CODE SPIKE. Mục tiêu là KHỬ RỦI RO và đo gotcha, không phải code
// production — cái phải đẹp là báo cáo (plans/reports/2026-08-09-spike-ws-exec.md).
// Gateway thật (1.C) sẽ viết lại phần bridge với authz + limit đầy đủ.
//
// Các mode:
//
//	-oneshot "cmd"   exec sh -c cmd (không TTY), in stdout/stderr + thời gian — S1/S2
//	-probe X         đo gotcha: tty-stderr | exitcode | stdin-eof | readlimit — S4
//	-listen :8090    server WS bridge /spike/{pod} — S3
//	-connect URL     client tty thô + SIGWINCH nối vào bridge (unix-only) — S3
//
// Transport chọn bằng -transport=ws|spdy|fallback (mặc định fallback — khuôn
// mẫu kubectl: WS chính, SPDY lưới an toàn).
package main

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/remotecommand"
	k8swebsocket "k8s.io/client-go/transport/websocket"
	"k8s.io/streaming/pkg/httpstream"
)

var (
	flagNS        = flag.String("ns", "dlp-sandbox", "namespace của pod")
	flagPod       = flag.String("pod", "", "tên pod exec vào")
	flagTransport = flag.String("transport", "fallback", "ws | spdy | fallback")
	flagCmd       = flag.String("cmd", "/bin/bash", "lệnh exec cho bridge/tty")
	flagOneshot   = flag.String("oneshot", "", "chạy sh -c <arg> không TTY rồi thoát")
	flagProbe     = flag.String("probe", "", "tty-stderr | exitcode | stdin-eof | readlimit")
	flagListen    = flag.String("listen", "", "địa chỉ server bridge, vd :8090")
	flagConnect   = flag.String("connect", "", "URL WS của bridge, vd ws://127.0.0.1:8090/spike/spike-target")
)

func main() {
	flag.Parse()
	log.SetFlags(log.Ltime | log.Lmicroseconds)

	switch {
	case *flagProbe == "readlimit":
		// Không cần cluster — đo hành vi SetReadLimit của coder/websocket.
		probeReadLimit()
		return
	case *flagScript != "":
		if err := runScriptClient(*flagScript, *flagScriptURL); err != nil {
			log.Fatalf("script client: %v", err)
		}
		return
	case *flagConnect != "":
		if err := runClient(*flagConnect); err != nil {
			log.Fatalf("client: %v", err)
		}
		return
	}

	cfg, err := kubeConfig()
	if err != nil {
		log.Fatalf("kubeconfig: %v", err)
	}
	cs, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		log.Fatalf("clientset: %v", err)
	}

	switch {
	case *flagOneshot != "":
		runOneshot(cfg, cs, *flagOneshot)
	case *flagProbe != "":
		runProbe(cfg, cs, *flagProbe)
	case *flagListen != "":
		runBridge(cfg, cs, *flagListen)
	default:
		log.Fatal("cần một trong: -oneshot | -probe | -listen | -connect (xem -h)")
	}
}

func kubeConfig() (*rest.Config, error) {
	// In-cluster trước (đúng tư thế gateway thật), fallback kubeconfig cho dev.
	if cfg, err := rest.InClusterConfig(); err == nil {
		return cfg, nil
	}
	rules := clientcmd.NewDefaultClientConfigLoadingRules()
	return clientcmd.NewNonInteractiveDeferredLoadingClientConfig(rules, &clientcmd.ConfigOverrides{}).ClientConfig()
}

// execURL dựng URL pods/exec với đủ tham số stream.
func execURL(cs *kubernetes.Clientset, ns, pod string, command []string, tty, stdin, stdout, stderr bool) *url.URL {
	return cs.CoreV1().RESTClient().Post().
		Resource("pods").Namespace(ns).Name(pod).SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Command: command,
			Stdin:   stdin,
			Stdout:  stdout,
			Stderr:  stderr,
			TTY:     tty,
		}, scheme.ParameterCodec).URL()
}

// newExecutor là điểm chốt của S2: WS là đường chính, SPDY là lưới an toàn,
// nối bằng NewFallbackExecutor đúng khuôn mẫu kubectl exec (K8s 1.34:
// RemoteCommand-over-WebSockets beta bật mặc định, v5.channel.k8s.io).
func newExecutor(cfg *rest.Config, u *url.URL, transport string) (remotecommand.Executor, error) {
	switch transport {
	case "spdy":
		return remotecommand.NewSPDYExecutor(cfg, "POST", u)
	case "ws":
		return remotecommand.NewWebSocketExecutor(cfg, "POST", u.String())
	case "fallback":
		wsExec, err := remotecommand.NewWebSocketExecutor(cfg, "POST", u.String())
		if err != nil {
			return nil, fmt.Errorf("ws executor: %w", err)
		}
		spdyExec, err := remotecommand.NewSPDYExecutor(cfg, "POST", u)
		if err != nil {
			return nil, fmt.Errorf("spdy executor: %w", err)
		}
		return remotecommand.NewFallbackExecutor(wsExec, spdyExec, httpstream.IsUpgradeFailure)
	default:
		return nil, fmt.Errorf("transport %q không hợp lệ (ws|spdy|fallback)", transport)
	}
}

func requirePod() string {
	if *flagPod == "" {
		log.Fatal("-pod bắt buộc cho mode này")
	}
	return *flagPod
}

// runOneshot: S1 "exec chạy được" + S2 "đo và so ba transport".
func runOneshot(cfg *rest.Config, cs *kubernetes.Clientset, command string) {
	pod := requirePod()
	u := execURL(cs, *flagNS, pod, []string{"/bin/sh", "-c", command}, false, false, true, true)
	exec, err := newExecutor(cfg, u, *flagTransport)
	if err != nil {
		log.Fatalf("executor: %v", err)
	}
	var stdout, stderr bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	t0 := time.Now()
	err = exec.StreamWithContext(ctx, remotecommand.StreamOptions{Stdout: &stdout, Stderr: &stderr})
	dur := time.Since(t0)

	fmt.Printf("transport=%s dur=%s err=%v\nstdout=%q\nstderr=%q\n", *flagTransport, dur, err, stdout.String(), stderr.String())
	if err != nil {
		os.Exit(1)
	}
}

func runProbe(cfg *rest.Config, cs *kubernetes.Clientset, probe string) {
	pod := requirePod()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	switch probe {
	case "tty-stderr":
		// Gotcha S4 #2: PTY chỉ có MỘT luồng ra. tty=true + stderr=true thì ai
		// từ chối, nói gì? Và nếu KHÔNG ai từ chối: byte của stderr đi đâu?
		u := execURL(cs, *flagNS, pod, []string{"/bin/sh", "-c", "echo RA-STDOUT; echo RA-STDERR 1>&2"}, true, true, true, true)
		exec, err := newExecutor(cfg, u, *flagTransport)
		if err != nil {
			log.Fatalf("executor: %v", err)
		}
		var out, errBuf bytes.Buffer
		err = exec.StreamWithContext(ctx, remotecommand.StreamOptions{
			Stdin: strings.NewReader(""), Stdout: &out, Stderr: &errBuf, Tty: true,
		})
		fmt.Printf("PROBE tty-stderr transport=%s\nerr NGUYÊN VĂN: %v\nstdout buffer=%q\nstderr buffer=%q\n",
			*flagTransport, err, out.String(), errBuf.String())

	case "exitcode":
		// Gotcha S4: lấy exit code qua exec.CodeExitError.
		u := execURL(cs, *flagNS, pod, []string{"/bin/sh", "-c", "exit 7"}, false, false, true, true)
		exec, err := newExecutor(cfg, u, *flagTransport)
		if err != nil {
			log.Fatalf("executor: %v", err)
		}
		err = exec.StreamWithContext(ctx, remotecommand.StreamOptions{Stdout: os.Stdout, Stderr: os.Stderr})
		code, ok := exitCode(err)
		fmt.Printf("PROBE exitcode transport=%s\nerr type=%T err=%v\nexitCode=%d (trích được=%v)\n", *flagTransport, err, err, code, ok)

	case "stdin-eof":
		// Gotcha S4 #5: half-close stdin — v5 (WS) có kênh close-stream, SPDY thì sao?
		// `wc -c` chỉ thoát khi THẤY EOF trên stdin. Treo = EOF không truyền được.
		u := execURL(cs, *flagNS, pod, []string{"wc", "-c"}, false, true, true, true)
		exec, err := newExecutor(cfg, u, *flagTransport)
		if err != nil {
			log.Fatalf("executor: %v", err)
		}
		var out bytes.Buffer
		shortCtx, cancel2 := context.WithTimeout(ctx, 10*time.Second)
		defer cancel2()
		t0 := time.Now()
		err = exec.StreamWithContext(shortCtx, remotecommand.StreamOptions{
			Stdin: strings.NewReader("hello"), Stdout: &out, Stderr: os.Stderr,
		})
		fmt.Printf("PROBE stdin-eof transport=%s dur=%s err=%v stdout=%q\n", *flagTransport, time.Since(t0), err, out.String())
		if errors.Is(shortCtx.Err(), context.DeadlineExceeded) {
			fmt.Println("KẾT LUẬN: TREO — EOF stdin KHÔNG truyền tới tiến trình (wc không bao giờ thấy EOF)")
		} else if strings.TrimSpace(out.String()) == "5" {
			fmt.Println("KẾT LUẬN: half-close stdin HOẠT ĐỘNG — wc thấy EOF, đếm đủ 5 byte")
		}

	case "negotiate":
		// AC bắt buộc: "report ghi rõ transport thắng + subprotocol thương lượng".
		// Bắt tay WS thủ công tới pods/exec để ĐỌC subprotocol apiserver chọn,
		// thay vì suy luận từ việc executor chạy được.
		u := execURL(cs, *flagNS, pod, []string{"/bin/sh", "-c", "exit 0"}, true, true, true, false)
		rt, holder, err := k8swebsocket.RoundTripperFor(cfg)
		if err != nil {
			log.Fatalf("RoundTripperFor: %v", err)
		}
		req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
		if err != nil {
			log.Fatalf("new request: %v", err)
		}
		// Chào cả v5 lẫn v4 để thấy apiserver 1.34 ưu tiên cái nào.
		conn, err := k8swebsocket.Negotiate(rt, holder, req, "v5.channel.k8s.io", "v4.channel.k8s.io")
		if err != nil {
			fmt.Printf("PROBE negotiate: bắt tay WS THẤT BẠI: %v\n", err)
			fmt.Println("  ⇒ fallback sẽ rơi về SPDY")
		} else {
			fmt.Printf("PROBE negotiate: bắt tay WS THÀNH CÔNG\n  subprotocol apiserver chọn: %q\n", conn.Subprotocol())
			_ = conn.Close()
		}

	default:
		log.Fatalf("probe %q không hợp lệ (tty-stderr | exitcode | stdin-eof | readlimit | negotiate)", probe)
	}
	fmt.Printf("goroutines lúc thoát: %d\n", runtime.NumGoroutine())
}

// exitCode trích exit code từ lỗi StreamWithContext trả về.
// Kiểu thật đo được ghi trong report — dùng interface ExitStatus() thay vì
// import cứng k8s.io/client-go/util/exec để chính spike XÁC MINH kiểu nào.
func exitCode(err error) (int, bool) {
	if err == nil {
		return 0, true
	}
	var exitErr interface {
		error
		ExitStatus() int
	}
	if errors.As(err, &exitErr) {
		return exitErr.ExitStatus(), true
	}
	return -1, false
}
