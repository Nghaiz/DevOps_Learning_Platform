# Đo sẵn sàng cụm trước deploy đợt 3 (P13)

- **Thời điểm đo:** 2026-09-06, 21:16 → 21:31 (+07) = 14:16 → 14:31 UTC — **mốc lấy từ trong VM**.
- **Cụm:** `debian-sandbox` 192.168.94.130, kubeadm v1.34.10 một node control-plane, containerd 2.3.3, Sysbox CE 0.7.0, Calico.
- **Nhánh repo:** `feat/p13-frontend`. Chart đối chiếu: `infra/helm/platform/`.
- **Kỷ luật:** chỉ đo. Không `helm upgrade`, không `kubectl apply/delete`, không `ctr images rm`, không sửa file trên VM. Ngoại lệ duy nhất đã dùng: một pod thử, tự xoá.

---

## Kết luận

> **SẴN SÀNG nhưng phải làm HAI việc trước.**
>
> **X1 — bump + build + side-load ba image `p13`.** Bắt buộc, không phải tuỳ chọn: chart mới đã đổi
> `CAPACITY_SOFT_LIMIT` → `CAPACITY_HARD_LIMIT`, còn binary trên cụm là `:p12fix` và vẫn đang chạy
> `CAPACITY_SOFT_LIMIT=20` (đo được trong env Deployment). Deploy chart mới với image cũ = CrashLoopBackOff.
>
> **X2 — hạ tải node trước khi chạy e2e.** Node đang quá tải CPU **~3.5×** và **đang xấu đi**
> (load 1m 37.26, PSI `some avg10` 77.94% lúc 21:26). Ở mức tải này kubelet đã bắn một loạt
> `Unhealthy` cho **13 pod cùng lúc** vào lúc ~20:50, tức trước khi phiên đo này bắt đầu.
> Deploy vẫn nhiều khả năng qua được (requests CPU mới chiếm 32% allocatable), nhưng suite e2e
> với timeout chọn cho cụm rảnh sẽ chớp tắt — đúng lớp lỗi dự án đã dính hai lần.

Không có hạng mục nào ở trạng thái **CHƯA SẴN SÀNG**: cụm tạo được pod, đĩa thừa, datastore sống,
đường promote vai trò thông suốt.

---

## 1. Cụm còn sống không

| Hạng mục | Đo được | Kết |
|---|---|---|
| Node `debian-sandbox` | `Ready`, v1.34.10, 8 CPU | ĐẠT |
| Điều kiện node | `MemoryPressure/DiskPressure/PIDPressure = False`; `NetworkUnavailable=False (CalicoIsUp)` | ĐẠT |
| Pod not-ready | 0 — mọi pod `Running` hoặc `Completed` | ĐẠT |
| CrashLoopBackOff **hiện tại** | **0** | ĐẠT |
| Sysbox | `sysbox`, `sysbox-mgr`, `sysbox-fs` đều `active`; 6 mount fuse; sysbox-runc CE 0.7.0 | ĐẠT |
| Tiến trình D-state | **0** — không có wedge | ĐẠT |
| **Phép thử tạo pod (thật)** | **ĐẠT** — pod mới lên `Running` rồi xoá sạch | ĐẠT |

**Phép thử tạo pod là bằng chứng quyết định.** Lịch sử dự án có ca "sysbox wedge":
`/api/health` 200 + `kubectl get nodes` `Ready` + `helm list` `deployed`, mà **không ai tạo nổi pod**
(`FailedCreatePodSandBox: … EOF`). Ba tín hiệu tầng trên đó đều xanh trong ca hỏng, nên chúng không
chứng minh được gì. Lượt này đã tạo pod thật và pod lên `Running`.

### Control plane: KHÔNG crash-loop hiện tại, nhưng đếm restart cao

| Pod | Restarts | Lần chấm dứt gần nhất |
|---|---|---|
| `kube-controller-manager` | **137** | Error exit=1, **5.1 h trước** |
| `kube-scheduler` | **136** | Error exit=1, **5.1 h trước** |
| `kube-apiserver` | 41 | Error exit=137, 82.2 h trước |
| `etcd` | 7 | Unknown exit=255, 88.2 h trước |
| `calico-kube-controllers` | 58 | Error exit=255, 82.2 h trước |
| `traefik` | 22 | 5.1 h trước |
| `kps-kube-state-metrics` | 103 | 41 h trước |
| `local-path-provisioner` | 76 | — |

