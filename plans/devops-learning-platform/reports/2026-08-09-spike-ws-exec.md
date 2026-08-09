# Spike 1.A-1 — WS ⇄ pods/exec: báo cáo gotcha

**Ngày:** 2026-08-09 · **Rủi ro khử:** R1 (score 20 — cao nhất dự án) · **Task:** phase-1 §1.A-1 (S1–S4)
**Code:** [`services/terminal-gateway/cmd/spike-exec/`](../../../services/terminal-gateway/cmd/spike-exec/)
**Môi trường đo:** cluster lab `debian-sandbox` K8s **v1.34.10** (kubeadm 1-node), containerd 2.3.3, RuntimeClass `sysbox-runc`, pod `spike-target` trong `dlp-sandbox` (image `nestybox/ubuntu-noble-systemd-docker`, `uid_map` offset `2945581056` — user-ns thật). Client Go 1.26.5 chạy từ máy dev (Windows) và từ Host A (linux/amd64).

> Mục tiêu spike là **khử rủi ro**, không phải viết code thật. Code spike xấu được; báo cáo này mới là sản phẩm. Gateway thật (1.C) viết lại phần bridge kèm authz + limit.

---

## Kết luận một dòng

**Gate 1.A-1 XANH.** `NewFallbackExecutor(ws, spdy)` attach được vào pod Sysbox qua **WebSocket `v5.channel.k8s.io`** (SPDY không bao giờ được dùng tới); vim/htop vẽ đầy đủ; resize tới nơi trong **20ms**; xoá pod giữa phiên bị phát hiện sau **3.2s** không treo; `-race` sạch, không leak goroutine. **Ba giả định của plan sai và phải sửa** — xem §"Sai so với plan".

---

## 1. Sáu câu gotcha bắt buộc (S4)

### 1.1 `TerminalSizeQueue.Next()` trả `nil` nghĩa là gì

`nil` = **"queue đóng vĩnh viễn, đừng hỏi nữa"**. client-go chạy `Next()` trong một goroutine vòng lặp riêng và **thoát hẳn vòng đó** khi nhận `nil` — không có đường quay lại. Trả `nil` "tạm" lúc channel rỗng là cách **resize chết âm thầm giữa phiên**: WS vẫn sống, người dùng vẫn gõ được, nhưng mọi lần kéo cửa sổ sau đó rơi vào hư không và chỉ lộ khi ai đó phàn nàn "vim vẽ sai từ lúc nào".

Cách đúng (đã dùng trong [`bridge.go`](../../../services/terminal-gateway/cmd/spike-exec/bridge.go)): `Next()` **block** trên channel, chỉ trả `nil` khi `ctx` đóng (kết nối chết thật).

```go
func (q *sizeQueue) Next() *remotecommand.TerminalSize {
	select {
	case s, ok := <-q.ch:
		if !ok { return nil }
		return &s
	case <-q.ctx.Done():
		return nil          // chỉ ở đây — không phải khi "tạm hết hàng"
	}
}
```

**Cho G6:** coalesce phải làm ở phía *push* (buffer 1, ghi đè giá trị cũ), không phải bằng cách trả `nil` khi rỗng.

### 1.2 `tty=true` kèm `stderr=true` — không ai từ chối, stderr bị bỏ trong im lặng

Plan viết: *"lỗi chính xác khi set `tty=true` kèm `stderr=true` (PTY chỉ có một luồng ra, **apiserver từ chối**)"*. **Đo được thì ngược lại — không có lỗi nào cả:**

```
PROBE tty-stderr transport=ws
err NGUYÊN VĂN: <nil>
stdout buffer="RA-STDOUT\r\nRA-STDERR\r\n"
stderr buffer=""
```
(kết quả giống hệt với `transport=spdy`)

Lệnh chạy là `sh -c 'echo RA-STDOUT; echo RA-STDERR 1>&2'` với `PodExecOptions{TTY:true, Stderr:true}` và hai buffer Go **tách rời**. Byte của stderr **hiện trong buffer stdout**, buffer stderr **rỗng**, `err == nil`.

**Nguyên nhân, đọc được từ source** (`client-go@v0.34.9/tools/remotecommand/v2.go`):

```go
// :80  — set up stderr stream
if p.Stderr != nil && !p.Tty {
// :156 — copy stderr
if p.Stderr == nil || p.Tty { return }
```

`streamProtocolV2` là nền của V3→V4→**V5**, nên điều kiện này chi phối **cả** SPDY lẫn WebSocket: khi `Tty == true`, client-go **không tạo và không đọc** stream stderr, và `StreamOptions.Stderr` bị bỏ ngay trong tiến trình gọi — trước cả khi có request nào rời máy.

