# Đóng nợ trước cook P10 — báo cáo kiểm chứng

**Ngày:** 2026-09-04 · **Nhánh:** `chore/debt-closure-p10-ready` · **Cụm:** `debian-sandbox` (8 vCPU, 11.6 GiB, k8s v1.34.10, Sysbox) · **Helm rev:** 86 · **Image:** `dlp-web:p10a`, `dlp-sandbox-base:p10a`

Mục tiêu: dọn sạch mọi thứ còn nợ/bỏ sót/chặn của phase 0–9 để phiên sau vào thẳng cook P10.

| # | món nợ | trạng thái |
|---|---|---|
| 1 | `/labs` + `/playgrounds` chưa ai bấm bằng trình duyệt | **đóng** — bấm thật, 0 lỗi console của ứng dụng |
| 2 | CSP nới một origin cho IDE | **KHÔNG đóng** — thuộc 6.D, đã hoãn sang P13 từ trước |
| 3 | Trần `k8s-multinode` = 3 suy từ quota | **đóng** — đo được **3**, lặp lại 2 lượt |
| 4 | Cluster con chết ngắt quãng lúc boot | **đóng một nửa** — 0/10 tái phát, nhưng xem §4 |
| 5 | Lab nặng (PVC / image lớn) chưa có số | **đóng** — và nó **đảo** chỗ đáng lo |
| 6 | `DLP_K8S_NODES` nhận số bất kỳ | **đóng** — fail-closed về 1 kèm log |
| 7 | `ckad` tốn 1536Mi cho bài một pod | **đóng** — đo trên cụm: còn **1Gi** |
| 8 | `ideProfile` là số, chưa phải hành vi | **đóng phần nối dây** — xem §8 |
| 9 | Chiều GHI của Theia | **giữ hoãn** sang P13 (report cũ đã chốt) |

Ngoài ra: **16 ô AC** của P7/P8 tích từ bằng chứng, **P4** đánh dấu THAY THẾ, ba ô không-đóng-được được gọi đúng tên. Phase 0–9 nay còn **0** ô `- [ ]`.

---

## 1. Món 1 — `/labs` và `/playgrounds`, lượt bấm đầu tiên

Trình duyệt thật (Playwright, Chromium) qua **ingress HTTPS thật** `https://dlp.192.168.94.130.sslip.io:30443`, đăng nhập bằng tài khoản tạo qua chính API đăng ký.

| trang | quan sát |
|---|---|
| `/labs` (chưa đăng nhập) | redirect `/login` — authz đúng |
| `/labs` | 2 lab, bộ lọc độ khó, badge `5 nhiệm vụ` · `Đạt từ 80%` · `~40 phút` |
| `/labs/dlp-k8s-broken-deploy` | tab `Nhiệm vụ (5)` + tab `Bảng xếp hạng`, nút `Bắt đầu`, split-pane kéo được |
| `/playgrounds` | 2 sân chơi, mỗi thẻ hiện **`Tự đóng sau 30 phút`** |
| `/playgrounds/dlp-docker-playground` | mở được |
| `/lessons` | `dlp-k8s-multinode-scheduling` (bài mới) hiện đúng |
| `/lessons/ckad-configmap-as-files` | **không còn** banner cảnh báo năng lực |

**Lỗi console: 0 của ứng dụng.** Toàn bộ error đọc được là (a) `favicon.ico` 404 và (b) exception từ một **tiện ích mở rộng của trình duyệt** (`chrome-extension://…`), không phải mã của ta.

Ô AC 8.E đòi *"TTL riêng hiện trên UI trước khi bắt đầu"* — thực tế mạnh hơn: TTL hiện ngay trên **danh sách**, tức trước cả khi mở trang chi tiết.

> **Phát hiện nhỏ, chưa sửa:** `GET /favicon.ico` → 404. Không ảnh hưởng chức năng; ghi lại để không ai phải tìm lại.

## 2. Món 2 — CSP: KHÔNG đóng, và lý do có trước phiên này

