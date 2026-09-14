# P16 — Đóng nợ toàn phần trước khi sang P17

**Nhánh:** `feat/p16-debt-closure` · **Đích:** merge vào `main` qua PR
**Phạm vi do chủ dự án chốt 2026-09-13:** đóng cả nợ trong phạm vi P16 **và** ba ranh giới §8
vốn được tuyên bố ngoài phạm vi. Cộng một chỉ đạo mới về bố cục khoang làm việc.

---

## 0. Trạng thái nền đã đo

| Sự thật | Bằng chứng |
|---|---|
| Nhánh 11 commit trước `main`, `main` == `origin/main` | `git rev-list --left-right --count main...HEAD` = `0 11` |
| 6 commit chưa push, **chưa có PR nào** | `git rev-list ...origin/feat/p16-debt-closure` = `0 6`; `gh pr list` = `[]` |
| 7 file đang sửa dở chưa commit | `git status --short` |
| 200 file đổi, +12 585 / −3 327 | `git diff main...HEAD --stat` |
| 9 worktree lane P16 còn sót | `git worktree list` |
| Landing **có** 3D thật (đảo ngược chỉ đạo 09-12) | `experience-scene.tsx:41` `<Canvas frameloop="demand">` |
| Cột `interface_layout` ĐÃ có trong DB | `apps/web/src/server/db/schema.ts:488` |
| `arena.css` 43 màu trần; `use-arena-colors.ts` đã có sẵn đường đọc token | `scene/use-arena-colors.ts` |
| Chỉ MỘT chỗ dùng `after()` để gửi thư | `server/auth/password-reset-mail.ts:20` |
| Commit cuối chạm `k8s-arena/**` là `3257e1f` (2026-09-10), TRƯỚC nhánh này | `git log -- .../k8s-arena/` |

**Arena ra ngoài phạm vi, do chủ dự án chốt lại 2026-09-13.** Hai dòng miễn trừ theo phạm vi
trong `KNOWN_HARDCODED` (`arena.css` 43 màu trần, `scene/node-geometry.ts`) **được giữ nguyên**
và trở thành đầu vào P17. Chú thích nợ trong `scripts/check-design-tokens.mjs` đã ghi đúng
điều kiện rà lại; không sửa nó thành "vĩnh viễn".

---

## 1. Ô nghiệm thu toàn đợt

Đợt này XONG khi tất cả đúng, không ô nào được thay bằng lời khai:

1. `git status --short` rỗng; nhánh đã push; PR mở và merge vào `main`.
2. Không còn dòng tài liệu/hợp đồng nào khẳng định landing không có 3D/canvas/WebGL.
3. `contracts/p16-tokens.md` có bảng 10 token `--journey-*` và **không còn** miễn trừ
   reduced-motion cho landing.
4. Tab IDE hiện **chỉ** IDE; tab Terminal hiện **chỉ** terminal. Phiên PTY sống qua mọi lượt
   đổi tab, có test khẳng định cùng node cha **và** cùng phiên.
5. Lab khai được `interfaceLayout: 'ide'` và trang lab hiện tab Editor thật.
6. Gửi thư reset có hàng đợi bền vững sống qua việc tiến trình chết, có test khẳng định.
7. Mọi spec E2E đều có ít nhất một lệnh trong repo gọi tới nó, và mọi ô tự-`skip` đều nói rõ
   biến nào bật nó — một suite tự tắt trong im lặng là một ô xanh không đo gì.
8. `pnpm -w turbo run build lint typecheck test --force` xanh, đọc `Tasks: X/Y` trước khi
   trích bất kỳ số nào.
9. E2E profile mặc định xanh; profile landing-3d xanh; cả hai khai đủ ba biến bắt buộc.
10. Không có cổng nào bị nới, tắt, hay thêm miễn trừ để đóng một mục trong danh sách này.

---

## 2. Lane

Chạy tuần tự theo thứ tự rủi ro tăng dần trên cùng một cây (không fan-out worktree — diff đã
200 file, thêm lane song song là mời đúng lớp lỗi đè file mà §5 ghi).

### L0 — Chốt việc đang dở  *(S · không rủi ro)*

7 file uncommitted là phần cô lập harness 3D + chuyển đối chứng âm `three` sang `/login`.
Đã được review chấp nhận. Commit dạng pathspec.

→ verify: `git status --short` rỗng.

### L1 — Sự thật tài liệu  *(M · chặn-merge)*

Nợ nguy hiểm nhất, vì hai dòng đang **cấp phép miễn trừ** cho một bề mặt nay có rAF + GPU thật.

| Việc | File |
|---|---|
| Xoá khẳng định "landing không còn canvas/rAF/3D" khỏi §7 cổng reduced-motion | `contracts/p16-tokens.md:635` |
| Sửa khối "Cập nhật 2026-09-13" đang ghi quyết định 09-12 dưới nhãn ngày 09-13 | `p16-tokens.md:563` |
| Thêm bảng 10 token `--journey-*` vào hợp đồng token (SSOT đang thiếu hẳn) | `p16-tokens.md` §màu |
| Sửa 11 dòng landing lỗi thời, đặc biệt ô miễn nghiệm thu §597 và bảng rủi ro §528 | `phase-16.md` |
| Trỏ hợp đồng landing hiện hành sang bản 09-13 | `phase-16.md:5` |
| Gắn nhãn superseded cho nhóm report 09-12 | `reports/p16-2026-09-12-*.md` |
| Một dòng phân định hai completion report cùng ngày 09-13 mâu thuẫn nhau | `reports/p16-2026-09-13-completion.md` |
| Cập nhật số nền bundle 998 512 B → số đo hiện tại | `docs/bundle-budget.md:66-77` |

→ verify: grep không còn hit nào cho mẫu "không.*(3D\|canvas\|WebGL)" trong plan/contract mô tả
landing; cổng bundle xanh với bảng nền mới.

### L2 — Khoang làm việc: tab IDE chỉ có IDE  *(M · rủi ro CAO)*

Chỉ đạo mới 2026-09-13. Đổi hình thái khoang, giữ nguyên bất biến sống-chết.

**Phân biệt phải giữ đúng:** bất biến là *terminal không đổi node cha* (đổi cha = unmount =
đóng WebSocket = mất phiên, không lỗi nào bắn). Ẩn bằng thuộc tính `hidden` **không** unmount,
nên nó hợp lệ. Câu "KHÔNG BAO GIỜ `hidden`" ở `workspace-panel.tsx:64` là lựa chọn thiết kế
KillerCoda, không phải ràng buộc kỹ thuật — nó được thay, và chú thích phải nói rõ vì sao.

