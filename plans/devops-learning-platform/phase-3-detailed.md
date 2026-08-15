# Phase 3 — Hardening & tải (DETAILED)

**Mức chi tiết:** DETAILED · **Effort:** L · **Blocks:** production go-live · **Blocked by:** P1, P2 (đều xong)
**Chi tiết hoá từ:** [`phase-3.md`](phase-3.md) (SKETCH) · **Ngày:** 2026-08-14

> Sketch có 9 task. Bản này giữ nguyên 9 task nhưng **đánh số lại theo phụ thuộc**
> và chốt ô AC đo được cho từng chặng. Ba giả định của sketch đã bị scout bác bỏ —
> xem §0 trước khi đọc phần còn lại, vì chúng đổi phạm vi thật của 3 trên 9 task.

---

## §0. Scout đã bác bỏ ba giả định của sketch

Ghi lại ở đây vì mỗi mục đổi khối lượng thật của một task, và nếu không ghi thì
lần sau lại đi lại đúng đường cũ.

### 0.1 — "NetworkPolicy đầy đủ" đã xong, nhưng KHÔNG ở chỗ sketch nghĩ

Sketch task 3 viết *"default-deny hoàn chỉnh: chặn lateral pod↔pod, chặn
`169.254.169.254`"* như thể chưa có gì. Thực tế
[`sandbox-networkpolicy.yaml`](../../infra/helm/platform/templates/sandbox-networkpolicy.yaml)
đã có **4 object** từ P1: default-deny cả hai chiều, chỉ mở DNS tới CoreDNS,
chỉ mở ingress từ pod gateway, và một policy internet-egress có `except`
`169.254.0.0/16`. Lateral pod↔pod trong `dlp-sandbox` **đã bị chặn** — không rule
nào cho phép nó.

**Lỗ thật nằm ở namespace NỀN TẢNG.** Tìm cả repo chỉ có đúng một file
NetworkPolicy, và nó nhắm `dlp-sandbox`. Namespace `default` — nơi chạy `web`,
`gateway`, `orchestrator`, `postgres`, `redis` — **không có NetworkPolicy nào**.
Nghĩa là mọi pod lọt vào namespace đó nói chuyện thẳng được với Postgres và Redis,
và không gì chặn gateway gọi ngang sang datastore ngoài quy ước.

⇒ Task 3 đổi từ "hoàn thiện sandbox" thành **"phủ namespace nền tảng"** (chặng 3.B).

### 0.2 — Reaper đã cứng từ P1; "rò 30 pod" không phải lỗi reaper

Sketch task 8 viết *"orphan sweep, grace period, chống rò tài nguyên"*.
[`reaper.go`](../../services/orchestrator/internal/reaper/reaper.go) đã có **4 tầng**,
orphan **cả hai chiều** (pod-không-session `:514`, session-không-pod `:583`), grace
5 phút chống race lúc tạo pod, `errors.Join` để một nhánh hỏng không làm chết các
nhánh còn lại, quét ngay lúc khởi động, và **đối chứng âm dày đặc** trong test
(`TestSweepKhongGietPodDangSinhRa`, `TestTang4KhongDungPodAmConSong`, …).

30 pod `Succeeded` tồn đọng trên cụm **không phải sandbox pod** — chúng là pod của
CronJob `dlp-cni-canary`, và `successfulJobsHistoryLimit: 26` được đặt **có chủ ý**
(nâng lên từ 1). Thiếu duy nhất `ttlSecondsAfterFinished`.

⇒ Task 8 co từ "hardening reaper" xuống **một knob + một phép đo** (gộp vào 3.C).

### 0.3 — Rate-limit IP hiện KHÔNG chạy, và body-limit thủng với chunked

Hai điều này sketch không biết:

- `RATE_LIMIT_TRUST_PROXY` mặc định OFF ⇒ `clientKey()`
  ([`proxy.ts:49`](../../apps/web/src/proxy.ts)) trả `null` vô điều kiện ⇒ lớp
  rate-limit theo IP **bị bỏ qua hoàn toàn**. Không phải "giới hạn lỏng" — là
  **không có**. Lớp per-user trong `protectedProcedure` vẫn chạy và không phụ
  thuộc cờ này; nó là phòng thủ duy nhất đang thật sự đứng.
- `exceedsBodyLimit()` chỉ đọc header `Content-Length`
  ([`body-limit.ts:10`](../../apps/web/src/server/security/body-limit.ts)). Request
  `Transfer-Encoding: chunked` không có header đó ⇒ `null` ⇒ trả `false` ⇒ **đi
  thẳng qua**. Luật 5 của design §6 sinh ra từ đúng lỗi "payload 10MB → 502", nên
  đây là lỗ ngay giữa luật.

⇒ Task 6 không phải "thêm một lớp nữa ở Traefik cho chắc" mà là **dựng lớp thật
đầu tiên** (chặng 3.A).

### 0.4 — Hai phát hiện phụ, chưa có trong sketch

- ~~**Không chỗ nào đặt `seccompProfile`.**~~ **SAI — đã bác bỏ khi làm 3.B
  (2026-08-14).** Hai vế của câu này đều sai:
  1. `seccompProfile: RuntimeDefault` **đã được đặt** ở
     [`podspec.go:129`](../../services/orchestrator/internal/k8s/podspec.go) — pod
     sandbox do orchestrator sinh bằng **mã Go**, không bằng YAML, nên việc scout
     chỉ tìm trong `sandbox-*.yaml` là tìm sai chỗ.
  2. PSA `baseline` **có** chặn seccomp: nó cấm
     `seccompProfile.type: Unconfined`. Đo được khi cố tình tạo một pod
     Unconfined trong `dlp-sandbox` — apiserver từ chối.
  Đo trên HOST (không đo trong pod — Sysbox biên tập thứ `kubectl exec` nhìn
  thấy): mọi tiến trình của pod sandbox, kể cả `dockerd` lồng trong, đều có
  `Seccomp: 2` (filter mode) và `Seccomp_filters: 2`. → 3.B chỉ còn việc ĐO, không
  còn việc SỬA.
- **CSP còn `style-src 'unsafe-inline'`** ([`headers.ts:8`](../../apps/web/src/server/security/headers.ts)).
  Luật 9 sẽ bị self-pentest soi đúng chỗ này. → 3.E quyết định: sửa hay ghi nhận
  có lý do.

---

## §1. Trần hạ tầng — điều kiện biên của cả P3

Cụm lab: **1 node, 8 vCPU, 11 GB RAM, 112 GB đĩa**, kubeadm 1.34.10 + Sysbox,
không cloud provider, không node pool. Hiện đã 43% CPU request / 22% memory.

**Chốt với chủ dự án (2026-08-14): hạ mục tiêu về mức VM đo được.** Hệ quả cụ thể:

| Sketch nói | Bản này chốt |
|---|---|
| k6 "≥ vài trăm session đồng thời" | Ramp tới **trần thật của VM** — đo rồi mới chốt số, dự kiến 20–40 session. Ô AC ghi rõ "trên lab 1-node". |
| cluster-autoscaler scale up/down + scale-to-zero | Viết Helm/manifest **cloud-agnostic**, verify bằng `helm template` + `--dry-run=server` + kiểm schema. **KHÔNG** khẳng định đã scale thật. |

**Không có ô AC nào được phép xanh bằng cách hạ chuẩn trong im lặng.** Mỗi ô bị
trần hạ tầng chạm tới phải tự khai trần đó ngay trong câu chữ của ô. Một ô ghi
"chịu vài trăm session" mà đo trên máy 8 vCPU là ô nói dối; một ô ghi "chịu N
session trên lab 1-node, N đo được = …" thì không.

---

## §2. Chỉ mục chặng