Đọc đúng: **không pod nào đang crash-loop lúc đo**. Nhưng kcm + scheduler cùng chết `exit=1` cách
nhau chưa tới một phút, 5.1 h trước — dạng mất leader-election khi apiserver không kịp trả lời, tức
hệ quả của đói CPU chứ không phải lỗi của chính chúng. VM boot 2026-09-03 05:01, uptime 1 ngày 16 h,
nên **không có reboot gần đây**; đợt restart 5.1 h trước không đến từ khởi động lại máy.

### Đợt `Unhealthy` đồng loạt lúc ~20:50 (+07)

`kubectl get events -A` cho thấy **13 pod ở 5 namespace** cùng bị `Readiness/Liveness probe failed:
context deadline exceeded` trong cùng một cửa sổ: `platform-web`, `platform-gateway` (cả 2 bản),
`platform-orchestrator`, `coredns` (cả 2), `calico-node`, `calico-kube-controllers`, `loki`,
`loki-gateway`, `promtail`, `kps-grafana`, `kps-operator`, `kps-prometheus-node-exporter`,
`platform-registry-mirror`. Mười ba probe tới mười ba đích khác nhau không cùng hỏng vì lý do
riêng — đó là node đứng hình. `local-path-provisioner` lại `Unhealthy` thêm một lần lúc 21:28.

**Cửa sổ này xảy ra TRƯỚC khi phiên đo bắt đầu** (lệnh `kubectl` đầu tiên của tôi ~21:10), nên nó
không phải do chính hoạt động đo gây ra.

---

## 2. Đĩa

| Đo | Giá trị |
|---|---|
| `/` (`/dev/nvme0n1p1`) | **112 G tổng, 28 G dùng, 79 G trống, 26%** |
| inode | 317 927 / 7 462 912 dùng (5%) |
| `/var/lib/containerd` | 22 G |
| — `snapshotter.v1.overlayfs` | 18 G |
| — `content.v1.content` | 4.3 G |

**79 G trống là thừa cho ba image `p13`.** Không có sức ép đĩa (`DiskPressure=False`).

### Rác containerd — CHỈ BÁO, KHÔNG DỌN

| Đo | Giá trị |
|---|---|
| Record `sha256:` mồ côi | **39** |
| Tổng image record | 147 |
| Lease | **46** |
| `mutation_threshold` | 100 |
| `deletion_threshold` | **0** (GC theo dung lượng đang TẮT) |
| `startup_delay` | 100 ms |

39 record mồ côi + 46 lease là đúng chân dung đã biết: `ctr images import` (đường side-load của dự án)
ghi thêm một record đặt tên theo digest bên cạnh record theo tag, và mỗi lượt import để lại một lease
"đừng dọn cái này". Chúng giữ layer sống trong overlayfs. GC không chạy khi ta nghĩ:
`deletion_threshold = 0` và ngưỡng mutation là 100 thao tác.

**Không dọn gì trong lượt này** (đúng yêu cầu). Ba ghi chú cho lúc dọn thật:

- **CẤM `crictl rmi --prune`.** Nó xoá mọi image không được pod tham chiếu *tại thời điểm chạy*, mà
  `dlp-sandbox-base` chỉ có pod dùng khi ai đó đang mở phiên. Prune lúc rảnh = mất image nền của
  toàn bộ tính năng bài học, và cụm đang `imagePullPolicy: Never` + không internet nên **không pull lại được**.
- Đường đúng là ba lớp theo thứ tự: tag → record `sha256:` → lease; và **đừng kết luận gì cho tới
  sau lần containerd khởi động kế tiếp** (`startup_delay` mới kích GC).
- Ba image `p13` sắp import sẽ **thêm** 3 record theo tag + 3 record mồ côi + ít nhất 3 lease. Với
  79 G trống thì lượt này không phải vấn đề dung lượng.

---

## 3. Release helm hiện tại

`helm list -A`:

| Release | NS | Rev | Cập nhật | Status | Chart |
|---|---|---|---|---|---|
| **platform** | default | **90** | **2026-09-06 16:50:59 +07** | `deployed` | platform-0.1.0 |
| kps | monitoring | 1 | 2026-08-15 | deployed | kube-prometheus-stack-88.3.0 |
| loki | monitoring | 1 | 2026-08-15 | deployed | loki-7.3.0 |
| promtail | monitoring | 1 | 2026-08-15 | deployed | promtail-6.17.1 |
| traefik | traefik | 3 | 2026-08-14 | deployed | traefik-41.2.0 |

Lịch sử `platform`: rev 87 (2026-09-04 17:58) `failed` — *pre-upgrade hooks failed: Job/platform-migrate
not ready*; rev 88–90 `Upgrade complete`. Rev 90 khớp tuổi pod platform (4 h 24 m).

### Tag image — ĐANG CHẠY THẬT (đọc từ Deployment, không đọc từ values)

| Thành phần | Tag đang chạy | values-selfhost.yaml (git) | Cần cho P13 |
|---|---|---|---|
| web | **`p10a`** | `p10a` (dòng 97) | → `p13` |
| orchestrator | **`p12fix`** | `p12fix` (dòng 148) | → `p13` |
| gateway | **`p12fix`** | `p12fix` (dòng 194) | giữ nếu không đổi |
| migrator | — (chạy dạng hook) | `p9` (dòng 80) | → `p13` |
| `image.tag` (global) | — | `sha-2b79fd3` (dòng 37) | — |
| `sandboxImage` | `ghcr.io/nghaiz/dlp-sandbox-base:p10a` | `p10a` (dòng 154) | — |

**Web đang ở `p10a`, KHÔNG phải `p12fix`.** Trên node cũng không hề có `dlp-web:p12fix` (xem §4).

### Ba khoá được hỏi đích danh

| Khoá | Giá trị | Nguồn | Đối chiếu schema `values.yaml` |
|---|---|---|---|
| `networkPolicy.platform.enabled` | **`true`** | user-supplied (release) | khoá THẬT |
| `gateway.service.exposeAdminPort` | **không khai** ⇒ mặc định chart **`auto`** | chart `values.yaml:308` | khoá THẬT |
| `orchestrator.env.capacitySoftLimit` | **`'20'`** | user-supplied (release) | **KHOÁ ĐÃ BỊ KHAI TỬ** |

`exposeAdminPort: auto` nghĩa là "lên Service KHI VÀ CHỈ KHI `networkPolicy.platform.enabled`".
Netpol đang `true`, nên cổng admin **bật**. Khớp với runbook §3ter mục 6 (không cần `--set` gì thêm cho metric).

Khác trong release (đã lọc bí mật): `platform.grpcMtlsMode='require'`, `global.imagePullPolicy='Never'`,
`ingress.enabled=true` host `dlp.192.168.94.130.sslip.io` class `traefik`, `redirectHttps.port=30443`,
`networkPolicy.platform.denyEnabled=true`, `metricsScrape.namespace='monitoring'`,
`registryMirror.enabled=true`, `web.env.rateLimitTrustProxy=1`, `sandbox.quota` = pods 28 /
requestsCpu 5850m / requestsMemory 5952Mi / limitsCpu 48 / limitsMemory 24Gi, `poolTarget='3'`.
Mật khẩu PG/Redis, `betterAuthSecret`, `ingress.tls.secretName` **không chép vào đây**.

### `capacitySoftLimit` — đã kiểm, KHÔNG chặn deploy qua `12-helm-deploy.sh`

Chart mới có cổng `fail` cứng (`orchestrator-deployment.yaml:174-175`): nếu `orchestrator.env` còn
khoá `capacitySoftLimit` thì render **dừng** với `[orchestrator:E-CAPACITY-KEY-RENAMED]`. Release
đang chạy CÓ khoá đó trong values user-supplied, nên đây trông như một quả mìn.