1. Hàng 2 (terminal) nhận `hidden` khi ở tab Editor. Ba con tĩnh giữ nguyên vị trí.
2. **Bẫy xterm:** phần tử `display:none` có kích thước 0×0. `fit()` chạy lúc đó đặt cols/rows
   sai và người học thấy terminal vỡ khi quay lại. Phải chặn fit khi `offsetWidth === 0`, và
   fit lại đúng một lần khi hiện lại.
3. **Bẫy `hidden` thua `.flex`:** phần tử mang `hidden` không được mang tiện ích `display` nào.
   Test hiện có quét điều này ở cả hai tab; mở rộng nó sang hàng 2.
4. Thanh kéo và `terminalPercent` mất lý do tồn tại ở tab Editor (không còn hai hàng cùng
   hiện). Gỡ hay giữ là một quyết định — **giữ** cơ chế nhưng ẩn cùng hàng 2, để không đổi
   cấu trúc cây (lý do y hệt điều 1 của bất biến).
5. Cập nhật `contracts/p16-workspace.md` §mô hình hai tab + sơ đồ ASCII trong mã.

→ verify: test hiện có `workspace-panel.test.tsx` + `single-terminal-contract.test.ts` xanh;
thêm ô khẳng định **cùng một instance terminal** sống qua chuỗi đổi tab Editor↔Terminal, và ô
khẳng định cols/rows không về 0 sau khi ẩn rồi hiện. E2E: gõ lệnh, sang tab IDE, quay lại,
lịch sử còn nguyên.

### L3 — Tab Editor cho Lab  *(M — ranh giới §8 thứ nhất)*

Rào cản component đã gỡ ở 16.D.3; rào cản còn lại là trường nội dung. Cột DB đã có sẵn.

1. `packages/shared-types/src/lab.ts` — thêm `interfaceLayout` (dùng lại hình dạng của
   `scenario.ts:239`, không khai kiểu thứ hai).
2. Loader nội dung + `scripts/seed-content.mjs` đọc trường mới.
3. `lab-client.tsx` — `hasEditor: shouldShowIdePane(lab.interfaceLayout)` và truyền `editor`.
   ⛔ **Không** dùng `profile` thay `interfaceLayout`: `ide-layout.ts` ghi rõ phép so phải trùng
   byte với phép so ở server; nới tay ⇒ iframe trỏ vào pod không chạy Theia và trắng vĩnh viễn.
4. Một lab trong `content/` bật `interfaceLayout: 'ide'` làm ca chạy thật.
5. Xoá chú thích C5 đã hết hiệu lực ở `lab-client.tsx:211-225`.

→ verify: unit test lab-client hai nhánh; E2E mở lab đó, thấy tab Editor, iframe Theia nạp.

### L4 — Hàng đợi gửi thư bền vững  *(M — ranh giới §8 thứ ba)*

`after()` chạy sau khi response đã trả; tiến trình chết giữa chừng là thư bốc hơi, không dấu
vết. §8 ghi đúng giới hạn này.

1. Bảng hàng đợi trong Postgres (đã có drizzle): `id`, `to`, `template`, `payload`, `attempts`,
   `next_attempt_at`, `state`, `last_error`.
2. Ghi hàng đợi **trong cùng transaction** với việc tạo mã reset. Ghi được = đã nhận việc.
3. Worker rút hàng với `FOR UPDATE SKIP LOCKED`, backoff luỹ thừa, trần số lần thử.
4. `password-reset-mail.ts` đẩy vào hàng đợi thay vì `after()`.
5. UI và tài liệu: vẫn chỉ khẳng định "đã tiếp nhận", không khẳng định "đã tới hộp thư" — giới
   hạn đó không đổi và không được nới lời văn.

→ verify: test khẳng định giết tiến trình giữa chừng thì bản ghi còn và lượt sau gửi lại; test
khẳng định không gửi trùng; kiểm bằng Mailpit.

### L5 — Dọn  *(S)*

1. Xoá 9 worktree lane P16 đã gộp (`git worktree remove`), và nhánh lane đã merge.
2. `apps/web/e2e/.artifacts/landing-boundary.config.ts` bị `.gitignore` nuốt nhưng được
   `verification.json` trích làm bằng chứng — không ai tái lập được. Đưa vào repo dưới
   `e2e/` hoặc bỏ trích dẫn và chỉ tới hai ca trong `games.spec.ts` (chúng nằm trong profile
   mặc định, nên vẫn chạy).
3. Thêm script `e2e:landing3d` vào `apps/web/package.json` — hiện suite 20 ca chỉ chạy được
   bằng một câu lệnh nhớ trong đầu, không lệnh nào trong repo gọi tới nó.
4. Kiểm ô không-WebGL của `landing-3d.spec.ts` có đối chứng dương thật chưa. `landing.config.ts`
   ép `--use-angle=d3d11`, tức luôn **có** WebGL; nếu ca "không WebGL" chỉ giả lập bằng cách
   ghi đè `getContext` thì phải nói rõ đó là giả lập, không phải môi trường không-WebGL.
5. `landing-walk.capture.ts` cùng cảnh ngộ với landing-3d: chỉ chạy qua `landing-video.config.ts`
   mà không lệnh nào gọi. Thêm script hoặc ghi rõ nó là công cụ quay tay.
6. `apps/web/e2e/password-reset.spec.ts:16` tự `test.skip` khi thiếu `E2E_MAILPIT_URL`, và
   **không job CI nào đặt biến đó** — suite SMTP chưa từng chạy ở CI. Hoặc cấp Mailpit cho job
   CI, hoặc ghi rõ đây là suite chỉ chạy cục bộ; không để nó im lặng đỗ.
7. `apps/web/e2e/perf.spec.ts:409-412` còn khẳng định "cảnh 3D cũ đã được gỡ hoàn toàn" — sai
   sau `d5bf768`. Khôi phục cả phần lý giải vì sao canvas không được là phần tử LCP, vì
   assertion `.not.toBe('canvas')` ở `:465` còn đó mà mất lý do.

### L6 — Nghiệm thu và PR  *(M)*

1. `pnpm -w turbo run build lint typecheck test --force`. Đọc `Tasks: X/Y` TRƯỚC khi trích số.
2. Web build/lint/typecheck/test riêng (turbo `typecheck` phụ thuộc `build`, có thể ghi lại
   `.next` lúc E2E dùng nó).
3. `pnpm tokens:check`, `antipattern:check`, `bundle:check`.
4. E2E profile mặc định + profile landing-3d, đủ ba biến `E2E_START_SERVER=1`,
   `E2E_BASE_URL=http://localhost:3000`, `E2E_ORIGIN=http://localhost:3000`.
5. Review độc lập bằng `t1k-code-reviewer` trên toàn diff.
6. Push, mở PR, theo CI tới xanh, tự xử thread Copilot review, merge.

