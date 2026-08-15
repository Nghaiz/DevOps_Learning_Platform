# `infra/k6` — load test của P3/3.F

Đo **trần CẤU HÌNH** của lab như nó đang chạy. Không nới quota, không nới
rate-limit — phạm vi đã chốt với chủ dự án 2026-08-15
([plan 3.F](../../plans/devops-learning-platform/phase-3-detailed.md#3f--k6-load-test-tới-trần-cấu-hình)).

## Chạy

```bash
# Windows, Git Bash. k6 KHÔNG cài vào hệ thống — binary standalone.
K6=/c/path/to/k6.exe bash infra/k6/run-load.sh
```

Sau đó, **trên VM**, đóng nốt ô reaper:

```bash
bash infra/k8s/reaper-verify.sh
```

## Ba điều dễ làm sai, ghi ở đây để khỏi phải học lại

### 1. k6 chạy trên Windows — ở NGOÀI hệ đang đo

Cụm lab có **8 vCPU**. Một generator tải nằm cùng chỗ với hệ nó đang đo sẽ ăn
đúng phần CPU mà nó đang đo, và số ra thấp hơn thực tế **mà không cách nào biết
thấp bao nhiêu**. Chạy ngoài là điều kiện để con số có nghĩa.

Hệ quả phải chấp nhận: mọi VU dùng chung **một** IP nguồn, nên mọi trần
rate-limit theo IP tính chung một bucket. Đó là lý do có hai kịch bản tách rời
chứ không phải một ramp.

### 2. Ba trần đứng TRƯỚC trần ta muốn đo

| # | Trần | Giá trị |
|---|---|---|
| 1 | Better Auth **signup theo IP** | ~2–3 lượt rồi 429 |
| 2 | rate-limit biên **`/ws`** | 20/1m, burst 10 |
| 3 | rate-limit biên **web** | 120/1m, burst 60 |
| 4 | **session đồng thời** ← thứ 3.F muốn đo | `min(5 ràng buộc quota×LimitRange)`, trừ `POOL_TARGET` — xem `values.yaml` § `sandbox.quota` |

Trần 1 đứng trước cả lúc tải bắt đầu: k6 tạo user mỗi VU là chết ở bước dựng,
chưa kịp đo gì — và 429 lúc đó đọc y hệt "hệ đã chặn tải". Vì thế
`provision-users.sh` dựng pool **một lần** và **cache lại**.

`ceiling.js` đi tuần tự có nhịp để trần 2/3 không chen vào phép đo trần 4.
`edge.js` cố tình vượt trần 2, và **chỉ** nó được phép thấy 429.

### 3. "Bị chặn" và "không kết nối được" phải đếm riêng

Vì mọi VU chung một bucket IP, ramp song song ra **lỗi kết nối `000`**, không ra
429 — 3.E đã đo đúng ca đó. Gộp hai thứ lại là cách chắc chắn nhất để đọc một
phép đo hỏng thành "hệ đã chặn đúng". `AC-F4` tồn tại để giữ đúng sự phân biệt
này, và `ceiling.js` coi **bất kỳ** lỗi kết nối nào là phép đo hỏng.

## Vì sao `edge.js` không dùng thư viện WebSocket nào

Ta đo **biên**, không đo terminal. Middleware rate-limit của Traefik gắn theo
router (đường `/ws`), nên nó bắn trước cả bước upgrade; một request HTTP mang đủ
header nâng cấp là đủ để router đếm, và nó trả về **mã trạng thái đọc được sạch**.
Thư viện WS thì gói mọi thứ hỏng thành "connection failed" — tức xoá đúng sự
phân biệt 429-vs-đứt-kết-nối mà `AC-F4` tồn tại để giữ.

Thêm một điểm mạnh: **429 trên `/ws` chỉ có thể là của Traefik**, vì đường này
proxy thẳng tới gateway Go và Next không nằm trên đường đi. Đây là lập luận
**cấu trúc**, chặt hơn cách phân biệt bằng body mà `AC-A3` phải dùng cho `/`.

> Ghi chú module: `k6/net/websockets` **không tồn tại** ở k6 v2.2.0 — k6 báo
> `unknown dependency` rồi cố provision binary tuỳ biến, và thông báo đó đọc ra y
> hệt lỗi mạng. Hai module chạy được là `k6/ws` và `k6/experimental/websockets`.

## Vì sao ngưỡng chống-xanh-giả để ở `>=1`, không phải `>=3`

3 là con số đang **ĐO**, không phải con số khẳng định trước. Nướng dự đoán vào
cổng thì cổng không còn đo được nữa — nó chỉ xác nhận dự đoán. Ngưỡng
`dlpk6_sessions_created: count>=1` chỉ gác một thứ: phép đo **đã thật sự chạy**
(chống ca script trỏ sai địa chỉ / thoát sớm vẫn "xanh"). Trần thật do report ghi.

## Giới hạn — cổng CI chỉ TĨNH

`run-load.sh` cần một cụm sống nên **không vào CI được**, cùng lý do
`infra/k8s/reaper-verify.sh` chưa vào được. CI chỉ lint/`k6 inspect` được cú pháp
kịch bản. Đừng đọc cổng CI xanh thành "load test đã chạy".

## File

| File | Việc |
|---|---|
| `provision-users.sh` | dựng + cache pool user (né trần 1) |
| `lib/config.js` | cấu hình chung, phân loại phản hồi |
| `ceiling.js` | trần session đồng thời (AC-F1, F2, F4) |
| `edge.js` | hỏng đúng kiểu ở biên (AC-F3) |
| `run-load.sh` | runner + thu bằng chứng cụm + bảng ô AC |
| `.users.json` | **gitignored** — chứa cookie phiên thật |
| `out/` | **gitignored** — log + summary của lượt chạy |
