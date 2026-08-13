# 1.G-5 — M8: hai ô FE, và một harness trình duyệt chưa từng tồn tại

**Ngày:** 2026-08-13 · **Chặng:** 1.G-5 (chặng CUỐI của P1) · **Artifact:** [`harness/2026-08-13-1g5-fe-browser/`](harness/2026-08-13-1g5-fe-browser/)

---

## Kết quả một dòng

Hai ô AC của M8 **ĐÓNG**, và một trong hai chỉ đóng được **sau khi viết lại câu chữ** — vì tiền đề của nó sai: **tắt hardware acceleration KHÔNG xoá WebGL2.** Kèm theo, harness dựng ra để đo hai ô đó tìm thêm **một lỗi thật** (mọi lần mount gửi một frame `resize` thừa) và **một lỗi trong chính dụng cụ đo** (bộ kiểm đột biến đọc "không đọc được kết quả" thành "xanh").

| Đại lượng | Trước | Sau |
|---|---|---|
| Ô AC đã tick (đếm literal `- [x]`/`- [ ]`) | 65/67 | **69/69 — không còn ô trống nào trong cả phase** |
| Test `packages/terminal` | 91 (1 tầng) | **111** (3 tầng: node 91 · gpu-on 10 · gpu-off 10) |
| File có test chạm `terminal-core.ts` | **0** | 2 |
| Cổng CI gác `packages/terminal` trong trình duyệt | **không có** | job `terminal-browser` trong `needs` của `ci-ok` |
| Kiểm đột biến | — | **6 phép, 6 bị bắt** |

---

## 1. Phát hiện chính: ô AC "tắt hardware acceleration" sai tiền đề

Ô AC gốc: *"Tắt hardware acceleration → terminal vẫn chạy (fallback DOM renderer) + có `console.warn`."*

Đo bằng Chrome 151 đã cài (`channel: 'chrome'`), năm cảnh launch, chạy cả `headless` lẫn headed — artifact [`webgl-flag-probe.txt`](harness/2026-08-13-1g5-fe-browser/webgl-flag-probe.txt), script [`probe-webgl.mjs`](harness/2026-08-13-1g5-fe-browser/probe-webgl.mjs):

| Cờ launch | WebGL2 | renderer |
|---|---|---|
| *(mặc định — đối chứng dương)* | **PRESENT** | ANGLE (NVIDIA RTX 4060, D3D11) |
| `--disable-gpu` ← **đúng nghĩa "tắt hardware acceleration"** | **PRESENT** | ANGLE (Google, **SwiftShader**) |
| `--disable-gpu --disable-software-rasterizer` | **ABSENT** | — |
| `--disable-3d-apis` | **ABSENT** | — |
| `--use-gl=disabled` | **ABSENT** | — |

**Đọc cho đúng:** ở cảnh mà ô AC gọi tên, Chrome tắt tiến trình GPU nhưng **vẫn cấp WebGL2 qua SwiftShader** (chạy trên CPU). `new WebglAddon()` + `loadAddon` **thành công**, `console.warn` **không** chạy, renderer **vẫn là WebGL**. Ô AC như đã viết **không bao giờ quan sát được thứ nó tồn tại để quan sát**.

> **Đây là lần thứ ba trong P1 một ô AC đọc sai điểm thực thi**, sau `--icons=auto` (một phép kiểm không thể đỏ) và `pids.max` đọc từ trong pod (Sysbox biên tập điểm quan sát). Mẫu chung: **tên của cảnh không phải là cảnh.** Cái giá cụ thể nếu không phát hiện: người tiếp theo dựng harness, chạy `--disable-gpu`, thấy không có `console.warn`, rồi đi "sửa" một nhánh fallback vốn đã đúng.

**Vì sao ở đây được đo trước rồi mới viết lại AC**, trong khi 1.G-4 P1 bắt chốt ngưỡng TRƯỚC: luật đó tồn tại để một con số của **hệ thống ta** không tự biện minh cho ngưỡng của chính nó. Bảng trên là **một sự thật về Chrome**, đúng như nhau dù `terminal-core.ts` viết thế nào — không có gì để tự biện minh.

**AC viết lại thành hai vế, mỗi vế là đối chứng của vế kia:**

- **(a) `gpu-off`** (`--disable-3d-apis`): `createTerminalCore` **không ném** · `console.warn` mang đúng thông điệp fallback · **không có** canvas WebGL trong DOM · `.xterm-rows` tồn tại · terminal vẫn ghi được dữ liệu.
- **(b) `gpu-on`** (mặc định): WebGL2 **có** · **KHÔNG** có `console.warn` fallback · canvas WebGL **có** trong DOM.

