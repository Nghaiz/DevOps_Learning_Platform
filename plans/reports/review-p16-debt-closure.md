# Review độc lập — `main...feat/p16-debt-closure`

Đọc mã, không chạy test. Không sửa file nguồn, không commit.
⚠ Tôi có tạo ĐÚNG file này (artifact review). Xoá được nếu không cần.

⚠ **Nhánh động giữa lúc review.** Lúc bắt đầu HEAD = `52129df`; giữa chừng có thêm
`15ac118` và `use-workspace-tabs.ts` bị sửa trong cây làm việc (chưa commit) — xem B1.

---

## CHẶN-MERGE

### B1 — `{{exec}}` gõ vào terminal ĐANG BỊ ẨN (đã có bản vá CHƯA COMMIT trong cây)

**Chỗ:** `use-workspace-tabs.ts` (thân `exec` + khối chú thích "§Y3 — exec KHÔNG chuyển
tab") · `workspace-panel.tsx:277` (`hidden={editorVisible}`) · `use-workspace-tabs.ts:93`
(tab mặc định của bài IDE là Editor) · `content/labs/dlp-linux-triage/lab.json:10-12`.

Bản trong commit: `exec` cố ý KHÔNG chuyển tab, lý do ghi thẳng là *"Terminal luôn hiện ở
cả hai tab (§Y1)"* — tiền đề của SỬA ĐỔI 2, bị chính diff này bãi bỏ.

**Kịch bản:** mở `/labs/dlp-linux-triage` (lab vừa được diff này bật `layout: ide`) →
tab mặc định là Editor → hàng terminal `display:none` → bấm nút chạy một khối `{{exec}}`
(lab này có **15+ khối**; scenario `dlp-ide-config-edit` có 3) → `sendInput` gửi lệnh THẬT
xuống pod, `focus()` trên phần tử trong cây `display:none` là no-op → **màn hình không đổi
gì**. Bấm lại vài lần ⇒ lệnh chạy vài lần trong pod mà người học không biết.

Không cổng nào bắt: `workspace-panel.dom.test.tsx` không chạm `exec`, và không có file test
nào cho `use-workspace-tabs.ts`.

**Trạng thái:** bản vá đã xuất hiện trong cây lúc 22:2x (chuyển tab + hoãn `focus()` sang
effect). **Chưa commit** — nếu merge bằng HEAD hiện tại thì lỗi vẫn đi theo. Nhận xét về
bản vá đó ở N5.

## QUAN TRỌNG

### Q1 — NĂM file còn khẳng định "terminal KHÔNG BAO GIỜ bị ẩn"; chính câu đó đẻ ra B1

| Chỗ | Câu sai |
|---|---|
| `components/session/index.ts:23-24` | *"MỘT terminal, hiện ở CẢ HAI tab (neo đáy ~40%…). ⛔ Bất biến: terminal KHÔNG đổi cha và KHÔNG BAO GIỜ bị ẩn"* — và bảo người đọc sang `workspace-panel.tsx`, nơi nói ngược lại |
| `components/session/workspace-tabs.ts:26,29` | *"tab `editor` ⇒ hàng 2 neo đáy ~40%"*; *"⛔ Terminal KHÔNG BAO GIỜ bị ẩn … nên ở đây không có hàm nào trả về 'terminal có hiện không'"* — trong khi `isEditorVisible` (dòng 118-125) BÂY GIỜ chính là hàm đó |
| `components/session/workspace-layout.tsx:13,17,93` | *"terminal LUÔN hiện ở cả hai tab"*, *"Ở mô hình mới terminal không bao giờ bị ẩn"* |
| `components/session/terminal-pane.tsx:87-88` | *"nơi terminal LUÔN hiện nhưng đổi chiều cao: ~40% neo đáy ở tab Editor"* |
| `app/lessons/[id]/lesson-client.tsx:425,455` | *"MỘT terminal duy nhất hiện ở CẢ HAI tab (neo đáy ~40%…)"* |

`workspace-panel.tsx` ĐÃ sửa chú thích của nó và nói thẳng "bản trước của chính file này
nói ngược". Năm file kia thì không. `terminal-pane.tsx` thì HÀNH VI vẫn đúng (nó nghe
`layout` chứ không nghe cờ ẩn/hiện) — chỉ chú thích sai.

### Q2 — 503 chỉ cho tài khoản CÓ THẬT ⇒ đường liệt kê tài khoản

