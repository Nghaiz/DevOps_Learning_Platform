# 3.C GC pod + 3.D Observability — 2026-08-15

Hai chặng trong một lượt. Điều đáng kể nhất không phải stack Prometheus dựng
được, mà là **knob mà plan chỉ định cho 3.C sẽ xoá mất chính thứ 3.C định bảo
vệ** — và bốn lần phép đo của tôi nói sai trước khi nó nói đúng.

## Tóm tắt

| Việc | Kết quả |
|---|---|
| 3.C — pod `Succeeded` tồn đọng | 26 → **2** |
| Knob plan đề xuất (`ttlSecondsAfterFinished`) | **BÁC BỎ** — đo được là nó xoá cả Job ĐỎ |
| "Rò tài nguyên" của 3.C | Không phải rò: quota đọc `pods: 1/10` với 26 pod tồn đọng |
| 3.D — stack quan sát | Prometheus + Grafana + Alertmanager + Loki + promtail |
| AC-D1 scrape | **3/3 up**, có cặp baseline trước/sau |
| AC-D2 metric có dữ liệu | **6/6** |
| AC-D3 Loki | **3/3 component** |
| AC-D4 alert bắn thật | **firing** + tới được Alertmanager |
| AC-D5 ngân sách RAM | **1268 MB** / 7915 MB còn trống |
| Cổng CI netpol | phát hiện **mù với policy tên MỚI** — đã sửa |
| AC-C2 | **KHÔNG đóng** — xem §Còn lại |

---

## 3.C — plan sai ở tiền đề, và sai ở knob

### Không phải "rò tài nguyên"

Plan §0.2 gọi 26 pod `Succeeded` là chỗ rò. Đo trước khi sửa:

```
ResourceQuota dlp-sandbox:  pods: 1 / 10        ← trong khi 26 pod Succeeded đang tồn tại
```

Pod ở trạng thái kết thúc **không tính vào quota** `pods`. Chi phí thật là
object etcd + rác trong `kubectl get`, không phải chỗ ngồi trong quota. Ô AC-C1
vẫn đáng đóng, nhưng lý do "sắp cạn quota" thì không đúng.

### `ttlSecondsAfterFinished` là knob SAI — và đây là phép đo bác bỏ nó

Plan §3.C bảo thêm knob này cho **cả ba** Job trong repo. Tài liệu k8s ghi TTL
dọn Job *"either Complete or Failed"*. Đo thật trên cụm, có đối chứng âm:

```
ttl-probe-fail-withttl   (Failed, ttlSecondsAfterFinished=20)  → DELETED
ttl-probe-fail-nottl     (Failed, KHÔNG ttl)                   → PRESENT   ← đối chứng âm
```

Cả hai cùng `Failed`; chỉ cái có TTL biến mất. Đối chứng âm là thứ làm kết luận
có nghĩa — nếu không có nó thì "biến mất" không phân biệt được với "có thứ khác
đang dọn Job đỏ".

**Hệ quả với canary:** canary là một CHUÔNG BÁO. Đặt TTL lên nó nghĩa là Job đỏ
tự bốc hơi sau ngần ấy giây — nổ lúc 3h sáng thì sáng ra không còn log lẫn
event, phá đúng thứ `failedJobsHistoryLimit: 5` đang giữ. Ta muốn dọn rác XANH,
không dọn bằng chứng ĐỎ. Không có `ttlSecondsAfterSucceeded` trong Kubernetes.

Knob đúng là `successfulJobsHistoryLimit` vì nó **CÓ phân biệt theo kết quả**.

**Hai Job còn lại cũng không nhận TTL,** và đây là lý do từng cái — plan bảo áp
đồng loạt, nhưng áp đồng loạt là sai ở cả hai:

| Job | Vì sao KHÔNG |
|---|---|
| `migrate-job.yaml` | `hook-delete-policy: before-hook-creation,hook-succeeded` đã tự dọn; và nó **cố ý bỏ `hook-failed`** để giữ Job đỏ mà đọc log. TTL sẽ xoá đúng cái nó cố ý giữ. |
| `cni-token-refresh.yaml` | 3 job xanh là bằng chứng sống rằng bản vá R0 đang chạy (vế 1 của AC Calico). Nó ở `kube-system`, không dính gì AC-C1. |

