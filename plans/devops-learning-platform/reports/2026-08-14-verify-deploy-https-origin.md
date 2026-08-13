# Deploy B/C lên cụm + chạy lại harness trên origin HTTPS — 2026-08-14

Đóng hai mục "còn lại" mà report [`2026-08-14-verify-p2-debt-closure.md`](2026-08-14-verify-p2-debt-closure.md)
tự khai: image trên cụm chưa mang B/C, và harness chưa chạy trên origin mới.

## Kết quả

| Việc | Kết quả |
|---|---|
| Image `sha-595e20b` (web + gateway) | side-load + rollout xong, pod Running |
| Harness e2e trên **HTTPS**, không port-forward | **14/14 PASS** |
| B — dấu vết kiểm toán `exec` | **6 dòng** có `user_id`/`pod`/`namespace`/`exit_code` |
| B — dấu vết kiểm toán WS | **mở 1 / đóng 1**, `duration=3.007s` khớp lượt giữ 3s |
| C — nhãn tiến độ mới | có trong bundle client ĐANG phục vụ |

## Sự cố giữa đường: `helm upgrade` từ chart LỆCH làm hỏng `checkStep`

Lượt chạy harness đầu tiên: 5 PASS rồi chết ở `checkStep` với
`INTERNAL_SERVER_ERROR` / "Không gọi được dịch vụ chấm bài".

**Nguyên nhân:** tôi `helm upgrade` từ `~/dlp-deploy` trên VM. Chart ở đó ĐÃ LỆCH —
`templates/web-deployment.yaml` của nó có **0** lần xuất hiện `GATEWAY_INTERNAL_URL`
(chart trong repo có 1). Upgrade từ đó ⇒ biến bị gỡ khỏi Deployment ⇒ `env.ts`
rơi về default `http://localhost:8082` ⇒ web pod **tự gọi chính nó** ⇒ ECONNREFUSED.

**Vì sao khó thấy — ba tín hiệu đều nói "ổn":**

1. `helm upgrade` trả **`STATUS: deployed`**, không lỗi.
2. Pod web **Running 1/1** — không CrashLoop, nên không có gì nổi lên.
3. **Không một dòng log nào** ở cả web lẫn gateway: lỗi `fetch` bị gói vào
   `TRPCError.cause`, và `cause` cố ý KHÔNG nối vào message (nó mang URL nội bộ).
   Gateway thì im vì request chưa bao giờ tới nơi.

Triệu chứng duy nhất nằm ở tầng ứng dụng, cách chỗ hỏng ba lớp.

**Cách định vị nhanh lần sau:** so tập env THẬT của Deployment với chart của repo —
lệch nghĩa là template cũ, không phải values sai:

```bash
kubectl get deploy platform-web -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}{"\n"}{end}'
grep -c GATEWAY_INTERNAL_URL infra/helm/platform/templates/web-deployment.yaml
```

**Đã sửa:** upgrade lại từ chart của repo copy sang `~/dlp-chart-595e20b/` (thư mục
đặt tên theo commit — tên tự khai nó là bản nào), và làm mới luôn chart trong
`~/dlp-deploy` + để lại `CHART-SYNCED.txt` ghi rõ nó từng lệch ra sao. Đây là lần
**thứ hai** bẫy `~/dlp-deploy` cắn (lần đầu: 1.F, thiếu khối env gateway ⇒ CrashLoop).

## Bằng chứng

### Harness trên origin HTTPS — 14/14

```
BASE_URL=https://dlp.192.168.94.130.sslip.io:30443 \
ORIGIN=https://dlp.192.168.94.130.sslip.io:30443 \
NODE_EXTRA_CA_CERTS=<ca.crt dạng đường dẫn Windows> \
node e2e-lessons.mjs
```

Gồm cả cặp pass/fail thật (`exit=1` "Chua thay /root/lab/hello.txt" → `exit=0`
"Dat"), vế NetworkPolicy + đối chứng âm (`curl https://example.com` trong pod →
`exit=28`), và ca `sessionId` lạ NÉM lỗi thay vì trả `passed:false`.

