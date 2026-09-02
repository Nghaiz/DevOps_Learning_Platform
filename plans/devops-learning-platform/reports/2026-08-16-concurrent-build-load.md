# N người CÙNG build — phép đo còn thiếu của 3.I

**Ngày:** 2026-08-16 · **Lab:** 1 node / 8 vCPU / 11.6Gi · **Harness:**
[`harness/2026-08-16-3i-concurrent-build/`](harness/2026-08-16-3i-concurrent-build/)

Đóng đúng dòng nợ mà [mắt 3/5](2026-08-16-verify-3i-m3m5-h6.md#L310-L312) ghi lại:
*"21 phiên là trần CẤU HÌNH, không phải trần chịu tải. Chưa có phép đo nào chạy
21 bài Docker song song."*

## 0. Kết luận một dòng

**Phần cứng chịu được. Code thì không.** 18/18 build xong, không ai bị giết,
RAM dùng 27% — nhưng **17/18 người nhận HTTP 500 khi bấm Kiểm tra**, vì
`GATEWAY_EXEC_TIMEOUT` là một hằng số 30s được chọn cho cụm rảnh.

## 1. Thiết kế: rào chắn, không phải "cùng học"

Nếu mỗi worker chạy theo nhịp riêng, các lượt `docker build` TRẢI RA theo thời
gian và phép đo trả lời câu "N người cùng HỌC". Câu được hỏi là "N người cùng
BUILD". Nên mọi worker chạy tới ngay trước `docker build` rồi **đứng chờ cờ GO**
của driver — pull/run/exec/ghi Dockerfile đều nằm TRƯỚC rào chắn.

N = 18, không phải 21: trần là 21 pod và 3 khe đang bị warm pool + 2 pod tồn dư
của hai lượt chạy hỏng giữ. 18 là số khe trống thật lúc đo.

Đường đi: ClusterIP qua `kubectl port-forward`, **giữ nguyên header `Origin`**
⇒ origin-check của app vẫn chạy, chỉ né rate-limit của Traefik. Việc nặng
(`docker pull`/`build`) đi thẳng apiserver qua `kubectl exec`, không qua đường hầm.

## 2. Số đo

### Đường cơ sở — 1 người

| claim | dockerd sẵn sàng | pull | **build** |
|---|---|---|---|
| 0.2s | 0.9s | 100.0s | **3.7s** |

> Phần đắt của bài là **pull (100s)**, không phải build (3.7s). Bài build chỉ có
> 3 layer và một `COPY` tệp nhỏ.

### 18 người cùng build

| | p50 | p95 | max | min |
|---|---|---|---|---|
| `docker build` | **27.4s** | 29.1s | 29.1s | 17.6s |

- Cả lớp build xong sau **64.7s** kể từ cờ GO.
- Chậm **7.4×** so với một mình (3.7s → 27.4s).
- `pull` giãn từ 100s lên **74–234s** (trải rộng vì mỗi người pull ở nhịp riêng).
- `claim` giãn từ 0.2s lên **23–45s**; `dockerd sẵn sàng` từ 0.9s lên **19–29s**.

### Tài nguyên (cgroup trên host, 21 pod, mẫu 250ms)

| Đại lượng | Đo được | Trần |
|---|---|---|
| CPU đỉnh cửa sổ 1s, **cộng mọi pod** | **20.02 core** | **8 core** ⇒ đòi gấp **2.5×** |
| CPU đỉnh 1s của pod cao nhất | 1.46 core | 2.0 (cpu.max) |
| workingSet đỉnh, cộng mọi pod | **3139 Mi** | 11.6Gi ⇒ dùng **27%** |
| workingSet trung vị / pod | 146 Mi | — |
| anon đỉnh, cộng mọi pod | 2166 Mi | — |
| Load average node (1m/5m/15m) | **18.2 / 40.6 / 27.9** | 8 core |

## 3. Bốn khẳng định của ngưỡng "không ai hỏng"

| # | Khẳng định | Kết quả |
|---|---|---|
| 1 | N/N hoàn tất bài + image CHẠY được | ❌ **1/18** — nhưng xem §4, build KHÔNG phải chỗ hỏng |
| 2 | 0 pod evict / OOMKill / restart | ✅ **0** |
| 3 | 0 phiên hỏng giữa chừng | ❌ 17/18 hỏng ở bước chấm |
| 4 | 0 lượt bị quota từ chối | ✅ **0** |

Ô 1 và 3 đỏ vì **cùng một nguyên nhân**, và nguyên nhân đó không phải "build hỏng".

## 4. Nguyên nhân: một hằng số 30s chọn cho cụm rảnh

**18/18 `docker build` THÀNH CÔNG.** Thứ hỏng là bước chấm bài:

```
gateway: "script chạy quá hạn: context deadline exceeded"
web:     HTTP 500 "Không chạy được script chấm bài trong sandbox"
```

Đường đi: `lessons.checkStep` → BFF → gateway `execroute` → `kubectl exec` script
verify trong pod. Trần là [`GATEWAY_EXEC_TIMEOUT`](../../services/terminal-gateway/internal/config/config.go#L224),
mặc định **30s**.

| Cụm rảnh | Cụm 18 người cùng build |
|---|---|
| verify script **0.87 – 3.06s** | **> 30s** (lượt duy nhất lọt qua: **23.46s**) |

Một script chấm bài giãn **8–25×** dưới tranh chấp CPU và đâm thủng trần cứng.
Người học build đúng, image chạy đúng, và nhận về một lỗi hệ thống.

Đáng ghi nhận: `validate.ts` **cố ý không** biến lỗi này thành `passed:false`
([nguyên văn](../../apps/web/src/server/lessons/validate.ts#L140-L144): *"một
session hết hạn, một pod đã bị reap, một apiserver trục trặc — cả ba đều KHÔNG
phải bài làm sai"*). Nhờ vậy nó nổi lên thành 500 thay vì âm thầm chấm sai —
phân loại đúng, chỉ là trần sai.

## 5. Bẫy đo lộ ra: `throttle = 0` KHÔNG có nghĩa là không đói CPU

| Nguồn tín hiệu | Nói gì |
|---|---|
| `nr_throttled` cộng mọi pod | **9 / 142 445 chu kỳ ≈ 0** ⇒ "không pod nào bị giữ lại" |
| Load average node | **40.6** trên 8 core ⇒ quá tải 5× |
| Thời gian tường | build 3.7s → 27.4s ⇒ chậm 7.4× |

`throttled_usec` chỉ đếm khi một cgroup chạm **trần RIÊNG của nó** (`cpu.max` = 2
core). Ở đây không pod nào chạm 2 core — chúng đói vì **8 core chia cho 18 pod ở
tầng scheduler của node**, một cơ chế `nr_throttled` hoàn toàn không nhìn thấy.

⇒ Bổ sung cho [mắt 3](2026-08-16-verify-3i-m3m5-h6.md): ở đó `nr_throttled` LÀ tín
hiệu đúng, vì trần khi ấy là `cpu.max` 1 core. Khi ràng buộc chuyển từ *quota
per-cgroup* sang *dung lượng node*, tín hiệu đó tắt và **chỉ load average + thời
gian tường còn nói được sự thật**.

## 6. Hai lỗi vận hành đã dẫm phải (ghi để không lặp)

1. **`kubectl port-forward` rụng sau 68s im lặng lúc `docker pull`**, và
   `fetch failed` của KÊNH ĐO đọc ra y hệt "hệ từ chối" — phép đo tự nói dối theo
   hướng làm hệ trông tệ hơn thật. Đã bịt bằng retry chỉ-bọc-lỗi-mạng + vòng lặp
   tự dựng lại port-forward.
2. **`kubectl delete pod` trên pod sandbox làm lệch warm pool.** Lượt
   `startSession` kế tiếp phát ra tên pod đã chết và mọi `exec` trả `NotFound`.
   Orchestrator **không kiểm pod còn tồn tại trước khi giao**. Tôi gây ra bằng
   tay, nhưng một pod chết vì lý do thật (evict, node pressure) đi đúng đường
   hỏng này. Đã lành sau `rollout restart`; **đường dọn đúng là reaper, không
   phải `kubectl delete`.**

## 7. Suy ra cho mục tiêu 40 người

Số học từ phép đo này, **chưa phải phép đo**:

| Đại lượng | 18 người (đo) | 40 người (suy ra) | Trần |
|---|---|---|---|
| CPU đỉnh 1s cộng lại | 20.0 core | ~44 core | 8 ⇒ quá tải **5.5×** |
| workingSet cộng lại | 3139 Mi | ~6.5 GiB | 11.6Gi ⇒ **vừa** |
| build p50 | 27.4s | ~60s (tuyến tính) | — |

**RAM không phải chỗ nghẽn ở cả hai mức.** CPU quá tải làm CHẬM chứ không GIẾT —
đúng như thiết kế chọn đặt overcommit ở CPU. Nhưng trần 30s của bước chấm sẽ
thủng SỚM HƠN nữa ở 40 người, nên thứ chặn quy mô hiện nay là **một hằng số
timeout**, không phải phần cứng.

## 8. Nợ còn lại

- **Chưa đo ở 40.** Số §7 là ngoại suy tuyến tính; tranh chấp CPU không tuyến tính.
- **Chưa đo qua Traefik.** Lượt này đi ClusterIP có chủ ý. Trần biên `/ws`
  (20/1m, burst 10) chưa từng gặp tải này.
- **Chưa tách CPU của riêng bước build** khỏi pull/dockerd-boot.
- **`POOL_TARGET=1`** nên 17/18 người đi cold path; `claim` 23–45s phần lớn là
  chờ pod mới, không phải chờ CPU.
