# 1.C-3 (G7–G10) — chứng minh trên cluster: gia hạn, `expiring`, và mã đóng khi hết giờ

**Ngày:** 2026-08-11 · **Chặng:** phase-1 §1.C-3 · **Cụm:** kubeadm v1.34.10 một node, release `platform`
**Công cụ:** [`services/terminal-gateway/cmd/verify-heartbeat`](../../../services/terminal-gateway/cmd/verify-heartbeat/) — nằm trong repo để đo lại được, cùng lý lẽ với `cmd/bench-claim`.

## Kết luận

**PASS**, nhưng chỉ ở lượt chạy THỨ HAI. Lượt đầu **đỏ**, và nó đỏ vì một lỗi thật mà **21 test đơn vị đều không thấy** — đó là toàn bộ lý do phép đo này tồn tại.

## Vì sao cần đo trên cluster khi đã có test đơn vị

Test đơn vị của G7 chạy với một `Extender` giả. Chúng chứng minh cầu terminal **phản ứng** đúng với từng câu trả lời, nhưng không chứng minh orchestrator thật **sinh ra** những câu trả lời đó. Ba câu chỉ cluster trả lời được:

1. `ExtendSession` thật có đẩy `expiresAt` trong Redis không?
2. Control `expiring` có tới được một client WS thật, mang đúng mốc mới không?
3. Nhánh trần cứng có cho ra `4409` không?

Câu (3) là câu quan trọng nhất, và là câu đã đỏ.

## Cách nén thời gian

Hai đồng hồ production (`SESSION_TTL=1h`, `HARD_CAP=2h`) cần ~1 giờ mới chạm được nhánh cần đo. Nén lại cho vừa một lượt chạy, rồi **trả về nguyên trạng** sau khi đo:

```bash
helm upgrade platform ./infra/helm/platform --reset-then-reuse-values \
  --set orchestrator.env.sessionTtl=90s \
  --set orchestrator.env.extendDefault=120s \
  --set orchestrator.env.hardCap=300s --wait
```

Nén **tham số**, không nén **đường đi**: vẫn là `apps/web` thật phát cookie, gateway thật verify, orchestrator thật chạy `extend.lua`, pod Sysbox thật.

## Lượt 1 — ĐỎ. `4409` không bao giờ tới được người dùng

```
   [    1s] ready,    expiresAt=05:27:32Z
   [  1m1s] expiring, expiresAt=05:29:03Z hardCapReached=false
   [  2m1s] expiring, expiresAt=05:30:03Z hardCapReached=false
   [  3m1s] expiring, expiresAt=05:31:02Z hardCapReached=true
   [  5m0s] error,    code=SESSION_GONE
4. kết nối đóng sau 5m0s: close code = 4404
FAIL: close code = 4404, muốn 4409
```

Ba control `expiring` đúng như thiết kế — hạn dịch `05:27:32 → 05:29:03 → 05:30:03`, rồi dừng ở `05:31:02` = `createdAt + HARD_CAP` kèm cờ `hardCapReached`. Vế G7 chính chạy đúng.

Nhưng mã đóng là `4404` "phiên đã kết thúc". **Người vừa dùng hết thời lượng hợp lệ được báo rằng phiên của họ bị thu hồi.**

### Nguyên nhân — nằm ở `extend.lua`, không ở gateway

Script đặt **TTL của `session:{id}` đúng bằng `expiresAt`**:

```lua
local ttl = newExpiresAt - now
redis.call('EXPIRE', KEYS[1], ttl)
```

Điều kiện duy nhất để nhánh `extend: hardcap:` bắn là `newExpiresAt <= now` — nhưng tới thời điểm đó hash **đã hết TTL và biến mất**, nên lượt gia hạn kế tiếp nhận "không tồn tại". Nhánh `hardcap:` của script, và nhánh `causeHardCap` trong `extend.classify` mà nó phục vụ, đều là **mã gần như chết**.

### Vì sao test đơn vị mù

Ca `TestQuaTranCungThiDong4409ChuKhongPhai4404` cho `Extender` giả trả thẳng `ExtendHardCap` — một giá trị mà production **không bao giờ sinh ra**. Test đo đúng thứ nó nói, nhưng thứ đó không xảy ra ngoài đời.

> Đây là lần **thứ ba** cùng một họ lỗi trong phase này: *một đường không ai đi thì không ai gác*. 1.E-1 — job CI chỉ chạy trên `main` nên `Dockerfile` không có cổng review. G12 — `createCaller` bỏ qua tầng serialize nên 64 test mù với lỗi bigint. Ở đây — test double sinh ra một outcome mà thực tế không sinh. Cả ba đều xanh cho tới khi có người chạy thật.

### Bản vá — dùng thứ gateway đã biết mà không dùng

Gateway đã phát `expiring{hardCapReached:true}` hai phút trước đó. Nhớ lấy một bit (`connState.hardCapSeen`) là đủ: `ExtendGone` sau khi đã chạm trần ⇒ **hết giờ** (`4409`), chưa chạm trần ⇒ **bị thu hồi** (`4404`).

Bit đặt trên `connState` chứ không phải biến cục bộ của vòng heartbeat, vì **hai goroutine đua nhau tới đường đóng**. Cả hai gọi chung `closeTerminal`.

## Lượt 2 — PASS

```
   [    1s] ready,    expiresAt=05:40:06Z
   [  1m1s] expiring, expiresAt=05:41:37Z hardCapReached=false
   [  2m1s] expiring, expiresAt=05:42:37Z hardCapReached=false
   [  3m1s] expiring, expiresAt=05:43:36Z hardCapReached=true
   [  5m0s] error,    code=HARD_CAP_REACHED
4. kết nối đóng sau 5m0s: close code = 4409
PASS
```

