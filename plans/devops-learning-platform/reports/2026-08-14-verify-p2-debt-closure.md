# Đóng nợ P2 + gỡ chặn bump k8s — 2026-08-14

Bốn mục: ba nợ P2 tự khai ("không ô AC nào của P2 gác") và một PR dependency
bị kẹt. Tất cả đều nằm ngoài mọi ô AC, nên không có ô nào đỏ để dẫn đường —
chúng chỉ lộ ra khi đi soát.

## Tóm tắt

| # | Việc | Bằng chứng |
|---|---|---|
| A | Bump k8s 0.34.9 → 0.36.3 bị chặn ở lint | 4/4 module build+vet sạch, golangci-lint 0 issues, govulncheck sạch |
| B | Đường nóng gateway không có dấu vết kiểm toán | 6 test (2 đối chứng âm), kiểm chính phép kiểm bằng cách bỏ dòng log |
| C | Nhãn tiến độ khẳng định nhiều hơn dữ liệu | 5 test trên hàm thuần `summarizeProgress` |
| D | Không có entry point thật (chỉ `port-forward`) | Đo trên cụm: HTTPS 200, `__Secure-` cookie trên host khác localhost |

## A — `httpstream` deprecated làm đỏ mọi PR bump dependency

PR #35 (dependabot, `k8s.io/client-go` 0.34.9 → 0.36.3): **build + vet + test
XANH**, chỉ `golangci-lint` đỏ, nên bước `govulncheck` đứng sau nó không bao giờ
chạy tới. Một bản vá bảo mật bị chặn bởi một cảnh báo phong cách.

`k8s.io/apimachinery/pkg/util/httpstream` deprecated ở 0.36 → staticcheck SA1019
trên 3 call-site (`podexec/executor.go`, `podexec/oneshot.go`,
`cmd/spike-exec/main.go`). Đổi sang `k8s.io/streaming/pkg/httpstream` — cùng hàm
`IsUpgradeFailure`, cùng ngữ nghĩa hẹp mà chú thích ở `executor.go` dựa vào (403
thiếu quyền `pods/exec` KHÔNG phải upgrade-failure, nên nó nổi lên nguyên vẹn).

Đối chứng: CI đã báo SA1019 trên đúng 3 file đó với cùng linter, cùng
apimachinery v0.36.3; sau khi đổi import, 0 issues. Chỉ đường import khác nhau.

```
4/4 module GOOS=linux build+vet : sạch
golangci-lint (4 module)         : 0 issues
govulncheck                      : No vulnerabilities found
```

## B — dấu vết kiểm toán cho đường nóng (nợ P2 §1)

Trước: gateway CHỈ log lượt bị TỪ CHỐI. Một phiên WS mở thành công và một lượt
`POST /exec/session/{id}` thành công không để lại dòng nào — tức
`kubectl logs deploy/platform-gateway` chỉ kể được chuyện những lượt KHÔNG xảy
ra. `WSConnectionsTotal` biết CÓ bao nhiêu lượt nhưng không biết lượt nào của
ai; một con số không đứng tên được thì không dùng để điều tra.

Thêm `slog.Info` ở cả hai đường: `session_id`, `user_id`, `pod`, `namespace`
(+`exit_code`, `truncated`, `duration` cho exec). WS phát **hai** dòng —
mở và đóng, kèm duration: chỉ "mở" thì mọi phiên trong log trông như còn đang mở.

Hai quyết định có chủ ý:

- **KHÔNG rate-limit** như `deny`. Sampling ở `deny` có lý do thật (endpoint
  public, một vòng `curl` đốt quota Loki), nhưng tới được đường thành công nghĩa
  là đã qua trọn a→h/a→i với token hợp lệ của đúng chủ phiên, và trần WS D17=1
  tự chặn việc một phiên đẻ nhiều dòng. Một audit log tự bỏ bớt dòng thì khoảng
  trống trong nó không phân biệt được với "không có gì xảy ra".
- **KHÔNG log output/script.** Output tới 8 KiB mỗi lượt và là BÀI LÀM của người
  học; script thì đến từ đĩa nên log lại chỉ là chép đĩa vào Loki. Một dòng kiểm
  toán phình như vậy sẽ bị người vận hành tắt, và khi đó mất cả dấu vết lẫn công
  sức thêm nó.