**Phép đo này KHÔNG xác định được tầng nào nuốt.** Nó chạy qua `StreamOptions` của client-go, nên `stderr buffer=""` đã được giải thích trọn vẹn bởi thư viện *client*; còn `RA-STDERR` hiện trong stdout là do **PTY gộp fd1/fd2 trong container** — chuyện của kernel. Không có gì trong thí nghiệm phân biệt được "kubelet ép `stderr=false`" với "client-go không đọc kênh stderr". Muốn chốt tầng thì phải bắt tay WS thủ công tới `pods/exec` (như probe `negotiate`) rồi xem kênh 3 có frame nào không — chưa làm, và không cần cho quyết định.

Ba điều **đo được**: (1) không tầng nào trả lỗi; (2) `StreamOptions.Stderr` không nhận byte nào; (3) byte stderr về trên luồng ra duy nhất.

**Vì sao im lặng nguy hiểm hơn một lỗi:** lỗi thì lộ ngay lúc dev; im lặng thì gateway có thể ship với `Stderr: someWriter` và writer đó **không bao giờ nhận byte nào** — không exception, không log, không cách phân biệt với "chương trình không ghi stderr".

**Cho G4:** đặt `Stderr` **vắng mặt** (`nil`) khi `TTY: true`, và đó phải là quyết định có comment, không phải tình cờ. Với `TTY: true` thì stderr **đã gộp vào stdout** ở tầng PTY — đúng như một terminal thật.

### 1.3 Close code thật khi vượt `SetReadLimit` → **`1009`**, không phải `4413`

Contract §6 để ngỏ. Đo trực tiếp trên `coder/websocket v1.8.15` (`probe readlimit`, limit 1024, gửi 4096):

```
server-side Read err: failed to read: websocket: message too big: read limited at 1025 bytes
client thấy close code: 1009
close reason: "read limited at 1025 bytes"
```

`SetReadLimit` **tự đóng kết nối** bằng `StatusMessageTooBig` (1009) **ngay trong tầng thư viện** — code ứng dụng không bao giờ thấy frame đó, nên không có chỗ nào để phát `4413`.

**Quyết định chốt cho contract:** dùng **`1009`** cho vi phạm read-limit. Muốn `4413` thì phải bỏ `SetReadLimit` và tự đếm byte thủ công — đổi lấy một mã đẹp hơn bằng việc tự viết lại phần bảo vệ bộ nhớ mà thư viện đã làm đúng. Không đáng. `docs/ws-terminal-protocol.md` §6 đã cập nhật theo kết quả này.

*Lưu ý cho G8:* `4429` (rate-limit theo byte/s) **vẫn là mã ứng dụng** vì nó do code tự đếm và tự đóng — chỉ mỗi read-limit là của thư viện.

### 1.4 Lấy exit code → `exec.CodeExitError`

```
PROBE exitcode transport=ws
err type=exec.CodeExitError err=command terminated with exit code 7
exitCode=7 (trích được=true)
```

Kiểu cụ thể là `k8s.io/client-go/util/exec.CodeExitError`. Spike trích bằng **interface** thay vì import kiểu cứng — chính cách này chứng minh kiểu thật:

```go
var exitErr interface { error; ExitStatus() int }
if errors.As(err, &exitErr) { return exitErr.ExitStatus(), true }
```

**Cho G4/G5:** dùng `errors.As` với interface `ExitStatus() int`. Một lỗi **không** khớp interface này là lỗi hạ tầng (dial fail, apiserver 4xx/5xx, mạng đứt) → phải map sang `4500`, **không** phải `exit`.

### 1.5 Half-close stdin — hoạt động trên **cả** WS(v5) và SPDY(v4)

```
PROBE stdin-eof transport=ws   dur=335ms err=<nil> stdout="5\n"  → wc thấy EOF
PROBE stdin-eof transport=spdy dur=383ms err=<nil> stdout="5\n"  → wc thấy EOF
```

Phép thử: `exec wc -c` với stdin = `"hello"` (5 byte). `wc` **chỉ in kết quả khi thấy EOF**, nên "5" chứng minh EOF truyền tới tiến trình; treo tới timeout sẽ chứng minh ngược lại.

Không có khác biệt v4/v5 ở tình huống này. (v5 có thêm kênh `close-stream` cho half-close *có chọn lọc*; với terminal ta không dùng — stdin đóng cùng lúc kết nối đóng.)