### Lý do của `26` đã CHẾT, không phải bị bỏ qua

Chú thích cũ dẫn AC Calico "hai mốc T+25h và T+37h". Vế T+37h **đã bị BỎ
2026-08-11** (phase-1.md §Calico) sau khi cụm ngủ 14h trùm đúng lên mốc đó. AC
nay là ba vế chịu-được-suspend, không vế nào đọc lịch sử Job. Chú thích vẫn dẫn
một AC đã chết là chú thích sẽ khiến người sau khôi phục lại con số 26.

### AC-C1 — và ba Job ĐỎ còn nguyên là bằng chứng của chính lập luận trên

```
TRƯỚC: 26 pod Succeeded / 29 Job
SAU  :  2 pod Succeeded /  5 Job

Job còn giữ:
  dlp-cni-canary-29776920   Failed     31h   ← DeadlineExceeded 2026-08-13T10:00Z
  dlp-cni-canary-29777190   Failed     27h   ← DeadlineExceeded 2026-08-13T14:30Z
  dlp-cni-canary-29777430   Failed     23h   ← DeadlineExceeded 2026-08-13T18:30Z
  dlp-cni-canary-29778060   Complete
  dlp-cni-canary-29778810   Complete
```

Ba Job đỏ 23–31h tuổi **vẫn đọc được**. Với TTL ở bất kỳ giá trị thực dụng nào
(phút tới giờ) cả ba đã bị xoá từ lâu. Chuông đã từng kêu thật, và bằng chứng
của lần kêu ấy còn nguyên.

Chuỗi hiện khoẻ: `lastSchedule=2026-08-14T17:30:00Z` so với `now=17:47:16Z`
(đọc `date` TRÊN VM, không trộn với đồng hồ Windows).

### Năng lực bị mất, và chỗ nó được trả lại

Hạ 26 → 2 làm **mất** khả năng đọc ngược khoảng đứt nhịp từ danh sách Job (đo
được một khoảng 12.5h giữa hai lượt canary còn giữ — dấu vết cụm ngủ). Không
ghi ra thì đây là mất năng lực chẩn đoán ròng.

Năng lực ấy chuyển sang `kube_cronjob_status_last_schedule_time` của
kube-state-metrics, và đó là lý do panel 6 của dashboard tồn tại. **3.C chỉ đúng
vì 3.D đi cùng lượt** — làm 3.C một mình là một bước lùi.

---

## 3.D — stack quan sát

### AC-D5 — ngân sách RAM

```
available: 7915 MB → 6647 MB   (chênh 1268 MB)
```

Không phải cắt gì. `kubeControllerManager/Scheduler/Proxy/Etcd` tắt tường minh:
trên kubeadm 1-node chúng không expose endpoint ở địa chỉ job mặc định, và một
bảng target đầy màu đỏ "bình thường" là cách chắc nhất để không ai nhận ra một
target đỏ THẬT.

### AC-D1 — và cặp trước/sau là thứ làm nó có nghĩa

NetworkPolicy của 3.B đang bật, `metricsScrape` thì chưa. Trạng thái đó cho một
**đối chứng âm miễn phí**:

```
BASELINE (metricsScrape=false):
  gateway        health=down   Get "http://10.244.211.92:8083/metrics": context deadline exceeded
  orchestrator   health=down   Get "http://10.244.211.88:8081/metrics": context deadline exceeded
  traefik        health=up     OK        ← namespace traefik không có NetworkPolicy

SAU (metricsScrape=true, 13 → 15 policy):
  gateway        health=up     OK
  orchestrator   health=up     OK
  traefik        health=up     OK
```

Hai đích trong namespace bị siết lật `down → up` **đúng lúc** rule được mở;
đích ngoài namespace không nhúc nhích ở cả hai lượt. Đó là quy nguyên nhân, không
phải "sau khi làm gì đó thì nó xanh". `context deadline exceeded` (gói bị THẢ)
chứ không phải connection refused — cùng cách đọc mà `netpol-verify.sh` của 3.B
dùng cột thời gian để phân biệt.