| Chặng | Nội dung | Sketch task | Trạng thái |
|---|---|---|---|
| **3.A** | Biên Traefik: body-size, rate-limit, XFF, redirect HTTP→HTTPS | 6 | ✅ xong — [report](reports/2026-08-14-verify-3a-edge.md) |
| **3.B** | NetworkPolicy namespace nền tảng + seccomp | 3 | ✅ xong — [report](reports/2026-08-14-verify-3b-netpol.md) |
| **3.C** | Rò tài nguyên: pod GC + đo lại reaper | 8 | ✅ xong — [GC](reports/2026-08-15-verify-3c3d-gc-observability.md) + [đóng nợ](reports/2026-08-15-verify-3c-debt-closure.md) · 14/14, và một chỗ rò §0.2 bảo là không có |
| **3.D** | Observability: Prometheus + Grafana + Loki | 7 | ✅ xong — [report](reports/2026-08-15-verify-3c3d-gc-observability.md) |
| **3.E** | Self-pentest 10 luật §6 — **GATE** | 1 | ✅ xong — [report](reports/2026-08-15-verify-3e-self-pentest.md) · **10/10, 0 lỗ hổng** |
| **3.F** | k6 load test tới trần CẤU HÌNH | 2 | ✅ xong — [report](reports/2026-08-15-verify-3f-k6.md) · **N=3**, và một lỗi thật: chạm trần trả 500 |
| **3.H** | WS scale layer: drain `1012`, lease khe WS tự lành, 2 replica | 5 | 🔵 đang làm — [chi tiết](#3h--ws-scale-layer) · sketch sai 3/4 vế, xem §H0 |
| 3.G | Autoscaling cloud-agnostic + chi phí | 4, 9 | Hoãn |

**Thứ tự có lý do:** 3.E (pentest) đứng CUỐI vì nó đo luật 5 (rate-limit/body-size)
và luật 10 (network/sandbox) — hai thứ 3.A và 3.B mới dựng. Chạy pentest trước thì
nó chấm một hệ chưa hoàn thiện, và mọi lỗi nó tìm ra ta đã biết trước.

---

## 3.A — Biên Traefik: body-size, rate-limit, XFF, redirect

**Effort:** M · **Blocks:** 3.E · **Blocked by:** không

### Bối cảnh

Hôm nay Traefik chỉ định tuyến, không gác gì. Ingress `platform` là **native
`networking.k8s.io/v1` Ingress** với `annotations: {}`, hai path: `/ws` → gateway,
`/` → web. CRD `middlewares.traefik.io` **đã cài** (chart v41 mặc định bật CRD).

### Quyết định thiết kế phải chốt TRƯỚC khi viết

**A1. Tách Ingress làm ba object.** Annotation
`traefik.ingress.kubernetes.io/router.middlewares` áp cho **MỌI router sinh ra từ
một Ingress** — không có cú pháp per-path. Hai thứ vì thế bắt buộc phải tách:

- `/` và `/ws` cần **hai trần rate-limit khác nhau** (mỗi handshake `/ws` là một
  lượt attach pod, đắt hơn một GET nhiều bậc).
- `redirectScheme` gắn lên Ingress phục vụ HTTPS sẽ chuyển hướng chính request
  HTTPS ⇒ **vòng lặp vô hạn**. Nó phải nằm ở Ingress riêng ghim
  `router.entrypoints: web`, còn hai cái kia ghim `websecure`.

> **Đã đo và BÁC BỎ (2026-08-14):** lập luận ban đầu của tôi là "buffering sẽ giết
> WebSocket". Đối chứng âm của AC-A6 gắn thẳng `bodylimit` vào `/ws` ⇒ **vẫn 101,
> vẫn nhận `ready`, socket vẫn mở sau 5s**. Request nâng cấp WS không có body nên
> buffering không có gì để đệm. Việc tách vẫn đúng, nhưng vì trần rate-limit và
> vòng lặp redirect — không vì buffering.

**A2. XFF — đo trước, sửa sau.** Sketch (ghi nhận U2) giả định phải cấu hình
Traefik ghi đè XFF. Nhưng deployment Traefik hiện **không có** arg
`--entryPoints.*.forwardedHeaders.trustedIPs`, và mặc định của Traefik là ghi đè
`X-Forwarded-For` bằng remote address thật cho mọi client **không** nằm trong
danh sách tin cậy — danh sách rỗng ⇒ mọi client đều không tin cậy ⇒ **có thể đã
đúng sẵn**. Chặng này **đo trước** (gửi XFF giả qua Traefik, xem web nhận được
gì), rồi mới quyết định có phải cấu hình gì không. Bật
`RATE_LIMIT_TRUST_PROXY=1` **chỉ sau khi** phép đo đó xanh — bật trước là tự tay
mở đường giả mạo IP.

**A3. Redirect HTTP→HTTPS với NodePort không chuẩn.** Nợ P2 đã cảnh báo:
`Location` dễ trỏ sai cổng vì Traefik biết entrypoint `websecure` là `:8443` bên
trong pod, không biết NodePort 30443 bên ngoài. Nên **không** dùng
`ports.web.redirectTo`; dùng Middleware `redirectScheme` với `port: "30443"` khai
tường minh. Ô AC phải kiểm chính `Location` header, không chỉ kiểm mã 30x.

### Task list

1. **`infra/helm/platform/templates/middleware-ratelimit.yaml`** — Middleware
   `rateLimit`: `average` / `burst` / `period`, `sourceCriterion.ipStrategy` mặc
   định (theo IP client sau khi Traefik đã chuẩn hoá XFF). Giá trị vào
   `values.yaml` dưới `ingress.rateLimit.*`, không hardcode.
2. **`infra/helm/platform/templates/middleware-bodylimit.yaml`** — Middleware
   `buffering` với `maxRequestBodyBytes` + `memRequestBodyBytes` (đặt bằng nhau để
   không tràn xuống đĩa). Mặc định 1 MiB, khớp `MAX_JSON_BODY_BYTES` của web.
3. **`infra/helm/platform/templates/middleware-redirect.yaml`** — Middleware
   `redirectScheme` scheme `https`, `port` khai tường minh, `permanent: false`
   (308 vĩnh viễn bị trình duyệt cache — sai cổng một lần là dính lâu; đổi sang
   `true` sau khi ổn định).
4. **Tách `ingress.yaml`** thành hai Ingress theo A1, mỗi cái gắn đúng bộ
   middleware qua annotation `<ns>-<name>@kubernetescrd`.
5. **Đo XFF** theo A2 → nếu đã đúng, ghi bằng chứng; nếu chưa, thêm
   `--set` cho `07-ingress-controller.sh` + bước khẳng định trên đối tượng sống
   (theo đúng khuôn đã dùng cho `service.spec.type`).
6. **Bật `RATE_LIMIT_TRUST_PROXY=1`** cho web trong values — chỉ sau bước 5.
   `clientKey()` giữ nguyên, không sửa code.
7. **Cập nhật test web:** `rule-05-rate-limit-body-cap.test.ts` có hai ca khẳng
   định `proxy()` TỰ chặn (429 khi vượt, skip khi trust-proxy off). Sau chặng này
   ngữ nghĩa đổi: lớp IP chuyển ra biên, lớp per-user ở lại. Sửa test cho khớp
   thực tế mới **và giữ nguyên** ca body-cap + ca "413 vẫn có security header".

### Acceptance criteria

- [ ] **AC-A1** — `POST` body 2 MiB **có** `Content-Length` → Traefik trả **413**
      *trước khi* request tới pod web. Bằng chứng là **BODY của phản hồi**:
      `Request Entity Too Large` (plain text, của Traefik) — web không thể phát ra
      chuỗi đó, nó trả JSON `{"error":"payload_too_large"}`.
      ⚠ **KHÔNG dùng "0 dòng log ở pod web" làm bằng chứng.** Đã thử và đối chứng âm
      bác bỏ: một request 200 hợp lệ CŨNG cho 0 dòng (Next không log request thành
      công), nên phép kiểm ấy mù — nó cho cùng kết quả ở cả hai giả thuyết.
- [ ] **AC-A2** — `POST` body 2 MiB gửi **`Transfer-Encoding: chunked`** (không
      `Content-Length`) → cũng **413**. *Đây là ô quan trọng nhất của 3.A:* đúng ca
      mà `exceedsBodyLimit()` của web thủng. **Đối chứng âm:** body 512 KiB chunked
      → **200/2xx**, chứng minh 413 đến từ kích thước chứ không từ việc chunked.
- [ ] **AC-A3** — vượt ngưỡng rate-limit trên `/` → **429 từ Traefik** (phân biệt
      với 429 của Next bằng body/header). **Đối chứng âm:** dưới ngưỡng → không 429.
- [ ] **AC-A4** — XFF: gửi `X-Forwarded-For: 1.2.3.4` giả từ ngoài → giá trị web
      nhận được **không phải** `1.2.3.4` mà là IP thật. **Đối chứng âm:** đo lại cùng
      request thẳng vào Service (không qua Traefik) → thấy `1.2.3.4` đi lọt, chứng
      minh phép đo có khả năng phát hiện giả mạo.
- [ ] **AC-A5** — `http://…:30080/` → **30x** với `Location` **chính xác**
      `https://dlp.192.168.94.130.sslip.io:30443/` (kiểm cả cổng trong Location, không
      chỉ kiểm mã).
- [ ] **AC-A6** — **WebSocket vẫn sống:** handshake `/ws` qua HTTPS trả **101**,
      nhận `{"type":"ready"}`, và giữ socket **≥ 5s** không bị đóng.
      ⚠ Phải **> 3s** và phải **gửi frame `init`**: gateway chờ `init` đúng 3s rồi
      huỷ dial exec và đóng (`docs/ws-terminal-protocol.md` §3 bước 4). Một probe
      thiếu `init` đóng ở ~3.0s và đọc ra y hệt "middleware giết WS" — hai nguyên
      nhân, một triệu chứng.
- [ ] **AC-A7** — harness e2e P2 (14/14) **vẫn 14/14** sau khi đổi biên.

### File ownership

`infra/helm/platform/templates/middleware-*.yaml` (mới) ·
`infra/helm/platform/templates/ingress.yaml` (tách) · `infra/helm/platform/values.yaml` ·
`infra/helm/platform/values-selfhost.yaml` · `infra/host/07-ingress-controller.sh` (chỉ
nếu bước 5 kết luận cần) · `apps/web/src/security/rule-05-rate-limit-body-cap.test.ts`.

**KHÔNG đụng:** `apps/web/src/proxy.ts` (logic `clientKey()` giữ nguyên — ghi nhận
U2 đã kết luận không cần sửa code), `server/security/rate-limit.ts`, `body-limit.ts`.

---

## 3.B — NetworkPolicy namespace nền tảng + seccomp

**Effort:** M · **Blocks:** 3.E · **Blocked by:** 3.A (biên ổn định trước khi siết mạng)

### Bối cảnh

Namespace nền tảng không có NetworkPolicy nào (§0.1). Đây là chặng **dễ làm sập
cả hệ nhất trong P3**: default-deny áp sai một chiều là mọi thứ chết cùng lúc, và
triệu chứng (timeout) giống hệt nhau ở mọi nguyên nhân.

### Chiến lược áp dụng — tăng dần, không "big bang"

Viết **allow trước, deny sau**. Áp đủ mọi policy `allow-*`, verify từng chiều còn
sống, **rồi mới** áp `default-deny`. Áp deny trước rồi gỡ dần là đường đi mà mỗi
bước sai đều biểu hiện giống nhau.

Các chiều phải mở (liệt kê từ code, không từ trí nhớ — mỗi chiều cần một dòng
bằng chứng trong report):

| Từ | Tới | Vì |
|---|---|---|
| traefik | web, gateway | ingress |
| web | gateway | `GATEWAY_INTERNAL_URL` (chấm bài) |
| web | postgres, redis | Better Auth + session |
| gateway | orchestrator | gRPC mTLS |
| gateway | redis | map session→pod |
| gateway | kube-apiserver | `pods/exec` (PTY + one-shot) |
| orchestrator | kube-apiserver | tạo/xoá pod |
| orchestrator | redis | pool + session |
| mọi pod | CoreDNS | DNS |

> **Bẫy đã lường:** egress tới **kube-apiserver** không đi qua Service ClusterIP
> theo cách trực giác — trên kubeadm nó là IP node + 6443. Chặn nhầm chiều này thì
> orchestrator không tạo được pod và gateway không attach được, tức **cả sản phẩm
> chết** trong khi mọi pod vẫn `Running 1/1`.

### Task list

1. `infra/helm/platform/templates/platform-networkpolicy.yaml` — các policy
   `allow-*` theo bảng trên, mỗi policy một khối có chú thích nêu **vì sao** chiều
   đó cần mở (chú thích là thứ ngăn người sau gỡ nhầm).
2. Policy `platform-default-deny` — áp **sau cùng**, có cờ values
   `networkPolicy.platform.denyEnabled` để bật/tắt được khi chẩn đoán.
3. Script `infra/k8s/netpol-verify.sh` — kiểm **từng chiều** ở bảng trên, cả vế
   phải-thông lẫn vế phải-chặn, in bảng kết quả và `exit 1` nếu lệch.
4. `seccompProfile: RuntimeDefault` cho pod sandbox — **đo trước**: Sysbox cần một
   tập syscall rộng hơn workload thường, nên áp xong phải chứng minh PTY + `exec`
   một-lượt vẫn chạy. Nếu xung đột thật thì **ghi nhận có lý do** thay vì ép, và
   nêu rõ ở 3.E rằng luật 10 vế seccomp dựa vào profile mặc định của runtime.

### Acceptance criteria

- [ ] **AC-B1** — `netpol-verify.sh` xanh: **mọi** chiều ở bảng thông, và các chiều
      ngoài bảng bị chặn.
- [ ] **AC-B2** — **Đối chứng âm bắt buộc:** một pod lạ trong namespace nền tảng
      **không** kết nối được Postgres và Redis. Thiếu ô này thì "default-deny đã áp"
      chỉ là một object tồn tại, không phải một hàng rào.
- [ ] **AC-B3** — sandbox pod vẫn **không** ra được internet và **không** tới được
      `169.254.169.254` (giữ nguyên kết quả P1, chứng minh 3.B không nới lỏng gì).
- [ ] **AC-B4** — harness e2e **14/14** sau khi áp `default-deny` (ô gác toàn hệ).
- [ ] **AC-B5** — seccomp: hoặc `RuntimeDefault` áp được **và** PTY + exec vẫn chạy,
      **hoặc** một ghi nhận nêu rõ xung đột Sysbox kèm bằng chứng lỗi thật.

### File ownership

`infra/helm/platform/templates/platform-networkpolicy.yaml` (mới) ·
`infra/k8s/netpol-verify.sh` (mới) · `infra/helm/platform/values.yaml` ·
`infra/helm/platform/templates/sandbox-*.yaml` (chỉ khối `seccompProfile`).

---

## 3.C — Rò tài nguyên: pod GC + đo lại reaper

**Effort:** S · **Blocked by:** không

Chặng nhỏ nhất của P3 (§0.2). Mục tiêu **không** phải viết thêm reaper mà là
**chứng minh reaper đã có làm đúng việc**, và bịt một chỗ rò nằm ngoài nó.

### Task list

1. `ttlSecondsAfterFinished` cho CronJob `dlp-cni-canary`
   ([`infra/k8s/cni-canary.yaml`](../../infra/k8s/cni-canary.yaml)) — pod
   `Succeeded` tự dọn thay vì sống tới khi Job rụng khỏi history.
2. Rà **mọi** Job/CronJob khác trong repo cho cùng knob (`cni-token-refresh.yaml`,
   `migrate-job.yaml`).
3. **Đo reaper trên cụm thật**, không chỉ tin unit test: tạo session, giết
   orchestrator, khởi động lại, xác nhận sweep-lúc-khởi-động dọn đúng thứ cần dọn.

### Acceptance criteria

- [x] **AC-C1** — sau một chu kỳ canary, số pod `Succeeded` trong `dlp-sandbox`
      **≤ 2** (hiện 30). Đo bằng `kubectl get pods` trước/sau. → 26 → 2.
- [x] **AC-C2** — reaper dọn **100%** session hết hạn trong một lượt đo có thời
      điểm rõ ràng. **Đối chứng âm:** một session CHƯA hết hạn trong cùng lượt
      **không** bị dọn — thiếu vế này thì "dọn sạch" không phân biệt được với "xoá bừa".
      → **2/2**, xoá 9s sau mốc hết hạn; session `ttl=900s` trong cùng lượt còn nguyên.
      ⚠ Phép đo **không** đặt trên `GetSession` trả NotFound: key rụng vì TTL Redis,
      không vì reaper — ô ấy sẽ xanh y hệt trên cụm đã gỡ hẳn reaper.
- [x] **AC-C3** — orchestrator restart giữa lúc có session sống ⇒ session vẫn dùng
      được, pool không rò pod. → đọc VÀ ghi đều OK sau restart, đúng pod cũ
      (`startTime` không đổi), `phantom=0 orphan=0`.
      ⚠ "Pool không rò" **không** nghĩa là mọi con số đứng yên: `pool:free` PHẢI đổi
      khi orchestrator bổ sung về `POOL_TARGET`. Bất biến đúng là index Redis khớp
      cụm hai chiều.

> **§0.2 sai ở tiền đề.** Nó viết task 8 co xuống "một knob + một phép đo" vì
> "reaper đã cứng từ P1". Phép đo ấy tìm ra một chỗ rò thật: session `FAILED` để
> lại tên pod trong `pool:claimed` (không tầng nào nhặt — 2b bỏ qua status cuối,
> 2c thấy key còn nên tưởng session sống), làm `dlp_pool_claimed_size` sai gấp 6
> lần suốt tới `SESSION_TTL`. Đã vá + đo trước/sau trên cụm.

> **Bẫy đã ghi:** VM ngủ làm vỡ mọi ô AC treo theo đồng hồ, và đồng hồ VM lệch
> ~59s so với Windows. Mọi phép đo thời gian ở chặng này lấy timestamp **trên VM**,
> không trộn với `date` của Windows.

### File ownership

`infra/k8s/cni-canary.yaml` · `infra/k8s/cni-token-refresh.yaml` ·
`infra/helm/platform/templates/migrate-job.yaml`.

---

## 3.D — Observability: Prometheus + Grafana + Loki

**Effort:** M · **Blocked by:** 3.B (NetworkPolicy phải cho scrape đi qua)

### Bối cảnh

Greenfield hoàn toàn — không namespace monitoring nào tồn tại. Nhưng **hai nguồn
metric đã sẵn**: Traefik đã bật `--metrics.prometheus.entrypoint=metrics` (cổng
9100), và gateway đã có counter kiểu `WSConnectionsTotal`, orchestrator có
`ReaperSweepFailuresTotal`.

> **Chi tiết dễ mất giờ:** Service `traefik` chỉ expose `web` + `websecure` —
> entrypoint `metrics` **chưa ra khỏi pod**. Scrape sẽ fail cho tới khi thêm port
> vào Service (hoặc scrape thẳng pod). Không phải lỗi Prometheus.

### Task list

1. `infra/observability/` — kube-prometheus-stack (Helm, chart ghim + sha256 theo
   đúng khuôn `07-ingress-controller.sh`), values tối giản hợp 11 GB RAM: retention
   ngắn, không alertmanager cluster, `local-path` cho PVC.
2. Expose entrypoint `metrics` của Traefik + `ServiceMonitor`.
3. `ServiceMonitor` cho gateway + orchestrator; bổ sung metric còn thiếu ở
   design §12: claim latency (histogram), WS active (gauge), pod pool free/claimed,
   reap rate, error rate.
4. Dashboard Grafana khai bằng file JSON trong repo (không cấu hình bằng tay trong
   UI — cấu hình bằng tay là trạng thái ẩn, trái `development-principles.md`).
5. Loki + promtail, retention ngắn.
6. Alert cơ bản: claim latency p95 vượt ngưỡng, reaper sweep fail, pod pool cạn.

### Acceptance criteria

- [ ] **AC-D1** — Prometheus scrape **thành công** cả 3 target (traefik, gateway,
      orchestrator): `up == 1`. **Đối chứng âm:** tắt một target ⇒ `up == 0` (chứng
      minh `up == 1` đang đo thật chứ không phải target không tồn tại).
- [ ] **AC-D2** — Dashboard hiện **đủ** metric design §12: claim latency, WS active,
      pod pool, reap rate, error. Bằng chứng: query trả **điểm dữ liệu khác rỗng** cho
      từng metric, không phải panel rỗng.
- [ ] **AC-D3** — Loki nhận log từ web + gateway + orchestrator; query ra được đúng
      dòng kiểm toán `exec` mà chặng B của P2 đã thêm.
- [ ] **AC-D4** — một alert **bắn thật** khi ép vượt ngưỡng (hạ ngưỡng tạm để kích).
      Alert chưa từng bắn là alert chưa biết có chạy không.
- [ ] **AC-D5** — toàn bộ stack chạy trong ngân sách RAM còn lại của VM; ghi số đo
      trước/sau. Nếu không vừa thì cắt bớt và **ghi rõ đã cắt gì**.

### File ownership

`infra/observability/**` (mới) · `infra/host/09-observability.sh` (mới) ·
`services/*/internal/metrics/*` (bổ sung metric) ·
`infra/helm/platform/templates/platform-networkpolicy.yaml` (mở chiều scrape).

---

## 3.E — Self-pentest 10 luật §6 — GATE

**Effort:** M · **Blocked by:** 3.A, 3.B (pentest phải đo thứ đã hoàn thiện)

### Bối cảnh

Đây là ô AC **duy nhất design §12 nêu đích danh**: *"0 lỗi trong 10 luật bảo mật
§6 khi self-pentest lại"*. Kịch bản gốc nằm ở
[`secure-test-devops/`](../../secure-test-devops/) — script Python của competitor,
`jwt_forge.py`, `nosql_jwt_attacks.py`, `hpp_brute.py`, `ws_shell.py`, `http_raw.py`, …

### Nguyên tắc chi phối chặng này

**Một kịch bản pentest không tìm thấy gì là bằng chứng KHÔNG có giá trị cho tới
khi nó chứng minh được nó biết tìm.** Mỗi luật cần **một đối chứng dương**: một
biến thể của chính kịch bản đó, chạy vào một endpoint/cấu hình cố ý mở, và nó
PHẢI báo lỗi. Không có bước ấy thì "0 lỗi" không phân biệt được với "script chạy
sai địa chỉ" — mà đúng ca đó đã từng xảy ra ở dự án này (`ckad-configmap-as-files`
verify luôn `command not found` ⇒ vế PASS bất khả).

