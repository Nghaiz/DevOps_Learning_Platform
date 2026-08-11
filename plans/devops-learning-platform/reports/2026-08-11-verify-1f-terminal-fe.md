# 1.F — terminal chạy thật trong trình duyệt: bằng chứng trên cluster

**Ngày:** 2026-08-11 · **Chặng:** phase-1 §1.F (F1–F11) · **Cụm:** lab 1-node (`debian-sandbox`, k8s v1.34.10, Sysbox) · **Release:** revision 24

## Điều chặng này chứng minh — và vì sao nó khác mọi chặng trước

Tới trước hôm nay, **mọi** bằng chứng của P1 đi qua `wscat`, `curl`, hoặc một prover Go. Chúng chứng minh được giao thức, authz, và cầu exec — nhưng không chứng minh được thứ mà đề tài thật sự hứa: **một sinh viên mở trình duyệt và gõ lệnh**.

Chặng này đóng đúng vế đó. Ảnh: [`assets/2026-08-11-1f-lenh-that.png`](assets/2026-08-11-1f-lenh-that.png).

| Phép kiểm | Kết quả |
|---|---|
| Đăng ký user thật → `/session` (Server Component kiểm auth) | ✅ |
| Bấm "Bắt đầu" → `session.create` → claim pod `sandbox-bc57d8f7a11e` | ✅ |
| Trình duyệt TỰ đính cookie `dlp_sandbox` (scope `/ws`) vào handshake | ✅ |
| Control `ready` → badge "Đang chạy" + đồng hồ "Còn 1:00:33" | ✅ |
| Prompt oh-my-posh vẽ đúng bề rộng, powerline + glyph Nerd Font | ✅ |
| `echo "phiên lab tiếng Việt ✓ $(hostname)"` → pod trả về NGUYÊN VẸN | ✅ |
| `eza --icons=always -la /etc` → glyph thật (khoá/thư mục/file), không tofu | ✅ |
| DevTools Console: **0 CSP violation** | ✅ |
| WebGL renderer hoạt động (3 canvas), font `DLPTerminalNF:loaded` | ✅ |

## Câu hỏi mà G12 để lại cho chặng này — đã trả lời dứt điểm

> *"`connect-src 'self'` có phủ `wss://` cùng origin không?"*

**CÓ.** Và câu trả lời được đo kèm **đối chứng âm**, vì "0 violation" là một khẳng định vô nghĩa nếu CSP không hề thực thi:

```js
// từ trong chính trang /session, nghe securitypolicyviolation
wss://evil.example:9999/ws   → violation: connect-src   ← CSP ĐANG thực thi
http://evil.example/x.png    → violation: img-src       ← đối chứng thứ hai
ws://localhost:8080/ws/...   → KHÔNG violation           ← cùng origin, cho qua
```

⇒ **`headers.ts` KHÔNG cần sửa.** G12 nói "chỉ sửa nếu DevTools báo violation thật"; không có violation nào.

> **Phương pháp suýt sai, ghi lại để không lặp:** lượt đầu tôi bọc `new WebSocket(...)` trong `try/catch` và chờ nó **ném**. Nó không ném, và suýt nữa tôi kết luận "CSP không thực thi". Chrome báo vi phạm CSP cho WebSocket **bất đồng bộ** qua sự kiện `securitypolicyviolation`, không phải bằng exception ở constructor. Một phép kiểm sai phương pháp cho ra kết luận ngược hẳn.

## Lệch contract chỉ lộ ra trên trình duyệt thật

**`ready` của gateway KHÔNG có `hardCapAt`, dù contract §5 liệt kê nó là bắt buộc.**

Parser bản đầu của `packages/terminal` làm đúng như bảng — bắt buộc field đó — nên nó **loại sạch mọi frame `ready`**. Triệu chứng trên cụm:

- terminal **vẽ prompt và gõ lệnh được** (byte binary không đi qua parser control)
- badge đứng ở **"Đang kết nối…" vĩnh viễn**, đồng hồ không bao giờ hiện
- **không một dòng log nào** — parser bỏ qua frame lạ trong im lặng

Cả hai bên typecheck xanh, cả 90 test xanh, `next build` xanh. Đây đúng là ca mẫu cho câu mở đầu của chính file contract: *"typecheck của từng bên không bao giờ bắt được lệch contract — mỗi bên tự nhất quán, chỉ runtime mới lộ."*

**Bên nào sai?** Không phải gateway. `buildReady` ghi rõ lý do: mốc đó = `createdAt + HARD_CAP`, mà `HARD_CAP` là config của **orchestrator**; để gateway tự tính thì phải cấp cho nó một `GATEWAY_HARD_CAP` riêng — **hằng số thứ hai cho cùng một con số**, đúng thứ P1 đã trả giá vài lần (`sandboxImage`, `SESSION_TTL`). Lý lẽ đó mạnh hơn bảng contract.

