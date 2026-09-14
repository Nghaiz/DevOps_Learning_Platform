import { describe, expect, it } from 'vitest';
import { problemVerdictOf, type VerifyStatus } from '@devops-platform/games';
import { problemTestcases, toTestcaseTeasers } from './testcases';
import { compileErrorReason, gradeOf, toVerdictView, verdictFromVerify } from './verdict-view';

/**
 * §18.B.3 (hiển thị verdict) và §18.B.5 (`CE`).
 *
 * Ô NGHIỆM THU AC-B nằm ở `describe('AC-B …')` bên dưới, nguyên văn từ plan:
 *
 * > Một bài 5 testcase, làm đúng 4 ⇒ hiển thị đúng `WA (4/5)` và chỉ đúng
 * > testcase đỏ.
 */

const RAW = [
  { id: 't1', label: 'Đưa 3 pod lên 2 node khác nhau', check: 'spread', required: true },
  { id: 't2', label: 'Giữ service còn endpoint', check: 'endpoints', required: true },
  { id: 't3', label: 'Không pod nào CrashLoop', check: 'no-crashloop', required: true },
  { id: 't4', label: 'Đặt resource limits', check: 'has-limits', required: true },
  { id: 't5', label: 'Chịu được một node chết', check: 'drain-ok', required: true, visible: false },
];

const TESTCASES = problemTestcases(RAW);

describe('AC-B — 5 testcase, qua 4', () => {
  // "Đã nộp" ⇒ nhãn của testcase ẩn đã mở, đúng như lúc người làm đọc verdict.
  const teasers = toTestcaseTeasers(TESTCASES, true);
  const grade = gradeOf('da-xac-minh', ['t1', 't2', 't4', 't5'], 5);
  const view = toVerdictView(grade, teasers);

  it('verdict là `WA`, không phải `AC`', () => {
    expect(view.verdict).toBe('WA');
  });

  it('phân số là 4/5 — mẫu số nói người làm còn cách bao xa', () => {
    expect(view.fraction).toEqual({ passed: 4, total: 5 });
  });

  it('chỉ ĐÚNG testcase đỏ, và chỉ một cái', () => {
    expect(view.failed).toEqual([{ id: 't3', label: 'Không pod nào CrashLoop' }]);
  });

  it('không kèm lý do `CE`', () => {
    expect(view.failedReason).toBeNull();
  });

  it('testcase ẩn đã qua vẫn đếm vào tử số', () => {
    // `t5` ẩn nhưng người làm qua được nó. Bỏ nó khỏi tử số sẽ cho `WA (3/5)`
    // và gửi người ta đi sửa một thứ vốn đã đúng.
    expect(grade.passed).toContain('t5');
  });
});

describe('verdict suy từ một nguồn sự thật duy nhất', () => {
  it('gọi đúng `problemVerdictOf` của packages/games ở nhánh đã xác minh', () => {
    // ⛔ Ô này gác §18.C.3: nếu tầng web tự viết `passed === total` thì phép so
    // verdict client-với-server sau này sẽ nói về hai hàm, không nói về engine.
    for (const [passed, total] of [
      [5, 5],
      [4, 5],
      [0, 5],
      [0, 0],
    ] as const) {
      expect(verdictFromVerify('da-xac-minh', passed, total)).toBe(
        problemVerdictOf(passed, total),
      );
    }
  });

  it('qua HẾT là `AC`, và không có `AC` một phần', () => {
    const view = toVerdictView(
      gradeOf('da-xac-minh', ['t1', 't2', 't3', 't4', 't5'], 5),
      toTestcaseTeasers(TESTCASES, true),
    );
    expect(view.verdict).toBe('AC');
    expect(view.failed).toEqual([]);
    expect(view.fraction).toEqual({ passed: 5, total: 5 });
  });

  it('bài không có testcase nào ra `CE`, KHÔNG ra `AC`', () => {
    // "Qua hết 0 testcase" đúng về logic và sai về nghĩa: nó phát `AC` cho mọi
    // lượt nộp vào một bài soạn dở.
    const grade = gradeOf('da-xac-minh', [], 0);
    expect(grade.verdict).toBe('CE');
    expect(grade.failedReason).toBe('Bài này chưa có testcase nào nên chưa chấm được.');
  });
});

describe('§18.B.5 — CE không in phân số', () => {
  const broken: readonly VerifyStatus[] = ['log-hong', 'phat-lai-loi', 'engine-khong-tat-dinh'];

  for (const status of broken) {
    it(`\`${status}\` ⇒ CE, và fraction là null`, () => {
      const view = toVerdictView(
        gradeOf(status, ['t1', 't2'], 5),
        toTestcaseTeasers(TESTCASES, true),
      );
      expect(view.verdict).toBe('CE');
      // ⛔ Đây là cả điểm của §18.B.5: lượt chơi không chạy tới nơi thì
      // `passed`/`total` không nói lên gì, nên KHÔNG được in `0/5` — và cũng
      // không được in `2/5` từ một lời khai chưa xác minh.
      expect(view.fraction).toBeNull();
      expect(view.failed).toEqual([]);
      expect(view.failedReason).not.toBeNull();
    });
  }

  it('CE bỏ luôn tập `passed`, đúng bất biến của `GradeResult`', () => {
    // Hợp đồng: "`CE` mang `passed` rỗng và `failedReason` khác `null`; hai
    // verdict còn lại thì ngược lại."
    const grade = gradeOf('phat-lai-loi', ['t1', 't2'], 5);
    expect(grade.passed).toEqual([]);
    expect(grade.failedReason).not.toBeNull();
  });

  it('mọi lý do CE đều là câu tiếng Việt, và không câu nào nói "gian lận"', () => {
    for (const status of [...broken, 'khong-khop'] as const) {
      const reason = compileErrorReason(status, 5);
      expect(reason).toBeTruthy();
      // Một bản lưu hỏng vì đổi phiên bản rơi vào ĐÚNG nhánh `khong-khop` như
      // một bản bị sửa tay — buộc tội dựa trên tín hiệu không phân biệt được
      // hai thứ đó là sai. Cùng luật mà `verifyLabel` đã ghi.
      expect(reason?.toLowerCase()).not.toContain('gian lận');
    }
  });

  it('nhánh đã xác minh và có testcase thì KHÔNG có lý do CE', () => {
    expect(compileErrorReason('da-xac-minh', 5)).toBeNull();
  });
});

describe('testcase đỏ tra theo id, không theo chỉ số', () => {
  it('đổi thứ tự testcase không làm đổi tập đỏ', () => {
    const reversed = toTestcaseTeasers([...TESTCASES].reverse(), true);
    const view = toVerdictView(gradeOf('da-xac-minh', ['t1', 't2', 't4', 't5'], 5), reversed);
    // Hợp đồng `Submission.passed`: "Id chứ không phải chỉ số — chỉ số vỡ khi
    // tác giả đổi thứ tự."
    expect(view.failed.map((f) => f.id)).toEqual(['t3']);
  });

  it('mẫu số lấy từ `total` đã chốt lúc nộp, không từ bài hôm nay', () => {
    // Bài đã bị tác giả thêm hai case sau lượt nộp: danh sách hôm nay có 5,
    // nhưng lượt đó được chấm trên 3. In `4/5` ở đây là viết lại lịch sử.
    const view = toVerdictView(gradeOf('da-xac-minh', ['t1', 't2'], 3), toTestcaseTeasers(TESTCASES, true));
    expect(view.fraction).toEqual({ passed: 2, total: 3 });
  });
});
