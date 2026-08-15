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
| **3.C** | Rò tài nguyên: pod GC + đo lại reaper | 8 | 🟡 gần xong — [report](reports/2026-08-15-verify-3c3d-gc-observability.md) · **AC-C2 còn nợ** |
| **3.D** | Observability: Prometheus + Grafana + Loki | 7 | ✅ xong — [report](reports/2026-08-15-verify-3c3d-gc-observability.md) |
| **3.E** | Self-pentest 10 luật §6 — **GATE** | 1 | ✅ xong — [report](reports/2026-08-15-verify-3e-self-pentest.md) · **10/10, 0 lỗ hổng** |
| 3.F | k6 load test tới trần VM | 2 | Hoãn |
| 3.G | Autoscaling cloud-agnostic + chi phí | 4, 9 | Hoãn |
| 3.H | WS scale layer | 5 | Hoãn |

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

- [ ] **AC-C1** — sau một chu kỳ canary, số pod `Succeeded` trong `dlp-sandbox`
      **≤ 2** (hiện 30). Đo bằng `kubectl get pods` trước/sau.
- [ ] **AC-C2** — reaper dọn **100%** session hết hạn trong một lượt đo có thời
      điểm rõ ràng. **Đối chứng âm:** một session CHƯA hết hạn trong cùng lượt
      **không** bị dọn — thiếu vế này thì "dọn sạch" không phân biệt được với "xoá bừa".
- [ ] **AC-C3** — orchestrator restart giữa lúc có session sống ⇒ session vẫn dùng
      được, pool không rò pod.

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

## 3.F / 3.G / 3.H — hoãn lượt này

Giữ ở mức sketch, chi tiết hoá khi tới lượt. Ràng buộc đã chốt (§1) áp cho cả ba:

- **3.F — k6 load test.** Ramp tới trần thật của VM, ô AC ghi rõ "trên lab 1-node,
  N = …". Cần 3.D xong trước để đọc kết quả bằng metric thay vì đoán qua log.
- **3.G — autoscaling + chi phí.** `cluster-autoscaler` cloud-agnostic; verify bằng
  `helm template` + `--dry-run=server`; **không** khẳng định đã scale thật.
- **3.H — WS scale layer.** session-affinity Traefik, tune ping/idle, gateway scale
  ngang. Cần 3.F để biết trần thật ở đâu.

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