**Đo lại đường đi thật thì nó không nổ.** `12-helm-deploy.sh` **không** dùng `--reuse-values` cũng
không dùng `--reset-then-reuse-values`. Nó mang sang **theo danh sách CHO PHÉP**: chỉ ba subtree
`ingress` / `networkPolicy` / `platform`, cộng vài leaf bí mật + phụ thuộc máy dưới
`datastore.*.password` và `web.env.*`. `orchestrator.env.capacitySoftLimit` **không** nằm trong danh
sách nên bị bỏ — git thắng. Và `values-selfhost.yaml:176` đã khai `capacityHardLimit: '23'` (trần vật
lý đã đo ở lab P12), nên mặc định cloud-shaped `'8'` chưa đo **không** được dùng.

**Ràng buộc phái sinh:** cổng `fail` này chỉ vô hại khi deploy đúng bằng `12-helm-deploy.sh`. Một
lượt `helm upgrade --reset-then-reuse-values` gõ tay sẽ kéo `capacitySoftLimit='20'` trở lại và render
**fail**. Lời khuyên nằm trong chính thông báo lỗi ("dùng `--reset-then-reuse-values`") là **sai** cho
ca này — cờ đó vẫn tái áp values user-supplied. Muốn gỡ khoá bằng tay thì phải
`--set orchestrator.env.capacitySoftLimit=null`.

---

## 4. Image `dlp-*` đang có trên node

`sudo ctr -n k8s.io images ls -q | grep dlp-` — **10 tag**:

```
docker.io/library/dlp-lifecycle-probe:dev
ghcr.io/nghaiz/dlp-migrator:p9
ghcr.io/nghaiz/dlp-orchestrator:p12fix        <- dang chay
ghcr.io/nghaiz/dlp-orchestrator:p7
ghcr.io/nghaiz/dlp-sandbox-base:p10a          <- dang chay (SANDBOX_IMAGE)
ghcr.io/nghaiz/dlp-sandbox-base:p7-k8s5
ghcr.io/nghaiz/dlp-terminal-gateway:p12fix    <- dang chay
ghcr.io/nghaiz/dlp-terminal-gateway:sha-2b79fd3
ghcr.io/nghaiz/dlp-web:p10a                   <- dang chay
ghcr.io/nghaiz/dlp-web:p9b
```

- Ba tag đang phục vụ khớp đúng Deployment: gateway `p12fix`, orchestrator `p12fix`, **web `p10a`**.
- **Không có `dlp-web:p12fix`** trên node. Kỳ vọng "mọi thứ ở `:p12fix`" là sai với web.
- **Không có tag `p13` nào.** Cổng render-vs-`ctr images ls` trong `12-helm-deploy.sh` sẽ (đúng đắn)
  dừng lượt deploy nếu values-selfhost bump lên `p13` mà chưa side-load — dừng **trước** upgrade,
  không phải giữa chừng.
- `dlp-lifecycle-probe:dev` có mặt, nên `reaper-verify.sh` và vế lifecycle của `13-smoke.sh` chạy được.

---

## 5. Đồng hồ

| Đo | Giá trị |
|---|---|
| VM UTC (lúc đo) | `2026-09-06T14:28:22Z` |
| VM local | `2026-09-06T21:28:22 +0700` (Asia/Ho_Chi_Minh) |
| `NTPSynchronized` | **yes**, NTP service `active` |
| RTC | khớp UTC, `RTC in local TZ: no` |

### Lệch so với đồng hồ Windows: **VM NHANH HƠN 9.5 – 10.0 giây**

Đo bằng cách kẹp một lượt SSH giữa hai lần đọc đồng hồ Windows rồi lấy trung điểm; sai số không quá RTT/2:

| Lượt | RTT | skew trung điểm | Khoảng chắc chắn |
|---|---|---|---|
| 1 | 791 ms | 9 863 ms | [9 468 , 10 258] |
| 2 | 588 ms | 9 765 ms | [9 471 , 10 059] |
| 3 | 499 ms | 9 713 ms | [9 464 , 9 962] |
| 4 | 858 ms | 9 827 ms | [9 398 , 10 256] |

Giao của bốn khoảng: **[9 471 , 9 962] ms**. Khoảng này **không chứa 0** — độ lệch là thật.

**Vì sao phải nói rõ:** so hai đồng hồ ở mức PHÚT (`14:23Z` so với `21:23 +07`) **không thể** phát
hiện lệch 10 giây; hai đồng hồ lệch 10 s vẫn hiện cùng một phút suốt 50 giây mỗi phút. Và lệch **nhỏ**
nguy hơn lệch lớn: cửa sổ đo ra vẫn dương, vẫn trông hợp lý, và không có gì trong output nói rằng nó
sai. (Lệch lịch sử khoảng 59 s đã co lại còn khoảng 10 s, không biến mất.)

