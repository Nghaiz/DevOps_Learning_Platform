# Định dạng quiz và quy tắc chấm

SSOT của quiz (P10 — 10.B/10.C/10.D). Khi tài liệu này và mã nguồn bất đồng, mã nguồn thắng và tài liệu này là bug.

| Thứ | Ở đâu |
|---|---|
| DTO + rào compile | `packages/shared-types/src/quiz.ts` |
| Phép chấm (thuần) | `packages/scenario/src/quiz-score.ts` |
| Cổng xuất bản | `apps/web/src/server/quiz/validate.ts` |
| Bảng | `apps/web/src/server/db/schema.ts` § "LỘ TRÌNH + QUIZ" |
| Router | `apps/web/src/server/trpc/routers/quiz.ts` |

## Ranh giới

⛔ Quiz là **công cụ kiểm hiểu giữa các bài**, không phải hệ thống thi cử. Không có trần cứng số lần làm, không có giám sát, không có chứng chỉ. Mục tiêu là học.

Chỉ **hai** kiểu câu hỏi: `single` (một đáp án) và `multiple` (nhiều đáp án). Tự luận cần người chấm — nó kéo theo hàng đợi chấm, vai trò người chấm và tranh chấp điểm, tức là một sản phẩm khác.

## Vì sao quiz nằm ở bảng riêng, không phải `content_items.kind`

Task 12 của phase-10 để ngỏ hai đường và đòi ghi lý do. Lý do là **bằng chứng, không phải sở thích**:

`content_items.tier` và `content_items.backend_image_id` đều **`NOT NULL`**. Một quiz không có tier và không có image — nó không dựng pod nào. Nhét quiz vào bảng đó buộc phải nới cả hai cột thành nullable, tức là làm **yếu** ràng buộc cho ba loại nội dung thật sự cần chúng, để chứa một loại không cần. Thêm nữa, `content_steps` (step / script / asset) sẽ toàn `null` cho quiz — đúng thứ task 12 dự đoán.

Cái giá đã trả có ý thức: vòng đời nháp→xuất bản không dùng lại được `content_states`.

### Vòng đời: `draft` → `published` → `archived`, KHÔNG có `publishing`

`content_states` có `publishing` vì lượt chạy thử của lesson/lab dựng sandbox thật (tới ~49 s đo ở P7) và không vừa trong một request. Quiz không có gì để chạy thử — cổng của nó là `assertQuizPublishable`, thuần logic, vài micro-giây. Một trạng thái không bao giờ tồn tại quá một mili-giây là một trạng thái mà người đọc code sẽ hiểu sai về sau.

`archived` thay cho **xoá**: `quiz_attempts` giữ lịch sử người học, và một quiz biến mất làm lịch sử đó trỏ vào hư không.

## Đáp án không bao giờ rời server trước khi nộp

Đây là ràng buộc số một, và nó là một quyết định **kiểu dữ liệu**, không phải một điều kiện `if`.

Hai cây type song song:

| | `isCorrect` | `explanation` |
|---|---|---|
| `QuizChoiceFull` / `QuizQuestionFull` (chỉ ở server) | có | có |
| `QuizChoiceForLearner` / `QuizQuestionForLearner` (rời server được) | `never` | `never` |

Rào dựng bằng **hai lớp, và cần cả hai**:

1. **`.strict()`** trên schema — chặn ở runtime khi parse.
2. **`isCorrect?: never`** trên type — chặn ở compile.

Lớp 2 tồn tại vì lớp 1 một mình không đủ, và lý do rất dễ bỏ qua: TypeScript chỉ kiểm "field thừa" trên **object literal tươi**. Một `QuizChoiceFull[]` gán vào `{id, markdown}[]` là hợp lệ về cấu trúc — mảng không phải literal tươi, nên không lượt kiểm nào chạy. `isCorrect?: never` làm phép gán đó hỏng.

`toLearnerQuiz` (`server/quiz/repository.ts`) là chỗ **duy nhất** dựng `QuizForLearner`, và nó khai kiểu trả về tường minh.

Bằng chứng: `packages/shared-types/src/quiz-dto-leak.test.ts`. Nó dùng `@ts-expect-error`, một khẳng định **ngược** — `tsc` gãy nếu dòng sau nó *không* còn lỗi. Nghĩa là **cổng tự báo động khi chính nó bị tháo**; một test runtime thường sẽ lặng lẽ xanh tiếp sau khi rào biến mất.

## Quy tắc chấm

### Một luật cho cả hai kiểu câu hỏi

> **Đúng ⇔ tập lựa chọn đã chọn BẰNG tập đáp án đúng.**

Với `single` (cổng xuất bản ép đúng một đáp án đúng) luật này tự thu về "chọn đúng một lựa chọn, và nó là lựa chọn đúng". Với `multiple` nó là `all-or-nothing` mà task 10 chốt: **đúng hoàn toàn mới tính điểm, không có điểm một phần.**

Viết hai nhánh `if (kind === 'single')` sẽ là hai chỗ để sai thay vì một, và nhánh ít chạy hơn sẽ là nhánh sai.

