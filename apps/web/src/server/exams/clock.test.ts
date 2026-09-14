import { describe, expect, it } from 'vitest';

import {
  attemptDeadline,
  effectiveSubmittedAt,
  isAttemptClosed,
  isExamOpen,
  remainingMs,
  wasAutoSubmitted,
} from './clock';

const START = new Date('2026-09-15T08:00:00.000Z');
const attempt = (over: Partial<{ durationMinutes: number; submittedAt: Date | null }> = {}) => ({
  startedAt: START,
  durationMinutes: over.durationMinutes ?? 60,
  submittedAt: over.submittedAt ?? null,
});

describe('attemptDeadline', () => {
  it('không có hạn chót kỳ thi thì hạn là đồng hồ riêng của lượt', () => {
    expect(attemptDeadline(attempt(), null)).toEqual(new Date('2026-09-15T09:00:00.000Z'));
  });

  /*
   * Ô GÁC của vế dễ quên nhất. Thiếu nó, một sinh viên mở lượt trước lúc đóng
   * đề một phút vẫn được trọn 60 phút — tức thi sau khi đề đã đóng.
   */
  it('hạn chót kỳ thi tới trước thì nó THẮNG đồng hồ riêng', () => {
    const closes = new Date('2026-09-15T08:01:00.000Z');
    expect(attemptDeadline(attempt(), closes)).toEqual(closes);
  });

  it('hạn chót kỳ thi tới sau thì đồng hồ riêng thắng', () => {
    const closes = new Date('2026-09-15T23:00:00.000Z');
    expect(attemptDeadline(attempt(), closes)).toEqual(new Date('2026-09-15T09:00:00.000Z'));
  });
});

describe('remainingMs', () => {
  it('đếm đúng phần còn lại', () => {
    expect(remainingMs(attempt(), null, new Date('2026-09-15T08:20:00.000Z'))).toBe(40 * 60_000);
  });

  it('hết giờ trả 0, không trả số âm', () => {
    expect(remainingMs(attempt(), null, new Date('2026-09-15T10:00:00.000Z'))).toBe(0);
  });

  /*
   * Trả một số dương ở đây làm giao diện vẽ tiếp một đồng hồ đang chạy cho một
   * bài đã khoá — câu hỏi "còn bao lâu" không còn nghĩa sau khi nộp.
   */
  it('đã nộp thì trả 0 dù còn thừa giờ', () => {
    const submitted = attempt({ submittedAt: new Date('2026-09-15T08:10:00.000Z') });
    expect(remainingMs(submitted, null, new Date('2026-09-15T08:20:00.000Z'))).toBe(0);
  });
});

describe('isAttemptClosed', () => {
  it('còn giờ, chưa nộp thì chưa khoá', () => {
    expect(isAttemptClosed(attempt(), null, new Date('2026-09-15T08:59:59.000Z'))).toBe(false);
  });

  it('đúng mốc hạn là ĐÃ khoá, không phải một mili-giây sau', () => {
    expect(isAttemptClosed(attempt(), null, new Date('2026-09-15T09:00:00.000Z'))).toBe(true);
  });

  /*
   * Đây là nửa máy chủ của AC-7 ("đóng tab lúc còn 1 phút, mở lại sau 5 phút ⇒
   * bài đã tự nộp"). Không có tiến trình nền nào chạy: trạng thái "đã hết giờ"
   * SUY ra lúc đọc, nên tab đóng hay mở không đổi gì.
   */
  it('nộp tay rồi thì khoá ngay cả khi còn thừa giờ', () => {
    const submitted = attempt({ submittedAt: new Date('2026-09-15T08:10:00.000Z') });
    expect(isAttemptClosed(submitted, null, new Date('2026-09-15T08:11:00.000Z'))).toBe(true);
  });
});