**Hệ quả cho đợt 3:** mọi phép đo thời gian phải lấy **cả hai mốc từ trong VM**. Trừ một mốc apiserver
(`creationTimestamp`, `lastTransitionTime`, event) cho một mốc `date` bấm ở Windows sẽ sai đúng
khoảng 10 s. VM đang đồng bộ NTP còn Windows thì `w32tm /query /status` không đọc được — nghĩa là
**Windows nhiều khả năng là phía chậm**, chứ không phải VM chạy nhanh.

---

## 6. Tài nguyên

### RAM — dư

| Đo | Giá trị |
|---|---|
| Tổng | 11 929 MB |
| Dùng | khoảng 5 065 MB |
| **Available** | **6 852 MB** |
| buff/cache | 4 633 MB |
| Swap | 0 (không có) |
| PSI memory | `some avg300=0.00`, `full avg300=0.00` |

### CPU — QUÁ TẢI, VÀ ĐANG XẤU ĐI

| Mốc (giờ VM) | load 1m | load 5m | load 15m | PSI cpu `some avg10` |
|---|---|---|---|---|
| 21:16 | **37.52** | 30.25 | 22.86 | — |
| 21:19 | 28.73 | 30.79 | 24.69 | **49.50%** |
| 21:26 | **37.26** | 31.41 | 26.98 | **77.94%** |

- 8 core. Load 27–37 là **quá tải khoảng 3.5 lần**.
- `vmstat`: `r` = 42 / 33 / 34 tiến trình **runnable**; `us 45 / sy 52 / id 3`.
- PSI `some avg300` bò từ 65.77% lên 67.49%; `avg10` bò từ 49.50% lên 77.94% trong khoảng 7 phút.
  **Xu hướng đi lên.**
- PSI `full` = 0.00, nghĩa là chưa bao giờ *mọi* tác vụ cùng bị chặn. Đây là tranh chấp, chưa phải đứng hẳn.
- PSI io `some avg300` = 1.36%, memory = 0.00, nên **nghẽn là CPU, không phải I/O hay RAM**.
- `D-state = 0`, nên **không phải** sysbox wedge. Ca wedge có load phồng *trong khi* CPU vẫn idle
  46–61%; ở đây CPU idle chỉ 3–20%, ngược hẳn.

Top CPU (`top -bn2`, lấy mẫu thứ hai): `kubelet` **105.7%**, `kube-apiserver` 50.0%, `containerd` 47.5%,
`promtail` 27.9%, `etcd` 26.2%, `kube-controller` 20.5%, `prometheus` 17.2%, `calico-node` 16.4%,
`loki` 9.8%, `grafana` 9.0%.

**Người ăn CPU là chính control plane cộng stack quan sát.** `kubelet` vượt 1 core trên một node 37
pod là bất thường. **Không tiến trình sandbox nào lọt top 15.**

Delta cgroup 2 s đo trên host: `kubepods.slice` khoảng **2.46 core**, `system.slice` khoảng
**1.67 core**, `user.slice` khoảng 0.03 core.

### Sổ sách của apiserver (khác hẳn tải thật)

```
cpu      requests 2630m (32%)   limits 8650m (108%)
memory   requests 2600Mi (21%)  limits 8880Mi (75%)
```

Requests mới chiếm 32% CPU allocatable, nên **scheduler sẽ vui vẻ nhận thêm pod của lượt deploy** —
sổ sách không biết gì về load 37. Đây chính là chỗ hai con số nói hai chuyện khác nhau.

### Đủ để chạy migration hook cộng rollout ba deployment cùng lúc không?

**Đủ về chỗ, rủi ro về thời gian.**

- Chỗ: requests thêm của ba deployment nằm gọn trong 68% CPU và 79% RAM allocatable còn lại.
- Thời gian: `12-helm-deploy.sh` chạy `helm upgrade … --wait --timeout 5m`, và migration là
  **pre-upgrade hook** (`Job/platform-migrate`) — hook này đã từng làm rev 87 `failed` đúng vì
  *"Job in progress"* khi hết giờ. Ở load 28–37, thời gian pod đạt Ready giãn ra không đoán trước được.
