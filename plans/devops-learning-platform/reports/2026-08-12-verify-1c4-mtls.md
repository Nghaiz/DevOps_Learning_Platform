# 1.C-4 — mTLS cổng gRPC: bằng chứng (2026-08-12)

**Phạm vi:** đóng R25 (cổng gRPC orchestrator không xác thực người gọi), R13 (gateway không có credential), B0′ (auth cho cổng gRPC), D13 (mTLS in-cluster).
**Cụm:** `debian-sandbox` (kubeadm 1-node, k8s v1.34.10, Sysbox).
**Ảnh chụp mã:** nhánh `feat/p1-1c4-mtls`.

---

## 0. Vì sao cờ bool cũ sống sót hai chặng — nó KHÔNG BẬT ĐƯỢC

`GRPC_REQUIRE_MTLS` có hai trạng thái, và đường giữa chúng đi qua một cửa sổ mọi RPC trả `Unauthenticated`: bật cờ khi server chưa có `grpc.Creds` là dựng một **cổng an ninh giả** — health probe xanh, dashboard xanh, không request nào chạy. Chính vì thế `config.Load` phải **từ chối khởi động** khi ai đó bật nó (`config.go:124–135` bản cũ).

Hệ quả: một cờ không ai dám động. Hạn chót mà chính R25 tự đặt — *"ngày `session.ts` (G12) nối vào"* — trôi qua ngày 2026-08-11 mà không ai dừng lại, và 1.C-3 còn thêm consumer **thứ hai** trên cùng cổng đó.

Đây không phải lỗi kỷ luật. Nó là lỗi **hình dạng cấu hình**: thiếu một nấc giữa thì không có đường nào bật mà không có cửa sổ chết, nên lựa chọn hợp lý duy nhất của mỗi chặng là hoãn.

**Ba nấc** `off | permissive | require`, **một biến dùng chung cho cả ba service**:

| nấc | server | client | dùng để |
|---|---|---|---|
| `off` | không TLS | plaintext h2c | trạng thái cũ (R25) |
| `permissive` | TLS, `VerifyClientCertIfGiven` | trình cert | **quan sát** ai đã cắm cert |
| `require` | TLS, `RequireAndVerifyClientCert` | trình cert | siết |

Một biến chứ không ba: ba giá trị riêng lẻ là ba cơ hội để chúng lệch nhau, và hậu quả của việc lệch (client chưa cert gặp server đã siết) chính là chế độ hỏng mà ba nấc sinh ra để tránh.

---

## 1. ⛔ Ranh giới thật của cái thang — nó bảo vệ chiều CERT, không bảo vệ chiều TLS

Điều dễ tin nhầm nhất về ba nấc: rằng `off → permissive` là một bước êm. **Không phải.** `permissive` khoan dung với việc *vắng cert*, nhưng nó vẫn là **TLS**, và một client plaintext (h2c) không nói chuyện được với nó. Bước êm thật sự chỉ có **một**: `permissive → require`.

Đo bằng chính probe, ở nấc `permissive`:

```
nấc permissive · probe dial h2c (không TLS)
  ReapSession → Unavailable: "error reading server preface: EOF"
```

Cùng probe đó ở `require` trả `connection reset by peer` — khác thông báo, cùng
kết luận: **plaintext không nói chuyện được với `permissive`.**

Nói cách khác: `off → permissive` bắt buộc cả ba service phải cuốn **cùng nhau**; cái thang không cứu được bước đó. Thứ nó cứu là bước sau — và đó cũng là bước duy nhất sẽ còn lặp lại (xoay CA, thêm consumer mới), nên giá trị của nó không giảm.

---

## 2. Đo trên cụm — bốn ca, ba mã trả về phân biệt được ba mức

Công cụ: [`cmd/mtls-probe`](../../../services/orchestrator/cmd/mtls-probe/), chạy **trong cụm** vì ba vế quan trọng nhất cần hai cert hợp lệ do **cùng một CA** ký, mà cert nằm trong Secret của cụm.

Mã trả về là thứ phân định, không phải "có lỗi / không lỗi":

| mã | nghĩa |
|---|---|
| `Unavailable` | bắt tay TLS hỏng |
| `PermissionDenied` | bắt tay XONG, authz từ chối |
| `NotFound` | authz CHO QUA, lifecycle chạy thật |

| ca | `permissive` | `require` | đọc ra sao |
|---|---|---|---|
| plaintext (h2c) | `Unavailable` <br>*server preface: EOF* | `Unavailable` <br>*connection reset by peer* | cả hai nấc đều là TLS |
| TLS, **không** cert | `PermissionDenied` <br>*chỉ chấp nhận trên kết nối in-cluster đã xác thực* | `Unavailable` <br>***tls: certificate required*** | **đây là khác biệt đo được giữa hai nấc** |
| cert của **web** | `PermissionDenied` <br>*CommonName không được cấp quyền* | `PermissionDenied` <br>*CommonName không được cấp quyền* | ghim CN |
| cert của **gateway** | `NotFound` <br>*session không tồn tại* | `NotFound` <br>*session không tồn tại* | authz CHO QUA, lifecycle chạy thật |

