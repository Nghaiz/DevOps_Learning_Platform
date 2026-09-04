# Kubernetes trong pod — ba đường, đo rồi chọn

**Trạng thái:** P7 / 7.B–7.C · đo trên cụm lab thật (`debian-sandbox`, 8 vCPU, 11.6 GiB RAM, k8s v1.34.10, Sysbox) ngày 2026-09-04.

Tài liệu này tồn tại vì `RUNTIME_SUPPORTED_CAPABILITIES` sắp nhận thêm `'kubernetes'`, và một năng lực được mở dựa trên **ước lượng** là một lời hứa mà hạ tầng sẽ phá trong im lặng. Mọi con số dưới đây là **đo được**, không phải suy ra; chỗ nào chưa đo thì viết thẳng là chưa đo.

## Phép đo được thực hiện thế nào

Đo ở **cgroup mức pod, trên host** — không phải `kubectl exec … free -m`.

Sysbox biên tập thứ tiến trình trong pod nhìn thấy: `/proc/meminfo` bên trong pod là của **node**, không phải của cgroup. Và container lồng do dockerd bên trong tạo ra nằm **dưới** cgroup của pod trên host, nên chỉ cgroup mức pod mới cộng đủ phần cluster con. Một phép đo từ bên trong pod vừa thiếu phần lồng vừa đọc nhầm mẫu số.

Chỉ số dùng để quyết định là **workingSet = `memory.current` − `inactive_file`** — đúng số kubelet dùng để evict. `memory.current` thô gộp cả page cache của `docker pull`, thứ sẽ bốc hơi khi có áp lực; đặt `requests` theo nó là giữ chỗ cho thứ không tồn tại. (Cùng bài học đã ghi ở `values.yaml` §sandbox.)

Harness: `infra/host/p7-measure.sh` (lấy mẫu 2 s/lần). Dữ liệu thô: `plans/devops-learning-platform/reports/harness/2026-09-04-p7-k8s-in-pod/`.

### Namespace đo — và một khác biệt phải khai báo

Pod đo chạy ở namespace `dlp-p7`, được sao chép **nguyên văn cả 4 NetworkPolicy** của `dlp-sandbox` (chúng đều `podSelector: {}` và trỏ sang namespace khác bằng **nhãn**, nên đổi namespace là đủ).

⚠ **Một khác biệt so với production, khai báo thẳng:** NetworkPolicy `platform-registry-mirror-allow-ingress-sandbox` ở namespace `dlp-registry` chỉ nhận ingress từ namespace **tên là `dlp-sandbox`** (qua nhãn bất biến `kubernetes.io/metadata.name`). Nên `dlp-p7` phải được cấp thêm một NetworkPolicy tạm (`p7-measure-temp-allow-ingress`) thì mới tới được mirror. Sau khi cấp, điều kiện mạng của `dlp-p7` **tương đương** `dlp-sandbox`; trước khi cấp thì không. Netpol tạm đó phải được xoá sau khi đo xong.

## Câu hỏi `registry.k8s.io` — trả lời bằng quan sát, không bằng suy luận

Mirror trong cụm phủ **chỉ `docker.io`**. Giả thuyết trong plan là `kindest/node` và `rancher/k3s` bundle sẵn image hệ thống nên không cần `registry.k8s.io`. Đó là giả thuyết; đây là quan sát.

Đối chứng trước tiên — **đường ra internet của pod sandbox thật sự đóng**:

```
curl -m5 https://github.com        → treo, timeout, http_code 000
curl -m5 https://registry.k8s.io/v2/ → treo, timeout, http_code 000
curl -m5 http://platform-registry-mirror…:5000/v2/ → 200
```

Nghĩa là nếu một đường **cần** `registry.k8s.io`, nó sẽ **treo** — và treo chính là câu trả lời.

**Kết quả cho `kind`:** cluster con lên **Ready** hoàn toàn. `crictl ps` trong node container cho thấy `etcd`, `kube-apiserver`, `kube-controller-manager`, `kube-scheduler` đều `Running`, tất cả từ image **đã nằm sẵn trong `kindest/node`**. Không có lượt kéo `registry.k8s.io` nào, và không có gì treo. ⇒ **`kind` KHÔNG cần `registry.k8s.io`.** Giả thuyết đúng — nhưng bây giờ nó là một quan sát.

