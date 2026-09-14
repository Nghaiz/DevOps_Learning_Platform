import { describe, expect, it } from 'vitest';
import type { Oid, OutputLine, Repo } from '../contract.ts';
import { writeCommit, writeContents } from '../objects.ts';
import { branchRef, emptyRepo, headOid, setRef, writeFile } from '../repo.ts';
import { gitAdd, gitCommit, type RepoOpResult } from './basic.ts';
import { gitLog, gitShow } from './inspect.ts';

function need<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`fixture thiếu ${what}`);
  return value;
}

function ok(result: RepoOpResult): Repo {
  if (result.error !== null) {
    throw new Error(`không mong lỗi: ${result.error.code} — ${result.error.message}`);
  }
  return result.repo;
}

function text(result: RepoOpResult): string {
  return result.output.map((item: OutputLine) => item.text).join('\n');
}

/** `main`: c1 → c2 → c3, mỗi commit sửa `a.txt`. */
function linearRepo(): Repo {
  let repo = emptyRepo();
  for (let index = 1; index <= 3; index += 1) {
    repo = ok(gitAdd(writeFile(repo, 'a.txt', [`bản ${String(index)}`]), ['a.txt']));
    repo = ok(gitCommit(repo, { message: `c${String(index)}`, logicalTime: index, author: 'Bạn' }));
  }
  return repo;
}

/**
 * Một commit merge dựng THẲNG bằng nguyên thuỷ object, không qua `ops/merge.ts`.
 *
 * Cố ý không gọi lane merge: test của `log` phải đỏ vì `log` sai, chứ không phải
 * vì hàng xóm sai. Fixture dựng tay thì hình dạng đồ thị là thứ test tự khai.
 */
function mergeRepo(): { readonly repo: Repo; readonly theirs: Oid; readonly merge: Oid } {
  let repo = emptyRepo();
  const made: Oid[] = [];
  const add = (parents: readonly Oid[], message: string, logicalTime: number): Oid => {
    const [withTree, tree] = writeContents(repo.objects, { 'a.txt': [message] });
    const [withCommit, oid] = writeCommit(withTree, {
      tree,
      parents,
      message,
      author: 'Bạn',
      logicalTime,
    });
    repo = { ...repo, objects: withCommit };
    made.push(oid);
    return oid;
  };

  const base = add([], 'base', 1);
  const ours = add([base], 'trên main', 2);
  const theirs = add([base], 'trên feature', 3);
  const merge = add([ours, theirs], 'trộn feature vào main', 4);

  repo = setRef(repo, branchRef('main'), merge, {
    op: 'merge',
    message: 'trộn feature',
    logicalTime: 4,
  });
  repo = setRef(repo, branchRef('feature'), theirs, {
    op: 'commit',
    message: 'trên feature',
    logicalTime: 3,
  });
  return { repo, theirs, merge };
}

// ═══════════════════════════════════════════════════════════════════════════
// git log
// ═══════════════════════════════════════════════════════════════════════════

describe('gitLog', () => {
  it('mặc định đi từ HEAD, mới nhất trước', () => {
    const out = text(gitLog(linearRepo()));
    expect(out.indexOf('c3')).toBeLessThan(out.indexOf('c2'));
    expect(out.indexOf('c2')).toBeLessThan(out.indexOf('c1'));
  });

  it('`--oneline` in Oid rút gọn 7 ký tự kèm thông điệp', () => {
    const repo = linearRepo();
    const tip = need(headOid(repo), 'HEAD');
    const out = text(gitLog(repo, { oneline: true }));
    expect(out).toContain(tip.slice(0, 7));
    expect(out).not.toContain('Tác giả:');
  });

  it('nhãn ref: `(HEAD -> main)` bám vào commit đỉnh', () => {
    expect(text(gitLog(linearRepo(), { oneline: true }))).toContain('(HEAD -> main)');
  });

  it('`-n` giới hạn và nói còn bao nhiêu commit nữa', () => {
    const out = text(gitLog(linearRepo(), { oneline: true, max: 2 }));
    expect(out).toContain('c3');
    expect(out).toContain('c2');
    expect(out).not.toContain('c1');
    expect(out).toContain('còn 1 commit nữa');
  });

  it('`-n` âm hoặc không nguyên ⇒ bad-usage', () => {
    expect(gitLog(linearRepo(), { max: -1 }).error?.code).toBe('bad-usage');
    expect(gitLog(linearRepo(), { max: 1.5 }).error?.code).toBe('bad-usage');
  });

  it('nhận một ref khác HEAD', () => {
    const out = text(gitLog(linearRepo(), { rev: 'HEAD~1', oneline: true }));
    expect(out).toContain('c2');
    expect(out).not.toContain('c3');
  });

  it('ref không phân giải được ⇒ lỗi có tên gần đúng', () => {
    const repo = linearRepo();
    const result = gitLog(repo, { rev: 'mian' });
    expect(result.error?.code).toBe('not-a-ref');
    expect(result.error?.suggest).toContain('main');
    expect(result.repo).toBe(repo);
  });

  it('repo chưa có commit nào ⇒ lỗi nói ra rằng branch chưa sinh ra', () => {
    const result = gitLog(emptyRepo());
    expect(result.error?.code).toBe('not-a-commit');
    expect(result.error?.explain).toContain('chưa tồn tại');
    expect(result.error?.suggest).toContain('git commit');
  });

  it('không bao giờ đổi trạng thái', () => {
    const repo = linearRepo();
    expect(gitLog(repo).repo).toBe(repo);
    expect(gitLog(repo, { all: true }).repo).toBe(repo);
  });
});