Hàng thứ hai là hàng mang toàn bộ ý nghĩa của cái thang: ở `permissive` bắt tay
**thành công** rồi authz mới từ chối; ở `require` bắt tay **hỏng hẳn** với
`tls: certificate required`. Hai mã khác nhau ⇒ hai nấc là hai trạng thái thật,
không phải hai tên gọi của cùng một thứ.

**Ca `gateway → NotFound` là ca quan trọng nhất, không phải ca phụ.** Một bộ acceptance chỉ toàn kết cục ĐỎ không phân biệt được "chặn đúng chỗ" với "chặn tất cả"; đây là ca duy nhất chứng minh nhánh `system_component` thật sự MỞ được.

**Ca `web → PermissionDenied` là ca chứng minh mTLS PHÂN QUYỀN được.** `apps/web` cầm một cert hoàn toàn hợp lệ do đúng CA của cụm ký — và vẫn bị từ chối nhánh `system_component`. Không có phép ghim CN thì "có cert = làm được mọi thứ hệ thống làm được", và lỗ hổng đó **im lặng**: đường `user_id` của web vẫn chạy đúng nên không test chức năng nào đỏ.

---

## 3. Đường người dùng còn sống sau khi siết

Ba phép, tất cả ở nấc `require`:

**1. `apps/web` → orchestrator (kênh connect-node TLS).** `POST /api/trpc/session.create`
sau một lượt `sign-up/email` thật:

```
http=200
session.id = 7196ba5674fd5fc404b6f1c02ce215c8
podName    = sandbox-929a715f3bf1
status     = 3
set-cookie: dlp_sandbox=eyJhbGciOiJFZERTQSIsImtpZCI6…
```

Đây là lần ĐẦU TIÊN vế Node của chặng này chạy thật — review đối kháng chỉ đúng
rằng trước đó nó chưa từng được đo, và CI ghim `GRPC_MTLS_MODE=off`.

**2. gateway → orchestrator (kênh Go).** ⛔ Log `"kênh tới orchestrator dùng mTLS"`
**KHÔNG** chứng minh bắt tay: `grpc.NewClient` là **lazy**, nối thật chỉ xảy ra ở
RPC đầu tiên. Phải ép một `ExtendSession` thật:

```
handshake: HTTP/1.1 101 Switching Protocols
giữ phiên 81s · pong đã trả=4 · byte nhận=14081 · thấy dấu vết lệnh=True

dlp_gateway_extend_total{result="ok"}    0  →  1
dlp_gateway_extend_total{result="error"} 0     0
```

**3. Terminal vẫn gõ được.** Cùng phiên trên: WS 101, `init` 120×34, gõ
`echo mtls-1c4-ok` và nhận lại đúng dấu vết trong 14081 byte từ pod.

*Hai lượt đo đầu THẤT BẠI và cả hai là lỗi của phép đo, không phải của mã* —
ghi lại vì cả hai đều cho "metric extend = 0" mà không lỗi nào:
- lượt 1: client thô **không trả pong**, nên server huỷ phiên ở mốc ping 20s +
  pongTimeout 10s và nhánh extend (60s) **không bao giờ tới**. Trình duyệt trả
  pong ở tầng dưới nên FE không phải viết dòng nào — một client tự viết thì phải.
- lượt 2: giữ phiên 76s, vẫn dưới ngưỡng an toàn của ticker 60s sau khi trừ thời
  gian bắt tay. Nâng lên 80s mới chắc.

---

## 4. Ba thứ chỉ lộ ra khi ĐO

### 4.1 `ReapSession` kiểm `ready()` TRƯỚC authz — hai test xanh mà chưa chạy dòng nào

`ReapSession` gọi `s.ready()` rồi mới `resolveReapActor`. Với `lifecycle=nil`, mọi lời gọi dừng ở `Unavailable` và **toàn bộ nhánh authz — gồm cả phép ghim CN — không bao giờ chạy**.

Bản đầu của `mtls_test.go` dùng `nil` cho gọn. Hai ca ghim CN khi đó **xanh trọn vẹn** trong khi chưa thực thi một dòng nào của thứ chúng khẳng định đang gác. Phát hiện khi hai ca khác đỏ với thông báo `Unavailable` thay vì `PermissionDenied` — nếu chúng cũng "xanh cho tiện" thì lỗi này đã đi vào PR.

