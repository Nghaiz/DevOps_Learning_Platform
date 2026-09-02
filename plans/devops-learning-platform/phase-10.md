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

- [ ] Lộ trình gom lesson + lab + quiz theo thứ tự; một item nằm được ở nhiều lộ trình.
- [ ] **Không cột derived nào** trong 6 bảng mới; mỗi cột có lý do ghi trong migration.
- [ ] `sequential: true` ⇒ item N khoá tới khi N−1 đạt, **kiểm ở server**; gọi thẳng API item bị khoá vẫn bị từ chối.
- [ ] DTO quiz gửi client **không có** `isCorrect` — và đó là điều **compile** chặn (có test type hoặc một `Omit` tường minh), không phải một `if`.
- [ ] Nộp quiz ⇒ chấm server-side, trả kết quả từng câu + giải thích.
- [ ] Quy tắc chấm câu nhiều đáp án hiện trên UI **trước khi** người học làm.
- [ ] Rate-limit đường nộp (luật 5); dò đáp án bằng cách nộp liên tục bị chặn.
- [ ] Validate lúc lưu quiz: ≥2 lựa chọn, ≥1 đúng, không phải tất cả đều đúng.
- [ ] Trang "của tôi": mọi con số tính lúc đọc; nhãn không khẳng định thứ không lưu.
- [ ] **Không có** bảng/cột/route nào liên quan giá, thanh toán, gói cước, entitlement (grep chứng minh).

## Verify commands

```bash
pnpm --filter web test -- paths quiz
grep -rniE 'price|sku|billing|entitlement|checkout|subscription' apps/web/src packages | grep -v node_modules   # phải rỗng
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
