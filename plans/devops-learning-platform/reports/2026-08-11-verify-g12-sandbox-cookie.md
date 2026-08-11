# G12 — sandbox token + cookie `dlp_sandbox`: bằng chứng trên cluster thật

**Ngày:** 2026-08-11 · **Chặng:** phase-1 §1.C G12 · **Cụm:** lab 1-node (`debian-sandbox`, k8s v1.34.10, Sysbox)

## Điều chặng này chứng minh — và vì sao nó khác 1.C-2

1.C-2 đã gõ được lệnh thật qua WS, nhưng **với một bên phát token giả**: chưa ai mint được cookie `dlp_sandbox`, nên prover tự sinh cặp Ed25519, tự phục vụ JWKS, và gateway được `--set gateway.env.jwksUrl` trỏ vào đó. Món nợ ghi ở phase-1 §1.C-2.

Chặng này đóng đúng vế đó. Gateway giữ **nguyên cấu hình kế thừa** — `jwksUrl=''` ⇒ `http://platform-web:3000/api/auth/jwks`, `tokenIssuer=''` ⇒ `betterAuthUrl` — không `--set` nào cho riêng phép đo. Bên phát token là `apps/web` thật, chạy trong cluster.

## Kết quả: 18/18

Chuỗi đo (một script, chạy từ host lab qua `kubectl port-forward`):

| # | Phép kiểm | Kết quả |
|---|---|---|
| 1–2 | `POST /api/auth/sign-up/email` → user thật + cookie phiên Better Auth | 200 |
| 3 | `POST /api/trpc/session.create` (đường code G12) | 200 |
| 4 | Response mang **đúng một** `Set-Cookie: dlp_sandbox` | ✅ |
| 5–9 | `Path=/ws` · `HttpOnly` · `Secure` · `SameSite=Strict` · **không** `Domain` | ✅ contract §2 |
| 10–13 | `aud=gateway` · `sid` = session vừa tạo · `sub` = user vừa đăng ký · `alg=EdDSA` | ✅ |
| 14 | Gửi đúng cookie đó vào `/ws/session/{id}` → **101 Switching Protocols** | ✅ |
| 15–16 | `Sec-WebSocket-Accept` đúng · echo `dlp.terminal.v1` | ✅ |
| 17 | Control `ready` — `podName=sandbox-8aafb3e05db3`, `maxFrameBytes=32768` | ✅ |
| 18 | Gõ `echo G12-BANG-CHUNG-<nonce>` → pod trả lại marker | ✅ |

**Vì sao #18 đòi marker xuất hiện ĐÚNG 2 lần:** lần thứ nhất là tiếng vọng bàn phím của PTY (tồn tại kể cả khi shell chết); chỉ lần thứ hai — dòng output — mới chứng minh shell **chạy** lệnh. Một phép kiểm `marker in output` trần sẽ xanh trên một PTY hỏng.

`session=18f04fecdc663bc5843c7b1e57c8148f` · token chỉ ghi `sha256[:12]=1a47f1d56a60`, `kid=hwAHbjVf…` — không ghi nguyên văn vào báo cáo.

## Lỗi CÓ SẴN mà phép đo này lôi ra — nó chặn G12 hoàn toàn

**Lượt chạy đầu tiên FAIL ở bước 3: `HTTP 500 — "Do not know how to serialize a BigInt"`.**

`session.*` trả thẳng message proto ra tRPC. `Session` có **ba field `bigint`**: `expiresAt.seconds`, `createdAt.seconds`, `revision: int64`. `JSON.stringify` **ném** trên bigint chứ không bỏ qua. Và lỗi xảy ra **SAU khi orchestrator đã claim pod** ⇒ người dùng mất một pod khỏi trần quota 4 rồi nhận về một 500 không nói gì.

Lỗi này có từ P0. **64 test cũ mù hoàn toàn** vì tất cả gọi qua `appRouter.createCaller`, trả object JS thẳng — *không có bước serialize nào*. Bằng chứng 1.C-2 gọi `CreateSession` bằng gRPC, cũng không qua tRPC. **Đường HTTP của `session.*` chưa từng chạy một lần nào** cho tới hôm nay.

> **Bài học chung:** cùng họ với "job `images` chỉ chạy trên `main` nên `Dockerfile` không có cổng review" (1.E-1) — *một đường không ai đi thì không ai gác*. Điểm cay hơn ở đây: chính **công cụ test** (`createCaller`, chọn vì nhanh và không cần HTTP) là thứ bỏ qua đúng cái tầng bị hỏng. Test chạy nhanh hơn bằng cách cắt bỏ tầng duy nhất có lỗi.

**Vá:** `toJsonSession` trong `session.ts` — `Timestamp` → chuỗi ISO-8601, `revision` → number — áp cho **cả 5** procedure. Lợi ích kèm: `$typeName` và field nội bộ của connect-es không còn rò ra trình duyệt. Test guard quét **toàn cây** trả về tìm bigint sót, nên field bigint thêm về sau mà quên map cũng đỏ.