### 4.2 Client Go KHÔNG gửi cert do CA lạ ký — nên cấu hình nhầm CA không cho lỗi TLS nào

Ở bước `CertificateRequest`, server công bố danh sách CA nó chấp nhận (`ClientCAs`), và client Go **chỉ gửi cert khớp danh sách đó**. Một cert do CA lạ ký vì thế không bao giờ được gửi — client tự rơi về "không cert".

Hệ quả cho người vận hành, và nó ngược với trực giác: **cấu hình nhầm CA KHÔNG cho lỗi TLS.** Nó cho `PermissionDenied` ở nhánh `system_component` — một thông báo nói về **authz** trong khi nguyên nhân nằm ở **cert**. Lần chẩn đoán đó nếu không biết trước sẽ bắt đầu từ chỗ sai.

Khẳng định "cert CA lạ làm hỏng bắt tay" chỉ đúng với bên **cố tình** gửi (kẻ tấn công), và chỉ dựng được trong test bằng `GetClientCertificate` — hàm bỏ qua phép lọc theo CA. Cả hai đường nay đều có ca riêng: `TestPermissiveVanChanCertCuaCALa` (kẻ tấn công) và `TestClientLichSuKhongGuiCertCALa` (cấu hình nhầm).

### 4.3 Kiểm đột biến BÁC BỎ một comment của chính chặng này

Comment nháp của `PeerTrust.CommonName` viết: *"đọc nhầm `PeerCertificates` nghĩa là allowlist CN biến thành trang trí"*. Kiểm đột biến bác bỏ: đổi sang `PeerCertificates` **không làm test nào đỏ**.

Lý do đúng chứ không phải test yếu — với `ClientAuth` hiện tại, `crypto/tls` đã verify xong **trước khi** interceptor chạy, nên hai mảng chứa cùng một cert. Guard là tuyến phòng thủ **thứ hai**, và nó chỉ ăn tiền ở đúng một ca: ngày `ClientAuth` bị hạ xuống `RequireAnyClientCert` (hằng KHÔNG verify).

Đã viết `TestGuardVerifiedChainsChanCertChuaVerify` dựng đúng cấu hình đó — nay đột biến `PeerCertificates` đỏ **đúng một ca** — và sửa comment theo ranh giới **đo được** thay vì ranh giới mong muốn.

> **Bài học chung, tách khỏi ca cụ thể:** một comment khẳng định điều gì đó là nguy hiểm, mà không có ca nào chứng minh, thì không phải phòng thủ — nó là bình luận. Kiểm đột biến là phép thử duy nhất phân biệt hai thứ đó, và ở đây nó bác bỏ chính tác giả.

---

## 5. Kiểm đột biến — bốn phép, mỗi phép đỏ đúng chỗ

| đột biến | test đỏ |
|---|---|
| `permissive` dùng `RequireAndVerifyClientCert` | `TestPermissiveChoQuaClientKhongCert`, `TestClientLichSuKhongGuiCertCALa`, `TestServerConfigDatDungClientAuthTheoNac` |
| bỏ ghim CN (`slices.Contains` → luôn đúng) | **chỉ** `TestGhimCNChanWebDungNhanhSystemComponent`, `TestAllowlistRongThiKhongAiDuocSystemComponent` |
| `ParseMode` rơi về `off` thay vì lỗi | **chỉ** `TestParseModeChuoiLaLaLoiChuKhongRoiVeOff`, `TestMTLSModeLaChuoiLaThiTuChoi` |
| bỏ guard `VerifiedChains`, tin `PeerCertificates` | **chỉ** `TestGuardVerifiedChainsChanCertChuaVerify` |

**Một phát hiện về chính phép kiểm:** hai lượt đầu cho kết quả "không test nào đỏ" mà thực ra là **đột biến không biên dịch được** — `sed` cắt giữa một biểu thức nhiều dòng. Lỗi biên dịch và "không ca nào đỏ" nhìn giống hệt nhau nếu chỉ grep `--- FAIL`. Harness đã sửa để phân biệt hai thứ; không sửa thì mọi phép kiểm đột biến sau này đều có thể xanh giả theo đúng kiểu đó.

---

## 6. Cổng local

```
Go     355 → 359 PASS / 0 SKIP / 0 FAIL   (-race, Redis + Postgres THẬT)
lint   golangci-lint v2.12.2 · 0 issues trên cả 4 module (GOOS=linux)
gofmt  sạch      go vet  sạch
JS     web 82 → 95 test PASS (13 ca mới cho đường mTLS của Node)
env    66 biến / 4 scope — khớp code ↔ .env.example ↔ Helm ↔ CI
helm   render OK ở CẢ BA nấc; helm lint 0 chart failed
```