6 test, trong đó **2 là đối chứng âm** (`TestExecKhongGhiKiemToanKhiBiTuChoi`,
`TestWSKhongGhiKiemToanKhiHandshakeBiTuChoi`): thiếu chúng thì một implement log
vô điều kiện ở ĐẦU handler vẫn xanh — và khi đó dòng kiểm toán khẳng định script
đã chạy trong pod ở đúng những lượt nó chưa bao giờ chạy. Sai theo hướng đó tệ
hơn hẳn là không log. Luật 8 (không token trong log) mở sang execroute vì tới
chặng này nó mới bắt đầu log ở đường thành công, tức mới có chỗ để token lọt vào.

**Kiểm chính phép kiểm** (đối chứng âm ở tầng test): bỏ dòng `Log.Info` ⇒ 2 test
đỏ; khôi phục ⇒ xanh lại. Không có bước này thì "6 test PASS" không chứng minh
được test đang gác thứ gì.

## C — nhãn tiến độ nói nhiều hơn thứ ta lưu (nợ P2 §2)

Nhãn cũ luôn là `"X/N bước đã đạt"`. Nhánh `completed` đặt X = N từ ĐÚNG MỘT
lượt chấm: server ghi `completedAt` khi step CUỐI đạt (task 12), nên nhảy thẳng
tới bước cuối rồi bấm "Kiểm tra" một lần cho ra `"4/4 bước đã đạt"` — một khẳng
định về BA bước chưa từng được chấm.

Con số không sai với thứ nó đo (bài ĐÃ xong); cái sai là câu chữ — nó khẳng định
một TẬP bước, thứ ta không lưu ở đâu cả. Đây là lỗi của NHÃN chứ không của lưu
trữ, nên chỗ sửa là câu chữ:

- `completed` ⇒ **"Đã hoàn thành"** (thanh vẫn đầy — bài xong thật).
- chưa xong ⇒ **"X/N bước đã đạt trong phiên này"**. `passedSteps` là state
  client nên nó KHÔNG phải "từ trước tới giờ"; thiếu vế "trong phiên này" thì mở
  lại một bài đang dở hiện "0/4" và đọc như thể tiến độ đã mất.

Tách thành hàm thuần `summarizeProgress` (`progress.ts`) để phép kiểm bám được:
một chuỗi nội suy giữa JSX chỉ kiểm được bằng cách render cả trang, và khi đó ca
"đạt mỗi bước cuối" — đúng ca đẻ ra nợ này — là ca không ai viết. 5 test.

## D — entry point thật + TLS (nợ P2 §3)

Trước: vào bằng `kubectl port-forward` → `http://localhost:8080`. Không phải cho
tiện mà là BẮT BUỘC — cookie `dlp_sandbox` mang `Secure` vô điều kiện, và trình
duyệt chỉ chấp nhận `Set-Cookie` `Secure` trên HTTP khi host là `localhost`. Mọi
host khác ⇒ cookie bị vứt TRONG IM LẶNG rồi handshake WS trả 401 không rõ lý do.
Hệ quả: không máy nào khác trong LAN vào được.

Chốt với chủ dự án: **CA nội bộ bằng openssl** (không cert-manager) +
**sslip.io** (không sửa file hosts).

- `infra/host/08-tls-entrypoint.sh` — CA tái dùng giữa các lần chạy (sinh CA mới
  mỗi lần = bắt mọi trình duyệt tin lại), chứng chỉ SAN mang **cả DNS lẫn IP**
  (thiếu IP thì một phép thử `curl https://<ip>` đỏ vì SAN chứ không vì đường
  mạng — 20 phút đi sai hướng đúng lúc đang gấp), Secret tạo bằng
  `create --dry-run | apply` để chạy lại được.
- Traefik → NodePort **ghim** 30080/30443. Cổng tự cấp đổi sau mỗi lần cài, mà
  origin nằm trong `CORS_ALLOWED_ORIGINS`, `BETTER_AUTH_URL` và SAN chứng chỉ.
- Vì sao NodePort giờ mới được: lý lẽ loại nó trước đây nhắm vào **HTTP**, không
  nhắm vào NodePort. Trên HTTPS thì `Secure` được chấp nhận ở bất kỳ cổng nào.

### Đo trên cụm

```
/            → http=200  tls_verify=0
/ws          → {"code":"SUBPROTOCOL_REQUIRED",...}      ← lỗi CỦA GATEWAY, không phải 404 của Next
/ws + đúng subprotocol → 401 {"code":"UNAUTHENTICATED","message":"thiếu cookie dlp_sandbox"}  (60ms)
BETTER_AUTH_URL / GATEWAY_ALLOWED_ORIGINS = https://dlp.192.168.94.130.sslip.io:30443
set-cookie: __Secure-better-auth.session_token=...; HttpOnly; Secure; SameSite=Lax
```