### Task list

1. `secure-test-devops/run-all.sh` — runner gom 10 luật, tham số `--target`, in
   bảng luật × kết quả, `exit 1` nếu bất kỳ luật nào đỏ.
2. Chuyển từng kịch bản sang hệ ta (đổi endpoint, đổi shape auth). NoSQLi
   (`$ne`) **n/a** vì Postgres — vẫn chạy để chứng minh n/a, không bỏ qua trong im lặng.
3. **Đối chứng dương cho từng luật** theo nguyên tắc trên.
4. Luật 9: quyết định về `style-src 'unsafe-inline'` (§0.4) — siết bằng nonce, hay
   ghi nhận có lý do kèm phân tích bề mặt tấn công thật.
5. Luật 10 mở rộng: WS IDOR (đoán pod id của người khác), sandbox escape, metadata.
6. Vá mọi lỗi tìm được, **rồi chạy lại toàn bộ** — không vá lẻ rồi chỉ chạy lại một luật.

### Acceptance criteria

- [ ] **AC-E1** — `run-all.sh --target https://…:30443` → **0 lỗi trên cả 10 luật**,
      có bảng kết quả từng luật.
- [ ] **AC-E2** — **mỗi** luật có đối chứng dương ĐỎ đúng như dự kiến. 10/10 đối
      chứng phải đỏ; một đối chứng xanh nghĩa là kịch bản luật đó đang không đo gì.