⚠ `go test` trả exit 0 khi MỌI ca tự skip, nên con số trên đếm bằng
`grep '^--- PASS'` chứ không tin exit code. `SKIP=0` là vế phải đọc cùng.

---

## 7. Chart: CA tự sinh, không cert-manager

`genCA`/`genSignedCert` + `lookup` trong [`templates/mtls-secret.yaml`](../../../infra/helm/platform/templates/mtls-secret.yaml).

**Vì sao không cert-manager:** cụm không có nó, và cài thêm là side-load ba image qua mạng VM ~52 KiB/s **cộng** một operator phải bảo trì — mà nó là thành phần của **CỤM**, không của chart, nên ai dựng lại lab phải nhớ cài trước. Chart tự sinh giữ được tính chất "một `helm install` là đủ".

**`lookup` là thứ giữ CA không đổi, và nó có một bẫy.** `genCA` sinh khoá MỚI mỗi lần render; không có nhánh `lookup` thì mỗi `helm upgrade` phát một CA khác, ba pod cuốn không đồng thời, và trong cửa sổ đó pod mang cert CA cũ nói chuyện với server tin CA mới ⇒ bắt tay hỏng. Triệu chứng là `Unauthenticated` rải rác **tự khỏi sau vài chục giây** — đúng loại lỗi bị đổ cho "mạng chập".

Bẫy: `lookup` **luôn** trả rỗng khi `helm template` / `--dry-run`. Nên `helm diff`/`template` sẽ **luôn** hiện cert đổi dù thực tế không đổi. Đó là hiện vật của công cụ, KHÔNG phải tín hiệu — đừng "sửa" nó bằng cách bỏ `lookup`.

Cert sinh ra (đọc từ Secret trên cụm):

```
ca.crt       subject=CN=platform-grpc-ca
server.crt   subject=CN=platform-orchestrator
             SAN: DNS:platform-orchestrator,
                  DNS:platform-orchestrator.default.svc,
                  DNS:platform-orchestrator.default.svc.cluster.local,
                  DNS:localhost, IP:127.0.0.1
gateway.crt  subject=CN=platform-gateway
web.crt      subject=CN=platform-web
```

Và mỗi pod **chỉ** nhận cert của chính nó (`items:` trong volume):

```
platform-orchestrator   ca.crt  server.crt  server.key
platform-gateway        ca.crt  gateway.crt gateway.key
platform-web            ca.crt  web.crt     web.key
```

SAN phải phủ **cả** tên Service ngắn **lẫn** FQDN: `crypto/tls` đối chiếu `ServerName` với SAN (CN đã bị bỏ từ Go 1.15), và hai client trong repo dial bằng hai dạng khác nhau. Thiếu một dạng thì lỗi là `bad certificate` — không trỏ về SAN.

---

## 8. Nợ mở ra từ chặng này

- **Release lab đang chạy `dev-1c4b`** (dựng từ nhánh, side-load tay), không phải tag `sha-*` do CI đóng. Đóng ngay sau khi PR merge — **side-load TRƯỚC, `helm upgrade` SAU**. *(Lần thứ sáu của cùng một món nợ; nó tái diễn ở MỌI chặng có đổi mã service.)*
- **Không có metric nào đếm "bao nhiêu kết nối đã trình cert đã verify".** Nấc `permissive` được bán như trạng thái QUAN SÁT, nhưng thứ cần quan sát để quyết định sang `require` thì không được đo — người vận hành chỉ có log `Warn` của từng lần bị từ chối. Chưa task nào sở hữu.
- **Không có quy trình xoay cert.** Cert 3650 ngày, và CA private key bị vứt ngay sau lần render đầu (chart không lưu nó), nên **không phát thêm cert được** cho một consumer thứ tư. Đường duy nhất hiện có là xoá hẳn Secret ⇒ CA mới ⇒ cả ba pod cuốn. Chấp nhận được ở lab, phải giải quyết trước P3.
- **`lookup` fail-open với RBAC.** Helm nuốt lỗi của `lookup` và trả map rỗng — không phân biệt "không có" với "không được phép đọc". Một ServiceAccount chạy `helm upgrade` mà thiếu `get secrets` sẽ **xoay CA mỗi lần upgrade trong im lặng**. Đã chặn được ca "Secret thiếu khoá" bằng `fail`, nhưng ca RBAC thì không phân biệt được từ trong template.
- **Không có probe/metric nào phát hiện "cổng gRPC đang từ chối 100% bắt tay".** Readiness là httpGet trên cổng khác. Mọi ca lệch CA đều biểu hiện là "pod Ready, dashboard xanh, tính năng chết".
- **`NewStreamDenyInterceptor` chưa có test qua kênh thật** — chỉ gọi trực tiếp hàm interceptor. Chưa ai gọi một stream RPC qua một kết nối gRPC thật để xác nhận `Unimplemented`.
