# 1.C-2 — chứng minh cầu exec trên cluster thật

**Ngày:** 2026-08-10 · **Chặng:** phase-1 §1.C-2 (G4+G5+G6) · **Cluster:** lab `debian-sandbox`, K8s v1.34.10 (kubeadm 1-node), RuntimeClass `sysbox-runc`
**Gateway đo:** `ghcr.io/nghaiz/dlp-terminal-gateway:dev-4030577` (side-load, `imagePullPolicy: Never`)

## Vì sao báo cáo này tồn tại

Chặng 1.C-1 đóng lại với một món nợ ghi rõ: *"chặng này chứng minh LOGIC, không chứng minh TÍCH HỢP"*. Test + kiểm đột biến chỉ khẳng định mã làm đúng thứ mã tự nhận; chúng không khẳng định một con người gõ được lệnh trong một pod thật. Báo cáo này đóng vế đó cho phần cầu exec.

## Cách đo — và điều gì KHÔNG bị giả lập

Session được tạo qua **đúng gRPC `CreateSession` của orchestrator**, nên pod là pod thật vừa claim từ warm-pool. KHÔNG seed hash `session:{id}` bằng tay.

**Thứ duy nhất bị thay: bên PHÁT token.** G12 chưa có nên `apps/web` chưa mint được cookie `dlp_sandbox`; công cụ đo tự sinh một cặp Ed25519, phục vụ JWKS của riêng nó, và gateway được trỏ vào JWKS đó bằng `--set gateway.env.jwksUrl`. Mọi thứ khác — chín bước authz, cầu exec, apiserver, PTY, tmux, Redis — chạy nguyên vẹn.

Cấu hình lab **đã được trả về mặc định kế thừa ngay sau khi đo** (`jwksUrl=''` ⇒ `http://platform-web:3000/api/auth/jwks`, `tokenIssuer=''` ⇒ `web.env.betterAuthUrl`), xác nhận bằng `kubectl get deploy -o jsonpath`.

## Kết quả — chín phép kiểm

| # | Phép kiểm | Kết quả |
|---|---|---|
| 1 | `CreateSession` thật | `session=9c5a18c80d0fdc479162cd7575e31e45`, `pod=sandbox-7d69d4975fe5`, `status=SESSION_STATUS_CLAIMED` |
| 2 | control `ready` | `podName` khớp pod orchestrator vừa claim · `expiresAt=2026-08-10T13:22:08Z` (RFC3339) · `maxFrameBytes=32768` |
| 3 | **gõ lệnh thật** | `echo BANG-CHUNG-1786366329481807665` → pod trả lại đúng marker |
| 4 | **`stty size` trong pod** | **`34 120`** — khớp TUYỆT ĐỐI `cols`/`rows` của frame `init`, không lệch 1 |
| 5 | `tmux ls` | thấy session `dlp` — gateway attach qua tmux (D3) |
| 6 | đóng WS lần 1 | sạch |
| 7 | nối lại | **thành công**, không dính 429 ⇒ trần 1 WS chặn *đồng thời*, không chặn *nối lại* |
| 8 | `tmux capture-pane -p -S -50` | **vẫn thấy dấu vết ghi trước khi ngắt** ⇒ nối lại là PHIÊN THẬT, không phải shell mới |
| 9 | `ReapSession` giữa phiên | **close code `4404`**, không phải `1000` |

### Mục 4 đóng hai thứ bằng một phép đo

`stty size` = `34 120` khớp chính xác frame `init` chứng minh **cùng lúc**: `init`-trước-dial của G6 hoạt động (nếu không thì PTY sẽ là 80×24), **và** `set -g status off` của E4 đúng (nếu status bar còn, `rows` trong pod sẽ là **33** — lệch đúng 1, và AC resize sẽ phải mang một số magic "trừ 1").

AC gốc viết *"prompt đầu tiên vẽ đúng bề rộng (không gãy dòng)"* — một quan sát bằng mắt. Con số này mạnh hơn và tái lập được.

### Mục 9 là chế độ hỏng mà spike đánh dấu CHẶN G5

Xoá pod / reap session giữa phiên làm `StreamWithContext` trả `CodeExitError(137)` — **trùng khít** với `kill -9` hợp lệ bên trong pod. Bridge nào coi mọi `CodeExitError` là thoát bình thường sẽ đóng `1000`, và theo contract §6 thì `1000` nghĩa là *"tự gõ exit, FE ĐỪNG retry"*: sinh viên bị reap giữa bài thấy terminal đóng êm, không tín hiệu nào để FE hiện "phiên đã hết hạn".