- Ở đúng mức tải này kubelet đã bắn `Unhealthy` cho 13 pod cùng lúc lúc khoảng 20:50. Một pod mới
  khởi động giữa một cửa sổ như thế có thể bị giết vì liveness trước khi kịp warm-up.

---

## 7. Postgres + Redis, và `promote-role.sh`

### Đang sống

| Pod | Ready | Phase | Restarts |
|---|---|---|---|
| `platform-postgres-7b8b8fd77b-x26gn` | `true` | Running | 2 (3 d 10 h trước) |
| `platform-redis-56cd8d9866-jmr65` | `true` | Running | 2 (3 d 10 h trước) |

Cả hai 3 d 21 h tuổi, tức **sống qua lượt deploy rev 90 sáng nay**, không bị cuốn theo.

### `apps/web/e2e/scripts/promote-role.sh` — ĐỦ ĐIỀU KIỆN CHẠY

Kiểm từng bước script thật sự làm, bằng lệnh **chỉ đọc**:

| # | Bước trong script | Kiểm | Kết |
|---|---|---|---|
| 1 | Tìm pod theo `-l app.kubernetes.io/component=postgres -n default` | trả đúng 1 pod, Ready | ĐẠT |
| 2 | `kubectl exec … -i -- sh -s` | chạy được, stdin heredoc tới nơi | ĐẠT |
| 3 | `psql` trong container | `/usr/local/bin/psql` | ĐẠT |
| 4 | `POSTGRES_USER`, `POSTGRES_DB` (đọc env container, không hardcode) | cả hai có giá trị | ĐẠT |
| 5 | Bảng `public.users` | tồn tại | ĐẠT |
| 6 | Cột `role` kiểu `user_role` | đúng kiểu | ĐẠT |
| 7 | Enum `user_role` | `user \| admin \| author` — khớp `case` trong script | ĐẠT |
| 8 | Quyền UPDATE | `has_table_privilege(current_user,'public.users','UPDATE') = true` | ĐẠT |
| 9 | Dạng output CTE `WITH … SELECT` | lượt SELECT trả **đúng dòng dữ liệu**, không kèm thẻ lệnh, nên cổng "phải khớp đúng 1 dòng" đọc đúng | ĐẠT |
| 10 | Dòng CRLF và bit thực thi | LF thuần (0 ký tự CR); `test -x` = yes | ĐẠT |

**KHÔNG chạy `UPDATE` thật** — đó là thay đổi DB, ngoài phạm vi lượt đo này. Bước 8 và 9 là thứ gần
nhất với việc chứng minh nó sẽ chạy mà không đụng dữ liệu.

Trạng thái vai trò hiện tại (242 user):

| role | số lượng |
|---|---|
| user | 240 |
| **admin** | **1** — `e2e-probe-1788699439@dlp.local` |
| **author** | **1** — `k6-load-1-1788498502425264249@dlp.local` |

### Điều kiện tiên quyết duy nhất còn hở: tài khoản phải TỒN TẠI trước

Script cố ý đỏ khi `UPDATE` khớp 0 dòng ("Tài khoản chưa tồn tại? Đăng ký nó trước rồi chạy lại") —
và đó là thiết kế đúng, vì một lượt promote không-làm-gì trong im lặng để lại DB `user`,
`account.json` `user`, năm màn quản trị **skip**, và suite **XANH**. Thứ tự bắt buộc cho đợt 3:

1. Đăng ký tài khoản `E2E_EMAIL` nếu chưa có. Hai tài khoản admin/author sẵn có là rác của các lượt
   cũ với timestamp ngẫu nhiên — dùng lại được nhưng phải biết mật khẩu của chúng.
2. `bash apps/web/e2e/scripts/promote-role.sh <email> admin` (và `author`).
3. `E2E_REQUIRE_ROLES=1 … pnpm --filter web e2e`.

Bước 3 không được quên cờ: thiếu `E2E_REQUIRE_ROLES=1`, một lượt mà cả năm màn quản trị đều SKIP
trông y hệt một lượt chúng PASS. Và promote phải xong **trước** khi suite khởi động, vì `global-setup`
đọc vai trò **một lần** rồi ghi `account.json`.