Chuỗi đầy đủ: sign-up Better Auth → tRPC `session.create` → `Set-Cookie: dlp_sandbox` → WS `/ws/session/{id}` → `ready` → gõ phím đều đặn → hạn **dịch thật** 90s → 91s → 60s → chạm trần → đóng `4409`.

### Metric xác nhận một điều mà log không nói: **reaper thắng cuộc đua**

```
dlp_gateway_extend_total{result="ok"}       2
dlp_gateway_extend_total{result="hard_cap"} 2
dlp_gateway_extend_total{result="gone"}     0      ← ĐÁNG CHÚ Ý
dlp_gateway_ws_bytes_total{direction="in"}  59
dlp_gateway_ws_bytes_total{direction="out"} 24531
dlp_gateway_ws_connections_total{result="accepted",reason="ok"} 1
```

`gone = 0` nghĩa là **lượt gia hạn thứ 5 chưa từng chạy**. Kết nối đóng qua đường `finish` — reaper xoá pod, stream đứt — chứ không qua heartbeat. Nói cách khác: **cuộc đua giữa hai goroutine là có thật, và lượt đo này đi vào nhánh CÒN LẠI** so với nhánh mà bản vá nhắm tới ban đầu.

Kết quả vẫn `4409` vì cả hai nhánh dùng chung `closeTerminal`. Nếu chỉ vá phía heartbeat — điều tự nhiên phải làm khi đọc log lượt 1 — thì lượt 2 đã trả `4404` trở lại và trông y hệt một bản vá không ăn. Đây là bằng chứng **quan sát được** cho lựa chọn đặt `hardCapSeen` lên `connState`, thay vì một lập luận.

## Số đo phụ

| Thứ | Giá trị | Ghi chú |
|---|---|---|
| `dlp_gateway_attach_duration_seconds` | **0.708s** (1 mẫu nguội) | 101 → `ready`. **Vượt ngưỡng 500ms** của AC. Một mẫu chưa nói được p95; và câu chữ AC hiện mô tả một khoảng khác với metric nó trỏ tới — xem ghi chú ở AC. |
| `dlp_gateway_extend_revision_retry_total` | 0 | Không có tranh chấp revision trong lượt đo — đúng kỳ vọng với một phiên đơn độc. |
| Series `reason=*` khởi tạo sẵn | có | `SUBPROTOCOL_REQUIRED=1` (từ một lượt `curl` health-check), mọi mã khác hiện `0` chứ không vắng mặt. Đây là vế chống "no-data trông như mọi thứ đều ổn". |

## Kiểm đột biến — bộ test có gác gì không

Một ca xanh chỉ chứng minh mã hiện tại đi qua nó. Tám đột biến dưới đây kiểm điều ngược lại: **bỏ đúng một dòng thì ca nào đỏ?**

| Đột biến | Ca đỏ |
|---|---|
| Bỏ `st.hardCapSeen.Store(true)` trong `sendExpiring` | `TestChamTranRoiSessionBienMatThiDong4409ChuKhongPhai4404` (trả về 4404) — tái hiện đúng lỗi cluster đã bắt |
| Cho `closeTerminal` luôn trả 4409 | `TestChuaChamTranMaBienMatThiVan4404`. Cặp hai ca khoá cả hai chiều nên không ca nào là tautology |
| Gộp ping + extend về một `select` (bản đầu) | `TestGoPhimThiCoGiaHan` + 3 ca — nhánh extend không bao giờ chạy. Chính đột biến này lôi ra việc `c.Ping` chặn |
| Đặt `cancel()` trước `finish()` (bản đầu) | **4 test CÓ SẴN của 1.C-2** (close code `-1`, mất control `exit`) |
| Gửi `expected_revision: 0` thay vì revision đọc từ hash | `TestGiaHanThanhCong`. Không có ca này thì optimistic lock bị vô hiệu hoá lặng lẽ (`0` = "bỏ qua kiểm" theo proto) |
| Cho `classify` luôn trả `causeRevision` | `TestQuaTranCungThiHardCapChuKhongPhaiGone` |
| Bỏ nhánh `sess.CreatedAt == 0` của `classify` | `TestHashThieuCreatedAtThiLoiChuKhongPhaiHardCap` |
| Test double KHÔNG rút stdin | 2 ca rate-limit/heartbeat. Đột biến của **test double**, không phải mã production — nó lôi ra rằng `io.Pipe` đồng bộ có thể biến mọi ca "gõ liên tục" thành "gõ một lần" trong im lặng |

## Trạng thái lab sau khi đo

- Hai đồng hồ **đã trả về** `SESSION_TTL=1h` / `EXTEND_DEFAULT=300s` / `HARD_CAP=2h` (xác nhận bằng `kubectl get deploy ... env`), revision 19.
- **Nợ:** gateway đang chạy tag `dev-1c3b` (dựng từ nhánh, side-load tay). Đóng ngay sau khi PR merge — **side-load TRƯỚC, `helm upgrade` SAU**.

## Liên quan

- [`phase-1.md`](../phase-1.md) §1.C-3 — task, bốn phát hiện, và chương `1.C-4` (mTLS) tách ra từ đây
- [`docs/ws-terminal-protocol.md`](../../../docs/ws-terminal-protocol.md) §5, §8 — ngữ nghĩa `expiring` và luật ping/pong không tính là traffic
- [`2026-08-11-verify-g12-sandbox-cookie.md`](2026-08-11-verify-g12-sandbox-cookie.md) — chặng trước, nơi đường phát cookie được chứng minh