---

## 3. Rủi ro

| Rủi ro | L | I | Score | Cách chặn |
|---|---|---|---|---|
| L2 làm mất phiên PTY khi đổi tab | 3 | 5 | **15** | Bất biến là *không đổi cha*, không phải *không ẩn*. Test khẳng định cùng instance sống qua chuỗi đổi tab, cộng ô E2E gõ lệnh rồi quay lại. |
| L2 làm xterm vỡ cols/rows sau khi ẩn | 4 | 3 | **12** | Chặn `fit()` khi `offsetWidth === 0`; fit lại đúng một lần khi hiện. Test khẳng định cols/rows không về 0. |
| Diff 200+ file làm review vô nghĩa | 4 | 3 | 12 | Mỗi lane một commit có phạm vi rõ; PR body liệt kê lane và ô nghiệm thu tương ứng. |
| L5 gửi trùng thư khi có hai worker | 2 | 4 | 8 | `FOR UPDATE SKIP LOCKED` + trạng thái; test gửi-một-lần. |
| Nợ Arena bị quên vì nay ngoài phạm vi | 3 | 3 | 9 | Ghi thành đầu vào P17 trong `phase-16.md` §8 và giữ nguyên chú thích "rà lại khi arena vào phạm vi" trong cổng token. |

---

## 4. Thứ tự và điểm dừng

`L0 → L1 → L2 → L3 → L4 → L5 → L6`

Commit sau mỗi lane. Ba điểm phải dừng lại báo cáo thay vì tự quyết:

- Bất kỳ ô nghiệm thu §1 nào không đạt sau ba lần thử — dừng, hỏi kiến trúc, không thử lần bốn.
- Bất kỳ lúc nào cách duy nhất để một cổng xanh là nới chính cổng đó.

---

## 5. Kết quả đo được — lượt đóng ngày 2026-09-13/14

Phần này ghi **số đọc trực tiếp**, không ghi lời khai. Mỗi dòng nói rõ nó đo trên build nào,
vì trong đợt này đã có một lần `.next` bị ghi đè giữa lượt chạy và làm hỏng hai bảng số.

### 5.1 Cổng tĩnh

| Lệnh | Kết quả |
|---|---|
| `turbo run typecheck lint test build --force` | `Tasks: 32 successful, 32 total`, 2m9s |
| `pnpm tokens:check` | exit 0 — 570 file / 4 vùng |
| `pnpm antipattern:check` | exit 0 — 615 file / 7 vùng |
| `node scripts/env-check.mjs` | exit 0 — 97 biến / 4 scope |
| `pnpm bundle:check` | exit 0 — 4/4 route terminal chạm chunk xterm, 33 route còn lại không; nền chung 1 050 234 B / trần 1 150 000 B |

Đơn vị, sau khi đóng nợ: web **1812**, ui **932**, games 402, scenario 289, terminal 133,
motion 110, copy 71, shared-types 48.

⚠ **Đọc `Tasks: X/Y` trước khi trích bất kỳ con số test nào.** Hai lượt turbo đầu của đợt này
dừng ở `28/31` và `29/31` vì `@devops-platform/web#test` đỏ — bốn task sau nó **chưa chạy**, nên
một bảng "mọi gói xanh" dựng trên hai lượt ấy sẽ là bảng bịa.

### 5.2 Bốn lỗi sản phẩm mà rác test đang che

Bốn lỗi dưới đây có **cùng một hình dạng**, và đó là điều đáng ghi nhất của đợt này: một ô
nghiệm thu xanh vì nó đo phải một thứ rỗng, chứ không vì thứ nó gác đang đúng.

| Lỗi | Vì sao ô gác không đỏ | Đóng ở |
|---|---|---|
| `/me` trôi ngang **308px** ở khung 390px | cả nhóm `@responsive` đăng nhập bị SKIP suốt; lượt này là lượt ĐẦU TIÊN nó chạy thật | `589418b` |
| `axe heading-order` trên `/lessons/ckad-configmap-as-files` | `axe /lessons/:id` mở bài ĐẦU danh mục, mà bài đầu là một fixture rò rỉ RỖNG — trang trống thì axe luôn sạch | `3a1a1c1` |
| `purgeLeakedFixtures` chết ở khoá ngoại `learning_paths` | hàm dựng ra để dọn rác lại là thứ chặn việc dọn; `me-idor` đỏ ở `beforeAll` | `d84b088` |
| Hai file test ăn fixture của nhau khi chạy song song | cái đua CÓ SẴN, bị chính lỗi khoá ngoại che — lượt dọn luôn chết nên chưa bao giờ xoá được gì | `d84b088` |

Hai lỗi đầu chỉ hiện ra **sau khi** 237 dòng fixture rò rỉ bị dọn. Nói cách khác: rác test
không chỉ làm bẩn DB, nó còn làm hai ô nghiệm thu nói dối theo hướng có lợi.

### 5.3 `/me` — thủ phạm không phải thứ thông điệp lỗi đoán

Thông điệp của ô đó gợi ý "một `min-w-*` cứng, một bảng không bọc `overflow-x`, hoặc một hàng
flex không cho xuống dòng". Không phải cái nào trong ba. Bảng rộng 762px **cuộn trong khung
đúng như thiết kế**; thứ lọt ra ngoài là một `<span class="sr-only">` rộng **1px** trong `<th>`.

`sr-only` của Tailwind là `position:absolute`. Không ancestor nào trong chuỗi được định vị, nên
containing block của nó rơi về initial containing block — nó thoát vùng cắt của `overflow-x-auto`
và kéo dài `scrollWidth` của cả tài liệu.

| trạng thái | `document.documentElement.scrollWidth` |
|---|---|
| nguyên trạng | **698** |
| ẩn mọi `.sr-only` | 390 |
| thêm `position:relative` cho khối bọc `<table>` | 390 |

`MeTableScroll` được một lane thêm vào đúng để chữa lỗi này, và **không chữa được gì** — `Table`
của `packages/ui` vốn đã tự bọc `overflow-x-auto`, nên nó chỉ dựng lớp cuộn thứ hai lồng ngoài,
cũng không được định vị. Đã gỡ.

### 5.4 Heading của nội dung nhập từ upstream

`markdown-view` hạ đúng một bậc (`#`→h2). Phép đó chỉ đúng với tài liệu mở đầu bằng `#`. Đếm
trên `content/` ngày 2026-09-14: **61 file — 50 mở bằng `#`, 2 bằng `##`, 4 bằng `###`**, 5 không
có heading. Sáu file lệch nằm trong ba scenario nhập từ upstream, nên cấp mở đầu là quy ước của
người viết upstream chứ không phải của ta — sửa sáu file là sửa triệu chứng, lần nhập sau sẽ
mang về đúng chuyện đó. `embeddedHeadingLevel` dời theo cấp NHỎ NHẤT của chính tài liệu; 50 file
kia không đổi lấy một thẻ, và lớp CSS giữ theo cấp NGUỒN nên giao diện không đổi một pixel.

