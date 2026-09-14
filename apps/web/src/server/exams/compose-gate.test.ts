import { describe, expect, it } from 'vitest';

import { EXAM_MAX_DURATION_MINUTES, composeIssues } from './compose-gate';
import type { ExamComposeInput, ExamProblemFacts } from './compose-gate';

const published = (code: string, seedable: boolean): ExamProblemFacts => ({
  code,
  state: 'published',
  seedable,
});

const input = (over: Partial<ExamComposeInput> = {}): ExamComposeInput => ({
  problemCodes: over.problemCodes ?? ['K8S-0001'],
  seedStrategy: over.seedStrategy ?? 'fixed',
  durationMinutes: over.durationMinutes ?? 60,
  opensAt: over.opensAt ?? null,
  closesAt: over.closesAt ?? null,
});

const paths = (issues: readonly { readonly path: string }[]) => issues.map((i) => i.path);

describe('composeIssues', () => {
  it('một đề hợp lệ không có vấn đề nào', () => {
    expect(composeIssues(input(), [published('K8S-0001', false)])).toEqual([]);
  });

  it('đề rỗng bị chặn', () => {
    expect(paths(composeIssues(input({ problemCodes: [] }), []))).toContain('problemCodes');
  });

  it('mã không tra ra bài nào bị chặn, và câu lỗi gọi đúng mã', () => {
    const issues = composeIssues(input({ problemCodes: ['K8S-9999'] }), [
      { code: 'K8S-9999', state: null, seedable: false },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('K8S-9999');
  });

  it('mã hoàn toàn vắng mặt trong tập đã tra cũng bị chặn, không im lặng bỏ qua', () => {
    expect(composeIssues(input({ problemCodes: ['GIT-0001'] }), [])).toHaveLength(1);
  });

  /*
   * Bài nháp lọt vào đề là một lỗi sinh viên phát hiện TRONG LÚC đang tính giờ:
   * đường đọc lọc theo `state` nên ô bài hiện ra trống và họ không làm gì được.
   */
  it('bài nháp và bài lưu trữ không vào được đề', () => {
    for (const state of ['draft', 'archived'] as const) {
      const issues = composeIssues(input(), [{ code: 'K8S-0001', state, seedable: true }]);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.message).toContain(state);
    }
  });

  it('cùng một bài hai lần trong đề bị chặn', () => {
    const issues = composeIssues(input({ problemCodes: ['K8S-0001', 'K8S-0001'] }), [
      published('K8S-0001', false),
    ]);
    expect(issues.some((i) => i.message.includes('hai lần'))).toBe(true);
  });

  // ── §18.G.3, ô gác chính của file này ────────────────────────────────────

  it('per-student CHẶN bài không seedable — đây là 18.G.3', () => {
    const issues = composeIssues(input({ seedStrategy: 'per-student' }), [
      published('K8S-0001', false),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('problemCodes');
  });

  it('per-student cho qua bài seedable', () => {
    expect(
      composeIssues(input({ seedStrategy: 'per-student' }), [published('K8S-0001', true)]),
    ).toEqual([]);
  });

  /*
   * ĐỐI CHỨNG: cổng phải gác theo `seedStrategy`, không phải gác `seedable`
   * một cách vô điều kiện. Không có ô này thì một bản cài đặt chặn MỌI bài
   * không seedable cũng làm ô trên xanh — và nó sẽ cấm cả những kỳ thi
   * `fixed` hoàn toàn hợp lệ.
   */
  it('fixed KHÔNG đòi seedable — cùng một bài, hai chiến lược, hai kết quả', () => {
    const facts = [published('K8S-0001', false)];
    expect(composeIssues(input({ seedStrategy: 'per-student' }), facts)).toHaveLength(1);
    expect(composeIssues(input({ seedStrategy: 'fixed' }), facts)).toEqual([]);
  });

  it('per-student gọi tên ĐÚNG bài vi phạm khi đề có nhiều bài', () => {
    const issues = composeIssues(
      input({ seedStrategy: 'per-student', problemCodes: ['K8S-0001', 'K8S-0002', 'K8S-0003'] }),
      [published('K8S-0001', true), published('K8S-0002', false), published('K8S-0003', true)],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('K8S-0002');
  });

  // ── Thời lượng và cửa sổ thời gian ───────────────────────────────────────

  it('thời lượng không dương bị chặn', () => {
    for (const durationMinutes of [0, -5, 1.5]) {
      expect(paths(composeIssues(input({ durationMinutes }), [published('K8S-0001', false)]))).toContain(
        'durationMinutes',
      );
    }
  });

  it('thời lượng vượt trần bị chặn', () => {
    expect(
      paths(
        composeIssues(input({ durationMinutes: EXAM_MAX_DURATION_MINUTES + 1 }), [
          published('K8S-0001', false),
        ]),
      ),
    ).toContain('durationMinutes');
  });

  it('đúng trần thì vẫn qua', () => {
    expect(
      composeIssues(input({ durationMinutes: EXAM_MAX_DURATION_MINUTES }), [
        published('K8S-0001', false),
      ]),
    ).toEqual([]);
  });

  /*
   * Hai mốc ngược nhau không ném ở đâu cả: `isExamOpen` chỉ trả `false` mãi
   * mãi. Triệu chứng duy nhất là sinh viên báo "em không vào thi được", và
   * không ai tra ra vì sao. Đó là lý do nó phải chặn ở đây.
   */
  it('giờ đóng trước hoặc bằng giờ mở bị chặn', () => {
    const opensAt = new Date('2026-09-15T09:00:00.000Z');
    for (const closesAt of [new Date('2026-09-15T08:00:00.000Z'), opensAt]) {
      expect(paths(composeIssues(input({ opensAt, closesAt }), [published('K8S-0001', false)]))).toContain(
        'closesAt',
      );
    }
  });

  it('chỉ đặt một trong hai mốc thì không bị chặn', () => {
    const opensAt = new Date('2026-09-15T09:00:00.000Z');
    expect(composeIssues(input({ opensAt }), [published('K8S-0001', false)])).toEqual([]);
    expect(composeIssues(input({ closesAt: opensAt }), [published('K8S-0001', false)])).toEqual([]);
  });
});
