import { describe, expect, it } from 'vitest';
import { t } from '@devops-platform/copy';
import { submissionVerdictLabel } from './submission-verdict';

/**
 * §18.C việc 3: lịch sử nộp bài không được đổ lỗi cú pháp cho người chơi.
 *
 * Ô nghiệm thu nằm ở `describe` đầu tiên. Hai `describe` sau là thứ làm cho ô đó
 * có nghĩa: một hàm luôn trả nhãn "chưa chấm" cũng qua được ô đầu, nên phải
 * chứng minh hai nhánh còn lại vẫn ra đúng verdict.
 */

const CE = t('catalog.problem.verdict-ce');
const UNGRADED = t('catalog.problem.subs-verdict-ungraded');

describe('AC — dòng lịch sử total === 0 KHÔNG hiện chữ CE', () => {
  const label = submissionVerdictLabel({ passed: [], total: 0 });

  it('không phải nhãn CE', () => {
    expect(label).not.toBe(CE);
  });

  /*
   * Kiểm cả chuỗi con, không chỉ kiểm khác khoá `verdict-ce`. Nếu ai đó đổi
   * `verdict-ce` thành một câu dài có chứa "CE" rồi trả nó ở đây thì phép so
   * bằng ở trên vẫn xanh trong khi người dùng vẫn đọc thấy "CE".
   */
  it('không chứa chuỗi CE ở bất kỳ đâu trong nhãn', () => {
    expect(label).not.toContain('CE');
  });

  it('là nhãn riêng nghĩa là chưa chấm theo testcase', () => {
    expect(label).toBe(UNGRADED);
  });

  /*
   * `total` âm không tới được từ DB (cột `integer notNull default 0` và mọi
   * đường ghi đều lấy từ `testcases.length`), nhưng `problemVerdictOf` khai
   * `total <= 0` chứ không khai `total === 0`. Gác cả biên để hàm hiển thị
   * không lệch khỏi hàm suy.
   */
  it('total âm cũng đi chung một nhánh', () => {
    expect(submissionVerdictLabel({ passed: [], total: -1 })).toBe(UNGRADED);
  });
});

describe('hai nhánh còn lại vẫn ra đúng verdict', () => {
  it('qua hết testcase ra AC', () => {
    expect(submissionVerdictLabel({ passed: ['t1', 't2'], total: 2 })).toBe(
      t('catalog.problem.verdict-ac'),
    );
  });

  it('qua một phần ra WA kèm phân số của LÚC NỘP', () => {
    expect(submissionVerdictLabel({ passed: ['t1', 't2', 't4', 't5'], total: 5 })).toBe(
      t('catalog.problem.verdict-wa', { passed: 4, total: 5 }),
    );
  });

  /*
   * Mẫu số là `total` đã chốt lúc nộp, KHÔNG phải số testcase của bài hôm nay.
   * Ô này là chỗ duy nhất trong file khẳng định điều đó: `passed` dài 4 mà
   * `total` là 7 chỉ xảy ra khi tác giả đã thêm case sau lượt nộp, và nhãn phải
   * đọc theo con số lịch sử.
   */
  it('không tự tính lại mẫu số từ độ dài passed', () => {
    expect(submissionVerdictLabel({ passed: ['t1', 't2', 't3', 't4'], total: 7 })).toBe(
      t('catalog.problem.verdict-wa', { passed: 4, total: 7 }),
    );
  });
});
