# Đóng nợ 2026-09-08 — báo cáo nghiệm thu

**Nhánh:** `feat/killercoda-workspace` · **Cụm:** `https://dlp.192.168.94.130.sslip.io:30443`
**Giờ lấy TỪ TRONG VM** (`ssh nghaiz@… date -Is`) — đồng hồ VM và Windows đã từng lệch ~59s,
so ở mức phút không phát hiện được.

> ⚠ Trạng thái: **ĐANG VIẾT**. Ô nào chưa có số đo thì ghi "chưa đo", không ghi "đạt".

## 0. Phạm vi — do chủ dự án chốt

Bốn quyết định, hỏi và trả lời lúc 2026-09-08 trước khi chủ dự án đi ngủ:

| Quyết định | Chốt |
|---|---|
| Phạm vi | **Chỉ dọn nợ.** Không mở Phase 11 (gVisor, 10 ô) và Phase 14 (games/docs, 14 ô) — hai phase chưa bắt đầu, là việc mới chứ không phải nợ |
| Lỗi sản phẩm nhỏ | Đóng **A3 · A4 · A5 · A6 · A7 · A9** |
| A8 warm-pool lệch ảnh | **Vá thật**, không né bằng dọn tay |
| Quyền chủ dự án | Làm **C16** (thu hồi tài khoản quyền cao còn sót) + **C14** (xoá nhánh remote đã merge). **Không** bật lại CI |
| Deploy đêm | **Deploy, tự lùi nếu smoke đỏ** |
| PR #103 | **Push và merge vào `main`** |
| `reports/` | **Commit report văn bản**, chặn riêng hiện vật nặng |

## 1. Ba đính chính cho bảng rà nợ

Bảng nợ dựng đầu phiên có ba chỗ sai. Ghi lại vì cả ba đều là hạng lỗi "một khẳng
định phủ định không nêu phạm vi tìm kiếm".

### 1.1 Report P13 KHÔNG hề mất

Bảng ghi *"`reports/2026-09-07-verify-p13.md` KHÔNG tồn tại trên đĩa"*. Nó tồn tại —
ở `reports/` **gốc repo**, không phải `plans/devops-learning-platform/reports/`.
Lượt quét đúng một trong hai đường rồi kết luận file không tồn tại. 470 dòng.

### 1.2 236 file report ĐÃ nằm trong git từ trước

Bảng (và cả `phase-13-exec.md` §4) ghi `git ls-files reports` trả **0**. Sai: trả
**236** (44 `.md`, 12 png, 13 log). `.gitignore` không bao giờ gỡ file đã tracked,
nên luật `reports/` của `fdd6d6e` chỉ chặn file **mới**.

### 1.3 C14 không phải 23 nhánh

Bảng ghi *"23 nhánh remote chưa xoá được"*. Thực tế còn **12 ref**, và **8** trong đó
là PR đang MỞ (7 dependabot + nhánh làm việc hiện tại). Chỉ **2** nhánh là ứng viên
thật, cả hai squash-merge từ tháng 8. Đã xoá.

### 1.4 A9 không phải nợ — là quyết định đã đảo chiều

Bảng ghi *"nút `×` đóng tab terminal vẫn ẩn"*, trích
`contracts/killercoda-workspace.md:166`. Dòng đó nằm trong **§C6, một section đã bị
THU HỒI** bởi khối *SỬA ĐỔI 2 (2026-09-07)*, và việc thu hồi đã được **thực thi**:
`tmux-control.ts` bị xoá ở `867c55e`, `WorkspaceTabId` thu về `'editor' | 'terminal'`,
`{{exec T1}}`/`{{exec T2}}` nay **ném `ContentBlockError`**.

Lane nhận việc này đã từ chối làm và ship thay một **cổng hồi quy** (9 ca) — trước
lượt đó không một phép kiểm nào trong `apps/web` đỏ lên nếu mặt tiếp xúc đa terminal
quay lại, và đó chính là lý do một brief đọc §C6 mà cả cây mã im lặng.

