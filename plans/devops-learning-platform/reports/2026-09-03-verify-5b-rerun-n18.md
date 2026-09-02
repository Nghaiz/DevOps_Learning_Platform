# 5.B — đo lại 18 người cùng build sau khi nâng trần chấm

**Ngày:** 2026-09-03 · **Lab:** 1 node / 8 vCPU / 11.6Gi · **Cụm:** `sha-4b7e553`, helm rev 79
**Harness:** [`harness/2026-08-16-3i-concurrent-build/`](harness/2026-08-16-3i-concurrent-build/) (cùng bộ đã đo ra lỗi)
**So với:** [`2026-08-16-concurrent-build-load.md`](2026-08-16-concurrent-build-load.md)

## 0. Kết luận một dòng

**Trần cũ đã hết là chỗ nghẽn. Chỗ nghẽn dịch xuống một tầng — và nó nằm trong
chính nội dung bài học.** Không còn lượt nào chạm `GATEWAY_EXEC_TIMEOUT`; thay
vào đó **17/18 bị `timeout 20` bên trong `step4/verify.sh` giết**, một hằng số
cũng chọn theo cụm rảnh.

## 1. So cột với cột

| | 2026-08-16 (trần 30s, pool 1) | 2026-09-03 (trần 120s, pool 3) |
|---|---|---|
| `docker build` p50 | 27.4s | **36.5s** |
| `docker build` p95 | 29.1s | 37.6s |
| cả lớp build xong sau cờ GO | 64.7s | 109.8s |
| pod evict / OOMKill / restart | 0 | **0** |
| lượt bị quota từ chối | 0 | **0** |
| **lượt chấm chạm trần gateway** | **17/18** | **0** |
| hoàn tất bài | 1/18 | **1/18** |

Build chậm hơn lượt trước (36.5s so với 27.4s) vì `POOL_TARGET` đi từ 1 lên 3:
ba pod ấm chiếm chỗ thường trực, nên 18 người chia phần CPU còn lại. Đổi lấy:
`claim` của ba người đầu xuống còn **6.3–6.4s** (lượt trước 23–45s cho mọi người).

## 2. Chỗ nghẽn mới, đọc từ chính lời của script chấm

Lượt đo đầu của ngày trả `passed=false exit=1` cho 17/18 mà **không nói vì sao** —
harness chỉ ghi `passed`/`exitCode`, không giữ `output`. Phải suy từ hai phép đo
khác mới đoán ra. Đó là một lỗ hổng của công cụ đo, đã vá (§4), và lượt chạy lại
cho câu trả lời trực tiếp:

```
17× exit=1  Image myapp:1 co ton tai nhung chay THAT BAI (exit=124):
            DLP docker lab: xin chao tu container
            python=3.12.14

 1× exit=0  Dat — myapp:1 da duoc dung va chay ra dung ket qua.
```

Hai điều trong khối này, cái thứ hai đáng chú ý hơn:

1. **`exit=124` là mã của GNU `timeout`** cho "lệnh bị giết vì quá hạn". Thủ phạm
   là `timeout 20 docker run --rm myapp:1` trong `content/scenarios/dlp-docker-basics/step4/verify.sh`.
2. ⚠ **Container ĐÃ IN ĐÚNG CHUỖI trước khi bị giết.** Bài làm đúng, image chạy
   đúng, kết quả đúng — và người học vẫn nhận "chạy THẤT BẠI". Thứ vượt 20s không
   phải việc sinh ra output mà là việc *kết thúc* (container exit + dọn `--rm`)
   dưới tranh chấp CPU.

## 3. Cùng một lớp lỗi, thấp hơn một tầng

Comment cũ ngay trên hằng số ấy là thứ đẻ ra con số sai:

> *"`docker run` ở đây rẻ: image nằm sẵn trên máy, không chạm mạng, thoát sau chưa
> tới một giây. Trần một lượt chấm là 30s (`GATEWAY_EXEC_TIMEOUT`) nên vẫn dư."*

Hai lỗi trong một câu:

- **"chưa tới một giây" là ước lượng, không phải phép đo.** Đo thật trên cụm lúc
  RẢNH: `docker run --rm myapp:1` mất **4636ms** — chậm hơn ước lượng ~5 lần ngay
  cả khi không có ai tranh CPU.
- **Nó chọn hằng số bằng cách so với trần của TẦNG KHÁC** (gateway), chứ không so
  với thời gian thao tác này thật sự tốn dưới tải.

Đây đúng là chế độ hỏng của `GATEWAY_EXEC_TIMEOUT=30s`, chỉ nằm trong nội dung
bài học thay vì trong mã hạ tầng. **Sửa trần ở tầng trên xong thì trần ở tầng
dưới thành chỗ nghẽn kế tiếp** — và không có gì tự nói ra điều đó.

## 4. Ba thứ đã sửa trong lượt này

1. **`step4/verify.sh`: `timeout 20` → `90`.** Dưới trần gateway (120s) có chủ ý:
   cắt ở đây cho ra một câu tiếng Việt người học đọc được; cắt ở gateway cho ra
   một lỗi hệ thống. Comment cũ được thay bằng số đo và điều kiện chỉnh lần sau.
2. **Harness giữ `output` của lượt chấm.** Không có nó thì lượt sau lại phải đoán.
3. **Harness tự dọn phiên** (`lessons.endSession` trong mọi đường thoát). Lượt đo
   đầu của ngày để lại **18 phiên sống ⇒ quota 21/26, cpu 5250m/5400m** — tức trần
   đã đầy, và lượt kế sẽ bị quota từ chối rồi bị đọc thành "hệ hết chỗ". Lượt sau
   khi vá: **quota sau khi chạy = 4/26**.

⚠ **Không dùng `session.reap` để dọn:** nó đòi `userId` khớp `ctx.user.id`, mà
harness chỉ có uid của **pod** trong tay — dọn bằng nó trả FORBIDDEN 17/17 (đã đo).
`lessons.endSession` suy người dùng từ cookie nên không có gì để lệch.

## 5. Nợ còn lại

- **Bản vá `timeout 90` CHƯA được kiểm dưới tải.** Nội dung bài được nướng vào
  image web lúc build, nên nó chỉ có hiệu lực sau một lượt CI publish + side-load
  + `helm upgrade`. Cho tới lúc ấy, "90s là đủ" là **suy luận từ 4.6s × ~10**,
  không phải phép đo.
- **Chưa biết `docker run` thật sự tốn bao lâu dưới tải** — `timeout` giết nó ở
  20s nên con số thật bị che. Lượt đo sau nên ghi lại thời gian đó.
- **1 lượt `HTTP 500 orchestrator gRPC: Premature close`** ở lượt đo đầu (s12),
  không tái diễn ở lượt hai. Chưa điều tra.
- **Chưa đo qua Traefik** và **chưa đo ở 40** — vẫn thuộc P12.
