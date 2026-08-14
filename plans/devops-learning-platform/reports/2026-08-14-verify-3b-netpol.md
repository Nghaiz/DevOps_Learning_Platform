# 3.B — NetworkPolicy namespace nền tảng + seccomp — 2026-08-14

Chặng rủi ro cao nhất của P3 (score 20): namespace nền tảng **chưa từng có
NetworkPolicy nào**, và một chiều bị quên dưới default-deny làm chết sản phẩm
trong khi mọi pod vẫn `Running 1/1`.

Điều đáng kể nhất của chặng này không phải 13 policy, mà là **bốn thứ tôi tin
sai và phải tự bác bỏ trước khi chúng thành sự cố** — trong đó hai cái là do
chính tôi vừa viết ra, một cái là của plan, và một cái là ngữ nghĩa
NetworkPolicy mà tôi hiểu ngược.

## Tóm tắt

| Việc | Kết quả |
|---|---|
| 13 NetworkPolicy cho namespace nền tảng | sống trên cụm |
| 4 chiều kết nối **plan không có** | tìm được từ mã nguồn trước khi áp |
| Lỗi `podSelector` thiếu `matchLabels` (apiserver prune ⇒ chọn MỌI pod) | tự bắt lúc đọc render, sửa ở tầng helper |
| Ba cổng chặn cấu hình gắn nhầm vào `denyEnabled` | chuyển sang `enabled` sau khi đo |
| `netpol-verify.sh` 22 chiều, hai vế | **22/22**, có baseline TRƯỚC khi áp |
| Harness e2e | **14/14**, chạy lại lần hai với gateway cache rỗng |
| seccomp | plan nói "không chỗ nào đặt" — **sai**, đã đặt sẵn; đo + 2 đối chứng |
| Cổng CI mới + 8 kiểu bóp méo | 8/8 đỏ đúng chỗ — nhưng **bản đầu cho qua 1/8** |
| Vòng review đối kháng | 12 phát hiện; **3 cái vá lại chính bằng chứng của chặng** |

## Bốn chiều kết nối plan không có, và ba trong bốn hỏng IM LẶNG

Plan §3.B liệt kê 9 chiều "từ code, không từ trí nhớ". Đọc lại mã thì thiếu bốn:

| Chiều | Bằng chứng | Vì sao nguy |
|---|---|---|
| gateway → web:3000 | `GATEWAY_JWKS_URL`, `gateway-deployment.yaml:83` | JWKS cache **5 phút** (`authz/jwks.go:34`) ⇒ chặn xong hệ vẫn khoẻ suốt 5 phút rồi mới 401 mọi handshake. Đo ngay sau khi áp policy sẽ kết luận "vẫn tốt". |
| web → orchestrator:9090 | `ORCHESTRATOR_GRPC_ADDR`, `web-deployment.yaml:115` | mất `session.create/claim/get` — hỏng ồn ào, dễ thấy nhất trong bốn cái |
| orchestrator → postgres | `DATABASE_URL`, `lifecycle/audit.go:123` | audit là **tuỳ chọn theo thiết kế** (`main.go:290-292` log cảnh báo rồi chạy tiếp) ⇒ chặn nó KHÔNG làm gì đỏ, chỉ âm thầm mất log kiểm toán |
| Job `migrate` → postgres | helm hook `pre-upgrade`, `migrate-job.yaml:60` | hỏng **lệch pha**: lượt deploy áp policy thì xanh, lượt `helm upgrade` KẾ TIẾP mới treo ở hook |

Bốn chiều này đều đã được mở, mỗi chiều một khối có chú thích nêu lý do — chú
thích là thứ ngăn người sau gỡ nhầm một rule trông như dead code.

**Một bất đối xứng thì cố ý KHÔNG mở:** `sandbox-networkpolicy.yaml` cho phép
ingress từ gateway vào pod sandbox, nhưng exec hôm nay đi qua apiserver chứ
không dial thẳng, nên egress tương ứng không được mở. Mở một chiều chưa ai dùng
là nới quyền không lý do. Ghi rõ trong chart để ai bật đường dial-thẳng sau này
biết phải thêm egress ở đâu.