describe('gitLog — cha thứ nhất so với `--all`', () => {
  it('mặc định BỎ QUA nhánh đi vào qua cha thứ hai', () => {
    const { repo } = mergeRepo();
    const out = text(gitLog(repo, { oneline: true }));
    expect(out).toContain('trộn feature vào main');
    expect(out).toContain('trên main');
    // `trên feature` là cha THỨ HAI của commit merge — không nằm trên dòng cha
    // thứ nhất, nên `git log` mặc định không đi vào đó. Đây là bài G06.
    expect(out).not.toContain('trên feature');
  });

  it('`--all` thì thấy cả nhánh kia', () => {
    const { repo } = mergeRepo();
    const out = text(gitLog(repo, { oneline: true, all: true }));
    expect(out).toContain('trên feature');
    expect(out).toContain('trên main');
    expect(out).toContain('base');
  });

  it('`--all` sắp theo đồng hồ logic giảm dần, tất định', () => {
    const { repo } = mergeRepo();
    const first = text(gitLog(repo, { oneline: true, all: true }));
    const second = text(gitLog(repo, { oneline: true, all: true }));
    expect(first).toBe(second);
    expect(first.indexOf('trộn feature')).toBeLessThan(first.indexOf('trên feature'));
    expect(first.indexOf('trên feature')).toBeLessThan(first.indexOf('base'));
  });

  it('`--graph` đánh dấu `*` mỗi commit và `|\\` sau commit merge', () => {
    const { repo } = mergeRepo();
    const lines = gitLog(repo, { oneline: true, graph: true }).output.map((item) => item.text);
    expect(lines.some((item) => item.startsWith('* '))).toBe(true);
    expect(lines).toContain('|\\');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// git show
// ═══════════════════════════════════════════════════════════════════════════

describe('gitShow', () => {
  it('in metadata đầy đủ và diff so với cha thứ nhất', () => {
    const repo = linearRepo();
    const out = text(gitShow(repo));

    expect(out).toContain(need(headOid(repo), 'HEAD'));
    expect(out).toContain('Tác giả: Bạn');
    expect(out).toContain('Thời điểm logic: 3');
    expect(out).toContain('c3');
    // Thân diff là của `diff.ts`.
    expect(out).toContain('-bản 2');
    expect(out).toContain('+bản 3');
  });

  it('commit gốc nói rõ là không có cha', () => {
    const out = text(gitShow(linearRepo(), { rev: 'HEAD~2' }));
    expect(out).toContain('Cha: không có');
    expect(out).toContain('+bản 1');
  });

  it('commit merge liệt kê cả hai cha', () => {
    const { repo, theirs } = mergeRepo();
    const out = text(gitShow(repo));
    expect(out).toContain('Merge: ');
    expect(out).toContain(theirs.slice(0, 7));
  });

  it('nhận Oid rút gọn', () => {
    const repo = linearRepo();
    const tip = need(headOid(repo), 'HEAD');
    expect(text(gitShow(repo, { rev: tip.slice(0, 7) }))).toContain(tip);
  });

  it('ref không có ⇒ lỗi, repo không đổi', () => {
    const repo = linearRepo();
    const result = gitShow(repo, { rev: 'khong-co' });
    expect(result.error?.code).toBe('not-a-ref');
    expect(result.repo).toBe(repo);
  });

  it('repo chưa có commit nào ⇒ lỗi nói ra branch chưa sinh ra', () => {
    expect(gitShow(emptyRepo()).error?.code).toBe('not-a-commit');
  });

  it('không đổi trạng thái, kể cả kho object', () => {
    const repo = linearRepo();
    const result = gitShow(repo);
    expect(result.repo).toBe(repo);
    expect(result.repo.objects).toBe(repo.objects);
  });
});