- [ ] **AC-E3** — luật 5 đo được lớp Traefik mới của 3.A (payload lớn + chunked +
      rate-limit), không chỉ lớp Next.
- [ ] **AC-E4** — luật 10 đo được: WS IDOR bị chặn, metadata bị chặn, không thoát
      được sandbox, không có `docker.sock`.
- [ ] **AC-E5** — mọi lỗi tìm được đã vá **và** có test hồi quy trong suite thường,
      không chỉ trong script pentest.

### File ownership

`secure-test-devops/run-all.sh` + các script kịch bản (mới/sửa) ·
`apps/web/src/security/*.test.ts` (test hồi quy) · file bị vá tuỳ lỗi tìm được.

---

## 3.F — k6 load test tới trần CẤU HÌNH

**Effort:** M · **Blocked by:** 3.D (đọc kết quả bằng metric, không đoán qua log) ·
**Blocks:** 3.H (phải biết trần thật trước khi bàn scale WS)

### Bối cảnh — ba trần, xếp theo thứ tự k6 sẽ đụng

Sketch viết *"ramp tới vài trăm session đồng thời, claim p95 < 1s"*. §1 hạ xuống
"20–40". Lượt 3.C đo ra con số thật và nó **nhỏ hơn §1 một bậc mười**:

| # | Trần | Giá trị | Đo ở đâu |
|---|---|---|---|
| 1 | Better Auth **signup theo IP** | ~2–3 lượt rồi 429 | `infra/pentest/lib/common.sh` § `login_new` |
| 2 | Rate-limit biên **WS handshake** | 20/1m, burst 10 | `values.yaml` › `ingress.middleware.rateLimit` |
| 3 | Rate-limit biên **web động** | 120/1m, burst 60 | cùng chỗ |
| 4 | **Session đồng thời** | **3** | `requests.cpu 2100m ÷ 500m = 4 pod`, trừ `POOL_TARGET=1` |
| 5 | **per-user tRPC mutation** | 20/1m, **in-memory mỗi replica × 2** | `server/trpc/init.ts` |
| 6 | **cold path vs timeout của CLIENT** | pod Sysbox boot > 20s; k6 mặc định 60s | `common.sh` phải dùng `-m 120` |
| — | Phần cứng | **không bao giờ chạm** | node còn 2730m/8000m CPU lúc đo |

Trần 5 và 6 do **review đối kháng** bổ sung (2026-08-15), và cả hai đều là đường
ra kết luận SAI chứ không chỉ là giới hạn:

- **Trần 5** bắn ra 429 từ *Next*, không từ quota. Một ô AC chỉ tách "429" khỏi
  "lỗi kết nối" sẽ xếp nó vào ô "bị chặn đúng", rồi ghi một N nhỏ hơn thật **và
  quy cho ResourceQuota** — ô tự khai sai nguyên nhân, đúng thứ §1 cấm. (Thiết kế
  hiện tại né được vì mỗi session dùng một USER riêng ⇒ mỗi bucket chỉ 2 mutation.)
- **Trần 6** làm một hệ đang chạy ĐÚNG thiết kế trông như hỏng: client bỏ cuộc ở
  60s trong khi orchestrator vẫn tạo pod ⇒ **đẻ pod mồ côi**, làm đỏ cả ô "không
  rò pod" lẫn ô "không lỗi kết nối" — hai ô đỏ vì một mặc định của công cụ đo.