## Lỗi của chính tôi #1: `podSelector` thiếu `matchLabels` ⇒ chọn MỌI pod

`platform.selectorLabels` phát ra các dòng nhãn **trần**, còn `podSelector` là
một `LabelSelector` — nhãn phải nằm dưới `matchLabels:`. Bản đầu tôi viết:

```yaml
  podSelector:
    app.kubernetes.io/name: platform      # ← nhãn trần, SAI
    app.kubernetes.io/component: web
```

`helm lint` xanh. Và apiserver **nhận** — field lạ trên kiểu có sẵn bị **prune
trong im lặng**, còn lại `podSelector: {}`, tức policy chọn **mọi pod trong
namespace** thay vì đúng một component. Một rule allow bị prune như thế biến
thành rule cấp quyền cho tất cả.

Đây đúng lớp sự cố của `maxRequestBodyByte` ở 3.A. Bắt được vì **đọc bản render
thay vì tin bản template**.

Khác 3.A ở một điểm quan trọng: `kubeconform -strict` **CÓ** bắt được ca này —
NetworkPolicy là kiểu **có sẵn** nên có schema, còn Middleware của Traefik là
CRD và bị `-ignore-missing-schemas` bỏ qua (chính là `Skipped: 4` mà tôi đã đọc
lướt ở 3.A). Đo:

```
GOOD  (matchLabels)  → Valid: 1   exit=0
BROKEN (nhãn trần)   → additional properties 'app.kubernetes.io/component' not allowed   exit=1
```

Sửa ở **tầng helper** chứ không sửa 15 chỗ gọi: thêm `platform.netpolComponent`
bọc sẵn `matchLabels:`, và chú thích cấm gọi thẳng `platform.selectorLabels`
trong NetworkPolicy. Lỗi không thể tái diễn bằng cách gõ thiếu một dòng.

## Lỗi của chính tôi #2: hiểu ngược ngữ nghĩa "allow trước, deny sau"

Plan viết *"áp allow trước, verify, rồi mới áp default-deny"* với lý lẽ ngầm là
"chưa deny thì chưa siết". **Sai.** Trong Kubernetes, ngay khi MỘT policy chọn
trúng một pod với `policyTypes: Egress`, egress của pod đó lập tức bị thu về
đúng những gì các policy khớp liệt kê — **không cần default-deny**.

Hệ quả thực hành ngược với trực giác: **rủi ro nằm ở bước áp `allow-*`**, không
ở bước bật `denyEnabled`. Bật deny chỉ phủ nốt phần còn hở: pod không được policy
nào chọn, và egress của postgres/redis.

Thứ tự hai pha **vẫn đúng và vẫn giữ**, nhưng vì lý do khác: để tách hai phép đo.
Đã sửa lại lý lẽ trong chart và trong values thay vì để nguyên một "vì sao" sai —
một "vì sao" sai còn tệ hơn không có, vì người sau sẽ tin nó.

Và điều này có hệ quả cụ thể ở mục dưới.

## Lỗi của chính tôi #3: ba cổng chặn gắn nhầm vào `denyEnabled`

Bản đầu chỉ `fail` khi `denyEnabled=true`, theo đúng lý lẽ sai ở trên. Đo bản
render mới thấy hậu quả xảy ra ngay từ `enabled=true`:

```yaml
# nodeCidrs rỗng ⇒ rule probe render thành:
  ingress:
    - from:                     ← RỖNG
      ports:
        - port: 3000
```

Trong NetworkPolicy, `from` rỗng nghĩa là **KHỚP MỌI NGUỒN**. Rule sinh ra để
cho kubelet probe đi qua biến thành rule **mở cổng 3000/8083/8081 cho tất cả**,
phá đúng ba policy ingress vừa dựng. Hỏng theo hướng **nới lỏng** — không có gì
đỏ để mà nhìn.

