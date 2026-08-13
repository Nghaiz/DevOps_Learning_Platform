# P2 / 2.D — Split-pane lesson UI + e2e trên cụm

**Ngày:** 2026-08-13 · **Phạm vi:** 2.D (FE) và bốn ô AC cần cụm thật của 2.C/2.E.
**Deploy đo được:** web `sha-a8663e0`, gateway `sha-80b4b6c`, helm revision 45.

---

## 1. Ô AC "Check trả pass/fail đúng" KHÔNG đóng được bằng nội dung đã vendor

Plan chỉ định `ckad-configmap-as-files` làm bằng chứng, và cảnh báo đừng dùng
`prolug-*` vì `verify.sh` của nó là `/bin/true` nên **vế fail bất khả**. Cảnh báo
đó đúng. Nhưng chính bài được chỉ định lại hỏng theo chiều **ngược lại** — và vì
hai lý do độc lập nhau:

| bài | verify | vì sao không sinh được cặp pass/fail |
|---|---|---|
| `ckad-configmap-as-files` | `kubectl` + `jq` | image sandbox **không có `kubectl`** (đọc `images/sandbox-base/Dockerfile`) ⇒ luôn `command not found` ⇒ **vế pass bất khả**. Và kể cả có kubectl: nó dùng `[[ ]]` + `set -euo pipefail`, chết dưới `sh` (xem §2.3). |
| `prolug-linux-system-checking` | `/bin/true` | luôn pass ⇒ vế fail bất khả (plan đã ghi) |
| `loki-quickstart` | — | **không phase nào** có verify |
| `loxilb-tcp-load-balancing` | `stat /var/run/netns/loxilb` | cần 12 asset đẩy vào pod (tầng chưa tồn tại trước lượt này) **và** egress internet cho `apt` + `docker pull`, mà NetworkPolicy `default-deny` chỉ mở DNS |

`prolug` không fail được, `ckad` không pass được — hai mặt của **cùng một** cái
bẫy, và plan chỉ nhìn thấy một mặt.