`server/auth/config.ts` — `sendResetPassword` bọc `schedulePasswordResetMail` và ném
`APIError('SERVICE_UNAVAILABLE')`. Đã kiểm trong `better-auth@1.6.26`
`dist/api/routes/password.mjs`: email không có tài khoản ⇒ `ctx.json({status:true})` (200);
email có tài khoản ⇒ `runInBackgroundOrAwait(sendResetPassword(...))`.
`schedulePasswordResetMail` nay làm một INSERT vào `password_reset_outbox`.

**Kịch bản:** rolling deploy đưa image mới lên TRƯỚC khi migration `0010` chạy (hoặc
migration trượt / DB không ghi được):
- có tài khoản ⇒ INSERT ném ⇒ **503**; không có tài khoản ⇒ **200**.

`forgot-password-form.tsx:31-36` phơi đúng sự khác biệt đó ra giao diện: `result.error` ⇒
alert lỗi, ngược lại ⇒ alert "đã gửi".

Cổng `verifyPasswordResetSmtp()` ở `before`-hook được đặt TRƯỚC tra cứu tài khoản chính vì
lo ngại này — nó cân bằng nhánh SMTP nhưng không cân bằng nhánh DB mới thêm.
(Về THỜI GIAN thì lượt INSERT không mở thêm kênh đáng kể; vấn đề là MÃ TRẠNG THÁI.)

### Q3 — `verifyPasswordResetSmtp()` mở kết nối SMTP MỚI cho MỌI request

`password-reset-mail.ts` dựng transport mới (không pool) rồi `verify()`, với
`connectionTimeout: 10_000` + `greetingTimeout: 10_000`.
1. SMTP chậm/treo ⇒ route CÔNG KHAI giữ request ~10-20s.
2. Mỗi request = 1 kết nối verify + (nếu gửi) 1 kết nối gửi. `rateLimit.customRules`
   `{window:60,max:3}` dùng storage **memory** mặc định của better-auth ⇒ N replica =
   N×3 lượt/phút/IP.

### Q4 — cổng ide+k8s KHÔNG phủ nội dung soạn trên DB

`packages/scenario/src/content-ide-k8s-guard.test.ts` chỉ đọc cây `content/` trên đĩa.
Nền tảng còn nhận nội dung từ DB: `db-source.ts:77,234,283,324`, `schema.ts:537`
(`interface_layout`), `routers/authoring.ts:157`.
Phạm vi quét: `server/content/validate.ts`, `server/content/publish.ts`,
`server/trpc/routers/authoring.ts` — **không có phép kiểm nào** chặn `ide` + image
kubernetes. Mục soạn `layout: ide` + `kubernetes-kubeadm-1node` ⇒ profile `'k8s'`
(k8s xét trước ide, `catalog.ts:130-134`) ⇒ pod không chạy Theia, FE vẫn vẽ tab Editor
(`shouldShowIdePane('ide') === true`) ⇒ iframe trắng vĩnh viễn.

### Q5 — đối chứng dương của cổng ide+k8s chạy trên BẢN CHÉP của phép dò

`content-ide-k8s-guard.test.ts` — ô thật (`'không mục nào vừa ide vừa đòi kubernetes'`) và
ô đối chứng dương mỗi ô viết LẠI cùng biểu thức `.filter(...).filter(...)`. Làm hỏng bản
thật thì bản giả vẫn xanh, nên đối chứng không chứng minh gì về phép dò đang chạy.

### Q6 — `profileForCapabilities` có tham số mặc định ⇒ bất biến không được compiler giữ

`catalog.ts:106-109`: `interfaceLayout: string | null = null`. `labs/session.ts:82-92` cố ý
làm trường của nó BẮT BUỘC và ghi rõ *"Một default `null` ở đây làm caller quên truyền mà
vẫn biên dịch"* — nhưng lớp bảo vệ đó không được áp cho chính hàm bên dưới, và đã có
call-site một-đối-số: `server/content/publish.ts:196`.

## NHỎ

- **N1** `routers/playgrounds.ts:102-104` — *"bản khai duy nhất trong repo là
  `content/scenarios/dlp-ide-config-edit`"*. Sai trong CHÍNH commit này:
  `content/labs/dlp-linux-triage/lab.json` cũng khai. (Vế "không sân chơi nào" vẫn đúng.)