Ba cổng nay gắn vào `enabled`, và mỗi thông báo nêu rõ hậu quả + lệnh lấy giá
trị đúng:

| Cấu hình thiếu | Hậu quả nếu lọt |
|---|---|
| `apiServerEndpoints` | `egress:` rỗng ⇒ gateway mất exec, orchestrator mất quyền tạo pod — **cả sản phẩm chết**, pod vẫn Running 1/1 |
| `nodeCidrs` | `from:` rỗng ⇒ mở 3 cổng cho mọi nguồn (nới lỏng, không triệu chứng) |
| `datastoreExternalEgress` khi `datastore.enabled=false` | `egress:` của orchestrator/migrate rỗng ⇒ mất đường tới DB |

Cái thứ ba là một bẫy tôi suýt ship: **`datastore.enabled` mặc định là `false`**
(values.yaml và hồ sơ cloud dùng DB quản lý ngoài cụm), và các rule datastore
ghim theo `podSelector` — ngoài cụm thì không có pod nào để ghim. Nếu để
`networkPolicy.platform.enabled: true` làm mặc định, mọi cài đặt dùng DB ngoài
sẽ mất đường tới DB **trong im lặng**. Vì thế mặc định là `false`, bật có ý thức
qua `infra/host/09-networkpolicy.sh` — cùng khuôn với `ingress.middleware.enabled`.

## Đo trên cụm — và baseline là thứ làm cho kết quả có nghĩa

`netpol-verify.sh` kiểm 21 chiều, **hai vế**: 12 chiều phải THÔNG, 9 chiều phải
BỊ CHẶN. Vế thứ hai mới là vế có giá trị — trên một cụm mà CNI không thực thi
NetworkPolicy, mọi vế PASS vẫn xanh y hệt.

**Chạy TRƯỚC khi áp bất cứ thứ gì** (đây là đối chứng âm của cả chặng):

```
PASS-đúng-mong-đợi: 12    LỆCH: 9      ← cả 9 ô BLOCK đều PASS
```

Chín ô "phải bị chặn" đều đi lọt. Điều đó chứng minh hai thứ cùng lúc: namespace
nền tảng **thật sự đang mở toang** (xác nhận §0.1 bằng phép đo chứ không bằng
việc đếm file), và **probe có khả năng phát hiện một đường mở**. Thiếu lượt chạy
này thì mọi ô BLOCK xanh về sau không phân biệt được với một script hỏng.

Sau pha **allow**: 20/21. Ô lệch duy nhất là `POD LẠ → apiserver`, và nó lệch
**đúng như lý thuyết**: pod lạ không mang nhãn release nên **không policy allow
nào chọn nó** ⇒ egress của nó chưa bị ràng buộc. Nó bị chặn khỏi postgres/redis/web
là nhờ **ingress** của các đích đó, còn apiserver không phải pod nên không có
ingress policy nào che. Đây chính là phần mà `default-deny` thêm vào.

Sau pha **deny**: **21/21**.

```
OK | web → gateway:8082 (chấm bài)          | PASS  | PASS  |    338ms
OK | gateway → web:3000 (JWKS)              | PASS  | PASS  |    400ms
OK | gateway → apiserver (pods/exec)        | PASS  | PASS  |    383ms
OK | migrate → postgres:5432 (helm hook)    | PASS  | PASS  |    437ms
OK | POD LẠ → postgres:5432   [AC-B2]       | BLOCK | BLOCK |  20332ms
OK | gateway → postgres:5432 (không phận sự)| BLOCK | BLOCK |   3327ms
OK | web → apiserver (leo thang)            | BLOCK | BLOCK |   3313ms
OK | web → internet 1.1.1.1:443             | BLOCK | BLOCK |   3482ms
```

### Cột thời gian nói ra một thứ mà pass/fail giấu

