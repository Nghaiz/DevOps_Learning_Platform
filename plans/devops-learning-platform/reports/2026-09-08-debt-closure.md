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

## 3. Đo trên cụm

_(sau deploy)_

## 4. Còn lại — nói thẳng

_(cuối phiên)_