Ô AC *"CSP nới đúng một origin; chạy lại đối chứng CSP của 3.E"* là **item 13 của task 6.D**. `phase-6.md` ghi 6.D là **⏸ HOÃN SANG P13 (chốt 2026-09-04)** — quyết định của chủ dự án, có trước phiên này.

Kiểm lại hiện trạng chứ không suy: `buildCsp` (`apps/web/src/server/security/headers.ts`) **không có `frame-src`**; FE **chưa có `<iframe>` IDE nào**; và **chưa có origin thứ hai nào tồn tại** để mà nới.

Nới CSP bây giờ = mở một lỗ cho một khung không tồn tại. Ô này đóng cùng lúc với iframe ở P13, không sớm hơn.

## 3. Món 3 — trần `k8s-multinode` = 3, đo được

Chạy `infra/k6/ceiling.js` với `SCENARIO_ID=dlp-k8s-multinode-scheduling`, tức đi qua `lessons.startSession` — profile tới từ **nội dung**, không từ phép đo.

```
##CEILING## giữ 3 session (id phân biệt = 3), lượt từ chối đầu tiên = #4 (refused_quota)
##CEILING## đã dọn 3/3 session
```

**Lặp lại 2 lượt độc lập, cùng kết quả.** Bốn ô chống-xanh-giả (lượt 2, có file summary):

| counter | giá trị | threshold |
|---|---|---|
| `dlpk6_sessions_created` | 3 | ok |
| `dlpk6_sessions_distinct` | **3** | ok |
| `dlpk6_refused_quota` | 1 | — |
| `dlpk6_refused_other` | **0** | ok |
| `dlpk6_refused_5xx` | **0** | ok |
| `dlpk6_quota_reported_as_5xx` | **0** | ok |
| `dlpk6_conn_errors` | **0** | ok |

`sessions_distinct = 3` loại trừ replay idempotent; `refused_other = 0` loại trừ "bị chặn ở tầng auth rồi đọc thành chạm trần".

Nền khi đo: quota `768Mi / 5500Mi` (3 pod warm pool × 256Mi) — **đúng nền mà phép tính năm-ràng-buộc dùng**. Số suy ra từ quota trước đây là 3; nay nó là số **đo được**, không phải số suy ra.

**Bài để đo trần này trước đây không tồn tại.** P7-bis mở năng lực `multi-node` nhưng không bài nào thật sự cần 2 node, nên trần của nó không thể chạy tải. `dlp-k8s-multinode-scheduling` (first-party, 3 bước) là người dùng thật đầu tiên — cả ba bước **sai kết quả nếu cụm chỉ có một node**, đó là chủ đích.

## 4. Món 4 — boot: 0/10 tái phát, và tại sao đó CHƯA phải "đã hết"

Harness `infra/host/p7-measure.sh` nay ghi thêm `k3sRestartCount`, đọc từ `docker inspect dlp-k3s`. Cần field này vì `readyVerdict` **không phân biệt được** "không có sự cố" với "có sự cố và `--restart=on-failure:3` đã cứu" — cả hai đều Ready.

N = 10 lượt, image `p10a`, đường sản xuất (`DLP_K8S=1`, entrypoint tự dựng cluster):

| | kết quả |
|---|---|
| Ready | **10/10** |
| Sự cố (`k3sRestartCount > 0`) | **0/10** |
| `secondsToReady` | 53 · 55 · 55 · 58 · 63 · 68 · 68 · 76 · 84 · 96 (trung vị ~66 s) |
| `workingSetPeakMiB` | 745.09 – 792.02 (trung bình ~764) |

**Hai điều phải nói thẳng, nếu không con số này bị đọc quá tay:**

1. **0/10 không phải 0%.** Với 0 sự kiện trên 10 mẫu, cận trên 95% ≈ **26–30%**. Câu đúng là *"chưa thấy tái phát trong 10 lượt"*, không phải *"đã hết"*.
2. **Đường CỨU chưa từng chạy.** `restartCount = 0` ở cả 10 lượt nghĩa là sự cố **không xảy ra**, chứ không phải bản vá đã cứu. Nên bản vá `--restart=on-failure:3` vẫn **chưa được chứng minh là hoạt động** — nó chỉ chưa cần đến. Muốn chứng minh phải gieo lỗi có chủ đích.

