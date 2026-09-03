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
- **k3s**: `/etc/rancher/k3s/registries.yaml` (xem `infra/host/p7-k3s-boot.sh`).
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

## Trần đồng thời của bài K8s

Profile `k8s` (`infra/helm/platform/values.yaml` → `sandbox.profiles.k8s`): requests `500m`/`768Mi`, limits `4`/`2Gi`. `768Mi` đặt theo **đỉnh đo được** (589 MiB) cộng ~30% biên — không theo trung vị (bài học `sandbox-quota-is-misconfigured-not-hardware`: đặt theo trung vị là thiết kế cho một nửa số lượt).

Min của năm ràng buộc, trên quota self-host:

```
requestsCpu     5400m  ÷  500m   = 10
requestsMemory  5500Mi ÷  768Mi  =  7   ← RÀNG BUỘC CHẶN
limitsCpu          44  ÷    4    = 11
limitsMemory   22528Mi ÷ 2048Mi  = 11
pods               26             = 26
⇒ min = 7 pod − POOL_TARGET 1 = 6 phiên K8s đồng thời
```

**6 phiên — thấp hơn 20 phiên thường đúng 14.** Nói thẳng con số đó, thay vì trung bình hoá nó vào một `requests` chung, là toàn bộ điểm của mục này: một bài K8s tốn gấp ba một bài Linux, và giấu điều đó sẽ làm người thứ bảy nhận 429 mà không hiểu vì sao.

⚠ Quota là **chung** cho namespace, nên "6" chỉ đúng khi mọi phiên đều là K8s. Ràng buộc thật là tuyến tính:

```
256Mi·n_thường + 768Mi·n_k8s ≤ 5500Mi     (và bốn bất đẳng thức còn lại)
```

Ví dụ: 10 phiên thường + 3 phiên K8s = 2560 + 2304 = 4864Mi ⇒ vừa.

## Chưa đo — nói thẳng

- Đỉnh 589 MiB là với cluster con vừa lên **cộng một Deployment nginx**. Lab nặng hơn (nhiều Deployment, PVC, image lớn) **chưa có số**. `limits` 2Gi mới là thứ thật sự gác; `requests` chỉ là chỗ giữ khi xếp lịch.
- **Chưa chạy thử 6 phiên K8s đồng thời.** Trần 6 là số suy từ quota, không phải số đã đo — đúng loại khoảng cách mà báo cáo tải 18-phiên trước đây phải đóng bằng một lượt chạy thật.
- `multi-node` vẫn **chưa hỗ trợ**: cluster con là một node. Không mở kèm.