**Đã sửa:** contract §5 (ghi `hardCapAt` vắng ở v1 + lý do + cái giá đã trả), `ReadyMessage.hardCapAt: string | null`, một ca hồi quy dùng **đúng byte gateway gửi**, và **bỏ hẳn nhánh bỏ-qua-im-lặng** trong `connection.ts` (nay `console.warn` kèm 200 ký tự đầu của frame).

## ⛔ Lỗi CHẶN NGƯỜI DÙNG tìm thấy khi rà soát VM — chưa vá ở mã

Người dùng báo VMware sập và tắt hẳn Debian 13 giữa phiên; phép rà soát lôi ra thứ này:

**Pod đã CHẾT vẫn nằm trong `pool:free` và sẽ được phát cho sinh viên tiếp theo.**

```
Redis:      pool:free = [sandbox-674a2a67af4a]   pod:sandbox-674a2a67af4a.state = free
Kubernetes: phase = Failed, container terminated, exitCode 255
```

`podspec.go` đặt `RestartPolicy: Never`, nên node reboot ⇒ pod `Failed` **vĩnh viễn**. `claim.lua` chỉ hỏi `pod:{name}.state == 'free'` — nó không hỏi Kubernetes. Và **không tầng reaper nào phủ ca này**:

| Tầng | Vì sao KHÔNG bắt được |
|---|---|
| tầng 1 — keyspace expiry | pod rảnh không có `session:{id}` nào để hết hạn |
| `sweepOrphanPods` | đòi hash **VẮNG**; hash này **CÓ** |
| `sweepGhostSessions` | đòi có `session:{id}`; không có |
| `sweepClaimedWithoutSession` | quét `pool:claimed`; pod này ở `pool:free` |
| `drainQuarantine` | quét `pool:quarantine`; không ở đó |

`IsTerminal()` **có tồn tại** (`internal/k8s/pods.go`) nhưng chỉ được gọi trong `waitReady` — tức lúc **tạo**, không bao giờ gọi lại. Với `POOL_TARGET=1`, **sinh viên đầu tiên bấm Start sau mỗi lần reboot nhận đúng pod chết**.

- **Đã vá TẠM trên cụm:** xoá pod + `LREM pool:free` + `DEL pod:{name}` → warm-pool dựng lại pod sạch trong **5s** (lượt dựng đó cũng chính là canary CNI: pod mới `Running` có IP `10.244.211.125` ⇒ R0 chưa nổ sau sự cố).
- **Bản vá ĐÚNG chưa làm:** một **tầng reaper thứ 4** quét `pool:free` và đối chiếu phase với apiserver. Thuộc lane orchestrator, không thuộc chặng này.

## Kết quả rà soát VM (sau khi VMware sập)

Cụm khởi động lại lúc 15:41 và **lành**:

| Hạng mục | Trạng thái |
|---|---|
| Node / clock | `Ready`, NTP synced |
| Control plane | etcd/apiserver/kcm/scheduler/coredns/calico đều Running |
| Postgres | phục hồi sạch (`end-of-recovery` → `ready to accept connections`), **712 dòng audit còn nguyên** |
| Redis | AOF `ok`, `notify-keyspace-events=xE`, `appendonly=yes` |
| PVC | cả 2 `Bound`; đĩa 13% |
| CNI (R0) | token trên đĩa còn **23.85h**, cron refresh chạy trong ~3h; pod mới cấp được IP |
| readinessProbe | cả 3 deployment ĐỀU CÓ ⇒ `READY=true` là có nghĩa |

Restart count của kcm (11) và scheduler (16) cao — dấu vết crash-loop lúc resume, đã ổn định.

## Kiến trúc lệch plan có chủ ý

**F7 của plan không build được trên Next 16.** Plan ghi: *"`page.tsx` (Server Component) … nạp `session-terminal.tsx` bằng `next/dynamic` với `ssr: false`"*. Next 16 **cấm** `ssr: false` trong Server Component (`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`). Tầng thật ba lớp:

```
page.tsx          Server Component — kiểm auth thật qua auth.api.getSession
  └─ session-client.tsx   'use client' — máy trạng thái, tRPC, đồng hồ, nút
       └─ terminal-pane.tsx   'use client' + dynamic(ssr:false) — nơi đụng document
```

Vẫn cần `ssr: false` dù lớp giữa đã là client: Client Component **vẫn được render trước trên server**, và `@xterm/xterm` chạm `document` ngay lúc import module.

**Bỏ state `claiming`** (plan F9 có): `CreateSession` claim pod ngay trong cùng lời gọi, nên đó là state không bao giờ dừng lại — code chết. Phép kiểm "session có nối được không" vẫn còn, nhưng là **điều kiện trên cạnh** `creating → connecting`. **Thêm state `exited`** cho control `exit` mà danh sách của plan không có chỗ nhận.

## Font — CaskaydiaCove Nerd Font Mono

