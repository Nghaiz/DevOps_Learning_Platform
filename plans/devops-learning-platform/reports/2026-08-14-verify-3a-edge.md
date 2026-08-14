# 3.A — Biên Traefik: body-size, rate-limit, XFF, redirect — 2026-08-14

Chặng đầu của P3. Mở đầu bằng việc chi tiết hoá `phase-3.md` (SKETCH) thành
[`phase-3-detailed.md`](../phase-3-detailed.md), rồi làm chặng 3.A.

Điều đáng kể nhất của chặng này không phải thứ đã dựng, mà là **bốn phép đo bác bỏ
bốn điều tôi hoặc plan đang tin** — trong đó hai điều là lý lẽ thiết kế của chính
tôi, và một điều là kết luận của một report P2.

## Tóm tắt

| Việc | Kết quả |
|---|---|
| 4 Middleware Traefik (bodylimit, ratelimit-web, ratelimit-ws, redirect-https) | sống trên cụm |
| Tách `ingress.yaml` → `platform-web` / `platform-ws` / `platform-redirect` | sống, ghim entrypoint đúng |
| `externalTrafficPolicy: Local` cho Service traefik | **lỗ hổng thật, tìm được nhờ đo từ MÁY KHÁC** |
| `RATE_LIMIT_TRUST_PROXY=1` cho web | bật, sau khi đo xong chứ không trước |
| Cổng CI mới: tham chiếu middleware phải khớp định nghĩa | xanh trên render thật, **đỏ** trên 2 kiểu bóp méo |
| 9 ô AC (7 gốc + 2 thêm từ review) | 9/9, trong đó 1 ô phải viết lại vì tiêu chí gốc mù |
| Vòng review đối kháng | 1 lỗ hổng NẶNG bỏ sót + **4/6** kiểu bóp méo cổng CI cho qua — đã vá cả hai |

## Ba giả định của sketch bị scout bác bỏ trước khi viết dòng nào

Ghi ở [`phase-3-detailed.md`](../phase-3-detailed.md) §0, tóm lại:

1. **"NetworkPolicy đầy đủ" (task 3)** — sandbox đã đủ từ P1. Lỗ thật là **namespace
   nền tảng không có NetworkPolicy nào**: web/gateway/orchestrator/postgres/redis mở
   toang. Task đổi phạm vi hoàn toàn.
2. **"Reaper hardening" (task 8)** — reaper đã có 4 tầng, orphan cả hai chiều, đối
   chứng âm dày đặc. 30 pod tồn đọng là pod CronJob canary (`successfulJobsHistoryLimit: 26`
   đặt có chủ ý), thiếu mỗi `ttlSecondsAfterFinished`. Task co lại còn một knob.
3. **"Thêm lớp rate-limit ở Traefik cho chắc" (task 6)** — lớp theo IP của web
   **chưa từng chạy**: `RATE_LIMIT_TRUST_PROXY` off ⇒ `clientKey()` trả `null` ⇒ bỏ
   qua hẳn. Và `exceedsBodyLimit()` chỉ đọc `Content-Length` nên request chunked đi
   thẳng qua. Đây là dựng lớp THẬT ĐẦU TIÊN, không phải lớp thứ hai.

## Lỗ hổng thật: IP nguồn bị SNAT, và vì sao suýt không thấy

Kế hoạch (ghi nhận U2 của sketch) giả định phải cấu hình Traefik ghi đè
`x-forwarded-for`. Phép đo cho thấy **Traefik đã ghi đè sẵn** — deployment không có
`forwardedHeaders.trustedIPs`, và mặc định của Traefik là thay XFF bằng địa chỉ
socket cho mọi client không nằm trong danh sách tin cậy (danh sách rỗng ⇒ mọi
client). Gửi `X-Forwarded-For: 1.2.3.4` từ ngoài vào, backend nhận `192.168.94.130`.

**Đối chứng âm** (thiếu nó thì kết luận trên vô giá trị — "XFF bị thay" không phân
biệt được với "probe tự viết lại header"): cùng request đó đi **thẳng vào Service**,
không qua Traefik ⇒ `X-Forwarded-For: 1.2.3.4` tới **nguyên vẹn**.

Nhưng phép đo đầu tiên tôi chạy **từ chính VM**, và ở đó nó nhập nhằng: IP thật của
người gọi và IP node **là cùng một số** `192.168.94.130`. Hai giả thuyết trái ngược
— "IP nguồn được giữ" và "IP nguồn bị SNAT về node" — cho cùng một kết quả.