⚠ Điều đó **không** đúng cho image mà bài học kéo về sau. Xem §"Mirror cho containerd của cluster con" bên dưới.

## Bảng số

| | baseline (đối chứng) | **k3s — ĐƯỢC CHỌN** | kind | vcluster |
|---|---|---|---|---|
| Dựng gì | dockerd, không cluster | `rancher/k3s:v1.34.1-k3s1` trong docker | `kindest/node:v1.34.0` | control-plane ảo trên cụm chủ |
| Tới `kubectl get nodes` = Ready | — | **49 s** (mirror ấm) | 354 s (mirror **lạnh**) | xem §vcluster |
| workingSet **đỉnh** | **94.89 MiB** | **589 MiB** | **922.31 MiB** | xem §vcluster |
| workingSet cuối | 75.32 MiB | 587 MiB | 854.16 MiB | |
| `memory.current` đỉnh | 143.93 MiB | 1015 MiB | 2444.76 MiB | |
| CPU-giây | 6.39 | 252 | 439.97 | |
| Đĩa `/var/lib/docker` | 1 MB | **729 MB** | **3553 MB** | 0 (chạy trên cụm chủ) |
| Cần `registry.k8s.io`? | — | **KHÔNG** (quan sát) | **KHÔNG** (quan sát) | — |
| Chạy trong Sysbox? | — | có, **sau khi sơ tán cgroup v2** | có, không phải sửa gì | có |

**Phần cluster con thêm vào, so với đối chứng:** k3s = **494 MiB**; kind = **827 MiB**.

## Đường được chọn: k3s — và trục quyết định là ĐĨA, không phải RAM

k3s thắng cả hai trục, nhưng khoảng cách đáng kể nằm ở đĩa: **729 MB so với 3553 MB**.

Trục đó nặng hơn vẻ ngoài vì cache docker nằm **trong pod**, và pod là ephemeral — nên **mỗi phiên kéo lại image node từ đầu** và chiếm chừng đó đĩa của node. Node còn 81 GB:

- kind: 18 phiên × 3.5 GB = **63 GB** — vừa đủ, không còn chỗ cho sai số.
- k3s: 18 phiên × 0.73 GB = **13 GB** — thoải mái.

Đây đúng loại áp lực đã sinh ra bẫy `containerd-orphan-records-block-gc`. **CẤM `crictl rmi --prune`** như luật cũ.

RAM thì k3s cũng nhẹ hơn 36%; nếu chỉ có RAM thì cả hai đều dùng được.

**Chi phí của lựa chọn này:** k3s cần một bản vá mà kind không cần (§cgroup v2 lồng). Đó là chi phí **một lần**, đã trả xong, đổi lấy 2.8 GB đĩa mỗi phiên.

## Thời gian dựng — và câu trả lời cho cold-path

Lượt `kind` 354 s kéo `kindest/node` khi mirror còn **lạnh** (log mirror: một blob 132 MB mất **87 giây**). Đó là chi phí một lần cho cả cụm, không phải mỗi phiên.

Con số thật, trên image sandbox đã nướng sẵn `k3s-boot.sh`, `DLP_K8S=1`, mirror ấm:

```
$ kubectl exec p7-e2e -- dlp-k8s-wait 300
Cluster con da san sang sau 49s.       EXIT=0
$ kubectl exec p7-e2e -- kubectl get nodes
NAME           STATUS   ROLES           AGE   VERSION
2f10298f3fcb   Ready    control-plane   4s    v1.34.1+k3s1
```

**49 giây — dưới ngưỡng 60 s plan đặt ra.** Nên 7.C mục 8 có đáp án: **cold-path DÙNG ĐƯỢC, không cần pool ấm riêng.** Kết luận rẻ hơn nhiều — một pool ấm K8s giữ 589 MiB thường trực mỗi chỗ, kéo trần của mọi người xuống theo.

Và phần lớn 49 s đó người học không nhìn thấy: `start_k8s` dựng cluster **nền** ngay khi pod lên, trong lúc họ còn đọc phần dẫn nhập.