### 5.5 Ba ô đỏ vì đồng hồ, không vì khẳng định sai

Cả ba dừng ở đúng `testTimeout: 15_000`. Đo riêng từng file so với lúc 163 file chạy song song:

| ô | một mình | dưới tải | tỉ lệ |
|---|---|---|---|
| `revoke-descendants` "số lượt truy vấn KHÔNG tăng theo độ dài chuỗi" | 1188ms | >15 000ms | 12× |
| `rule-07` "replay thu hồi … sau hơn 100 thế hệ rotation" | 2049ms | >15 000ms | 7× |
| `paths-quiz-authz` "cùng quiz xuất hiện ở cả hai lộ trình" | 187ms | 15 186ms | **80×** |

Hai ô đầu gieo chuỗi tuần tự và độ sâu CHÍNH LÀ thứ chúng khẳng định, nên chúng nhận trần riêng
60s kèm số đo — rút độ sâu là làm yếu phép đo cho đồng hồ dễ chịu. Ô thứ ba chậm gấp 80 lần, tức
khác loại: nó là ô ĐẦU của file nên gánh cả lượt nạp `content/**` từ đĩa; chữa bằng cách hâm nóng
trong `beforeAll`, đúng cách `me-idor.test.ts` đã chữa cùng chuyện này.

**Chứng minh không phải hồi quy** (chứ không phải suy đoán): lùi tạm ba file về `HEAD~2` rồi chạy
lại cùng tải — bản cũ đỏ **11 ô / 7 file**, bản mới đỏ 2, và đúng hai ô còn lại cũng đỏ ở bản cũ.

### 5.6 Mọi cổng mới đều đã bị phá thử

Một cổng chưa từng thấy đỏ là một cổng chưa được chứng minh. Bảng dưới là các lượt phá đã chạy
thật, kèm kết quả:

| Phá | Kết quả |
|---|---|
| bỏ `relative` khỏi khối bọc `<table>` | ô mới ĐỎ; ô cũ (`.overflow-x-auto` có tồn tại) vẫn XANH — đúng lý do nó không gác được gì |
| bỏ câu `DELETE FROM learning_paths` | ĐỎ, đúng lỗi khoá ngoại đã giết `me-idor` |
| bỏ một dòng khỏi `PURGE_HANDLED_BLOCKING_FKS` | ĐỎ, đúng tên `learning_paths.author_id` |
| thêm một dòng sổ đăng ký không tồn tại | ĐỎ, đòi xoá dòng ôi |
| hạ `PURGE_MIN_AGE_MS` về 0 | ĐỎ — đối chứng âm của ngưỡng tuổi |
| cho lượt dọn KHÔNG LÀM GÌ | ĐỎ 2 ô — vế xuôi bắt được |
| đưa `embeddedHeadingLevel` về "hạ đúng một bậc" | ĐỎ 3 ô |

### 5.7 Bảy ô `games.spec.ts` vẫn đỏ, và đó là quyết định

Không nối lại ở đợt này. Lý do đầy đủ ở `phase-16.md` §8; tóm tắt: `app/games/k8s/page.tsx` nay
render `<ArenaEntry>`, còn các ô đó viết theo API `<K8sGame levels createSession>` của bản trước
lượt viết lại arena, và ngưỡng của P17 (§AC-K, §AC-7) khác ngưỡng chúng đang khẳng định. Viết lại
bây giờ là dựng test cho một tính năng P17 chưa làm, rồi P17 lại phải viết đè.

### 5.8 `lab.flow` — ô đỏ cuối, và nó KHÔNG phải lỗi của nhánh này

Lượt E2E cuối: **183 đỗ / 8 đỏ / 0 skip / 191**, 11.5 phút, build `7iJSHysqKs5GLLzLxJaHU`.
Tám ô đỏ = bảy ô `games.spec.ts` (đỏ có chủ đích, §5.7) + `flows/lab.flow.spec.ts`.

`lab.flow` đỏ **tái hiện được** khi chạy một mình, nên nó không phải flake và không phải tải.

**Triệu chứng đọc từ giao diện** (dò trực tiếp bằng một spec tạm, 2026-09-14):

```
t=8s …93s   chấm=xám   "Môi trường của bài đang được dựng — đợi vài giây rồi chấm lại."
t=98s       chấm=xám   "Dựng môi trường của bài thất bại (exit 1): Cluster con chua san sang
                        sau 90s (0/1 node Ready). … · [dlp-k8s] docker run thất bại"
```

**Nguyên nhân, đọc từ `dockerd.log` bên trong chính pod đã hỏng** — không suy đoán:

```
dial tcp 10.103.164.91:5000: i/o timeout
  → mirror platform-registry-mirror.dlp-registry.svc:5000 KHÔNG tới được
  → fallback registry-1.docker.io → 127.0.0.1:80 connection refused
  → Handler for POST /images/create returned error … status=500
```

Vế thứ hai đúng như thiết kế: sandbox không có internet, và `hostAliases` ghim
`registry-1.docker.io` về loopback. Vế thứ nhất mới là lỗi.

**Vì sao mirror không tới được:** netpol ingress của nó nhận namespace theo **TÊN**, không theo
nhãn vai trò:

```yaml
# netpol platform-registry-mirror-allow-ingress-sandbox, ns dlp-registry
ingress:
- from:
  - namespaceSelector:
      matchLabels:
        kubernetes.io/metadata.name: dlp-sandbox
```

Harness E2E dựng sandbox trong namespace riêng `dlp-e2e-p16` (`start-services.mjs`,
`SANDBOX_NAMESPACE`), nên mọi pod ở đó bị cắt khỏi mirror.

**Đối chứng hai chiều, đo được:**

| namespace | `docker pull rancher/k3s:v1.34.1-k3s1` |
|---|---|
| `dlp-sandbox` (đúng tên trong netpol) | **thành công, 8 giây** kể cả lượt LẠNH sau khi `docker rmi` |
| `dlp-e2e-p16` (harness E2E) | i/o timeout tới mirror |

**Không phải hồi quy của nhánh:** `git diff --stat main...HEAD -- content/labs/dlp-k8s-broken-deploy
deploy/ services/ scripts/sandbox*` trả về **rỗng**. Commit cuối chạm lab đó là `5b83f14`, trước
nhánh này.