Chạy lại **từ máy Windows (`192.168.94.1`)** thì mới tách được: backend vẫn nhận
`192.168.94.130`. Tức `externalTrafficPolicy: Cluster` đã SNAT mất IP nguồn, và
**mọi client trên đời dùng chung một bucket rate-limit**. Hệ quả không phải "giới
hạn hơi sai" mà là: người đầu tiên chạm trần khoá tất cả những người còn lại — đúng
chế độ self-DoS mà `apps/web` đã cố ý từ chối khi loại bucket `'unknown'`.

Và vì Traefik ghi đè XFF bằng thứ nó nhìn thấy, bật `RATE_LIMIT_TRUST_PROXY=1` trên
nền `Cluster` sẽ **chép nguyên lỗi đó xuống lớp web**. Cổng "đo trước, bật sau" (A2
của plan) tồn tại đúng để chặn việc này, và nó đã chặn thật.

Sau khi đổi `Local`: cùng phép gọi từ Windows ⇒ `X-Forwarded-For: 192.168.94.1`.

Đã đưa vào `07-ingress-controller.sh` kèm **bước khẳng định trên đối tượng sống**,
cùng khuôn với bài học `service.type`: một key `--set` gõ sai được helm nhận trong
im lặng, và `helm get values` in lại chính giá trị sai đó.

> **Bài học đo đạc:** một phép đo chạy từ *bên trong* hệ thống đang đo có thể làm hai
> giả thuyết trùng kết quả. Ở đây cứu được là nhờ đổi điểm quan sát, không nhờ đọc
> thêm tài liệu.

## Hai lý lẽ thiết kế của chính tôi bị đo là sai

### 1. "buffering sẽ giết WebSocket" — SAI

Toàn bộ lý do tôi tách `ingress.yaml` ban đầu là: middleware `buffering` đệm trọn
request, nên gắn nó lên một Ingress chứa cả `/ws` sẽ giết WebSocket. Ô AC-A6 sinh ra
để gác điều đó.

Đối chứng âm: gắn **thẳng** `bodylimit` vào Ingress `/ws` rồi chạy lại probe.

```
handshake: HTTP/1.1 101 Switching Protocols  (8ms, alpn=http/1.1)
server gửi: {"type":"ready","sessionId":"271e1a39…","podName":"sandbox-07b9e4ac…
sau 5000ms: socket CÒN MỞ
```

Vẫn 101, vẫn `ready`, vẫn mở. Buffering vô hại vì **request nâng cấp WS không có
body** để đệm, và sau 101 kết nối được hijack.

Việc tách Ingress **vẫn đúng**, nhưng vì hai lý do khác: `/` và `/ws` cần **hai trần
rate-limit khác nhau** (mỗi handshake `/ws` là một lượt attach pod), và
`redirectScheme` gắn lên router phục vụ HTTPS sẽ **chuyển hướng chính request HTTPS
⇒ vòng lặp vô hạn**. Đã sửa lại chú thích trong `ingress.yaml` và
`middleware-bodylimit.yaml`: một "vì sao" sai còn tệ hơn không có, vì người sau sẽ
tin nó.

### 2. "0 dòng log ở pod web" chứng minh 413 bị chặn ở biên — MÙ

Tiêu chí gốc của AC-A1. Đo: gửi 2 MiB ⇒ 413, log web tăng **0** dòng. Trông như đã
chứng minh.

Đối chứng âm phá nó: gửi một `GET /` **hợp lệ trả 200** ⇒ log web cũng tăng **0**
dòng. Next không log request thành công, nên phép kiểm cho cùng kết quả ở cả hai giả
thuyết — nó không đo gì cả.

Thứ **thật sự** đóng được ô này là **body của phản hồi**: `Request Entity Too Large`
(plain text). Web không thể phát ra chuỗi đó — nó trả JSON `{"error":"payload_too_large"}`.
Đã viết lại AC-A1 trong plan theo tiêu chí này và ghi rõ vì sao tiêu chí cũ bị bỏ.

## Hai bẫy công cụ làm phép đo nói dối

### `curl` tự thêm lại `Content-Length` dù đã ép `Transfer-Encoding: chunked`

Lượt đo AC-A2 đầu tiên dùng `-H "Transfer-Encoding: chunked" --data-binary @file`.
Một bước sanity (gửi cùng request tới `/xff-probe`, nơi **không** có bodylimit, để
xem header thật sự đi ra là gì) cho:

