import { describe, expect, it } from 'vitest';

import { summarizeProgress } from './progress';

describe('summarizeProgress', () => {
  // Đây là CA ĐẺ RA nợ P2 §2, viết ra nguyên văn: người học nhảy thẳng tới step
  // cuối và chấm đạt đúng một lần. Server ghi `completedAt` (đúng theo task 12),
  // nên `completed` bật lên trong khi `passedInSession` mới là 1.
  //
  // Nhãn cũ khi đó là "4/4 bước đã đạt" — một câu khẳng định về BA bước chưa
  // từng được chấm. Phép kiểm này gác đúng câu chữ đó.
  it('đạt MỖI bước cuối: không được nói "4/4 bước đã đạt"', () => {
    const summary = summarizeProgress({ stepCount: 4, passedInSession: 1, completed: true });

    expect(summary.label).not.toContain('4/4');
    expect(summary.label).toBe('Đã hoàn thành');
    // Thanh vẫn đầy — bài ĐÃ xong thật; chỗ sai chỉ là câu chữ.
    expect(summary.value).toBe(4);
    expect(summary.max).toBe(4);
  });

  // Đối chứng: đi đủ 4 bước rồi xong bài cho CÙNG một nhãn. Đó là điểm chính —
  // ta không lưu tập bước đã đạt, nên hai đường đi khác nhau tới `completed` là
  // KHÔNG phân biệt được, và nhãn phải là câu duy nhất đúng cho cả hai.
  it('đi đủ mọi bước rồi xong: cùng một nhãn, vì dữ liệu không phân biệt được', () => {
    const dyDuong = summarizeProgress({ stepCount: 4, passedInSession: 4, completed: true });
    const nhayCoc = summarizeProgress({ stepCount: 4, passedInSession: 1, completed: true });

    expect(dyDuong).toEqual(nhayCoc);
  });

  it('chưa xong: đếm đúng số bước đã chấm đạt, và nói rõ phạm vi "phiên này"', () => {
    const summary = summarizeProgress({ stepCount: 4, passedInSession: 2, completed: false });

    expect(summary.value).toBe(2);
    expect(summary.max).toBe(4);
    expect(summary.label).toBe('2/4 bước đã đạt trong phiên này');
  });

  // Mở lại bài đang dở: `passedSteps` là state client nên nó về 0. Nhãn KHÔNG
  // được đọc như "bạn chưa đạt bước nào" — nó phải giới hạn lời khẳng định vào
  // phiên hiện tại, nếu không người học tưởng tiến độ đã mất.
  it('mở lại bài đang dở: 0 trong phiên này, không phải "chưa đạt bước nào"', () => {
    const summary = summarizeProgress({ stepCount: 4, passedInSession: 0, completed: false });

    expect(summary.label).toBe('0/4 bước đã đạt trong phiên này');
  });

  // `max = 0` là dữ liệu chưa tải xong. ProgressBar tự ép về 0% ở ca đó, nhưng
  // hàm này vẫn phải trả số nhất quán chứ không ném.
  it('scenario chưa tải (0 step) không ném', () => {
    expect(summarizeProgress({ stepCount: 0, passedInSession: 0, completed: false })).toEqual({
      value: 0,
      max: 0,
      label: '0/0 bước đã đạt trong phiên này',
    });
  });
});