**Bài học đáng giữ, rộng hơn một ô test:** một netpol chọn namespace theo TÊN biến mọi bản
triển khai đặt sandbox ở namespace tên khác thành một bản **im lặng không kéo được ảnh** — và
triệu chứng nổi lên là "cluster con không sẵn sàng sau 90s", trỏ vào k3s chứ không trỏ vào mạng.
Ba tầng chẩn đoán nằm giữa nguyên nhân và triệu chứng.

**CHƯA ĐÓNG, cần người dùng quyết.** Hai đường, cả hai đều vượt ranh giới của nhánh này:

1. **Nới netpol** cho namespace E2E (hoặc đổi nó sang chọn theo NHÃN thay vì theo tên). Đây là
   đường đúng về lâu dài, nhưng nó sửa chính sách mạng của cụm đang chạy.
2. **Trỏ orchestrator E2E về `dlp-sandbox`**. ⛔ KHÔNG nên: `platform-orchestrator` đang chạy
   trong cụm và đã quản namespace đó, nên sẽ có HAI orchestrator trên một namespace — đúng cái
   bẫy lệch warm pool đã ghi ("orchestrator giao tên pod đã chết").

Một đường thứ ba, đắt hơn nhưng đóng luôn cả lớp vấn đề: nạp sẵn ảnh k3s vào chính image sandbox
để đường lạnh không cần mirror. Đó là quyết định phạm vi P7 kèm chi phí dung lượng, không phải
việc của chặng đóng nợ này.

#### 5.8b — ĐÃ ĐÓNG 2026-09-14, và nó có BA tầng chứ không phải một

`lab.flow` nay ĐỖ. Ba nguyên nhân xếp chồng, mỗi cái che cái trước:

**Tầng 1 — netpol chọn namespace theo TÊN.** Đóng ở `92d33fb`: chart phát nhãn
`platform.dlp/role: sandbox` và netpol của mirror chọn theo nhãn đó.

⚠ Nhãn là **hằng số template, cố ý không phải khoá values**. `matchLabels` rỗng
không khớp-không-gì mà khớp **MỌI** namespace, nên nếu nó đến từ values thì đúng
một lần `helm upgrade --reuse-values` (cờ đó không nạp key mới) là đủ mở mirror
cho toàn cụm trong im lặng, với helm báo xanh. Hằng số không có key nào để đánh
rơi. Cùng họ với bài học `helm-reuse-values-drops-new-keys`.

Đo: mirror trả 200 từ CẢ ns prod lẫn ns e2e; đúng 2/11 namespace mang nhãn — tập
vào được mirror đi từ `{dlp-sandbox}` thành `{dlp-sandbox, dlp-e2e-p16}`.

**Tầng 2 — chuỗi viết thẳng lệch ĐÚNG MỘT TỪ.** Sau khi mirror thông, luồng đi
tới tận bước nộp bài rồi chết ở:

```
trang render : Lần thử này đã nộp NÊN không chấm lại được. …
spec chờ     : Lần thử này đã nộp —   không chấm lại được. …
```

Sản phẩm làm đúng mọi thứ. Đóng ở `42f2a40` bằng `t('session.lab.blocked-submitted')`.

**Tầng 3 — spec không dọn phiên khi ĐỎ, và đây là tầng làm hai tầng kia khó thấy.**
`endSandbox` chỉ chạy ở cuối ca, nên mọi thất bại bỏ lại một pod. Lượt sau chết
vì `ResourceExhausted` — **triệu chứng đổi dạng**, trỏ người đọc đi truy quota
trong khi nguyên nhân nằm chỗ khác. Đóng bằng `afterEach` best-effort (nuốt lỗi:
ném ở đó sẽ che mất thất bại THẬT của ca).

**Một câu trong báo cáo trước SAI, sửa lại ở đây.** Pod rò KHÔNG "sống tới hết
`SESSION_TTL` = 1 giờ". `internal/config/config.go:66` nói thẳng: hạn thật do
`ExtendDefault` quyết định theo `expires_at = min(now + extend, created_at +
HARD_CAP)`; `SESSION_TTL` chỉ là hạn cho tới heartbeat ĐẦU TIÊN. Đọc Redis xác
nhận: hai phiên còn sống mang TTL 2577s và 222s, không phải một mốc cố định.

**Trần đồng thời bị chặn bởi đại lượng nào** — không phải `pods`. Với profile
`k8s` (requests 500m/1Gi, limits 4/2Gi) và quota namespace (`requests.cpu: 4`,
`requests.memory: 5Gi`, `limits.cpu: 20`, `pods: 6`), ở 4 pod thì `limits.cpu`
đã là 18/20 — thêm một pod là 22, vượt. Tức `pods: 6` KHÔNG bao giờ là ràng buộc
thật. Cùng bài học với `capacity-ceiling-needs-quota-and-limitrange`.

**Chưa kết luận, ghi để không đọc nhầm:** mọi dòng `session đã reap` trong log
orchestrator đều mang `"actor":"user"`, chưa có dòng nào của lượt quét định kỳ
dù `REAP_INTERVAL` là 60s. Điều đó CÓ THỂ chỉ nghĩa là các phiên trước đều được
kết thúc tường minh nên sweep không có việc. Nó KHÔNG chứng minh sweep chạy được.
Muốn biết thì phải bỏ một phiên hết hạn rồi xem sweep có dọn không.

---

## 6. Chốt sổ — 2026-09-14

### 6.1 Số cuối

| Phép đo | Kết quả |
|---|---|
| `turbo run typecheck lint test build --force` | **`Tasks: 32 successful, 32 total`** |
| Đơn vị | web **1812** · ui **932** · games 402 · scenario 289 · terminal 133 · motion 110 · copy 71 · shared-types 48 |
| 4 cổng tĩnh (tokens / antipattern / env / bundle) | exit 0 cả bốn |
| **CI đầy đủ (`ci.yml`, event `pull_request`)** | **`ci-ok: success` — 9/9 job** |
| E2E profile mặc định | **184 đỗ / 7 đỏ / 0 skip / 191**, 10,1 phút |

Bảy ô đỏ là ĐÚNG bảy dòng `games.spec.ts` đã ghi ở `phase-16.md` §8 là đỏ có chủ
đích của P17: 273, 445, 455, 536, 641, 784, 948. **Không còn ô đỏ nào ngoài giải
thích.**

### 6.2 CI: từ 4 job đỏ trên `main` xuống 0

Đối chứng là lượt `ci.yml` gần nhất trên chính `main` (run `34526505858`,
2026-09-10) — không phải trí nhớ:

| Job | `main` 09-10 | nhánh này |
|---|---|---|
| `Web (axe + CSP)` | ❌ | ✅ |
| `Terminal (Chromium)` | ❌ | ✅ |
| `Secret scan (gitleaks)` | ❌ | ✅ |
| `Go (build + vet + test + lint + vuln)` | ❌ | ✅ |
| 5 job còn lại | ✅ | ✅ |
| **`ci-ok`** | ❌ | **✅** |