**Bài học:** trích một dòng tài liệu để giao việc thì phải kiểm section chứa nó còn
hiệu lực không. Số dòng vẫn đúng, nội dung vẫn ở đó, và nó vẫn sai.

## 2. Đã đóng

### 2.1 Ba món chủ dự án nêu đích danh

| # | Món | Trạng thái |
|---|---|---|
| 1 | Terminal tích hợp Theia không tắt được bằng cấu hình | **Đã xong TỪ TRƯỚC phiên này** (`879c95a`) — ghi vào `docs/ide-choice.md` + `images/sandbox-base/README.md`, kèm đường sửa đã cân (`terminal.integrated.defaultProfile.linux` → `tmux new-session -A`) và lý do loại (hai client tmux trên một phiên ⇒ tmux co cửa sổ về client NHỎ NHẤT, nên một panel Theia hẹp bóp terminal chính của MỌI phiên) |
| 2 | Ảnh mới chưa thành ảnh đang chạy | **Rộng hơn mô tả** — xem §2.4 |
| 3 | Dây nối sự kiện DOM của thanh tab chưa có test | **Đóng** (`727af45`) |

### 2.2 Test dây nối DOM (món 3)

jsdom + RTL bật **per-file** bằng docblock, KHÔNG đặt toàn cục — gói này có test
tích hợp đi Postgres thật, đổi env toàn cục là đổi nền dưới chân chúng.

⚠ `environmentMatchGlobs` **đã bị bỏ hẳn ở vitest 4**: grep toàn bộ gói đã cài, kể
cả `.d.ts`, ra **0 kết quả**. Nó lọt typecheck rồi im lặng không làm gì.

Số ô: **1177 → 1211** (+34, khớp đúng số ô file mới). Không file cũ nào tụt ô.

Đối chứng: bốn đột biến trên chính component, mỗi lần khôi phục ngay.

| Đột biến | Kết quả |
|---|---|
| `onClick` lật trạng thái thay vì báo tên nút vừa bấm | 5 ô đỏ |
| Bỏ `percentRef`, effect ghi đọc state | đúng 1 ô đỏ |
| Đổi `key` hàng terminal (ép React dựng lại) | đúng 3 ô §Y1 đỏ |
| Đảo chiều phép đo kéo | đúng 3 ô kéo đỏ |

Ô §Y1 "cùng một node DOM" là ô giá trị nhất: dựng lại node terminal = đóng
WebSocket = mất phiên người học, **im lặng**. `renderToStaticMarkup` render một lần
nên về cấu trúc không thể quan sát lượt render thứ hai — đột biến `key` vô hình với
nó, đỏ ngay với file mới.

**Chưa chứng minh được:** jsdom không có `setPointerCapture` (phải stub) và
`getBoundingClientRect` trả toàn 0. Nên khối kéo chứng minh *phép tính*, không chứng
minh con trỏ thật sự bị giữ khi kéo nhanh ra ngoài. Chỉ Playwright gác được.

### 2.3 A3 — nosniff ở `/ws` và `/exec` (`64be7bc`)

Một package SSOT `internal/secheaders` cho cả ba route. 15 ô mới phủ **từng nhánh
`return` sớm** (mỗi nhánh là một chỗ quên riêng: 101, 403, 400, 401, 409, 429, 500,
502). Đối chứng dương chạy thật → 15 ô đỏ.

Đo được: **header sống qua handshake 101**. `coder/websocket@v1.8.15` gọi
`WriteHeader(101)` ở `accept.go:151` RỒI mới `Hijack()` ở `:159`, và `net/http` flush
chunkWriter ngay trong `Hijack()`. Nên lời gọi phải ở dòng ĐẦU của `serve`.

Chưa phủ: 404/405 do `http.ServeMux` tự sinh — chúng không đi qua route nào. Chấp
nhận có ý thức (body là hằng `text/plain` của thư viện chuẩn).

### 2.4 Món 2 — khoảng lệch ảnh RỘNG hơn mô tả

