# P7-bis + P9 — đóng năm món nợ, báo cáo kiểm chứng

**Ngày:** 2026-09-04 · **Nhánh:** `feat/p9-authoring` · **Cụm:** `debian-sandbox` (8 vCPU, 11.6 GiB, k8s v1.34.10, Sysbox) · **Helm rev:** 85

Năm món nợ được giao, tất cả **đo trên cụm thật**. Chỗ nào chưa đo được ghi thẳng ở §7.

| # | món | trạng thái |
|---|---|---|
| 1 | Chưa chạy thử phiên K8s đồng thời — trần suy từ quota | **đóng** — đo được **4**, kèm đối chứng dương |
| 2 | Đỉnh 589 MiB chỉ với một Deployment nginx | **đóng** — lab thật **777.81 MiB**, và nó **lật** profile cũ |
| 3 | `multi-node` chưa hỗ trợ | **đóng** — mở, đo được, cách ly kiểm lại |
| 4 | `ckad-configmap-as-files` vẫn cảnh báo `multi-node` | **đóng** — `unsupportedCapabilities: []` |
| 5 | P9: `publish` chạy thử thật trong sandbox | **đóng** — và nó tìm ra một bug P0 |

---

## 1. Món 2 — đo dưới tải thật, và 768Mi hoá ra đã sai

Tải: `dlp-k8s-broken-deploy` (5 Deployment + Service + ConfigMap), gieo hỏng rồi áp lời giải tới khi cả 5 lên `1/1`. Đo trên **đường sản xuất** (`DLP_K8S=1`, entrypoint tự dựng cluster), không phải đường `docker run` tay của 7.B — con số này đi thẳng vào `sandbox.profiles`, nên nó phải đến từ đúng con đường người học đi.

| topology | rỗng tải | **+ lab thật** | đĩa | CPU-giây | tới xong |
|---|---|---|---|---|---|
| 1 node | 589 MiB | **777.81 MiB** | 998 MB | 155 | 71 s |
| 2 node | 803.34 MiB | **1094.79 MiB** | 1498 MB | 199 | 69 s |

Lượt 2 node tách được hai phần: **cluster 712.96 MiB + tải 381.83 MiB**.

**777.81 > 768.** `requests` cũ nằm *dưới* đỉnh thật của một bài **có thật trong giáo trình**. `requests` không phải trần nên không có OOM; thứ xảy ra tệ hơn: kubelet đuổi pod vượt `requests` khi node bị ép RAM — phiên chết giữa bài, ngẫu nhiên, và **chỉ khi cụm đang đông**.

`k8s` → `1Gi`; `k8s-multinode` → `1536Mi`. Biên ~31%, **cùng tỉ lệ** mà 589→768 đã dùng.

## 2. Món 1 — trần 4, đo được, kèm đối chứng dương

Phép tính trần cũ sai ở **mẫu số**, không chỉ ở con số: nó chia *cả* quota cho `requests` của K8s rồi trừ `POOL_TARGET` như thể pod warm pool cũng cỡ K8s. Chúng không — pool giữ 3 pod × 256Mi (đọc từ `kubectl get resourcequota`: 768Mi · 750m · 3Gi · 6 cpu · 3 pod).

```
requestsMemory  (5500 − 768)Mi   ÷ 1024Mi = 4.62 → 4   ← CHẶN
requestsCpu     (5400 − 750)m    ÷  500m  = 9
limitsCpu       (44 − 6)         ÷    4   = 9
limitsMemory    (22528 − 3072)Mi ÷ 2048Mi = 9
pods            (26 − 3)                  = 23
```

Chạy thật (`infra/k6/ceiling.js`, `SCENARIO_ID=dlp-k8s-basics` → đi qua `lessons.startSession`, tức profile tới từ **nội dung** chứ không từ phép đo):

```
##CEILING## giữ 4 session (id phân biệt = 4), lượt từ chối đầu tiên = #5 (refused_quota)
##CEILING## đã dọn 4/4 session
```

Quan sát trực tiếp lúc đỉnh: `requests.memory` dùng **4864Mi** = 768 (pool) + 4×1024.

**Bốn ô chống-xanh-giả đều qua** (k6 exit 0): `refused_other == 0`, `refused_5xx == 0`, `quota_reported_as_5xx == 0`, `conn_errors == 0`. Thiếu chúng thì một lượt chạy mà mọi claim chết ở tầng auth cũng "có lượt bị từ chối". Và `sessions_distinct = 4` loại trừ replay idempotent — N lượt 2xx trên MỘT pod cũng đọc ra "N phiên".