⚠ **Bốn job đỏ đó KHÔNG ai thấy suốt 10 ngày**, vì `ci.yml` bị tạm dừng từ
2026-09-04 (chỉ còn `workflow_dispatch`). Trong thời gian đó `gh pr checks` trên
một PR trả **4 check pass** và `mergeStateStatus: CLEAN` — nhưng bốn cái đó chỉ
là `secret-scan.yml` + `no-commerce.yml`, mỗi cái chạy hai lần. Bảy cổng chất
lượng thật không chạy một dòng nào. Đọc "CI xanh" ở trạng thái đó là đúng dạng
[`green-that-proves-nothing`]: xanh vì không ai hỏi.

### 6.3 Việc hạ tầng / cấu hình đã làm

| Việc | Trạng thái |
|---|---|
| `ci.yml` bật lại (`push: main`+tag, `pull_request`, `workflow_dispatch`) | xong |
| `no-commerce.yml` xoá (trùng sạch; bản trong `ci.yml` nằm trong `ci-ok.needs`) | xong |
| `secret-scan.yml` thu hẹp còn `push: branches-ignore: [main]` | xong |
| `sha_pinning_required` bật trên repo | xong |
| `nanoid` 3.3.17 → 3.3.19 (cảnh báo Dependabot HIGH duy nhất) | xong |
| netpol mirror chọn theo NHÃN, không theo TÊN namespace | xong |
| **branch protection trên `main`, required check `ci-ok`** | xong |

**Chia phạm vi workflow, đo được:** trước đây một lần push sinh **5 run**; nay
**2** (`CI` qua `pull_request`, `Secret scan` qua `push` trên nhánh feature). Và
không còn check TRÙNG TÊN trên PR — điều đó quan trọng vì branch protection khớp
required-check theo tên.

**Branch protection — vì sao từng lựa chọn:**

- required check là **`ci-ok`** chứ không phải 9 tên job. Chính `ci.yml` đã lập
  luận: "khai 7 job làm 7 required check nghĩa là mỗi lần thêm/đổi tên job phải
  vào Settings sửa tay, và quên là mất cổng trong im lặng".
- `strict: false` — không bắt rebase mỗi lần `main` nhích.
- **0 approval bắt buộc** — repo một người; đòi 1 approval là tự khoá, vì không
  ai duyệt được PR của chính mình.
- `enforce_admins: false` — luôn còn một đường vượt cho chủ repo.
- KHÔNG đặt `Secret scan (gitleaks)` làm required riêng: sau khi chia phạm vi nó
  không còn chạy ở event `pull_request`, nên required sẽ treo `Expected —
  Waiting` vĩnh viễn và khoá merge (bẫy ghi ở `ci-cd-trigger-design` §3). Vế
  gitleaks trên PR đã nằm trong `ci-ok`.

Kiểm ngay sau khi bật: `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`.

### 6.4 Còn nợ lại, có tên

Không đóng ở chặng này, ghi ra để P17 không phải tìm lại:

1. **Bảy ô `games.spec.ts`** — ô nghiệm thu của P17 (§AC-K, §AC-7). Xem
   `phase-16.md` §8.
2. **Arena** — ngoài phạm vi P16 theo quyết định 2026-09-13; hai dòng miễn trừ
   màu trong `KNOWN_HARDCODED` chờ P17 rà lại.
3. **Copilot review không chạy được** — cả hai lượt trên PR #119 trả *"the user
   who requested the review has reached their quota limit"*. Ruleset
   `copilot-code-review` vẫn bật nhưng thực tế không sinh ra gì. Đây là quota
   tài khoản, không sửa được từ repo.
4. **7 PR Dependabot đang mở**, cũ nhất 2026-09-07, trong đó hai bump MAJOR
   (`vitest` 4→5, `@vitest/browser-playwright` 4→5) — không nên gộp mù.
5. **22 khoá `common.*`/`unit.*` vẫn ghim** trong cổng khoá chết — quyết định
   biên tập của chủ surface.
6. **`scripts/git-hooks/pre-push` vẫn `exit 0`** và
   **`.claude/t1k-artifact-gate.disabled` còn nguyên** — hai thứ tạm dừng cùng
   đợt với `ci.yml` mà chưa bật lại.
7. **Sweep định kỳ của reaper CHƯA được chứng minh chạy được** — xem §5.8b.

### 6.5 Trả nốt bảy món trên — 2026-09-14, đợt sau

Bảng §6.4 viết lúc đóng chặng. Đợt này đi qua từng dòng và đo lại. Bốn món đóng
được, ba món không đóng từ repo. Đợt đo cũng lòi ra năm thứ **không có trong
bảng đó** — ghi ở §6.5.3, vì chúng là phần đắt nhất của lượt này.

| § | Món | Kết cục |
|---|---|---|
| 1 | Bảy ô `games.spec.ts` | vẫn là ô nghiệm thu P17, không rời phạm vi |
| 2 | Arena | quyết định của chủ dự án, không đổi |
| 3 | Copilot review hết quota | quota tài khoản, không sửa được từ repo |
| 4 | 7 PR Dependabot | **3 gộp · 1 đóng + ghim · 2 hoãn có tên · 1 chờ** |
| 5 | 22 khoá `common.*`/`unit.*` | quyết định biên tập, không đổi |
| 6 | `pre-push` + artifact gate | **ĐÓNG** |
| 7 | Sweep định kỳ của reaper | **ĐÓNG — và câu hỏi cũ hỏi sai chỗ** |

#### 6.5.1 §7 — sweep của reaper: bằng chứng có sẵn, chỉ là tôi nhìn nhầm bảng

§5.8b viết: *"mọi dòng `session đã reap` trong log orchestrator đều mang
`actor:"user"`, chưa có dòng nào của lượt quét định kỳ"*. Quan sát đó **đúng**,
nhưng kết luận rút ra từ nó thì không — vì dòng log ấy **cấu trúc không thể**
chứa bằng chứng cần tìm.

Đường hết-hạn không đi qua dòng đó. `handleExpiredKey` và
`sweepClaimedWithoutSession` đều gọi `Service.ReapExpired`, mà hàm này ghi một
**dòng audit `event='expired'`** xuống Postgres, không phải dòng log mang
`actor`. Trường `actor` chỉ tồn tại trên đường reap tường minh (người dùng /
admin). Tìm đường hết-hạn trong dòng có `actor` là tìm mãi không thấy, và cái
"không thấy" đó đọc ra như "chưa chạy bao giờ".

Đo lại, đúng chỗ:

| Phép đo | Số | Nói lên điều gì |
|---|---|---|
| `sessions_audit` where `event='expired'` | **229 dòng**, gần nhất 2026-09-10 | đường hết-hạn đã chạy 229 lần |
| `dlp_reaper_keyspace_events_total` | **4** | tầng 1 (keyspace expiry) đang nhận event thật |
| `dlp_reaper_quarantine_reaped_total` | **1** | sweep định kỳ đã LÀM VIỆC, không chỉ quay vòng |
| `dlp_reaper_stale_image_pods_total` | **3** | sweep phát hiện pod ấm chạy image cũ |
| `dlp_reaper_sweep_failures_total` | **1** | sweep có lỗi một lần — xem dưới |

Và `--notify-keyspace-events Ex` có thật trong
`infra/helm/platform/templates/datastore-redis.yaml`, tức tầng 1 được nối dây
chứ không chỉ được viết ra.

**Một lỗi sweep, đã truy ra:** `2026-09-14T00:27:41Z`,
`dial tcp 10.96.0.1:443: connect: no route to host` — đợt NIC flap làm mất
control-plane, không phải lỗi reaper. Các vòng sweep sau đó chạy bình thường
(chính `quarantine_reaped` và `stale_image_pods` ở trên là bằng chứng).

`dlp_reaper_claimed_orphan_total = 0` không mâu thuẫn: tầng 2c chỉ tăng khi tầng
1 **lỡ** một event. Bằng 0 nghĩa là tầng 1 đang không lỡ cái nào.

#### 6.5.2 §6 — và ô kiểm hook hoá ra là một ô xanh không gác gì

`scripts/git-hooks/pre-push` đã gỡ khối tạm dừng + `exit 0`; cờ
`.claude/t1k-artifact-gate.disabled` đã xoá (nó lên tiếng ngay ở lượt commit kế
tiếp, nên biết chắc là đã sống lại). Branch protection thì đã bật từ trước.

Nhưng lúc kiểm lại mới thấy `check-repo-settings.mjs` gác hook bằng đúng một câu
hỏi: `git config core.hooksPath` có bằng `scripts/git-hooks` không. Suốt mười
ngày hook nằm đúng chỗ với `exit 0` ở dòng 20 — và ô đó **xanh mỗi lượt**.

Đã tách làm hai ô; ô mới CHẠY THẬT hook với một dòng stdin giả lập rồi đọc mã
thoát. Phá thử: nhét lại `exit 0` ⇒ ô mới đỏ, gỡ ra ⇒ xanh, còn ô `core.hooksPath`
**xanh ở cả hai ca**. Kiểm thêm đúng đường git đi (`git push --dry-run`): chặn
`main` (exit 1), cho qua nhánh phụ (exit 0).

#### 6.5.3 Năm thứ đợt này lòi ra, không có trong §6.4

1. **`ci.yml` trên `main` đang ĐỎ.** `ci-ok` xanh, nhưng job `images` đỏ ở
   `web` và `sandbox-base`: `moby/buildkit` trả `502 Bad Gateway` lúc boot
   buildx. Hạ tầng Docker Hub, không phải mã. Chạy lại ⇒ xanh. Đáng ghi vì
   `ci-ok` xanh mà run vẫn đỏ là trạng thái dễ đọc lướt thành "ổn".
2. **Pod rò rỉ 8 tiếng trong `dlp-e2e-p16`**, image `p14a`. Quota ns đó là
   `pods: 1` nên nó **chặn lượt E2E kế tiếp**. Đã xoá, và đã vá bằng lượt dọn ở
   cả `globalSetup` lẫn `globalTeardown` (xem commit `fix(e2e)`).
3. **`TestResizeToiDuocPTY` đỏ theo tải máy, không theo mã.** Nó đỏ trên một PR
   không đụng dòng Go nào. `sizeQueue.push` coalesce có chủ ý trên buffer 1, nên
   bài test — vốn vứt giá trị đầu coi là init rồi đợi giá trị thứ hai — vứt đúng
   thứ nó đang đợi. Ép cho tất định bằng 300ms ngủ trước `Next()` đầu tiên: 3/3.
4. **`.gitattributes` thiếu `scripts/git-hooks/*`.** Hook không có đuôi `.sh` nên
   rơi vào `* text=auto` ⇒ checkout Windows cho CRLF. Khối ngay trên đã vá đúng
   lớp lỗi này cho `images/sandbox-base/bin/*` và bỏ sót hook.
5. **`check-repo-settings.mjs` lạc hậu hơn `docs/env/04`.** Nó vẫn đòi
   `required_linear_history: true` và squash-only, trong khi tài liệu đã chuyển
   sang merge-commit từ 2026-09-08 — và merge commit có hai cha nên linear
   history **bắt buộc phải tắt**. Sửa script theo tài liệu, không sửa repo theo
   script. Riêng `strict` là lệch thật, đã đặt lại `true`. Nay `pnpm repo:check`
   18/18.

#### 6.5.4 §4 — bảy PR Dependabot, từng cái

| PR | Nội dung | Kết cục |
|---|---|---|
| #110 | zod 4.4.3 → 4.5.4 | gộp |
| #108 | lucide-react 1.40.0 → 1.44.0 | gộp |
| #120 | nhóm dev-dependencies, 6 bản minor/patch | gộp |
| #104 | **ubuntu 24.04 → 26.04** + golang 1.26.6 → 1.27.1 | **đóng**, ghim ubuntu major |
| #109 | **vitest 4 → 5** | hoãn, có tên |
| #107 | **@vitest/browser-playwright 4 → 5** | hoãn, đi cặp với #109 |
| #105 | go-modules (k8s.io/* 0.36.3 → 0.37.0) | chờ đo riêng |

**#104 — vì sao đóng chứ không gộp.** `ubuntu` trong `images/sandbox-base` không
phải dependency, nó là **hệ điều hành trong sandbox của người học**. Đổi major là
đổi phiên bản apt, bash, coreutils, docker CLI, git — tức đổi output của gần như
mọi bài lab. CI chỉ chứng minh được image *dựng được*. Đã thêm dòng ignore cho
`ubuntu` major trong `.github/dependabot.yml`, cùng khuôn với dòng `node` đã có.
Bump golang vẫn nhận qua PR sau.

**#109 + #107 — việc có tên cho chặng sau.** Nâng major test-runner phải đọc
changelog rồi chạy lại cả 8 gói unit **và** browser mode (gpu-on / gpu-off /
safari15). Không gộp mù được: bản 4 từng **bỏ `environmentMatchGlobs`** và cấu
hình hỏng trong im lặng — lọt typecheck, không báo lỗi, chỉ đơn giản không làm gì
(xem memory `vitest4-removed-environmentmatchglobs`). Một lượt CI xanh trên chính
cấu hình có thể đã lỗi thời **không** phải bằng chứng.