Trần 4 là thứ sketch định đo. Ba trần đứng TRƯỚC nó, và trần 1 đứng trước cả lúc
tải bắt đầu — k6 tạo user mỗi VU là chết ngay ở bước dựng, chưa kịp đo gì.

**Xác nhận lại trên cụm sống (2026-08-15, trước khi viết chặng này):**
`platform-sandbox-quota` used `pods:1, requests.cpu:500m` / hard `pods:10,
requests.cpu:2100m`. Đúng như 3.C tính. `pods: 10` **không** phải ràng buộc chặn.

**CHỐT VỚI CHỦ DỰ ÁN (2026-08-15): đo trần CẤU HÌNH như đang chạy.** Không nới
quota, không nới rate-limit. 3.F là chặng **ĐO**, không phải chặng nới.

### Quyết định thiết kế phải chốt TRƯỚC khi viết

**F1. k6 chạy Ở NGOÀI hệ đang đo — trên Windows, không trên VM, không trong cụm.**
Chốt với chủ dự án 2026-08-15. Lý do là tính đúng đắn của phép đo, không phải tiện:
cụm chỉ có **8 vCPU và generator tải nằm cùng chỗ với hệ nó đang đo sẽ ăn đúng
phần CPU mà nó đang đo** — số ra thấp hơn thực tế và không cách nào biết thấp bao
nhiêu. Chạy trên VM còn vượt ranh giới đã chốt ("không `apt install` thêm gì").

k6 **v2.2.0** binary standalone, tải về scratchpad, không cài vào hệ thống, không
commit vào repo. Đã đo đường đi trước khi viết plan: `GET /` từ Windows qua
VMware NAT vào `:30443` → **200, 9007 byte**.

> **Module WS:** `k6/net/websockets` **KHÔNG tồn tại** ở v2.2.0 (k6 báo
> `unknown dependency` rồi cố build binary tuỳ biến — đọc ra như lỗi mạng). Hai
> module chạy được: `k6/ws` (legacy, `connect()` **chặn VU suốt vòng đời socket**)
> và `k6/experimental/websockets` (API sự kiện). Chọn **`k6/ws`**: một VU giữ một
> socket đúng bằng một session là mô hình ta cần, và tính chặn của nó chính là
> thứ làm "VU đang chạy" = "session đang giữ". Đã thử cả hai, cả hai `import` được.

**F2. Hai kịch bản tách rời, KHÔNG một ramp.** Vì NodePort SNAT + một máy nguồn
⇒ **mọi VU dùng chung MỘT bucket IP**. Ramp song song sẽ ra **lỗi kết nối** chứ
không ra 429 — 3.E đã đo đúng ca này. Một ramp duy nhất vì thế trộn hai nguyên
nhân vào một triệu chứng:

- **Kịch bản `ceiling` (tuần tự, có nhịp):** mở session 1→2→3→4, mỗi lượt cách
  nhau đủ để **không** chạm trần 2/3. Đo trần 4 sạch, không lẫn rate-limit.
- **Kịch bản `edge` (burst có chủ đích):** cố tình vượt trần 2. Đo hệ hỏng đúng
  kiểu ở biên. Chỉ ô này mới được phép thấy 429.

**F3. User pool dựng sẵn, KHÔNG signup mỗi VU** (trần 1). Một script cấp phát
chạy trước, có backoff khi gặp 429, ghi cookie ra file **gitignored** và
**tái dùng ở lần chạy sau** — chạy lại 3.F không được tốn thêm lượt signup.

**F4. Không trộn đồng hồ.** k6 chạy trên Windows, metric đến từ Prometheus trên
VM, và **đồng hồ VM lệch ~59s so với Windows**. Mọi tương quan k6↔metric vì thế
dùng **khoảng thời lượng** hoặc timestamp **lấy trên VM**, không bao giờ lấy mốc
tuyệt đối của Windows đem so với mốc của VM. Lệch nhỏ nguy hơn lệch lớn: số vẫn
dương, vẫn "hợp lý", chỉ sai.

### Task list

1. **`infra/k6/lib/config.js`** — target, ngưỡng, số VU, đọc từ env; không hardcode.
2. **`infra/k6/provision-users.sh`** — dựng pool user (F3), backoff 429, cache
   cookie ra `infra/k6/.users.json` (gitignore), in ra số user dùng lại vs tạo mới.
3. **`infra/k6/ceiling.js`** — kịch bản tuần tự (F2): claim session tới khi bị từ
   chối; ghi lại **mã lỗi và hình dạng lỗi** của lượt bị từ chối, không chỉ ghi
   "thất bại"; giữ socket sống bằng `k6/ws` để session thật sự chiếm chỗ.
4. **`infra/k6/edge.js`** — kịch bản burst (F2): vượt trần WS handshake; **đếm
   riêng** 429 và lỗi kết nối; có nhánh dưới ngưỡng làm đối chứng âm.
5. **`infra/k6/run-load.sh`** — runner: chạy provision → ceiling → edge, thu metric
   Prometheus trước/sau, chụp `kubectl get pods -n dlp-sandbox` trước/sau, in bảng
   kết quả, `exit 1` nếu bất kỳ ô AC nào lệch.
6. **`infra/k6/README.md`** — vì sao chạy ở Windows, vì sao hai kịch bản, cách
   tái lập.
7. **Cổng CI:** chỉ **tĩnh** (`k6 inspect` / lint) — chạy thật cần cụm sống, cùng
   lý do `reaper-verify.sh` chưa vào CI được. Ghi rõ giới hạn này, không giả vờ
   là cổng chạy thật.

### Acceptance criteria

- [x] **AC-F1** — **Trần đồng thời đo được, và ô này tự khai trần nào chặn.** Ghi
      nguyên văn dạng: *"trên lab 1-node, cấu hình hiện tại, N = … session đồng
      thời; chặn bởi ResourceQuota (`requests.cpu 2100m ÷ 500m = 4 pod`, trừ
      `POOL_TARGET=1`) chứ không bởi phần cứng — node lúc đo còn …/8000m CPU rảnh."*
      Một ô ghi "chịu N session" mà không khai trần nào chặn là **ô nói dối** (§1).
      Đếm bằng **session id PHÂN BIỆT**, không bằng số lượt 2xx: `CreateSession`
      cùng `(userId, idempotencyKey)` **trả lại session cũ** với 200 OK và không
      claim thêm pod (`replayIdempotent`), nên N lượt lặp trên MỘT pod cũng đọc ra
      "N session". Ghi kèm **số pod sandbox tối đa quan sát được** và **đối chiếu
      với công thức**; lệch ⇒ phải giải thích ngay trong ô, không được xanh.
      **Đối chứng dương:** session **1 và 2** phải xanh — cận dưới ĐỘC LẬP với N
      (quota cho 4 pod nên 2 session luôn khả thi). Neo vào chính N là tự tham chiếu.
- [x] **AC-F1b** — **Đối chiếu chéo với server.** `Δ dlp_claim_total{result="ok"}`
      ≥ số session k6 báo, **và** `Δ dlp_claim_total{result="quota_blocked"}` ≥ 1
      trong cửa sổ đo. Đây là ô **duy nhất** bắt được ca "k6 chạy sai địa chỉ":
      một TARGET sai không làm nhúc nhích counter phía server, trong khi mọi con
      số phía client vẫn đẹp.
- [x] **AC-F2** — **Hỏng đúng kiểu ở tầng quota.** Lượt vượt trần phải là **đúng
      lỗi quota** — nhận diện bằng thông điệp của orchestrator, KHÔNG bằng "không
      phải 2xx". `401` (cookie cache chết), `429` (trần per-user), `400`
      (idempotencyKey sai) đều là "lỗi có cấu trúc, không 5xx, không treo": một
      lượt chạy mà MỌI claim chết ở tầng auth vẫn làm ô này xanh với N = 0.
      Bất kỳ mã lỗi nào khác quota trong kịch bản `ceiling` ⇒ **phép đo hỏng**,
      ô ĐỎ, không được đọc thành "chạm trần".
      Và lỗi ấy phải **giữ được ngữ nghĩa** cho người dùng — chạm trần là trạng
      thái BÌNH THƯỜNG của một hệ có quota, không phải sự cố 5xx.
      **Không rác để lại:** đếm pod `app=sandbox`, **bỏ** pha `Succeeded`/`Failed`
      (terminal ⇒ không tính vào quota) và **bỏ** pod có `deletionTimestamp`
      (Terminating còn hiện hàng chục giây ⇒ đỏ oan). Namespace này còn chạy
      CronJob `dlp-cni-canary`; đếm thô "mọi pod trong namespace" đã cho kết quả
      sai ngay lượt chạy đầu.
- [x] **AC-F3** — **Hỏng đúng kiểu ở biên:** burst vượt trần WS handshake → **429
      từ Traefik**, phân biệt với 429 của Next bằng body/header (cùng khuôn phân
      biệt đã dùng ở AC-A3). **Đối chứng âm:** nhịp dưới ngưỡng → **không** 429,
      chứng minh 429 đến từ việc vượt ngưỡng chứ không từ việc gửi WS.