**Kết: script không chặn e2e.** Thứ chặn, nếu có, sẽ là bước 1 — tài khoản chưa đăng ký — chứ không
phải bất kỳ mắt xích nào bên trong script.

---

## 8. Ba pod sandbox sống 4 h+ — CHÚNG LÀ WARM POOL, KHÔNG PHẢI RÁC

| Pod | Tuổi | Phase | Labels |
|---|---|---|---|
| `sandbox-027f47007785` | 4.56 h | Running | `app=sandbox`, `managed-by=dlp-orchestrator` |
| `sandbox-3e3800fc7a77` | 4.51 h | Running | như trên |
| `sandbox-8c1ddac7fce0` | 4.42 h | Running | như trên |

### Bằng chứng: sổ sách Redis chỉ có 4 khoá, và không khoá nào là session

```
pod:sandbox-027f47007785
pod:sandbox-3e3800fc7a77
pod:sandbox-8c1ddac7fce0
pool:free            (kieu list)
```

`DBSIZE = 4`. Quét mẫu: `session:*` → **0**, `sandbox:*` → 0, `user:*` → 0, `pool:*` → 1
(**không có `pool:claimed`**).

`POOL_TARGET = 3`, và có **đúng 3** pod, cả ba nằm trong `pool:free`, **không phiên nào** trỏ tới chúng.

Suy ra: **đây là warm pool ở đúng mức cấu hình, đang chờ người dùng đầu tiên.** Chúng không phải phiên
rò rỉ. Đối chiếu ca rò rỉ thật (soak bị kill 2026-09-05): ca đó `pods` lên 23/28 và Redis còn **10 hash
`session:{id}` mồ côi**. Ở đây quota là **3/28 pods, requests.cpu 750m/5850m** — chưa chạm gì.

### Đường dọn đúng, và vì sao lượt này KHÔNG nên dọn

- **`kubectl delete pod` là sai** — làm lệch warm pool; orchestrator còn giữ tên trong sổ và có thể
  giao lại một tên đã chết.
- Đường đúng cho **phiên** là `lessons.endSession` của chính chủ phiên (công cụ sẵn có:
  `plans/devops-learning-platform/reports/harness/2026-09-05-p12-close/end-stale-sessions.mjs`),
  hoặc reaper hệ thống `ReapExpired`.
- **Nhưng ở đây không có phiên nào để dọn.** Reaper (`REAP_INTERVAL=60s`) reap **session hết hạn**
  theo `SESSION_TTL=1h` và `HARD_CAP=2h`; TTL đó áp cho **phiên đã claim**, không áp cho pod ấm nằm
  trong `pool:free`. Vì vậy tuổi 4.5 h **không** phải dấu hiệu TTL hỏng.
- **Dọn sẽ tự huỷ:** `poolTarget=3`, xoá xong orchestrator refill ngay, trả lại 3 pod mới, cộng thêm
  chi phí tạo pod trên một node đang quá tải. Làm tải **tệ hơn**, không đỡ hơn.

### Chúng có góp vào load 28 không? — Bằng chứng nói KHÔNG đáng kể

- Không tiến trình sandbox hay dockerd nào lọt **top 15 CPU** của host.
- Cả ba nằm trong `pool:free`, không WS nào gắn vào, không ai gõ, nên không có shell hay dockerd đang
  chạy việc bên trong.
- Requests của chúng là 750m CPU trong 2630m tổng requests, còn tải thật thì tập trung ở kubelet,
  apiserver, containerd, promtail, etcd.

> **Không đo được — ghi là không đo được, không ghi là "không có".** CPU **per-pod** đo bằng
> `crictl stats -o json`: lệnh trả về chuỗi không phải JSON trên host này (parser lỗi ngay ký tự đầu),
> nên tôi **không** có con số nanocore riêng cho từng pod sandbox. Căn cứ ở trên là bảng top-15 của
> host cộng sổ sách Redis, **không phải** một phép đo per-pod. Nếu cần con số đó, đọc cgroup
> `kubepods.slice/.../pod<UID>/cpu.stat` **trên host** — không đo trong pod, vì Sysbox biên tập chính
> những thứ `kubectl exec` nhìn thấy.