Ngoài ra lượt quan sát cũ (1/2 phiên chết) chạy trên image khác (`p7-k8s4/5`), nên so sánh trước–sau cũng không sạch.

## 5. Món 5 — lab nặng: RAM KHÔNG phải chỗ đáng lo

Variant mới `k3s-heavy-lab`: tải 5-Deployment cũ **cộng thêm** một PVC (local-path) và `postgres:16` (~450 MB) — đo hai trục PVC + image lớn trong một lượt, vì một bài thật thường có cả hai. Cổng Ready đòi **6/6 deploy `1/1` VÀ `pvc=Bound`** (chỉ đợi 5 deploy thì sẽ báo Ready trước khi postgres kéo xong image, và số đo là số của bài NHẸ).

| | lab nhẹ (5 nginx) | **lab nặng (+PVC +postgres:16)** |
|---|---|---|
| workingSet đỉnh | 745–792 MiB | **810.2 MiB** (+2…9%) |
| đĩa `/var/lib/docker` | ~998 MB | **1651 MB** (+65%) |
| tới Ready | 53–96 s | **514 s** |
| CPU-giây | ~155 | **336.5** |

**Kết luận đảo ngược giả định:** thêm PVC và một image gấp ~2.5 lần **gần như không đụng tới RAM** — 810.2 MiB vẫn nằm **dưới** `requests: 1Gi` đã đặt từ đỉnh 777.81 MiB, và cách xa `limits: 2Gi`. Profile `k8s` không cần đổi.

Cái đắt nằm ở **thời gian** và **đĩa**:

- **514 s tới Ready** (5–10× lab nhẹ). Vượt xa mặc định `dlp-k8s-wait` và vượt xa kiên nhẫn của người học. ⚠ Lượt đo chạy khi node đang tải nặng (load average 14.7–19.4 trên 8 vCPU), nên 514 s là **cận trên dưới tranh chấp**, không phải số lúc rảnh — và nó là **một mẫu**.
- **1651 MB đĩa pod** — dẫn thẳng tới phát hiện dưới đây.

> ### 🔴 Phát hiện mới: `ephemeral-storage` KHÔNG được gác bởi bất cứ thứ gì
>
> Đọc trực tiếp trên cụm:
>
> ```
> LimitRange  : default{cpu 2, memory 1Gi} · defaultRequest{250m, 256Mi} · max{cpu 4, memory 3Gi}
> ResourceQuota: limits.cpu 44 · limits.memory 22Gi · pods 26 · requests.cpu 5400m · requests.memory 5500Mi
> ```
>
> **Không dòng nào nhắc `ephemeral-storage`.** Một bài nặng ghi 1651 MB vào overlay của pod mà không gì chặn; 4 phiên K8s đồng thời = ~6.6 GB đĩa node, hoàn toàn ngoài mọi phép tính trần hiện có. Node còn 78 GB nên **chưa cấp bách**, nhưng đây là một trục chưa ai gác và giờ đã có số để gác.
>
> **CHƯA sửa có chủ đích:** đặt một quota đĩa quá thấp sẽ giết phiên đang chạy, và ngưỡng đúng là quyết định của chủ dự án. Số cần để quyết đã có: **1651 MB/phiên cho lab nặng nhất đo được**.

## 6–8. Ba món sửa bằng code

**Món 6 — `DLP_K8S_NODES`.** Trước: `=5` dựng 4 agent trên pod có requests đặt cho đúng 2 node; `=abc` làm `[ "$k3s_nodes" -ge 2 ]` báo lỗi cú pháp rồi đi tiếp như 1 node. Cả hai **hỏng ngầm**. Nay fail-closed về 1 kèm log, đặt ở **cả** `entrypoint.sh` và `dlp-k8s-wait.sh` (hai chỗ đọc cùng biến; lệch nhau = chờ số node phía kia không bao giờ dựng). Xác nhận có trong image `p10a`.

