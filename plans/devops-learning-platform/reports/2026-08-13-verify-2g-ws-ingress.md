# P2 / 2.G — Ingress Traefik + đóng ô AC terminal WS

**Ngày:** 2026-08-13 · **Phạm vi:** ô AC cuối của P2 ("terminal ở khoang phải nối
được và gõ được", gồm vế `{{exec}}`) + smoke test toàn luồng của 2.E.
**Deploy đo được:** web `sha-fda8b58`, gateway `sha-80b4b6c`, traefik `v3.7.10`
(chart 41.2.0), helm revision 52.

---

## 1. Ô AC này không thiếu code — nó thiếu một tầng hạ tầng

`buildSessionWsUrl` dựng URL từ `globalThis.location.origin`
(`packages/terminal/src/connection.ts`). Trình duyệt vì thế phải thấy `/` (web) và
`/ws` (gateway) trên **một** origin. Cụm lab chưa có ingress controller nào và
`kubectl port-forward` chỉ trỏ tới `platform-web`, nên trước lượt này không có
cách nào để trình duyệt chạm tới `/ws` — bản 2.D chỉ đo được tới mức "khoang
render đúng, `TerminalSurface` nhận đủ props".

Ingress gộp origin **đã tồn tại từ 1.B0.4** (`templates/ingress.yaml`), tắt mặc
định kèm chú thích nói rõ vì sao: bật cờ trên cụm không có controller thì object
Ingress được tạo, không báo lỗi, và không định tuyến gì cả.

**Chọn Traefik, không phải ingress-nginx:** phase-3 §5 (session-affinity cho WS)
và §6 (middleware rate-limit + body-size ở biên) đã chốt Traefik. Cài nginx hôm
nay nghĩa là thay controller hai lần và viết lại phần đó của P3.

### 1.1 Hai quyết định trong script cài, cả hai đều chống một chế độ hỏng IM LẶNG

| Quyết định | Nếu làm cách "mặc định" thì hỏng thế nào |
|---|---|
| `service.type=ClusterIP` (mặc định chart là LoadBalancer) | kubeadm 1-node không có cloud provider ⇒ `EXTERNAL-IP` `<pending>` **vĩnh viễn**, không lỗi, không log |
| **KHÔNG** đặt trần CPU (có request, có trần RAM) | 1.G-4 đo trên chính cụm này: trần 150m làm gateway bị throttle 38.7% chu kỳ CFS và mất **123ms mỗi lượt attach**; triệu chứng chỉ là "terminal lâu mở", không log nào nói. Traefik nằm trên cùng đường đó. OOM thì ồn ào và chẩn được, throttle thì không |

### 1.2 Đường vào là `localhost`, và đó không phải sự lười

Cookie `dlp_sandbox` mang `Secure` **vô điều kiện**
(`apps/web/src/server/auth/sandbox-cookie.ts:40`) — và chính file đó đã ghi sẵn
bẫy: trình duyệt chấp nhận cookie `Secure` trên HTTP khi host là `localhost`
(secure context), nhưng với `http://192.168.x.x` thì `Set-Cookie` bị **bỏ qua
trong im lặng** và mọi handshake trả 401 mà không nói gì.

Nên NodePort theo IP node là một cái bẫy có sẵn hồ sơ. Đường vào:
`kubectl port-forward -n traefik svc/traefik 8080:80` → `http://localhost:8080`,
đúng bằng `BETTER_AUTH_URL`/`CORS_ALLOWED_ORIGINS` đang cấu hình nên không phải
đổi gì. Entry point thật + TLS là việc của P3.

### 1.3 Diff dry-run báo chứng chỉ mTLS bị sinh lại — đó là ảo giác

`helm upgrade --dry-run` cho thấy toàn bộ CA + cert mTLS đổi và ba checksum pod
đổi theo (tức rolling restart cả web/gateway/orchestrator). **Không phải thay đổi
thật:** `templates/mtls-secret.yaml:18` đã ghi rằng `lookup` LUÔN trả rỗng khi
`--dry-run`, nên nhánh "giữ cert cũ" không chạy được ở chế độ đó. Chạy thật: 0
pod restart, đúng một object được thêm là Ingress.

Ghi lại vì phản xạ đúng khi thấy diff đó là **hoãn lại và đi đọc template**, chứ
không phải "cứ chạy xem sao" — và cũng không phải bỏ luôn lượt upgrade.

---

## 2. Bằng chứng ô AC (trình duyệt thật, Playwright/Chromium)

| Vế | Số đo |
|---|---|
| định tuyến | `/` → 200 (web) · `/lessons` → 307 · `/ws/session/x` → **400 `SUBPROTOCOL_REQUIRED`** — thân lỗi **của gateway** |
| **đối chứng âm** | bỏ đúng luật `/ws`: `/` vẫn 200, `/ws` → **404 kèm header CSP của web** (rơi xuống Next). Loại trừ thêm khả năng Next tự proxy: `next.config.ts` không có `rewrites`, không middleware nào bắt `/ws` |
| WS nối được | bấm "Bắt đầu" → "Sandbox sẵn sàng"; khoang phải hiện prompt starship do PTY trong pod vẽ |
| **gõ được** | `echo NCKH-GO-DUOC-$(id -u)-$(hostname)` → `NCKH-GO-DUOC-0-sandbox-cffe70db7e34` — uid 0 và **đúng tên pod sandbox** |
| **`{{exec}}`** | bấm "Chạy" → PTY nhận nguyên văn `curl -s --max-time 3 http://169.254.169.254/ ; echo "exit=$?"` → `exit=28` sau 3.407s |
| vòng đầy đủ (2.E) | bấm "Kiểm tra" → **Đạt**, thông báo **của bài**; tiến độ lưu |

Vế `{{exec}}` còn cho thêm một thứ ngoài dự tính: NetworkPolicy chặn metadata
**ngay trong terminal của người học**, trước đây mới chỉ đo ở đường verify.

---

## 3. Hai lỗi mà mọi cổng offline đều xanh — và một vòng chẩn đoán SAI

Lint 9/9, typecheck 10/10, 398 ca test, `next build` — tất cả xanh trong khi cả
hai lỗi dưới đây đang sống. Cả hai chỉ lộ ra vì tôi làm **đối chứng âm**, tức là
vì tôi cố tình phá một thứ đang chạy đúng.

### 3.1 Vòng 1 — sửa đúng một lỗ hổng có thật, sai nguyên nhân

Với luật `/ws` bị bỏ, trang bài học kẹt ở "Đang kết nối…" **37 giây** rồi vẫn
thế: 0 lỗi UI, 0 dòng console.

Chẩn đoán đầu: `session-machine` CÓ đặt cờ `needsReasonLookup` cho ca "1006 khi
chưa từng ready", nhưng cờ đó chỉ có **một** người tiêu thụ là `/session` của P1;
`use-lesson-session.ts` của 2.D không đọc nó. Cái phanh mà 1.F thiết kế ra không
tồn tại trên trang bài học — trớ trêu là docstring của chính file đó nêu ca này
làm **lý do** dùng lại máy trạng thái.

Đã sửa: tách phần quyết định thành hàm thuần (`lib/session-reason.ts`, 8 ca test
— `apps/web` không có jsdom nên logic nằm trong `useEffect` sẽ chỉ kiểm chứng
được bằng trình duyệt), hook dùng chung cho cả hai trang, và
`lessons.sessionStatus` — **không** dùng `session.get` của P1 dù nó trả đúng thứ
cần, vì input của nó có `userId`, đúng hình dạng mà 2.B đã cố bỏ.

**Deploy xong, đo lại: triệu chứng còn nguyên.**

### 3.2 Vòng 2 — nguyên nhân thật: handshake TREO

Hai phép đo, và cả hai đều ở tầng vận chuyển chứ không phải trong mã nguồn:

```
đếm WebSocket trong trình duyệt (patch window.WebSocket):
  1 socket mở tới ws://localhost:8080/ws/session/…
  25s sau: KHÔNG có sự kiện close nào     ← không phải "close mà không ai xử lý"

request upgrade thật bằng curl:
  http_code=000   time_total=20.009       ← treo trọn timeout, server không trả gì
```

Handshake không thành công mà cũng không thất bại. Không có `close` thì máy trạng
thái không nhận sự kiện nào, nên **mọi** phanh phía sau — backoff, hỏi lý do thật
— đều không có gì để kích hoạt. Vá tầng dưới mà thiếu sự kiện tầng trên thì không
sửa được gì.

Sửa: `openConnection` đặt trần **10s** cho lượt handshake; quá trần mà chưa `open`
⇒ báo `1006` cho máy trạng thái rồi đóng socket. Chọn 1006 vì đó đúng là thứ
client quan sát được, và nó chảy vào nhánh đã có sẵn. `clearTimeout` ở **cả ba**
lối ra (open / close / close chủ động) — thiếu ở nhánh close thì một phiên đóng
bằng 4401 bị bồi thêm một 1006 và bộ đếm backoff nhảy hai bậc cho một lần rớt;
có ca test riêng cho đúng chuyện đó, kèm đối chứng "mở kịp thì trần không bắn".

Ca này không phải giả định phòng lab: bất kỳ proxy/LB nào nuốt mất upgrade — sai
luật ingress, middleware chặn, gateway treo — đều cho đúng hình dạng này.

### 3.3 Bài học tôi muốn ghi lại

**"UI đứng im" có ít nhất hai nguyên nhân khác hẳn nhau** — sự kiện đến mà không
ai xử lý, và sự kiện không bao giờ đến — và chúng cho **cùng một** triệu chứng
trên màn hình. Đọc mã nguồn cho ra một câu chuyện hợp lý cho cả hai, nên đọc mã
không phân biệt được. Chỉ phép đếm ở tầng vận chuyển mới phân biệt được.

Và một nửa nữa suýt lọt: sửa hook xong tôi phát hiện `lesson-client.tsx` không
render `state.message` ở đâu cả — nhãn phase nói "Đang kết nối…" còn phase `error`
nói đúng một chữ "Lỗi". Sửa trạng thái mà quên chỗ hiển thị thì bản vá xanh ở mọi
cổng và vô hình trên màn hình.

### 3.4 Đo lại sau khi sửa (cùng đối chứng âm)

```
header:      "Mất kết nối — đang thử lại…"
role=status: "Chưa mở được kết nối tới phiên — đang thử lại."
network:     4 × GET /api/trpc/lessons.sessionStatus → 200
```

⇒ có `close` (do trần sinh ra) → có backoff → có hỏi lý do → **có chữ trên màn
hình**. Khôi phục luật `/ws`: "Sandbox sẵn sàng", gõ được, trả về
`XAC-NHAN-CUOI-sandbox-9cf97d850f18-rev52` — không hồi quy.

---

## 4. Cổng

```
pnpm lint       9/9 ✓
pnpm typecheck  10/10 ✓ (gồm next build)
pnpm test       398 ca: web 168 · terminal 94 · scenario 84 · ui 29 · shared-types 23
```

Kiểm luôn rằng test MỚI thật sự chạy chứ không phải skip sạch:
`pnpm --filter web test session-reason` → 8 passed.

---

## 5. Còn hở — nói rõ chứ không giấu

| Món | Trạng thái | Ghi chú |
|---|---|---|
| Gateway không log lượt thành công | ⬜ | Attach WS và `POST /exec/session/{id}` đều đã xảy ra mà không để lại dòng log nào; đường nóng không có dấu vết kiểm toán → P3 §7 |
| Nhãn tiến độ nói sai | ⬜ | Đạt đúng bước cuối làm thanh nhảy `0/4 → 4/4`. `stepIndex` là mốc nước cao (task 12 có lý do), nhưng nhãn "4/4 bước đã đạt" mô tả sai thứ nó hiển thị |
| Entry point thật + TLS | ⬜ | Hôm nay vào bằng port-forward tới Traefik, vì cookie `Secure` chỉ được chấp nhận trên `localhost` khi chạy HTTP → P3 |
| Bài vendored chạy trọn vẹn | ⬜ | Không đổi so với 2.D: `ckad` cần kubeadm-in-pod, `loxilb` cần egress |
| Trần 4 pod sandbox đồng thời | ⚠ không phải giới hạn sản phẩm | 2100m quota ÷ 500m mỗi pod (LimitRange). Là trần của VM lab 8 vCPU/11.65Gi, chỉnh bằng `--set`. Con số đồng thời thật phải đo ở P3 (k6, cluster-autoscaler) — đừng trích số 4 ra ngoài như một đặc tính của hệ thống |

**Một thứ tôi cố ý KHÔNG làm:** bật access log của Traefik để có dấu vết dương
cho lượt WS. Đối chứng âm ở §2 đã chứng minh đúng điều cần chứng minh, và
observability là một chặng có chủ sở hữu rõ ràng (P3 §7) chứ không phải một dòng
`--set` thêm vào lúc đang đo thứ khác.