`nc` trả cùng exit code cho "bị chặn" và "bị từ chối", nên script đo thời gian:
gói bị THẢ ⇒ chờ hết timeout (~3.4s); bị TỪ CHỐI ⇒ RST về ngay (~0s). Không có
cột này thì một ô BLOCK xanh nhờ dịch vụ chết đọc y hệt một ô xanh nhờ hàng rào.

Nó còn bắt được một thay đổi **định tính** giữa hai pha: ô `POD LẠ → postgres`
từ **3366ms** (allow) lên **20332ms** (deny). 20s là timeout **DNS**, không phải
timeout TCP.

Lúc đầu tôi đọc con số đó thành tin tốt ("hàng rào đã dịch từ ingress của đích
sang egress của nguồn"). Vòng review chỉ ra nó còn là **một lời cảnh báo về
chính phép đo**, và điều đó đúng — xem mục dưới.

### Giới hạn thật của AC-B2, ghi ra để không ai tin quá mức

NetworkPolicy phân biệt theo **nhãn**. Pod lạ bị chặn vì nó không mang nhãn
`component=web`. Kẻ **tạo được pod** trong namespace này với nhãn đó sẽ qua được
rule. Hàng rào cho việc ĐÓ là RBAC trên quyền tạo pod, không phải file này. Đây
là phòng thủ chiều sâu chống lateral movement từ một workload **bị chiếm**, không
phải chống một kẻ đã có quyền tạo pod tuỳ ý.

## AC-B4 — và vì sao phải chạy harness HAI lần

Lần một: **14/14** ngay sau khi áp default-deny.

Nhưng lượt đó **không chứng minh được chiều JWKS**: gateway đã cache JWKS 5 phút
từ trước khi policy được áp, nên nó có thể xanh cả khi chiều gateway→web bị chặn.
Đúng cái bẫy tôi đã tự ghi vào chart.

Nên restart gateway để xoá cache rồi chạy lại:

```
gateway pod = platform-gateway-8954b6df7-gnllv   start 2026-08-14T02:20:55Z
=== 14/14 PASS ===
```

WS handshake trong harness đòi xác thực token sandbox bằng JWKS; với cache rỗng
điều đó buộc phải là một lượt tải thật từ `web:3000` qua mạng đã bị siết.

> Một sai sót đọc số của chính tôi ở bước này: lượt đầu tôi lấy
> `items[0]` ngay sau `rollout status` và trúng pod **đang terminate**, nên kết
> luận nhầm "restart không xảy ra". ReplicaSet mới mới là chỗ có câu trả lời.

## seccomp — plan sai ở cả hai vế, và tôi không phải sửa gì

Plan §0.4: *"Không chỗ nào đặt `seccompProfile`. PSA `enforce=baseline` KHÔNG
đòi seccomp profile."* Cả hai vế đều sai:

1. **Đã đặt sẵn** — `podspec.go:129`, `SeccompProfileTypeRuntimeDefault`. Pod
   sandbox do orchestrator sinh bằng **mã Go**, không bằng YAML; scout chỉ tìm
   trong `sandbox-*.yaml` là tìm sai chỗ.
2. **PSA baseline CÓ chặn seccomp** — nó cấm `type: Unconfined`.

Ba phép đo, và hai cái sau là đối chứng:

```
(+) pod sandbox thật, đọc trên HOST (không đọc trong pod — Sysbox biên tập thứ
    `kubectl exec` nhìn thấy):
      /pause          Seccomp: 2  Seccomp_filters: 2
      tini            Seccomp: 2  Seccomp_filters: 2
      sleep infinity  Seccomp: 2  Seccomp_filters: 2
      dockerd         Seccomp: 2  Seccomp_filters: 2   ← DinD lồng vẫn có filter
      containerd      Seccomp: 2  Seccomp_filters: 2

(−) cố tình tạo pod Unconfined trong dlp-sandbox:
      Forbidden: violates PodSecurity "baseline:latest": seccompProfile
      (pod must not set securityContext.seccompProfile.type to "Unconfined")
      ⇒ KHÔNG opt-out được, kể cả khi cố tình

(−) pod không khai seccompProfile (ns default):
      sleep 120       Seccomp: 0  Seccomp_filters: 0   ← phép đo ĐỌC ĐƯỢC số 0
```

Đối chứng thứ ba mới là thứ làm số "2" có nghĩa: nó chứng minh phép đo phân biệt
được có-filter với không-filter. **AC-B5 xanh mà không phải sửa dòng nào**, và
xung đột Sysbox mà plan lo ngại không tồn tại — kể cả với Docker lồng trong.

> Bẫy đã dính rồi tự bắt: lượt đo đầu tôi lấy pod UID vào biến rỗng, và
> `grep -l "" /proc/*/cgroup` khớp **mọi tiến trình host** ⇒ in ra một bảng
> `Seccomp: 0` rất thuyết phục cho các **kernel thread**. Dấu hiệu lộ ra là
> `cmdline` rỗng. Đã thêm guard chặn biến rỗng.

## Cổng CI mới — và bản đầu cho qua 1 trong 8 kiểu hỏng

Không bộ values nào bật `networkPolicy.platform.enabled`, nên **CI sẽ không bao
giờ render 13 manifest mới** nếu không thêm bước — đúng khoảng mù mà 3.A đã phải
vá cho nhánh middleware.

Cổng ngữ nghĩa nằm ở `infra/k8s/netpol_render_gate.py`, **bổ sung** cho
kubeconform chứ không thay thế: kubeconform kiểm schema, còn ba kiểu hỏng nguy
hiểm nhất ở đây đều **hợp lệ về schema** — `egress: null` (chặn sạch),
`from: []` (mở toang), thiếu `ports:` (mở mọi cổng).

Khác 3.A ở cách chống trôi: 3.A phải trích phép kiểm *"verbatim từ chính
workflow"* rồi chạy tay. Ở đây CI và người chạy tay gọi **cùng một file**, nên
không có gì để trôi.

Chạy cổng trên chart thật + 8 bản bị bóp méo:

```
OK   BASELINE deny                                exit=0
OK   BASELINE mặc định (enabled=false)            exit=0
OK   A. podSelector mất matchLabels (prune)       exit=1
OK   B. một rule mất ports (mở mọi cổng)          exit=1
OK   C. nodeCidrs rỗng ⇒ from rỗng (mở toang)     exit=1
OK   D. gỡ hẳn allow-egress-migrate               exit=1
OK   E. default-deny không phủ pod lạ             exit=1
OK   F. apiserver dùng selector (không khớp)      exit=1
OK   G. postgres nhận từ MỌI pod trong ns         exit=1
OK   H. đổi tên allow-ingress-redis               exit=1
OK   BASELINE lại (phải vẫn xanh)                 exit=0
```

**Lượt đầu, G lọt.** Bóp méo G đặt `podSelector: {}` **bên trong** một peer của
`from:` — nghĩa là "mọi pod trong namespace". Rule đó trông hoàn toàn bình
thường: `from` không rỗng, `ports` đúng, `spec.podSelector` của policy vẫn ngặt.
Cổng bản đầu chỉ kiểm selector của **chính policy** nên mù hoàn toàn với ca này,
và hậu quả là postgres nhận kết nối từ mọi pod — **phá đúng thứ AC-B2 đo**.

Đã thêm phép kiểm peer rỗng/wildcard. Nếu không chạy bộ bóp méo thì cổng này đã
được ship trong trạng thái xanh-nhưng-mù, y hệt cổng của 3.A.

Cổng CI còn gác **vế ngược** cho cả ba cổng chặn cấu hình: nếu tổ hợp nguy hiểm
render ĐƯỢC thì bước đó đỏ, và thông báo phải đúng lý do (không chỉ "chết là
được"). Một cổng chỉ kiểm đường đúng sẽ xanh cả sau khi ai đó gỡ mất chính nó.

## Vòng review đối kháng — ba phát hiện vá lại chính BẰNG CHỨNG của chặng

Một vòng review đối kháng chạy sau khi tôi đã tự thấy đủ. Nó không tìm được chiều
kết nối nào bị thiếu (đã kiểm chéo lại từ mã), nhưng tìm ra **12 điểm**, và ba
trong số đó tấn công đúng thứ chặng này dựa vào để tự tin: **phép đo**.

### R1 — ô AC-B2 xanh vì lý do SAI ở pha deny

Pod lạ probe `platform-postgres` **theo TÊN**. Dưới default-deny, egress của pod
lạ — kể cả UDP/53 — bị chặn, nên request chết ở khâu **phân giải tên**, không ở
`allow-ingress-postgres`. Hệ quả thẳng thừng: **xoá hẳn policy đó thì ô vẫn
xanh**. Ô AC duy nhất mà chặng này tồn tại vì nó lại không đo thứ nó tự nhận.

Dấu hiệu đã nằm ngay trong số tôi báo cáo — 3.4s vọt lên **20.3s** — và tôi đọc
nó thành tin tốt thay vì thành cảnh báo. 20s là timeout DNS.

Sửa: pod lạ probe bằng **ClusterIP**, bỏ DNS khỏi đường đi. Số đo mới: **3410ms**
(TCP bị thả) thay vì 20332ms (DNS chết).

Và ghi ra điều mà bản đầu lờ đi: hai pha đo **hai thứ khác nhau** —
pha allow đo `allow-ingress-*` của đích, pha deny đo egress-deny của nguồn; dưới
deny thì `allow-ingress-*` là phòng thủ chiều sâu và **không probe nào tách riêng
được** (mọi pod có egress tới postgres đều nằm trong danh sách ingress của nó).

### R2 — `nc` và `kubectl exec` dùng chung một exit code

`rc≠0` được đọc thành "BLOCK". Nhưng pod bị evict, container restart, apiserver
nấc, hay gõ sai tên Service cũng cho `rc≠0`. Với 12 ô PASS lỗi đó ồn ào và tự lộ;
với 9 ô BLOCK nó **im lặng** — tức đúng nửa có giá trị của script mang một kênh
xanh-giả hệ thống.

Sửa: chạy `sh -c 'nc …; echo RC=$?'` và parse `RC=`, để "nc bảo không nối được"
tách khỏi "không chạy nổi nc". Thiếu `RC=` ⇒ ô báo **LỖI**, không báo BLOCK.

### R3 — cột thời gian được TÍNH, được GIẢI THÍCH, rồi không bao giờ được KIỂM

Bản đầu đo `dur`, viết hẳn một khối chú thích về việc nó phân biệt "bị thả" với
"bị từ chối"… rồi chỉ **in** ra. Dựng xong cái phân biệt rồi bỏ đó không dùng.

Sửa: ô BLOCK trả về dưới `TIMEOUT×0.9` bị đánh **LỆCH** kèm lý do — RST hoặc dịch
vụ chết không phải là hàng rào.

### Các phát hiện còn lại đã sửa

| Phát hiện | Vì sao nó quan trọng | Sửa |
|---|---|---|
| `.subsets[0].addresses[0]` — chỉ endpoint apiserver ĐẦU TIÊN | Trên control-plane HA (3 địa chỉ) policy chỉ mở 1/3 mà ô VẪN xanh, vì probe đi đúng vào cái đã mở. Hỏng ~2/3 số lượt attach — "thỉnh thoảng lỗi", lớp khó quy nguyên nhân nhất | duyệt TẤT CẢ endpoint ở cả script verify lẫn script bật |
| Cổng trong rule là `service.*Port`, không phải **containerPort** | Cùng lý lẽ post-DNAT tôi dùng cho apiserver: kube-proxy dịch sang `targetPort` TRƯỚC khi policy được đánh giá. Hôm nay hai số trùng nhau nên vô hại; đổi `service.publicPort` (hợp lệ — Service vẫn chạy vì `targetPort` là TÊN) sẽ giết cả ba chiều web↔gateway↔orchestrator với render sạch | helper hằng số cổng container + **cổng CI đối chiếu với `containerPort` trong deployment** |
| Cổng datastore chỉ rẽ trên `datastore.enabled` | `datastore.enabled=true` + `postgres.enabled=false` (RDS ngoài + Redis trong cụm) là cấu hình hợp lệ, và bản đầu render một rule trỏ tới pod postgres **không tồn tại** ⇒ không bao giờ khớp, im lặng | vị từ theo TỪNG store, dùng lại đúng công thức `migrate-job.yaml` đã có |
| Ba cổng chỉ kiểm "khác rỗng" | Mọi giá trị nguy hiểm đều khác rỗng. `nodeCidrs: [0.0.0.0/0]` mở 3 cổng cho toàn internet — **tệ hơn** ca rỗng, vì nó là một dòng tường minh người đọc sẽ tưởng là cố ý | thêm kiểm ĐỘ RỘNG: prefix < /16 ⇒ `fail` |
| `webExternalEgress.except` không có cổng nào | `--set …except=null` ⇒ `except: null` ⇒ pod web được mở 0.0.0.0/0 **không loại trừ gì**, biến một lỗ SSRF thành đường vào mọi dịch vụ nội bộ | `fail` khi bật mà `except` rỗng |

> **Một lỗi Helm kinh điển lộ ra khi vá:** `include` luôn trả về **string**, và
> mọi chuỗi khác rỗng đều truthy — **kể cả `"false"`**. Helper
> `netpolStoreInCluster` bản đầu phát ra `false`, nên mọi `if include …` gọi nó
> đều đọc ra TRUE và ba cổng chặn rẽ nhầm nhánh trong im lặng. Bộ thử vế-ngược
> bắt được (ô "postgres ngoài cụm" render được thay vì chết). Nay helper phát ra
> `"true"` hoặc **chuỗi rỗng** — giá trị falsey duy nhất an toàn để trả từ `include`.

### Chưa sửa, đã ghi

- **Probe kubelet mở 3000/8083/8081 cho MỌI nguồn có IP node** — không riêng
  kubelet: pod hostNetwork bất kỳ, tiến trình trên node, traffic bị SNAT về node.
  Hai cổng đó phục vụ `/metrics` không authz. Vẫn **siết hơn trước 3.B** (trước
  đó mọi pod đều tới được), nên là rủi ro tồn dư chứ không phải hồi quy — nhưng
  chú thích cũ nói hẹp hơn thực tế và đã được sửa lại.
- **`kubectl port-forward` tới postgres/redis/gateway:8082/orchestrator:9090 nay
  không dùng được** (traffic đi từ netns của node). web:3000 vẫn được, nên hỏng
  **bất đối xứng** và dễ chẩn nhầm thành lỗi Postgres. Đây là đường debug mà
  chính `migrate-job.yaml` và thông báo `fail` của `web-deployment.yaml` chỉ dẫn.
- **`k8s-app: kube-dns`** đúng trên kubeadm nhưng không phải mọi bản phân phối;
  NodeLocal DNSCache (hostNetwork) không selector nào bắt được.
- **`CHART` mặc định trỏ `~/dlp-chart-p3b`** trong `09-networkpolicy.sh` — cùng
  họ với bẫy `~/dlp-deploy` đã cắn hai lần.

## Bảng ô AC

| Ô | Kết quả | Bằng chứng |
|---|---|---|
| **B1** mọi chiều đúng mong đợi | ✅ | `netpol-verify.sh` **22/22** (13 thông + 9 chặn) sau vòng review. Baseline trước khi áp: 9/9 ô BLOCK đều PASS ⇒ probe biết phát hiện đường mở. Ô thứ 13 là ô đo **tiền đề post-DNAT** (probe apiserver QUA ClusterIP, 346ms) — tiền đề mà cả thiết kế ipBlock dựa vào và trước review chưa từng được đo |
| **B2** pod lạ không chạm được datastore | ✅ | pod không nhãn release → postgres/redis **BLOCK 3410ms** khi probe bằng **ClusterIP** (TCP bị thả). Trước khi áp: **PASS**. Bản đầu probe theo TÊN và xanh vì DNS chết — xem R1. Giới hạn label-based ghi rõ ở trên |
| **B3** sandbox vẫn bị cô lập | ✅ | `curl https://example.com` → exit 28; `curl 169.254.169.254` → exit 28; đối chứng dương: DNS trong pod vẫn resolve ⇒ pod không phải "chết mạng" |
| **B4** harness e2e | ✅ | **14/14** sau default-deny, và **14/14 lần hai** với gateway vừa restart (cache JWKS rỗng ⇒ buộc tải thật qua mạng đã siết) |
| **B5** seccomp | ✅ | `Seccomp: 2`/2 filters trên MỌI tiến trình pod sandbox kể cả `dockerd`, đo trên host. Hai đối chứng: PSA từ chối `Unconfined`; pod không khai profile đọc ra `Seccomp: 0` |

## Cổng đã chạy

```bash
helm lint infra/helm/platform -f {values,values-selfhost,values-cloud}.yaml   # 3/3 sạch
helm template … --set networkPolicy.platform.enabled=true                     # 12 policy
helm template … --set networkPolicy.platform.denyEnabled=true                 # 13 policy
helm template … (mặc định)                                                    # 0 policy nền tảng
kubeconform -strict … -kubernetes-version 1.34.0                              # Valid: 45, Skipped: 0
bash gate-distort.sh                                                          # 8/8 bóp méo đỏ, 2 baseline xanh
```

`Skipped: 0` — đáng ghi, vì đúng con số này ở 3.A (`Skipped: 4`) là chỗ tôi đọc
lướt và để lọt một kiểu hỏng.

## Còn lại

1. **`webExternalEgress` chưa từng bật.** Trên lab hai client id OAuth là
   `placeholder` nên không cần. Khi bật đăng nhập Google/Microsoft thật, phải
   bật cờ này, nếu không Better Auth mất đường đổi authorization-code → token và
   **đăng nhập hỏng theo kiểu chỉ xảy ra với người dùng thật**, không harness nào
   hiện có bắt được.
2. **`datastoreExternalEgress` chưa được đo trên cụm nào** — nhánh `helm template`
   có kiểm, nhưng chưa có cụm dùng DB ngoài để chạy thật. Đây là nhánh mặc định
   của `values.yaml`, nên nó sẽ được đi qua trước bất kỳ lần deploy cloud nào.
3. **Một node duy nhất.** `nodeCidrs` sinh từ `kubectl get nodes` nên tự đúng khi
   thêm node, nhưng chưa đo trên cụm nhiều node. Cùng nợ với
   `externalTrafficPolicy: Local` của 3.A.
4. **Pod probe của `netpol-verify.sh` mang nhãn thật của component.** Chúng bị ép
   `readinessProbe: false` vĩnh viễn nên không bao giờ vào endpoint của Service —
   nhưng đây là một cơ chế tinh tế, và nếu ai đó bỏ dòng đó đi thì script chẩn
   đoán sẽ **nhận lưu lượng người dùng thật**. Đã ghi cảnh báo ngay trên dòng.
5. **Ephemeral/`kubectl debug` chưa dùng.** Probe theo nhãn kiểm đúng *policy*,
   không kiểm *pod thật*. Vế pod thật hiện dựa vào harness 14/14. Nếu sau này cần
   bằng chứng trực tiếp trên pod thật thì `kubectl debug --target` là đường đi.
6. **Tài khoản thử trong DB lab** tiếp tục tích thêm mỗi lượt harness (nợ mang
   sang từ 3.A).
