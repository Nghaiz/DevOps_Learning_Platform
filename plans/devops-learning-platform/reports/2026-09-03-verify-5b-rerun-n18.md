# 5.B — đo lại 18 người cùng build, hai lượt

**Ngày:** 2026-09-03 · **Lab:** 1 node / 8 vCPU / 11.6Gi
**Harness:** [`harness/2026-08-16-3i-concurrent-build/`](harness/2026-08-16-3i-concurrent-build/) (cùng bộ đã đo ra lỗi)
**So với:** [`2026-08-16-concurrent-build-load.md`](2026-08-16-concurrent-build-load.md)

## 0. Kết luận một dòng

Lượt A (`sha-4b7e553`) chứng minh **trần gateway đã hết là chỗ nghẽn** và chỉ ra chỗ
nghẽn kế tiếp nằm trong **nội dung bài học**. Lượt B (`sha-2b79fd3`, sau khi vá) đạt
**16/18 hoàn tất** — nhưng nó chạy trên một node vừa reboot, nên **không tách bạch
được** công của bản vá khỏi công của một node rảnh. Nói thẳng: bản vá vẫn **chưa
được chứng minh dưới tải**.

## 1. Ba lượt, đặt cạnh nhau

| | 2026-08-16 (trần 30s, pool 1) | Lượt A — 09-03 (trần 120s, pool 3) | Lượt B — 09-03 (thêm `timeout 90`) |
|---|---|---|---|
| **lượt chấm chạm trần gateway** | **17/18** | **0** | **0** |
| `docker build` p50 | 27.4s | 36.5s | **5.3s** |
| `pull` p50 | ~100s | — | 76.2s |
| `claim` p50 | 23–45s | 3.7–42s | **9.9s** (min 1.0s) |
| cả lớp build xong sau cờ GO | 64.7s | 109.8s | **17.1s** |
| pod evict / OOMKill / restart | 0 | 0 | **0** |
| lượt bị quota từ chối | 0 | 0 | **0** |
| **hoàn tất bài** | 1/18 | 1/18 | **16/18** |

## 2. Lượt A — trần gateway hết, nghẽn dịch xuống nội dung bài học

Harness lượt A trả `passed=false` cho 17/18 mà **không nói vì sao** — nó chỉ ghi
`passed`/`exitCode`, không giữ `output`. Vá xong (§4) và chạy lại, câu trả lời tới
thẳng từ script chấm:

```
17× exit=1  Image myapp:1 co ton tai nhung chay THAT BAI (exit=124):
            DLP docker lab: xin chao tu container
            python=3.12.14
```

`exit=124` là mã của GNU `timeout`. Thủ phạm: `timeout 20 docker run --rm myapp:1`
trong `content/scenarios/dlp-docker-basics/step4/verify.sh`.

⚠ **Container ĐÃ IN ĐÚNG CHUỖI trước khi bị giết.** Bài làm đúng, image chạy đúng,
kết quả đúng — người học vẫn nhận "chạy THẤT BẠI". Thứ vượt 20s không phải việc
sinh output mà là việc *kết thúc* (container exit + dọn `--rm`) dưới tranh chấp CPU.

Comment cũ ngay trên hằng số ấy là thứ đẻ ra con số sai:

> *"`docker run` ở đây rẻ … thoát sau chưa tới một giây. Trần một lượt chấm là 30s
> (`GATEWAY_EXEC_TIMEOUT`) nên vẫn dư."*

Hai lỗi: **"chưa tới một giây" là ước lượng** (đo thật lúc cụm RẢNH: **4636ms**), và
nó chọn hằng số bằng cách so với trần của **tầng khác** thay vì so với thời gian
thao tác thật sự tốn dưới tải. Cùng lớp lỗi với `GATEWAY_EXEC_TIMEOUT=30s`, chỉ nằm
trong **nội dung** thay vì trong mã hạ tầng.

## 3. Lượt B — 16/18 đạt, và vì sao con số đó CHƯA chứng minh bản vá

Sau khi nâng `20` → `90`, side-load và `helm upgrade` (`sha-2b79fd3`, khẳng định
`timeout 90` có thật trong image ĐANG CHẠY bằng `kubectl exec … grep`):

```
16× exit=0  Dat — myapp:1 da duoc dung va chay ra dung ket qua.
 2× (không có kết quả chấm — xem §5)
```

