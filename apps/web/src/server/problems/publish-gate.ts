import type { z } from 'zod';

/**
 * Cổng XUẤT BẢN — chặt hơn cổng lưu nháp, và tách khỏi `validate.ts` vì nó trả
 * lời một câu hỏi khác: `validate.ts` hỏi "dữ liệu này có ghi xuống được không",
 * file này hỏi "bài này đã đủ để người học nhìn thấy chưa". Soạn dở được phép
 * chưa đủ, nên hai bộ điều kiện không được gộp.
 */

/**
 * Trần cứng 150 từ cho đề bài, gác bằng mã chứ không bằng lời khuyên.
 *
 * Con số này là phản ứng đo được với lời chê về `Level`: brief trung bình 189 từ
 * cộng primer 193 từ bắt người chơi đọc ~382 từ trước khi được gõ lệnh đầu tiên.
 * Một bài OJ không dạy, nên nó chỉ cần nói ĐỀ.
 */
export const STATEMENT_MAX_WORDS = 150;

export function countWords(markdown: string): number {
  const trimmed = markdown.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/u).length;
}

/**
 * Điều kiện ĐỦ ĐỂ XUẤT BẢN — chặt hơn điều kiện để lưu nháp.
 *
 * Soạn dở được phép chưa đủ; đó là lý do hai bộ kiểm tách nhau. Trả về danh sách
 * `ZodIssue` để `errorFormatter` của repo đưa ra client dưới `data.zodError` có
 * `path` — client chỉ được đúng chỗ sai thay vì nhận một câu chung chung.
 */
export interface PublishCandidate {
  readonly statement: string;
  /**
   * Testcase của bài (cột `objectives` — xem chú thích cột ở `schema.ts` về vì
   * sao tên cột giữ nguyên). Chỉ cần `id`: cổng này hỏi "có case nào không" và
   * "id có trùng không", không hỏi nội dung.
   */
  readonly objectives: readonly { readonly id: string }[];
  readonly hints: readonly { readonly id: string }[];
}

export function publishIssues(body: PublishCandidate): readonly z.core.$ZodIssue[] {
  const issues: z.core.$ZodIssue[] = [];
  const words = countWords(body.statement);
  if (words > STATEMENT_MAX_WORDS) {
    issues.push({
      code: 'custom',
      path: ['statement'],
      message: `Đề bài ${String(words)} từ, vượt trần ${String(STATEMENT_MAX_WORDS)} từ`,
      input: body.statement,
    });
  }
  /*
   * ⚠ ĐỔI NGHĨA Ở 18.B, ghi lại vì đây là một cổng bị NỚI chứ không phải một
   * dòng dọn dẹp. Bản cũ hỏi `objectives.some((o) => o.required)`.
   *
   * Quyết định #20 của thiết kế bỏ hẳn khái niệm mục tiêu-không-bắt-buộc:
   * *"Objective = testcase"*, và `core/problem.ts` § `Testcase` nói thẳng vì sao
   * `required` không còn — *"một testcase thì luôn chặn — đó là nghĩa của `AC`"*.
   * Một vị từ đọc `required` trên dữ liệu mới luôn ra `undefined`, tức cổng sẽ
   * từ chối xuất bản MỌI bài soạn theo mô hình mới. Giữ nguyên là hỏng, không
   * phải là an toàn.
   *
   * Cái mất: một bài CŨ có objective nhưng không cái nào `required` nay xuất bản
   * được. Dưới mô hình mới thì đó là đúng — mọi case đều chặn — nên nó không
   * phải một lỗ hổng mà là hệ quả trực tiếp của #20.
   */
  if (body.objectives.length === 0) {
    issues.push({
      code: 'custom',
      path: ['objectives'],
      message: 'Cần ít nhất một testcase — không có thì bài không chấm được',
      input: body.objectives,
    });
  }
  const objectiveIds = body.objectives.map((objective) => objective.id);
  if (new Set(objectiveIds).size !== objectiveIds.length) {
    issues.push({
      code: 'custom',
      path: ['objectives'],
      message: 'Id mục tiêu bị trùng — điểm sẽ tính sai vì bên chấm khử trùng theo id',
      input: body.objectives,
    });
  }
  const hintIds = body.hints.map((hint) => hint.id);
  if (new Set(hintIds).size !== hintIds.length) {
    issues.push({
      code: 'custom',
      path: ['hints'],
      message: 'Id gợi ý bị trùng — mở một cái sẽ mở luôn cái kia',
      input: body.hints,
    });
  }
  return issues;
}