### Bài học chạy THẬT trong cluster con — đối chứng dương

Một cluster Ready chưa chứng minh bài học chạy được:

```
kubectl create deploy web --image=nginx:1.29.0   → deployment.apps/web created
kubectl create configmap html-config …           → configmap/html-config created
kubectl expose deploy web --port=80              → service/web exposed

NAME                   READY   STATUS    AGE
web-8645ff87cb-b5xql   1/1     Running   66s
```

`nginx:1.29.0` **kéo được** ⇒ `registries.yaml` (§dưới) thật sự có tác dụng, không chỉ tồn tại. Đây là phép thử phân biệt *"cluster lên"* với *"bài học chạy được"*; thiếu nó thì năng lực `kubernetes` vẫn là một lời hứa.

### CPU bị throttle lúc boot — đo được, đã xử lý

Cùng lượt đo, cgroup của pod ở trần 2 core: `nr_throttled 457 · throttled_usec 30898633` (30.9 s bị giữ). Pod thật sự muốn hơn 2 core trong pha dựng cluster.

Nên profile `k8s` khai `limitsCpu: '4'` — **miễn phí về trần** (`44 ÷ 4 = 11`, vẫn lớn hơn ràng buộc chặn là 7). Đổi lại phải nâng `limitRange.maxCpu` 2 → 4, vì LimitRange **từ chối** pod vượt `max` chứ không cắt bớt.

(Và đây là lý do không đọc "throttle = 0" như tin tốt ở nơi khác — xem `throttle-zero-hides-node-level-starvation`.)

## Mirror cho containerd của cluster con — một tầng riêng, dễ quên

`/etc/docker/daemon.json` chỉ đẩy được **dockerd** của sandbox. containerd bên trong cluster con là một runtime **khác** và không đọc file đó.

Hậu quả nếu quên: `kubectl run --image=nginx` trong cluster con đi thẳng ra `registry-1.docker.io`, đâm vào deny-all, treo tới `ImagePullBackOff`. Triệu chứng — *"pod của tôi không bao giờ Ready"* — không trỏ về NetworkPolicy ở bất cứ đâu.

Nên mỗi đường phải cấu hình mirror ở **tầng của chính nó**:
- **k3s**: `/etc/rancher/k3s/registries.yaml` (xem `images/sandbox-base/k3s-boot.sh`).
- **kind**: patch `containerd` config trong node container, hoặc `containerdConfigPatches` trong `kind` config.

## Cách ly — cluster con là một đường mạng MỚI

⛔ **Cluster con KHÔNG được dùng `--network host`.**

Host-network cho container cluster con nghĩa là nó **dùng chung network namespace với pod sandbox**. Hai hậu quả, cả hai đều đỏ:

1. **Đụng dải IP.** iptables/service CIDR của cluster con đổ thẳng vào netns của pod. kube-dns của cụm **chủ** ở `10.96.0.10` nằm gọn trong `10.96.0.0/16` mặc định của cluster con ⇒ pod mất DNS, mất luôn đường ra mirror. Và triệu chứng không trỏ về dòng cấu hình nào.
2. **Nhoè ranh giới cách ly.** NetworkPolicy vẽ quanh netns của pod. Một cluster con dùng chung netns làm cho câu hỏi *"cái này ở trong hay ngoài hàng rào"* không còn đáp án.

Đường đúng: bridge riêng cho cluster con + publish `127.0.0.1:6443` — kubeconfig vẫn trỏ `127.0.0.1` như k3s/kind tự ghi, mà chỉ thêm một luật DNAT vào netns của pod.

Kiểm chứng: `infra/k8s/p7-escape-verify.sh` — và nó có **ba đối chứng dương** trước mọi phép "phải trượt", vì một pod chết làm mọi phép thử trượt và báo cáo sẽ đọc ra là "cách ly hoàn hảo".

## cgroup v2 lồng — thứ chặn k3s

k3s trong docker trong pod Sysbox: kubelet chết ngay khi khởi động với

```
cannot enter cgroupv2 "/sys/fs/cgroup/kubepods" with domain controllers
  -- it is in an invalid state
```

