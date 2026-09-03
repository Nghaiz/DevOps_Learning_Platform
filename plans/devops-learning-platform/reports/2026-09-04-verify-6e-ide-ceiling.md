# 6.E — đo "IDE + bài học cùng lúc", tính lại trần

**Ngày:** 2026-09-04 · **Lab:** 1 node / 8 vCPU / 11.6Gi, Sysbox, k8s v1.34.10
**Harness:** [`2026-09-04-6e-ide-plus-lesson/`](harness/2026-09-04-6e-ide-plus-lesson/)
**SSOT số:** `infra/helm/platform/values.yaml` § `sandbox.limitRange` → `ideProfile`

## 0. Kết luận một dòng

Trần bài-có-IDE là **7 pod**, không phải 10. Ước lượng cũ sai **18%** vì nó cộng
thẳng "IDE một mình" với "bài một mình" và giả định hai thứ không chồng lấn.

## 1. Phép đo còn nợ từ 6.A, nay đã chạy

`docs/ide-choice.md` §3 ghi rõ bảng trần 10/7 là **ước lượng**: nó lấy số của pod
chạy IDE **và không chạy gì khác** rồi cộng 163Mi của bài Docker. Lượt này đo
thật: một pod trong `dlp-sandbox`, sao nguyên spec pod ấm thật
(`sysbox-runc`, `hostUsers:false`, `DLP_REGISTRY_MIRROR`, 250m/256Mi–2/1Gi),
chạy **đồng thời** Theia và `dlp-docker-basics` (pull nginx qua mirror → run →
build image riêng).

Client là **trình duyệt thật** (Playwright), không phải `curl` — 6.A đã đo được
rằng `curl` cho số thấp 1.8× và đảo cả người thắng.

## 2. Số

| mốc | workingSet | peak | CPU cộng dồn | load1 node |
|---|---:|---:|---:|---:|
| IDE bật, chưa có client | 290Mi | 291Mi | 12.6s | 5.83 |
| + một client trình duyệt thật | 479Mi | 480Mi | 26.9s | 8.32 |
| + bài Docker (pull) | 500Mi | 566Mi | 37.5s | 11.14 |
| + bài Docker (build/run) | 582Mi | 727Mi | 60.5s | 12.12 |
| ổn định, container còn chạy | 581Mi | 727Mi | 61.8s | 7.47 |
| **sau tải lại lần 1** | 645–654Mi | 757Mi | 71.4s | 6.00 |
| **sau tải lại lần 2** | 660Mi | 763Mi | 79.7s | 5.27 |
| **sau tải lại lần 3** | 633Mi | **783Mi** | 89.2s | 5.87 |

`workingSet = memory.current − inactive_file`, đọc ở cgroup **trên host**.

## 3. Ước lượng cũ sai ở đâu

| | ước lượng §3 | đo được |
|---|---:|---:|
| Theia + bài học, ổn định | ~559Mi | **660Mi** |
| trần suy ra | 10 pod | **7 pod** |

Sai 18%, và sai theo hướng nguy hiểm: con số ước lượng cho ra **đúng bằng** con
số nó gán cho code-server (7), tức phép cộng thẳng đã **xoá mất chính khoảng
cách** mà nó tồn tại để đo. Bài học chung: "A một mình + B một mình" không phải
"A và B cùng lúc", và sai số ở đây đủ lớn để đảo một quyết định vận hành.

## 4. Phát hiện mâu thuẫn với 6.A — Theia CÓ tăng theo lượt tải lại

6.A ghi: *"Theia đứng yên ở 446–451 qua mọi lượt tải lại"*, và dùng chính điều
đó để phân biệt với code-server (571 → 750). Lượt này, **khi chạy cùng bài học**,
Theia đi 581 → 645 → 660 → 633.

Không mâu thuẫn về bản chất — nó **chững** quanh 633–660 chứ không rò tuyến tính,
đúng như 6.A mô tả cho chính nó. Nhưng câu "đứng yên qua mọi lượt tải lại" chỉ
đúng cho **IDE-một-mình**, và bản ghi cũ không nói giới hạn đó. Đã sửa
`docs/ide-choice.md`.

## 5. Trần mới

```
5500Mi ÷ 768Mi = 7.16 ⇒ 7 pod   (768Mi phủ 660Mi + biên tải lại)
5400m  ÷ 250m  = 21             (CPU KHÔNG phải ràng buộc)
22Gi   ÷ 1Gi   = 22             (limits giữ 1Gi; đỉnh 783Mi = 76%)
pods                            = 26
⇒ min(7, 21, 22, 26) = 7
```

**Tách profile, không nâng đều** (6.E task 17 kích hoạt bằng số thật): quota là
ngân sách dùng chung, `N_ide × 768Mi + N_thường × 256Mi ≤ 5500Mi`. Vài điểm vận
hành: 7 IDE + 0 thường · 5 IDE + 6 thường · 3 IDE + 12 thường.

⚠ **`ideProfile` CHƯA ĐƯỢC NỐI DÂY.** Orchestrator dựng mọi pod bằng LimitRange
mặc định; nó chưa đọc `interfaceLayout` để chọn profile. Khối trong values là một
**con số đã đo**, chưa phải một hành vi — đừng đọc sự tồn tại của nó là "đã tách".

## 6. Những gì lượt đo này KHÔNG chứng minh

- **code-server + bài học chưa được đo.** 868Mi của nó vẫn là ước lượng cộng
  thẳng — chính phép cộng vừa bị chứng minh là sai 18%. "660 so với 868" **không**
  phải một so sánh đo được. Điều kiện đảo #1 của `ide-choice.md` vẫn để ngỏ.
- **Một pod, một người học.** Trần 7 suy từ `requests`, không từ một lượt tải
  N=7 thật. Bài học 5.B: số trên node rảnh không nói gì về hành vi dưới tải.
- **Chưa qua gateway.** Đo sau `kubectl port-forward`, chưa qua chuỗi authz +
  reverse-proxy của 6.C — đường đó thêm độ trễ và có thể thêm RAM ở gateway.
- **Chỉ một bài.** `dlp-docker-basics` là bài nặng nhất hiện có, nhưng "nặng
  nhất hiện có" không phải "nặng nhất sẽ có". Bài K8s-in-pod của P7 phải đo lại.
- **Pod đo không có `securityContext`** mà PodSecurity `restricted` đòi (cảnh báo
  lúc apply). Pod thật do orchestrator dựng có thể khác ở điểm này.

## 7. Ô AC đóng kèm

- [x] Trần đồng thời mới tính lại theo min-của-năm và ghi phép tính vào values.
- [x] **Cùng filesystem** — đóng bằng trình duyệt thật, không phải suy luận:
      ghi `$HOME/lab/hello.txt` bằng `kubectl exec` (đường terminal), rồi mở
      Theia bằng Playwright → Explorer hiện `/root/lab/hello.txt`, click vào thì
      tiêu đề đổi thành `hello.txt - root - Theia IDE`. Đây là vế mà phase-6 ghi
      là "bước THỦ CÔNG, không có lệnh nào kiểm hộ".