## Kiểm đột biến — 5 đột biến, mỗi cái làm ĐÚNG các ca của nó đỏ

| Đột biến | Ca đỏ |
|---|---|
| bỏ `exp` khỏi payload `signJWT` | `exp = expiresAt … CHÍNH XÁC` (1) |
| vô hiệu guard `ctx.user.id !== ownerUserId` | `ADMIN tạo session HỘ user khác` (1) |
| `GATEWAY_AUD = 'orchestrator'` | `aud = "gateway", và KHÁC aud của access token` (1) |
| bỏ `Secure` khỏi cookie | `cookie mang đủ 5 thuộc tính` (1) |
| trả thẳng message proto (bỏ `toJsonSession`) | 3 ca serialize |

Đột biến làm **0** ca đỏ nghĩa là ca đó tautology; làm **quá nhiều** ca đỏ nghĩa là chúng chồng lấn và mất khả năng định vị. Bốn đột biến đầu mỗi cái đúng một ca.

## Quyết định phát sinh

1. **`overrideOptions` bị loại** dù plan G12 và contract §2 đều gợi ý — nó vừa **thừa** (payload đã thắng `options.jwt.audience` trong `sign.mjs`) vừa **có hại** (endpoint merge NÔNG ⇒ truyền `{jwt:{audience}}` làm **mất `issuer`**). Đã sửa cả hai tài liệu.
2. **`GATEWAY_AUD` đặt trong `config.ts`** cạnh `ORCHESTRATOR_AUD` — file thứ năm, ngoài bảng ownership 4 file của G12. Lệch có chủ ý: `aud` là thứ duy nhất tách token gọi gRPC với token mở shell.
3. **Admin tạo session hộ → không phát cookie.** Cả hai lựa chọn mint đều sai (cookie chết sẵn + đè cookie của admin, hoặc phát chìa mở shell của người khác).

## Còn nợ / chưa đo

- **Web lab đang chạy tag `dev-g12b`** (dựng từ nhánh, side-load tay). Đóng sau khi PR merge: side-load `sha-<merge>` **TRƯỚC**, `helm upgrade` **SAU**.
- **`headers.ts` không sửa** — G12 nói chỉ sửa nếu DevTools báo CSP violation thật, mà chưa có trang `/session`. Câu hỏi để 1.F trả lời: `connect-src 'self'` có phủ `wss://` cùng origin không.
- **Vế "DevTools Network"** của AC B0 (trình duyệt TỰ đính cookie theo scope) vẫn thuộc 1.F. Thứ đã đo là tầng dưới: cookie đúng scope, và client WS thật gửi nó qua được 9 bước authz.
- **Công cụ đo chưa vào repo.** Khác 1.C-2 (công cụ khi đó *mint token*, cố tình không commit), công cụ lần này **không** mint gì — nó chỉ đi đúng đường người dùng đi. Nó nên thành **test e2e chạy trong CI**, đúng như báo cáo 1.C-2 dự đoán. Chưa làm ở chặng này; ghi nợ.

## Trình tự tái hiện

```bash
# 1. dựng + side-load image web (KHÔNG pull — node không có imagePullSecrets)
docker build -f apps/web/Dockerfile -t ghcr.io/nghaiz/dlp-web:<tag> .
docker save ghcr.io/nghaiz/dlp-web:<tag> -o w.tar && scp w.tar nghaiz@<host>:/tmp/
ssh nghaiz@<host> 'sudo ctr -n k8s.io images import /tmp/w.tar'

# 2. upgrade — --reset-then-reuse-values, KHÔNG --reuse-values
#    ⛔ và KHÔNG dùng chart ở ~/dlp-deploy: bản trên host LỆCH so với repo (thiếu
#       toàn bộ khối env gateway của 1.C-1/1.C-2). Ship chart từ repo sang /tmp.
helm upgrade platform /tmp/dlp-chart/infra/helm/platform --reset-then-reuse-values \
  --set web.image.tag=<tag> --wait

# 3. port-forward + chạy prover TRONG CÙNG một session shell
#    ⛔ ĐỪNG `pkill -f 'port-forward svc/platform-'` — pattern khớp luôn shell đang chạy script.
kubectl port-forward svc/platform-web 3000:3000 &
kubectl port-forward svc/platform-gateway 8082:8082 &
python3 verify_g12.py
```

## Liên quan

- [`phase-1.md`](../phase-1.md) §1.C G12 — task + AC
- [`2026-08-10-verify-terminal-1c2.md`](2026-08-10-verify-terminal-1c2.md) — chặng trước, và món nợ mà báo cáo này đóng
- [`docs/ws-terminal-protocol.md`](../../../docs/ws-terminal-protocol.md) §2 — contract SSOT (đã đính chính `overrideOptions`)