### Ba lần phép đo của tôi nói sai trước khi nói đúng

Chặng này tôi sai bốn lần, và cả bốn đều là **phép đo sai**, không phải hệ sai.
Ghi ra vì mỗi cái là một cách đọc ra kết luận ngược.

**#1 — `job` KHÔNG phải tên monitor, và sai khác nhau theo loại monitor.**
Bản đầu của `verify_observability.py` so theo nhãn `job`:

```
PodMonitor     dlp-gateway       → job = "monitoring/dlp-gateway"   (ns/tên)
ServiceMonitor dlp-orchestrator  → job = "platform-orchestrator"    (từ NHÃN Service)
```

Script báo "KHÔNG CÓ TARGET" cho cả ba **trong khi traefik đang up=1** — một
đích LÀNH bị đọc thành đích CHẾT. Đã chuyển sang `scrapePool`, thứ mang thẳng
danh tính object monitor.

**#2 — image Prometheus là distroless.** `kubectl exec … wget` trả
`OCI runtime exec failed`, đọc rất giống lỗi quyền/CNI chứ không giống "thiếu
binary". Chuyển sang **proxy của apiserver** (`kubectl get --raw
.../services/<svc>:<port>/proxy/...`): không cần binary trong image, không cần
port-forward (mà port-forward thì 3.B đã làm hỏng một phần).

**#3 — 67601 entry bị Loki từ chối, và nó KHÔNG phải sự cố.**
`promtail_dropped_entries_total{reason="ingester_error"}` = 67601 trông như hệ
hỏng nặng. Đọc log thật:

```
entry ... has timestamp too old: 2026-08-08T09:59:37Z,
oldest acceptable timestamp is: 2026-08-11T18:22:20Z
```

promtail lúc mới cài đọc lại **toàn bộ file log cũ trên node** (kube-apiserver
từ 08-08, calico từ 08-10) và Loki từ chối mọi entry quá
`reject_old_samples_max_age: 72h`. Đó là backlog lịch sử, không phải log hiện
tại. Thứ phân biệt "đang đuổi kịp" với "hỏng thật" là **entry mới nhất cách
hiện tại bao lâu** — đo được **1 giây**. Nên phép kiểm của script đo cái đó,
không đo bộ đếm drop.

**#4 — "0 dòng log" là hệ ĐANG RẢNH, không phải pipeline chết.**
AC-D3 đỏ với 0 dòng cho cả ba component. Nhưng promtail trễ 1 giây và bộ đếm
sent vẫn tăng (67649 → 67675). Nguyên nhân: namespace `default` **thật sự không
sinh dòng log nào trong 1 giờ đó** — Next không log request thành công (đúng
điều AC-A1 của 3.A đã ghi). Sau khi sinh tải thật (13 request qua ingress) +
restart ba deployment:

```
container=web             5 dòng (1h)  OK
container=gateway         7 dòng (1h)  OK
container=orchestrator    8 dòng (1h)  OK
trễ nhất: 32s trước
```

> **Ô AC-D3 như plan viết không phân biệt được "pipeline hỏng" với "không có gì
> xảy ra".** Đây cùng họ với "suite xanh vì skip sạch" đã ghi ở P1. Script nay
> in thêm độ trễ của entry mới nhất, để hai ca đó tách nhau ra.

### AC-D2 — 6/6, sau khi phát hiện hai metric mới chưa được deploy

Lượt đo đầu: 4/6, hai ô rỗng đúng là hai metric tôi vừa thêm. Không phải lỗi
đấu nối — image đang chạy (`sha-a6f6768`) có `dlp_pool_free_size` mà không có
`dlp_pool_claimed_size`. Đã build + side-load (`docker save` → `ctr import`,
cụm không pull) tag `3d-04a3a95`:

```
claim latency         32 series  OK
WS active              1 series  OK
pod pool free          1 series  OK
pod pool claimed       1 series  OK      ← metric mới
reap rate              8 series  OK
error rate (claim)     8 series  OK      ← metric mới; 8 = 2 path × 4 result, đúng zero-init
```

`dlp_claim_total` ra đúng **8** series khi chưa có lượt claim nào là bằng chứng
zero-init chạy: alert đọc được số 0 thay vì NO-DATA.

### AC-D4 — alert bắn thật, trên chính rule thật

Hạ ngưỡng của **rule thật** (`DlpPoolCan`: `== 0` → `>= 0`, `for: 10m` → `1m`)
thay vì dựng một rule giả, để đường đi được kiểm là đường đi thật:

```
Prometheus   : state=firing  severity=warning
Alertmanager : 1 alert DlpPoolCan, status=active
               summary = "warm pool cạn liên tục 10 phút"