**Đường đã chọn (chủ dự án chốt):** soạn bài first-party `dlp-sandbox-basics` chỉ
dùng thứ CÓ THẬT trong image (bash, coreutils, `jq`, Docker/DinD), không cần
egress. 4 step, mỗi step một verify hai-giá-trị-thật, kèm 1 asset để chứng minh
luôn tầng asset-push. Đây cũng là hình dạng bài mà yêu cầu "soạn bài trên UI"
(§Yêu cầu nền tảng #3) sẽ đẻ ra.

> **Điều này KHÔNG chứng minh** "mọi bài Killercoda upstream chạy được". Nó chứng
> minh đường chấm chạy đúng trong pod cô lập. Vế còn lại bị chặn bởi năng lực
> sandbox (không kubectl, không egress), không phải bởi mã của 2.C.

---

## 2. Bốn lỗi mà mọi cổng offline đều xanh

Lint, typecheck, unit test, `next build` — tất cả xanh trong khi cả bốn lỗi dưới
đây đang sống.

### 2.1 `.dockerignore` loại `**/*.md` — nội dung bài CHƯA BAO GIỜ vào image

`content/scenarios/**/*.md` bị loại khỏi build context. Image có đủ thư mục
scenario và `index.json`, nhưng **rỗng nội dung**: `loadScenarios` đọc `step1.md`
và chết ENOENT ở request đầu tiên.

Bẫy này sống sót qua 2.B vì phép kiểm lúc đó là `ls $SCENARIOS_DIR` — nó liệt kê
**thư mục**, mà thư mục thì có thật. Phép kiểm đủ mạnh phải đếm file trong image:

```
trước:  find $SCENARIOS_DIR -name "*.md" | wc -l  →  0
sau:    find $SCENARIOS_DIR -name "*.md" | wc -l  →  26
```

Đây là lần **thứ hai** cùng một bài học ("build xanh, test xanh, `/lessons` vẫn
chết") cắn ở cùng một chỗ — 2.B đóng vế `COPY`, lượt này đóng vế `.dockerignore`.

### 2.2 Gateway đang chạy CŨ HƠN cả 2.C

Deploy là `sha-a6f6768` — commit **trước** khi `internal/execroute` tồn tại
(`git ls-tree a6f6768 -- .../execroute` trả rỗng). `POST /exec/session/{id}` trả
404. 32 ca test Go của 2.C xanh suốt vì chúng test **mã trong repo**, không test
**binary đang chạy**.

### 2.3 `GATEWAY_EXEC_SHELL: sh` — và cách nó GIẢ TRANG thành bài làm sai

Nội dung Killercoda là script bash (`[[ ]]`, `set -euo pipefail`); `sh` trong
image sandbox là dash:

```
sh: 3: set: Illegal option -o pipefail        (exit 2)
```

Phần nguy hiểm không phải lỗi, mà là **cách nó hiện ra**: exit 2 được dịch thành
`passed:false` — đúng cái nhãn mà một bài **chưa làm** cũng nhận. Lượt đo đầu của
tôi báo `PASS  AC pass/fail — vế FAIL`, và nó **xanh vì lý do sai**: script chưa
chạy nổi dòng nào. Chỉ đọc `output` mới thấy.

Đã đổi mặc định sang `bash` ở cả `values.yaml` lẫn `config.go`.

> Hệ quả còn lại, ghi ra vì nó không sửa được ở tầng này: phép chấm dựa trên exit
> code (contract Killercoda) **không phân biệt** được "script lỗi" với "bài sai"
> khi cả hai cùng trả khác 0. Đổi sang `bash` xoá nguyên nhân hệ thống, không xoá
> lớp lỗi.

### 2.4 `useInfiniteQuery` gửi `direction` → `/lessons` hỏng hoàn toàn

```
GET /api/trpc/lessons.list?batch=1&input={"0":{"direction":"forward"}}  → 400
[{"code":"unrecognized_keys","keys":["direction"]}]
```

`listInputSchema` là `.strict()` (luật 3) nên nó từ chối — **đúng thiết kế**. Hai
thứ này không tương thích với nhau.

**Đây là lỗi mà e2e API không thể bắt.** Harness gọi thẳng
`lessons.list({limit:100})` và xanh 14/14, trong khi trang thật đỏ 400 — vì
harness không đi qua đoạn mã sinh input của client. Ảnh
`browser-lessons-list-BROKEN-before-fix.png` là cùng trang đó trước khi sửa.

Sửa bằng `useQuery`, **không** bằng cách thêm `direction` vào schema: server
không đọc field đó, nên thêm nó là nới lỏng một cổng bảo mật để chứa một field vô
nghĩa.

---

## 3. Sáu tiền đề của 2.D mà task list không liệt kê

| # | Lỗ hổng | Vì sao nó chặn 2.D |
|---|---|---|
| 1 | `packages/terminal` không có đường gõ vào PTY | `TerminalSurface` giữ `Connection` trong ref riêng; `TerminalCore.write()` **vẽ lên màn hình**, không tới stdin. Nút `{{exec}}` và `foreground` đều bất khả. → thêm `onReady(handle \| null)` |
| 2 | Tailwind KHÔNG quét `packages/ui` | **đã hỏng sẵn trên main**, xem §4 |
| 3 | `PROTECTED_PATHS.includes()` khớp chính xác | `/lessons/<id>` **không được gác**; `/dashboard`/`/session` không lộ ra vì chúng không có đường con |
| 4 | `Scenario.assets[]` không có người tiêu thụ | parse từ 2.A rồi dừng; `loxilb` chạy `sudo ./start.sh` mà file chưa từng vào pod |
| 5 | `content/` không phục vụ qua HTTP | `![diagram](./assets/topology.png)` 404 |
| 6 | `source` của sidecar không nullable | bài first-party không có upstream để ghim |

Về #6: nullable là mô hình **đúng**, không phải nới lỏng để lách. Bản
`ScenarioSource` chạy trên DB (soạn bài trên UI) sẽ sinh ra toàn bài không
upstream; bắt chúng khai một `source` giả là biến một field kiểm-license-được
thành field chứa dữ liệu bịa.

---

## 4. Một lỗi CSS đã chạy trên main từ trước — có đối chứng

`globals.css` chỉ có `@import 'tailwindcss';`. Tailwind v4 dò source từ thư mục
chứa file CSS và **cố ý bỏ qua `node_modules`** — mà workspace package lại được
pnpm nối vào đúng đó.

Đo trên `.next/static/chunks/*.css`, cùng một phép đếm cho cả hai nhóm:

| class | chỉ có trong packages/ui | trước | sau `@source` |
|---|---|---|---|
| `ring-slate-400` | ✓ | **0** | 1 |
| `bg-slate-700` | ✓ | **0** | 1 |
| `bg-slate-200` | ✓ | **0** | 1 |
| `bg-slate-50` | (có trong apps/web) | 1 | 1 |
| `antialiased` | (có trong apps/web) | 1 | 1 |

Nghĩa là mọi `<Button>` đang chạy **không có hover, không focus ring, không
disabled** — ba biến thể màu của nó chưa từng vào bundle. Lỗi im lặng theo đúng
nghĩa tệ nhất: không cảnh báo build, không lỗi runtime, chỉ là giao diện "hơi
nhạt".

---

## 5. Bằng chứng

### 5.1 E2E trên cụm — 14/14 PASS (`harness/2026-08-13-2d-lessons-e2e/`)

Đi qua đúng API trình duyệt gọi (đăng ký → tRPC → gateway → apiserver → pod).

| Ô AC | Số đo |
|---|---|
| **pass/fail đúng** | vế FAIL: `exit 1`, `"Chua thay /root/lab/hello.txt"` (thông báo **của bài**, không phải lỗi shell) → vế PASS: `exit 0`, `"Dat — ... da co noi dung dung."` |
| tiến độ | `stepIndex 0 → 1`, `status=in-progress` |
| **setup script** | `ran=true`, `.setup-done = ready` trong pod; `foreground` **trả về** cho FE |
| **asset-push** | `assetsPushed=1`, file có thật trong pod, mode `644`, nội dung nguyên vẹn |
| **NetworkPolicy** | `169.254.169.254` bị chặn (verify khẳng định **ngược**), `exit 0` |
| ↳ **đối chứng âm** | `curl https://example.com` trong pod → `exit=28`. Không có dòng này, ô trên vẫn xanh cả khi verify chạy nhầm chỗ |
| lỗi ≠ bài sai | `sessionId` lạ → **ném** `NOT_FOUND`, không phải `passed:false` |

### 5.2 Trình duyệt thật (`browser-checks.txt`)

Gác đăng nhập theo tiền tố (`/lessons/<id>` → 307, `/lessonsfoo` → 404 — chặn
over-match) · nút "Kiểm tra" **ẩn** ở phase không có verify, xác nhận trên cả
`loki-quickstart` (không phase nào có verify) · nhãn `Bước N` cho step thiếu
title trên nội dung thật · 12 nút "Chép" + 4 nút "Chạy" trên nội dung vendored ·
route asset: 200 cho ảnh, **404 cho `start.sh`** (allowlist không phát script
sandbox), 404 cho traversal thô lẫn đã mã hoá, 401 khi chưa đăng nhập.

**Resize — thứ jsdom không chứng minh được:**

```
ban đầu     aria-valuenow=50  left=854px  right=848px
ArrowRight  aria-valuenow=52  left=888px  right=814px    (bố cục ĐỔI THẬT)
End         aria-valuenow=80 = aria-valuemax  left=1366px
localStorage['dlp-lesson-split'] = "0.8"
```

### 5.3 Cổng

```
pnpm lint       9/9 ✓
pnpm typecheck  10/10 ✓ (gồm next build — 13 route)
pnpm test       378 ca: web 156 · terminal 91 · scenario 79 · ui 29 · shared-types 23
gofmt -l        sạch · GOOS=linux go vet ./... sạch
go test         execroute + podexec + config ✓
```

---

## 6. Còn hở — nói rõ chứ không giấu

| Món | Trạng thái | Ghi chú |
|---|---|---|
| Terminal WS trong trình duyệt | ⬜ chưa đo qua UI | Port-forward chỉ tới `platform-web`; `/ws/*` là gateway, cần ingress (P3). Đường WS đã đóng ở 1.F; **chưa** đo là bản 2.D gọi đúng nó. |
| `{{exec}}` bơm lệnh thật vào PTY | ⬜ | Cùng lý do: cần WS sống. `onReady`/`sendInput` có test đơn vị, chưa có lượt bấm thật. |
| Bài vendored chạy trọn vẹn | ⬜ | `ckad` cần kubeadm-in-pod (P3); `loxilb` cần egress. Ngoài phạm vi 2.D. |
| Browser-mode vitest cho `packages/ui` | ⬜ | Ô "resize" đã đóng bằng Playwright trên cụm (§5.2). Một cổng browser-mode thường trực trong CI vẫn là món nợ. |
| `{{TRAFFIC_*}}` | ⬜ có chủ ý | Không có tầng thay thế biến; hiện nguyên văn. |
| Ảnh remote trong `loki-quickstart` | ⚠ | CSP `img-src 'self' data:` chặn. Render placeholder + link thay vì `<img>` hỏng. Không nới CSP cho 3 tấm ảnh. |

**Nợ kỹ thuật cố ý:** `/lessons` nạp một trang duy nhất (`limit` mặc định của
server). Vượt trần thì **nói ra** thay vì cắt im lặng. Phân trang thật đi cùng
bản `ScenarioSource` DB-backed — cùng lúc với việc `lessons.list` thôi nạp cả
catalog vào bộ nhớ (nợ đã ghi ở 2.B).

**Một mã chết tôi tự viết rồi tự gỡ:** guard traversal trong
`packages/scenario/src/assets.ts` không đầu vào nào tới được (`name` đến từ
`readdir`, không từ `index.json`). Đã gỡ và ghi lý do tại chỗ, thay vì để nó
trông như một lớp bảo vệ. Guard traversal **thật** nằm ở route HTTP — nơi đường
dẫn đến thẳng từ URL người dùng — và đã được đo ở §5.2.