### 1.6 Transport nào thắng → **WebSocket, `v5.channel.k8s.io`**

Đo bằng cách bắt tay WS **thủ công** tới `pods/exec` và đọc subprotocol apiserver chọn, thay vì suy luận từ "executor chạy được":

```
PROBE negotiate: bắt tay WS THÀNH CÔNG
  subprotocol apiserver chọn: "v5.channel.k8s.io"
```

Client chào cả `v5.channel.k8s.io` và `v4.channel.k8s.io`; apiserver **chọn v5**. Nghĩa là trong `NewFallbackExecutor(ws, spdy, httpstream.IsUpgradeFailure)`, nhánh WS luôn thành công và **SPDY không bao giờ chạy** trên cluster này.

Thời gian một lượt `exec` không-TTY (`echo hello`, gồm cả bắt tay TLS + auth):

| transport | thời gian |
|---|---|
| `ws` | 405.8ms |
| `spdy` | 442.1ms |
| `fallback` | 404.6ms |

`fallback` ≈ `ws` — xác nhận thêm rằng không có lượt thử-rồi-hỏng nào bị trả giá. **Giữ `fallback`**: SPDY là lưới an toàn miễn phí cho cluster cũ hơn hoặc apiserver tắt feature gate WS, và nó không tốn gì khi WS chạy được.

---

## 2. Tiêu chí xanh Gate 1.A-1 — bằng chứng từng mục

| # | Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | `fallback` attach được vào pod Sysbox trong `dlp-sandbox` | ✅ | `dial exec transport=fallback size=120x30` → shell tương tác; subprotocol `v5.channel.k8s.io` |
| 2 | `vim` + `htop` vẽ đầy đủ, không rác ANSI | ✅ | vim vào/ra alternate screen (`1049h`/`1049l`) và **tự báo `columns=120`**; htop: alt-screen + **SGR màu thật** (`ESC[…m`) + **8852 byte** ANSI một màn hình; sau cả hai, `stty size` vẫn `30 120` |
| 3 | Kéo cửa sổ → `stty size` khớp < 1s | ✅ | resize 132×40 → PTY khớp sau **13.2ms** (poll 1ms nên đây là số đo, không phải nhịp poll). SIGWINCH thật (pty trên Host A): 100×30 → 160×45 khớp |
| 4 | `exit` → WS đóng sạch, thoát 0, `-race` sạch, không leak goroutine | ⚠️ **có điều kiện** | control `{"type":"exit","exitCode":0}` + close **1000**; **0** DATA RACE trong toàn bộ log bridge chạy `-race`; goroutine sau mỗi phiên đều về **2** qua 6 phiên. **Nhưng phép đo này có điểm mù** — xem §3.4 |
| 5 | Xoá pod giữa phiên → báo lỗi rõ, không treo | ⚠️ **có điều kiện** | Phát hiện sau **3.2s**, `exit 137`, không treo. **Nhưng** bridge spike báo nhầm thành "thoát bình thường" — xem §3.1 |

**Kịch bản `-script scenario`** (chạy dưới `-race` cả hai đầu) — 5/5 PASS:

```
[PASS] init 120x30 → stty size
[PASS] resize 132x40 < 1s — độ trễ 13.1576ms (sàn đo = bước poll 1ms)
[PASS] bão 200 resize không chết, giữ giá trị cuối — sau 903ms
[PASS] UTF-8 đa byte round-trip (shell chạy thật, không phải echo tty)
[PASS] exit → control exit + close 1000
```

**Kịch bản `-script tui`** — 6/6 PASS (vim/htop, xem bảng trên).

**S3 — client tty thật** ([`drive_tty.py`](../../../services/terminal-gateway/cmd/spike-exec/drive_tty.py) chạy trên Host A, pty do `pty.fork()` cấp, resize bằng `ioctl(TIOCSWINSZ)`): init lấy kích thước từ pty thật → `30 100` trong pod; đổi cửa sổ → SIGWINCH → `45 160`; `exit` → close 1000. Đây là đường đi *người thật gõ*, không phải mô phỏng bằng control message.

---

## 3. Sai so với plan — ba thứ phải sửa

### 3.1 ⚠️ CHẶN G4/G5: `exit 137` không phân biệt được "pod bị xoá" với "người dùng gõ exit"

Khi xoá pod giữa phiên, `StreamWithContext` trả về một `CodeExitError` với `ExitStatus() == 137` (SIGKILL). Bridge spike — vốn coi *mọi* `CodeExitError` là thoát bình thường — đã phát:

```
controls=[{"type":"exit","exitCode":137}]   close_code=1000
```