- [x] **AC-F4** — **"Bị chặn đúng" phân biệt được với "không kết nối được".** k6
      báo cáo **các con số tách rời**: 429-của-biên, 429-của-Next, và lỗi tầng
      **vận chuyển** (DNS/TCP/TLS/reset). Ô ĐỎ nếu lỗi vận chuyển > 0 trong kịch
      bản `ceiling`. *(3.E đã đo đúng ca này: ramp song song ra 000, không ra 429.)*
      ⚠ **Timeout do CLIENT huỷ đếm riêng, không gộp vào lỗi vận chuyển** (trần 6):
      cold path boot > 20s là hệ chạy ĐÚNG thiết kế; một timeout ngắn biến nó thành
      hai ô đỏ oan **và** đẻ pod mồ côi do chính phép đo gây ra.
      **Đối chứng đường mạng:** `GET /` ngay trước và sau kịch bản — nếu `/` cũng
      hỏng thì kết luận "đường đo hỏng", chỉ `/api/trpc` hỏng mới kết luận "hệ".
- [x] **AC-F5** — **Reaper theo kịp sau tải.** Đóng bằng
      [`infra/k8s/reaper-verify.sh`](../../infra/k8s/reaper-verify.sh) chạy **trên
      VM** sau lượt tải — script đó đã mã hoá đúng ngữ nghĩa cần (hết hạn thật theo
      đồng hồ + đối chứng âm session chưa hết hạn + mốc thời gian lấy từ cụm).
      Viết lại phép đo ấy trong k6 là trùng lặp, và tệ hơn: k6 chạy trên Windows
      không có đường mTLS tới orchestrator để đặt TTL ngắn.
      ⚠ **≥ 1 session PHẢI thật sự hết hạn trong cửa sổ đo.** Không có gì hết hạn
      thì "dọn 100%" là **0/0** và ô xanh với mẫu số rỗng — cả vế đối chứng âm
      cũng xanh vì chẳng có gì bị dọn.
- [x] **AC-F6** — **claim latency: ghi số, KHÔNG gác ngưỡng.** Tách **theo nhãn
      `path`** kèm **số mẫu n** của từng path. `metrics.go` đã cảnh báo ngay tại
      chỗ khai báo rằng gộp warm+cold "kéo p95 lên và làm AC hoặc đỏ oan, hoặc
      (tệ hơn) được nới ra cho vừa". Với **n < 20**, `histogram_quantile` chỉ trả
      **biên bucket** — một con số trông thật mà thực chất là lượng tử hoá: ghi giá
      trị thô, đừng phát biểu p95. Ghi rõ histogram **chỉ quan sát lượt thành công**,
      nên nó không nói gì về lượt bị chặn. KHÔNG dùng ngưỡng "< 1s" của sketch:
      sketch đặt nó cho "vài trăm session" trên hạ tầng khác.
- [x] **AC-F7** — harness e2e P2 **14/14** vẫn xanh sau chặng (3.F không sửa gì
      đường chạy, nên bất kỳ hồi quy nào cũng là tín hiệu đã đụng nhầm).
- [x] **AC-F8** — **Kịch bản k6 không tự nói dối.** Thiếu ô này thì một script chạy
      sai địa chỉ, hoặc bỏ qua sạch, vẫn "xanh" — đúng ca đã cắn dự án này
      (`ckad-configmap-as-files` verify luôn `command not found` ⇒ vế PASS bất khả).
      **Ba vế, không một:**
      (a) `iterations > 0`;
      (b) **≥ 2** session claim thành công với **id PHÂN BIỆT** — cận dưới độc lập
      với N (quota cho 4 pod nên 2 session luôn khả thi). Ngưỡng `≥ N` là **tautology**
      (so kết quả với chính nó); ngưỡng `≥ 1` quá lỏng;
      (c) **đối chiếu chéo với server** (AC-F1b) — chỉ vế này bắt được "chạy sai
      địa chỉ", vì một TARGET sai không làm nhúc nhích counter phía server.
      ⚠ Ngưỡng đặt trên một custom metric **chưa từng có mẫu** đọc ra là *pass* —
      nên mỗi metric trong ngưỡng phải được ghi ít nhất một lần trên đường chạy thật.

### File ownership

`infra/k6/**` (mới) · `.gitignore` (thêm `infra/k6/.users.json`) ·
`plans/devops-learning-platform/reports/2026-08-15-verify-3f-k6.md` (mới) ·
cổng CI tĩnh nếu bước 7 kết luận thêm được.

**KHÔNG đụng:** `values.yaml` (quota + rate-limit — phạm vi đã chốt là ĐO, không
nới) · `services/**` (trừ khi AC-F2 phát hiện hỏng-sai-kiểu thật, và khi đó phải
ghi rõ đã sửa gì vì sao).

---

## 3.H — WS scale layer

**Effort:** M · **Blocked by:** 3.F (phải biết trần thật) · **Blocks:** production go-live
**Chi tiết hoá:** 2026-08-15

### §H0. Scout đã bác bỏ ba phần tư của sketch task 5

Sketch task 5 có bốn vế. Ba vế **đã xong hoặc không có đối tượng**, và việc phát
hiện ra điều đó là kết quả chính của bước scout — không ghi lại thì lượt sau lại
đi dựng những thứ đã đứng sẵn.

| Sketch nói | Đo được | Hệ quả |
|---|---|---|
| "session→pod ở Redis" | **Đã có từ P1.** `wsroute.go:194` đọc hash `session:{id}` mỗi lần connect; `Target` (`wsroute.go:315-321`) mang sẵn `PodName`/`Namespace`. | Không có gì để dựng. |
| "gateway scale ngang (đã stateless từ P1)" | **Khẳng định ĐÚNG, đã kiểm chứ không tin.** Không map/registry session→conn nào ở package-level lẫn struct field; `connState` cấp phát trên stack mỗi kết nối (`bridge.go:311`). State in-memory duy nhất là cache JWKS, deny-limiter của log, và gauge — không cái nào keyed theo session. | `replicaCount` là một con số, không phải một dự án. |
| "session-affinity ở Traefik" | Bề mặt trống ở **cả hai** đường (`gateway-service.yaml:8-17` không có `sessionAffinity`; không `TraefikService`, không annotation sticky nào trong repo). Nhưng vì gateway thật sự stateless, affinity **không cần cho tính đúng đắn**. | **BỎ, có lý do** — xem H1. |
| "tune WS ping/idle" | Ping 20s / pong 10s **cố ý hardcode** (`heartbeat.go:54-55`, lý do G11 ghi tại `:48-49`: "mỗi biến env là 4 nơi phải sửa"). Idle-window ở tầng app **không tồn tại** — mã `4408` đã bị gỡ khỏi contract ở 1.G-1 vì không đường nào phát nó. Traefik chạy **không một arg timeout nào** (đọc trên deployment sống 2026-08-15) ⇒ toàn mặc định v3.7.10. | Nhánh "tune" gần như rỗng. Còn lại đúng một câu hỏi đo được: mặc định `idleTimeout` của Traefik có giết WS im lặng không. → AC-H7. |

**Việc thật của 3.H nằm ở chỗ sketch không nhìn tới.** Scout tìm ra ba khuyết
tật, và chúng không độc lập — chúng là một chuỗi.

### §H1. Ba khuyết tật, một chuỗi

**Khuyết tật 1 — khe WS kẹt xuyên replica.**
`DECR` khe nằm trong `defer` (`wsroute.go:246-256`). Mà `http.Server.Shutdown`
**không theo dõi kết nối đã hijack** — WS sau 101 nằm ngoài tầm nó. Nên lúc
SIGTERM: `Shutdown` trả về gần như tức thì, `main` return, process thoát, mọi
goroutine WS chết giữa chừng, **defer không chạy**. `SHUTDOWN_GRACE=15s` không
bảo vệ WS chút nào — nó chỉ đợi các request HTTP thường.

