# 1.G-4 — M1: quy 0.75s p95 attach về từng chặng

**Ngày:** 2026-08-13 · **Nhánh:** `p1-g4-attach-attribution` · **Cụm:** `debian-sandbox` (192.168.94.130), k8s v1.34.10 + Sysbox
**Ảnh gateway khi đo:** `sha-996cca7` → `sha-dabd086`. **Bốn image kia giữ nguyên `sha-0d54bbb`.**
**Artifact:** [`harness/2026-08-13-1g4-attach-attribution/`](harness/2026-08-13-1g4-attach-attribution/)

---

## Tóm tắt

Ô AC đỏ duy nhất của phase là *"101 → `ready`, p95 < 500ms"* (đo 1.G-2: **0.750s**). 1.G-2 chốt *"đừng nới ngưỡng trước khi quy được nguyên nhân"*. Chặng này quy.

**Nguyên nhân lớn nhất không nằm trong bất kỳ chặng nào — gateway bị throttle CPU.** Ở trần `150m`, gateway mất **38.7% số chu kỳ CFS** và **123ms mỗi lượt attach**. Nâng lên `500m` xoá gần hết và cắt tổng **457ms → 412ms** (bản cuối đo 356ms).

**Nhưng CPU không đóng được ô AC**, và lý do là thứ đáng giá nhất của chặng này: **`pty` — apiserver → kubelet → CRI → `tmux attach` — chiếm 62–79% và KHÔNG đổi khi trần CPU đi từ 150m lên 2000m.** Nó là sàn hạ tầng mà gateway không chạm tới được ở P1.

| # | Việc | Kết quả |
|---|---|---|
| P1 | Chốt ngưỡng quyết định **trước** khi đo | ✅ — và bảng đó lộ ra một lỗ, xem §4 |
| P2 | Instrument năm chặng, hai hook đọc từ mã client-go | ✅ đối chứng Σchặng vs tổng lệch **0.00%** |
| P3 | Đo ≥50 mẫu, tách mẫu nguội khỏi mẫu ấm | ✅ ba nấc trần CPU |
| P4 | Quyết + land | ✅ trần CPU → 500m · ô AC tách hai vế, vế gác **ĐẠT** |

---

## 1. Bảng phân bổ

49 mẫu ấm, ba nấc trần CPU. Số đầy đủ: [`cluster-measurements.txt`](harness/2026-08-13-1g4-attach-attribution/cluster-measurements.txt).

| chặng | 150m | 500m | 2000m | đọc là gì |
|---|---|---|---|---|
| `wait_init` | 6.0ms · 1.2% | 1.0ms | 0.9ms | thời gian **client** |
| `build_exec` | 0.8ms · 0.2% | 0.9ms | 0.7ms | công **gateway** tự làm |
| `upgrade` | 28.0ms · 6.1% | 9.8ms | 8.3ms | bắt tay apiserver |
| `streams` | 135.0ms · 29.6% | 85.1ms | 69.4ms | dựng stream |
| **`pty`** | **281.0ms · 61.6%** | **315.3ms** | **279.3ms** | pod → CRI → tmux |
| **TỔNG** | **456.5ms** | **412.1ms** | **358.7ms** | |
| throttle/lượt | **123ms** | 1.8ms | 0ms | |

**Hai giả thuyết "vá được" của tôi đều chết bằng số.** `wait_init` 1.2% ⇒ mốc metric **không** đặt sai chỗ (tôi đã nghi nó tính cả thời gian chờ client). `build_exec` 0.2% ⇒ cache TLS config sẽ tiết kiệm 0.8ms, không đáng làm. Ghi ra vì một giả thuyết bị bác bằng số đắt hơn nhiều so với một giả thuyết chưa ai thử.

---

## 2. Throttling: từ tương quan sang nhân quả

`streams` = 135ms ở 150m là con số **không giải thích được bằng đường mã**: sau khi upgrade trả về, `createStreams` chỉ dựng object cục bộ rồi `copyStdin` gọi `Read` ngay — lẽ ra tính bằng micro-giây. Nghi phạm rõ: trần `150m`.

Đo `cpu.stat` trên **host** (không phải trong pod), delta quanh đúng lượt 50 mẫu:

```
trần 150m:  110/284 chu kỳ throttle (38.7%) · 6.156s chờ CPU · 123 ms/lượt
trần 500m:    1/223 chu kỳ (0.4%)           · 0.089s        · 1.8 ms/lượt
trần 2000m:   0     chu kỳ (0%)             · 0s            · 0 ms/lượt
```

123ms/lượt so với `streams` = 135ms — khớp gần như hoàn toàn.

> ⛔ **Nhu cầu CPU trung bình đo được chỉ ~106m, nên `150m` "trông đủ".** Thứ giết nó là **đột biến**: dựng một phiên terminal là bắt tay TLS + dựng stream + bơm byte đầu, còn quota CFS cắt theo **từng cửa sổ 100ms** chứ không theo trung bình. Đặt trần theo mức trung bình quan sát được là một cái bẫy, và triệu chứng của nó không phải OOM hay lỗi — nó là *"terminal lâu mở"*, không log nào nói vì sao. Chỉ `cpu.stat` trên host nói.