Theo contract §6, `1000` nghĩa là **"shell thoát bình thường, FE KHÔNG retry"**. Nhưng pod biến mất phải là **`4404 SESSION_GONE`**. Với hành vi này, sinh viên bị reap giữa bài sẽ thấy terminal đóng êm như thể họ tự gõ `exit`, và FE không có tín hiệu nào để hiện "phiên đã kết thúc".

**Không thể phân biệt bằng exit code**: `137` cũng chính là thứ nhận được khi tiến trình trong pod bị `kill -9` một cách hợp lệ.

**Yêu cầu cho G4/G5 (bắt buộc):** khi stream kết thúc với exit code ∈ {137, 143} **hoặc** với lỗi hạ tầng, gateway phải **tra Redis `session:{id}`** trước khi chọn close code:
- key mất / `status ∈ {EXPIRED, REAPED}` → **`4404`**
- session còn sống → coi là thoát thật → `1000`

Đây là một lượt đọc Redis trên **đường đóng** (không phải đường nóng), gateway đã có sẵn client Redis cho authz (D2) nên không thêm phụ thuộc nào.

### 3.2 Bão resize cần ~900ms để lắng — không phải tức thì

Đo: 201 control resize gửi liên tiếp → PTY phản ánh giá trị cuối sau **902ms** (lần đo đầu dùng ngưỡng 700ms nên FAIL; poll tới khi khớp thì PASS). Một resize đơn lẻ chỉ mất **20ms**.

Nghĩa là mỗi resize **đi tới apiserver riêng lẻ** dù phía gateway đã coalesce ở buffer 1 — `Next()` được gọi liên tục nên hầu hết giá trị trung gian vẫn lọt qua. Coalesce buffer-1 **giảm** chứ không **chặn** lưu lượng.

**Cho G6 + F4:** debounce phía FE (contract §4: ~50ms) là thứ thật sự chặn bão, không phải coalesce phía server. Giữ cả hai; đừng bỏ debounce FE vì "server đã coalesce rồi". Ngưỡng AC "resize khớp < 1s" đúng cho thao tác người thật (kéo cửa sổ = một chuỗi ngắn), nhưng test tổng hợp bắn 200 frame phải **poll**, không sleep cứng.

### 3.3 Log `Unhandled Error` của client-go là đường THÀNH CÔNG, không phải lỗi

Mỗi phiên kết thúc bình thường đều in:

```
E0809 16:16:13 v2.go:104] "Unhandled Error" err="failed to get reader: received close frame:
  status = StatusNormalClosure and reason = \"exit 0\"" logger="UnhandledError"
```

Mức `E` (error) của klog, nhưng đây chính là lúc **exit 0 thành công**. Để nguyên thì log production đầy "Unhandled Error" ở đúng đường đi hạnh phúc, và cảnh báo thật chìm nghỉm.

**Cho G10/G11:** cấu hình klog của client-go (hoặc bọc bằng `utilruntime.ErrorHandlers`) để hạ mức dòng này xuống debug. Đừng để nguyên rồi dạy nhau "lỗi đó bỏ qua được" — đó là cách dashboard mất khả năng phân biệt.

---

### 3.4 ⚠️ CHẶN G4: `stdinR` không đóng ⇒ `stdinW.Write` chặn vĩnh viễn (phát hiện khi review đối kháng)

Bản spike đầu để `stdinR` (đầu đọc của `io.Pipe`) không bao giờ `Close`. Đọc `client-go@v0.34.9/tools/remotecommand/v2.go`: goroutine `copyStdin` **không** nằm trong `WaitGroup` của executor, nên khi shell thoát nó ghi vào stream đã đóng, lỗi, rồi **chết** — từ lúc đó pipe không còn reader nào. Frame binary tiếp theo làm `stdinW.Write` **chặn vĩnh viễn**, và goroutine đó không nằm trong `c.Read` nên `cancel()` lẫn `CloseNow()` đều không gỡ được.

Kịch bản đời thường: sinh viên gõ thêm phím trong lúc shell đang thoát (gõ `exit` rồi gõ tiếp). Mỗi lần rò một goroutine + một kết nối WS, vĩnh viễn.

**Vì sao phép đo "0 leak" không thấy:** harness gửi `exit\r` rồi **ngừng gõ hẳn**, nên chưa từng chạm đường này. Đó cũng là bài học về giới hạn của `runtime.NumGoroutine()` trước/sau: nó đo **sau** khi handler trả về nhưng **trước** khi các `defer` chạy, đếm toàn process nên vô nghĩa khi có phiên đồng thời, và không thấy fd/pipe/bộ nhớ. Phần mạnh nhất của bằng chứng thực ra là "về 2 qua 6 phiên liên tiếp" — **xu hướng không tăng**, không phải một con số.

