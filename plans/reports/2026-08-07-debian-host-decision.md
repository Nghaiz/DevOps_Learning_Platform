# Quyết định: Debian 13 Trixie làm node OS (thay Ubuntu)

**Ngày:** 2026-08-07 · **Loại:** brainstorm → quyết định kiến trúc · **Trạng thái:** đã duyệt, đã thực thi
**Thay thế:** quyết định "k3s + Ubuntu 24.04" cùng ngày (trước đó vài giờ)

## 1. Vấn đề

User yêu cầu Debian cho VM dev lẫn prod, không Ubuntu, nhưng giữ terminal học tập trong sandbox là Ubuntu. Câu hỏi: kế hoạch hiện tại (Sysbox trên K8s) có chịu được không?

## 2. Kết luận ban đầu — SAI

Đọc docs Sysbox, kết luận Debian bị chặn:

- [`install-k8s.md`](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/install-k8s.md) nguyên văn: *"The node's OS **must be** Ubuntu Noble, Jammy, Focal, or Bionic"*
- [`distro-compat.md`](https://github.com/nestybox/sysbox/blob/master/docs/distro-compat.md): Debian Bullseye/Buster có **K8s Install = WIP**; Bookworm/Trixie không có trong bảng
- Debian 11 Bullseye — bản Debian duy nhất từng được ghi nhận — hết LTS 31/08/2026

Đã đề xuất split-OS (Debian control-plane + Ubuntu sandbox pool, 2 VM).

## 3. User phản biện, và phản biện đúng

> *"Những gì Ubuntu làm được thì Debian đều làm được... đừng cứng nhắc quá vào tài liệu, tìm cách dùng Sysbox mà vẫn Debian OS."*

Một chi tiết trong phản biện cần đính chính: **Debian không xây trên Ubuntu — ngược lại.** Debian (1993) là thượng nguồn, Ubuntu (2004) fork từ Debian unstable/testing. Hệ quả thực tế: Ubuntu **vá thêm** vào kernel những thứ Debian không có, cụ thể là `shiftfs` — nhiều khả năng chính là gốc của dòng "must be Ubuntu".

Nhưng phản biện vẫn thắng, vì `shiftfs` chỉ cần khi **kernel < 5.19**. Debian 13 có kernel **6.12**.

## 4. Bằng chứng — đọc mã nguồn, không đọc docs

Nguồn sự thật: [`sysbox-deploy-k8s.sh`](https://raw.githubusercontent.com/nestybox/sysbox-pkgr/master/k8s/scripts/sysbox-deploy-k8s.sh) (1486 dòng) + [`crio-installer.sh`](https://raw.githubusercontent.com/nestybox/sysbox-pkgr/master/k8s/scripts/crio-installer.sh).

```bash
function is_supported_distro() {
    if [[ "$distro" == "ubuntu-24.04" ]] || ... ||
       [[ "$distro" =~ "debian" ]] ||          # ← Debian TRONG allowlist
       [[ "$distro" =~ "flatcar" ]]; then
        return
    fi
    false
}
```
```bash
# main() — 3 điều kiện die duy nhất là kernel / arch / k8s-version:
if ! is_supported_distro; then
    echo "Warning: Sysbox is not officially supported on this host's distro ($os_distro_release)".
fi                                              # ← echo, KHÔNG die
if ! is_supported_kernel; then die ... fi
if ! is_supported_arch;   then die ... fi
if ! is_supported_k8s_version; then die ... fi
```

| Mắt xích | Điều kiện thật | Debian 13 Trixie | |
|---|---|---|:--:|
| `is_supported_distro()` | allowlist chứa `debian` | khớp | ✅ |
| distro ngoài allowlist | chỉ `echo Warning` | không phải cổng chặn | ✅ |
| `is_supported_kernel()` | Ubuntu ≥5.3 · **non-Ubuntu ≥5.5** | **6.12** | ✅ |
| `get_artifacts_dir()` | Debian → `bin/generic` | **cùng binary với Ubuntu** | ✅ |
| shiftfs | chỉ cần khi kernel <5.19 | 6.12 → idmapped mounts | ✅ |
| `crio-installer.sh` | giải nén `cri-o.${arch}.tar.gz`, **không apt/dpkg**; chỉ rẽ nhánh cho Flatcar | distro-agnostic | ✅ |
| `is_containerd_with_userns()` | ≥2.0.0, loại trừ dải lỗi 2.0.1–2.0.4 | repo Docker trixie có **2.3.3** | ✅ |

**Điểm bất ngờ nghiêng về Debian:** Ubuntu 23.10+ bật `apparmor_restrict_unprivileged_userns=1` mặc định, chặn đúng thứ Sysbox sống nhờ. Debian 13 để mở. Về mặt này Debian *dễ hơn* Ubuntu.

**Docs lạc hậu so với code.** Đây là bài học vận hành: với công cụ hạ tầng, khi docs và code lệch nhau thì code thắng.

## 5. Phương án đã cân nhắc

| # | Phương án | Kết quả |
|---|---|---|
| A | Split-OS: Debian CP + Ubuntu sandbox pool, 2 VM | Bỏ — không cần thiết sau khi có bằng chứng §4 |
| B | Debian 100% + đổi Sysbox → Kata Containers | Bỏ — cần nested virt (nhiều cloud không cho), pod nặng, phải viết lại P1 |
| C | Debian 100% + tự wire Sysbox bằng tay | Bỏ — chính là đường "WIP", rủi ro cao nhất |
| **D** | **Debian 100% qua daemonset chính chủ** | **CHỌN** — hoá ra được hỗ trợ sẵn |
| E | Giữ Ubuntu | Bỏ — trái yêu cầu, và không có lợi thế kỹ thuật nào |

## 6. Quyết định

**Debian 13 Trixie · kubeadm · containerd 2.3.x · K8s ghim v1.34 · 1 VM · không CRI-O.**

- **Node OS:** Debian 13 Trixie (kernel 6.12, LTS→30/06/2030) cho **cả dev VM lẫn prod** ⇒ dev ≡ prod.
- **K8s:** kubeadm, ghim **v1.34** + `apt-mark hold`. Sysbox hỗ trợ v1.32–v1.35 và đây là `die` thật; `stable` đã là v1.36.3.
- **Runtime:** `containerd.io` 2.3.x từ repo Docker ⇒ đường userns, **CRI-O không được cài**. Dự phòng `SYSBOX_USE_CRIO=true`.
- **Không split-OS, không 2 VM.** Một VM Debian làm tất.
- **`images/sandbox-base` giữ nền Ubuntu** — host OS ≠ image OS. Lý do giữ Ubuntu: tài liệu DevOps/KillerCoda/bài lab đều giả định `apt` trên Ubuntu.

## 7. Rủi ro chấp nhận + cách kiềm chế

| Rủi ro | Kiềm chế |
|---|---|
| Nestybox không test Debian trên K8s ⇒ không vendor support | Cổng `04-verify-sysbox.sh` (8 kiểm chứng) chạy NGAY sau cài ⇒ hỏng lộ ở P0, không lòi ra ở P1 |
| Đường containerd-userns là code mới | Dự phòng `SYSBOX_USE_CRIO=true` (tarball, chạy trên Debian) |
| Repo Docker trixie từng thiếu gói ([docker/packaging#342](https://github.com/docker/packaging/issues/342)) | `01` fail rõ + chỉ đường tải `.deb` tay; đã xác minh 2.2.5/2.2.6/2.3.3 hiện có |
| Bẫy Debian: thiếu `sudo`/`curl`, desktop tick sẵn, `/var` tách riêng | `00-preflight.sh` chặn sớm + [`VMWARE-DEBIAN-SETUP.md`](../../infra/host/VMWARE-DEBIAN-SETUP.md) cảnh báo từng chỗ |

## 8. Đã thay đổi

**Script** — [`infra/host/`](../../infra/host/README.md): `00-preflight.sh` (nhận Debian, kiểm AppArmor userns + sudo/curl, gate kernel theo distro) · `01-node-prereqs.sh` (containerd.io từ repo Docker thay gói distro) · `02-kubeadm-init.sh` (POD_CIDR mặc định `10.244.0.0/16` + cổng chặn chồng lấn CIDR — xem §11) · `03-sysbox-install.sh` (thêm `SYSBOX_USE_CRIO`, in đường runtime, **kiểm cả handler CRI chứ không chỉ RuntimeClass** — xem §11) · `cloud-init.yaml` (Debian, `DEFAULT_FORWARD_POLICY=ACCEPT` cho ufw) · `README.md` · **`VMWARE-DEBIAN-SETUP.md` (mới)**.

**Script chẩn đoán/sửa (thêm 2026-08-07 khi chạy thật)** — `fix-containerd-handler.sh` (§11.1) · `fix-cluster-dns.sh` · `diagnose-pod-network.sh` (§11.2) · `bench-sandbox-provision.sh` (đo tốc độ cấp pod).

**Kế hoạch** — design §4 bảng stack + **§5b mới** · [phase-0](../devops-learning-platform/phase-0.md) §0.F + risk table (thêm dòng rủi ro Debian-untested) · [phase-1](../devops-learning-platform/phase-1.md) task 22 (chốt sandbox-base = Ubuntu) · [plan.md](../devops-learning-platform/plan.md) risk table.

## 9. Kiểm chứng

Đã verify **tĩnh** (trước khi chạy): mã nguồn trình cài đặt đọc trực tiếp · ISO `debian-13.6.0-amd64-netinst.iso` SHA256 `65273bee…4e7` đối chiếu SHA256SUMS chính thức · repo Docker trixie có containerd.io 2.2.5/2.2.6/2.3.3 · mọi URL HTTP 200 · `bash -n` sạch · line-endings LF.

**Đã verify ĐỘNG (2026-08-07, chạy thật trên VM Debian 13 / VMware):** cổng P0.F **xanh 8/8** trên `debian-sandbox` — containerd 2.3.3, K8s v1.34.10, không CRI-O. userns thật (root-in-pod → UID host ≠ 0), docker-in-docker chạy trong pod không-privileged. Ba lỗi thật lộ ra trong lần chạy đầu, đã sửa và ghi lại ở **§11**. Không phải "should work" nữa — đã chứng minh.

## 10. Bước tiếp

P0.F đã đóng (xanh). Còn lại của P0: monorepo, proto contract, Better Auth. Dựng **Host B (cloud)** theo cùng bộ script — đọc §11 trước để không dẫm lại 3 lỗi đã biết (đặc biệt POD_CIDR trên VPC 10.x và handler containerd).

## 11. Lỗi thật khi chạy + cách đã sửa (2026-08-07)

Ba lỗi này KHÔNG đoán được từ đọc mã nguồn tĩnh — chỉ lộ khi chạy trên host thật. Ghi lại để Host B và người sau không mất thời gian lại.

### 11.1 containerd 2.3.3 không đăng ký handler `sysbox-runc`

Pod kẹt `ContainerCreating`: `the handler "sysbox-runc" is not known`. **RuntimeClass** (object k8s) daemonset tạo đúng, nhưng **runtime handler** (tầng CRI) thì không: `config_containerd_for_sysbox()` ghi section theo plugin ID đời 1.x (`io.containerd.grpc.v1.cri`), còn containerd 2.3.3 dùng config `version = 4` với ID `io.containerd.cri.v1.runtime`. containerd bỏ qua section lạ (chỉ cảnh báo trong log của chính nó, không nổi lên k8s). Sysbox v0.7.0 ra trước khi containerd 2.x đổi schema. **Sửa:** `fix-containerd-handler.sh` suy plugin ID từ entry `runc` trong `containerd config dump` rồi ghi lại section đúng chỗ. `03-sysbox-install.sh` giờ kiểm `containerd config dump | grep sysbox-runc` để bắt lỗi ngay ở P0 thay vì để P0.F chết khó hiểu.

### 11.2 POD_CIDR mặc định của Calico chồng lấn dải NAT

`docker run` trong pod fail `lookup ... server misbehaving`, trông như lỗi DNS nhưng `ping 1.1.1.1` từ pod lại chạy. Gốc: POD_CIDR mặc định Calico `192.168.0.0/16` nuốt trọn dải NAT VMware `192.168.94.0/24`; Calico không SNAT gói tới địa chỉ trong pool của chính nó → pod mất đường về gateway. **Sửa:** đổi mặc định sang `10.244.0.0/16` + cổng chặn tự phát hiện chồng lấn trong `02-kubeadm-init.sh`. **Host B lưu ý:** nhiều VPC cloud dùng dải `10.x` — cổng chặn sẽ báo, chọn `172.20.0.0/16` hoặc `100.64.0.0/16`. Công cụ định vị: `diagnose-pod-network.sh` (ping được internet mà không ping được gateway = dấu hiệu đặc trưng).

### 11.3 Bẫy vận hành Debian minimal

`su -` luôn `Authentication failure` vì root để trống mật khẩu ⇒ tài khoản khoá (dùng `sudo`). `ssh host 'cmd'` không cấp TTY nên `sudo` chết (dùng `ssh -t`). Cả hai đã ghi trong [`VMWARE-DEBIAN-SETUP.md`](../../infra/host/VMWARE-DEBIAN-SETUP.md) § Bẫy Debian.

### 11.4 Tốc độ cấp pod (đo thật, không đoán)

`bench-sandbox-provision.sh` trên Host A (8 vCPU/16 GB, image đã cache): 1 pod Ready **4.6s** / docker dùng được **8.3s**; 10 pod song song xong toàn bộ trong **30.8s**. Con số 300s trong `04-verify` chỉ là TRẦN CHỜ. Cold path ~8s xác nhận **warm-pool (P1) là bắt buộc** để đạt mục tiêu claim <1s của thiết kế — không phải tô điểm.
