# Phase 10 — Lộ trình học và Quiz

**Mức chi tiết:** DETAILED · **Effort:** M · **Blocks:** P13 (FE lộ trình) · **Blocked by:** P8 (lab), P9 (nội dung động)

> Hai mục còn lại lấy từ KodeKloud trong ràng buộc dài hạn: **"quiz"** và **"cách gom nhiều bài thành lộ trình"**. Cả hai là lớp mỏng phía trên nội dung đã có — nếu phase này phình ra thành một hệ thống LMS thì nó đã đi lạc.

## Ranh giới, viết lại vì đây là chỗ dễ trượt nhất

⛔ **"Khoá học" ở đây CHỈ là cách nhóm nội dung** — một danh sách scenario/lab **có thứ tự**. Không `price`, không `sku`, không `entitlement`, không giỏ hàng, không paywall, không chứng chỉ-như-hàng-hoá. Quyền truy cập vẫn chỉ là **đăng nhập**.

Nếu một task trong phase này bắt đầu cần bảng `enrollments` với trạng thái thanh toán, hoặc một cột `isPaid` — **dừng lại và hỏi chủ dự án**. Đó là ranh giới, không phải chi tiết.

## Objective

1. Nhiều bài gom thành một **lộ trình** có thứ tự; người học thấy mình đang ở đâu, cái gì mở, cái gì còn khoá.
2. **Quiz**: câu hỏi trắc nghiệm chấm ngay, dùng xen giữa các bài để kiểm hiểu — không cần sandbox, không tốn pod.

## Task list

### 10.A — Lộ trình

1. `learning_paths`: `id`, `slug`, `title`, `description`, `authorId`, `state` (draft|published|archived), timestamps.
2. `learning_path_items`: `pathId`, `ordinal`, `itemKind` (lesson|lab|quiz), `itemId`. Một item xuất hiện được ở nhiều lộ trình.
3. **KHÔNG** cột `itemCount`, **KHÔNG** `totalMinutes`, **KHÔNG** `completionPercent` — cả ba đếm/cộng được. Tiến độ lộ trình tính từ tiến độ từng item ở chỗ hiển thị.
4. Điều kiện mở: **mặc định mở hết** (học tự do). Khoá tuần tự là **tuỳ chọn của lộ trình** (`sequential: bool`) — và khi bật thì luật mở là "item N mở khi N−1 đạt", tính ở server, không tin client.
5. `paths.get` trả item kèm trạng thái của **chính người gọi**. Không nhận `userId` (luật 1). Cap 100 (luật 4).

### 10.B — Quiz: mô hình dữ liệu

6. `quizzes` + `quiz_questions` + `quiz_choices`. Kiểu câu hỏi: **một đáp án** và **nhiều đáp án**. Chỉ hai kiểu — kiểu tự luận cần người chấm và nằm ngoài phạm vi.
7. ⛔ **Đáp án đúng KHÔNG BAO GIỜ rời server.** DTO gửi cho client **không có** field `isCorrect`. Đây là một quyết định kiểu dữ liệu, không phải một điều kiện `if`: dựng hai type (`QuizQuestionForLearner` không có field đó / `QuizQuestionFull` có) để lộ đáp án là một lỗi **compile**, không phải một lỗi runtime người ta phát hiện bằng devtools.
8. `quiz_attempts` + `quiz_answers`: lưu người học **chọn gì**, lúc nào, lần thử thứ mấy. **KHÔNG** lưu `score` (tính được), **KHÔNG** lưu `isCorrect` mỗi câu (so được với đáp án).

### 10.C — Chấm quiz

9. `quiz.submit` chấm server-side, trả **kết quả từng câu + giải thích** (nếu có) sau khi nộp. Trước khi nộp, client không có gì để đoán.
10. Nhiều đáp án: quy tắc chấm phải nêu rõ trên UI trước khi làm — đề xuất **đúng hoàn toàn mới tính điểm** (đơn giản, không gây tranh cãi). Ghi vào `docs/quiz-format.md`.
11. Chống dò đáp án: giới hạn số lần nộp mỗi phút (dùng lại lớp rate-limit đã có, luật 5). Không cần trần cứng số lần làm — mục tiêu là học, không phải thi.

### 10.D — Quiz soạn được trên UI

12. Tái dùng đường soạn của P9: quiz là một `content_items.kind` nữa hoặc bảng riêng — **chọn một và ghi lý do**. Đề xuất bảng riêng vì quiz không có step/script/asset, nhét vào `content_steps` sẽ đẻ ra cột luôn null.
13. Validate lúc lưu: ít nhất 2 lựa chọn, ít nhất 1 đáp án đúng, không câu nào 100% lựa chọn đúng (một câu như thế không đo được gì).

### 10.E — Tiến độ gom lại

