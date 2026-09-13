/**
 * Phép tìm tên gần đúng và hình dạng ba phần của `GitError`.
 *
 * Ô nghiệm thu AC-I sống ở đây và ở `parser.test.ts`: file này chứng minh cái
 * MÁY tìm lệnh gần đúng chạy đúng, file kia chứng minh nó thật sự được nối vào
 * đường lỗi của bộ phân tích. Cả hai đều cần — một hàm khoảng cách đúng mà không
 * ai gọi thì người chơi vẫn nhận "không phải lệnh git nào cả" trơ trọi.
 */

import { describe, expect, it } from 'vitest';
import {
  badArityError,
  editDistance,
  gitError,
  missingGitPrefixError,
  nearestNames,
  notARefError,
  notGitCommandError,
  unknownCommandError,
  unknownFlagError,
} from './errors.ts';

describe('editDistance', () => {
  it('chuỗi giống hệt nhau là 0', () => {
    expect(editDistance('commit', 'commit')).toBe(0);
    expect(editDistance('', '')).toBe(0);
  });

  it('chuỗi rỗng là độ dài chuỗi kia', () => {
    expect(editDistance('', 'merge')).toBe(5);
    expect(editDistance('merge', '')).toBe(5);
  });

  it('thêm, bớt, thay mỗi thứ một bước', () => {
    expect(editDistance('commmit', 'commit')).toBe(1); // thừa một ký tự
    expect(editDistance('comit', 'commit')).toBe(1); // thiếu một ký tự
    expect(editDistance('--forse', '--force')).toBe(1); // thay một ký tự
  });

  /**
   * Vế Damerau. Đảo hai ký tự liền nhau là lỗi gõ phổ biến nhất của lập trình
   * viên, và Levenshtein trần tính nó là 2 — tức là nó rơi ra ngoài ngưỡng đề
   * xuất của từ ngắn và người chơi mất đúng gợi ý họ cần nhất.
   */
  it('đảo hai ký tự liền nhau chỉ tốn một bước', () => {
    expect(editDistance('gti', 'git')).toBe(1);
    expect(editDistance('comimt', 'commit')).toBe(1);
    expect(editDistance('recieve', 'receive')).toBe(1);
    // Levenshtein trần trả 2 cho cùng cặp này — đó chính là điều Damerau sửa.
    expect(editDistance('brnach', 'branch')).toBe(1);
  });

  it('đối xứng', () => {
    expect(editDistance('branch', 'brnach')).toBe(editDistance('brnach', 'branch'));
  });
});

describe('nearestNames', () => {
  const VERBS = ['status', 'switch', 'show', 'stash', 'commit', 'checkout', 'cherry-pick'];

  it('tìm được từ gõ sai một ký tự', () => {
    expect(nearestNames('commmit', VERBS)[0]).toBe('commit');
    expect(nearestNames('swich', VERBS)[0]).toBe('switch');
  });

  it('tiền tố thắng khoảng cách — người gõ dở không phải người gõ sai', () => {
    // `st` cách `status` tận 4 bước, nhưng nó là tiền tố nên vẫn phải ra trước.
    expect(nearestNames('st', VERBS)).toContain('status');
    expect(nearestNames('st', VERBS)).toContain('stash');
  });

  it('từ khác hẳn thì không gợi ý bừa', () => {
    expect(nearestNames('ls', VERBS)).toEqual([]);
    expect(nearestNames('kubectl', VERBS)).toEqual([]);
  });

  it('chuỗi rỗng không gợi ý gì', () => {
    expect(nearestNames('', VERBS)).toEqual([]);
  });

  it('tôn trọng giới hạn số lượng', () => {
    expect(nearestNames('s', VERBS, 2).length).toBe(2);
  });

  /**
   * Thứ tự phải TẤT ĐỊNH. Hoà khoảng cách thì phân giải theo mã điểm Unicode,
   * không theo locale — một danh sách gợi ý đổi thứ tự theo máy sẽ làm test dom
   * của lane giao diện đỏ ngẫu nhiên, và đó là loại đỏ tệ nhất để truy.
   */
  it('hoà khoảng cách thì sắp theo tên, và luôn ra cùng thứ tự', () => {
    // Cả ba ứng viên cách `zab` đúng 1 bước — không có cách nào phân giải bằng
    // khoảng cách, nên đây là phép đo thật sự của quy tắc phá hoà.
    const pool = ['cab', 'bab', 'aab'];
    const forward = nearestNames('zab', pool);
    expect(forward).toEqual(['aab', 'bab', 'cab']);
    expect(nearestNames('zab', [...pool].reverse())).toEqual(forward);
  });
});

