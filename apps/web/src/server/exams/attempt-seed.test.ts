import { describe, expect, it } from 'vitest';

import { examSubmissionRejection } from './attempt-seed';
import type { ExamSubmissionContext } from './attempt-seed';

const START = new Date('2026-09-15T08:00:00.000Z');
const DURING = new Date('2026-09-15T08:30:00.000Z');

const context = (over: Partial<ExamSubmissionContext> = {}): ExamSubmissionContext => ({
  problemCodes: over.problemCodes ?? ['K8S-0001', 'K8S-0002'],
  attemptSeed: over.attemptSeed ?? 424242,
  attempt: over.attempt ?? { startedAt: START, durationMinutes: 60, submittedAt: null },
  closesAt: over.closesAt ?? null,
});

describe('examSubmissionRejection', () => {
  it('đúng bài, đúng seed, còn giờ thì cho qua', () => {
    expect(
      examSubmissionRejection(context(), { problemCode: 'K8S-0001', seed: 424242 }, DURING),
    ).toBeNull();
  });

  it('bài ngoài đề bị từ chối, và câu lỗi gọi đúng mã', () => {
    const reason = examSubmissionRejection(
      context(),
      { problemCode: 'GIT-0007', seed: 424242 },
      DURING,
    );
    expect(reason).toContain('GIT-0007');
  });

  // ── Cổng seed, ô gác chính ────────────────────────────────────────────────

  it('seed lệch bị từ chối — đây là cổng số 1 của 18.G', () => {
    expect(
      examSubmissionRejection(context(), { problemCode: 'K8S-0001', seed: 1 }, DURING),
    ).toContain('seed');
  });

  /*
   * ĐỐI CHỨNG cho cổng seed, và nó gác một thứ cụ thể đã đo được: bản "hiển
   * nhiên" của cổng này (đòi seed bằng một HẰNG) sẽ từ chối mọi lượt nộp K8s,
   * vì arena sinh seed ngẫu nhiên mỗi phiên. Hai ô dưới đây dùng hai seed ngẫu
   * nhiên KHÁC nhau và cùng phải qua, miễn là chúng khớp seed máy chủ cấp.
   */
  it('cổng so với seed MÁY CHỦ CẤP, không so với một hằng số', () => {
    for (const seed of [0, 1, 2_147_483_646]) {
      expect(
        examSubmissionRejection(
          context({ attemptSeed: seed }),
          { problemCode: 'K8S-0001', seed },
          DURING,
        ),
      ).toBeNull();
    }
  });

  // ── Hết giờ ───────────────────────────────────────────────────────────────

  /*
   * Vế máy chủ của AC-7. Không có tiến trình nền nào khoá lượt thi: trạng thái
   * hết giờ suy ra lúc đọc, nên đóng tab rồi mở lại không mua thêm được phút
   * nào.
   */
  it('quá hạn thì từ chối dù seed đúng', () => {
    expect(
      examSubmissionRejection(
        context(),
        { problemCode: 'K8S-0001', seed: 424242 },
        new Date('2026-09-15T09:00:00.000Z'),
      ),
    ).toContain('kết thúc');
  });

  it('đã bấm nộp rồi thì không nộp thêm được', () => {
    expect(
      examSubmissionRejection(
        context({ attempt: { startedAt: START, durationMinutes: 60, submittedAt: DURING } }),
        { problemCode: 'K8S-0001', seed: 424242 },
        new Date('2026-09-15T08:31:00.000Z'),
      ),
    ).toContain('kết thúc');
  });

  it('hạn chót của kỳ thi cắt ngắn lượt thi, và cổng theo đúng hạn đó', () => {
    const closesAt = new Date('2026-09-15T08:10:00.000Z');
    expect(
      examSubmissionRejection(
        context({ closesAt }),
        { problemCode: 'K8S-0001', seed: 424242 },
        DURING,
      ),
    ).toContain('kết thúc');
  });

  /*
   * Thứ tự phán quyết có nghĩa: một bài ngoài đề phải nghe "ngoài đề", không
   * nghe "hết giờ". Hai câu dẫn người học đi hai hướng khác nhau.
   */
  it('bài ngoài đề được báo ĐÚNG lý do đó, kể cả khi đã hết giờ', () => {
    expect(
      examSubmissionRejection(
        context(),
        { problemCode: 'GIT-0007', seed: 1 },
        new Date('2026-09-15T09:00:00.000Z'),
      ),
    ).toContain('không nằm trong đề');
  });
});