**Đã sửa trong spike** (`defer stdinR.Close()`), và **G4 phải giữ**: đóng đầu đọc làm mọi `Write` sau đó trả `io.ErrClosedPipe` ngay. Với gateway thật nên dùng `go.uber.org/goleak` thay vì đếm tay.

## 4. Chốt cho lane gateway (1.C)

| Quyết định | Giá trị đo được |
|---|---|
| Thư viện WS | `github.com/coder/websocket v1.8.15` — nhiều goroutine `Write` an toàn (bridge có 2 goroutine ghi: stdout PTY + control), **một reader tại một thời điểm** ⇒ kiến trúc một-goroutine-đọc là bắt buộc |
| client-go | `v0.34.9` (khớp minor cluster 1.34.10; `v0.34.10` kéo `protobuf v1.36.12-pre` không khớp orchestrator ⇒ chốt `.9` để giữ một version protobuf toàn repo) |
| Executor | `NewFallbackExecutor(ws, spdy, httpstream.IsUpgradeFailure)` — WS thắng, SPDY chưa từng chạy |
| Stderr khi TTY | **vắng mặt** (`nil`). Đặt vào là bị nuốt im lặng (§1.2) |
| Read limit | `SetReadLimit` → tự đóng **1009**, không phải `4413` (§1.3) |
| Close khi pod biến mất | phải tra Redis rồi mới chọn `4404` vs `1000` (§3.1) |
| `TerminalSizeQueue` | `Next()` block; `nil` chỉ khi ctx đóng (§1.1) |
| `io.Pipe` cho stdin | `defer stdinR.Close()` — thiếu là rò goroutine vĩnh viễn (§3.4) |
| Log | không nội suy dữ liệu client chưa validate; tên pod ở gateway đến từ **Redis**, không từ URL |

## 5. Cách chạy lại

```bash
cd services/terminal-gateway
export KUBECONFIG=…                       # kubeconfig của cluster lab

go run ./cmd/spike-exec -probe readlimit                       # không cần cluster
go run ./cmd/spike-exec -pod spike-target -probe negotiate     # subprotocol thắng
go run ./cmd/spike-exec -pod spike-target -probe tty-stderr    # §1.2
go run ./cmd/spike-exec -pod spike-target -probe exitcode      # §1.4
go run ./cmd/spike-exec -pod spike-target -probe stdin-eof     # §1.5
for t in ws spdy fallback; do
  go run ./cmd/spike-exec -pod spike-target -transport $t -oneshot 'echo hello'
done

# bridge + hai kịch bản tự chấm (chạy -race cả hai đầu)
go run -race ./cmd/spike-exec -pod spike-target -cmd bash -listen 127.0.0.1:8090 &
go run -race ./cmd/spike-exec -script scenario -connect-url ws://127.0.0.1:8090/spike/spike-target
go run -race ./cmd/spike-exec -script tui      -connect-url ws://127.0.0.1:8090/spike/spike-target

# client tty thật (unix): gõ tay, hoặc lái bằng pty script
go run ./cmd/spike-exec -connect ws://127.0.0.1:8090/spike/spike-target
```

**Pod đích:** `spike-target` là pod dùng-rồi-bỏ, tạo bằng spec y hệt `infra/host/bench-sandbox-provision.sh` (đã qua 8 CEL của VAP). `vim`/`htop` **không có sẵn** trong image `nestybox/…` và NetworkPolicy default-deny chặn `apt-get`, nên spike cài bằng `kubectl cp` các `.deb` tải sẵn trên Host A. Gói `vim-tiny` **không có `+eval`** (mọi `:echo` trả `E319`) — dùng `:set columns?` để hỏi kích thước. Image thật (1.E) cài vim đầy đủ nên vấn đề này không theo sang.

## 6. Việc kéo theo

- [ ] **G4/G5** — tra Redis trước khi chọn close code khi stream kết thúc bất thường (§3.1). Đây là mục **chặn**, không phải nice-to-have.
- [ ] **G10/G11** — hạ mức log `Unhandled Error` của client-go (§3.3).
- [x] `docs/ws-terminal-protocol.md` §6 — chốt `1009` cho read-limit (§1.3). *Đã cập nhật trong PR này.*
- [ ] **1.E** — image phải có `vim` đầy đủ (không `vim-tiny`) nếu AC còn dùng `:echo`.