*Kèm theo, đã đo và ghi:* `headless` và headed cho **cùng** kết quả ở cả năm cảnh ⇒ chạy headless trong CI là hợp lệ. Vế này được **đo** chứ không giả định — GPU trong headless là một chỗ khác biệt kinh điển.

---

## 2. Ba phát hiện kế toán (tìm lúc scout, trước khi viết dòng code nào)

1. **`vitest.config.ts` mô tả một file KHÔNG TỒN TẠI.** Docblock cũ viết *"File nào thật sự cần DOM tự khai bằng docblock `@vitest-environment jsdom` (`react-binding.test.tsx`)"* — không có file đó trong repo, và chưa từng có. Đây là ảnh gương của D-21′: ở đó một **nợ đã trả mà không ai đóng sổ** trông giống nợ chưa trả; ở đây một **lời hứa chưa ai giữ** trông giống việc đã làm. Nó đã che đúng ô AC StrictMode suốt từ 1.F.
2. **`connection.test.ts:194` trông y hệt ô AC StrictMode nhưng đo tầng KHÁC.** Ca tên `'mở rồi đóng 3 lần liên tiếp ⇒ 0 socket còn sống (AC StrictMode)'` chạy trên `openConnection` với socket giả, **không dựng React** — nó gác `connection.ts`. Ô AC hỏi về `terminal-surface.tsx`: deps của `useEffect`, thứ tự cleanup, `coreRef` còn sống hay không. Kiểm đột biến **M4** chứng minh khoảng cách: bỏ `connection.close()` trong cleanup của effect ⇒ 4 ca mới ĐỎ, ca cũ ở `connection.test.ts` **vẫn xanh**.
3. **Nhánh `activate()` thoát sớm nằm NGOÀI try/catch.** `WebglAddon.activate()` có đường `if (!terminal.element) { onWillOpen(() => this.activate(t)); return }` — activate thật xảy ra **sau**, bất đồng bộ, ngoài khối `try`. Hôm nay an toàn **chỉ vì** `terminal.open()` gọi trước `loadAddon`. Đảo hai dòng đó là biến fallback có kiểm soát thành unhandled error. Chưa có test nào gác thứ tự này — **ghi làm nợ**, xem §6.

---

## 3. Ô AC StrictMode: kế toán ba con số, không phải một

React 19 ở dev chạy effect **mount → cleanup → mount**. Nên một chu kỳ mount/unmount đúng phải dựng **2** socket và đóng **1**. Ba chu kỳ kết thúc ở trạng thái đã mount ⇒ **dựng 6 · đóng 5 · sống 1**. Đo được đúng như vậy.

> ⛔ **Chỉ assert `alive === 1` là không đủ, và đây là vế quan trọng nhất của ca này.** Một cảnh **không hề double-invoke** (StrictMode không bật, hoặc React chạy bản production) cũng cho `alive === 1` — và khi đó test khẳng định đúng cái nó không kiểm. `constructed === 6` là vế **duy nhất** chứng minh cảnh StrictMode thật sự đã dựng.

Kèm hai vế nữa: assert `alive === 1` **sau MỖI lần mount** (không chỉ ở cuối — một hiện thực rò 1 socket mỗi mount vẫn cho "còn 1" ở cuối nếu chỉ đo cuối), và `alive === 0` sau unmount cuối.

**Đếm ở `globalThis.WebSocket`, không tiêm `socketFactory`:** `TerminalSurface` gọi `openConnection` **không** truyền factory, nên đường production đọc đúng biến toàn cục. Tiêm factory là đo một đường mà component không đi.

---

## 4. Lỗi thật do harness tìm ra: mỗi lần mount gửi một frame `resize` THỪA

Ca test *"mount rồi KHÔNG đổi gì ⇒ 0 frame resize"* **ĐỎ ở lượt chạy đầu tiên**. Chẩn đoán rời: mount một terminal và **không chạm gì cả** vẫn sinh đúng một `onResize({cols:78, rows:16})` sau ~50ms, có hay không có `measure()` thủ công.

**Nguyên nhân gốc:** `lastNotified` được seed bằng `lastSize`, mà lúc dựng `lastSize` là **mặc định 80×24 của xterm** — trước mọi phép đo thật. `ResizeObserver` **luôn** bắn một lượt ngay khi `observe()`; lượt đó đo được 78×16, thấy khác 80×24, và phát.