14. Trang "của tôi": lộ trình đang học, item kế tiếp, lịch sử lab/quiz. Mọi con số **tính lúc đọc**.
15. ⚠ Bẫy đã trả giá ở P2: nhãn tiến độ từng nói nhiều hơn thứ ta lưu (`"4/4 bước"` từ đúng một lượt chấm). Nhãn lộ trình phải nói đúng thứ nó biết — nếu chỉ biết "item nào đã đạt" thì đừng viết như thể biết "đã học bao lâu".

## File / dir ownership

`apps/web/src/server/db/schema.ts` + migration · `apps/web/src/server/trpc/routers/{paths,quiz}.ts` · `packages/shared-types/src/{path,quiz}.ts` · `apps/web/src/server/content/**` · `docs/quiz-format.md`, `docs/learning-path.md`

## Dependencies

- **Blocked by:** P8 (item kind `lab`), P9 (soạn trên UI). Lộ trình chỉ gồm lesson thì làm được ngay sau P5.
- **Blocks:** P13 (FE).

## Acceptance criteria

> Tích từ bằng chứng của phiên 2026-09-04 — báo cáo:
> `reports/2026-09-04-verify-p10.md`. Ô nào KHÔNG đóng được thì ghi rõ vì sao,
> không tích.

- [x] Lộ trình gom lesson + lab + quiz theo thứ tự; một item nằm được ở nhiều lộ trình.
      — `paths-quiz-authz.test.ts` (SQL thật): cùng quiz nằm ở cả `PATH_SEQ` lẫn
      `PATH_FREE`, thứ tự `['lesson','quiz']` giữ nguyên. ⚠ Nhánh **lab** đúng
      về kiểu và dùng lại `computeLabScore`/`computeLabStatus` (đã test kỹ ở P8)
      nhưng CHƯA chạy end-to-end trong một lộ trình — xem §nợ của báo cáo.
- [x] **Không cột derived nào** trong 6 bảng mới; mỗi cột có lý do ghi trong migration.
      — lý do từng cột ở `schema.ts` § "LỘ TRÌNH + QUIZ"; `0006_*.sql` mang header
      liệt kê CỘT KHÔNG TỒN TẠI và trỏ về đó (chép lý do sang .sql sẽ là bản sao
      thứ hai trôi khỏi bản gốc ở lần `db:generate` kế).
- [x] `sequential: true` ⇒ item N khoá tới khi N−1 đạt, **kiểm ở server**; gọi thẳng API item bị khoá vẫn bị từ chối.
      — `paths.openItem` trên item khoá → FORBIDDEN; **đối chứng dương**: item
      `available` cho qua. Đạt item trước ⇒ item sau mở ra, tính lại từ tiến độ
      thật. Tiến độ của A không mở khoá cho B.
- [x] DTO quiz gửi client **không có** `isCorrect` — và đó là điều **compile** chặn.
      — `isCorrect?: never`/`explanation?: never` + `@ts-expect-error` ×5.
      **Đối chứng âm đã chạy:** gỡ rào ⇒ `tsc` ĐỎ (`TS2578 Unused '@ts-expect-error'`)
      ở đúng hai dòng lựa chọn. Cổng tự báo khi chính nó bị tháo.
- [x] Nộp quiz ⇒ chấm server-side, trả kết quả từng câu + giải thích.
      — `quiz.submit` trả `correctChoiceIds` + `explanation`; id lựa chọn bịa bị
      TỪ CHỐI (không âm thầm chấm sai).