### `pty` đứng yên — vế làm phép đo này có nghĩa

`pty` = **281 / 315 / 279 ms** qua ba nấc trần CPU. Nếu nâng CPU mà mọi chặng cùng co lại thì con số đã phải bị nghi là hiện vật của dụng cụ đo. Nó không co: **chỉ những chặng CPU-bound co, còn `pty` đứng yên.** Nhờ đúng vế đó mà phần co được quy về throttling, và `pty` quy được về hạ tầng — thay vì cả hai cùng là phỏng đoán.

**Còn một phần chưa quy được:** `streams` vẫn 66ms ở 500m với throttling ≈ 0. Nó nhạy với CPU (135→69ms) nên phần lớn là tranh CPU, nhưng phần dư chưa có lời giải. **Không quy bừa** — cần dụng cụ mịn hơn thứ chặng này dựng.

---

## 3. Dụng cụ tự nhận sai

Hai hook, cả hai **đọc từ mã client-go v0.34.9** chứ không suy đoán — vế này quan trọng vì một hook không chạy sẽ cho ra chặng `0s` trông y hệt *"chặng đó rất nhanh"*:

- **`upgrade` ← `rest.Config.WrapTransport`.** `transport.HTTPWrappersForConfig` áp nó ở [`round_trippers.go:42-44`](https://github.com/kubernetes/client-go/blob/v0.34.9/transport/round_trippers.go#L42-L44), và `websocket.RoundTripperFor` gọi đúng hàm đó. ⛔ **`rest.Config.Dial` thì KHÔNG được honor** — `transport/websocket.RoundTripper` chỉ có `TLSConfig`/`Proxier`/`Conn`. Nên `upgrade` là số **gộp** TCP+TLS+HTTP101; ghi ra để người sau không đi tìm một hook không tồn tại.
- **`streams` ← lượt `Read` đầu tiên trên pipe stdin.** `streamProtocolV4.stream` chạy `createStreams` → `copyStdin` ([`v4.go:70`](https://github.com/kubernetes/client-go/blob/v0.34.9/tools/remotecommand/v4.go#L70)) **trước** `copyStdout` (`:73`). Đặt mốc lúc **vào** `Read`, không phải lúc trả về: nguồn là `io.Pipe` nên đo lúc trả về là đo thời gian người dùng gõ phím đầu tiên.

Ba cổng khiến phép đo tự đỏ thay vì bịa số:

1. **`Σ năm chặng` vs mẫu tổng, trần ±5%.** Đo được **lệch 0.00%** ở mọi lượt — đây là đẳng thức toán học (mỗi lượt attach, năm chặng cộng lại bằng đúng tổng của lượt đó), nên lệch nghĩa là dụng cụ sai.
2. **`count` từng chặng phải bằng `count` tổng.** Lệch ⇒ một hook không chạy trên một số lượt.
3. **Lượt không phân bổ được thì LOẠI HẲN**, không kẹp hiệu số âm về 0, và đếm riêng theo hai nhãn lý do.

> ⛔ **`copyStdin` SPAWN goroutine** ([`v2.go:95`](https://github.com/kubernetes/client-go/blob/v0.34.9/tools/remotecommand/v2.go#L95)) nên thứ tự `streams`↔`ready` **không được ngôn ngữ đảm bảo**. Kẹp về 0 thì một lượt lệch thứ tự vẫn cho ra bảng "hợp lý" trong khi nó đang bịa — và bịa đúng những lượt bất thường mà ta cần nhìn thấy nhất.

**Phân bổ dùng TRUNG BÌNH chứ không p95**, và đây là điểm dễ sai nhất: phân vị **không cộng được** (lượt nằm ở p95 của `pty` không nhất thiết là lượt nằm ở p95 của tổng). Cái cộng được là `_sum`. p95 từng chặng vẫn in kèm, chỉ để thấy chặng nào có đuôi dài.

---

## 4. Bảng ngưỡng chốt-trước có một lỗ — và đó là bài học

P1 chốt bốn hàng **trước khi đo**, đúng kỷ luật mà món nợ web-500 đã ghi thành luật. Kết quả: hàng `pty ≥ 40%` trúng (61.6–78.7%).

Nhưng **cả bốn hàng đều hỏi *"chặng nào chiếm phần lớn"***, tức đều ngầm định nguyên nhân nằm **trong** một chặng. Throttling không nằm trong chặng nào — nó **giãn mọi chặng CPU-bound cùng lúc**, và không hàng nào bắt được. Bảng cũng không có hàng cho `streams` (29.6%).

**Việc chốt ngưỡng trước khi đo vẫn đúng và vẫn nên làm.** Cái sai là tin rằng bốn hàng đã vét hết không gian nguyên nhân. Một bảng chốt-trước nên có thêm một hàng *"không hàng nào ở trên trúng"* dẫn tới *dừng lại và điều tra*, thay vì ép kết quả vào hàng gần đúng nhất.

---

## 5. Hai thứ đã land

### 5.1 Trần CPU gateway `150m`/`250m` → `500m`

`values.yaml` (mặc định) và `values-selfhost.yaml` (lab). Chọn 500m chứ không 2000m: 2000m nhanh hơn 53ms, nhưng **36ms trong phần chênh đó nằm ở `pty`** — nhiễu hạ tầng, không quy được cho trần CPU. 500m cho ~5× biên trên nhu cầu trung bình ~106m và đưa throttle về 0.4%.

### 5.2 Ô AC tách hai vế

| vế | đại lượng | ngưỡng | đo được |
|---|---|---|---|
| **gác** | `dlp_gateway_attach_controlled_seconds` (tổng − `pty`) | p95 < **150ms** | **p95 0.1250s · TB 0.0758s ⇒ ĐẠT** |
| **ghi số** | tổng 101 → `ready` | không gác | TB **0.356s**, p95 ∈ (0.5, 0.75], 44–45/50 ≤ 0.5s |

> ⛔ **Vì sao ngưỡng 500ms trên TỔNG là một ô AC MÙ, không chỉ là một ô quá chặt.** `pty` một mình đã 280ms và không đổi theo bất cứ thứ gì gateway làm. Ô gác trên tổng vì thế đỏ khi **hạ tầng** chậm đi và **không bao giờ** đỏ khi **gateway** chậm đi — mù với đúng chế độ hỏng nó tồn tại để bắt. Vế mới đỏ được: 150ms cho gần 2× biên trên 81ms đo được, đủ chặt để bắt một round-trip đồng bộ lỡ thêm vào đường attach.

`0.15` được đặt làm **một mốc bucket** có chủ ý — p95 của histogram Prometheus đọc ra là chặn trên của bucket, nên không có mốc đó thì *"p95 < 150ms"* không bao giờ khẳng định được.

**Người dùng thấy gì trong 280ms `pty`:** WS đã 101 nhưng chưa `ready`, nên FE giữ trạng thái "đang nối" — không phải màn hình trắng, và không ký tự nào bị mất (`pendingStdin` giữ byte tới sớm). Rút nó xuống đòi giữ sẵn exec stream hoặc pre-warm `tmux` trong pod ấm: **P3**.

---

## 6. Ba thứ đáng nhớ cho chặng sau

1. **Bucket của `dlp_gateway_attach_duration_seconds` nhảy 0.5 → 0.75.** Bản vá trần CPU cải thiện trung bình **−22%** nhưng p95 **không đổi bucket** — cây thước không có vạch ở đúng chỗ cần đọc. Ai muốn theo dõi p95 tổng phải thêm mốc trước.
2. **`session-probe` mặc định lấy `Origin` = `-web`**, trong khi `GATEWAY_ALLOWED_ORIGINS=http://localhost:8080` ⇒ `403 ORIGIN_NOT_ALLOWED`. Luôn truyền `-origin` tường minh.
3. **Mỗi lượt probe tiêu một khe quota** (session TTL 1h), nên ba lượt liên tiếp là chạm trần 4 pod. Dọn bằng đường của chính hệ thống — `EXPIRE session:{id} 1` ⇒ reaper tầng 1 bắt keyspace expiry ⇒ xoá pod + key — thay vì mổ tay. Đo được: 4 pod dọn sạch và warm-pool dựng lại trong ~45s.

---

## 7. Cổng đã qua

- **384 PASS / 0 SKIP / 0 FAIL** (Redis + Postgres thật). Nền 1.G-1: 369 ⇒ **+15 ca mới**.
- `-race -count=3` trên `internal/podexec` + `internal/wsroute`: **0 DATA RACE** — quan trọng vì `attachTimer` bị ghi từ **ba** goroutine.
- `GOOS=linux go vet` + `gofmt`: sạch cả ba module.
- **Kiểm đột biến 4 phép, mỗi phép đỏ đúng ca của nó** — [`mutation-log.txt`](harness/2026-08-13-1g4-attach-attribution/mutation-log.txt). Phép thứ 4 **lúc đầu xanh**, và đó là phát hiện: guard `IsZero()` khi ấy là **mã không thể đỏ**. Tách hai nhãn `reason` vừa chữa nó vừa phân biệt được hai chẩn đoán ở runtime.

> ⚠ **Một ca đỏ chập chờn ở lượt chạy đầu** (orchestrator, 1/12 lượt, không tái hiện qua 10 lượt săn). Không đụng module đó ở chặng này. Cùng ca mà 1.G-1 đã ghi.
> **Và tôi dẫm lại đúng lỗi 1.G-1 đã ghi:** script tổng kết chỉ *đếm*, nên tên ca đỏ bị vứt. Đã land [`scripts/go-test-summary.sh`](../../../scripts/go-test-summary.sh) luôn in tên ca đỏ, và **từ chối chạy** khi thiếu `REDIS_URL`/`DATABASE_URL` (thiếu thì 81 ca tự SKIP và suite xanh mà không kiểm gì).

## 8. Còn nợ của P1 sau chặng này

**M8** (hai ô FE: tắt hardware acceleration → fallback DOM; StrictMode 3× → 1 WebSocket) — cần harness Playwright chưa tồn tại trong repo. **Đây là ô AC cuối cùng của phase.**