**Hậu quả production:** mọi phiên gửi một `resize` thừa ngay sau `init`, mang **đúng kích thước mà `init` vừa gửi** (contract §3 bước 4). Và nó mâu thuẫn thẳng với hợp đồng ghi trong chính file đó — docblock `onResize`: *"KHÔNG gọi cho lần đo đầu tiên."*

**Bản vá (quyết định người dùng 2026-08-13):** lượt đo **đầu tiên** chỉ GHI `lastNotified`, không phát.

> **Đường vá bị loại và lý do:** seed `lastNotified = measure()` lúc dựng cũng đóng được lỗi, nhưng nó ép `fit()` chạy **trước khi font tải xong** — đúng thứ F4 cấm, vì `proposeDimensions()` khi đó chia theo metric font fallback.
> **Ranh giới còn đúng sau bản vá:** container 0×0 lúc mount rồi mới có kích thước ⇒ lượt đầu ghi 80×24, lượt sau thấy khác ⇒ **vẫn phát**. Bản vá bỏ frame thừa, không bỏ frame thật.

Kèm **một ô AC mới** ở §Terminal UX (quyết định người dùng): *"mount không đổi gì ⇒ 0 frame resize"*.

> ⚠ **Mẫu số ô AC đã trôi, và nó chỉ lộ ra khi đếm thay vì chép.** Bản ghi 2026-08-12 dùng mẫu số **69**; đếm literal lúc mở chặng này chỉ có **67** ô (65 tick, 2 trống). Nguyên nhân: 1.G-3 và 1.G-4 **gộp và viết lại** vài ô (ô luật 5 nuốt các vế con; ô `pids.max` đổi thành hai vế trong một ô) mà không ai cập nhật mẫu số. **Bản nháp đầu của chính report này viết "67/69" vì suy ra từ dòng cũ chứ không đếm** — đúng bẫy D-21′, bắt được lúc rà soát. Từ nay đếm bằng `grep -cE '^\s*- \[[x ]\]'`.

---

## 5. Kiểm đột biến — 6 phép, 6 bị bắt

Artifact: [`mutation-log.txt`](harness/2026-08-13-1g5-fe-browser/mutation-log.txt) · script [`mutate.mjs`](harness/2026-08-13-1g5-fe-browser/mutate.mjs). Baseline 20/20 xanh trước mỗi lượt.

| # | Đột biến | Kết quả |
|---|---|---|
| M1 | `lastNotified` seed lại bằng `lastSize` (bỏ bản vá §4) | ✅ ĐỎ — 8 ca, gồm đúng ca "mount rồi KHÔNG đổi gì" |
| M2 | Bỏ `console.warn` trong catch WebGL | ✅ ĐỎ — **đúng 1 ca**, chỉ ở `gpu-off` |
| M3 | Catch WebGL ném lại thay vì fallback | ✅ ĐỎ — 9 ca, gồm "createTerminalCore KHÔNG ném" |
| M4 | Bỏ `connection.close()` trong cleanup effect | ✅ ĐỎ — 4 ca StrictMode |
| M5 | `RESIZE_DEBOUNCE_MS` 50 → 5 | ✅ ĐỎ — 2 ca debounce |
| M6 | Bỏ cờ `--disable-3d-apis` khỏi project `gpu-off` | ✅ ĐỎ — ca tiền đề WebGL + ca fallback |

**M6 là phép quan trọng nhất và nó gác chính cái harness**: nếu một bản Chromium tương lai đổi hành vi cờ, project `gpu-off` sẽ ĐỎ ở ca tiền đề thay vì lặng lẽ chạy **có** WebGL rồi khẳng định "fallback đã được kiểm".

### ⛔ Bộ kiểm đột biến có LỖI ở lượt chạy đầu, cùng họ với thứ nó đi tìm

Lượt đầu, M3 báo **"XANH — đột biến KHÔNG bị bắt"**. Sai. Đột biến M3 khi đó gây **lệch dấu ngoặc**, vitest chết trước khi in báo cáo JSON, và hàm đọc kết quả trả `failed = 0` — script đọc `0` thành "không ca nào đỏ".

Đây **đúng** họ lỗi mà P1 đã ghi thành luật ở "suite xanh vì mọi test đều skip" và ở Trivy `--exit-code 1` nuốt stderr: **không phân biệt "đã chạy và qua" với "chưa chạy được"**. Bản vá cho harness: bắt buộc `parsed === true` **và** `total === baseline.total`, nếu không thì báo *"KHÔNG ĐỌC ĐƯỢC KẾT QUẢ"* chứ không bao giờ báo xanh.

