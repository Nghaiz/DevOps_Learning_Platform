/**
 * Bộ phân tích dòng lệnh git.
 *
 * Hai nhóm test ở cuối file (`dùng đúng` / `dùng sai`) chạy trên MỘT BẢNG khoá
 * bằng `GitVerb`, nên thêm một động từ vào bảng lệnh mà quên viết test là **đỏ
 * ngay ở typecheck** — `Record<GitVerb, string>` không cho thiếu khoá. Đó là
 * cách duy nhất để câu "mọi lệnh đều có test" không trôi thành một lời khai.
 */

import { describe, expect, it } from 'vitest';
import type { GitError } from './contract.ts';
import type { GitVerb } from './command-table.ts';
import { GIT_VERBS } from './command-table.ts';
import type { ParsedCommand } from './parser.ts';
import { flagValue, hasFlag, parseGitCommand, pathOperands, tokenize } from './parser.ts';

function ok(input: string): ParsedCommand {
  const result = parseGitCommand(input);
  if (!result.ok) {
    throw new Error(`mong đợi phân tích được "${input}", nhận lỗi: ${result.error.message}`);
  }
  return result.command;
}

function err(input: string): GitError {
  const result = parseGitCommand(input);
  if (result.ok) throw new Error(`mong đợi lỗi cho "${input}", nhưng phân tích thành công`);
  return result.error;
}

// ═══════════════════════════════════════════════════════════════════════════