- [x] Quy tắc chấm câu nhiều đáp án hiện trên UI **trước khi** người học làm.
      — **Nửa hợp đồng đóng:** `quiz.get` mang `multipleAnswerRule` trong payload
      (test khẳng định), và `quiz-client.tsx` render nó TRÊN câu hỏi đầu tiên, câu
      chữ lấy TỪ payload chứ không viết cứng ở FE. **Nửa còn lại đóng 2026-09-08** bằng
      Chrome thật: thẻ "Cách chấm" đứng TRƯỚC câu hỏi đầu tiên ở trạng thái
      `0/6 câu` chưa chọn; đối chứng per-question cùng trang (5 câu `single`
      mang nhãn "Chọn một đáp án" + `radiogroup`, câu `multiple` mang "Chọn
      nhiều đáp án" + checkbox). Luật hiển thị ĐÚNG LÀ luật được áp: chọn 1
      trong 2 đáp án đúng ⇒ "Chưa đúng", 5/6 = 83%. [đo 2026-09-08](reports/harness/2026-09-08-ac-browser/run.md).
- [x] Rate-limit đường nộp (luật 5); dò đáp án bằng cách nộp liên tục bị chặn.
      — bucket RIÊNG `quiz:submit:<userId>`, `QUIZ_SUBMIT_LIMIT_PER_MIN = 6`;
      test nộp liên tục chạm trần và nhận TOO_MANY_REQUESTS.
- [x] Validate lúc lưu quiz: ≥2 lựa chọn, ≥1 đúng, không phải tất cả đều đúng.
      — `quiz/validate.test.ts`, kèm **đối chứng dương** (quiz hợp lệ không bị từ
      chối) và một luật thứ tư mà phép chấm bắt buộc: câu `single` chỉ được có
      ĐÚNG một đáp án đúng.
- [x] Trang "của tôi": mọi con số tính lúc đọc; nhãn không khẳng định thứ không lưu.
      — `paths.mine` tính `passedCount`/`itemCount`/`nextItemId` lúc đọc, không
      cột nào lưu chúng; `me-client.tsx` chỉ hiện ba con số đó. **Đóng 2026-09-08**
      bằng Chrome thật, và vế "tính lúc đọc" chứng minh ở tầng SCHEMA chứ
      không ở tầng nhìn UI: `quiz_attempts` chỉ có `id,user_id,quiz_id,
      submitted_at` — **không cột điểm nào**, `lab_attempts` không cột kết
      quả, và toàn schema không có `passed_count`/`item_count`/`next_item_id`
      (truy vấn vẫn trả 2 dòng `pass_threshold_percent` nên không phải phép
      đo rỗng). Số trên UI khớp từng giây với Redis (`createdAt` = "Mở lúc").
      "Kết thúc được từ đây" bấm thật qua hộp thoại: đúng MỘT phiên biến mất,
      phiên kia còn nguyên, sức chứa 18→19, server `status=REAPED` + pod đã
      xoá. [đo 2026-09-08](reports/harness/2026-09-08-ac-browser/run.md).
- [x] **Không có** bảng/cột/route nào liên quan giá, thanh toán, gói cước, entitlement (grep chứng minh).
      — 0 dòng trong mã THỰC THI và 0 trong mọi migration. ⚠ Lệnh grep gốc ở
      dưới KHÔNG BAO GIỜ rỗng và đã không rỗng TỪ TRƯỚC P10: `checkout` khớp
      `checkOutcomes` (13 dòng ở lesson/lab client, P2/P8). Lệnh đã sửa ở dưới.

## Verify commands

```bash
# Cần Postgres: docker compose up -d postgres && pnpm --filter web db:migrate
pnpm --filter web test -- paths quiz
npx turbo run typecheck lint test build          # 20/20 tasks

# ⛔ Lệnh grep trong bản phác KHÔNG dùng được — `checkout` khớp `checkOutcomes`
# (13 dòng ở lesson/lab client, có TỪ TRƯỚC P10), nên nó không bao giờ rỗng và
# một lượt chạy đỏ ở đó không nói lên điều gì. Bản đã sửa — bỏ chú thích, bỏ
# test gác, dùng ranh giới từ:
grep -rnE '\b(price|sku|billing|entitlement|checkout|subscription|isPaid|is_paid|enrollment)\b' \
  apps/web/src packages --include='*.ts' --include='*.tsx' \
  | grep -v node_modules \
  | grep -vE '\.test\.tsx?:' \
  | grep -vE ':[0-9]+: *(//|\*|/\*)'          # phải rỗng

# Migration là nguồn sự thật của schema — kiểm riêng, bỏ dòng chú thích SQL:
grep -rniE 'price|sku|billing|entitlement|is_paid|enrollment' apps/web/drizzle/*.sql \
  | grep -v ':--'                              # phải rỗng

# Đối chứng ÂM của rào compile — gỡ `isCorrect?: never` khỏi QuizChoiceForLearner
# rồi chạy typecheck; PHẢI đỏ:
#   TS2578 Unused '@ts-expect-error' directive — src/quiz-dto-leak.test.ts

# Payload thật (khi có server chạy). Bản không cần server đã nằm trong
# quiz-dto-leak.test.ts + paths-quiz-authz.test.ts:
curl -s .../trpc/quiz.get?input=... | jq '..|.isCorrect? // empty'   # phải rỗng
```

## Risk Assessment (P10)

| Rủi ro | L | I | Score | Mitigation |
|---|---|---|---|---|
| Đáp án lộ qua API | 3 | 5 | **15** | Hai type tách bạch; lộ là lỗi compile; test grep `isCorrect` trên payload thật. |
| Phạm vi trượt sang thương mại | 3 | 4 | 12 | Ranh giới viết ở đầu file; grep trong AC; gặp `enrollment/payment` thì hỏi chủ dự án. |
| Khoá tuần tự kiểm ở client | 3 | 4 | 12 | Kiểm ở server; test gọi thẳng API item bị khoá. |
| Sáu bảng mới mọc cột derived | 3 | 3 | 9 | Rà từng cột trong review; migration ghi lý do. |
| Quiz phình thành hệ thống thi cử | 2 | 3 | 6 | Chỉ hai kiểu câu hỏi; không giới hạn số lần làm; mục tiêu là học. |

## Timeline (P10)

| Task | Effort |
|---|---|
| 10.A lộ trình | M |
| 10.B mô hình quiz | S |
| 10.C chấm | M |
| 10.D soạn quiz | M |
| 10.E tiến độ gom | S |
| **Total** | **M** |