Đây là ràng buộc **"no internal process"** của cgroup v2: một cgroup vừa chứa tiến trình vừa bật controller cho con là trạng thái không hợp lệ. Trong container, tiến trình k3s nằm ngay ở cgroup gốc, nên kubelet không tạo nổi `kubepods` bên dưới nó.

`kindest/node` **không** gặp lỗi này: entrypoint của nó tự sơ tán cgroup gốc. Đó là một khác biệt kỹ thuật thật giữa hai đường, không phải chuyện cấu hình.

Cách chữa cho k3s (`infra/host/p7-k3s-boot.sh`): đẩy mọi tiến trình xuống `/sys/fs/cgroup/init`, rồi bật controller ở `cgroup.subtree_control` của gốc — **từng controller một**, vì ghi cả chuỗi `"+cpuset +cpu +io +memory +pids"` một lượt bị kernel từ chối toàn bộ (`sed: write error`) khi chỉ một controller trong đó không uỷ quyền được.

## Đo lại dưới TẢI THẬT (P7-bis, 2026-09-04) — và 768Mi hoá ra đã sai

Mọi con số ở trên đo với cluster con vừa lên **cộng đúng một Deployment nginx**. Mục "Chưa đo" của bản trước tự ghi rằng đó là một khoảng trống. Đây là số lấp nó.

Tải dùng để đo là lab first-party nặng nhất trong giáo trình — `dlp-k8s-broken-deploy`: 5 Deployment + Service + ConfigMap, gieo hỏng rồi áp lời giải cho tới khi cả 5 lên `1/1`. Đo trên **đường sản xuất** (`DLP_K8S=1`, entrypoint tự dựng cluster), không phải đường `docker run` tay của 7.B: con số này đi thẳng vào `sandbox.profiles`, nên nó phải đến từ đúng con đường người học đi.

| topology | rỗng tải | **+ lab thật** | đĩa | CPU-giây | tới xong |
|---|---|---|---|---|---|
| 1 node | 589 MiB | **777.81 MiB** | 998 MB | 155 | 71 s |
| 2 node | 803.34 MiB | **1094.79 MiB** | 1498 MB | 199 | 69 s |

Lượt 2 node tách được hai phần nhờ mốc `workingSetAtReadyMiB`:

```
cluster 712.96 MiB  +  tải 381.83 MiB  =  đỉnh 1094.79 MiB
```

**777.81 MiB > 768 MiB.** Tức `requests` cũ nằm *dưới* đỉnh thật của một bài học **có thật trong giáo trình**. `requests` không phải trần nên không có OOM; thứ xảy ra tệ hơn và khó truy hơn: kubelet đuổi pod vượt `requests` khi node bị ép RAM — phiên của người học chết giữa bài, ngẫu nhiên, và **chỉ khi cụm đang đông**. Đúng loại lỗi không tái hiện được lúc ngồi gỡ.

## Trần đồng thời của bài K8s

Hai profile, vì hai topology tốn khác nhau (`infra/helm/platform/values.yaml` → `sandbox.profiles`):

| profile | requests | limits | đặt theo |
|---|---|---|---|
| `k8s` | `500m` / `1Gi` | `4` / `2Gi` | đỉnh 777.81 MiB + ~31% biên |
| `k8s-multinode` | `500m` / `1536Mi` | `4` / `3Gi` | đỉnh 1094.79 MiB + ~31% biên |

Biên ~31% là **cùng tỉ lệ** mà 589→768 đã dùng, không phải một tỉ lệ mới chọn cho vừa một mục tiêu trần. Vẫn đặt theo **đỉnh**, không theo trung vị (`sandbox-quota-is-misconfigured-not-hardware`: đặt theo trung vị là thiết kế cho một nửa số lượt).

⚠ **Phép tính trần cũ sai ở MẪU SỐ, không chỉ ở con số.** Nó chia *cả* quota cho `requests` của K8s rồi trừ đi `POOL_TARGET` như thể pod warm pool cũng cỡ K8s. Chúng không: pool giữ 3 pod × 256Mi. Phải trừ phần pool **đang giữ** ra khỏi quota trước, rồi mới chia. Số pool đọc từ cụm thật (`kubectl get resourcequota -n dlp-sandbox`): 768Mi RAM · 750m CPU · 3Gi limits.memory · 6 limits.cpu · 3 pod.

