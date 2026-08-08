# Đổi RAM của VM `debian13-sandbox` — hạ 16 GB → 12 GB, và nâng lại

Thuận nghịch hoàn toàn. `memsize` chỉ là một dòng trong `.vmx`; kubeadm, containerd và Sysbox
không ghim RAM ở bất kỳ đâu, nên đổi số rồi boot lại là xong — **không cài lại gì**.

**Thời gian:** ~10 phút (phần lớn là chờ shutdown + gộp snapshot).
**Kết quả:** VM chạy 12 GB, cụm k8s 1 node vẫn Ready, giải phóng 4 GB RAM host + ~16 GB đĩa D:.

---

## Trạng thái xuất phát (đo 2026-08-08)

| Mục | Giá trị |
|---|---|
| File cấu hình | `D:\VMs\debian13-sandbox\debian13-sandbox.vmx` |
| `memsize` | `16384` |
| `numvcpus` | `8` |
| RAM host | ~40 GB |
| Trạng thái máy | **SUSPEND** — có `debian13-sandbox-43f789d4.vmss` + `.vmem` 16 GiB |
| Snapshot | 1 cái. Tên hiển thị **`sysbox-proof-green`**, file `debian13-sandbox-Snapshot1.*`, **kèm memory-state** (`.vmem` = 16 GiB) |

