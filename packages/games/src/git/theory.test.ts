import { describe, expect, it } from 'vitest';
import { CHAPTER_1_LEVEL_IDS, theoryIdForLevel } from './level-ids.ts';
import {
  countProseWords,
  expectedReadMinutes,
  validateTheoryDocs,
  WORDS_PER_MINUTE,
  type TheoryDoc,
  type TheoryIssueCode,
} from './theory.ts';

/**
 * Thân bài dài đúng `words` từ.
 *
 * Dùng một từ lặp lại chứ không phải văn thật: phép kiểm chỉ quan tâm SỐ từ, và
 * một thân bài sinh ra theo công thức thì không có chỗ nào để tranh cãi xem nó
 * dài bao nhiêu.
 */
function bodyOf(words: number): string {
  return Array.from({ length: words }, () => 'chữ').join(' ');
}

function doc(
  id: string,
  usedByLevels: readonly string[],
  overrides: Partial<TheoryDoc['frontmatter']> & { readonly body?: string } = {},
): TheoryDoc {
  const body = overrides.body ?? bodyOf(400);
  return {
    frontmatter: {
      id,
      title: overrides.title ?? `Tiêu đề của ${id}`,
      gameId: overrides.gameId ?? 'git',
      readMinutes: overrides.readMinutes ?? expectedReadMinutes(countProseWords(body)),
      usedByLevels,
    },
    body,
  };
}

function codes(issues: readonly { readonly code: TheoryIssueCode }[]): readonly TheoryIssueCode[] {
  return issues.map((issue) => issue.code);
}

describe('countProseWords', () => {
  it('đếm từ văn xuôi, bỏ qua ký tự không phải chữ hay số', () => {
    expect(countProseWords('# Nhánh là con trỏ')).toBe(4);
    expect(countProseWords('| worktree | index | HEAD |')).toBe(3);
  });

  /*
   * ĐỐI CHỨNG. Không có ô này thì một sơ đồ ASCII ba vùng đóng góp hàng chục
   * "từ" gồm toàn ký tự kẻ khung, và bài nào có sơ đồ cũng tự thổi `readMinutes`
   * lên. Phép kiểm khi đó thưởng cho đúng thứ nó phải trung lập.
   */
  it('bỏ qua nội dung trong khối code có rào', () => {
    const withFence = [
      'Một câu văn xuôi.',
      '```',
      'git rebase main',
      'HEAD  index  worktree',
      '```',
      'Một câu nữa.',
    ].join('\n');
    expect(countProseWords(withFence)).toBe(countProseWords('Một câu văn xuôi.\nMột câu nữa.'));
  });

  it('rào chưa đóng thì nuốt phần còn lại, không rò rỉ ra ngoài', () => {
    expect(countProseWords('Mở rào\n```\ngit log\nkhông bao giờ đóng')).toBe(2);
  });
});

describe('expectedReadMinutes', () => {
  it('làm tròn theo tốc độ đọc quy ước', () => {
    expect(expectedReadMinutes(WORDS_PER_MINUTE * 4)).toBe(4);
    expect(expectedReadMinutes(350)).toBe(2);
  });

  it('không bao giờ trả 0, kể cả với bài rất ngắn', () => {
    expect(expectedReadMinutes(0)).toBe(1);
    expect(expectedReadMinutes(12)).toBe(1);
  });
});

