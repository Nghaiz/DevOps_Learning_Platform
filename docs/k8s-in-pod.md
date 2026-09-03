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

| | baseline (đối chứng) | kind | k3s | vcluster |
|---|---|---|---|---|
| Dựng gì | dockerd, không cluster | `kindest/node:v1.34.0` | `rancher/k3s` trong docker | control-plane ảo trên cụm chủ |
| Tới `kubectl get nodes` = Ready | — | **354 s** (mirror LẠNH) | *(xem dưới)* | *(xem dưới)* |
| workingSet **đỉnh** | **94.89 MiB** | **922.31 MiB** | | |
| workingSet cuối | 75.32 MiB | 854.16 MiB | | |
| `memory.current` đỉnh | 143.93 MiB | 2444.76 MiB | | |
| CPU-giây | 6.39 | 439.97 | | |
| Đĩa `/var/lib/docker` | 1 MB | **3553 MB** | | |
| Cần `registry.k8s.io`? | — | **KHÔNG** (quan sát) | | |

**Phần cluster con thêm vào, so với đối chứng:** kind = 922.31 − 94.89 = **827.4 MiB** workingSet.

### Vì sao 354 s không phải con số dùng để quyết định

Lượt đo đầu tiên kéo `kindest/node` qua mirror khi mirror còn **lạnh** — mirror phải đi lấy từ `registry-1.docker.io` trước. Log của mirror: một blob 132 MB mất **87 giây**. Đó là chi phí **một lần cho cả cụm**, không phải chi phí mỗi phiên: mirror cache lại, nên phiên sau kéo từ đĩa trong cụm.

Con số dùng để quyết định cold-path-hay-pool-ấm phải là lượt đo với **mirror ấm**. Xem §"Đo lại với mirror ấm".

### Vì sao 3553 MB là con số đáng lo nhất, không phải RAM

Docker cache nằm **trong pod** và pod là ephemeral, nên **mỗi phiên kéo lại `kindest/node` từ đầu** và mỗi phiên chiếm ~3.5 GB đĩa của node. Node còn 81 GB trống. 18 phiên đồng thời × 3.5 GB = **63 GB** — vừa đủ, và không còn chỗ cho sai số.

Đây cũng đúng loại áp lực đã sinh ra bẫy `containerd-orphan-records-block-gc` trước đây. **CẤM `crictl rmi --prune`** như luật cũ.

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