| Thành phần | Đang chạy | Cần | Vì sao |
|---|---|---|---|
| `dlp-sandbox-base` | `p13ide` | **build lại `p13k`** — ⛔ KHÔNG dùng `p13j`, xem dưới | `f850258` + `0f6397c` + A6 |
| `dlp-web` | `p13d` | **build mới** | `f850258`, `867c55e`, `42e56e4` |
| `dlp-orchestrator` | `p13` | **build mới** | `0c46d3e` vá tràn int32 ra số ÂM |
| `dlp-terminal-gateway` | `p13e` | **`p13k`** (đã build + side-load) | `64be7bc` (A3) |
| `dlp-migrator` | `p13` | giữ nguyên | không có migration mới |

`p13j` xác minh bằng **pod thăm dò chạy từ chính ảnh đó** — có `dlp-motd`,
`dlp-tools`, `/etc/dlp/toolset.catalog`, `fastfetch.jsonc`, `ptit.ansi`. Không suy
từ tên tag.

#### ⛔ Và làm ĐÚNG yêu cầu ở đây sẽ là một hồi quy

Món 2 nói: *"đã build và import vào containerd, nhưng deployment vẫn dùng tag cũ.
Đổi tag là một quyết định vận hành"*. Đổi tag sang `p13j` **làm hỏng mọi bài IDE**.

Dấu hiệu là kích thước: `p13j` **230.5 MiB**, `p13ide` **553.5 MiB** — chênh ~320MB,
đúng cỡ Theia. Kiểm bằng pod thăm dò trên chính `p13j`:

```
/opt/theia:      KHONG-CO
dlp-ide script:  KHONG-CO
```

`INCLUDE_IDE` **mặc định là 0** (`images/sandbox-base/Dockerfile:43`) và `p13j` được
build không truyền `--build-arg INCLUDE_IDE=1`. Đây đúng chế độ hỏng đã ghi trong sổ
với `p10a`: *"build `INCLUDE_IDE=0` nên không có `/opt/theia`, mọi request 503"* — và
lần đó nó im lặng, vì helm/rollout/chart đều xanh.

⇒ Ảnh sandbox phải **build lại với `INCLUDE_IDE=1`**, không dùng `p13j`. Tag mới
`p13k`, build sau khi lane A6 (`bin/dlp-session-deadline`) chốt Dockerfile.

**Bài học:** một tag mới hơn không có nghĩa là một ảnh đúng hơn. Ở đây thứ duy nhất
nói ra sự thật là **kích thước ảnh**, và nó chỉ nói khi có ai đặt hai tag cạnh nhau.

### 2.5 A1 — "còn N chỗ" (`5135cf9`, `808093c`, `199bfed`)

`GetCapacity` đọc **ResourceQuota + LimitRange** lúc gọi. Quota thật đọc từ cụm:
`hard pods 28 · requests.cpu 5850m · requests.memory 5952Mi`; `used pods 3 · 768Mi`.

Trần theo profile: mặc định 20/23 · **ide 6/7** · k8s 5/5 · multinode 3/3.

Hai điều dễ bỏ sót:
- Trần là `min` qua **năm** đại lượng, không chỉ RAM. Chỉ chia RAM là dựng lại đúng
  hạng lỗi đang vá, chỉ đổi trục.
- Phải đọc **LimitRange**: pod profile mặc định KHÔNG tự khai `resources`, chi phí
  quota của nó do LimitRange quyết định. Đoán bù bốn con số đó là hardcode lần nữa.

RBAC thêm `resourcequotas` + `limitranges` (`get`/`list`).

Đối chứng dương: đưa `fillProfileCapacity` về công thức cũ, và bỏ `pods` khỏi
`quotaKeys` → 5 ô đỏ.

### 2.6 AC 3/4 → 4/4 trình học (`b4ac817`)

Luồng `@flow` thứ bảy (sân chơi). `--grep @flow --list` nay ra `7 tests in 7 files`.

Sáu lượt đột biến, trong đó **một lượt là đột biến HỎNG và lane tự bắt được**: `\d+`
viết qua shell bị nuốt backslash thành `d+`, regex không khớp gì, nên ô "xanh" của
lượt đó không chứng minh gì. Làm lại bằng `[0-9]+` thì ô đỏ đúng chỗ.

