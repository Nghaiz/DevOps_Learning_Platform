# Host Sysbox — Debian 13 Trixie

Tầng sandbox (Sysbox) **bắt buộc chạy trên kernel Linux thật**. Code Next.js/Go vẫn dev bình
thường trên Windows; chỉ tầng chạy pod cần host Linux. Thư mục này là toàn bộ cách dựng host đó.

**Muốn làm ngay?** → [`VMWARE-DEBIAN-SETUP.md`](VMWARE-DEBIAN-SETUP.md) — từng bước từ tải ISO tới cổng P0.F xanh.

Hai host, **một bộ script duy nhất**, **cùng một distro**:

| Host | Dùng cho | Khi nào dựng |
|---|---|---|
| **A — VM local** (VMware, Debian 13) | Dev hằng ngày, Phase 0→2 | Ngay bây giờ |
| **B — Cloud VM** (Debian 13) | Load-test Phase 3, demo hội đồng, prod | Để sau |

---

## Quyết định kỹ thuật đã chốt

### Debian 13 Trixie, không phải Ubuntu

Tài liệu Sysbox nói *"node's OS must be Ubuntu Noble, Jammy, Focal, or Bionic"*. **Tài liệu đó
lạc hậu so với chính code của nó.** Đọc [`sysbox-deploy-k8s.sh`](https://raw.githubusercontent.com/nestybox/sysbox-pkgr/master/k8s/scripts/sysbox-deploy-k8s.sh):

```bash
function is_supported_distro() {
    if [[ "$distro" == "ubuntu-24.04" ]] || ... ||
       [[ "$distro" =~ "debian" ]] ||        # Debian NẰM TRONG allowlist
       [[ "$distro" =~ "flatcar" ]]; then
        return
    fi
    false
}
```
```bash
if ! is_supported_distro; then
    echo "Warning: ..."     # cảnh báo, KHÔNG die — distro không phải điều kiện chặn
fi
```

Ba điều kiện `die` duy nhất trong `main()` là **kernel · kiến trúc · phiên bản K8s**. Đối chiếu:

| Điều kiện thật trong code | Debian 13 Trixie | |
|---|---|:--:|
| `is_supported_distro()` khớp `debian` | khớp | ✅ |
| `is_supported_kernel()`: non-Ubuntu cần **≥ 5.5** | **6.12** | ✅ |
| `get_artifacts_dir()` → Debian dùng `bin/generic` | **cùng binary với Ubuntu** | ✅ |
| shiftfs (patch riêng kernel Ubuntu) cần khi kernel < 5.19 | 6.12 → dùng idmapped mounts | ✅ |
| `crio-installer.sh` = giải nén tarball, không apt/dpkg | distro-agnostic | ✅ |
| `is_containerd_with_userns()` cần ≥ 2.0.0, trừ 2.0.1–2.0.4 | repo Docker trixie có **2.3.3** | ✅ |

Thêm một điểm **nghiêng về Debian**: Ubuntu 24.04+ bật `apparmor_restrict_unprivileged_userns=1`
mặc định, chặn đúng thứ Sysbox sống nhờ. Debian 13 để mở. Về mặt này Debian *dễ* hơn Ubuntu.

**Đánh đổi phải biết:** Nestybox không test Debian trên K8s. Vỡ thì không có vendor đỡ, ta tự sửa.
Cách kiềm chế: [`04-verify-sysbox.sh`](04-verify-sysbox.sh) chạy ngay sau khi cài — đỏ là biết
liền, không lòi ra ở P1.

### containerd, không phải CRI-O

Cài `containerd.io` 2.3.x từ **repo Docker** (không dùng gói `containerd` 1.7.x của Debian).
Khi đó `is_containerd_with_userns()` trả true → `do_crio_install=false` → **daemonset không bao
giờ đụng tới CRI-O**. Ít bộ phận chuyển động hơn hẳn.

Công tắc dự phòng: `SYSBOX_USE_CRIO=true bash 03-sysbox-install.sh` ép quay lại CRI-O — vẫn chạy
được trên Debian vì trình cài CRI-O của Sysbox là tarball, không phải `.deb`.

### K8s ghim v1.34

Sysbox hỗ trợ **v1.32–v1.35**, và đây là điều kiện `die` **thật**. `kubectl` stable hiện tại đã là
**v1.36.x** — cài mặc định "bản mới nhất" là hỏng. `01` ghim v1.34 + `apt-mark hold`; `03` có cổng
chặn thoát ngay nếu server version lệch.

### WSL2 không dùng làm sandbox host

Sysbox v0.7.1 (28/07/2026) không có một dòng WSL nào trong changelog, và bắt buộc systemd làm
PID 1 (WSL mặc định tắt). WSL2 vẫn là chỗ dev Go/Next.js tốt — chỉ đừng ép nó chạy Sysbox.

### Image sandbox vẫn là Ubuntu

Host chạy Debian, **container học tập chạy Ubuntu** — hai thứ không liên quan. OS của image không
dính gì tới OS của host. `images/sandbox-base` giữ nền Ubuntu vì phần lớn tài liệu DevOps,
KillerCoda và bài lab đều giả định `apt` trên Ubuntu.

---

## Host A — VM local trên VMware

Hướng dẫn đầy đủ từng màn hình: **[`VMWARE-DEBIAN-SETUP.md`](VMWARE-DEBIAN-SETUP.md)**

Tóm tắt:

1. Tải [`debian-13.6.0-amd64-netinst.iso`](https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/), kiểm SHA256.
2. VMware → New VM → **Custom** → *install OS later* → Debian 13 64-bit → **8 cores · 16 GB · đĩa 120 GB trên ổ D** · NAT.
3. Cài Debian: **để trống mật khẩu root** (để có `sudo`), **bỏ tick desktop**, **tick SSH server**, phân vùng **một partition duy nhất**.
4. Chạy:
   ```powershell
   scp -r d:\NCKH\DevOps_Learning_Platform\infra\host $VMUSER@${VMIP}:~/
   ssh -t $VMUSER@$VMIP 'bash ~/host/setup-all.sh'   # -t bắt buộc: sudo cần TTY để hỏi mật khẩu
   ```
5. Xanh → **Take Snapshot** (`sysbox-proof-green`).

---

## Host B — Cloud VM

**Cấu hình tối thiểu:** Debian 13 · 4 vCPU · 8 GB RAM · 80 GB SSD · **x86_64**.

### Lấy máy ở đâu

1. **[GitHub Student Developer Pack](https://education.github.com/pack)** — xác thực email trường (`@...edu.vn`), nhận DigitalOcean **$200** + domain. Làm cái này đầu tiên.
2. **[Azure for Students](https://azure.microsoft.com/en-us/free/students)** — $100, không cần thẻ.
3. **VPS Việt Nam** — [CloudFly](https://cloudfly.vn), [AZDIGI](https://azdigi.com), Viettel IDC, FPT Cloud. ~150–400k/tháng cho 4 vCPU/8GB. **Ping thấp — chọn khi demo trước hội đồng.**
4. **[Hetzner Cloud](https://www.hetzner.com/cloud)** — rẻ nhất (~€4/tháng) nhưng server EU/US, ping từ VN ~200ms. Hợp load-test, không hợp demo.
5. **Oracle Always Free** — ⚠️ từ 15/06/2026 cắt còn **2 OCPU / 12 GB** ARM. Dưới mức khuyến nghị và là ARM64 → image phải build multi-arch. Chỉ dùng khi hết cách.

### Dựng

1. Mở [`cloud-init.yaml`](cloud-init.yaml), **thay `ssh_authorized_keys` bằng public key của bạn**.
2. Dán vào ô *User data* / *Custom data* khi tạo VM. Chọn image **Debian 13**.
3. ```bash
   scp -r infra/host/ debian@<IP>:~/
   ssh -t debian@<IP> 'bash ~/host/setup-all.sh'
   ```

`cloud-init.yaml` đã siết sẵn: SSH chỉ dùng key, `ufw` chỉ mở 22/80/443. **kube-apiserver không
mở ra internet** — vào qua tunnel: `ssh -L 6443:127.0.0.1:6443 debian@<IP>`.

---

## Các file

| File | Việc | sudo |
|---|---|---|
| [`VMWARE-DEBIAN-SETUP.md`](VMWARE-DEBIAN-SETUP.md) | **Hướng dẫn từng bước** VMware + cài Debian | — |
| [`00-preflight.sh`](00-preflight.sh) | Chặn sớm: WSL, thiếu systemd/sudo/curl, userns tắt, AppArmor chặn, kernel < 5.5, RAM/disk thiếu. **Không sửa gì** | không |
| [`01-node-prereqs.sh`](01-node-prereqs.sh) | swap, sysctl, **containerd.io 2.3.x (repo Docker)**, kubeadm **ghim v1.34** | có |
| [`02-kubeadm-init.sh`](02-kubeadm-init.sh) | `kubeadm init` + Calico + gỡ taint single-node | có |
| [`03-sysbox-install.sh`](03-sysbox-install.sh) | Label node + daemonset Sysbox + cổng chặn version | không |
| [`04-verify-sysbox.sh`](04-verify-sysbox.sh) | **Cổng P0.F** — 8 kiểm chứng bảo mật | không |
| [`setup-all.sh`](setup-all.sh) | Chạy 00→04 theo thứ tự | hỏi 1 lần |
| [`fix-containerd-handler.sh`](fix-containerd-handler.sh) | Sửa lỗi containerd không đăng ký handler `sysbox-runc` — chạy khi cần | chỉ khi `FIX=1` |
| [`fix-cluster-dns.sh`](fix-cluster-dns.sh) | Sửa CoreDNS không chuyển tiếp được ra ngoài (`server misbehaving`) — chạy khi cần | không |
| [`diagnose-pod-network.sh`](diagnose-pod-network.sh) | Định vị DNS/egress của pod hỏng ở tầng nào (CNI / kube-proxy / CoreDNS / upstream) | không |
| [`bench-sandbox-provision.sh`](bench-sandbox-provision.sh) | Đo thời gian cấp sandbox pod (Ready + lúc docker dùng được) | không |
| [`cloud-init.yaml`](cloud-init.yaml) | Bootstrap cloud VM Debian 13 | — |

Tất cả **idempotent** — chạy lại không hỏng.

### `04-verify-sysbox.sh` kiểm gì

Bằng chứng đóng cổng **P0.F**, khớp acceptance criteria ở
[phase-1.md §1.D](../../plans/devops-learning-platform/phase-1.md):

1. `runtimeClassName == sysbox-runc`
2. **`/proc/self/uid_map` — root trong pod map ra UID ≠ 0 trên host** ← quan trọng nhất
3. Không có `/var/run/docker.sock` (luật 10)
4. `capabilities.drop == [ALL]`
5. `privileged == false`
6. `seccompProfile == RuntimeDefault`
7. **`docker run hello-world` chạy được BÊN TRONG pod không-privileged** ← lý do cả dự án chọn Sysbox
8. Cloud metadata `169.254.169.254` (cảnh báo — siết đủ ở P3)

Fail bất kỳ mục nào → exit 1, **không được mở P1**. Giữ pod lại để mổ xẻ: `KEEP=1 bash 04-verify-sysbox.sh`

### Tốc độ cấp sandbox — số đo thật

Đo bằng [`bench-sandbox-provision.sh`](bench-sandbox-provision.sh) trên Host A (8 vCPU / 16 GB,
image đã cache sẵn trên node — đúng kịch bản sản phẩm):

| | 1 pod | 10 pod cùng lúc |
|---|---|---|
| pod `Ready` | **4.6s** | 6.2s → **23.7s** (pod cuối) |
| `docker` dùng được bên trong | **8.3s** | 25.1s → **28.8s** (pod cuối) |
| tổng wall-clock | 10.4s | **30.8s** |

Hai điều đáng nhớ. **`Ready` chưa phải dùng được**: Kubernetes báo Ready khi container đã chạy, nhưng
systemd + dockerd bên trong còn đang boot thêm ~4 giây. Mốc học viên thật sự cảm nhận là cột thứ hai.
Và **300s trong `04-verify-sysbox.sh` là TRẦN CHỜ, không phải thời gian thật** — nó chỉ tồn tại để
script không treo vĩnh viễn khi hỏng.

Lần kéo image đầu tiên trên một node mới là ngoại lệ (image `nestybox/ubuntu-noble-systemd-docker`
khá nặng) — xảy ra đúng một lần mỗi node, nên pre-pull khi dựng node là xong.

---

## Gotchas

**Pod cần CẢ HAI, không phải một.** Thiếu `hostUsers: false` là pod vẫn `Running` nhưng userns
không bật — trông như thành công mà root trong pod vẫn là root host:

```yaml
spec:
  runtimeClassName: sysbox-runc
  hostUsers: false
```

**Đừng `apt upgrade` kubelet.** `01` đã `apt-mark hold`. Gỡ hold là apt nhảy lên v1.36 và Sysbox
chết. Muốn nâng: `K8S_VERSION=v1.35` (trần hỗ trợ), không cao hơn.

**`su -` luôn báo Authentication failure.** Không phải bạn gõ sai — `su -` hỏi mật khẩu **root**,
mà root để trống lúc cài ⇒ tài khoản bị khoá ⇒ không mật khẩu nào qua. Dùng `sudo` (hoặc `sudo -i`).
Debian minimal thiếu `curl`/`gnupg` là bình thường, `01-node-prereqs.sh` tự cài. Chi tiết:
[VMWARE-DEBIAN-SETUP.md §5.1](VMWARE-DEBIAN-SETUP.md#51-nếu-bạn-lỡ-đặt-mật-khẩu-root).

**`ssh host 'lệnh'` không có TTY ⇒ `sudo` chết.** Chạy `setup-all.sh` qua SSH phải dùng `ssh -t`.

**containerd 2.x: RuntimeClass có mà handler không có.** Pod kẹt `ContainerCreating` với
`the handler "sysbox-runc" is not known`. Trình cài Sysbox ghi section theo plugin ID đời 1.x
(`io.containerd.grpc.v1.cri`), còn `containerd config default` của 2.x sinh file schema mới dùng ID
khác. containerd **có** cảnh báo, nhưng chôn trong log của chính nó và không nổi lên tầng Kubernetes:

```
sudo containerd config dump 2>&1 | grep "Ignoring unknown key"
level=warning msg="Ignoring unknown key in TOML for plugin" key="containerd runtimes sysbox-runc" plugin=io.containerd.grpc.v1.cri
```

RuntimeClass (object k8s) và runtime handler (tầng CRI) là hai thứ khác nhau; `03` giờ kiểm cả hai.
Sửa: [`fix-containerd-handler.sh`](fix-containerd-handler.sh) — nó **suy** plugin ID từ entry `runc`
trong `containerd config dump` chứ không tra bảng version→ID, nên không lạc hậu khi containerd lên đời
(containerd 2.3.3 đã dùng `version = 4`, không còn là 3).

**POD_CIDR không được chồng lấn LAN.** Mặc định của Calico là `192.168.0.0/16` — nuốt trọn cả dải NAT
của VMware (`192.168.94.0/24`) lẫn dải router gia đình (`192.168.1.0/24`). Calico **không SNAT** gói đi
tới địa chỉ nằm trong pool của chính nó, nên pod mất đường tới gateway trong khi ra internet vẫn chạy.
Triệu chứng đánh lừa hoàn toàn: pod kéo image fail với `lookup registry-1.docker.io on 10.96.0.10:53:
server misbehaving`, trông y như lỗi DNS, mà `ping 1.1.1.1` từ pod lại 0% loss. Bộ script dùng
`10.244.0.0/16` và [`02-kubeadm-init.sh`](02-kubeadm-init.sh) có cổng chặn tự phát hiện chồng lấn
trước khi `kubeadm init`. Định vị đúng tầng hỏng: [`diagnose-pod-network.sh`](diagnose-pod-network.sh)
— ping được `1.1.1.1` mà không ping được gateway là dấu hiệu đặc trưng.

**`server misbehaving` mà POD_CIDR không chồng lấn** thì mới là lỗi CoreDNS thật: Corefile mặc định
dùng `forward . /etc/resolv.conf`, hỏng khi resolv.conf của host trỏ vào stub loopback (systemd-resolved
127.0.0.53) — bên trong container CoreDNS địa chỉ đó là chính nó. Sửa:
[`fix-cluster-dns.sh`](fix-cluster-dns.sh).

**Đừng tách `/var` ra phân vùng riêng.** `/var/lib/containerd` chứa mọi image; `/var` nhỏ sẽ đầy
sau vài ngày và pod fail với `no space left on device` rất khó truy nguyên.

**Repo Docker cho trixie từng thiếu gói** ([docker/packaging#342](https://github.com/docker/packaging/issues/342)).
Hiện đã có 2.2.5 / 2.2.6 / 2.3.3. Nếu `apt` báo 404, tải `.deb` tay từ
[pool/stable/amd64](https://download.docker.com/linux/debian/dists/trixie/pool/stable/amd64/) rồi `dpkg -i`.

**Cluster hỏng, làm lại từ đầu** — chạy **trên Debian** (SSH vào rồi gõ, hoặc trong console VMware):
```bash
sudo kubeadm reset -f
sudo rm -rf /etc/cni/net.d /var/lib/cni ~/.kube
sudo systemctl reboot            # `kubeadm reset` KHÔNG dọn iptables/route cũ — reboot là cách sạch nhất
# đợi VM lên rồi:
bash ~/host/setup-all.sh
```
(Hoặc restore snapshot VMware — 10 giây, nhanh hơn nhiều.)

---

## Nguồn

- [`sysbox-deploy-k8s.sh`](https://raw.githubusercontent.com/nestybox/sysbox-pkgr/master/k8s/scripts/sysbox-deploy-k8s.sh) — **nguồn sự thật** cho `is_supported_distro()` / `is_supported_kernel()` / `is_containerd_with_userns()`
- [`crio-installer.sh`](https://raw.githubusercontent.com/nestybox/sysbox-pkgr/master/k8s/scripts/crio-installer.sh) — chứng minh đường CRI-O là tarball, distro-agnostic
- [Sysbox — Install on Kubernetes](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/install-k8s.md) — bảng version K8s (docs, lạc hậu ở phần distro)
- [Sysbox releases](https://github.com/nestybox/sysbox/releases) — mới nhất v0.7.1 (2026-07-28)
- [Debian releases](https://www.debian.org/releases/) — Trixie LTS tới 30/06/2030

*(URL kiểm HTTP 200 ngày 2026-08-07)*
