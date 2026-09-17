import type { ExamSeedStrategy } from '../db/schema';

/**
 * Cổng SOẠN ĐỀ (§18.G.3) — hàm thuần, không chạm DB.
 *
 * Nhận danh sách bài ĐÃ TRA rồi mới phán, thay vì tự truy vấn. Không phải để
 * cho gọn: một cổng tự truy vấn thì chỉ đo được bằng một DB thật, và lúc đó
 * mọi ô nghiệm thu về luật soạn đề sẽ phải dựng dữ liệu thật cho từng ca. Các
 * luật ở đây là luật SUY LUẬN, nên chúng đo được bằng dữ liệu bịa.
 *
 * ## ⛔ Cổng này gác lúc SOẠN, và một mình nó KHÔNG đủ
 *
 * Plan §18.G nói thẳng, và nó đúng: G.3 gác lúc soạn đề, còn cổng thứ hai gác
 * lúc NỘP. Thiếu cổng thứ hai thì một đề soạn đúng luật vẫn bị lách ở bước nộp
 * (người nộp tự mang seed lên), và G.3 sẽ trông như đang bảo vệ một thứ nó
 * không chạm tới. Cổng lúc nộp nằm ở `attempt-seed.ts`.
 */

export interface ExamProblemFacts {
  readonly code: string;
  /** `null` = mã này không tra ra bài nào. */
  readonly state: 'draft' | 'published' | 'archived' | null;
  readonly seedable: boolean;
}

export interface ExamComposeInput {
  readonly problemCodes: readonly string[];
  readonly seedStrategy: ExamSeedStrategy;
  readonly durationMinutes: number;
  readonly opensAt: Date | null;
  readonly closesAt: Date | null;
}

export interface ComposeIssue {
  readonly path: string;
  readonly message: string;
}

/** Trần thời lượng: 12 tiếng. Dài hơn thế thì đó không còn là một kỳ thi. */
export const EXAM_MAX_DURATION_MINUTES = 720;

export function composeIssues(
  input: ExamComposeInput,
  facts: readonly ExamProblemFacts[],
): readonly ComposeIssue[] {
  const issues: ComposeIssue[] = [];
  const byCode = new Map(facts.map((fact) => [fact.code, fact]));

  if (input.problemCodes.length === 0) {
    issues.push({
      path: 'problemCodes',
      message: 'Đề phải có ít nhất một bài',
    });
  }

  // Trùng mã: một bài hai lần trong cùng đề làm mẫu số của bảng điểm sai, và
  // sinh viên thấy cùng một bài hai chỗ mà không hiểu vì sao.
  const seen = new Set<string>();
  for (const code of input.problemCodes) {
    if (seen.has(code)) {
      issues.push({ path: 'problemCodes', message: `Bài ${code} xuất hiện hai lần trong đề` });
    }
    seen.add(code);
  }

  for (const code of input.problemCodes) {
    const fact = byCode.get(code);
    if (fact === undefined || fact.state === null) {
      issues.push({ path: 'problemCodes', message: `Không có bài nào mang mã ${code}` });
      continue;
    }
    /*
     * Bài nháp hoặc đã lưu trữ KHÔNG vào đề được. Bài nháp thì người học không
     * mở được (đường đọc lọc theo `state`), nên một đề chứa nó sẽ hiện ra một
     * ô trống mà sinh viên không làm gì được — và họ phát hiện điều đó trong
     * lúc đang tính giờ.
     */
    if (fact.state !== 'published') {
      issues.push({
        path: 'problemCodes',
        message: `Bài ${code} đang ở trạng thái "${fact.state}", chưa xuất bản thì người học không mở được`,
      });
      continue;
    }
    /*
     * ĐÂY là §18.G.3. Plan nói rõ hậu quả nếu thiếu: mỗi sinh viên nhận một đề
     * khác độ khó mà không ai biết — kể cả người chấm.
     */
    if (input.seedStrategy === 'per-student' && !fact.seedable) {
      issues.push({
        path: 'problemCodes',
        message: `Bài ${code} không sinh đề theo seed được, nên nó không vào được kỳ thi đề riêng từng người`,
      });
    }
  }

  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1) {
    issues.push({ path: 'durationMinutes', message: 'Thời lượng phải là số phút dương' });
  } else if (input.durationMinutes > EXAM_MAX_DURATION_MINUTES) {
    issues.push({
      path: 'durationMinutes',
      message: `Thời lượng ${String(input.durationMinutes)} phút vượt trần ${String(EXAM_MAX_DURATION_MINUTES)} phút`,
    });
  }

  /*
   * Hai mốc ngược nhau là một kỳ thi KHÔNG BAO GIỜ mở. Nó không ném ở đâu cả —
   * `isExamOpen` trả `false` mãi mãi — nên nếu không chặn ở đây thì triệu chứng
   * duy nhất là sinh viên báo "em không vào thi được" và không ai tra ra vì sao.
   */
  if (
    input.opensAt !== null &&
    input.closesAt !== null &&
    input.closesAt.getTime() <= input.opensAt.getTime()
  ) {
    issues.push({
      path: 'closesAt',
      message: 'Giờ đóng phải sau giờ mở, nếu không thì kỳ thi không bao giờ mở',
    });
  }

  return issues;
}