**4 phiên, thấp hơn 20 phiên thường đúng 16.** 6 → 4 không phải hạ trần: trần cũ chưa bao giờ đúng.

## 3. Món 3 — multi-node, đo rồi mở

`phase-7.md` ghi sẵn điều kiện *"multi-node vẫn chưa — **trừ khi đo được**"*. Đã đo.

Cụm con 2 node: một `k3s server` + một `k3s agent`, mỗi node một container Docker trong **cùng** pod Sysbox, nối bằng mạng docker `dlp-k3s-net`. Ba chỗ phải sửa, mỗi chỗ một cái bẫy riêng:

1. **`k3s agent` cũng chạy một kubelet** → đâm vào *đúng* ràng buộc cgroup v2 "no internal process" đã giết lượt chạy đầu ở 7.B. Phần sơ tán cgroup chạy cho **cả hai** vai trò.
2. **containerd của agent là instance riêng** → thiếu `registries.yaml` ở đó thì triệu chứng là *"pod nào rơi vào node 2 thì ImagePullBackOff"*: một lỗi **ngắt quãng theo lịch**.
3. **Bridge mặc định không phân giải tên container** → agent không tìm được `dlp-k3s`. Mạng do ta định nghĩa chỉ có mặt ở nhánh ≥2 node; **đường 1 node giữ nguyên xi**, để đỉnh và trần đã công bố vẫn là số đo trên đúng cấu hình đang chạy.

`dlp-k8s-wait` chờ **đủ** `DLP_K8S_NODES`, không phải node đầu tiên — phép kiểm cũ `grep -qw Ready` dừng ngay khi server Ready, nên mọi bài dạy `nodeSelector`/taint/DaemonSet sẽ trượt ngắt quãng, và thứ đó đọc ra thành *"học viên làm sai"*.

**Chạy thật, qua đúng đường người học** (`lessons.startSession` cho `ckad-configmap-as-files`):

```
unsupported=[]
requests 500m/1536Mi · limits 4/3Gi        ← profile k8s-multinode
DLP_K8S=1  DLP_K8S_NODES=2
Cluster con da san sang sau 61s (2/2 node Ready)
```

`limitRange.maxMemory` 2Gi → 3Gi, vì LimitRange **từ chối** pod vượt `max` chứ không cắt bớt — đúng cái bẫy đã dính với `maxCpu` ở 7.C.

## 4. Món 4 — cảnh báo biến mất vì năng lực được hỗ trợ THẬT

`unsupportedCapabilities: []` cho `ckad-configmap-as-files`, đo trên cụm.

**Nhưng chẩn đoán gốc đúng và phải ghi lại:** nhãn `multi-node` của bài đó tới **hoàn toàn** từ `backend.imageid: kubernetes-kubeadm-2nodes` — thứ backend upstream *cung cấp*. `verify.sh` của bài dùng đúng **một pod và một ConfigMap**, không chạm `node`/`nodeSelector`/taint/DaemonSet ở dòng nào. Nó **không cần** 2 node.

Vẫn mở, vì hai lý do đứng độc lập với bài đó: nội dung CKA/CKAD nhập về sau (drain, taint, `nodeSelector`, DaemonSet) cần 2 node thật; và điều kiện "trừ khi đo được" nay đã thoả. Đường thu lại chỗ sau này là cho nội dung khai thứ nó **thật sự đòi**, tách khỏi thứ image cung cấp — **chưa làm**, vì đó là một field schema mới cho đúng một bài.

## 5. Món 5 — và nó tìm ra một bug P0

Ô AC duy nhất P9 còn nợ bằng chứng, chạy lần đầu:

```
VE A — verify PASS:  A -> published            (lượt chạy thử thật ĐÃ chạy và ĐẠT)
VE B — verify FAIL:  B -> về lại draft
                     publishError: steps[0].verifyScript trượt (exit 7)
Tổng: 8 đạt, 0 trượt
```

**Lượt chạy đầu tiên tìm ra:**

```
ERROR: COALESCE types timestamp with time zone and text cannot be matched
```