Theo yêu cầu người dùng giữa phiên (bản JetBrainsMono dựng trước đó đã gỡ). Bản **Mono** vì nó ép icon về đúng một ô, khớp `wcwidth` phía server; bản không-Mono vẽ icon rộng 2 ô và prompt sẽ trôi dần một cột mỗi icon.

Subset **636 KB** woff2, ghim `v3.5.0` + sha256 tự tính (Nerd Fonts không publish checksum per-asset — trust-on-first-use, giống hệt `fastfetch` ở 1.E-1). **Bỏ dải plane-15** (Material Design Icons): đo trên chính face này là **635 → 1063 KB (+428 KB)** cho một dải mà không gì trong image sandbox phát ra.

Chỉ ship **Regular**; chữ đậm để trình duyệt tự tổng hợp. Ship thêm Bold là gấp đôi dung lượng, và còn sinh bẫy phủ-glyph lệch: nếu face Bold thiếu một icon mà Regular có, trình duyệt rơi xuống font TIẾP THEO trong stack chứ không rơi về Regular cùng họ.

## Còn nợ / chưa đo

- **AC "tắt hardware acceleration → fallback DOM + `console.warn`"** — có code (`onContextLoss` + try/catch quanh `loadAddon`), **chưa chạy thật**.
- **AC "StrictMode dev: 3 lần mount/unmount → 1 WebSocket"** — đo **gián tiếp** ở tầng connection (3 lượt mở/đóng → 0 socket sống; `close()` chủ động không gọi `onClose` nên không kích hoạt vòng nối lại). Chưa đo chính vòng đời effect dưới `<StrictMode>`.
- **Nút "Gia hạn"** — procedure `session.extend` có, chưa bấm thật trên cụm.
- **Reconnect** — logic backoff có test thuần; chưa ngắt mạng thật để xem tmux trả lại scrollback **qua đường FE** (1.C-2 đã chứng minh vế server bằng wscat).
- **`sudo` không có trong image sandbox** (`zsh: command not found: sudo`) — quan sát, chưa phải lỗi; lane image (E-series) nên quyết định có chủ ý.
- **Cụm đang ở `betterAuthUrl=http://localhost:8080`** (mặc định chart là 3000). CHỦ Ý: cụm không có ingress, nên đường DUY NHẤT dùng lab bằng trình duyệt là proxy Caddy gộp origin ở :8080, và contract §2 đòi web+gateway cùng origin. Lệnh hoàn tác nằm trong `harness/2026-08-11-p1-f-terminal-fe/verification.json`.
- **Web lab đang chạy tag `dev-1f2`** (dựng từ nhánh, side-load tay) — đóng sau khi PR merge, theo đúng thứ tự: side-load `sha-<merge>` **TRƯỚC**, `helm upgrade` **SAU**.

## Trình tự tái hiện

```bash
# 1. hạ tầng cục bộ cho test (nếu không có, 20 ca web ĐỎ vì thiếu bảng jwks)
docker compose up -d postgres redis && pnpm --filter @devops-platform/web db:migrate

# 2. cổng chung
pnpm turbo run lint typecheck test          # 16/16 task, 199 test, 0 skip

# 3. image + deploy (KHÔNG dùng chart ở ~/dlp-deploy nếu chưa đồng bộ — xem dưới)
docker build -f apps/web/Dockerfile -t ghcr.io/nghaiz/dlp-web:<tag> .
docker save ghcr.io/nghaiz/dlp-web:<tag> -o w.tar && scp w.tar nghaiz@<host>:/tmp/
ssh nghaiz@<host> 'sudo ctr -n k8s.io images import /tmp/w.tar'
helm upgrade platform <chart> --reset-then-reuse-values --set web.image.tag=<tag> --wait

# 4. origin gộp (contract §2) — cụm KHÔNG có ingress
kubectl port-forward svc/platform-web 3000:3000 &
kubectl port-forward svc/platform-gateway 8082:8082 &
docker compose --profile proxy up -d        # Caddy :8080 → /ws/* tới 8082, còn lại tới 3000
# rồi mở http://localhost:8080/session
```

> ⛔ **`~/dlp-deploy` trên VM lệch repo — bẫy này đã cắn hai lần.** Báo cáo G12 đã cảnh báo, và chặng này vẫn dẫm phải: chart trên host cũ 20h, thiếu **toàn bộ khối env gateway** của 1.C-1/1.C-3 (gồm `REDIS_URL`), nên `helm upgrade` từ nó làm gateway CrashLoop `env REDIS_URL: bắt buộc nhưng chưa đặt` và release rơi vào `failed` (revision 20). Cơ chế đáng nhớ: **`--reset-then-reuse-values` giữ VALUES nhưng KHÔNG giữ TEMPLATE** — chart cũ âm thầm bỏ rơi env var trong khi values vẫn còn nguyên. Đồng bộ chart từ repo trước mọi lượt upgrade.