```
Content-Length: 524288
```

Tức curl vẫn tính độ dài vì `@file` biết kích thước — **AC-A2 lúc đó đang đo lại
đúng ca A1**, và "chunked cũng bị chặn" là một khẳng định chưa có bằng chứng. Đường
đúng là `-T -` từ stdin (curl không biết trước độ dài):

```
Transfer-Encoding: chunked        ← sanity, KHÔNG kèm Content-Length
2 MiB chunked   → 413  "Request Entity Too Large"     ← Traefik
512 KiB chunked → 400  {"message":"Invalid JSON…"}    ← tới được ứng dụng
```

Vế 512 KiB là đối chứng âm: 413 đến từ **kích thước**, không từ việc chunked.

### Probe WS thiếu frame `init` cho triệu chứng y hệt "middleware giết WS"

Lượt chạy AC-A6 đầu tiên: 101 rồi socket đóng trước 3.5s ⇒ đọc ra là buffering đã
phá WebSocket. Log gateway nói khác:

```
20:01:47.884  mở phiên WS            session=126b36c8…
20:01:50.887  không nhận được init trong hạn — dùng 80x24
20:01:50.893  stream lỗi hạ tầng     dial tcp 10.96.0.1:443: operation was canceled
20:01:50.893  đóng phiên WS          duration=3008657055
```

`docs/ws-terminal-protocol.md` §3 bước 4: `init` là frame **bắt buộc** đầu tiên;
không có thì gateway chờ 3s rồi huỷ dial exec và đóng. Lỗi nằm ở probe.

**Kèm theo đó là một đính chính cho report P2.**
[`2026-08-14-verify-deploy-https-origin.md`](2026-08-14-verify-deploy-https-origin.md)
ghi `duration=3.007s` và kết luận *"khớp đúng lượt giữ socket 3s của script — số đo
là thật, không phải hằng số"*. Con số đó thực ra là **hạn `init` của gateway**: nó ra
~3.0s bất kể script giữ socket bao lâu. Ở đây script giữ **3.5s** mà gateway vẫn đóng
ở **3.008s**. Hai cách đọc trùng số nên cách đọc sai không lộ ra.

Sau khi probe gửi `init` (kèm mask RFC 6455 — frame từ client thiếu mask cũng bị đóng,
lại một nguyên nhân nữa cho cùng triệu chứng):

```
handshake: HTTP/1.1 101 Switching Protocols  (8ms, alpn=http/1.1)
server gửi: {"type":"ready","sessionId":"e8a00cfc…","podName":"sandbox-69dd6523…
sau 5000ms: socket CÒN MỞ          ← đã vượt hạn init 3s
```

Probe nằm ở [`harness/2026-08-14-3a-edge/ws-upgrade-probe.mjs`](harness/2026-08-14-3a-edge/ws-upgrade-probe.mjs),
có cờ `EXPECT=fail` để chạy được vế đối chứng âm.

## Vòng review đối kháng — và một lỗ hổng NẶNG HƠN mà tôi đã bỏ sót

Sau khi tôi tự vá mục dưới, một vòng review đối kháng chạy **sáu kiểu bóp méo
thật** vào cổng CI và render chart ở mọi nhánh. Kết quả không dễ nghe: cổng tôi
viết ra để chặn "middleware suy giảm trong im lặng" **cho qua bốn trên sáu**, và
bản vá của tôi **vẫn còn** lỗ hổng chính — chỉ là ở một chỗ khác chỗ tôi đã nhìn.

### Lỗ hổng chính: `web.service.type: NodePort` là một CỬA THỨ HAI

Cổng chặn tôi thêm ở mục dưới khẳng định `ingress.enabled=true`, tức "CÓ một
proxy". Nó **không** khẳng định "mọi lưu lượng ĐỀU đi qua proxy đó" — và cùng hồ
sơ `values-selfhost.yaml` lại cố ý mở một cửa thứ hai: `web.service.type: NodePort`.

Đo trên cụm, không suy luận:

```
kubectl get svc platform-web            → NodePort  32238
curl http://192.168.94.130:32238/       → 200        ← không đi qua Traefik
```

Hai hậu quả, hậu quả thứ hai là thứ tôi hoàn toàn không nghĩ tới:

1. **Né trần.** Xoay XFF mỗi request ⇒ mỗi request một bucket. Trần body ở biên
   cũng mất, nên lỗ chunked mà AC-A2 vừa bịt lại mở nguyên trên đường này.
2. **KHOÁ NGƯỜI KHÁC.** `buckets` trong `rate-limit.ts` là `Map` toàn cục của
   process, tức CÙNG một map phục vụ lưu lượng hợp lệ. Tái hiện được:

```
# từ VM: 130 request vào NodePort, giả danh IP nạn nhân
curl … -H "X-Forwarded-For: 192.168.94.1" http://192.168.94.130:32238/
   → 120×200, 10×429            (bucket của 192.168.94.1 đã cạn)

# từ máy Windows — vốn THẬT SỰ là 192.168.94.1 — qua đường HTTPS hợp lệ:
   lần 1 → 429   {"error":"too_many_requests"}
   lần 2 → 429
   lần 3 → 429
```

Một người ngoài khoá được một người dùng thật, lặp vô hạn, chỉ bằng `curl` từ LAN.
**Vector này do CHÍNH chặng 3.A tạo ra:** trước đó `clientKey()` luôn trả `null`
nên không bucket nào từng tồn tại để mà đầu độc. Chặng "hardening" tự thêm một lỗ.