- **N2** lab `dlp-linux-triage` chuyển từ profile `''` sang `'ide'` (768Mi requests,
  `values.yaml:1187`). Trần đồng thời của lab đó tụt tương ứng. Không tìm thấy dòng nào
  trong plan/contract ghi con số mới.
- **N3** `purgeExpired` (`password-reset-outbox.ts`) là `DELETE … WHERE expires_at <= now()`
  không index (`0010` chỉ index `next_attempt_at`) và KHÔNG có `SKIP LOCKED`. Một dòng đang
  bị replica khác khoá trong lúc gửi (tối đa ~15s theo `socketTimeout`) sẽ chặn lượt purge
  đó — mỗi lượt drain bắt đầu bằng nó.
- **N4** `after()` gọi `deliverQueuedPasswordResetMail()` = drain TOÀN CỤC (`limit 20`).
  Một request có thể phải chở tồn đọng của người khác, tối đa ~20×15s.
- **N5** bản vá B1 (CHƯA COMMIT): `sendInput` chạy TRƯỚC khi hàng terminal thôi `hidden` và
  trước lượt `fit()` (fit đi qua `workspaceLayoutToken` → rAF). Lệnh vào PTY ở số cột CŨ
  (bài IDE chưa từng mở tab Terminal thì đó là mặc định 80×24 của xterm), rồi `resize` mới
  tới sau — dòng lệnh echo ra ở bề rộng sai rồi mới được reflow. Ngoài ra `exec` nay có
  `activeTab` trong deps nên đổi danh tính mỗi lượt chuyển tab.
- **N6** đường `ResizeObserver` của `terminal-core.ts:305-331` KHÔNG đi qua `tryMeasure`
  mà qua `measure()` (= `tryMeasure() ?? lastSize`, tức KÍCH THƯỚC CŨ khi ẩn). Nó an toàn
  nhờ phép dedup theo giá trị trong `notifyResize`, không nhờ chốt `null` của `fit()`.
  Một cái chốt mảnh hơn chốt mà chú thích đầu `workspace-panel.tsx` viện dẫn.
- **N7** `tokens.ts` — `revokeDescendants` bỏ trần 100 thế hệ và nay chạy TRONG transaction
  đang giữ `SELECT … FOR UPDATE` trên hàng `users`. Chuỗi dài = giữ khoá lâu.
- **N8** `tokens.contract.test.ts` khai `C1_JOURNEY_TOKENS` kèm lý lẽ *"Dạng `rgb()`, không
  phải `oklch()`"* nhưng KHÔNG có ô nào khẳng định dạng đó. Chốt thật nằm ở e2e:
  `readJourneyPalette` trả `null` ⇒ `onError()` ⇒ `data-scene-state="fallback"` ⇒
  `landing-3d.spec.ts` đỏ. Cổng có thật, chỉ không ở nơi chú thích trỏ tới.
- **N9** `content-ide-k8s-guard.test.ts` → `readContentTree` `continue` im lặng khi
  `backend.imageid` không phải chuỗi. Một mục khai `layout: ide` mà thiếu khối `backend`
  là vô hình với cổng.
- **N10** `games-copy-quality.test.ts` — bộ thu `userFacingStrings()` liệt kê tay
  (`title`, `description`, `GAME_TOPIC_LABEL`, `GAME_META[].label`). Thêm một trường chữ
  mới vào `GameEntry` thì không gì đỏ. Ô "chống tập rỗng" chỉ đếm `> 0`, không so với
  hình dạng kiểu.

---

## ĐÃ KIỂM CHỨNG (nêu nguồn để bác bỏ được, không phải lời khen)

1. **Số con của ngăn xếp LÀ hằng số** — `workspace-panel.tsx:236-291`: hai `<div>` luôn
   render; nhánh `tabs.length > 1` chỉ đổi PROPS. Hàng 1 vẫn render khi `editor` vắng.
2. **Chốt `fit()` đúng chỗ đã đoán** — `terminal-core.ts:354-364` gọi `tryMeasure()` và
   `return` khi `null`; `tryMeasure()` (199-210) trả `null` khi `clientWidth < 1 ||
   clientHeight < 1`. Phần tử trong cây `display:none` có cả hai bằng 0.
3. **Bẫy `[hidden]` + `.flex` KHÔNG dính** — cả hai hàng mang `min-h-0 min-w-0 flex-1
   overflow-hidden`; không token nào thuộc `DISPLAY_UTILITIES`.