```
profile k8s (1Gi):
  requestsMemory  (5500 − 768)Mi   ÷ 1024Mi = 4.62 → 4   ← RÀNG BUỘC CHẶN
  requestsCpu     (5400 − 750)m    ÷  500m  = 9
  limitsCpu       (44 − 6)         ÷    4   = 9
  limitsMemory    (22528 − 3072)Mi ÷ 2048Mi = 9
  pods            (26 − 3)                  = 23
⇒ 4 phiên K8s đồng thời

profile k8s-multinode (1536Mi):
  requestsMemory  (5500 − 768)Mi   ÷ 1536Mi = 3.08 → 3   ← RÀNG BUỘC CHẶN
  limitsMemory    (22528 − 3072)Mi ÷ 3072Mi = 6
⇒ 3 phiên multi-node đồng thời
```

**4 phiên — thấp hơn 20 phiên thường đúng 16.** Nói thẳng con số đó, thay vì trung bình hoá nó vào một `requests` chung, là toàn bộ điểm của mục này: một bài K8s tốn gấp bốn một bài Linux, và giấu điều đó sẽ làm người thứ năm nhận 429 mà không hiểu vì sao.

6 → 4 **không phải là hạ trần**. Trần cũ chưa bao giờ đúng — nó được tính từ một `requests` thấp hơn đỉnh thật.

⚠ Quota là **chung** cho namespace, nên "4" chỉ đúng khi mọi phiên đều là K8s. Ràng buộc thật là tuyến tính:

```
256Mi·n_thường + 1024Mi·n_k8s + 1536Mi·n_multinode ≤ 5500Mi   (và bốn bất đẳng thức còn lại)
```

Ví dụ: 8 phiên thường + 3 phiên K8s = 2048 + 3072 = 5120Mi ⇒ vừa.

## multi-node — mở, và nói rõ cái giá lẫn cái nó KHÔNG mua

Cụm con hai node: một `k3s server` + một `k3s agent`, mỗi node là một container Docker riêng trong **cùng** pod Sysbox, nối bằng một mạng docker do ta tạo (`dlp-k3s-net`).

Ba chỗ phải sửa, và mỗi chỗ là một cái bẫy riêng:

1. **`k3s agent` cũng chạy một kubelet**, nên nó đâm vào *đúng* ràng buộc cgroup v2 "no internal process" đã giết lượt chạy đầu ở 7.B — không phải một biến thể nhẹ hơn. Phần sơ tán cgroup trong `k3s-boot.sh` vì thế chạy cho **cả hai** vai trò.
2. **containerd của agent là một instance riêng**, và nó kéo image cho chính các pod được lịch lên node 2. Thiếu `registries.yaml` ở đó thì triệu chứng là *"pod nào rơi vào node 2 thì ImagePullBackOff"* — một lỗi ngắt quãng theo lịch, thứ khó chẩn đoán nhất trong cả họ.
3. **Bridge mặc định của Docker không phân giải tên container**, nên agent không tìm được `dlp-k3s`. Mạng do ta định nghĩa có DNS nội bộ — đó là lý do duy nhất nó có mặt, và nó **chỉ** có mặt ở nhánh ≥2 node. Đường 1 node giữ nguyên xi, để đỉnh 589/777.81 MiB và trần 4 vẫn là số đo trên đúng cấu hình đang chạy.

`dlp-k8s-wait` chờ **đủ** số node (`DLP_K8S_NODES`), không phải node đầu tiên. Phép kiểm cũ `grep -qw Ready` dừng ngay khi server Ready, nên trên cụm 2 node mọi bài dạy `nodeSelector`/taint/DaemonSet sẽ trượt ngắt quãng — và thứ đó đọc ra thành *"học viên làm sai"* chứ không thành *"môi trường chưa sẵn sàng"*.

**Cái nó KHÔNG mua, nói thẳng:** hôm nay không bài nào trong giáo trình thật sự cần hai node. `ckad-configmap-as-files` mang nhãn `multi-node` **chỉ vì** `backend.imageid` upstream của nó là `kubernetes-kubeadm-2nodes`; `verify.sh` của bài dùng đúng một pod và một ConfigMap, không chạm node/`nodeSelector`/taint/DaemonSet ở dòng nào. Nhãn ấy mô tả thứ backend upstream **cung cấp**, không phải thứ bài học **đòi**.