describe('validateTheoryDocs', () => {
  it('tập bài phủ đúng tập level thì không có lỗi nào', () => {
    const levels = ['git-01-a', 'git-02-b'];
    const issues = validateTheoryDocs([doc('01-a', ['git-01-a']), doc('02-b', ['git-02-b'])], levels);
    expect(issues).toEqual([]);
  });

  it('một bài phục vụ nhiều level là hợp lệ', () => {
    const levels = ['git-04-a', 'git-05-b', 'git-13-c'];
    expect(validateTheoryDocs([doc('04-a', levels)], levels)).toEqual([]);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // HAI CHIỀU, VÀ BẰNG CHỨNG RẰNG KHÔNG CHIỀU NÀO THAY ĐƯỢC CHIỀU KIA
  // ══════════════════════════════════════════════════════════════════════════

  it('CHIỀU 1: bài trỏ tới level không tồn tại', () => {
    const issues = validateTheoryDocs([doc('01-a', ['git-01-a', 'git-99-khong-co'])], ['git-01-a']);
    expect(codes(issues)).toEqual(['level-not-found']);
    expect(issues[0]?.levelId).toBe('git-99-khong-co');
  });

  it('CHIỀU 2: level không bài nào trỏ tới', () => {
    const issues = validateTheoryDocs([doc('01-a', ['git-01-a'])], ['git-01-a', 'git-02-b']);
    expect(codes(issues)).toEqual(['level-uncovered']);
    expect(issues[0]?.levelId).toBe('git-02-b');
  });

  /*
   * ĐỐI CHỨNG cho cả hai chiều cùng lúc, và là ô quan trọng nhất của file này.
   *
   * Mỗi chiều mù đúng nửa mà chiều kia gác. Dữ liệu dưới đây đi qua CHIỀU 1
   * sạch sẽ (mọi `usedByLevels` đều trỏ tới level có thật) trong khi CHIỀU 2 đỏ,
   * và ngược lại. Nếu ai đó xoá một trong hai vòng lặp trong `validateTheoryDocs`
   * thì đúng một trong hai `expect` dưới đây phải đỏ; cả hai cùng xanh chỉ khi
   * cả hai chiều còn sống.
   */
  it('không chiều nào bắt được lỗi của chiều kia', () => {
    // Chiều 1 sạch (mọi `usedByLevels` đều có thật), chiều 2 đỏ.
    const onlyDirection2Fails = validateTheoryDocs(
      [doc('01-a', ['git-01-a'])],
      ['git-01-a', 'git-02-b', 'git-03-c'],
    );
    expect(codes(onlyDirection2Fails)).toEqual(['level-uncovered', 'level-uncovered']);

    // Chiều 2 sạch (mọi level đều có bài), chiều 1 đỏ vì một id gõ nhầm.
    const onlyDirection1Fails = validateTheoryDocs(
      [doc('01-a', ['git-01-a']), doc('02-b', ['git-02-b', 'git-02-b-go-nham'])],
      ['git-01-a', 'git-02-b'],
    );
    expect(codes(onlyDirection1Fails)).toEqual(['level-not-found']);
  });

  it('tập bài rỗng KHÔNG phải là một cổng xanh', () => {
    const levels = ['git-01-a', 'git-02-b'];
    expect(codes(validateTheoryDocs([], levels))).toEqual(['level-uncovered', 'level-uncovered']);
  });

  it('CHIỀU 3: hai bài cùng nhận một level', () => {
    const levels = ['git-01-a'];
    const issues = validateTheoryDocs([doc('01-a', levels), doc('01-a-ban-sau', levels)], levels);
    expect(codes(issues)).toEqual(['level-claimed-twice']);
    expect(issues[0]?.docId).toBe('01-a-ban-sau');
  });

  it('một bài khai cùng một level hai lần', () => {
    const issues = validateTheoryDocs([doc('01-a', ['git-01-a', 'git-01-a'])], ['git-01-a']);
    expect(codes(issues)).toEqual(['duplicate-level-entry']);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // HÌNH DẠNG FRONTMATTER
  // ══════════════════════════════════════════════════════════════════════════

  it('hai bài trùng id', () => {
    const levels = ['git-01-a', 'git-02-b'];
    const issues = validateTheoryDocs([doc('trung', ['git-01-a']), doc('trung', ['git-02-b'])], levels);
    expect(codes(issues)).toEqual(['duplicate-id']);
  });

  it('id rỗng, title rỗng, thân bài rỗng', () => {
    const issues = validateTheoryDocs(
      [doc('', ['git-01-a'], { title: '   ', body: '\n  \n' })],
      ['git-01-a'],
    );
    expect(codes(issues)).toEqual(expect.arrayContaining(['blank-id', 'blank-title', 'blank-body']));
  });

  it('usedByLevels rỗng', () => {
    expect(codes(validateTheoryDocs([doc('01-a', [])], []))).toEqual(['no-levels-declared']);
  });

  it('readMinutes phải là số nguyên ≥ 1', () => {
    for (const bad of [0, -3, 2.5, Number.NaN]) {
      const issues = validateTheoryDocs(
        [doc('01-a', ['git-01-a'], { readMinutes: bad })],
        ['git-01-a'],
      );
      expect(codes(issues), `readMinutes=${String(bad)}`).toEqual(['bad-read-minutes']);
    }
  });

  /*
   * Đây là ô biến `readMinutes` từ "một con số cho đẹp" thành một lời khai có
   * người đối chiếu. Bài 400 từ nên khai 2 phút; khai 10 là đỏ.
   */
  it('readMinutes lệch quá xa số từ thật', () => {
    const issues = validateTheoryDocs(
      [doc('01-a', ['git-01-a'], { body: bodyOf(400), readMinutes: 10 })],
      ['git-01-a'],
    );
    expect(codes(issues)).toEqual(['read-minutes-mismatch']);
    expect(issues[0]?.message).toContain('400 từ');
  });

  it('lệch trong khoảng sai số thì im lặng', () => {
    const levels = ['git-01-a'];
    for (const minutes of [1, 2, 3]) {
      const issues = validateTheoryDocs(
        [doc('01-a', levels, { body: bodyOf(400), readMinutes: minutes })],
        levels,
      );
      expect(codes(issues), `readMinutes=${String(minutes)}`).toEqual([]);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ĐỐI CHIẾU VỚI HỢP ĐỒNG ID THẬT
  // ══════════════════════════════════════════════════════════════════════════

  /*
   * Không nạp file `.md` (package này không được chạm `node:fs`), nên ô này gác
   * phần duy nhất còn gác được từ trong đây: quy ước suy id bài đọc từ id level
   * phải TOÀN PHẦN và một-một trên 12 id thật của chương 1. Một id level trùng
   * nhau sau khi bỏ tiền tố sẽ làm hai bài phải mang cùng tên file, và lỗi đó
   * không lộ ra ở đâu khác.
   */
  it('12 id chương 1 suy ra 12 id bài đọc phân biệt, và phủ kín chương', () => {
    const theoryIds = CHAPTER_1_LEVEL_IDS.map(theoryIdForLevel);
    expect(new Set(theoryIds).size).toBe(CHAPTER_1_LEVEL_IDS.length);
    for (const id of theoryIds) expect(id).not.toMatch(/^git-/);

    const docs = CHAPTER_1_LEVEL_IDS.map((levelId) => doc(theoryIdForLevel(levelId), [levelId]));
    expect(validateTheoryDocs(docs, CHAPTER_1_LEVEL_IDS)).toEqual([]);
  });
});