Hệ quả phụ nhưng quan trọng: một id lựa chọn **không tồn tại** làm hai tập lệch nhau ⇒ câu đó sai. Không cần nhánh "id lạ" riêng, và không có đường nào để `['đáp-án-đúng', 'rác']` được tính là đúng.

### Quy tắc này hiện trên UI TRƯỚC khi làm

AC #6. Câu chữ lấy **từ payload** (`quiz.multipleAnswerRule`), không viết cứng ở FE — viết cứng là dựng nguồn thứ hai cho một luật server sở hữu, và nó sẽ trôi khỏi cách chấm thật ở lần đầu tiên server đổi luật.

### Điểm và mốc đạt

- `percent = floor(số câu đúng / tổng số câu × 100)` — làm tròn **xuống**. Một quiz mốc 80% mà người học đạt 79.6% phải hiện "79%" và trượt, không phải "80%" rồi vẫn trượt.
- Câu **không trả lời** tính là sai và vẫn nằm ở mẫu số — bỏ trống luôn kéo điểm xuống chứ không lặng lẽ biến mất khỏi phép chia.
- `passed ⇔ percent >= quiz.passThresholdPercent`, mốc của **chính quiz đó**, không phải hằng số toàn cục.
- Quiz 0 câu **không đạt**, kể cả khi mốc là 0 — nhánh phòng thủ, vì `0 >= 0` là `true` và một quiz rỗng "đạt" sẽ mở khoá item kế trong lộ trình tuần tự.

## Không lưu field suy ra được

⛔ `quiz_attempts` **không** có `score` / `percent` / `passed`. ⛔ `quiz_answers` **không** có `is_correct`. ⛔ Không có cột `attempt_no`.

Cả ba tính 100% từ `selected_choice_ids` so với `quiz_choices.is_correct`. `attemptNumber` là "đếm lượt nộp trước đó cộng một" — được **tính** và trả trong `quizAttemptResultSchema`, không phải một cột.

> Bản phác của phase-10 (task 8) có nhắc lưu "lần thử thứ mấy". Nó không sống sót qua review: đó đúng loại cột mà chú thích của `lab_task_results` đã cấm bằng tên.

### Hệ quả đã cân nhắc: chấm lại dùng đáp án HIỆN TẠI

Vì điểm không đóng băng, tác giả sửa đáp án sau khi có người nộp sẽ **đổi điểm lịch sử**. Cùng tính chất mà `computeLabScore` đã có (nó chấm theo `lab` hiện tại), và cùng lý do: đóng băng đáp án vào từng lượt nộp là chép `quiz_choices` sang bảng thứ hai.

Nếu về sau cần điểm bất biến, đường đúng là **phiên bản hoá quiz** (một quiz mới khi đáp án đổi), không phải thêm một cột `score`.

## Cổng xuất bản

`assertQuizPublishable` chặn, kèm **tên field** trỏ đúng ô phải sửa:

| Luật | Vì sao |
|---|---|
| ≥1 câu hỏi | task 13 |
| ≥2 lựa chọn mỗi câu | task 13 — một câu một lựa chọn không phải câu hỏi |
| ≥1 đáp án đúng | task 13 |
| **Không** phải mọi lựa chọn đều đúng | task 13 — chọn bừa cũng đúng, câu hỏi không đo được gì |
| Câu `single` có **đúng một** đáp án đúng | không nằm trong task 13, và bắt buộc: phép chấm so tập, nên `single` hai đáp án đúng là câu **không ai đạt được**. Triệu chứng ("ai cũng mất điểm câu 3") không trỏ về nguyên nhân |

Bản **nháp** không đi qua cổng này — nháp lưu tự do (0 câu, thiếu lựa chọn, viết dở). Bắt nháp phải hợp lệ là bắt người soạn viết xong mới được lưu.

## Chống dò đáp án

Đường `quiz.submit` có bucket rate-limit **riêng**: `QUIZ_SUBMIT_LIMIT_PER_MIN = 6` (luật 5, dùng lại `checkRateLimit` — SSOT với `proxy.ts` và `trpc/init.ts`).

`protectedProcedure` đã giới hạn 20 mutation/phút mỗi user, nhưng đó là ngân sách **chia sẻ** cho mọi mutation: nó vừa không chứng minh được đường nộp bị giới hạn, vừa có thể chặn oan một phiên bình thường đã tiêu ngân sách vào việc khác.

Con số 6: một quiz 10 câu hai lựa chọn cần trung bình ~512 lượt nộp để dò hết bằng vũ lực; ở 6 lượt/phút đó là hơn một tiếng rưỡi cho **một** quiz — trong khi người học thật hiếm khi nộp lại quá vài lần một phút.

⚠ Giới hạn còn lại, giống mọi bucket khác của dự án: **in-memory per-process**, nên N replica web = N bucket, và hạn mức thật rộng hơn con số khai báo. Đủ cho quy mô hiện tại; đường đi khi cần chặt là bucket dùng chung qua Redis (đã có `ioredis` + namespace key SSOT).