Vẫn mở, vì hai lý do đứng độc lập với bài đó: nội dung CKA/CKAD nhập về sau (drain, taint, `nodeSelector`, DaemonSet) cần 2 node thật; và `phase-7.md` đã ghi sẵn điều kiện *"multi-node vẫn chưa — trừ khi đo được"*, nay đã thoả bằng bảng số ở trên. Đường thu lại chỗ sau này là cho nội dung khai thứ nó **thật sự đòi**, tách khỏi thứ image cung cấp — chưa làm hôm nay, vì đó là một field schema mới cho đúng một bài.

## Chưa đo — nói thẳng

- Lab nặng nhất **đã** đo là `dlp-k8s-broken-deploy` (5 Deployment nginx). Một bài dùng **PVC** hoặc **image vài trăm MB** vẫn chưa có số. `limits` (2Gi / 3Gi) mới là thứ thật sự gác; `requests` chỉ là chỗ giữ khi xếp lịch.
- Đỉnh 2 node đo với **hai** node. `DLP_K8S_NODES` nhận số bất kỳ, nhưng chỉ `2` có số đo — và chỉ `2` được khai trong profile.

## vcluster — đo được, và bị loại vì lý do KHÔNG phải RAM

Đã dựng thật (`helm install vc1 vcluster --repo https://charts.loft.sh -n dlp-p7-vc`, chart 0.36.1) và đo ở cùng cgroup mức pod:

```
vc1-0 (control-plane ảo)                       workingSet 419 MiB
coredns-…-x-kube-system-x-vc1 (đã đồng bộ)     workingSet  14 MiB
                                        TỔNG   433 MiB
```

**433 MiB — nhẹ nhất trong ba đường** (k3s 589, kind 922). Nếu chỉ so RAM thì vcluster thắng.

Nó vẫn bị loại, và bằng chứng nằm ngay trong tên cái pod ở trên:

```
$ kubectl get pods -n dlp-p7-vc -o custom-columns=NAME:.metadata.name,NS:.metadata.namespace,NODE:.spec.nodeName
coredns-df8c87f55-fm8bn-x-kube-system-x-vc1   dlp-p7-vc   debian-sandbox
```

Cái pod đó, về mặt logic, thuộc `kube-system` **của cluster ảo**. Về mặt vật lý nó là **một pod thật trong namespace của cụm CHỦ, trên node của cụm CHỦ**. Đó chính là kiến trúc syncer của vcluster: API là ảo, còn **workload thì không**.

Hệ quả cho nền tảng này, cụ thể chứ không trừu tượng:

1. **Mọi pod người học tạo ra là một pod thật trong cụm của ta**, ăn quota thật của `dlp-sandbox` và chịu chung LimitRange — cái trần "6 phiên" tính ở trên mất ý nghĩa vì mẫu số không còn cố định.
2. **Ranh giới cách ly là phần mềm syncer, không phải ranh giới kernel.** Với k3s-trong-Sysbox, pod của người học nằm trong một cluster lồng, trong một container user-namespaced; một lỗi thoát phải xuyên qua cả hai. Với vcluster, nó chỉ phải qua syncer.
3. **P11 (CTF trên K8s) làm điều đó tệ hơn nhiều lần.** Một bài CTF *mời* người chơi thử thoát. Đặt workload của họ trực tiếp trên cụm chủ là sai từ tiền đề.

Plan đã xếp vcluster là "KÉM NHẤT" về cô lập và yêu cầu **chứng minh không thoát sang namespace khác trước khi cân nhắc**. Phép đo trên cho thấy không cần tới bước đó: workload vốn đã ở cụm chủ theo thiết kế, nên câu hỏi "có thoát được không" đã bị đặt sai — nó không cần thoát.

**Kết luận:** vcluster rẻ nhất về RAM và đắt nhất về thứ không đánh đổi được. Đã gỡ sau khi đo (`helm uninstall vc1 -n dlp-p7-vc`).
