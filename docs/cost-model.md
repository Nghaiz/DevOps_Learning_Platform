# Mô hình chi phí mỗi phiên (P3/3.G, task 9 của sketch)

**Ngày:** 2026-08-16 · **Nguồn số:** phép đo cgroup của 3.I mắt 3
([report](../plans/devops-learning-platform/reports/2026-08-16-verify-3i-m3m5-h6.md))

> ⛔ **Tài liệu này là một MÔ HÌNH, không phải một hoá đơn.** Nó nhân một con số
> ĐO ĐƯỢC (mật độ phiên trên mỗi node) với một con số KHÔNG đo được ở đây (giá
> node của nhà cung cấp). Vế thứ hai người vận hành phải điền. Một tài liệu chi
> phí ghi sẵn "$X/phiên" mà không khai giá node đến từ đâu là một con số bịa.

## 1. Đại lượng quyết định là MẬT ĐỘ, và nó vừa đổi ba lần

Chi phí mỗi phiên = giá node ÷ số phiên một node chứa được. Nên toàn bộ bài toán
chi phí quy về mật độ, và mật độ quy về `requests` — vì `requests` là thứ
scheduler dùng để quyết định, không phải mức dùng thật.

| Bộ số | `requests`/pod | Phiên/node (8 vCPU, 11.6Gi) | Ghi chú |
|---|---|---|---|
| Trước 3.I | 500m / 512Mi | **3** | `requests` suy từ `memory.current` (gộp page cache) |
| Sau mắt 4/5 | **250m / 256Mi** | **21** | `requests` suy từ workingSet đo được (158–163Mi) |

**Mật độ tăng 7 lần mà không mua thêm gì**, vì con số cũ giữ chỗ cho page cache —
thứ kernel bỏ đi miễn phí khi thiếu RAM. Chi tiết phép tách anon/cache: xem
`infra/helm/platform/values.yaml` § `sandbox.limitRange`.

⚠ Ràng buộc chặn hiện tại là **CPU requests**, không phải RAM:
`5400m ÷ 250m = 21` pod, trong khi RAM cho phép `5500Mi ÷ 256Mi = 21` — hai vế
được đặt bằng nhau có chủ ý để không vế nào thành ràng buộc lẻ loi ẩn.

## 2. Công thức

```
chi_phí_mỗi_giờ_phiên = giá_node_mỗi_giờ / phiên_mỗi_node
```

Với `phiên_mỗi_node = min(5 ràng buộc quota×LimitRange) − POOL_TARGET`
(công thức đầy đủ ở `values.yaml` § `sandbox.quota`; `reaper-verify.sh`
§ `quota_pod_ceiling` tính nó từ đối tượng sống).

Trên hình dạng node của lab (8 vCPU / 11.6Gi khả dụng), với `requests` hiện tại
và platform chiếm sẵn 1880m/1832Mi:

```
phiên_mỗi_node = 21
chi_phí_mỗi_giờ_phiên = giá_node_mỗi_giờ / 21
```

Ví dụ minh hoạ (điền giá thật của nhà cung cấp bạn dùng — số dưới đây chỉ để
thấy độ lớn, KHÔNG phải báo giá):

| giá node/giờ | trước 3.I (÷3) | sau 3.I (÷21) |
|---|---|---|
| $0.10 | $0.0333 | **$0.0048** |
| $0.20 | $0.0667 | **$0.0095** |

## 3. Ba đòn bẩy còn lại, xếp theo mức đã được chứng minh

| Đòn bẩy | Trạng thái | Ghi chú |
|---|---|---|
| **Mật độ** (`requests` đúng) | ✅ **đã đo, đã áp** | 3 → 21 phiên/node. Đây là đòn bẩy lớn nhất và là đòn bẩy duy nhất đã chứng minh. |
| **Scale-to-zero off-peak** | ⚠ **chỉ render được** | Cần cluster-autoscaler + node group khai `min=0` ở tầng provider. Lab không có node group ⇒ không chứng minh được. Xem `templates/cluster-autoscaler.yaml`. |
| **Spot / preemptible** | ❌ **chưa có gì** | Xem §4. |

## 4. Spot interruption — nói thẳng là CHƯA CÓ

Sketch task 9 nêu "spot interruption handling". Repo **không** có thành phần nào
xử lý việc đó, và điều này cố ý được ghi ra thay vì để trống:

- Cơ chế báo thu hồi là **riêng của từng nhà cung cấp** (AWS Node Termination
  Handler, GCP preemption notice, Azure Scheduled Events). Không có API trung
  lập, nên không có cách nào ship nó mà vẫn giữ ràng buộc "trung lập nhà cung
  cấp" của §1.
- Cái repo ĐÃ có và có ích cho ca đó: `terminationGracePeriodSeconds` >
  `SHUTDOWN_GRACE`, drain WS phát `1012`, `PodDisruptionBudget` cho gateway, và
  lease khe WS tự lành trong ≤90s khi một replica chết đột ngột (3.H). Chúng làm
  cho một node biến mất trở thành *phiên phải nối lại*, không phải *phiên chết
  im lặng*.
- Nhưng **pod sandbox thì mất thật**: chúng không có controller, và người học
  mất trạng thái trong container. Không có snapshot/migrate nào. Nên chạy tier
  sandbox trên spot là một đánh đổi phải nói với người dùng, không phải một tối
  ưu chi phí trong suốt.

## 5. Cái mô hình này KHÔNG nói

- Không tính băng thông, lưu trữ PVC (registry mirror 10Gi), hay chi phí quan
  sát (Prometheus/Loki giữ dữ liệu).
- Không tính phần **warm pool**: `POOL_TARGET` pod luôn chạy kể cả khi 0 người
  học, nên chi phí đáy khác 0. Với `POOL_TARGET=1` đó là 1/21 node.
- Số 21 đo trên **một hình dạng node cụ thể**. Node khác ⇒ tính lại bằng đúng
  công thức §2, đừng chép con số 21.