*Bẫy đi kèm, ghi để lần sau không mất 3 lượt:* file nguồn là **CRLF**, nên mọi anchor đột biến nhiều dòng viết bằng `\n` đều **không khớp** và bị báo "KHÔNG TÌM THẤY chuỗi gốc" — trông giống hệt "đột biến không áp dụng được" chứ không giống "regex sai". Dùng `\r?\n`.

---

## 6. Ranh giới — những gì chặng này KHÔNG chứng minh

- **Nhánh Safari < 16 không đo được.** `new WebglAddon()` đã chuyển **vào trong** `try` (bản vá chặng này). Lý do là bằng chứng chứ không phải phòng thủ: đọc dist `@xterm/addon-webgl@0.19.0`, constructor có **đúng một** nhánh ném — `isSafari && safariVersion < 16` → `throw new Error("Webgl2 is only supported on Safari 16 and above")`. Để ngoài `try` thì trên Safari 15 `createTerminalCore` **ném** ⇒ cả terminal không dựng được, chứ không phải "rơi về DOM renderer". **Nhưng harness là Chromium**, và Chrome đi nhánh khác (`"WebGL2 not supported"` bên trong `activate()`, vốn đã được bọc) ⇒ **không có ca test nào chạy nhánh Safari**. Bản vá đúng, và nó **chưa có gì gác**.
- **Thứ tự `open()` trước `loadAddon()` chưa có gì gác** (xem §2 mục 3).
- **Chưa đo trên trang `/session` thật.** Hai ô AC đo ở tầng component. Ô StrictMode **không** đo được trên deploy production vì StrictMode double-invoke chỉ chạy ở dev build — nói rõ ra thay vì để "đã đo trong trình duyệt" ngụ ý đã đo đường người dùng.
- **Playwright MCP không phải cổng gác.** `@playwright/mcp` 0.0.78 chạy `--extension`, gắn vào Chrome đang chạy ⇒ không đặt được `launch.args` (không dựng được cảnh `gpu-off`) và không chạy trong CI. Nó đã dùng để dò bảng §1 và vẫn tốt cho việc nhìn tận mắt.
- **`playwright-core` đi kèm MCP ghim chromium build 1232** trong khi máy có 1208/1228 ⇒ `chromium.launch()` mặc định chết ở `Executable doesn't exist`. Bảng §1 đo được nhờ `channel: 'chrome'`. Ai chạy lại phải biết, nếu không sẽ đọc "launch failed" thành "cờ không hoạt động".

---

## 7. Cổng CI

Job **`terminal-browser`** vào `needs` của `ci-ok`. Job riêng chứ không nhét vào `ts`: `ts` chạy `turbo run test` cho mọi package, nên cài chromium ở đó bắt **mọi** lượt chạy TS trả giá tải trình duyệt, và khi đỏ thì không đọc ngay được là hỏng typecheck hay hỏng trình duyệt. `packages/terminal` vì thế tách `test` (project `node`) khỏi `test:browser` (hai project chromium).

⛔ **KHÔNG có `paths:` trên job này** — `ci-ok` là required check, và một job skip-by-paths bị GitHub báo `Expected — Waiting` vĩnh viễn ⇒ deadlock merge (`rules/ci-cd-trigger-design.md` §3). Cache trình duyệt khoá theo **đúng version playwright** đọc từ CLI, không theo `hashFiles('pnpm-lock.yaml')` (mọi thay đổi dependency không liên quan cũng thổi bay 130 MB cache) và không theo hằng số (nâng playwright xong vẫn nạp browser cũ). `actions/cache@v4.3.0` ghim SHA `0057852…`, **đã đối chiếu với `refs/tags/v4.3.0` qua GitHub API** chứ không chép từ trí nhớ.

---

## 8. Số đo cuối

```
packages/terminal · node      →  91 PASS / 0 FAIL
packages/terminal · gpu-on    →  10 PASS / 0 FAIL   (chromium, WebGL2 PRESENT)
packages/terminal · gpu-off   →  10 PASS / 0 FAIL   (chromium --disable-3d-apis, WebGL2 ABSENT)
turbo run lint typecheck build test  →  16/16 tasks OK   (apps/web 95 PASS)
kiểm đột biến                 →  6 phép / 6 bị bắt
```

Go **không đụng tới** ở chặng này (diff chỉ chạm `.github/workflows/ci.yml`, `.gitignore`, `packages/terminal/**`, `plans/**`, lockfile).