**Món 7 — `ckad` không còn trả tiền cho năng lực nó không dùng.** Thêm `requiresCapabilities` vào sidecar: thứ bài **ĐÒI**, tách khỏi `capabilities` = thứ image **CUNG CẤP**. Không phải derived field — chính việc gộp hai câu hỏi ấy là cái sai. `effectiveCapabilities()` là **hàm**, không phải cột thứ ba. Loader ép TẬP CON và nêu cả hai phía trong thông điệp lỗi.

Đo trên cụm, qua đúng đường người học:

```
sandbox-c442cd08d8e8   requests 1Gi   limits 2Gi     ← profile k8s
```

trước đó là `1536Mi / 3Gi` (profile `k8s-multinode`). **Trả lại 512Mi mỗi phiên.**

**Món 8 — `ideProfile`: từ SỐ thành HÀNH VI.** `grep -rn ideProfile infra/helm/platform/templates/` trả về **rỗng** — khối bốn con số từ 6.E chưa từng được template nào đọc, nên pod có IDE vẫn nhận LimitRange mặc định 256Mi bất kể nó ghi gì.

Không dựng đường thứ hai: bốn số chuyển xuống `sandbox.profiles.ide`, đi qua cơ chế đã chứng minh là nối thật. Xác nhận trên cụm sau `helm upgrade`:

```
SANDBOX_PROFILES = {"ide":{...768Mi...},"k8s":{...1Gi...},"k8s-multinode":{...1536Mi...}}
```

> ⚠ **Nói thẳng chỗ chưa trọn:** giá trị nay CHẢY tới orchestrator và được `parseSandboxProfiles` phân giải lúc khởi động (orchestrator không lên nếu sai định dạng — nó đã lên). Nhưng **chặng cuối chưa được chạy**: chưa nội dung nào khai `interfaceLayout: 'ide'`, nên chưa pod nào thực sự nhận profile này. Cùng lý do với món 2 — nội dung IDE thuộc P13. Trạng thái đúng là *"đã nối, chưa có ai đi qua"*, không phải *"đã chứng minh".*
>
> Tổ hợp **ide + kubernetes** trả `k8s` và **CHƯA CÓ SỐ ĐO** (một bên đo không có IDE, bên kia đo không có cluster con; cộng thẳng là phép tính đã sai 18% một lần). Có **chuông báo** đi kèm: `content-scenarios.test.ts` đỏ ngay khi xuất hiện bài đầu tiên vừa `ide` vừa đòi `kubernetes`.

## 9. Sửa kèm — một test chỉ chạy đúng được MỘT lần

`repository.integration.test.ts` seed id **cố định** `dlp-docker-basics` (bắt buộc: ca đó dựng va chạm với bài thật trên đĩa). Một lượt chạy bị ngắt để lại hàng đó và **mọi lượt sau** đỏ với `duplicate key` — một lỗi hạ tầng đọc ra như lỗi code. Đã gặp thật trong phiên này. Seed nay xoá trước khi chèn.

## 10. Cổng đã chạy

| cổng | kết quả |
|---|---|
| `pnpm typecheck` | **10/10 task** |
| `pnpm lint` | **9/9 task** |
| `pnpm test` | **9/9 task · 662 test** (scenario 172→**178**, web 305→**312**, terminal 105, shared-types 38, ui 29) |
| `go build` + `go vet`, `GOOS=linux` | 4 module sạch |
| `go test` (native) | 20 gói `ok`, 0 FAIL |
| shellcheck `content/**/dlp-*` | **39 script**, `--severity=error` → **exit 0** |
| shellcheck `p7-measure.sh`, `entrypoint.sh`, `dlp-k8s-wait.sh` | sạch |
| `helm template` | render đúng, `ide` có mặt trong `SANDBOX_PROFILES` |
| `GET /api/health` qua ingress thật | **200** |

> ⚠ **CI đang tạm dừng tới hết P14** (`docs/ci-paused.md`, quyết định 2026-09-04). Mọi cổng trên là **lượt chạy TAY** dùng cùng công cụ và cùng ngưỡng với CI — không phải một lượt CI xanh. `GOOS=linux go test` **không** dùng được để kết luận (nó biên dịch chéo binary Linux mà Windows không chạy được, nên mọi gói đều "FAIL" một cách giả); test chạy native, build/vet chạy `GOOS=linux` để không bỏ sót file `*_unix.go`.