describe('gitError', () => {
  /**
   * `exactOptionalPropertyTypes` đang bật, nên `suggest: undefined` không gán
   * được vào `suggest?: string`. Khoá phải VẮNG MẶT chứ không phải có mặt với
   * giá trị `undefined` — và hai thứ đó khác nhau khi ai đó `JSON.stringify`
   * một `GitError` để so trong test phát lại.
   */
  it('bỏ hẳn khoá `suggest` khi không có gợi ý', () => {
    const error = gitError('bad-usage', 'a', 'b');
    expect('suggest' in error).toBe(false);
  });

  it('giữ `suggest` khi có', () => {
    expect(gitError('bad-usage', 'a', 'b', 'c').suggest).toBe('c');
  });
});

describe('unknownCommandError', () => {
  const VERBS = ['commit', 'status', 'switch'];
  const SUMMARIES = { commit: 'Đóng index thành commit', status: 'Xem repo', switch: 'Đổi branch' };

  /** Ô nghiệm thu AC-I. */
  it('nêu lệnh gần đúng thay vì báo không tìm thấy', () => {
    const error = unknownCommandError('commmit', VERBS, SUMMARIES);
    expect(error.code).toBe('unknown-command');
    expect(error.suggest).toContain('`git commit`');
    expect(error.suggest).toContain('Đóng index thành commit');
  });

  it('không có gì gần thì vẫn nói được điều có ích', () => {
    const error = unknownCommandError('zzzz', VERBS, SUMMARIES);
    expect(error.suggest).toContain('`status`');
    expect(error.explain).toContain('repo vẫn y nguyên');
  });

  it('cả ba phần đều có nội dung', () => {
    const error = unknownCommandError('swich', VERBS, SUMMARIES);
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.explain.length).toBeGreaterThan(0);
    expect(error.suggest?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('unknownFlagError', () => {
  const PUSH_FLAGS = [
    {
      name: '--force',
      summary: 'Ghi đè branch trên remote',
      caution: '`--force-with-lease` an toàn hơn vì nó từ chối ghi đè khi remote đã đổi.',
    },
    { name: '--force-with-lease', summary: 'Ghi đè có kiểm tra', caution: null },
    { name: '-u', summary: 'Ghi nhớ upstream', caution: null },
  ];

  /**
   * Ô nghiệm thu AC-I thứ hai: `--forse` phải nêu `--force` **và** nói
   * `--force-with-lease` tồn tại. Vế thứ hai đến từ `caution` của chính cờ được
   * đề xuất, nên thêm cảnh báo cho một cờ khác là sửa bảng lệnh chứ không sửa
   * `errors.ts`.
   */
  it('nêu cờ gần đúng kèm cảnh báo khai trong bảng', () => {
    const error = unknownFlagError('git push', '--forse', PUSH_FLAGS, 'git push …');
    expect(error.code).toBe('unknown-flag');
    expect(error.suggest).toContain('--force');
    expect(error.suggest).toContain('--force-with-lease');
  });

  it('liệt kê cờ hợp lệ trong phần giải thích', () => {
    const error = unknownFlagError('git push', '--zzzz', PUSH_FLAGS, 'git push …');
    expect(error.explain).toContain('`--force`');
    expect(error.explain).toContain('`-u`');
  });

  it('lệnh không có cờ nào thì nói thẳng điều đó', () => {
    const error = unknownFlagError('git status', '--zzzz', [], 'git status');
    expect(error.explain).toContain('không nhận cờ nào');
  });
});

describe('lỗi thiếu chữ `git`', () => {
  it('dựng lại nguyên dòng lệnh đúng để người chơi chép', () => {
    const error = missingGitPrefixError('commit', ['-m', 'xin chao']);
    expect(error.suggest).toContain('git commit -m xin chao');
  });

  it('thứ không phải lệnh git thì nói rõ terminal này chỉ chạy git', () => {
    expect(notGitCommandError('kubectl').explain).toContain('chỉ nhận lệnh `git`');
  });
});

describe('badArityError', () => {
  it('nói rõ cần bao nhiêu và nhận được bao nhiêu', () => {
    const error = badArityError('git switch', 3, 0, 1, 'giải thích', 'git switch <branch>');
    expect(error.message).toContain('nhận được 3');
    expect(error.explain).toBe('giải thích');
    expect(error.suggest).toContain('git switch <branch>');
  });

  it('không giới hạn trên thì diễn đạt là "ít nhất"', () => {
    const error = badArityError('git add', 0, 1, Number.POSITIVE_INFINITY, 'x', 'git add <path>');
    expect(error.message).toContain('ít nhất 1');
  });
});

describe('notARefError', () => {
  it('chỉ ra ref gần đúng', () => {
    const error = notARefError('mian', ['main', 'tinh-nang'], 'Lệnh cần một ref có thật.');
    expect(error.code).toBe('not-a-ref');
    expect(error.suggest).toContain('`main`');
    expect(error.explain).toContain('`main`');
  });

  it('repo chưa có ref nào thì giải thích vì sao', () => {
    const error = notARefError('main', [], 'Lệnh cần một ref có thật.');
    expect(error.explain).toContain('chưa commit lần nào');
    expect('suggest' in error).toBe(false);
  });
});