Sửa: `web.service.type: ClusterIP` (lý do cũ của NodePort — "chưa có ingress
controller, Traefik tới ở P3" — đã hết hiệu lực đúng ở chặng này), **và** thêm vế
thứ hai vào cổng chặn: trustProxy bật mà service không phải ClusterIP ⇒ `fail`.

Cổng đó bắn ngay trên lượt deploy kế tiếp — vì `helm get values` còn giữ
`web.service.type: NodePort` từ một `--set` cũ và nó đè lên values-selfhost. Đúng
thứ nó sinh ra để bắt.

```
curl http://192.168.94.130:32238/  →  000 / connection refused     ← cửa đã đóng
```

### Cổng CI cho qua bốn kiểu hỏng thật

Phép kiểm cũ chỉ khẳng định **một chiều**: mọi tham chiếu đều khớp một Middleware
có thật. Nó không khẳng định chiều ngược lại — rằng mỗi Ingress mang ĐÚNG tập
middleware nó phải mang. Bốn kiểu hỏng lọt qua, mỗi kiểu đều XANH:

| Bóp méo | Hậu quả thật | Cổng cũ |
|---|---|---|
| Gỡ hẳn annotation middlewares khỏi `platform-web` | đường web mất SẠCH trần body + rate-limit | xanh |
| Đổi entrypoint `platform-web` sang `web` | HTTPS trả 404 cho toàn ứng dụng; trên HTTP hai router tranh nhau | xanh |
| Trỏ `platform-web` sang `ratelimit-ws` | cả site tụt xuống 20 req/phút — trông như "app chậm" | xanh |
| Gõ sai field spec (`maxRequestBodyByte`) | apiserver **prune** field lạ trong im lặng ⇒ buffering KHÔNG có trần, mà `kubectl get -o yaml` in ra vẫn trông bình thường | xanh |

Kiểu cuối đáng sợ nhất và cũng là kiểu tôi đã tự tay mở đường: `kubeconform`
chạy với `-ignore-missing-schemas`, và output của chính nó nói `Skipped: 4` —
đúng bốn CRD mới. Tôi đọc `Valid: 27` mà không đọc `Skipped: 4`.

Cổng viết lại: pin **tập mong đợi CHÍNH XÁC** cho từng Ingress (middleware +
entrypoint), khẳng định tập Middleware được định nghĩa, và khẳng định spec có đủ
field đúng kiểu. Chạy lại đúng sáu kiểu bóp méo đó cộng một kiểu thứ bảy (gỡ trần
riêng của router tĩnh):

```
BASELINE                                    exit=0  OK
A. gỡ annotation middlewares khỏi web       exit=1  LỆCH so với mong đợi
B. tên tham chiếu sai (bodylimits)          exit=1  LỆCH
C. web ghim entrypoint HTTP                 exit=1  LỆCH
D. spec typo maxRequestBodyByte             exit=1  spec Middleware thiếu …
E. average thành chuỗi                      exit=1  muốn 6 dòng average/burst dạng SỐ
F. web trỏ sang ratelimit-ws                exit=1  LỆCH
G. gỡ trần riêng của router tĩnh            exit=1  LỆCH
```

Phép kiểm được trích **verbatim từ chính workflow** rồi chạy trên bảy chart bị bóp
méo, để thứ tôi kiểm và thứ CI chạy không thể trôi khỏi nhau.

> **Baseline đỏ ở lượt đầu**, và đó là một lỗi của chính cổng: `awk` chỉ xả bản ghi
> khi gặp một `kind:` KHÁC Ingress, mà bốn Ingress nằm liên tiếp — nên nó chỉ đọc
> ra object cuối cùng. Một parser im lặng nuốt 3/4 bản ghi là cách dễ nhất để cổng
> trở nên vô dụng theo hướng ngược lại.

### Trần biên đang đếm cả asset tĩnh

`proxy.ts` khai matcher `['/((?!_next/static|_next/image|favicon.ico).*)']` — lớp
rate-limit của web **cố ý không đếm** asset tĩnh. Trần ở biên thì đặt trên `/` nên
đếm tất: mỗi chunk JS, mỗi CSS, mỗi font. Chú thích tôi viết trong values ("120
khớp `RATE_LIMIT_MAX_REQUESTS` của web") vì thế **sai** — hai lớp không cùng một
tập request.

Chế độ hỏng rất khó chẩn: 429 rơi trúng một chunk JS thì trình duyệt báo
`ChunkLoadError`/trang trắng, không báo "bị giới hạn". Và harness e2e đi qua API
nên KHÔNG BAO GIỜ tải asset — nó xanh 14/14 trong lúc trình duyệt thật hỏng, đúng
bài học đã ghi ở 2.D.

Đo: riêng trang chủ tham chiếu **14** file `/_next/static` ngay trong HTML (chưa
tính import lồng nhau, font, ảnh) trên trần `burst: 60`.

Sửa theo đúng ý định của `proxy.ts` thay vì chỉnh số mò: tách `/_next/static`
thành router riêng với trần rộng hơn hẳn (600/phút, burst 300) — vẫn CÓ trần vì
asset rẻ nhưng không miễn phí. Ô AC mới **A8** đo chính điều đó (xem bảng).

### Các mục còn lại của review

- **`redirectHttps.port` để trống** ⇒ `Location` trỏ về cổng 443 mặc định, tức
  đúng sự cố nợ P2 §3 mà middleware này sinh ra để tránh. Đổi `with` → `required`
  với thông báo nêu cả hai giá trị hợp lệ (`30443` cho lab, `"443"` cho cổng chuẩn).
- **Negative test trustProxy chỉ khẳng định "render thất bại"**, không khẳng định
  thất bại ĐÚNG LÝ DO ⇒ sẽ xanh vĩnh viễn nếu chart sau này thêm một `required`
  khác. Thêm đối chứng dương (không có cờ thì phải render được) + `grep` thông điệp.
- **`with` coi `'0'` là truthy** ⇒ `rateLimitTrustProxy: '0'` (một lệnh TẮT tường
  minh) vẫn kích `fail`. Đổi sang `eq . "1"`.
- **Khối `annotations:` rỗng** khi không có annotation nào. Dựng dict rồi mới phát.
- **Trần `/ws` 20/phút chưa đo, và NAT gộp cả lớp học vào một bucket** — ghi vào
  values như một nợ có tên, phải soi trước 3.E.

## Lỗ hổng thứ hai — do chính bản vá này tạo ra, tự soát mới thấy

Bản đầu của 3.A đặt `rateLimitTrustProxy: '1'` thẳng trong `values-selfhost.yaml`,
với lý lẽ "hồ sơ self-host đi kèm `07-ingress-controller.sh` nên luôn có Traefik".

**Lý lẽ đó sai.** Các lệnh deploy self-host được ghi trong
`docs/env/05-helm-secrets-deploy.md` và `infra/helm/README.md` dùng **đúng hồ sơ ấy
mà KHÔNG bật ingress**:

```bash
helm upgrade --install platform infra/helm/platform \
  -f infra/helm/platform/values-selfhost.yaml \
  --set web.env.betterAuthSecret="$(openssl rand -hex 32)"
```

Ở trạng thái đó không có proxy nào đứng trước web (Service web là NodePort, vào
thẳng), nên `x-forwarded-for` là header **client tự đặt được**. Tin nó biến trần
theo IP từ một lớp phòng thủ thành một lớp **giả**: xoay XFF mỗi request là mỗi
request một bucket mới, né sạch giới hạn. Trớ trêu là đó chính là điều
`docs/web-auth-security.md` đã ghi khi giải thích vì sao cờ này mặc định TẮT — bản
vá của tôi đi ngược lại tài liệu của chính dự án.

Ba việc đã sửa:

1. **Gỡ khỏi `values-selfhost.yaml`.** Hồ sơ không được tự bật một cờ mà tiền đề
   của nó nằm ngoài hồ sơ.
2. **Chuyển vào lệnh do `08-tls-entrypoint.sh` in ra** — đúng nơi biên Traefik
   được dựng, cùng lượt với `ingress.middleware.enabled`.
3. **Cổng chặn cứng trong chart** (`web-deployment.yaml`): `rateLimitTrustProxy`
   bật mà `ingress.enabled=false` ⇒ `fail` với thông báo nêu rõ hậu quả và hai
   đường sửa. `ingress.enabled` là điều kiện mạnh nhất chart kiểm được — nó không
   chứng minh proxy có ghi đè XFF hay không, nên thông báo nói rõ phần đó thuộc
   người vận hành.

Kiểm ba trạng thái:

```
trustProxy BẬT + ingress TẮT  → Error: … header client TỰ ĐẶT ĐƯỢC …   (chart từ chối)
trustProxy BẬT + ingress BẬT  → RATE_LIMIT_TRUST_PROXY="1"             (render)
mặc định (cả hai TẮT)         → 0 lần xuất hiện biến                    (render)
```

Kèm một bước CI gác **vế ngược**: nếu chart render ĐƯỢC tổ hợp nguy hiểm thì bước
đó đỏ. Một cổng chỉ kiểm "đường đúng vẫn chạy" sẽ xanh cả sau khi ai đó gỡ mất cổng.

## Bảng ô AC

| Ô | Kết quả | Bằng chứng |
|---|---|---|
| **A1** body 2 MiB có `Content-Length` | ✅ | `413` + body `Request Entity Too Large` (plain text ⇒ Traefik, không phải JSON của web) |
| **A2** 2 MiB **chunked** | ✅ | `413`; sanity xác nhận `Transfer-Encoding: chunked` không kèm `Content-Length`. Đối chứng âm 512 KiB chunked → `400` từ ứng dụng |
| **A3** rate-limit ở biên | ✅ | 300 request song song / **6s** ⇒ **239×429 với `content_type` RỖNG** (chữ ký Traefik; Next trả `application/json`) + **61×200** ≈ `burst: 60`. Đối chứng âm: sau 65s, 10 request → 10×200 |
| **A4** XFF không giả mạo được | ✅ | 300 request qua Traefik, **mỗi request một XFF giả KHÁC NHAU** ⇒ `61×200 / 239×429`, **y hệt** lượt không giả mạo: 300 giá trị bịa gộp hết vào MỘT bucket. Nếu XFF được tin thì 300 bucket riêng ⇒ 0 lần 429. Đối chứng âm: đi thẳng vào Service (không qua Traefik) ⇒ `1.2.3.4` tới nguyên vẹn |
| **A5** redirect HTTP→HTTPS | ✅ | `302` + `Location: https://dlp.192.168.94.130.sslip.io:30443/` — **đúng cổng công khai**; `/ws/session/x` trên HTTP cũng được đẩy sang HTTPS |
| **A6** WebSocket vẫn sống | ✅ | `101` + `{"type":"ready"}` + socket mở sau 5s. Đối chứng âm KHÔNG đỏ được ⇒ bác bỏ giả định buffering (xem trên) |
| **A7** harness e2e | ✅ | **14/14 PASS** trên origin HTTPS sau khi đổi biên |
| **A8** router tĩnh có ngân sách RIÊNG *(mới, từ review)* | ✅ | NGAY SAU khi 240 request động bị 429, **200/200** request vào `/_next/static` trả **200**. Chung trần thì chúng đã 429 cùng nhau — đây là vế phân biệt |
| **A9** cửa thứ hai đã đóng *(mới, từ review)* | ✅ | `web.service.type=ClusterIP`; `curl http://192.168.94.130:32238/` ⇒ **000 / connection refused** (trước đó: `200`) |

## Cổng CI mới — và vì sao nó cần tồn tại

Ba Middleware chỉ render khi `ingress.middleware.enabled=true`, mà **không bộ values
nào bật** (mặc định `false` để trung lập nhà cung cấp — Middleware là CRD riêng của
Traefik). Không thêm gì thì CI **không bao giờ render ba manifest mới**.

Nhưng phép kiểm chính không phải "render được" mà là **tham chiếu phải khớp định
nghĩa**: Traefik **bỏ qua trong im lặng** một `router.middlewares` trỏ tới Middleware
không tồn tại — Ingress vẫn `Ready`, route vẫn chạy, và trần body/rate-limit đơn giản
là KHÔNG có. Đúng chế độ hỏng của sự cố `service.type`.

**Kiểm chính phép kiểm** (chạy cục bộ, cả ba nhánh):

```
[1] render thật                        → OK      exit=0
[2] bóp méo một tham chiếu             → 'platform-ratelimit-wsX' KHÔNG khớp   exit=1
[3] gắn bodylimit vào /ws              → /ws mang bodylimit                    exit=1
```

Hai chi tiết viết tay dễ sai đã tránh: dùng `<<<` thay `printf | while` (vòng lặp
trong pipeline chạy ở subshell nên `exit 1` chỉ thoát subshell — cổng gác không bao
giờ đỏ được), và xác nhận `cmd && { …; exit 1; }` an toàn dưới `set -e` bằng cách
chạy thử chứ không bằng suy luận.

## Cổng đã chạy

```bash
helm lint infra/helm/platform -f {values,values-selfhost,values-cloud}.yaml   # 3/3 sạch
helm template … --set ingress.middleware.enabled=true                        # 4 Middleware, 3 Ingress
# nhánh middleware TẮT (mặc định): 2 Ingress, 0 Middleware — trung lập nhà cung cấp
```

## Còn lại

1. **`permanent: false` (302), chưa chuyển sang 301.** Cố ý: 301 bị trình duyệt cache
   lâu dài nên một `Location` sai cổng sẽ dính lại cả sau khi đã sửa. Đổi khi A5 xanh
   ổn định qua vài lần deploy.
2. **`externalTrafficPolicy: Local` chưa được kiểm trên cụm NHIỀU node.** Trên 1 node
   nó không mất gói; nhiều node thì đòi pod Traefik có mặt ở node nhận traffic.
3. **Chưa đo trần rate-limit của `/ws` (20/phút)** — và có hai lý do cụ thể để
   nghi nó quá chật, phải soi TRƯỚC 3.E chứ không sau:
   (a) gateway restart ⇒ mọi client nối lại cùng lúc; nếu client retry không có
   backoff nhiễu thì một người ăn hết burst 10;
   (b) `externalTrafficPolicy: Local` trả lại IP THẬT của client, nhưng một lớp
   học sau NAT chung vẫn gộp N người vào MỘT địa chỉ — 20 handshake/phút chia cho
   cả lớp là quá chật. Chưa đọc mã reconnect của FE.
4. **Tài khoản thử còn trong DB lab:** `wsprobe-*`, cùng các user harness e2e tạo mỗi
   lượt chạy.
5. **`~/dlp-deploy` vẫn là bẫy.** Chặng này upgrade từ `~/dlp-chart-p3a/` và đã kiểm
   `grep -c GATEWAY_INTERNAL_URL = 1` trước khi chạy — giữ thói quen đó.

## Một phát hiện phụ cho 3.F (k6)

Chạy probe nhiều lượt thì gặp *"đã đạt trần số sandbox đồng thời của cluster"*.
Thông báo nói về **số phiên**, nhưng ràng buộc thật là **bộ nhớ**:

```
platform-sandbox-quota   pods: 4/10   requests.memory: 2Gi/2112Mi   limits.memory: 4Gi/4Gi
```

`pods` mới dùng 4/10 trong khi `requests.memory` đã 2Gi trên trần 2112Mi. Tức trần
đồng thời thực tế trên lab hiện là **~4 sandbox**, và nó do quota RAM quyết định chứ
không do `POOL_TARGET` hay số pod. 3.F phải lấy con số này làm điểm xuất phát khi
chốt "N session đồng thời trên lab 1-node" — và nếu muốn N lớn hơn thì cần nới
`sandbox.quota` trước, không phải chỉnh k6.

Ngoài ra, 26 pod `Completed` trong `dlp-sandbox` (pod của CronJob canary) **không**
tính vào quota — nên chúng lãng phí đĩa/etcd chứ không chặn phiên mới. Khớp với
chẩn đoán ở §0.2: thiếu `ttlSecondsAfterFinished`, và đó là việc của 3.C.