⛔ **Nhưng lượt B chạy trên một node VỪA REBOOT** (máy dev crash kéo theo guest khởi
động lại; `uptime` 5 phút, load 0.85 lúc bắt đầu). Hệ quả đọc được ngay trong số đo:
`docker build` p50 đi từ **36.5s xuống 5.3s** — nhanh hơn **7 lần**. Bản vá timeout
không thể làm build nhanh hơn; thứ làm nó nhanh hơn là một node rảnh.

Suy ra: với `docker run` tốn ~4.6s ở node rảnh, **trần 20 cũ cũng sẽ qua** ở lượt B.
Nên lượt B chứng minh *"hệ chạy đúng khi node rảnh"*, **không** chứng minh
*"`timeout 90` cứu được ca dưới tải"*.

**Phép đo còn thiếu để đóng ô này:** chạy N=18 trên một node **đã bị tải** (như lượt
A) với `timeout 90`. Hoặc, rẻ hơn và sạch hơn: chạy hai lượt liên tiếp trên cùng
trạng thái node, một với `timeout 20` và một với `90`.

## 4. Ba thứ đã vá trong lượt này

1. **`step4/verify.sh`: `timeout 20` → `90`.** Dưới trần gateway (120s) có chủ ý:
   cắt ở đây cho ra một câu tiếng Việt người học đọc được; cắt ở gateway cho ra một
   lỗi hệ thống. Comment cũ được thay bằng số đo và điều kiện chỉnh lần sau.
2. **Harness giữ `output` của lượt chấm.** Không có nó thì lượt A phải suy luận từ
   hai phép đo khác mới đoán ra nguyên nhân — và lượt sau lại phải đoán lần nữa.
3. **Harness tự dọn phiên** (`lessons.endSession` ở mọi đường thoát). Lượt A để lại
   **18 phiên sống ⇒ quota 21/26, cpu 5250m/5400m** — trần đã đầy, và lượt kế sẽ bị
   quota từ chối rồi bị đọc thành "hệ hết chỗ". Sau khi vá: quota sau khi chạy
   **3/26**.

⚠ **Không dùng `session.reap` để dọn:** nó đòi `userId` khớp `ctx.user.id`, mà
harness chỉ có uid của **pod** trong tay — dọn bằng nó trả FORBIDDEN 17/17 (đã đo).
`lessons.endSession` suy người dùng từ cookie nên không có gì để lệch.

## 5. Lỗi mới nổi lên: `orchestrator gRPC: Premature close`

Hai phiên của lượt B (s5, s13) chết ở `lessons.checkStep` với HTTP 500:

```
{"message":"orchestrator gRPC: Premature close","code":-32603}
```

Đã lần được đường: `checkStep` gọi `sessionExpiry()` → `GetSession` qua
`callOrchestrator` (`apps/web/src/server/grpc/orchestrator-client.ts:95`), và kết
nối HTTP/2 tới orchestrator đứt giữa lúc đọc phản hồi. Đây là lỗi **phía client**,
không phải orchestrator chết:

- `kubectl logs deploy/platform-orchestrator --since=30m` **không có** dòng nào khớp
  `premature|EOF|panic|reset|closed`.
- Restart count của cả 6 pod **không đổi** trước/sau lượt đo.

Tần suất: 1/18 (lượt A) và 2/18 (lượt B) ⇒ **~5–10%**. Ở tần suất đó, cứ 10–20 lần
bấm "Kiểm tra" thì một lần trả 500 cho một bài làm đúng.

⛔ **CHƯA vá, có chủ ý.** Nguyên nhân gốc (vì sao kết nối h2 đóng) chưa xác định, và
đường vá hiển nhiên — retry trong `callOrchestrator` — sẽ **che** triệu chứng chứ
không giải thích nó, đồng thời chạm cả những RPC không idempotent vì hàm ấy bọc mọi
lời gọi. Việc đúng là điều tra trước: bắt GOAWAY/idle-timeout ở tầng h2, hoặc bật
log kết nối phía client.

## 6. Nợ còn lại

- **`timeout 90` chưa chứng minh dưới tải** (§3) — đây là ô chính còn mở.
- **`Premature close` ~5–10%** (§5) — chưa điều tra, chưa vá.
- **Chưa biết `docker run` thật sự tốn bao lâu dưới tải** — `timeout` giết nó ở 20s
  nên con số thật bị che. Lượt đo sau nên ghi lại thời gian đó.
- **Chưa đo qua Traefik** và **chưa đo ở 40** — vẫn thuộc P12.