Không rò khe quota: `dlp-sandbox` trước và sau đều `pods 3/28, 768Mi/5952Mi`.

**Chưa đo:** ba luồng kia (lesson · lab · quiz) không chạy lại ở lượt này — ô "4/4"
là hợp của hai lượt đo, không phải một lượt bốn luồng.

### 2.7 C16 — bốn tài khoản quyền cao còn sót, không phải một

Bảng nợ nêu một (`e2e-ac613-…`). Đọc DB ra **bốn**: ba admin `e2e-*` từ các lượt đo
trước, và một author `k6-load-1-…` từ lượt tải. Đã hạ cả bốn về `user` bằng chính
`promote-role.sh` của dự án. Kiểm lại: chỉ còn `catalog@dlp.local` (author, tài khoản
seed có chủ đích — `scripts/seed-content.mjs:84`).

### 2.8 Suite Go — 0 SKIP, không phải "xanh vì skip sạch"

Bốn suite (lifecycle, pool/claim, reaper, authz gateway) **skip toàn bộ khi
`REDIS_URL` trống**, nên một lượt "ok" có thể là một lượt không chạy gì.

Chạy lại với Redis dev xác thực (`redis://:…@127.0.0.1:6379/15`), `-count=1` để không
đọc cache của lượt skip:

| module | RUN |
|---|---:|
| orchestrator | 353 |
| terminal-gateway | 227 |
| shared | 52 |
| **tổng** | **632** — **0 SKIP, 0 FAIL** |

⚠ Lượt đầu tôi chạy `GOOS=linux go test` và mọi package "FAIL" với
`not a valid Win32 application`. Đó là lỗi LỆNH (cross-compile ra binary Linux rồi
cố chạy trên Windows), không phải lỗi mã. `GOOS=linux` chỉ dùng cho `go build` để phủ
file mang build tag `_unix.go`.

### 2.9 A8 — cơ chế ĐÃ CÓ, và README lạc hậu 9 tiếng (`0853697`)

Bảng nợ trích `images/sandbox-base/README.md`: *"chưa có task nào sở hữu"*. Sai —
cơ chế rollout-theo-image có từ `ea73912` (2026-08-12 **22:05**, tầng 4
`sweepDeadFreePods`). Dòng README đó viết ở `d09db86` **cùng ngày, 12:52** — sớm hơn
chín tiếng, và không ai cập nhật lại. Ai đọc nó sẽ đi dựng một cơ chế THỨ HAI cùng
mutate `pool:free`.

Đây là **lần thứ hai** trong phiên một brief của tôi trích tài liệu lạc hậu (lần đầu:
A9, §1.4). Cùng một hình dạng: số dòng đúng, nội dung vẫn ở đó, và nó vẫn sai.

Nhưng lượt kiểm ấy lộ ra **hai lỗ thật**, đọc từ log orchestrator trên cụm sau khi
đổi `SANDBOX_IMAGE` p10a → p13ide:

```
07:37:35.038Z / .053Z / .067Z   WARN pod ấm chạy image CŨ — đã rút …
07:38:34.856Z                   WARN (pod p10a thứ tư)
```

1. **Ba lượt teardown trong 30 mili-giây** trên một node Sysbox — đúng hình dạng đã
   dẫn tới `FailedKillPod` → sysbox-fs wedge ở P12 §5b. Với `POOL_TARGET` lớn hơn thì
   là hàng chục. Đã vá: rút khỏi `pool:free` là vô điều kiện, nhưng **xoá khỏi cluster
   có trần** (`maxStaleEvictPerSweep`); phần vượt trần sang `pool:quarantine`.
2. **Dòng thứ tư ở +59s**: replica orchestrator CŨ còn sống và bơm pod ảnh cũ vào cùng
   pool SAU vòng sweep của replica mới. Ai claim trong cửa sổ đó nhận pod cũ, và triệu
   chứng là `/ide` trả 503 — không ai truy về chiến lược rollout. Đã vá ở `207f999`
   (`maxSurge: 0`), xem §2.10.