```

Đi hết chặng đường Prometheus → Alertmanager, không dừng ở "expr trả về true".
Đã khôi phục ngưỡng gốc và xác nhận lại trên file.

### Cổng CI netpol MÙ với policy tên MỚI

Định thêm hai policy scrape thì phát hiện cổng của 3.B không bắt được chúng:

```python
platform_names = {short(n) for n in names} & (STORE_INGRESS ∪ BASE ∪ DENY)
```

Phép **GIAO** loại mọi tên lạ khỏi tập so sánh, nên policy tên mới không bao giờ
hiện ở vế `thừa` — đúng ca mà chú thích của `EXPECTED_ALLOW_BASE` tự nhận bắt
được ("thừa = một chiều được mở ngoài ý định"). Thêm một chiều là hỏng theo
hướng **NỚI quyền**, nguy hơn gỡ một chiều.

Nay nhận diện theo nhãn `app.kubernetes.io/component=platform-networkpolicy` do
chính chart đặt. Đối chứng:

```
render CÓ scrape + gate KHÔNG khai --metrics-scrape → exit=1
   "thừa=['allow-ingress-metrics-gateway','allow-ingress-metrics-orchestrator']"
render CÓ scrape + gate CÓ khai                     → exit=0
metricsScrape.enabled=true + namespace rỗng          → netpol:E-MONITORING-NS-EMPTY
guard coverage                                       → 7 declared = 7 tested
```

Ba nhánh cũ (`--expect-none` / allow / `--expect-deny`) vẫn xanh sau khi đổi
cách nhận diện.

### Hai policy scrape là rule RIÊNG, không nới rule cũ

Khối 9 của `platform-networkpolicy.yaml` đã dặn sẵn từ 3.B: *"Nếu sau này có
Prometheus thì chiều scrape là một rule MỚI từ namespace monitoring — đừng nới
rule này."* Nới khối 9 sẽ mở cổng **gRPC 9090** cho namespace monitoring, tức
đổi một chiều ĐỌC thành chiều GỌI RPC tạo/xoá pod.

`gateway:8083` scrape bằng **PodMonitor** chứ không ServiceMonitor: cổng admin
cố ý không nằm trên Service vì `/metrics` không có authz. Traefik cũng PodMonitor
— chart v41 có entrypoint `metrics` trên pod (:9100) nhưng Service chỉ expose
`web` + `websecure` (đo trên cụm; premise của plan đúng cả hai vế).

Cũng sửa một literal `8083` gõ thẳng ở khối 11 — chỗ **duy nhất** trong file lọt
khỏi phép đối chiếu `containerPort` của CI.

---

## AC-C3 — pool không rò qua restart

```
TRƯỚC:  pool:free=1 pool:claimed=0 pod_keys=1 sandbox_pods=1
        sandbox-570215d57bd2 Running age=19h
  (restart orchestrator)
SAU  :  pool:free=1 pool:claimed=0 pod_keys=1 sandbox_pods=1
        sandbox-570215d57bd2 Running age=19h
