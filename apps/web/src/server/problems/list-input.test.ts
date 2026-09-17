/**
 * `problemFilterSchema` — NỬA MÁY CHỦ của lượt nới `ProblemFilter.topics`.
 *
 * ## Vì sao nửa này cần ô riêng
 *
 * Hợp đồng và schema là hai cổng nối tiếp, và chúng hỏng độc lập. Nới
 * `ProblemFilter.topics` ở `packages/games` mà quên `z.enum(PROBLEM_TOPICS)` ở
 * đây thì `tsc` XANH — kiểu cho phép gửi `'branching'` đi — còn người dùng nhận
 * **400** lúc chạy. Không phép kiểm tĩnh nào bắc qua được khoảng đó: một bên là
 * kiểu TypeScript, bên kia là một schema Zod, và chúng không biết nhau.
 *
 * Lane dựng bộ chọn game đã ghi đúng cảnh báo này thành bước 4 trong quy trình
 * để lại ở `problem-game.test.ts`. Ô dưới đây là thứ làm bước đó không phụ thuộc
 * vào việc ai đó nhớ đọc.
 *
 * ## Đối chứng, không phải một lượt khẳng định một chiều
 *
 * Ô "nhận `'branching'`" một mình không chứng minh gì: một schema nhận MỌI thứ
 * cũng qua. Nên nó đi kèm hai ô nữa — chủ đề K8s vẫn nhận, và một khoá lạ vẫn bị
 * `.strict()` từ chối — để phân biệt "đã nới đúng chỗ" với "đã nới toang".
 */

import { describe, expect, it } from 'vitest';
import { PROBLEM_TOPICS } from '@devops-platform/games';

import { problemFilterSchema } from './list-input';

describe('problemFilterSchema — chủ đề của MỌI game đi qua được', () => {
  it('nhận chủ đề của game Git', () => {
    /*
     * Đo 2026-09-15 TRƯỚC khi nới, trên cùng biểu thức này:
     *   `invalid_value`, "expected one of workload|…|troubleshooting"
     * Đó là lý do khối lọc chủ đề của `/problems` phải tự khoá cho mọi game
     * không phải K8s.
     */
    const ket = problemFilterSchema.safeParse({ topics: ['branching'] });
    expect(ket.success, JSON.stringify(ket.error?.issues)).toBe(true);
  });

  it('chủ đề K8s vẫn nhận nguyên vẹn', () => {
    // Nới một hợp đồng đang chạy dễ làm hỏng phía cũ hơn phía mới.
    const ket = problemFilterSchema.safeParse({ topics: [...PROBLEM_TOPICS] });
    expect(ket.success, JSON.stringify(ket.error?.issues)).toBe(true);
  });

  it('nhiều game trong CÙNG một bộ lọc cũng nhận', () => {
    // Bộ lọc đọc bắc qua mọi game cùng lúc, nên không có một tập đóng nào đúng
    // cho nó — đó là cả lý do dòng này là `z.string()` chứ không phải một enum.
    const ket = problemFilterSchema.safeParse({ topics: ['workload', 'branching'] });
    expect(ket.success).toBe(true);
  });
});

describe('nới chủ đề KHÔNG nới những thứ khác', () => {
  it('khoá lạ vẫn bị .strict() từ chối', () => {
    // `ProblemFilter` là SSOT của bộ lọc. Một khoá lạ lọt qua đây sẽ bị nhận rồi
    // bỏ qua trong im lặng, và người gọi tưởng bộ lọc của họ đang chạy.
    expect(problemFilterSchema.safeParse({ gameId: 'git' }).success).toBe(false);
  });

  it('chủ đề rỗng và chủ đề quá dài đều bị từ chối', () => {
    // Không có trần thì một chuỗi vài trăm KB đi thẳng vào toán tử mảng của
    // Postgres.
    expect(problemFilterSchema.safeParse({ topics: [''] }).success).toBe(false);
    expect(problemFilterSchema.safeParse({ topics: ['x'.repeat(65)] }).success).toBe(false);
  });

  it('độ khó vẫn là tập ĐÓNG — nới chủ đề không được lan sang đây', () => {
    expect(problemFilterSchema.safeParse({ difficulty: ['easy'] }).success).toBe(true);
    expect(problemFilterSchema.safeParse({ difficulty: ['sieu-kho'] }).success).toBe(false);
  });
});