### 2.10 `maxSurge: 0` cho orchestrator (`207f999`)

Deployment không khai `strategy:` nên nhận mặc định `maxSurge: 25%`, mà **25% của
`replicas: 1` làm tròn LÊN thành 1**. Đó là nguồn của lỗ (2) ở trên.

Cái giá: orchestrator ngưng vài chục giây giữa lượt nâng cấp. Đổi một khoảng hỏng
**ngắn và ồn** (start phiên trả lỗi ngay) lấy một pod sai ảnh **nằm im** trong pool
tới khi có người trúng nó.

⚠ Bảo đảm "không bao giờ hai `SANDBOX_IMAGE`" chỉ đúng ở `replicas: 1`. Với
`replicas > 1`, `maxSurge: 0` vẫn cuộn từng pod nên hai đời VẪN cùng sống.

### 2.11 A4 favicon (`52ccd60`) — và một bẫy đáng nhớ

Bản nháp SVG trích nguyên văn tên biến CSS vào chú thích, mà **XML cấm hai dấu gạch
nối liền nhau** ⇒ cả file hỏng phân tích, Chromium vẽ ra icon "ảnh hỏng".

**File vẫn tồn tại, vẫn không rỗng.** Một test kiểu "có file và khác rỗng" sẽ XANH
trên đúng cái file hỏng đó. Chỉ phép giải nén pixel mới bắt được — và đó là phép đo
đã dùng: 16×16 có 244px đục / 8px trắng, màu chủ đạo khớp hai mã màu định dùng.

`.ico` raster hoá **từ chính `icon.svg`** nên hai file không thể lệch nhau.

### 2.12 A5 — hai vế lồng nhau (`12a8e3b`)

Xem §"SỬA 2026-09-08" trong `reports/harness/2026-09-07-p13-ac613/RESULTS.md`. Tóm
tắt: vá vế "không phát `onResize`" một mình là **vá vào nhánh không bao giờ chạy**, vì
thường không có số mới để phát — `proposeDimensions()` chia cho metric ô chữ đã cache
từ `terminal.open()`, và xterm 6.0.0 không có tham chiếu nào tới `document.fonts`.

Và "7/7 lượt trùng số" gần như chắc chắn không phải ngẫu nhiên: `TERMINAL_FONT_FAMILY`
để `"Cascadia Mono"` ngay sau webfont, nên mọi máy Windows có Windows Terminal cho
metric trước-font bằng sau-font.

## 3. Đo trên cụm

### 3.1 `/ide` qua Traefik — đo được, và nó KHÁC điều plan ghi

`phase-13-exec.md` §3ter mục 10 ghi: *"`/ide` chưa bao giờ đi qua Traefik (6.A/6.B/6.E
đều dùng `port-forward`)"*. Đo 2026-09-08 trên cụm, ảnh CŨ (`p13e`):

| Đường | status |
|---|---:|
| `/ide/session/khong-ton-tai/` | **401** (0.032s) |
| đường không có thật | 308 |
| `/ws/session/x` | 400 |

401 chứ không 404 ⇒ ingress **có** route `/ide` và gateway từ chối vì thiếu cookie.
Vế "chưa bao giờ đi qua Traefik" nay đã sai; vế **trần body 1 MiB** và **tier
`ratelimit-ide` 600/1m burst 300** thì vẫn CHƯA đo (cần một phiên thật và một payload
đủ lớn).

### 3.2 P5:185 — ô AC này BẤT KHẢ về số học, không phải "chưa làm"

Chủ dự án chọn đuổi ô `claim p95 3.9s so với đích 1s`. Đuổi xong thì câu trả lời là:
**không tới được bằng lever mà plan đề xuất**, và lever đó còn nhắm sai chỗ nghẽn.

**Cold path đo được** (apply → `condition=Ready`), n=7, pod thăm dò là bản sao spec
pod sandbox thật (sysbox, `p13ide`), label riêng để reaper không đụng:

```
6072  6760  7002  7223  7312  8223  40211   (ms)
min 6.07s · median 7.22s · 6/7 trong [6.1, 8.2] · 1/7 = 40.2s
```

⚠ **Điều kiện đo:** cụm KHÔNG rảnh — load average **9.9–10.4 trên 12 vCPU** suốt 15
phút. Và **n=7 không tính được p95**; con số 40.2s là 14% số mẫu, tức một đuôi thật
chứ không phải nhiễu.

**Mô hình.** N người bấm Start rải trong cửa sổ W giây; pool phục vụ ấm được
`P + W/7.2`. Ràng buộc vật lý `P + N ≤ 23` (quota 5952Mi ÷ 256Mi). Trần phiên hiển
thị = `23 − P`.

| N | W | P cần | Trần phiên `23−P` | Khả thi (`P ≤ 23−N`)? |
|---|---|---|---|---|
| 18 | 0s | 18 | 5 | ✗ |
| 18 | 30s | 13 | 10 | ✗ |
| 18 | 60s | 9 | 14 | ✗ |
| 18 | 90s | 5 | 18 | ✓ |
| 10 | 30s | 6 | 17 | ✓ |

⇒ **N=18 đồng loạt cần `P ≥ 17`, mà trần vật lý chỉ cho `P ≤ 5`.** Nâng `poolTarget`
không tới được, và mỗi pod ấm còn ăn mất một khe phiên.

**Và cách đặt vấn đề của ô AC cũng sai một nửa.** Nó ghi *"15/18 đi cold path vì warm
pool chỉ có 3 pod"* — nhưng P5 đo **ba người ĐẦU**, đáng lẽ ấm, cũng mất
**3.7 / 3.9 / 3.9s**. Đường claim ấm có một lượt gọi apiserver ĐỒNG BỘ
(`service.go:488` → `podAlive` → `pods.Get`; đo 75ms ở load 5.8, tệ hơn nhiều dưới
tải). Nghẽn nằm ở apiserver, không ở kích thước pool.

**Bốn lever thật, rẻ dần — CHỜ CHỦ DỰ ÁN QUYẾT, không tự chọn:**

1. **Prewarm khi người dùng mở trang bài** — 0 RAM thường trực, tấn công đúng biến
   `W` mà công thức nhạy nhất. Rẻ nhất.
2. **Replenish song song 2–3** — 0 RAM, ~15 dòng, nhưng **lật một quyết định thiết kế
   đã ghi lý do** (`pool/manager.go` tuần tự có chủ ý, tránh hai `Create` cùng đâm
   quota).
3. **`poolTarget` 3 → 5** — mất 2 khe phiên (20 → 18). Chỉ đủ cho N=18 khi W ≥ 87s.
4. **Thu nhỏ image** — lever DUY NHẤT chạm vào chính 7.2s. Chưa đo.

Pod sandbox **không có `readinessProbe`**, nên Ready = container đã start: 6s đó là
chi phí tạo container của Sysbox, không phải dockerd. "Làm app nhẹ hơn" không cắt
được nó.

### 3.3 A7 — CEL #8 KHÔNG chặn dotfiles

Bảng nợ ghi *"`/mnt/dotfiles` chưa có ai mount — CEL #8 cấm `hostPath`"*, đọc ra như
một ràng buộc an ninh cần xin ngoại lệ. Nguyên văn CEL:
`!has(object.spec.volumes) || object.spec.volumes.all(v, !has(v.hostPath))` — nó cấm
**đúng một kiểu** volume. `configMap` / `secret` / `emptyDir` / `projected` / PVC đều
qua. **Không có ngoại lệ nào cần xin.**

Thứ chặn thật là **warm pool**: pod tạo trước khi biết ai claim, nên `BuildSandboxPod`
không có `userId` để đặt tên ConfigMap riêng. Mount theo người dùng ⇒ phải tạo pod lúc
claim ⇒ cold path 6–8s, đúng thứ §3.2 đang cố tránh.