Dòng cuối là vế quyết định: một cookie **tiền tố `__Secure-`** được cấp và chấp
nhận trên host KHÁC `localhost`. Spec cookie prefix bắt trình duyệt VỨT mọi
`Set-Cookie __Secure-*` thiếu `Secure`, nên dòng đó không thể xuất hiện nếu
origin không phải secure context — đúng thứ bất khả trước chặng này.

**Đối chứng âm:** bỏ `--cacert` ⇒ `http=000` (TLS bị từ chối). Thiếu dòng này thì
`http=200` vẫn xanh cả khi chứng chỉ đang bị bỏ qua.

### Lỗi tự lộ ra: `--set` sai khoá, im lặng từ 2.G

`07-ingress-controller.sh` viết `--set service.type=ClusterIP` kèm chú thích dài
giải thích vì sao ClusterIP đúng. **Khoá đó không tồn tại trong chart traefik
v41** — nó là `service.spec.type`. Helm nhận key lạ không kêu một tiếng, chart
giữ mặc định `LoadBalancer`, và trên kubeadm 1-node LoadBalancer nằm `<pending>`
vĩnh viễn.

Thứ làm ca này khó thấy: `helm get values traefik` **vẫn in `service.type:
ClusterIP`**. Chính lệnh dùng để kiểm tra lại khẳng định điều sai — giá trị đã
KHAI và đối tượng SỐNG nói hai điều khác nhau, và chỉ một trong hai định tuyến
được gói tin. Ô AC 2.G không bắt được vì nó đo qua `port-forward`, mà
port-forward đi thẳng tới Service nên không quan tâm `type`.

Sửa hai vế: đổi khoá, **và** thêm bước "Khẳng định type + cổng trên ĐỐI TƯỢNG
SỐNG" đọc `.spec.type` bằng `kubectl` rồi `exit 1` nếu lệch. Quan sát được nó
gác thật: chạy lần đầu (khoá sai) ⇒ `LoadBalancer`; sau khi sửa ⇒
`OK: type=NodePort, cổng 30080/30443 đúng như đã ghim.`

## Cổng đã chạy

```bash
# Go — 4 module
GOOS=linux go build ./... && go vet ./...     # mỗi module, sạch
go test ./...                                  # gateway + orchestrator + shared, sạch
go test -race -run 'KiemToan|DauVet|Luat8' ./internal/execroute/... ./internal/wsroute/...   # 6 PASS
GOOS=linux golangci-lint run ./...             # 0 issues (mỗi module)
GOOS=linux govulncheck ./...                   # No vulnerabilities found

# Web
pnpm --filter web typecheck                    # sạch
pnpm --filter web lint                         # sạch
pnpm --filter web test                         # 20 file / 173 ca PASS
pnpm --filter @devops-platform/scenario test   # 7 file / 84 ca PASS

# Cụm
bash infra/host/07-ingress-controller.sh       # kèm bước khẳng định type trên đối tượng sống
bash infra/host/08-tls-entrypoint.sh
```

## Còn lại / lưu ý

1. **Chưa chạy lại harness browser WS đầy đủ trên origin mới.** Đã đo: định
   tuyến `/` + `/ws`, authz gateway, env origin trong pod, cấp cookie `__Secure-`.
   CHƯA đo: trọn luồng đăng nhập → mở bài → gõ trong PTY → "Kiểm tra" trên
   `https://…:30443` bằng trình duyệt thật. 2.G đã đo trọn luồng đó trên origin
   cũ; phần chưa lặp lại là tương tác của luồng đó với origin mới.
2. **Image trên cụm chưa mang thay đổi B/C.** Cụm đang chạy image cũ — D là việc
   hạ tầng nên không cần build lại. Muốn thấy dấu vết kiểm toán và nhãn mới trên
   cụm thì phải `docker save` → `ctr import` như thường lệ.
3. **Một tài khoản thử còn trong DB.** Phép kiểm cookie `__Secure-` tạo thật một
   user `tls-probe-*@example.test` qua Better Auth. Vô hại trên cụm lab, nhưng
   nó có thật.
4. **Chưa có chuyển hướng HTTP → HTTPS.** Cổng 30080 vẫn phục vụ HTTP. Không bật
   `ports.web.redirectTo` vì với NodePort không chuẩn thì Location dễ trỏ sai
   cổng, và một chuyển hướng nửa vời khó chẩn hơn là không có. → P3 §6.
