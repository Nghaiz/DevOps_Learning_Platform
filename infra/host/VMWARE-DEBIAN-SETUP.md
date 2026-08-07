# Dựng VM Debian 13 trên VMware — từng bước

Từ máy Windows trắng tinh đến một node Kubernetes + Sysbox chạy được. Không bỏ bước nào.

**Thời gian:** ~20 phút thao tác tay + ~25 phút script chạy.
**Kết quả:** 1 VM Debian 13 Trixie, cluster kubeadm 1 node, Sysbox hoạt động, cổng P0.F xanh.

Tám phần: [0. Kiểm tra hypervisor](#phần-0--kiểm-tra-hypervisor-của-host-làm-trước-2-phút) · [1. Tải ISO](#phần-1--tải-và-kiểm-tra-iso) · [2. Khoá SSH](#phần-2--tạo-khoá-ssh-trên-windows) · [3. Tạo VM](#phần-3--tạo-vm-trong-vmware) · [4. Cài Debian](#phần-4--cài-debian-13--từng-màn-hình) · [5. Sau boot đầu](#phần-5--sau-lần-boot-đầu-tiên) · [6. Chạy script](#phần-6--chạy-bộ-script) · [7. Snapshot + kubectl](#phần-7--snapshot--dùng-kubectl-từ-windows)

---

## Phần 0 — Kiểm tra hypervisor của host (làm trước, 2 phút)

**Bỏ qua phần này thì VM sẽ báo `Failed to start the virtual machine` ở Phần 3, không kèm lý do nào.**

Nếu máy Windows của bạn có **WSL2, Docker Desktop, hoặc Memory Integrity đang bật**, Microsoft hypervisor (VBS) đã chiếm quyền VT-x. VMware buộc chạy ở chế độ **ULM** — chạy nhờ trên Hyper-V — và chế độ đó cần feature **Windows Hypervisor Platform**. Windows không tự bật nó kèm WSL2, nên máy rơi vào trạng thái nửa vời: Hyper-V chiếm chỗ nhưng VMware không có API để dùng ghé.

```powershell
# 1. VBS có đang chạy không? (2 = đang chạy)
(Get-CimInstance -Namespace root\Microsoft\Windows\DeviceGuard -ClassName Win32_DeviceGuard).VirtualizationBasedSecurityStatus

# 2. Windows Hypervisor Platform đã bật chưa? (1 = rồi, 2 = chưa)
Get-CimInstance Win32_OptionalFeature -Filter "Name='HypervisorPlatform'" | Select Name,InstallState
```

| Kết quả | Việc cần làm |
|---|---|
| VBS = `2` và HypervisorPlatform = `1` | Xong, sang Phần 1 |
| VBS = `2` và HypervisorPlatform = `2` | **Bật feature bên dưới rồi reboot** |
| VBS = `0` | Không dùng Hyper-V — VMware chạy native, sang Phần 1 |

Bật (PowerShell **as Administrator**), rồi **reboot**:

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All -NoRestart
```

Đường GUI tương đương: `Windows Features` → tick **Windows Hypervisor Platform**. Không phải "Hyper-V", không phải "Virtual Machine Platform" — ba cái này khác nhau.

> **Đánh đổi khi chạy ULM:** VM chậm hơn native khoảng 10–30% ở workload CPU-heavy, và **mất nested virtualization**. Docker, containerd, k3s/kind/minikube (driver `docker`) đều không cần nested virt nên không ảnh hưởng gì tới dự án này. Đổi lại, WSL2 và Docker Desktop trên host giữ nguyên.
>
> Hệ quả: ở Phần 3.1 **đừng tick** *Virtualize Intel VT-x/EPT* — ULM không hỗ trợ, và nó tái tạo đúng lỗi `Failed to start the virtual machine`. Lỡ tick rồi thì gỡ dòng `vhv.enable = "TRUE"` trong file `.vmx`.

**Khi VM vẫn không khởi động được**, đừng đoán — đọc log, nó luôn ghi lý do thật ở cuối:

```powershell
Select-String -Path "D:\VMs\debian13-sandbox\vmware.log" -Pattern "ULM:|Module .* power on failed|msg\." | Select -Last 20
```

---

## Phần 1 — Tải và kiểm tra ISO

### 1.1 Tải

Bản cần tải: **`debian-13.6.0-amd64-netinst.iso`** (~700 MB) — bản `netinst` là đúng, không cần bản DVD 4 GB.

Thư mục tải: <https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/>

Hoặc tải thẳng bằng PowerShell:

```powershell
mkdir D:\VMs\iso -Force
cd D:\VMs\iso
curl.exe -L -O https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-13.6.0-amd64-netinst.iso
```

> Nếu link 404 nghĩa là Debian đã ra bản điểm mới (13.7, 13.8…). Mở thư mục ở trên, lấy đúng tên file `debian-13.x.0-amd64-netinst.iso` hiện có. `current` luôn trỏ tới bản mới nhất.

### 1.2 Kiểm tra checksum — đừng bỏ bước này

ISO tải dở hoặc bị sửa sẽ làm bạn debug nhầm hàng giờ ở tận bước cài k8s.

```powershell
# Băm file vừa tải
(Get-FileHash .\debian-13.6.0-amd64-netinst.iso -Algorithm SHA256).Hash.ToLower()

# Giá trị đúng cho 13.6.0 (đã đối chiếu SHA256SUMS chính thức ngày 2026-08-07):
# 65273beed27b2df543b68b65630ba525cfbad8df2b12035732b2dff87d6664e7
```

So sánh phải **khớp từng ký tự**. Lệch → xoá, tải lại.

Với bản khác 13.6.0, lấy giá trị đúng từ:
```powershell
curl.exe -sL https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/SHA256SUMS
```

---

## Phần 2 — Tạo khoá SSH trên Windows

Để SSH vào VM không cần gõ mật khẩu, và để dùng chung với cloud VM sau này.

```powershell
# Bỏ qua nếu đã có file C:\Users\<ban>\.ssh\id_ed25519.pub
ssh-keygen -t ed25519 -C "nckh-devops-platform"
# Enter 3 lần (đường dẫn mặc định, passphrase để trống cho tiện dev)

# Xem public key — sẽ dùng ở Phần 5
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

---

## Phần 3 — Tạo VM trong VMware

**File → New Virtual Machine → chọn `Custom (Advanced)`** (đừng chọn Typical — Custom mới cho chỉnh đủ thứ cần).

Lần lượt qua các màn hình:

| # | Màn hình | Chọn |
|---|---|---|
| 1 | Hardware compatibility | Để mặc định (Workstation 17.x) |
| 2 | Guest OS installation | **I will install the operating system later** ← quan trọng, xem ghi chú dưới |
| 3 | Guest OS | Linux → Version: **Debian 13.x 64-bit**<br>(không có thì chọn Debian 12.x 64-bit, hoặc *Other Linux 6.x kernel 64-bit*) |
| 4 | Name & Location | Name: `debian13-sandbox`<br>Location: **`D:\VMs\debian13-sandbox`** ← đặt trên ổ D |
| 5 | Processor | Number of processors: **1**<br>Cores per processor: **8** |
| 6 | Memory | **16384 MB** (16 GB) |
| 7 | Network Type | **Use network address translation (NAT)** |
| 8 | I/O Controller | **LSI Logic** (mặc định — ổn định nhất) |
| 9 | Virtual Disk Type | **NVMe** (nhanh nhất, Debian 13 hỗ trợ sẵn; không có thì chọn SCSI) |
| 10 | Select a Disk | Create a new virtual disk |
| 11 | Disk Capacity | **120 GB**<br>☐ Allocate all disk space now (**bỏ tick** — cấp phát dần cho đỡ tốn ổ)<br>☑ **Split virtual disk into multiple files** |
| 12 | Disk File | Để mặc định |
| 13 | Ready to Complete | Bấm **Customize Hardware…** trước khi Finish |

> **Vì sao chọn "install OS later" ở bước 2:** nếu trỏ thẳng vào ISO, VMware bật *Easy Install* và tự động điền cấu hình cài đặt theo ý nó — bạn mất quyền kiểm soát phân vùng và tasksel, đúng hai chỗ ta cần chỉnh. Ta sẽ gắn ISO thủ công ngay sau đây.

### 3.1 Customize Hardware

| Mục | Chỉnh |
|---|---|
| **New CD/DVD (SATA)** | Chọn **Use ISO image file** → trỏ tới `D:\VMs\iso\debian-13.6.0-amd64-netinst.iso`<br>☑ Connect at power on |
| **Processors** | ☐ **ĐỪNG tick** *Virtualize Intel VT-x/EPT or AMD-V/RVI* nếu host chạy ULM (xem [Phần 0](#phần-0--kiểm-tra-hypervisor-của-host-làm-trước-2-phút))<br>*Chỉ tick khi VBS = `0`. Sysbox không cần nested virt; tick nhầm khi đang ở ULM sẽ làm VM không khởi động được.* |
| **Printer** | **Remove** |
| **Sound Card** | **Remove** |

Close → **Finish**.

### 3.2 Bật máy

Chọn VM → **Power on this virtual machine**.

> Máy bạn đang chạy WSL2 + Docker Desktop nên Hyper-V/VBS của Windows đang bật. VMware sẽ chạy qua Windows Hypervisor Platform, chậm hơn native chừng 10–15%. Với Ryzen 9 7945HX thì không đáng kể. **Đừng tắt WSL2 để lấy tốc độ** — bạn cần WSL2 để dev Go/Next.js.

---

## Phần 4 — Cài Debian 13, từng màn hình

Menu boot hiện ra → chọn **Install** (dòng text-mode, không phải *Graphical install* — nhanh và nhẹ hơn; hai cái hỏi giống hệt nhau).

Điều hướng: `Tab`/mũi tên di chuyển, `Space` tick/bỏ tick, `Enter` xác nhận.

| # | Màn hình | Nhập / chọn |
|---|---|---|
| 1 | Select a language | **English** ← nên chọn English, thông báo lỗi dễ tra Google hơn |
| 2 | Select your location | Other → Asia → **Vietnam** |
| 3 | Configure locales | **en_US.UTF-8** |
| 4 | Configure the keyboard | **American English** |
| 5 | *(tự dò mạng qua DHCP)* | — |
| 6 | Hostname | `debian-sandbox` |
| 7 | Domain name | **để trống** → Continue |
| 8 | **Root password** | ⚠️ **ĐỂ TRỐNG, bấm Continue hai lần** ← đọc ghi chú bên dưới |
| 9 | Full name for the new user | tên bạn |
| 10 | Username for your account | `nghaiz` (nhớ tên này, dùng để SSH) |
| 11 | Choose a password | đặt mật khẩu, nhập lại |
| 12 | Configure the clock | **Asia/Ho_Chi_Minh** |

> ### ⚠️ Bẫy Debian số 1 — mật khẩu root
>
> **Đây là chỗ khác Ubuntu quan trọng nhất, và là lỗi hay gặp nhất khi lần đầu cài Debian.**
>
> - **Để TRỐNG mật khẩu root** → trình cài đặt **khoá tài khoản root và tự cấu hình `sudo`** cho user đầu tiên. Giống hệt Ubuntu. **Chọn cái này.**
> - **Đặt mật khẩu root** → root hoạt động, nhưng **`sudo` KHÔNG được cài và user của bạn KHÔNG nằm trong nhóm `sudo`**. Mọi script trong `infra/host/` sẽ chết ngay dòng đầu.
>
> Lỡ đặt mật khẩu root rồi thì không phải cài lại — xem [cách sửa ở Phần 5.1](#51-nếu-bạn-lỡ-đặt-mật-khẩu-root).

### 4.1 Phân vùng đĩa

| # | Màn hình | Chọn |
|---|---|---|
| 13 | Partitioning method | **Guided - use entire disk** |
| 14 | Select disk to partition | đĩa 120 GB duy nhất |
| 15 | Partitioning scheme | **All files in one partition (recommended for new users)** |
| 16 | Finish partitioning | **Finish partitioning and write changes to disk** |
| 17 | Write the changes? | **Yes** |

> ### ⚠️ Bẫy Debian số 2 — đừng tách `/var` riêng
>
> Đừng chọn *"Separate /home, /var and /tmp partitions"*. Trình cài đặt sẽ cấp cho `/var` một phân vùng nhỏ, mà **`/var/lib/containerd` chính là nơi mọi image container nằm**. Image `sandbox-base` cộng warm-pool sẽ làm đầy `/var` trong vài ngày, rồi pod bắt đầu fail với lỗi `no space left on device` — cực khó đoán ra nguyên nhân. Một phân vùng duy nhất là an toàn nhất cho node k8s.
>
> Trình cài đặt vẫn tự tạo một phân vùng **swap** — kệ nó, `01-node-prereqs.sh` sẽ tắt và mask đi (kubelet không chạy khi còn swap).

### 4.2 Mirror và gói

| # | Màn hình | Chọn |
|---|---|---|
| 18 | Configure the package manager — *Scan extra installation media?* | **No** |
| 19 | Configure the package manager — *mirror country* | **Vietnam** |
| 20 | Debian archive mirror | `deb.debian.org` (an toàn nhất) hoặc mirror VN cho nhanh |
| 21 | HTTP proxy | **để trống** → Continue |
| 22 | Participate in package usage survey | **No** |

> **Lưu ý bước 18 và 19 trùng tiêu đề.** Debian dùng chung tiêu đề *"Configure the package manager"* cho hai màn hình liên tiếp nhau. Màn hình đến trước hỏi *"Scan extra installation media?"* và in ra nhãn đĩa (`Debian GNU/Linux 13.6.0 _Trixie_ ... NETINST with firmware`). Chọn **No**: bạn đang cài từ netinst ~700 MB, không có đĩa bổ sung nào, và toàn bộ package sẽ tải từ mirror ở bước 19–20. Chọn `<Yes>` sẽ làm installer treo đi tìm media không tồn tại.

### 4.3 Chọn phần mềm — MÀN HÌNH QUAN TRỌNG NHẤT

| # | Màn hình | Chọn |
|---|---|---|
| 23 | Software selection | xem bảng tick bên dưới |

Dùng `Space` để tick/bỏ tick. Kết quả **phải đúng như sau**:

```
[ ] Debian desktop environment      ← BỎ TICK (mặc định ĐANG tick)
[ ]   ...GNOME                      ← BỎ TICK
[ ] web server
[ ] SSH server                      ← TICK VÀO
[*] standard system utilities       ← giữ nguyên
```

> ### ⚠️ Bẫy Debian số 3 — desktop được tick sẵn
>
> Khác Ubuntu Server, **trình cài Debian netinst tick sẵn "Debian desktop environment"**. Không bỏ tick thì bạn sẽ được cả một desktop GNOME: tải thêm ~2 GB, ăn 1.5 GB RAM chạy không, và hoàn toàn vô dụng cho một node k8s.
>
> Và **phải tick SSH server** — không có nó thì không `scp`/`ssh` từ Windows vào được, phải gõ mọi thứ trong cửa sổ console chật chội của VMware.

### 4.4 Kết thúc

| # | Màn hình | Chọn |
|---|---|---|
| 24 | Install GRUB bootloader | **Yes** |
| 25 | Device for bootloader | chọn đĩa (`/dev/nvme0n1` hoặc `/dev/sda`), **không phải** dòng "Enter device manually" |
| 26 | Installation complete | **Continue** → VM khởi động lại |

---

## Phần 5 — Sau lần boot đầu tiên

Đăng nhập trong cửa sổ VMware bằng username + mật khẩu vừa tạo.

### 5.1 Nếu bạn lỡ đặt mật khẩu root

Bỏ qua mục này nếu bạn đã để trống. Nếu lỡ đặt:

```bash
su -                        # nhập mật khẩu root
apt update && apt install -y sudo
usermod -aG sudo nghaiz     # thay bằng username của bạn
exit
exit                        # đăng xuất hẳn rồi đăng nhập lại — bắt buộc để nhóm mới có hiệu lực
```

Kiểm tra: `sudo whoami` phải in ra `root`.

> ### ⚠️ Bẫy Debian số 4 — `su -` báo "Authentication failure" dù gõ đúng mật khẩu
>
> Bạn **không** gõ sai. `su -` hỏi mật khẩu **của root**, không phải mật khẩu user của bạn. Ở Phần 4 bạn đã để trống mật khẩu root theo đúng hướng dẫn ⇒ tài khoản root bị **khoá** ⇒ không có chuỗi ký tự nào qua được. Gõ lại 10 lần vẫn thế.
>
> Đó chính là cái giá của việc để trống mật khẩu root — và cũng chính là cái bạn muốn: đổi lại, trình cài Debian thêm user của bạn vào nhóm `sudo`. Cần quyền root thì dùng **`sudo`**, không dùng `su`:
>
> ```bash
> sudo apt install -y curl gnupg     # ĐÚNG — hỏi mật khẩu user của bạn
> sudo -i                            # cần shell root tương tác thì dùng cái này, không phải 'su -'
> ```
>
> Dấu hiệu nhận biết trong 1 giây: `sudo whoami` in ra `root` ⇒ sudo chạy tốt ⇒ mọi lỗi `su:` đều vô nghĩa, bỏ qua. Riêng `apt install` mà không có `sudo` sẽ báo `Could not open lock file /var/lib/dpkg/lock-frontend (13: Permission denied)` — cùng một nguyên nhân: thiếu quyền root, không phải thiếu gói.

### 5.2 Lấy địa chỉ IP

```bash
ip -4 addr show scope global | grep inet
```

Kết quả kiểu `inet 192.168.x.y/24 brd ... scope global ens33` → **`192.168.x.y` là IP của VM**. Ghi lại.

> `ifconfig` sẽ báo *command not found* — Debian không cài `net-tools`. Dùng `ip` là chuẩn hiện đại, không cần cài thêm.

### 5.3 Cài khoá SSH từ Windows

Quay lại **PowerShell trên Windows**:

```powershell
$VMIP  = "192.168.x.y"        # IP vừa lấy
$VMUSER = "nghaiz"            # username đã tạo

# Đẩy public key sang VM (nhập mật khẩu VM một lần cuối)
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | ssh $VMUSER@$VMIP "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

# Kiểm tra — lần này KHÔNG hỏi mật khẩu nữa
ssh $VMUSER@$VMIP "hostnamectl; echo '--- kernel:'; uname -r"
```

Kỳ vọng thấy `Operating System: Debian GNU/Linux 13 (trixie)` và kernel `6.12.x`.

Từ đây trở đi làm việc hoàn toàn qua SSH — copy/paste được, cửa sổ to, không kẹt trong console VMware nữa.

### 5.4 Cho `sudo` khỏi hỏi mật khẩu (nên làm)

Cloud VM đã được [`cloud-init.yaml`](cloud-init.yaml) cấp `NOPASSWD:ALL` sẵn. Làm điều tương tự trên
VM local để **Host A và Host B hành xử giống hệt nhau** — và để chạy được script qua SSH không TTY
(CI, tự động hoá, hoặc để trợ lý chạy hộ):

```bash
echo "$USER ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/90-$USER-nopasswd >/dev/null
sudo chmod 440 /etc/sudoers.d/90-$USER-nopasswd
sudo visudo -c        # phải in "parsed OK"
```

Đây là VM lab dùng riêng cho dự án, tách biệt bằng NAT, snapshot lại được — đánh đổi này hợp lý.
**Đừng** làm vậy trên máy có dữ liệu thật. Gỡ: `sudo rm /etc/sudoers.d/90-$USER-nopasswd`.

---

## Phần 6 — Chạy bộ script

Từ **PowerShell trên Windows**:

```powershell
scp -r d:\NCKH\DevOps_Learning_Platform\infra\host $VMUSER@${VMIP}:~/
ssh -t $VMUSER@$VMIP 'bash ~/host/setup-all.sh'
```

> **`-t` là bắt buộc.** `ssh host 'lệnh'` không cấp TTY, mà `setup-all.sh` gọi `sudo` từ bước 1 — không có TTY thì sudo báo *"a terminal is required to read the password"* và cả script chết ngay. `-t` ép cấp TTY để bạn nhập được mật khẩu.

Script chạy 5 bước và **dừng ngay tại bước fail đầu tiên** kèm lý do cụ thể:

| Bước | Việc | ~Thời gian |
|---|---|---|
| `00-preflight` | Kiểm tra distro/kernel/userns/RAM/disk/công cụ. Không sửa gì | 10 giây |
| `01-node-prereqs` | swap, sysctl, **containerd.io 2.3.x từ repo Docker**, kubeadm **ghim v1.34** | 3–5 phút |
| `02-kubeadm-init` | `kubeadm init` + Calico + gỡ taint single-node | 5–8 phút |
| `03-sysbox-install` | Label node + daemonset Sysbox | 3–10 phút |
| `04-verify-sysbox` | **Cổng P0.F** — 8 kiểm chứng bảo mật | 2–3 phút |

Kết thúc bạn sẽ thấy:

```
╭─ HOST SẴN SÀNG ─────────────────────────────╮
│  Tổng thời gian: 22  phút                   │
╰─────────────────────────────────────────────╯
```

### Đọc gì trong log bước 03

Dòng quyết định đường runtime:

```
Detected containerd version 2.3.3.
Will use containerd as the container runtime for Sysbox (containerd version supports user-namespaces).
```

Thấy dòng này nghĩa là **CRI-O không bao giờ được cài** — đúng như thiết kế, ít bộ phận chuyển động nhất.

Nếu thay vào đó thấy `Will install CRI-O...` thì containerd bị cũ hơn 2.0.5 — vẫn chạy được (CRI-O của Sysbox là tarball, không phụ thuộc distro), chỉ là kubelet sẽ restart và node NotReady chừng 1 phút.

Trên Debian 13 bạn **không** thấy dòng `Warning: Sysbox is not officially supported on this host's distro` — vì `is_supported_distro()` có nhánh khớp `debian`. Nếu vẫn thấy, không sao (nó chỉ `echo`, không chặn), nhưng nên xem lại `/etc/os-release`.

---

## Phần 7 — Snapshot + dùng kubectl từ Windows

> **Quy ước "chạy ở đâu"** — cả tài liệu này dùng nhãn sau, đọc nhãn trước khi gõ:
>
> | Nhãn | Máy | Cửa sổ |
> |---|---|---|
> | 💻 **Windows** | máy chính của bạn | PowerShell |
> | 🐧 **Debian** | VM trong VMware | SSH vào VM (`ssh $VMUSER@$VMIP`), hoặc console VMware |

### 7.1 Snapshot ngay khi cổng xanh — 🖱️ VMware Workstation (giao diện)

Không phải lệnh, làm bằng chuột trong VMware:

```
VMware → VM → Snapshot → Take Snapshot…
Name: sysbox-proof-green
Description: Debian 13.6 + kubeadm v1.34 + Sysbox, 04-verify 8/8 pass
```

Snapshot **nằm luôn trong VMware trên máy bạn** — không phải gửi đi đâu cả, không phải upload cho ai.
Nó là điểm khôi phục: nghịch hỏng cluster thì `VM → Snapshot → Snapshot Manager → chọn
sysbox-proof-green → Go To` là về nguyên trạng trong ~10 giây, khỏi cài lại từ đầu. Cloud VM không
có khả năng này (snapshot cloud tính tiền và chậm hơn nhiều).

Chụp thêm snapshot mới sau mỗi cột mốc lớn; giữ 2–3 cái gần nhất, xoá cái cũ để đỡ tốn đĩa
(mỗi snapshot ăn thêm dung lượng theo phần đã thay đổi).

### 7.2 kubectl từ Windows — 💻 Windows (PowerShell)

Mục đích: gõ `kubectl` thẳng trên Windows, khỏi phải `ssh` vào VM mỗi lần. **Toàn bộ khối này chạy
trong PowerShell trên Windows**, không phải trên Debian.

```powershell
# 1. Cài kubectl (bỏ qua nếu đã có — kiểm bằng: kubectl version --client)
winget install -e --id Kubernetes.kubectl

# 2. Đặt lại biến nếu bạn mở cửa sổ PowerShell mới
$VMIP   = "192.168.94.130"
$VMUSER = "nghaiz"

# 3. Tạo thư mục đích rồi copy kubeconfig từ VM về
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.kube" | Out-Null
scp ${VMUSER}@${VMIP}:~/.kube/config $env:USERPROFILE\.kube\config-sandbox

# 4. Trỏ kubectl vào file vừa lấy, rồi thử
$env:KUBECONFIG = "$env:USERPROFILE\.kube\config-sandbox"
kubectl get nodes
kubectl get runtimeclass
```

Kỳ vọng thấy `debian-sandbox   Ready   control-plane` và `sysbox-runc`.

**Không cần sửa gì trong file kubeconfig.** `kubeadm` đã ghi sẵn `server: https://192.168.94.130:6443`
(IP thật của VM, không phải `127.0.0.1`), và IP đó nằm trong SAN của chứng chỉ API server — nên TLS
xác thực bình thường, không cần `--insecure-skip-tls-verify`. Kiểm chứng trên 🐧 Debian nếu muốn:

```bash
sudo openssl x509 -in /etc/kubernetes/pki/apiserver.crt -noout -text | grep -A2 "Alternative Name"
```

> **`$env:KUBECONFIG` chỉ sống trong cửa sổ PowerShell hiện tại.** Mở cửa sổ mới là mất. Muốn cố định:
> `[Environment]::SetEnvironmentVariable("KUBECONFIG", "$env:USERPROFILE\.kube\config-sandbox", "User")`
> rồi mở lại PowerShell.
>
> **IP VM đổi sau khi DHCP cấp lại lease** thì kubeconfig trỏ sai. Lấy IP mới trên 🐧 Debian bằng
> `ip -4 addr show scope global | grep inet`, rồi chạy lại bước 3.

---

## Bẫy Debian ≠ Ubuntu — tổng hợp

| Chỗ | Ubuntu | Debian | Xử lý |
|---|---|---|---|
| `sudo` | luôn có | **không cài nếu đặt mật khẩu root** | Để trống mật khẩu root khi cài. `00-preflight.sh` kiểm và báo |
| Desktop lúc cài | Server ISO không có | **tick sẵn trong netinst** | Bỏ tick ở màn hình Software selection |
| `curl`, `gnupg` | có sẵn | **không** | `01-node-prereqs.sh` tự cài |
| `ifconfig` | không có | không có | Dùng `ip -4 addr` |
| shiftfs (kernel patch) | có | **không bao giờ có** | Không cần — kernel 6.12 ≥ 5.19 nên dùng idmapped mounts |
| AppArmor chặn userns | **24.04+ bật mặc định** | không bật | Điểm Debian *thuận lợi hơn* cho Sysbox |
| Kernel gate của Sysbox | ≥ 5.3 | **≥ 5.5** | Trixie có 6.12, dư xa |
| Vòng đời | 24.04 → 04/2029 | **13 → 30/06/2030** | Debian dài hơn |

## Khi hỏng

Ba cách, xếp từ nhanh tới chậm. **Thử cách 1 trước** — nó gần như luôn là lựa chọn đúng.

### Cách 1 — Restore snapshot · 🖱️ VMware Workstation (giao diện)

~10 giây, không gõ lệnh nào:

```
VMware → VM → Snapshot → Snapshot Manager → chọn sysbox-proof-green → Go To
```

VM quay về đúng trạng thái lúc cổng P0.F xanh. Mọi thứ bạn nghịch hỏng sau đó biến mất — kể cả file
bạn tạo trong VM, nên copy thứ cần giữ ra ngoài trước.

### Cách 2 — Dựng lại cluster, giữ nguyên OS · 🐧 Debian

Dùng khi bạn muốn giữ những gì đã cài trong VM mà chỉ đập cluster. SSH vào VM rồi gõ:

```bash
sudo kubeadm reset -f
sudo rm -rf /etc/cni/net.d /var/lib/cni ~/.kube
sudo systemctl reboot
```

`kubeadm reset` **không** dọn iptables và route do CNI để lại — reboot là cách sạch và rẻ nhất, khỏi
gỡ tay. Đợi VM lên (~30 giây), SSH lại rồi:

```bash
bash ~/host/setup-all.sh
```

### Cách 3 — Chẩn đoán thay vì đập đi làm lại · 🐧 Debian

Ba script chuyên dụng, **mặc định chỉ đọc, không sửa gì**, in ra bằng chứng để biết hỏng ở tầng nào:

```bash
bash ~/host/fix-containerd-handler.sh   # pod kẹt: handler "sysbox-runc" is not known
bash ~/host/diagnose-pod-network.sh     # pod không kéo được image / không phân giải tên miền
bash ~/host/fix-cluster-dns.sh          # CoreDNS không chuyển tiếp được ra ngoài
```

Hai script `fix-*` chỉ ra tay khi thêm `FIX=1`, và chúng backup trước khi đổi. Bảng triệu chứng →
nguyên nhân đầy đủ nằm ở [README.md § Gotchas](README.md#gotchas).

Cổng P0.F đỏ thì giữ pod lại để mổ xẻ thay vì để script xoá:

```bash
KEEP=1 bash ~/host/04-verify-sysbox.sh
kubectl -n sysbox-proof exec -it sysbox-proof -- bash

# Xem daemonset Sysbox nói gì
kubectl logs -n kube-system ds/sysbox-deploy-k8s --tail=100

# kubelet không lên
journalctl -u kubelet -n 80 --no-pager
```

Nhanh nhất vẫn là **restore snapshot `sysbox-proof-green`**.

## Nguồn

- [Debian 13 Trixie — trang release](https://www.debian.org/releases/) · LTS tới 30/06/2030
- [ISO netinst + SHA256SUMS](https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/) · [cách kiểm checksum](https://www.debian.org/CD/verify)
- [Repo Docker cho Debian trixie](https://download.docker.com/linux/debian/dists/trixie/pool/stable/amd64/) · containerd.io 2.3.3
- [`sysbox-deploy-k8s.sh`](https://raw.githubusercontent.com/nestybox/sysbox-pkgr/master/k8s/scripts/sysbox-deploy-k8s.sh) — nguồn sự thật cho `is_supported_distro()` / `is_supported_kernel()`

*(Tất cả link kiểm HTTP 200 ngày 2026-08-07)*