`publishedAt: sql\`coalesce(..., ${now})\`` bind một `Date` **thô**: bên trong một `sql` template, Drizzle không đưa giá trị qua mapper của cột (khác hẳn `updatedAt: now` ngay dưới nó). Date ra đường dây dưới dạng text.

**Hậu quả: đường THÀNH CÔNG của publish chưa bao giờ chạy được.** Lượt chạy thử ĐẠT → update ném → bài kẹt **vĩnh viễn** ở `publishing`. Hai chỗ dính, không phải một.

Điều làm nó sống sót qua cả chặng: **đường THẤT BẠI chạy tốt** (nó không có `coalesce`). Nên hệ thống *trông* như hoạt động — bài sai bị từ chối đúng, kèm đúng tên bước và mã thoát; chỉ bài **đúng** là không bao giờ lên được. Một lỗi chỉ nằm ở nhánh thành công thì mọi phép thử vế trượt đều xác nhận nhầm.

Cổng: `publish-timestamp.integration.test.ts`, chạm Postgres **thật**. Đã bẻ gãy để kiểm — bỏ bản sửa thì nó đỏ đúng thông điệp trên.

⚠ **Một lượt xanh-giả của chính tôi, ghi lại vì nó là bài học:** bản đầu của bộ test chỉ set ba cột và **xanh kể cả với mã lỗi**. Lỗi chỉ nổ khi câu lệnh mang kèm hai tham số `NULL` (`publish_started_at`, `publish_error`) đúng như production — có chúng thì Postgres suy kiểu cho `$4` theo đường khác. Trước khi mở rộng bộ test cho khớp production, tôi đã "xác nhận" chẩn đoán bằng một phép thử psql tự giả định kết luận (bind tường minh `text` rồi thấy nó lỗi) — đó là lập luận vòng, và nó suýt cho ra một bản sửa không ai chứng minh được.

## 6. Cách ly không tụt — cả hai topology

| bộ | 1 node (image mới) | 2 node |
|---|---|---|
| `netpol-verify.sh` | **22/22, lệch 0** | **22/22, lệch 0** |
| `p7-escape-verify.sh` | — | **13/13, lệch 0** |

Lượt 2 node gồm **4 đối chứng dương** (exec sống, DNS sống, mirror tới được, **2/2** node Ready) và ba nhóm phép thử "phải trượt": từ pod ngoài, từ một pod của cluster con, và **từ một pod ghim trên node 2**.

Nhóm cuối là mới và không thừa: `kubectl run` **không hứa** đặt pod ở đâu, nên trên cụm 2 node nó có thể rơi vào node 1 hàng chục lần liên tiếp, và báo cáo sẽ ghi "đã kiểm bên trong cluster con" trong khi node 2 — một container riêng, trên một mạng docker riêng — chưa hề được chạm tới.

IMDS `169.254.169.254`, apiserver chủ `192.168.94.130:6443` và `10.96.0.1` đều **trượt** từ cả ba vị trí.

## 7. Chưa đóng — nói thẳng

- **Cluster con chết ngắt quãng lúc khởi động.** Đo được 1 trong 2 phiên: k3s chết ~45 s **sau** khi node đã đăng ký, với `unable to initialize network policy controller: error getting node subnet: failed to get list of links` — một cuộc đua lúc kube-router liệt kê network link. Đã giảm nhẹ bằng `--restart=on-failure:3` (không có restart policy thì một cú trượt là mất cả phiên, và `dlp-k8s-wait` đã trả về 0 từ trước nên không ai báo gì). **CHƯA xác định** lỗi này có ở image trước hay không — nó ngắt quãng, nên một lượt P7 thành công không chứng minh được là không có. **CHƯA đo** tỉ lệ tái phát sau bản vá.
- **Trần 3 của `k8s-multinode` là số suy từ quota, chưa chạy tải.** Trần 4 của `k8s` thì đã chạy.
- **Lab nặng nhất đã đo là 5 Deployment nginx.** Một bài dùng **PVC** hoặc **image vài trăm MB** vẫn chưa có số.
- **`DLP_K8S_NODES` nhận số bất kỳ, nhưng chỉ `2` có số đo** — và chỉ `2` được khai trong profile.
- **`ckad-configmap-as-files` giờ tốn 1536Mi cho một bài chỉ cần một pod.** Đó là cái giá của việc để `backend.imageid` quyết định profile; đường thu lại đã mô tả ở §4, chưa làm.