Bridge tra Redis trên đường đóng rồi mới chọn mã. Cặp test tự động `TestExit137_SessionDaMat_Dong4404` / `TestExit137_SessionConSong_Dong1000` có **đúng cùng exit code** và phải ra hai close code khác nhau — không có cặp đó thì một implement bỏ hẳn lượt hỏi Redis vẫn cho suite xanh. Mục 9 xác nhận nhánh đó trên hạ tầng thật.

## Cái chưa đo được, nói thẳng

- **Vế "tiến trình đang chạy không chết" của AC reconnect (D3)** — chưa dựng ca có tiến trình dài (vd `sleep 300 &` rồi ngắt mạng) để khẳng định nó sống qua lần ngắt. Scrollback còn nguyên là bằng chứng cho *màn hình*, không cho *tiến trình*.
- **Vế SIGKILL của AC trần WS (D17)** — "giết gateway giữa phiên rồi chờ TTL của `session:{id}:ws` hết" chưa chạy thật. Có test tự động khẳng định TTL được đặt trong CÙNG một lượt atomic, nhưng đó là bằng chứng cho *cơ chế*, không cho *ca vận hành*.
- **`dlp_gateway_attach_duration_seconds`** (AC p95 < 500ms) — metric thuộc G10, chưa tồn tại nên chưa đo được.
- **Đường cookie thật** — thuộc G12. Xem §"Cách đo".
- **Hai replica gateway sau LB** — release lab chạy `replicaCount: 1`, nên AC "20 WS xen kẽ qua round-robin" vẫn để trống.

## Công cụ đo — và vì sao nó KHÔNG nằm trong repo

Công cụ đo (sinh khoá + phục vụ JWKS + mint token + client WS + assert) sống trong scratchpad của phiên, **không commit**. Khác với `cmd/bench-claim` (được giữ trong repo vì AC p95 phải đo lại được ở mọi chặng sau), công cụ này có một phần việc là **mint sandbox token** — nó trở thành mã chết đúng lúc G12 hạ cánh, và một binary trong repo có nhiệm vụ "mint token vào shell của người khác" là thứ không nên tồn tại lâu hơn mức cần.

Đánh đổi đã biết: bằng chứng của báo cáo này **không tái lập bằng một lệnh**. Đường tái lập đúng, sau G12, là dùng cookie thật do `apps/web` phát — và lúc đó phép đo trở thành một test e2e chạy được trong CI.

## Trình tự tái hiện (thủ công, cho tới khi có G12)

```bash
# 1. dựng + side-load image gateway (KHÔNG pull — node không có imagePullSecrets)
docker build -f services/terminal-gateway/Dockerfile -t ghcr.io/nghaiz/dlp-terminal-gateway:<tag> .
docker save ghcr.io/nghaiz/dlp-terminal-gateway:<tag> -o gw.tar && scp gw.tar nghaiz@<host>:/tmp/
ssh nghaiz@<host> 'sudo ctr -n k8s.io images import /tmp/gw.tar'

# 2. upgrade — --reset-then-reuse-values, KHÔNG --reuse-values
#    (--reuse-values không nạp default MỚI của chart; gateway.env.execCommand là default mới
#     và `required` của nó sẽ abort)
helm upgrade platform <chart> --reset-then-reuse-values \
  --set gateway.image.tag=<tag> \
  --set gateway.env.jwksUrl=http://<host>:9990/jwks \
  --set gateway.env.tokenIssuer=http://dlp-verify --wait

# 3. port-forward + chạy prover TRONG CÙNG một session shell
#    ⛔ ĐỪNG `pkill -f 'port-forward svc/platform-'`: pattern đó khớp luôn command line của
#       chính shell đang chạy script qua ssh, và nó tự giết session (đã dính một lần).
kubectl port-forward svc/platform-orchestrator 19090:9090 &
kubectl port-forward svc/platform-gateway 18082:8082 &
./verify-terminal -grpc 127.0.0.1:19090 -ws ws://127.0.0.1:18082 -jwks-addr 0.0.0.0:9990

# 4. TRẢ CẤU HÌNH LAB VỀ MẶC ĐỊNH — đừng để lab trỏ vào một JWKS dùng-rồi-bỏ
helm upgrade platform <chart> --reset-then-reuse-values \
  --set gateway.env.jwksUrl='' --set gateway.env.tokenIssuer='' --wait
```

## Liên quan

- [`phase-1.md`](../phase-1.md) §1.C — task list + AC
- [`2026-08-09-spike-ws-exec.md`](2026-08-09-spike-ws-exec.md) — sáu gotcha mà chặng này hiện thực theo
- [`docs/ws-terminal-protocol.md`](../../../docs/ws-terminal-protocol.md) — contract SSOT
- [`harness/2026-08-10-p1-c2-exec-bridge/`](harness/2026-08-10-p1-c2-exec-bridge/) — artifact của chặng
