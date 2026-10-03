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
 *
 * ── Chuỗi đọc qua `t()` ─────────────────────────────────────────────────────
 * Mọi nhãn so ở đây lấy từ bản đồ copy (`catalog.quiz.*`), không chép vào
 * spec: một bản chép trong harness là bản sao thứ hai của dữ liệu, và bản sao
 * thì trôi (`path.flow.spec.ts` từng đỏ đúng vì chuyện đó).
 */

import { t } from '@devops-platform/copy';
import { expect, test } from './flow-kit';
import { firstItemId, trpcQuery } from '../fixtures/api';
import { openScreen } from '../fixtures/nav';

test.describe('luồng 3 — quiz', { tag: '@flow' }, () => {
  test('làm → nộp → chấm → giải thích', async ({ page, api }) => {
    const quizId = await firstItemId(api, 'quiz.list');
    expect(
      quizId,
      'quiz.list trả 0 mục nên không có quiz nào để đi luồng này. Danh mục rỗng là ' +
        'vấn đề của bản deploy, không phải của harness.',
    ).not.toBeNull();

    // Mốc đạt của CHÍNH quiz này, đọc từ cùng procedure trang dùng. Banner điểm
    // nói "Đạt (mốc N%)" / "Chưa đạt (mốc N%)"; có N thì so được nguyên câu qua
    // `t()` thay vì một regex chép tay từ copy.
    const { quiz } = await trpcQuery<{ quiz: { passThresholdPercent: number } }>(api, 'quiz.get', {
      quizId,
    });
    const threshold = quiz.passThresholdPercent;

    await openScreen(page, `/quiz/${encodeURIComponent(quizId ?? '')}`, 'user');

    // ── 0. Quy tắc chấm đứng TRƯỚC câu hỏi đầu tiên (AC 13.D #6) ────────────
    // Khối quy tắc là `<section aria-labelledby>` với tiêu đề cấp 2. Trang vẽ
    // `h1` ("Đang tải") cả lúc `quiz.get` còn chạy, nên chờ TIÊU ĐỀ QUY TẮC —
    // thứ chỉ có khi dữ liệu đã về — trước khi đếm bất cứ gì bên dưới.
    await expect(
      page.getByRole('heading', { level: 2, name: t('catalog.quiz.grading-title'), exact: true }),
    ).toBeVisible();

    // ── 1. Làm bài ──────────────────────────────────────────────────────────
    // Mỗi câu là MỘT `<li data-testid="quiz-question">` chứa đúng các ô của nó.
    // Radix cho `role="radio"` (một đáp án) và `role="checkbox"` (nhiều đáp
    // án); một quiz có thể trộn cả hai kiểu câu. Ô chọn được tìm TRONG các câu,
    // không trên cả trang, để một ô chọn ở vỏ ứng dụng không lọt vào phép đếm.
    const questions = page.getByTestId('quiz-question');
    const questionCount = await questions.count();
    expect(questionCount, 'Không có câu hỏi nào (data-testid=quiz-question).').toBeGreaterThan(0);

    const controls = questions.getByRole('radio').or(questions.getByRole('checkbox'));
    const count = await controls.count();
    expect(
      count,
      'Quiz render 0 ô lựa chọn. Một trang quiz không có lựa chọn nào vẫn hiện ra, ' +
        'và mọi phép kiểm hình thức vẫn xanh trên nó.',
    ).toBeGreaterThan(0);

    // Chọn ô đầu tiên của mỗi câu. Đi theo từng khối câu là cách duy nhất chọn
    // ĐÚNG MỘT ô cho mỗi câu thay vì chọn hết mọi ô trên trang (sai với câu
    // một-đáp-án và vô nghĩa với câu nhiều).
    for (let i = 0; i < questionCount; i += 1) {
      const card = questions.nth(i);
      const first = card.getByRole('radio').or(card.getByRole('checkbox')).first();
      if (await first.count()) {
        await first.click();
      }
    }

    // Nút "Nộp bài" DUY NHẤT của trang nằm trong phiếu trả lời
    // (`role="region"`, `catalog.quiz.sheet`), và phiếu CHỈ tồn tại trước khi
    // nộp — sau khi chấm, khối kết quả thay chỗ nó. Dùng nó làm mốc "chưa
    // chấm", để bước 5 chứng minh được trạng thái đã đổi.
    const sheet = page.getByRole('region', { name: t('catalog.quiz.sheet') });
    const submit = sheet.getByRole('button', { name: t('catalog.quiz.submit'), exact: true });
    await expect(submit).toBeVisible();

    // ── 2. Trước khi nộp: KHÔNG có giải thích nào lộ ra ─────────────────────
    // `QuizQuestionForLearner.explanation?: never` — nếu khối giải thích xuất
    // hiện ở đây thì payload đã rò đáp án, và đó là một lỗi bảo mật nội dung
    // chứ không phải một chi tiết giao diện.
    const explanations = page.getByTestId('quiz-explanation');
    await expect(
      explanations,
      'Có khối giải thích TRƯỚC khi nộp. Giải thích thường tiết lộ đáp án, nên ' +
        'thấy nó lúc này nghĩa là đáp án đã tới client trước khi chấm.',
    ).toHaveCount(0);

    const restart = page.getByRole('button', { name: t('catalog.quiz.restart') });
    await expect(
      restart,
      'Nút "Làm lại từ đầu" chỉ hiện SAU khi có kết quả. Thấy nó trước khi nộp ' +
        'nghĩa là trang đang ở trạng thái đã-chấm mà ta chưa nộp gì.',
    ).toBeHidden();

    // ── 3. Nộp ──────────────────────────────────────────────────────────────
    await submit.click();

    // ── 4. Chấm: banner điểm + nhãn từng câu ────────────────────────────────
    const verdict = page
      .getByText(t('catalog.quiz.verdict-pass', { threshold }), { exact: true })
      .or(page.getByText(t('catalog.quiz.verdict-fail', { threshold }), { exact: true }));
    await expect(
      verdict,
      'Nộp bài xong nhưng không thấy banner điểm (hoặc banner nói một mốc khác ' +
        `${threshold}% của quiz.get). \`ScoreBlock\` là chỗ DUY NHẤT trang nói kết quả tổng.`,
    ).toBeVisible({ timeout: 60_000 });

    // Nhãn Đúng/Chưa đúng ở đầu MỖI câu, không chỉ ở đâu đó trên trang: server
    // chấm mọi câu (`gradeQuiz` map trên toàn bộ `quiz.questions`), nên câu nào
    // thiếu nhãn là câu FE đánh rơi kết quả. Người học biết mình được bao nhiêu
    // mà không biết sai ở câu nào.
    //
    // ⚠ Không kiểm `toHaveCount(1)` mỗi câu: một câu Đúng/Sai có thể có một lựa
    // chọn mà chữ đúng bằng "Đúng", và nó cũng khớp `getByText` chính xác. Ô
    // "phiếu trả lời" trong `ScoreBlock` cũng KHÔNG dùng được làm bằng chứng:
    // nó vẽ một ô cho mọi câu và ngầm coi câu thiếu kết quả là "Chưa đúng", nên
    // nó không bao giờ đỏ.
    for (let i = 0; i < questionCount; i += 1) {
      const card = questions.nth(i);
      await expect(
        card
          .getByText(t('catalog.quiz.answer-correct'), { exact: true })
          .or(card.getByText(t('catalog.quiz.answer-wrong'), { exact: true })),
        `Câu thứ ${i + 1} không mang nhãn Đúng/Chưa đúng sau khi chấm.`,
      ).not.toHaveCount(0);
    }

    // ── 5. Sau khi chấm: bài bị khoá, phiếu biến mất, làm lại được ──────────
    // `locked` ⇒ mọi ô disabled. Không khoá nghĩa là người học sửa được lựa
    // chọn sau khi đã thấy đáp án, và màn hình khi đó nói dối về bài làm.
    await expect(
      controls.first(),
      'Đã chấm mà ô lựa chọn vẫn bấm được — `locked` không tới nơi.',
    ).toBeDisabled();
    await expect(
      submit,
      'Đã chấm mà nút "Nộp bài" vẫn còn — trang chưa rời trạng thái "chưa chấm".',
    ).toBeHidden();
    await expect(restart).toBeVisible();

    // ── 6. Giải thích ───────────────────────────────────────────────────────
    // Giải thích là TUỲ NỘI DUNG (người soạn có thể để trống), nên vắng nó
    // không phải lỗi của FE. Ghi nhận vào báo cáo thay vì đỏ mập mờ, và cũng
    // KHÔNG lặng lẽ coi như đã kiểm: bước 2 chỉ có nghĩa khi ở đây có giải thích.
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