Đường đúng là đẩy nội dung sau claim qua `pods/exec` — cùng kênh `dlp-session-deadline`.
**Cố ý CHƯA dựng**: không tính năng nào đang *sản xuất* nội dung dotfiles (không bảng,
không màn hình, không API). Thêm volume vào MỌI pod spec để chở một thư mục luôn rỗng
là YAGNI. Việc cần làm trước là chọn nơi người dùng **nhập** dotfiles.

### 3.4 Sức chứa theo profile — phủ hết ba trang học (`e1b14ef`, `32ab09a`, `404fa48`)

`profile` nay về từ router (`lessons.get` / `labs.get` / `playgrounds.get`) thay vì
được Server Component tính lại — bỏ được một lượt đọc nội dung thứ hai mỗi lần mở
trang, mà với bài soạn trên DB là một truy vấn thật.

⛔ **Bảng ánh xạ profile KHÔNG được chép sang FE.** `profileForCapabilities` sống ở
`server/lessons/catalog.ts` (chạm `node:path` + DB nên không import được vào
`'use client'`). Phương án "chuyển nó sang `packages/shared-types`" đã được cân và
LOẠI: nó đẩy chính sách cấp phát RAM vào bundle trình duyệt.

Đo trên nội dung THẬT trong kho:

```
LAB dlp-k8s-broken-deploy  caps=[kubernetes]  ⇒ profile="k8s"  (trần 5)
LAB dlp-linux-triage       caps=[]            ⇒ profile=""     (trần 23)
SC  dlp-ide-config-edit    layout=ide         ⇒ profile="ide"  (trần 7)
```

Sáu đột biến chạy thật. Ô đáng giá nhất gác hạng lỗi **"hàm đúng, có test, mà không
call-site nào truyền đúng tham số"**: bỏ `profile={profile}` ở lab + sân chơi ⇒ cổng
kêu **đích danh hai file**.

**Một lỗ hổng lane tự tìm ra và tự nói:** đột biến M7 — cho `labs.get` trả profile
SAI (`''`) — **suite vẫn xanh 109/1252**. Không ô nào gác GIÁ TRỊ profile mà router
trả về; chỗ đúng để đặt (`security/labs-authz.test.ts`) nằm ngoài sở hữu của lane.
Hiện chỉ có phép đo tay ở trên, chạy một lần, không tái lặp.

**`describeCapacity` của vỏ nay là mã chết** (cả năm call-site đã sang
`describeProfileCapacity`) nhưng **giữ lại có chủ ý**: nó là đối chứng thật của công
thức mới ("cùng payload, hai công thức, hai kết quả"); thay bằng hằng `14` gõ tay là
mất tính chất đó. Bù lại nó bị cách ly bằng một cổng tĩnh **hai chiều** — file mới
import ⇒ ĐỎ; mục miễn trừ hết import ⇒ CŨNG ĐỎ.

⚠ Bản đầu của cổng cách ly ấy **đếm theo TÊN và đỏ ngay trên cây đúng**: nó gọi tám
file lành là vi phạm vì `components/session/capacity.ts` có hàm trùng tên. Bản commit
phân giải đường dẫn module.

### 3.5 Suite `apps/web` — một flake chưa bắt được

Lane 6 báo: cùng một cây, lượt này `2 failed / 107 passed / 25 skipped`, lượt NGAY SAU
`109 passed / 1252 / 0 skipped`. Nó không bắt được tên hai ô đó.

Tôi chạy lại **hai lượt liên tiếp**: cả hai `109 file / 1252 ô / 0 skip`. **Không tái
hiện.** Postgres + Redis dev đang chạy trong suốt hai lượt, và `0 skipped` chứng minh
test tích hợp thật sự chạy chứ không lặng lẽ bỏ qua.

⇒ Nghi ngờ ban đầu (phụ thuộc Postgres, `0 skip ↔ 25 skip`) **phù hợp với dữ liệu
nhưng chưa được chứng minh**. Ghi lại như một flake CHƯA đóng, không ghi là đã sửa.

_(phần còn lại sau deploy)_

## 4. Còn lại — nói thẳng

_(cuối phiên)_
