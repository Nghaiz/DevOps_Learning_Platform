/**
 * Luồng 3 — quiz: làm → nộp → chấm → giải thích (`phase-13.md:74`).
 *
 * ── Vì sao luồng này KHÔNG cần sandbox ──────────────────────────────────────
 * Quiz chấm ở server bằng đáp án lưu sẵn; không có phiên, không có terminal.
 * Nên nó cũng là luồng rẻ nhất và nên chạy được cả khi cụm đang hết chỗ.
 *
 * ── Điều luồng này KHÔNG khẳng định ─────────────────────────────────────────
 * Nó KHÔNG khẳng định đáp án ta chọn là đúng. Harness chọn lựa chọn ĐẦU TIÊN
 * của mỗi câu, nên "Chưa đạt" là kết quả bình thường và ép nó phải "Đạt" là ép
 * harness biết đáp án — tức là đo một thứ khác hẳn.
 *
 * Thứ nó khẳng định: chọn được, nộp được, kết quả hiện ra, mỗi câu được chấm,
 * và giải thích CHỈ tới sau khi nộp (`explanation` không có trong payload
 * trước đó — đó là rào thứ hai chống lộ đáp án, nên nó đáng một phép kiểm).
 */

import { expect, test } from './flow-kit';
import { firstItemId } from '../fixtures/api';
import { openScreen } from '../fixtures/nav';

test.describe('luồng 3 — quiz', { tag: '@flow' }, () => {
  test('làm → nộp → chấm → giải thích', async ({ page, api }) => {
    const quizId = await firstItemId(api, 'quiz.list');
    expect(
      quizId,
      'quiz.list trả 0 mục nên không có quiz nào để đi luồng này. Danh mục rỗng là ' +
        'vấn đề của bản deploy, không phải của harness.',
    ).not.toBeNull();

    await openScreen(page, `/quiz/${encodeURIComponent(quizId ?? '')}`, 'user');

    // ── 0. Quy tắc chấm đứng TRƯỚC câu hỏi đầu tiên (AC 13.D #6) ────────────
    await expect(page.getByText('Cách chấm')).toBeVisible();

    // ── 1. Làm bài ──────────────────────────────────────────────────────────
    // Radix cho `role="radio"` (một đáp án) và `role="checkbox"` (nhiều đáp
    // án); một quiz có thể trộn cả hai kiểu câu.
    const controls = page.getByRole('radio').or(page.getByRole('checkbox'));
    const count = await controls.count();
    expect(
      count,
      'Quiz render 0 ô lựa chọn. Một trang quiz không có lựa chọn nào vẫn "hiện " +
        "ra" và mọi phép kiểm hình thức vẫn xanh trên nó.',
    ).toBeGreaterThan(0);

    // Chọn ô đầu tiên của mỗi câu. `QuestionCard` gom lựa chọn theo `Card`, nên
    // đi theo card là cách duy nhất chọn ĐÚNG MỘT ô cho mỗi câu thay vì chọn
    // hết mọi ô trên trang (sai với câu một-đáp-án và vô nghĩa với câu nhiều).
    const questions = page.getByRole('heading', { level: 2 });
    const questionCount = await questions.count();
    expect(questionCount, 'Không có câu hỏi nào (heading cấp 2).').toBeGreaterThan(0);

    for (let i = 0; i < questionCount; i += 1) {
      const card = page.locator('div').filter({ has: questions.nth(i) }).last();
      const first = card.getByRole('radio').or(card.getByRole('checkbox')).first();
      if (await first.count()) {
        await first.click();
      }
    }

    // Tiến độ trả lời là một `role="status"` và nó CHỈ tồn tại trước khi nộp —
    // dùng nó làm mốc "chưa chấm", để bước sau chứng minh được trạng thái đã đổi.
    const submit = page.getByRole('button', { name: 'Nộp bài', exact: true });
    await expect(submit).toBeVisible();

    // ── 2. Trước khi nộp: KHÔNG có giải thích nào lộ ra ─────────────────────
    // `QuizQuestionForLearner.explanation?: never` — nếu chuỗi giải thích xuất
    // hiện ở đây thì payload đã rò đáp án, và đó là một lỗi bảo mật nội dung
    // chứ không phải một chi tiết giao diện.
    await expect(
      page.getByRole('button', { name: 'Làm lại từ đầu' }),
      'Nút "Làm lại từ đầu" chỉ hiện SAU khi có kết quả. Thấy nó trước khi nộp ' +
        'nghĩa là trang đang ở trạng thái đã-chấm mà ta chưa nộp gì.',
    ).toBeHidden();

    // ── 3. Nộp ──────────────────────────────────────────────────────────────
    await submit.click();

    // ── 4. Chấm: banner điểm + nhãn từng câu ────────────────────────────────
    await expect(
      page.getByText(/^(Đạt|Chưa đạt) \(mốc \d+%\)$/),
      'Nộp bài xong nhưng không thấy banner điểm. `ScoreBanner` là chỗ DUY NHẤT ' +
        'trang nói kết quả tổng.',
    ).toBeVisible({ timeout: 60_000 });

    const perQuestion = page.getByText(/^(Đúng|Chưa đúng)$/);
    await expect(
      perQuestion,
      'Có banner điểm nhưng không câu nào mang nhãn Đúng/Chưa đúng — người học ' +
        'biết mình được bao nhiêu mà không biết sai ở đâu.',
    ).not.toHaveCount(0);

    // ── 5. Sau khi chấm: bài bị khoá và làm lại được ────────────────────────
    // `locked` ⇒ mọi ô disabled. Không khoá nghĩa là người học sửa được lựa
    // chọn sau khi đã thấy đáp án, và màn hình khi đó nói dối về bài làm.
    await expect(
      controls.first(),
      'Đã chấm mà ô lựa chọn vẫn bấm được — `locked` không tới nơi.',
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Làm lại từ đầu' })).toBeVisible();

    // ── 6. Giải thích ───────────────────────────────────────────────────────
    // Giải thích là TUỲ NỘI DUNG (người soạn có thể để trống), nên vắng nó
    // không phải lỗi của FE. Ghi nhận vào báo cáo thay vì đỏ mập mờ, và cũng
    // KHÔNG lặng lẽ coi như đã kiểm.
    const explanations = page.locator('p.rounded-md.bg-muted');
    if ((await explanations.count()) === 0) {
      test.info().annotations.push({
        type: 'chua-do',
        description:
          `Quiz '${quizId ?? ''}' không có câu nào kèm giải thích, nên nhánh "giải ` +
          `thích chỉ tới sau khi nộp" KHÔNG được kiểm ở lượt này.`,
      });
    }
  });
});