describe('tokenize', () => {
  it('tách theo khoảng trắng và bỏ khoảng trắng thừa', () => {
    expect(tokenize('  git   status  ')).toEqual(['git', 'status']);
  });

  it('nháy kép gom cả cụm thành một token', () => {
    expect(tokenize('git commit -m "hai từ"')).toEqual(['git', 'commit', '-m', 'hai từ']);
  });

  it('nháy đơn cũng thế', () => {
    expect(tokenize("git commit -m 'hai từ'")).toEqual(['git', 'commit', '-m', 'hai từ']);
  });

  /**
   * Không có `hasContent` thì `-m ""` mất hẳn token rỗng, và người chơi cố ý thử
   * một thông điệp rỗng sẽ nhận về một lỗi nói về cú pháp — sai chỗ hoàn toàn.
   */
  it('giữ được token RỖNG do nháy sinh ra', () => {
    expect(tokenize('git commit -m ""')).toEqual(['git', 'commit', '-m', '']);
  });

  it('chuỗi rỗng cho ra không token nào', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('cờ', () => {
  it('cờ dài và cờ ngắn vào cùng một ô, khoá bằng dạng dài', () => {
    expect(ok('git commit -m xin-chao').flags).toEqual({ '--message': 'xin-chao' });
    expect(ok('git commit --message xin-chao').flags).toEqual({ '--message': 'xin-chao' });
  });

  it('`=` trong cờ dài tách đúng chỗ', () => {
    expect(flagValue(ok('git commit --message=xin-chao'), '--message')).toBe('xin-chao');
  });

  it('`=` chỉ tách ở dấu bằng ĐẦU TIÊN', () => {
    expect(flagValue(ok('git commit --message=a=b'), '--message')).toBe('a=b');
  });

  it('cờ luận lý không nhận giá trị', () => {
    expect(err('git log --oneline=true').code).toBe('bad-usage');
  });

  it('cờ thiếu giá trị là lỗi, không phải giá trị rỗng', () => {
    expect(err('git rebase --onto').code).toBe('bad-usage');
    expect(err('git switch -c').code).toBe('bad-usage');
  });

  it('giá trị RỖNG tường minh vẫn là một giá trị', () => {
    expect(flagValue(ok('git commit -m ""'), '--message')).toBe('');
  });

  it('cờ lặp thì lần gõ sau thắng', () => {
    expect(flagValue(ok('git commit -m a -m b'), '--message')).toBe('b');
  });

  /**
   * Thứ tự gõ không được ảnh hưởng tới kết quả so sánh. `normalized()` của
   * `deterministic.ts` lo việc này, và nếu nó bị gỡ đi thì test này đỏ.
   */
  it('thứ tự cờ không đổi kết quả', () => {
    expect(ok('git commit -a -m x').flags).toEqual(ok('git commit -m x -a').flags);
  });

  it('hasFlag nói có mặt, flagValue chỉ trả chuỗi', () => {
    const command = ok('git commit --amend -m x');
    expect(hasFlag(command, '--amend')).toBe(true);
    expect(flagValue(command, '--amend')).toBeNull();
    expect(flagValue(command, '--message')).toBe('x');
    expect(hasFlag(command, '--allow-empty')).toBe(false);
  });
});

describe('cụm cờ gộp', () => {
  /** Ô nghiệm thu: `-am` phải tách thành `-a` và `-m`. */
  it('`-am` là `-a` cộng `-m`, và `-m` nuốt token kế', () => {
    const command = ok('git commit -am "sua loi dang nhap"');
    expect(command.flags).toEqual({ '--all': true, '--message': 'sua loi dang nhap' });
    expect(command.args).toEqual([]);
  });

  it('phần đuôi cụm là giá trị khi có', () => {
    expect(flagValue(ok('git commit -mxin-chao'), '--message')).toBe('xin-chao');
  });

  it('ký tự lạ trong cụm báo đúng ký tự đó', () => {
    const error = err('git branch -Z tam');
    expect(error.code).toBe('unknown-flag');
    expect(error.message).toContain('-Z');
    expect(error.explain).toContain('cụm cờ gộp');
  });

  it('bí danh `-D` bung thành `-d -f`', () => {
    expect(ok('git branch -D tam').flags).toEqual({ '--delete': true, '--force': true });
  });

  it('bí danh dùng được cả khi đứng trong cụm', () => {
    expect(ok('git branch -aD tam').flags).toEqual({
      '--all': true,
      '--delete': true,
      '--force': true,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('dấu `--` phân cách', () => {
  /** Ô nghiệm thu: `src/a.ts` phải là path, tuyệt đối không phải ref. */
  it('mọi thứ sau `--` là path, không vào `args`', () => {
    const command = ok('git log -- src/a.ts');
    expect(command.args).toEqual([]);
    expect(command.paths).toEqual(['src/a.ts']);
    expect(command.hasPathSeparator).toBe(true);
  });

  it('ref trước `--`, path sau `--`', () => {
    const command = ok('git checkout main -- src/a.ts src/b.ts');
    expect(command.args).toEqual(['main']);
    expect(command.paths).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('không có `--` thì cờ đánh dấu đúng là không có', () => {
    expect(ok('git log main').hasPathSeparator).toBe(false);
  });

  it('token trông giống cờ mà nằm sau `--` vẫn là path', () => {
    expect(ok('git log -- --oneline').paths).toEqual(['--oneline']);
  });

  /**
   * `git add -- a.ts` phải thoả `minArgs: 1` của `add` dù `args` rỗng — path sau
   * `--` vẫn là toán hạng của lệnh. Với `git log` thì ngược lại: ở đó `--` phục
   * vụ việc tách path RA KHỎI vùng ref, nên path không tính vào số tham số.
   */
  it('path tính vào số tham số với lệnh vốn nhận path', () => {
    expect(ok('git add -- src/a.ts').paths).toEqual(['src/a.ts']);
    expect(err('git add').code).toBe('bad-usage');
  });

  it('pathOperands gộp đúng hai nguồn, và im lặng với lệnh không nhận path', () => {
    expect(pathOperands(ok('git add a.ts -- b.ts'))).toEqual(['a.ts', 'b.ts']);
    expect(pathOperands(ok('git add a.ts'))).toEqual(['a.ts']);
    expect(pathOperands(ok('git log -- a.ts'))).toEqual([]);
  });

  it('`-` một mình là tham số, không phải cờ', () => {
    expect(ok('git switch -').args).toEqual(['-']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('lệnh con', () => {
  it('lệnh con mặc định được điền vào khi người chơi không nêu', () => {
    expect(ok('git stash').sub).toBe('push');
    expect(ok('git reflog').sub).toBe('show');
    expect(ok('git remote -v').sub).toBe('list');
  });

  it('lệnh con nêu tường minh thì không bị đếm vào tham số', () => {
    const command = ok('git stash drop stash@{1}');
    expect(command.sub).toBe('drop');
    expect(command.args).toEqual(['stash@{1}']);
  });

  it('gõ sai tên lệnh con thì được chỉ ra lệnh đúng', () => {
    const error = err('git bisect strat');
    expect(error.code).toBe('unknown-command');
    expect(error.suggest).toContain('git bisect start');
  });

  it('động từ bắt buộc có lệnh con thì nói rõ khi thiếu', () => {
    expect(err('git bisect').message).toContain('thiếu lệnh con');
    expect(err('git pr').message).toContain('thiếu lệnh con');
  });

  it('lệnh con mặc định không nhận tham số thì tham số lạ là lỗi tên lệnh con', () => {
    expect(err('git remote foo').message).toContain('không có lệnh con');
  });

  /**
   * Phép đoán gõ-nhầm bị TẮT ở vị trí nhận path tự do. `apps/` cách `apply` đúng
   * 2 ký tự, tức nằm trong ngưỡng đề xuất — bật phép đoán ở đó sẽ từ chối một
   * đường dẫn hợp lệ và nói rất tự tin rằng người chơi gõ sai.
   */
  it('đường dẫn giống tên lệnh con vẫn được nhận là đường dẫn', () => {
    const command = ok('git stash apps/');
    expect(command.sub).toBe('push');
    expect(command.args).toEqual(['apps/']);
  });

  it('ở vị trí nhận ref thì phép đoán gõ-nhầm vẫn bật', () => {
    expect(err('git reflog shw').message).toContain('không có lệnh con');
    expect(ok('git reflog main').args).toEqual(['main']);
  });

  it('cờ của lệnh con này không dùng được cho lệnh con kia', () => {
    const error = err('git stash pop -m x');
    expect(error.code).toBe('unknown-flag');
    expect(error.message).toContain('git stash pop');
  });

  /**
   * Hợp đồng mọc thêm nhánh `PendingOp` kind `'stash'` ngày 2026-09-14, và
   * `PendingOp` theo định nghĩa là thao tác CHẶN ĐƯỜNG. Không có hai cờ này thì
   * người chơi gặp xung đột lúc `git stash pop` bị kẹt mà không có lệnh nào gõ
   * được để thoát ra.
   */
  it('stash đang xung đột có đường thoát, và chỉ ở đúng lệnh con cần nó', () => {
    expect(hasFlag(ok('git stash pop --abort'), '--abort')).toBe(true);
    expect(hasFlag(ok('git stash apply --continue'), '--continue')).toBe(true);
    expect(err('git stash list --abort').code).toBe('unknown-flag');
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('thông báo lỗi giải thích trạng thái (§17.I.4)', () => {
  /** Ô nghiệm thu AC-I. */
  it('lệnh gõ thừa một ký tự ra lệnh gần đúng, không ra "không tìm thấy"', () => {
    const error = err('git commmit -m "x"');
    expect(error.code).toBe('unknown-command');
    expect(error.suggest).toContain('`git commit`');
  });

  /** Ô nghiệm thu AC-I. */
  it('`--forse` nêu `--force` VÀ nói `--force-with-lease` tồn tại', () => {
    const error = err('git push --forse');
    expect(error.code).toBe('unknown-flag');
    expect(error.suggest).toContain('--force');
    expect(error.suggest).toContain('--force-with-lease');
  });

  it('quên chữ `git` được nhận ra và dựng lại đúng dòng lệnh', () => {
    const error = err('commit -m x');
    expect(error.suggest).toContain('git commit -m x');
  });

  it('lệnh của công cụ khác được nói rõ là không chạy ở đây', () => {
    expect(err('kubectl get pods').explain).toContain('chỉ nhận lệnh `git`');
  });

  it('dòng rỗng và `git` trơ trọi đều có lối ra cụ thể', () => {
    expect(err('').suggest).toContain('git status');
    expect(err('git').suggest).toContain('git status');
  });

  it('mọi lỗi đều có đủ `message` và `explain`', () => {
    for (const input of ['git zzz', 'git push --forse', 'git add', 'git bisect', 'git remote foo']) {
      const error = err(input);
      expect(error.message.length, input).toBeGreaterThan(0);
      expect(error.explain.length, input).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('kết quả phân tích', () => {
  it('giữ lại nguyên dòng đã gõ, đã cắt khoảng trắng hai đầu', () => {
    expect(ok('  git status  ').raw).toBe('git status');
  });

  it('lệnh không có lệnh con thì `sub` là null', () => {
    expect(ok('git status').sub).toBeNull();
  });

  it('không lệnh nào làm bộ phân tích ném ngoại lệ', () => {
    const garbage = ['', '   ', '-', '--', 'git --', 'git -- --', "git commit -m '", 'git "', '===='];
    for (const input of garbage) {
      expect(() => parseGitCommand(input), input).not.toThrow();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MỌI LỆNH: một ca dùng đúng, một ca dùng sai
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠ Kiểu `Readonly<Record<GitVerb, string>>` là cổng thật sự ở đây: thêm một
 * động từ vào `command-table.ts` mà quên bổ sung hai bảng này thì `tsc` đỏ ngay,
 * chứ không phải đợi ai đó nhớ ra.
 */
const GOOD_USE: Readonly<Record<GitVerb, string>> = {
  init: 'git init',
  add: 'git add src/a.ts',
  commit: 'git commit -m "sua loi dang nhap"',
  status: 'git status',
  diff: 'git diff --staged',
  log: 'git log --oneline --graph -n 5',
  show: 'git show HEAD',
  branch: 'git branch -d tinh-nang',
  switch: 'git switch -c tinh-nang',
  checkout: 'git checkout -b tinh-nang',
  tag: 'git tag v1.0 main',
  merge: 'git merge --no-ff tinh-nang',
  rebase: 'git rebase --onto main tinh-nang',
  'cherry-pick': 'git cherry-pick a1b2c3d',
  revert: 'git revert a1b2c3d',
  reset: 'git reset --hard HEAD',
  stash: 'git stash push -m "dang do"',
  reflog: 'git reflog show main',
  fsck: 'git fsck --lost-found',
  bisect: 'git bisect start',
  clone: 'git clone origin',
  fetch: 'git fetch origin main',
  push: 'git push --force-with-lease origin main',
  pull: 'git pull --rebase origin main',
  remote: 'git remote add origin /kho/goc',
  pr: 'git pr merge 3 --squash',
};

const BAD_USE: Readonly<Record<GitVerb, string>> = {
  init: 'git init a b',
  add: 'git add',
  commit: 'git commit thua-tham-so',
  status: 'git status main',
  diff: 'git diff --stagd',
  log: 'git log a b c',
  show: 'git show a b',
  branch: 'git branch -Z tam',
  switch: 'git switch a b',
  checkout: 'git checkout --bra',
  tag: 'git tag a b c',
  merge: 'git merge a b',
  rebase: 'git rebase --onto',
  'cherry-pick': 'git cherry-pick --contnue',
  revert: 'git revert --skip',
  reset: 'git reset a b',
  stash: 'git stash pop -m x',
  reflog: 'git reflog shw',
  fsck: 'git fsck HEAD',
  bisect: 'git bisect',
  clone: 'git clone a b c',
  fetch: 'git fetch a b c',
  push: 'git push --forse',
  pull: 'git pull --rebse',
  remote: 'git remote add origin',
  pr: 'git pr',
};

describe('mọi lệnh — dùng đúng', () => {
  it.each([...GIT_VERBS])('%s', (verb) => {
    const command = ok(GOOD_USE[verb]);
    expect(command.verb).toBe(verb);
  });
});

describe('mọi lệnh — dùng sai', () => {
  it.each([...GIT_VERBS])('%s', (verb) => {
    const error = err(BAD_USE[verb]);
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.explain.length).toBeGreaterThan(0);
  });
});
