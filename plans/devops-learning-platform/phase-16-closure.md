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