> **Tên hiển thị ≠ tên file.** Snapshot Manager hiện `sysbox-proof-green` ("Debian 13.6 + kubeadm
> v1.34 + Sysbox, 04-verify 8/8 pass"); trên đĩa VMware đặt là `Snapshot1` vì nó là snapshot số 1.
> Cùng một thứ. Tra bằng `cat D:\VMs\debian13-sandbox\*.vmsd` nếu nghi ngờ.

Hai điều trên là lý do quy trình này dài hơn "kéo thanh trượt trong Settings".

---

## Vì sao 12 GB, không phải 8 GB

| | 8 GB | **12 GB** | 16 GB |
|---|---|---|---|
| `00-preflight.sh` mục 7 | WARN | WARN | ok |
| control-plane + Calico + containerd | ~2 GB | ~2 GB | ~2 GB |
| Sandbox pod (`requests 512Mi` / `limits 2Gi`) | ~2–3 pod nặng | **~4–5 pod nặng** | ~6–7 |
| `POOL_TARGET` chạy được (P1) | 1–2 | 3 | 4+ |
| Tái lập bench 10 pod song song (30.8 s) | không | không chắc | có |

WARN ở mục 7 là **kỳ vọng**, không phải lỗi — `00-preflight.sh:137` chỉ fail khi RAM < 4000 MB.

---

## Bước 1 — Tắt máy sạch (KHÔNG discard suspend)

VMware **từ chối đổi `memsize` khi máy đang suspend**. Và discard suspend state tương đương rút
điện — etcd của cụm k8s có thể hỏng. Phải resume rồi shutdown tử tế.

1. VMware Workstation → chọn `debian13-sandbox` → **Power On** (thực ra là resume, máy trở lại đúng chỗ đã dừng).
2. Chờ cụm lên. Từ Windows:

```powershell
ssh nghaiz@192.168.94.130 "kubectl get nodes && sudo shutdown -h now"
```

3. Chờ tab VM hiện **Powered Off**. Kiểm tra lại từ PowerShell — thư mục khoá phải biến mất:

```powershell
Test-Path D:\VMs\debian13-sandbox\debian13-sandbox.vmx.lck   # kỳ vọng: False
```

> Nếu vẫn `True` sau khi VM đã tắt và bạn đã đóng cửa sổ VMware, đó là khoá mồ côi — xoá thư mục
> `.lck` bằng tay là an toàn. Còn nếu VMware đang mở, đừng đụng vào.

---

## Bước 2 — Xoá snapshot kèm memory-state

`sysbox-proof-green` đã đóng băng cấu hình 16 GB: đổi `memsize` xong mà revert về nó là quay lại
16 GB. Xoá nó cũng thu hồi 16 GiB `.vmem` và gộp 31 file delta `-000001-*.vmdk` (~140 MB) vào đĩa gốc.

**Điều kiện an toàn — đã thoả:** toàn bộ P0 nằm trong git (commit `85ffccb`), và mọi thứ trên VM
đều dựng lại được bằng `infra/host/0*.sh`. VM không giữ trạng thái độc nhất nào.

1. VM đang **Powered Off** (gộp lúc tắt máy nhanh và an toàn hơn lúc đang chạy).
2. **VM → Snapshot → Snapshot Manager**.
3. **Bấm vào icon đồng hồ `sysbox-proof-green`** — KHÔNG phải ô **"You Are Here"**.
   "You Are Here" là trạng thái đĩa hiện tại, không phải snapshot; chọn nó thì nút **Delete** xám.
   Thanh trạng thái dưới cùng phải ghi `"sysbox-proof-green" selected` thì Delete mới sáng.
4. **Delete** → **Close**.
5. Chờ thanh tiến trình gộp chạy xong. Xác nhận:

```powershell
Get-ChildItem D:\VMs\debian13-sandbox\*.vmem    # kỳ vọng: không còn file nào
```

Trên D: sẽ trống thêm ~32 GB (16 GiB `.vmem` của snapshot + 16 GiB `.vmem` của suspend state đã
được giải phóng ở Bước 1).

---

## Bước 3 — Đổi `memsize`

Backup trước, luôn luôn:

```powershell
Copy-Item D:\VMs\debian13-sandbox\debian13-sandbox.vmx `
          D:\VMs\debian13-sandbox\debian13-sandbox.vmx.pre-12gb
```

**Cách A — GUI (khuyến nghị).** VM → **Settings** → **Memory** → gõ `12288` MB → **OK**.
VMware tự căn chỉnh và tự kiểm tra tính hợp lệ.

**Cách B — sửa file.** Mở `debian13-sandbox.vmx` bằng Notepad, đổi đúng một dòng:

```
memsize = "12288"
```

Không đụng dòng nào khác. Đặc biệt **đừng** đổi `numvcpus` cùng lúc — nếu sau đó cụm có vấn đề,
bạn sẽ không biết biến nào gây ra.

Xác nhận:

```powershell
Select-String -Path D:\VMs\debian13-sandbox\debian13-sandbox.vmx -Pattern '^memsize'
```

---

## Bước 4 — Boot lại và verify

```powershell
# Power On trong VMware, chờ 60-90s (KHÔNG phải 40s — xem cạm bẫy bên dưới) rồi:
ssh nghaiz@192.168.94.130 "free -h; kubectl get nodes; kubectl get pods -A | grep -v Running"
```

| Kiểm tra | Kỳ vọng |
|---|---|
| `free -h` dòng `Mem:` cột total | `11Gi` (12288 MB trừ phần kernel/firmware giữ) |
| `kubectl get nodes` | `debian-sandbox   Ready   control-plane` |
| `kubectl get pods -A` | không pod nào ngoài `Running`/`Completed` |

Rồi chạy lại cổng P0.F cho chắc:

```bash
bash infra/host/00-preflight.sh      # mục 7 sẽ WARN — đúng như thiết kế, không phải lỗi
bash infra/host/04-verify-sysbox.sh  # kỳ vọng vẫn 8/8 pass, exit 0
```

Nếu `04-verify` chậm hơn trước: bình thường, ít RAM hơn thì page cache nhỏ hơn nên image đọc lại
từ đĩa. Trần chờ 300 s trong script vẫn dư sức.

---

## Nâng lại 16 GB sau này

Đúng ba bước, không có gì khác:

1. `ssh nghaiz@192.168.94.130 "sudo shutdown -h now"` — chờ **Powered Off** (không phải suspend).
2. Settings → Memory → `16384` (hoặc sửa `memsize = "16384"` trong `.vmx`).
3. Power On. Xong.

Đặt lại `POOL_TARGET` về mức của 16 GB khi tới P1.

---

## Cạm bẫy

- **`kubectl` quá sớm sau boot → `Error from server (Forbidden): nodes is forbidden: User
  "kubernetes-admin" cannot list resource "nodes"`.** KHÔNG phải RBAC hỏng, cũng không liên quan
  đến việc đổi RAM. kube-apiserver đã nhận kết nối trước khi authorizer RBAC nạp xong cache, nên
  request đầu tiên ăn 403; lệnh kế tiếp vài phần giây sau đã chạy bình thường (dấu hiệu nhận biết:
  `get nodes` lỗi mà `get pods -A` lại ra kết quả). **Chờ 60-90 s sau khi Power On rồi hãy gõ
  kubectl.** Muốn chắc thì kiểm chứng thay vì đoán:

  ```bash
  kubectl auth can-i list nodes     # kỳ vọng: yes
  kubectl auth whoami               # kỳ vọng: groups [kubeadm:cluster-admins system:authenticated]
  kubectl get clusterrolebinding kubeadm:cluster-admins -o jsonpath='{.roleRef.name}'   # cluster-admin
  ```

- **Suspend ≠ Powered Off.** Đóng cửa sổ VMware thường chỉ suspend. Còn `.vmss` là còn bị khoá `memsize`.
- **Snapshot Manager: "You Are Here" không phải snapshot.** Nó là con trỏ trạng thái hiện tại.
  Chọn nhầm nó thì Delete/Keep/Go To đều xám và bạn tưởng snapshot không tồn tại.
- **Thư mục `.lck` vẫn còn khi VM đã tắt là bình thường** nếu cửa sổ VMware Workstation còn mở tab
  đó (`.vmx.lck`, `.vmrest.lck`). Dấu hiệu tin cậy để biết máy đã tắt hẳn là **`.vmss` biến mất**.
- **Snapshot chụp lúc máy đang chạy luôn kèm `.vmem`** và sẽ ghim lại cấu hình RAM. Từ giờ, chỉ
  chụp snapshot khi VM đã tắt — nhẹ đĩa và không ghim gì.
- **Đừng bù bằng swap trong guest.** kubeadm yêu cầu swap off; bật lại sẽ làm kubelet từ chối khởi động.
- **`POOL_TARGET` chưa tự co theo RAM.** Ở 12 GB, giữ `POOL_TARGET` ≤ 3 khi làm P1, nếu không
  warm-pool sẽ đẩy node vào MemoryPressure và kubelet bắt đầu evict pod.
- **Muốn host thở thêm mà không hạ tiếp RAM:** VMware → Edit → Preferences → Memory → *Allow most
  virtual machine memory to be swapped*. Kèm theo, bảo đảm `open-vm-tools` đã cài trong guest —
  driver balloon của nó là thứ cho phép VMware thu hồi RAM guest chưa dùng
  (`ssh nghaiz@192.168.94.130 "dpkg -l open-vm-tools"`).

---

## Liên quan

- [`VMWARE-DEBIAN-SETUP.md`](VMWARE-DEBIAN-SETUP.md) — dựng VM từ đầu (Phần 3 là nơi `16384` được đặt lần đầu)
- [`README.md`](README.md) — cấu hình tối thiểu (4 vCPU / 8 GB) và bảng script
- [`00-preflight.sh`](00-preflight.sh) dòng 128–138 — ngưỡng RAM thật sự được kiểm