### B — exec (6 dòng, rút gọn)

```json
{"msg":"chạy exec one-shot","session_id":"0addb2fc…","user_id":"njmTpUUq…",
 "pod":"sandbox-372b26076219","namespace":"dlp-sandbox","exit_code":1,"duration":534086199}
{"msg":"chạy exec one-shot",…,"exit_code":0,"duration":431972644}
```

Có cả `exit_code` 0 và 1 — tức dòng log phân biệt được "chạy được script" với
"chạy được script VÀ bài đúng", đúng mục tiêu của nợ §1.

### B — WS (mở + đóng)

Harness e2e đi qua API nên **không bao giờ mở WebSocket** ⇒ 0 dòng WS. Phải
attach thật mới đo được. Không có gói `ws` trong repo nên dùng handshake thô
trên `node:tls` (ALPN ép `http/1.1` — upgrade RFC 6455 không tồn tại trên h2,
để mặc thì Traefik chọn h2 và request upgrade thành vô nghĩa):

```
handshake: HTTP/1.1 101 Switching Protocols     ← qua Traefik + TLS
```

```json
{"msg":"mở phiên WS","session_id":"a0683ac7…","user_id":"WUHZUCQe…","pod":"sandbox-8bace3020fd2","namespace":"dlp-sandbox"}
{"msg":"đóng phiên WS","session_id":"a0683ac7…","pod":"sandbox-8bace3020fd2","duration":3007035473}
```

`duration` 3.007s khớp đúng lượt giữ socket 3s của script — số đo là thật, không
phải hằng số.

### C — nhãn trong bundle ĐANG phục vụ

```
apps/web/.next/static/chunks/0gyzi2vm72cf7.js:
  }/${String(t)} bước đã đạt trong phiên này
  ,label:"Đã hoàn thành"}
```

Đúng **1** chỗ dựng nhãn, và nó CÓ hậu tố "trong phiên này" ⇒ nhãn cũ (không hậu
tố) không còn.

⚠ **Bẫy khi kiểm:** `grep` chuỗi tiếng Việt qua `kubectl exec -- sh -c` trả 0 kết
quả dù chuỗi CÓ trong file — dấu phụ bị biến dạng khi đi qua các lớp shell. Bám
vào **bộ xương ASCII** (`trong phi`, `n th`) rồi mới dump ngữ cảnh ra xem. Suýt
kết luận nhầm là "C chưa được deploy".

## Bẫy môi trường ghi lại

1. **`curl` trên Windows dùng schannel và đòi CRL.** CA lab không có CRL
   distribution point ⇒ `curl: (60) CERT_TRUST_REVOCATION_STATUS_UNKNOWN` dù
   chứng chỉ hợp lệ hoàn toàn. Thêm `--ssl-no-revoke`. `curl` trên VM (OpenSSL)
   và `fetch` của Node thì không vướng — lại một ca "hai công cụ, hai kết quả".
2. **`NODE_EXTRA_CA_CERTS` phải là đường dẫn Windows** khi chạy từ Git Bash:
   Node giải `/tmp/x` thành `D:\tmp\x`, không theo ánh xạ MSYS.

## Còn lại

1. **Chưa mở bằng TRÌNH DUYỆT thật trên origin mới.** Đã đo bằng handshake TLS
   thô + harness API: 101, PTY target đúng pod, 14/14 AC. CHƯA đo: người thật mở
   Chrome, thấy prompt shell, gõ, bấm "Kiểm tra". Muốn làm thì phải cho trình
   duyệt tin CA (`certutil -addstore -user Root ca.crt` trên Windows) — đó là
   sửa cửa hàng chứng chỉ của máy người dùng nên tôi KHÔNG tự làm.
2. **Tài khoản thử còn trong DB lab:** `tls-probe-*`, `ws-probe-*`, và các user
   do harness e2e tạo mỗi lượt chạy.
3. **`~/dlp-deploy` sẽ lại lệch ở commit sau.** Đã làm mới + để lại marker, nhưng
   cách chặn hẳn là luôn upgrade từ `~/dlp-chart-<sha>/`.