Khe kẹt lại với TTL = `expiresAt − now` (`store.go:208`) và **không heartbeat nào
làm mới nó** — `AcquireWS` là nơi ghi duy nhất. Client nối lại ăn
`429 SESSION_IN_USE` tới **hàng chục phút**. Chính `acquire_ws.lua:9-15` đã ghi
đúng chế độ hỏng này ("session của sinh viên khoá VĨNH VIỄN ở trạng thái đang mở
ở tab khác") — nó chỉ chưa lường rằng TTL dài bằng cả phiên thì "đường thoát duy
nhất" ấy dài ngang việc không có đường thoát.

**Khuyết tật 2 — contract hứa `1012` mà gateway chưa bao giờ phát.**
`docs/ws-terminal-protocol.md` §6 khai `1012 SERVICE_RESTART` — "gateway
restart", FE nên retry: **có**. FE đã implement **và có test**
(`protocol.ts:99,134`, `protocol.test.ts:152-153`, `backoff.test.ts:37`).
Nhưng grep `1012|SERVICE_RESTART` trong `services/` → **0 hit**. Đây đúng cùng
loại khuyết tật với `4408` mà 1.G-1 đã gỡ: một nhánh phía FE không bao giờ chạy.

Khác biệt quan trọng: `4408` được gỡ vì hệ **không có khái niệm đó**. `1012` thì
hệ có khái niệm (gateway restart xảy ra mỗi lần deploy) — chỉ là chưa ai nối dây.
Nên đường đúng ở đây là **nối dây**, không phải gỡ mã.

**Khuyết tật 3 — FE không jitter, dựa trên một tiền đề mà rollout làm sai.**
`backoff.ts:5-8` cố ý bỏ jitter với lý do ghi rõ: *"trần D17 là 1 WS trên một
session, và mỗi session thuộc đúng một người dùng. **Không có đàn client nào cùng
nối lại một lúc** để mà phải rải ra."*

Tiền đề đúng cho ca đứt mạng lẻ tẻ, **sai chính xác vào lúc gateway rollout**:
drain đóng mọi phiên **cùng một khoảnh khắc**, nên mọi client chạy cùng một lịch
1/2/4/8/15s **không lệch pha**. Và `values.yaml:349-353` — chú thích của chính
trần rate-limit WS — đã tự cảnh báo đúng ca đó ("gateway restart ⇒ mọi client nối
lại cùng lúc") kèm ghi nhận trần **chưa đo trên tải thật**. Hai file, mỗi file tự
nó hợp lý, mâu thuẫn nhau ở đúng điểm 3.H chạm vào.

**Chuỗi hoàn chỉnh:** rollout → WS bị cắt cứng (1) → client nối lại đồng pha (3)
→ đâm trần WS 20/1m burst 10 dùng chung **một** bucket vì SNAT → mà khe WS của họ
đang kẹt (1). Ba lớp cùng bắn, và mỗi lớp một mình đều đọc ra "mạng có vấn đề".

### §H2. Quyết định thiết kế phải chốt TRƯỚC khi viết

**H1. BỎ session-affinity, và thay bằng một ô AC mạnh hơn nó.**
Chốt với chủ dự án 2026-08-15. Affinity không cần cho tính đúng đắn, và tệ hơn:
nó **che** mọi lỗi cross-replica, làm ô "scale ngang chạy đúng" trở nên mù — xanh
kể cả khi hệ không thực sự stateless. Thay vào đó AC-H3 **ép** client nối lại
trúng replica KHÁC và đòi nó attach đúng pod cũ. Đó là bằng chứng cho tính
stateless; sticky chỉ là bằng chứng cho việc ta đã tránh phải chứng minh.

**H2. Drain phải do gateway chủ động, không trông vào `srv.Shutdown`.**
Vì `Shutdown` không đụng kết nối hijack (§H1), cần một đường tách bạch: một
`drainCtx` mà mỗi `Serve` select trên đó, cộng một `sync.WaitGroup` đếm phiên
sống. SIGTERM → huỷ `drainCtx` → mỗi phiên tự đóng bằng `1012` → **defer chạy →
DECR diễn ra** → `Wait` có trần thời gian. Đây là in-memory state mới, nhưng nó
per-replica và chỉ phục vụ lúc tắt máy — không phải state session, không phá tính
stateless.

**H3. TTL khe WS đổi sang lease ngắn được heartbeat làm mới.**
Hôm nay TTL = cả phần đời còn lại của session. Đổi thành lease ngắn (mặc định
90s) và cho `pingLoop` (đã chạy 20s/lượt) làm mới. Hệ quả: replica chết đột ngột
(SIGKILL/OOM/mất node — những ca drain **không** đỡ được) làm khe tự nhả trong
≤ lease thay vì hàng chục phút.

Hai ràng buộc bắt buộc, cả hai đều là bẫy đã có tiền lệ trong repo:
- Refresh **chỉ được `PEXPIRE`, tuyệt đối không `SET`/`INCR`**. `PEXPIRE` trên key
  không tồn tại trả 0 và không tạo key — nên một refresh chạy trễ sau khi release
  đã `DEL` sẽ **không** hồi sinh khe. Dùng `SET` ở đây là tự dựng lại khe cho một
  phiên đã đóng.
- Lease **cắt trần ở phần đời còn lại của session**, và giữ nguyên guard
  `ttl <= 0 → từ chối` (`store.go:207-215`): `PEXPIRE` với giá trị ≤ 0 **XOÁ key
  ngay**, tức khe vừa chiếm biến mất và trần WS im lặng mất tác dụng.
- Redis Lua có isolation, **không có rollback** — script refresh phải tự hoàn tác
  đúng khuôn `acquire_ws.lua:26-31` nếu có nhiều hơn một lệnh ghi.

**H4. Đo trần rate-limit WS, KHÔNG nới.** Chốt với chủ dự án 2026-08-15, cùng
khuôn đã chốt cho 3.F. Nới rate-limit là nới một lớp phòng thủ luật 5 mà 3.E vừa
chấm 10/10; nếu số đo bảo nó chật thì đường sửa **đầu tiên** phải xét là jitter ở
FE (khuyết tật 3), vì đó là sửa đúng nguyên nhân. Nới trần là sửa triệu chứng và
phải trả giá bằng một lượt pentest luật 5 chạy lại.

**H5. `dlp_gateway_ws_active` phải `sum()` qua pod.** Gauge là per-replica
(`metrics.go:219`). Mọi query của chặng này dùng `sum(dlp_gateway_ws_active)`.
Đọc giá trị đơn lẻ khi có 2 replica là đọc một nửa hệ và tưởng là cả hệ.

**H6. Khẳng định trên ĐỐI TƯỢNG SỐNG, không tin `helm get values`.**
`07-ingress-controller.sh:79-87` đã ghi bài học đắt: helm nhận key lạ không kêu
một tiếng, và `helm get values` **in lại chính khoá sai đó** — tức lệnh dùng để
kiểm tra lại khẳng định điều sai. Mọi ô AC của 3.H đọc `kubectl get … -o jsonpath`
trên đối tượng thật.

### §H3. Task list

**H-0. Trả nợ image tag (làm TRƯỚC, vì mọi bước sau đều `helm upgrade`).**
Cụm đang chạy `dlp-web:3f-quota429` + `dlp-orchestrator:3c3-9e35e97` do side-load;
không script nào trong `infra/host/*.sh` truyền `--set *.image.tag`. Đã xác minh
`sha-25cb824` (web, gateway, orchestrator) **đều có trên ghcr** và pull được.
- Ghim `image.tag` vào `values-selfhost.yaml` — file này **là** hợp đồng "phải
  side-load tag nào", vì cụm `pullPolicy: Never` không kéo được từ registry.
- `infra/host/11-sideload-images.sh` (mới): đọc tag **từ chính `values-selfhost.yaml`**
  (SSOT, không nhận tham số tag rời) rồi pull → save → scp → `ctr import`. Không
  có script này thì lần sau lại là một chuỗi lệnh tay và nợ lại sinh ra.

**H-1. Drain WS êm.**
- Gateway: `drainCtx` + `WaitGroup`; `Serve` select trên `drainCtx.Done()` → đóng
  `1012` kèm reason ngắn (≤123 byte, contract §6 gotcha).
- Chờ `Wait` có trần = `SHUTDOWN_GRACE`; hết trần thì log rõ số phiên còn treo
  (đừng nuốt — đó là con số người vận hành cần).
- Helm: `terminationGracePeriodSeconds` **> `shutdownGrace`** (nếu ngược lại thì
  kubelet SIGKILL trước khi gateway kịp drain xong — đúng lỗi đang có).
- `preStop` sleep ngắn để endpoint rụng khỏi Traefik trước khi tiến trình bắt đầu
  từ chối; không có nó thì kết nối mới vẫn rơi vào pod đang tắt.

**H-2. Lease khe WS tự lành.** `refresh_ws.lua` (chỉ `PEXPIRE`) + `Store.RefreshWS`
+ gọi từ `pingLoop`. Lease vào values, không hardcode.

**H-3. Scale ngang thật.** `gateway.replicaCount: 2` ở `values-selfhost.yaml`
(hôm nay bị đè về 1; `values.yaml` vốn đã là 2) + `PodDisruptionBudget`
`minAvailable: 1`. Kiểm `nodeCidrs` **không** cần đụng — cụm 1 node, và policy
gateway đều theo label selector nên replica thứ N tự được phủ.

**H-4. Đo bão nối-lại.** Kịch bản: N phiên sống → rollout gateway → đếm tách rời
(a) phiên nối lại thành công, (b) 429-của-biên, (c) 429-của-Next, (d) lỗi vận
chuyển, (e) `SESSION_IN_USE`. Ghi số vào report; **không** sửa `values.yaml`.

**H-5. Quyết định jitter.** Chỉ sau khi H-4 có số. Nếu bão đụng trần → jitter ở
`backoff.ts` là ứng viên đầu tiên (sửa nguyên nhân), kèm sửa luôn comment đang
khẳng định sai. Nếu không đụng → ghi nhận tiền đề vẫn đứng ở quy mô lab và nêu rõ
quy mô nào sẽ làm nó đổ.

### §H4. Acceptance criteria

- [ ] **AC-H1 — drain phát `1012`, và đó là mã MỚI xuất hiện.** Rollout gateway
      khi có ≥1 phiên sống → client nhận close **`1012`**.
      **Đối chứng dương bắt buộc:** trước chặng này, cùng phép đo phải cho close
      **`1006`** (đứt cứng). Thiếu vế đó thì "nhận 1012" không phân biệt được với
      "FE tự bịa mã" — và `1012` là mã đã nằm sẵn trong `protocol.ts` từ lâu, nên
      nó *có thể* xuất hiện vì lý do khác.
- [ ] **AC-H2 — khe WS được trả về, đo trên Redis.** Ngay sau rollout,
      `session:{id}:ws` **không tồn tại** (release `DEL` khi về 0).
      **Đối chứng âm:** trong cùng lượt, một session có WS **đang mở** phải vẫn
      **còn** khe — thiếu vế này thì "khe đã trả" không phân biệt được với "khe bị
      xoá bừa" hoặc với việc TTL vừa hết.
      ⚠ Đo bằng `EXISTS`/`PTTL` trên Redis, **không** bằng "nối lại được": nối lại
      được cũng đúng khi trần WS đã hỏng hoàn toàn.
- [ ] **AC-H3 — nối lại trúng replica KHÁC vẫn attach đúng pod cũ.** Đây là ô
      thay thế cho sticky. Với 2 replica: mở phiên (ghi lại replica A qua log/metric
      theo pod), ép đóng, nối lại cho tới khi trúng replica **B**, khẳng định
      (a) attach thành công, (b) **đúng pod sandbox cũ** (so `podName`), (c) màn
      hình tmux còn nguyên nội dung trước đó.
      ⚠ Ô ĐỎ nếu không bao giờ trúng được replica B trong số lượt hợp lý — khi đó
      phép đo **không đo được điều nó định đo**, không được đọc thành "đã đúng".
- [ ] **AC-H4 — khe kẹt tự lành trong ≤ lease, khi drain KHÔNG đỡ được.** Giết
      cứng một replica (`pkill -9` **trên node** — `kubectl delete --force` KHÔNG
      phải SIGKILL, tiến trình còn sống thêm ~30s) khi nó đang giữ một phiên.
      Khẳng định: nối lại **429 `SESSION_IN_USE`** ngay sau đó (đối chứng dương —
      chứng minh khe THẬT SỰ kẹt), rồi **101** sau ≤ lease.
      ⚠ Phiên phải sống LÂU HƠN lease, nếu không thì lúc khe nhả phiên cũng chết và
      vế "101" bất khả — đúng bẫy `cases_g3.go:425-437` đã ghi cho `caseM3`.
- [ ] **AC-H5 — hai replica cùng phục vụ thật.** `sum(dlp_gateway_ws_active) == N`
      **và** phân bố trên **≥2 pod** (mỗi pod > 0). Một ô chỉ kiểm tổng sẽ xanh y
      hệt khi cả N phiên nằm trên một pod.
- [ ] **AC-H6 — bão nối-lại: các con số TÁCH RỜI.** Báo cáo riêng (a)…(e) ở H-4.
      Ô này **ghi số, không gác ngưỡng** — mục tiêu là biết trần biên có chật
      không, và câu trả lời là dữ liệu cho H-5, không phải một cổng.
      ⚠ Lỗi vận chuyển và 429 **không được gộp**: 3.E đã đo đúng ca ramp song song
      ra `000` chứ không ra 429.
- [ ] **AC-H7 — `idleTimeout` mặc định của Traefik có giết WS im lặng không.**
      Giữ một WS **hoàn toàn im lặng** (không stdin/stdout; chỉ còn ping 20s của
      gateway) qua mốc mặc định của Traefik v3, khẳng định socket vẫn mở.
      Ô này đóng nốt vế "tune idle" của sketch bằng một phép đo thay vì một knob.
- [ ] **AC-H8 — không hồi quy.** harness e2e P2 **14/14**, và
      `reaper-verify.sh --case all` vẫn xanh (drain đụng đường tắt máy, reaper đụng
      đường dọn — hai thứ dễ va nhau).
- [ ] **AC-H9 — nợ image tag đã đóng.** `helm upgrade` **không** `--set` nào về
      image, chạy xong ba deployment vẫn ở `sha-25cb824`.
      **Đối chứng dương:** khẳng định trên **đối tượng sống**
      (`kubectl get deploy -o jsonpath='{...image}'`), KHÔNG bằng `helm get values`
      (§H2 H6 — chính lệnh đó từng in lại khoá sai).

### §H5. File ownership

`services/terminal-gateway/internal/podexec/bridge.go` + `heartbeat.go` (drain +
refresh) · `services/terminal-gateway/internal/wsroute/wsroute.go` (nối drainCtx) ·
`services/terminal-gateway/internal/sessionstore/{store.go,refresh_ws.lua}` (mới) ·
`services/terminal-gateway/cmd/terminal-gateway/main.go` (drainCtx + WaitGroup) ·
`infra/helm/platform/templates/gateway-deployment.yaml` (preStop, grace) ·
`infra/helm/platform/templates/gateway-pdb.yaml` (mới) ·
`infra/helm/platform/values.yaml` + `values-selfhost.yaml` (lease, replicaCount, image.tag) ·
`infra/host/11-sideload-images.sh` (mới) ·
`packages/terminal/src/backoff.ts` (**chỉ nếu** H-5 kết luận cần) ·
`docs/ws-terminal-protocol.md` (§6: `1012` từ "khai mà chưa phát" → "đã phát").

**KHÔNG đụng:** `values.yaml` khối `ingress.middleware.rateLimit` (phạm vi đã chốt
là ĐO, không nới) · `acquire_ws.lua`/`release_ws.lua` (thêm script mới, không sửa
hai script đã có đối chứng) · logic `clientKey()` ở web.

---

## 3.G — hoãn lượt này

Giữ ở mức sketch, chi tiết hoá khi tới lượt. Ràng buộc §1 vẫn áp:

- **3.G — autoscaling + chi phí.** `cluster-autoscaler` cloud-agnostic; verify bằng
  `helm template` + `--dry-run=server`; **không** khẳng định đã scale thật.

---

## Risk Assessment (P3 detailed)

| Rủi ro | L | I | Score | Mitigation |
|---|---|---|---|---|
| **3.B default-deny làm sập cả hệ**, triệu chứng mọi nguyên nhân đều là timeout | 4 | 5 | **20** | Allow trước–deny sau; cờ `denyEnabled` tắt được; `netpol-verify.sh` kiểm từng chiều; AC-B4 dùng harness 14/14 làm ô gác toàn hệ. |
| **3.A buffering giết WebSocket** mà mọi cổng offline vẫn xanh | 4 | 4 | 16 | Tách Ingress (A1); AC-A6 giữ socket 3s là ô gác chuyên cho ca này. |
| **Pentest "0 lỗi" vì script chạy sai chỗ**, không vì hệ an toàn | 3 | 5 | 15 | AC-E2: 10/10 đối chứng dương phải ĐỎ. |
| Bật `RATE_LIMIT_TRUST_PROXY` trước khi Traefik thật sự chuẩn hoá XFF ⇒ tự mở đường giả mạo IP | 3 | 4 | 12 | A2: đo trước, bật sau; AC-A4 có đối chứng âm đo qua đường không-Traefik. |
| Observability không vừa 11 GB RAM | 3 | 3 | 9 | AC-D5 ghi số đo; cắt thì khai đã cắt gì. |
| seccomp `RuntimeDefault` xung đột Sysbox | 3 | 2 | 6 | AC-B5 cho phép ghi nhận có lý do kèm bằng chứng lỗi thật. |

**Hai rủi ro ≥15 đều nằm ở 3.A/3.B** — cả hai đều thuộc loại "cổng offline xanh,
hệ chết lúc chạy thật". Ô AC của hai chặng này vì thế đều gắn với phép đo **trên
cụm**, không phép đo nào thuần local.

## Timeline

| Chặng | Effort | Ghi chú |
|---|---|---|
| 3.A biên Traefik | M | Blocks 3.E |
| 3.B NetworkPolicy nền tảng | M | Rủi ro cao nhất |
| 3.C rò tài nguyên | S | Độc lập, làm xen được |
| 3.D observability | M | Cần 3.B |
| 3.E self-pentest | M | **GATE**, cuối |
| **Tổng lượt này** | **L** | 3.F/3.G/3.H hoãn |