describe('effectiveSubmittedAt', () => {
  it('còn giờ và chưa nộp thì chưa có mốc nộp', () => {
    expect(effectiveSubmittedAt(attempt(), null, new Date('2026-09-15T08:30:00.000Z'))).toBeNull();
  });

  /*
   * ⛔ Ô này gác một thứ rất dễ làm sai: mốc nộp của một bài BỎ DỞ phải là HẠN,
   * không phải `now`. Trả `now` thì cột "nộp lúc" trôi theo thời điểm giảng
   * viên bấm F5, và cùng một lượt đọc ra hai mốc khác nhau ở hai lần mở bảng
   * điểm.
   */
  it('hết giờ mà chưa bấm nộp thì mốc nộp là ĐÚNG HẠN, không phải lúc đang đọc', () => {
    const readAt = new Date('2026-09-15T15:00:00.000Z');
    expect(effectiveSubmittedAt(attempt(), null, readAt)).toEqual(
      new Date('2026-09-15T09:00:00.000Z'),
    );
  });

  it('mốc nộp không đổi giữa hai lần đọc cách nhau nhiều giờ', () => {
    const a = effectiveSubmittedAt(attempt(), null, new Date('2026-09-15T09:00:01.000Z'));
    const b = effectiveSubmittedAt(attempt(), null, new Date('2026-09-16T09:00:00.000Z'));
    expect(a).toEqual(b);
  });
});

describe('wasAutoSubmitted', () => {
  it('chưa khoá thì câu hỏi chưa có nghĩa', () => {
    expect(wasAutoSubmitted(attempt(), null, new Date('2026-09-15T08:30:00.000Z'))).toBeNull();
  });

  it('bấm nộp trước hạn là nộp TAY', () => {
    const submitted = attempt({ submittedAt: new Date('2026-09-15T08:30:00.000Z') });
    expect(wasAutoSubmitted(submitted, null, new Date('2026-09-15T08:31:00.000Z'))).toBe(false);
  });

  it('bỏ dở cho tới hết giờ là TỰ nộp', () => {
    expect(wasAutoSubmitted(attempt(), null, new Date('2026-09-15T10:00:00.000Z'))).toBe(true);
  });

  /*
   * ĐỐI CHỨNG cho quyết định "không có cột auto_submitted". Hai lượt có CÙNG
   * cặp (started_at, duration) nhưng khác `submitted_at` phải đọc ra hai câu
   * trả lời khác nhau — nếu không thì phép suy đang không dùng tới dữ liệu nào
   * và một cột cờ sẽ là thứ duy nhất phân biệt được.
   */
  it('hai lượt cùng giờ bắt đầu và cùng thời lượng vẫn phân biệt được tay/tự', () => {
    const now = new Date('2026-09-15T10:00:00.000Z');
    const byHand = attempt({ submittedAt: new Date('2026-09-15T08:30:00.000Z') });
    expect(wasAutoSubmitted(byHand, null, now)).toBe(false);
    expect(wasAutoSubmitted(attempt(), null, now)).toBe(true);
  });
});

describe('isExamOpen', () => {
  const now = new Date('2026-09-15T08:00:00.000Z');

  it('không đặt mốc nào thì luôn mở', () => {
    expect(isExamOpen({ opensAt: null, closesAt: null }, now)).toBe(true);
  });

  it('chưa tới giờ mở thì chưa mở', () => {
    expect(
      isExamOpen({ opensAt: new Date('2026-09-15T09:00:00.000Z'), closesAt: null }, now),
    ).toBe(false);
  });

  it('đúng giờ đóng là ĐÃ đóng', () => {
    expect(isExamOpen({ opensAt: null, closesAt: now }, now)).toBe(false);
  });

  it('trong khoảng thì mở', () => {
    expect(
      isExamOpen(
        {
          opensAt: new Date('2026-09-15T07:00:00.000Z'),
          closesAt: new Date('2026-09-15T09:00:00.000Z'),
        },
        now,
      ),
    ).toBe(true);
  });
});