**#105 — chưa đóng.** k8s.io/* 0.36.3 → 0.37.0 chạm client-go, tức chạm đúng tầng
reaper + pool. Cổng Go (build + vet + test + lint + vuln) đủ sức bắt lỗi biên
dịch, nhưng đổi hành vi client-go thì không. Cần một lượt đo riêng.

### 6.6 Chốt sổ đợt trả nợ — 2026-09-14, cuối ngày

Lượt ở §6.5 dừng ở "đã vá, chờ CI". Đây là kết cục thật, cùng những thứ nó lòi ra.

#### 6.6.1 Đã vào `main`

| PR | Nội dung | Ghi chú |
|---|---|---|
| #110 · #108 · #120 | zod 4.5.4 · lucide-react 1.44 · nhóm dev-deps | ba bump minor |
| #123 | ba thứ tạm dừng cùng đợt `ci.yml` + một ô kiểm gác rỗng | xem §6.5.2 |
| #131 | gỡ barrel Zod khỏi nền chung | −359 911 B mọi route |
| #124 | **P17 — Phòng thí nghiệm Git**, 34 commit | kèm vá side effect của P17 |
| #132 | ghim 5 image về `sha-6f19cbe` | |
| #104 | **đóng**, ghim `ubuntu` major trong dependabot | §6.5.4 |

`main` = `6f19cbe` (gộp P17) → `ac7557f` (ghim tag).

#### 6.6.2 Cụm đã cập nhật, kiểm từ hai đầu

5 image nạp bằng `11-sideload-images.sh` và **khẳng định lại trên node** (script cố ý
không tin bước import tự báo). `12-helm-deploy.sh` rsync chart TƯƠI từ repo rồi upgrade.

**Smoke 7/7 PASS** — rollout 3 deployment, image khớp chart, warm pool 3/3, `/api/health`
qua Traefik 200, và probe vòng đời phiên chạy trọn `create → claim → reap`.

Kiểm thêm ngoài smoke:

- `/games/git` trả **200** — route này KHÔNG tồn tại ở `sha-b22749d`, nên nó là bằng
  chứng trực tiếp rằng trình duyệt nhận build mới, không phải bản cache.
- Trang phục vụ mang `BUILD_ID = UiMav48XidOec3tYP4ld-`, **khớp** BUILD_ID đọc từ chính
  image CI.
- TTFB: lượt đầu 13,9s, bốn lượt sau **0,77–1,14s**. Lượt đầu là cold start sau rollout;
  đừng đọc một mẫu nguội thành hồi quy. (Mốc "trước" cùng ngày: 4,7s ở tải 48.)

#### 6.6.3 Hai món nợ cũ đóng bằng phép đo, không bằng lời

**AC-10 của P17** — báo cáo P17 ghi ô này chỉ đúng cho một image *dựng tại chỗ*, vì
workflow `images` chỉ chạy khi push vào `main`. Nay đo trên **đúng image CI**
`ghcr.io/nghaiz/dlp-web:sha-6f19cbe`: **32 file `.md`, 0 file rỗng**, frontmatter thật.
Kiểm FILE chứ không kiểm THƯ MỤC — `.dockerignore` từng bóc sạch markdown mà thư mục
vẫn còn, và `ls` thì xanh.

**`phase-1.md:808` — "thứ tự Trivy mới CHƯA TỪNG chạy thật"** vì job `images` chỉ chạy
trên `main`. Nay đã chạy, và chạy đúng thứ tự thiết kế (build-để-quét → báo cáo →
cổng chặn → rồi mới push):

```
dlp-web:scan (alpine 3.24.1)   Total: 2 (HIGH: 2, CRITICAL: 0)
cổng chặn CRITICAL             "lượt quét hoàn tất, 0 CRITICAL."
```

#### 6.6.4 Còn nợ MỚI, có tên

1. **CVE-2026-14456, 2 HIGH trong image web.** `libcrypto3` + `libssl3` của alpine
   3.24.1 ở `3.5.7-r0`; **đã có bản vá `3.5.8-r0`**. Lỗi là DoS trong *QUIC server*, mà
   image này chạy Next.js không có QUIC — khả năng khai thác gần như không, nên không
   chặn. Nhưng nó **fixable**, khác hẳn nhóm HIGH do `next` ghim mà ta không tự vá được
   (lý lẽ ghi trong `ci.yml` cho việc chặn ở CRITICAL thay vì HIGH). Đường vá: nâng base
   alpine hoặc thêm `apk upgrade` cho hai gói này.
2. **`dependency-review` có thể thêm lại.** `ci.yml` ghi job này bị gỡ vì nó đòi GitHub
   Advanced Security trên repo **private**. Repo thành public ngày 2026-09-14 ⇒ điều
   kiện gỡ đã hết hiệu lực.
3. **Trần ngân sách bundle nay quá lỏng.** Nền chung dư **32%** (786 785 / 1 150 000) so
   với 8,6% của mốc cũ. Cổng dư 32% không bắt được một bump cỡ 91KB — đúng cỡ `zod` vừa
   cộng vào. Xem `docs/bundle-budget.md` § "Đo lại 2026-09-14".
4. **`secret-scan.yml` chỉ quét commit của PR** (`ScanPullRequest`), không quét toàn bộ
   lịch sử. Lượt quét đầy đủ đầu tiên chạy tay 2026-09-14: **688 commit, 20,04 MB, 0 rò
   rỉ** — và đối chứng dương đã chạy được trước khi tin (xem memory
   `gitleaks-allowlists-the-aws-doc-key`: mẫu `AKIAIOSFODNN7EXAMPLE` bị allowlist nên
   một đối chứng dựng trên nó trượt IM LẶNG).
5. **Ba PR Dependabot cố ý để mở:** #105 (k8s.io/* 0.36.3→0.37.0, chạm client-go tức
   chạm tầng reaper + pool), #107 + #109 (vitest 4→5, cặp major). Lý do đã bình luận
   ngay trên từng PR.
6. **VM lab bị bão hoà bởi dự án KHÁC.** `Ironfront.Serve` ×2 ăn ~140% CPU mỗi cái trên
   máy 12 vCPU; load chạm **98,8** lúc cao nhất, xuống ~30 khi deploy. Mọi phép đo thời
   gian trên cụm trong quãng đó đều phải ghi kèm tải, nếu không nó đọc ra thành lỗi sản
   phẩm.
7. **Repo nay là public.** Contribution không còn cần cờ *"Include private contributions"*;
   đổi lại, mọi commit và mọi tài liệu trong `plans/`, `docs/` đều đọc được công khai.