**Khuyến nghị (quyết định là của chủ dự án):** **để nguyên.** Nếu muốn giảm tải trước e2e thì đòn bẩy
đúng là tạm thu stack quan sát (promtail, prometheus, grafana, loki đang chiếm đáng kể) hoặc chờ load
hạ — **không phải** ba pod ấm.

---

## Phụ lục A — vị trí đo, để đọc lại số cho đúng

| Số | Đo từ đâu | Vì sao ở đó |
|---|---|---|
| load, PSI, `vmstat`, D-state, top CPU, cgroup delta | **trên host qua SSH** | Sysbox biên tập thứ `kubectl exec` nhìn thấy trong pod |
| `df`, `du`, `ctr images`, lease, config containerd | **trên host qua SSH (sudo)** | node là nguồn sự thật cho đĩa và image |
| node/pod/event/quota/helm values | `kubectl` và `helm` **từ Windows** (kubeconfig admin) | chỉ đọc apiserver; không phụ thuộc vị trí |
| lệch đồng hồ | **kẹp SSH giữa hai lần đọc đồng hồ Windows** | cần cả hai hệ quy chiếu để đo chính độ lệch |
| psql, redis-cli | `kubectl exec` vào chính pod | dữ liệu nằm trong container, không có đường nào khác |

**Không đo đường mạng ngoài** trong lượt này. Nếu đợt 3 cần: gọi từ chính VM sẽ SNAT và làm phép
"giữ IP" ra cùng một số — phải đo từ Windows hoặc từ một pod, và nói rõ đo từ đâu.

## Phụ lục B — những gì lượt này KHÔNG chứng minh

- **Chưa đo `/ide` qua Traefik.** Trần body 1 MiB và tier `ratelimit-ide` 600/1m burst 300 vẫn là
  **suy luận** (6.A/6.B/6.E đều dùng `port-forward`). Triệu chứng nếu sai: IDE trắng hoặc nạp nửa
  chừng — **không** phải một thông báo rate-limit.
- **Chưa đo `capacityHardLimit`** ở giá trị mới. `values-selfhost.yaml` khai `'23'` (trần lab đã đo ở
  P12); chart mặc định `'8'` là cloud-shaped chưa đo. Lượt này chỉ xác nhận **giá trị nào sẽ được áp**,
  không xác nhận nó đúng trên phần cứng hôm nay.
- **Chưa chạy migration hook.** Rev 87 từng `failed` vì hook hết giờ; lượt này không thử lại.
- **Chưa xác nhận `GATEWAY_METRICS_URL` thật sự với tới.** Đã xác nhận `exposeAdminPort` sẽ phân giải
  thành *bật* (`auto` + netpol `true`), nhưng chưa chạy lệnh một-dòng-ba-nhánh từ trong pod web.
- **CPU per-pod của ba pod sandbox** — xem ghi chú "không đo được" ở §8.
- **Nguyên nhân gốc của load 28–37 chưa truy tới cùng.** Đã loại được: sysbox wedge (D-state 0),
  nghẽn I/O (PSI io 1.36%), nghẽn RAM (PSI mem 0), pod sandbox (không lọt top CPU). Còn lại là
  kubelet/containerd/apiserver churn — chưa xác định vì sao.

## Phụ lục C — ghi chú về git (đính chính brief)

Brief nói `reports/` bị `.gitignore` chặn ở dòng 72. **Đo lại thì không phải:**
`git check-ignore -v reports/harness/2026-09-06-p13-review/cluster-readiness.md` trả **exit 1**
(không khớp luật nào), và bốn report của các lane khác trong cùng thư mục hiện là `??` — **untracked,
không phải ignored**. `.gitignore` chỉ chặn hai đường con dưới
`plans/devops-learning-platform/reports/harness/*/` (dòng 66 `distort/`, dòng 71 `.barrier-*/`).

Theo chỉ đạo: **không `git add`, không `git commit`, không `git add -f`**. Ghi lại lý do thật để lần
sau khỏi chẩn đoán lại: file untracked ở đây là **quy ước của các lane**, không phải luật của
`.gitignore`. File trên đĩa là deliverable.