## 11. Dọn dẹp

**Docker (Windows)** — giữ nguyên `playablelabs*`, `ironfront*` (6 image), mọi volume, `dlp-postgres`/`dlp-redis` đang chạy:

| | trước | sau |
|---|---|---|
| Image | 108 · 25.93 GB | **31 · 7.39 GB** |
| Build cache | 490 mục · 47.79 GB | **0** |
| Container | 6 | 5 (gỡ `dlp-proxy` đã Exited 3 tuần) |
| Volume | 30 · 2.989 GB | **không đụng** |

**≈ 66.3 GB** thu hồi. Giữ lại 7 tag `dlp-*`: bản đang chạy + đúng một bản lùi mỗi thành phần.

**Cache Windows:** `go clean -cache` (2.50 GB) · `.turbo` (2.68 GB) · `apps/web/.next` (0.74 GB) · `%TEMP%` mục > 7 ngày. **≈ 5.9 GB**. Giữ `node_modules` + pnpm store (đang dùng).

**VM:**

- Xoá 10 bản chép tay cũ trong `$HOME`, **gồm `~/dlp-deploy`** — cái bẫy "chart lệch repo" mà ghi chú dự án đã cảnh báo hai lần. Gỡ nó là gỡ hẳn bẫy, không chỉ dọn chỗ.
- containerd: **45 → 7** tag `dlp-*`. Cổng chặn trước khi xoá: đối chiếu với image **đang được pod dùng** ⇒ *"AN TOÀN: 0 tag đang dùng nằm trong danh sách xoá"*. Không dùng `crictl rmi --prune`. `/var/lib/containerd` 25 G → **22 G**; đĩa 32 G → **29 G**.
- DB nền tảng: xoá **6** hàng `p9-trial-*` (rác kiểm chứng publish của P9; 2 hàng đang ở trạng thái `published`, tức người học nhìn thấy).
- Xoá namespace đo `dlp-p7`, `dlp-p7-boot`, `dlp-p7-heavy`. Netpol tạm trên `dlp-registry`: **đã tự gỡ** (trap sửa ở P7-bis hoạt động đúng).

Sau dọn: 200 qua ingress, **0 pod `ImagePullBackOff`**, warm pool 3/3.

## 12. Còn lại — nói thẳng

- **`ephemeral-storage` chưa được gác** (§5). Đã có số để quyết; ngưỡng là quyết định của chủ dự án.
- **Bản vá restart của k3s chưa được chứng minh** (§4) — chỉ chưa cần đến trong 10 lượt.
- **Chặng cuối của profile `ide` chưa ai đi qua** (§8) — chờ nội dung IDE ở P13.
- **CSP + chiều GHI của Theia** — thuộc P13, theo quyết định có trước.
- **`secondsToReady` của lab nặng là một mẫu, đo lúc node tải nặng** (§5).
- **`favicon.ico` 404** (§1).
- **Xoá nhánh remote bị chặn** — 23 nhánh đều đã có PR merge tương ứng (kiểm bằng `gh pr list --state merged`, không bằng `git branch --merged` vì squash làm cờ đó nói dối), nhưng thao tác xoá bị cổng an toàn của môi trường chặn. Danh sách đã sẵn; cần chủ dự án chạy hoặc cấp quyền.

## 13. P10 bắt đầu từ đâu

Phase 0–9 còn **0** ô `- [ ]`. P10 (`blocked-by P8 + P9`) nay không còn phụ thuộc gì chưa đóng.

Đọc trước khi cook: `plans/devops-learning-platform/phase-10.md` — và giữ đúng ranh giới của nó: **"khoá học" CHỈ là cách nhóm nội dung có thứ tự**; không `price`, không `entitlement`, không paywall. Một task cần bảng `enrollments` có trạng thái thanh toán là tín hiệu dừng lại và hỏi.

Cụm lúc bàn giao: helm rev **86**, `dlp-web:p10a` + `dlp-sandbox-base:p10a`, warm pool 3, quota nền `768Mi / 5500Mi`, trần đo được **k8s = 4** · **k8s-multinode = 3**.