4. **`parseWorkspaceState` đọc được bản ghi cũ** — chỉ đọc `activeTab`, bỏ qua
   `terminalPercent`. (`terminal-1` của SỬA ĐỔI 1 bị từ chối → rơi về mặc định.)
5. **`src/instrumentation.ts` được Next nạp thật** — `next@16.3.4`
   `dist/build/utils.js:1177` đẩy cả `<root>/` lẫn `<root>/src/`; 283 và 1172 so khớp cả
   hai. (Đọc mã, không đọc tài liệu.)
6. **`verification.storeIdentifier` có thật và khớp tiền tố** — better-auth@1.6.26
   `dist/db/verification-token-storage.mjs`: `getStorageOption` duyệt `overrides` bằng
   `identifier.startsWith(prefix)`; `dist/api/routes/password.mjs:77` tạo identifier
   `reset-password:${verificationToken}`. Nên mã reset trong `verifications` được SHA-256.
7. **Nhãn profile KHỚP pod ở cả ba đường** — lesson: `routers/lessons.ts:128` cho cả nhãn
   lẫn `startSession`; lab: `profileForLab` và `startAttempt` cùng
   `(sandboxCapabilities(lab), lab.interfaceLayout)`; playground: cùng
   `(playground.capabilities, playground.interfaceLayout)`.
8. **`last_error` không rò** — `sanitizeDeliveryError` xoá bí mật đã biết (case-insensitive)
   rồi mọi chuỗi hình-dạng-email, cắt độ dài SAU cùng. `sendPasswordResetMail` đã thu mọi
   lỗi SMTP về một chuỗi hằng trước đó.
9. **`SKIP LOCKED` được chứng minh, không phải tautology** —
   `password-reset-outbox.integration.test.ts:148-178` giữ khoá bằng một `send` treo rồi
   chạy lượt drain thứ hai và khẳng định nó gửi 0.
10. **CSP loopback có đủ hai chiều** — `rule-09-headers.test.ts` kiểm cả
    `http://localhost.example.com` (bẫy `startsWith`) lẫn `x-forwarded-host: localhost`.
11. **`env-check` FRAMEWORK_INJECTED có nửa chống-ôi đúng chiều** — khai trong
    `.env.example` ⇒ cổng ĐỎ.
12. **`check-no-antipattern` miễn trừ có nửa chống-ôi** — selfTest đọc file thật và đòi
    dòng khai còn tồn tại; `rel` đã chuẩn hoá `\` → `/` nên không lệch trên Windows.

---

## CHƯA ĐỌC (phạm vi tôi KHÔNG nói gì về)

- Toàn bộ lane landing 3D: `scroll-experience.tsx`, `experience-models.tsx`,
  `experience-scene.tsx` (chỉ đọc phần palette), `experience.module.css`,
  `landing.module.css`, `lab-preview.tsx`, `full-page-motion.ts`, `hero.tsx`,
  `value-props.tsx`, `curriculum.tsx`, `home-section.tsx`, `getting-started.tsx`,
  `app/page.tsx`, `opengraph-image.tsx`, `home-cta.tsx`
- `packages/copy`: `surfaces/{author,home,problem,auth,catalog}.ts`,
  `copy.contract.test.ts`, `ui-source-coverage.test.ts`, `registry.ts`, `t.ts`
- `app/author/problems/**` + `components/author/**` (~40 file)
- `packages/ui`: `alert/button/card/search-tabs` (.tsx + test)
- `scripts/seed-content.mjs`; `scripts/check-bundle-budget.mjs` (chỉ đọc các nhánh thoát)
- e2e: `landing-3d.spec.ts` (chỉ grep), `landing-visual.spec.ts`, `password-reset.spec.ts`,
  `a11y/games/keyboard/perf.spec.ts`, `scripts/start-local-server.mjs`
- test: `password-reset.integration.test.ts`, `refresh-races.integration.test.ts`,
  `password-reset-outbox-worker.test.ts`, `password-reset-forms.test.tsx`,
  `workspace-panel.test.tsx` (chỉ grep), `preferences.test.ts`,
  `labs-start-attempt-setup.test.ts`
- `app/reset-password/reset-password-form.tsx`
- docs: `bundle-budget.md`, `design-guidelines.md`, `design-system.md`, `content-sources.md`
- plans/contracts/reports (~20 file) — chỉ grep `p16-workspace.md`
- `packages/games/src/k8s/problem.ts`, `problem-labels.ts`, quiz/problems client