```

**Tuổi 19h không đổi** ⇒ đúng cùng một object, không phải pod trùng tên được tạo
lại. Sổ sách Redis khớp thực tế (1 pod key ↔ 1 pod chạy). Sweep-lúc-khởi-động
**không** giết một pod hợp lệ — đó là vế "đối chứng âm" của reaper mà AC-C2 mô tả,
tuy không phải bằng một session hết hạn.

---

## Bảng ô AC

| Ô | Kết quả | Bằng chứng |
|---|---|---|
| **C1** ≤ 2 pod Succeeded | ✅ | 26 → 2. Ba Job ĐỎ 23–31h **vẫn còn** — thứ TTL sẽ xoá |
| **C2** reaper dọn 100% session hết hạn | ❌ **KHÔNG ĐÓNG** | xem §Còn lại |
| **C3** restart không rò pod | 🟡 **một nửa** | pool + pod key + tuổi pod không đổi qua restart. Vế "session vẫn dùng được" chưa đo (không có session sống) |
| **D1** 3 target `up` | ✅ | 3/3, cặp baseline down/down/up → up/up/up khi mở đúng một rule |
| **D2** metric có dữ liệu | ✅ | 6/6; `dlp_claim_total` 8 series = zero-init đúng |
| **D3** Loki nhận log | ✅ | web 5 / gateway 7 / orchestrator 8 dòng; trễ 32s |
| **D4** alert bắn thật | ✅ | firing ở Prometheus **và** active ở Alertmanager |
| **D5** vừa ngân sách RAM | ✅ | 1268 MB; không phải cắt gì |

## Cổng đã chạy

```bash
helm template … --expect-none / allow / --expect-deny        # 3/3 xanh sau khi đổi nhận diện
helm template … --set metricsScrape.enabled=true | gate --metrics-scrape   # xanh
   (cùng render, KHÔNG khai cờ)                                            # ĐỎ đúng lý do
guard coverage: 7 declared == 7 tested
GOOS=linux go build ./... ; go vet ./...                     # rc=0
gofmt -l internal/                                            # sạch
go test ./internal/pool/ -run TestBaGaugePoolKhongDauNoiNhamKhoa   # PASS (Redis thật)
   mutation: trỏ gauge sang pool:free                              # FAIL đúng chỗ
shellcheck -S error infra/host/10-observability.sh            # sạch
```

> Test mới **chạy thật**, không skip: `internal/pool` và `internal/lifecycle` có
> **72 test SKIP** khi thiếu `REDIS_URL`, nên `go test` xanh ở đó phần lớn là
> suite skip sạch. Đã chạy trên Redis thật (container 6390) và mutation-test để
> chứng minh phép kiểm phân biệt được.

## Còn lại

1. **AC-C2 chưa đóng.** Cần dựng một session có TTL điều khiển được + một
   session chưa hết hạn làm đối chứng âm. Đường đi là gRPC `SessionService` qua
   **mTLS**, và repo hiện không có công cụ tạo session ngoài harness e2e (harness
   đó không nằm trong repo — 3.B chạy nó ad-hoc). Unit test của reaper đã phủ
   logic (`TestSweepKhongGietPodDangSinhRa`, `TestTang4KhongDungPodAmConSong`),
   nhưng plan đòi phép đo TRÊN CỤM và vế đó chưa có.
2. **Chart promtail đã deprecated** (`level=WARN msg="this chart is deprecated"`).
   Còn chạy, nhưng nên chuyển sang Grafana Alloy trước khi lên production.
3. **`grafana.adminPassword` truyền qua `--set`** trong lượt cài này. Chưa vào
   Secret quản lý; không ghim trong git nhưng cũng chưa có đường quản lý đúng.
4. **Retention 3 ngày** cho cả Prometheus lẫn Loki. Đủ cho vòng đo P3; 3.F (k6)
   phải đọc kết quả trong cùng phiên chứ không để hôm sau.
5. **`metricsScrape` dùng namespaceSelector TRẦN** (mọi pod trong `monitoring`),
   không ghim podSelector của Prometheus — nhãn đó đổi theo phiên bản chart nên
   ghim vào là dựng một chiều sẽ chết im lặng ở lần nâng chart. Đánh đổi chỉ đúng
   khi `monitoring` còn là namespace hạ tầng tin cậy.
6. **`kubeControllerManager`/`Scheduler`/`Proxy`/`Etcd` tắt.** Trên cụm nhiều
   node thật thì phải bật lại, nếu không mất hẳn tầng quan sát control-plane.
