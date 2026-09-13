import { describe, expect, it } from 'vitest';
import type { Lines, OutputLine, Repo } from '../contract.ts';
import { sortedEntries } from '../deterministic.ts';
import { getCommit, hasObject } from '../objects.ts';
import {
  blobOid,
  branchRef,
  emptyRepo,
  headOid,
  readReflog,
  refsAt,
  removeFile,
  writeFile,
} from '../repo.ts';
import {
  diffPairs,
  gitAdd,
  gitCheckoutPaths,
  gitCommit,
  gitDiff,
  gitInit,
  gitStatus,
  indexContents,
  type RepoOpResult,
} from './basic.ts';

function need<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`fixture thiếu ${what}`);
  return value;
}

function withFiles(repo: Repo, files: Readonly<Record<string, Lines>>): Repo {
  let next = repo;
  for (const [path, lines] of sortedEntries(files)) next = writeFile(next, path, lines);
  return next;
}

/** Kết quả phải THÀNH CÔNG; ném lỗi nêu đích danh thông báo nếu không. */
function ok(result: RepoOpResult): Repo {
  if (result.error !== null) {
    throw new Error(`không mong lỗi: ${result.error.code} — ${result.error.message}`);
  }
  return result.repo;
}

function text(result: RepoOpResult): string {
  return result.output.map((item: OutputLine) => item.text).join('\n');
}

/** `a.txt` với nội dung cho trước, đã commit. */
function repoWithCommit(content: Lines = ['dòng một']): Repo {
  const staged = ok(gitAdd(withFiles(emptyRepo(), { 'a.txt': content }), ['a.txt']));
  return ok(gitCommit(staged, { message: 'commit đầu tiên', logicalTime: 1, author: 'Bạn' }));
}

// ═══════════════════════════════════════════════════════════════════════════
// git init
// ═══════════════════════════════════════════════════════════════════════════

describe('gitInit', () => {
  it('nói ra rằng branch mặc định CHƯA tồn tại', () => {
    const result = gitInit(emptyRepo());
    expect(result.error).toBeNull();
    expect(text(result)).toContain('CHƯA tồn tại');
    expect(result.repo.refs).toEqual({});
  });

  it('chạy lại trên repo đã có commit thì KHÔNG xoá gì', () => {
    const before = repoWithCommit();
    const result = gitInit(before);
    expect(result.error).toBeNull();
    expect(result.repo).toBe(before);
    expect(text(result)).toContain('không có gì thay đổi');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// git add
// ═══════════════════════════════════════════════════════════════════════════

describe('gitAdd', () => {
  it('thêm một file ĐÃ TỒN TẠI: index giữ Oid của nội dung, kho giữ blob (bài G03)', () => {
    const repo = withFiles(emptyRepo(), { 'a.txt': ['xin chào'] });
    const next = ok(gitAdd(repo, ['a.txt']));

    const expected = blobOid(['xin chào']);
    expect(next.index['a.txt']).toBe(expected);
    expect(hasObject(next.objects, expected)).toBe(true);
    // Worktree KHÔNG bị đụng tới — `add` sao chép vào index, không di chuyển file.
    expect(next.worktree['a.txt']).toEqual(['xin chào']);
  });

  it('`.` đưa mọi đường dẫn vào index', () => {
    const repo = withFiles(emptyRepo(), { 'a.txt': ['a'], 'src/b.ts': ['b'] });
    const next = ok(gitAdd(repo, ['.']));
    expect(Object.keys(next.index).sort()).toEqual(['a.txt', 'src/b.ts']);
  });

  it('tên thư mục đưa mọi file dưới nó vào index', () => {
    const repo = withFiles(emptyRepo(), { 'a.txt': ['a'], 'src/b.ts': ['b'], 'src/c.ts': ['c'] });
    const next = ok(gitAdd(repo, ['src']));
    expect(Object.keys(next.index).sort()).toEqual(['src/b.ts', 'src/c.ts']);
  });

  it('`-A` gom cả file mới lẫn file vừa bị xoá', () => {
    const committed = repoWithCommit();
    const dirty = withFiles(removeFile(committed, 'a.txt'), { 'b.txt': ['mới'] });
    const next = ok(gitAdd(dirty, [], { all: true }));
    // `a.txt` biến khỏi index = đã staged việc XOÁ.
    expect(Object.hasOwn(next.index, 'a.txt')).toBe(false);
    expect(Object.hasOwn(next.index, 'b.txt')).toBe(true);
  });

  it('`add` một file đã xoá là staged việc xoá, không phải lỗi', () => {
    const committed = repoWithCommit();
    const next = ok(gitAdd(removeFile(committed, 'a.txt'), ['a.txt']));
    expect(Object.hasOwn(next.index, 'a.txt')).toBe(false);
  });

  it('đường dẫn không có thật ⇒ path-not-found, và repo KHÔNG đổi', () => {
    const repo = withFiles(emptyRepo(), { 'a.txt': ['a'] });
    const result = gitAdd(repo, ['khong-co.txt']);
    expect(result.error?.code).toBe('path-not-found');
    expect(result.repo).toBe(repo);
  });

  it('nhiều đường dẫn mà một cái hỏng ⇒ KHÔNG cái nào được staged', () => {
    const repo = withFiles(emptyRepo(), { 'a.txt': ['a'] });
    const result = gitAdd(repo, ['a.txt', 'khong-co.txt']);
    expect(result.error?.code).toBe('path-not-found');
    expect(result.repo.index).toEqual({});
  });

  it('không đường dẫn và không `-A` ⇒ bad-usage', () => {
    const repo = emptyRepo();
    expect(gitAdd(repo, []).error?.code).toBe('bad-usage');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// git commit
// ═══════════════════════════════════════════════════════════════════════════

describe('gitCommit', () => {
  it('commit đầu tiên trên branch CHƯA SINH RA tạo ra chính ref đó', () => {
    const staged = ok(gitAdd(withFiles(emptyRepo(), { 'a.txt': ['a'] }), ['a.txt']));
    expect(staged.refs).toEqual({});

    const next = ok(gitCommit(staged, { message: 'commit gốc', logicalTime: 1, author: 'Bạn' }));
    const oid = need(next.refs[branchRef('main')], 'refs/heads/main');
    expect(getCommit(next.objects, oid)?.parents).toEqual([]);
    // Reflog của một ref vừa sinh ra có `from === null`.
    expect(readReflog(next, branchRef('main'))[0]?.from).toBeNull();
    expect(readReflog(next, 'HEAD')[0]?.to).toBe(oid);
  });

  it('dựng tree từ INDEX, không từ worktree', () => {
    let repo = withFiles(emptyRepo(), { 'a.txt': ['bản đã add'] });
    repo = ok(gitAdd(repo, ['a.txt']));
    repo = writeFile(repo, 'a.txt', ['bản sửa sau, CHƯA add']);
    repo = ok(gitCommit(repo, { message: 'c1', logicalTime: 1, author: 'Bạn' }));

    const committed = indexContents(repo);
    expect(committed['a.txt']).toEqual(['bản đã add']);
    expect(repo.worktree['a.txt']).toEqual(['bản sửa sau, CHƯA add']);
  });

  it('index rỗng ⇒ nothing-to-commit, và giải thích khác nhau tuỳ worktree có bẩn không', () => {
    const clean = repoWithCommit();
    const onClean = gitCommit(clean, { message: 'x', logicalTime: 2, author: 'Bạn' });
    expect(onClean.error?.code).toBe('nothing-to-commit');
    expect(onClean.repo).toBe(clean);

    const dirty = writeFile(clean, 'a.txt', ['sửa mà chưa add']);
    const onDirty = gitCommit(dirty, { message: 'x', logicalTime: 2, author: 'Bạn' });
    expect(onDirty.error?.code).toBe('nothing-to-commit');
    expect(onDirty.error?.explain).toContain('INDEX');
    expect(onDirty.error?.suggest).toContain('git add');
  });

  it('`--allow-empty` cho qua', () => {
    const clean = repoWithCommit();
    const next = ok(
      gitCommit(clean, { message: 'rỗng', logicalTime: 2, author: 'Bạn', allowEmpty: true }),
    );
    expect(headOid(next)).not.toBe(headOid(clean));
  });

  it('thông điệp rỗng ⇒ bad-usage', () => {
    const staged = ok(gitAdd(withFiles(emptyRepo(), { 'a.txt': ['a'] }), ['a.txt']));
    expect(gitCommit(staged, { message: '   ', logicalTime: 1, author: 'Bạn' }).error?.code).toBe(
      'bad-usage',
    );
  });

  it('`-a` gom file ĐÃ THEO DÕI, bỏ qua file chưa track', () => {
    let repo = repoWithCommit();
    repo = writeFile(repo, 'a.txt', ['đã sửa']);
    repo = writeFile(repo, 'la.txt', ['file lạ']);
    repo = ok(gitCommit(repo, { message: 'c2', logicalTime: 2, author: 'Bạn', all: true }));

    expect(indexContents(repo)['a.txt']).toEqual(['đã sửa']);
    expect(Object.hasOwn(repo.index, 'la.txt')).toBe(false);
  });

  it('HEAD tách rời: commit dời HEAD chứ không dời branch nào', () => {
    const committed = repoWithCommit();
    const tip = need(headOid(committed), 'HEAD');
    let repo: Repo = { ...committed, head: { type: 'detached', oid: tip } };
    repo = ok(gitAdd(writeFile(repo, 'b.txt', ['b']), ['b.txt']));
    const result = gitCommit(repo, { message: 'trên detached', logicalTime: 2, author: 'Bạn' });
    const next = ok(result);

    expect(next.head).toEqual({ type: 'detached', oid: headOid(next) });
    expect(next.refs[branchRef('main')]).toBe(tip);
    expect(text(result)).toContain('tách rời');
  });
});

describe('gitCommit --amend', () => {
  it('commit CŨ vẫn nằm trong kho sau khi amend, chỉ không còn ref nào trỏ tới', () => {
    const first = repoWithCommit();
    const oldOid = need(headOid(first), 'HEAD sau commit đầu');

    const staged = ok(gitAdd(writeFile(first, 'a.txt', ['sửa lại']), ['a.txt']));
    const result = gitCommit(staged, {
      message: 'thông điệp mới',
      logicalTime: 2,
      author: 'Bạn',
      amend: true,
    });
    const next = ok(result);
    const newOid = need(headOid(next), 'HEAD sau amend');

    expect(newOid).not.toBe(oldOid);
    // Đây là bất biến nền của cả chương 3: kho KHÔNG BAO GIỜ xoá.
    expect(hasObject(next.objects, oldOid)).toBe(true);
    expect(refsAt(next, oldOid)).toEqual([]);
    expect(text(result)).toContain('vẫn nằm trong kho');
  });

  it('giữ nguyên tập cha của commit bị thay', () => {
    let repo = repoWithCommit();
    repo = ok(gitAdd(writeFile(repo, 'b.txt', ['b']), ['b.txt']));
    repo = ok(gitCommit(repo, { message: 'c2', logicalTime: 2, author: 'Bạn' }));
    const parentOfC2 = need(getCommit(repo.objects, need(headOid(repo), 'HEAD'))?.parents[0], 'cha của c2');

    repo = ok(gitAdd(writeFile(repo, 'b.txt', ['b sửa']), ['b.txt']));
    repo = ok(gitCommit(repo, { message: 'c2 sửa', logicalTime: 3, author: 'Bạn', amend: true }));

    expect(getCommit(repo.objects, need(headOid(repo), 'HEAD'))?.parents).toEqual([parentOfC2]);
  });

  it('amend chỉ để sửa thông điệp thì KHÔNG cần `--allow-empty`', () => {
    const first = repoWithCommit();
    const result = gitCommit(first, {
      message: 'thông điệp khác',
      logicalTime: 2,
      author: 'Bạn',
      amend: true,
    });
    expect(result.error).toBeNull();
    expect(getCommit(result.repo.objects, need(headOid(result.repo), 'HEAD'))?.message).toBe(
      'thông điệp khác',
    );
  });

  it('amend khi chưa có commit nào ⇒ nothing-to-commit', () => {
    const staged = ok(gitAdd(withFiles(emptyRepo(), { 'a.txt': ['a'] }), ['a.txt']));
    const result = gitCommit(staged, {
      message: 'x',
      logicalTime: 1,
      author: 'Bạn',
      amend: true,
    });
    expect(result.error?.code).toBe('nothing-to-commit');
    expect(result.repo).toBe(staged);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// git status
// ═══════════════════════════════════════════════════════════════════════════

describe('gitStatus', () => {
  it('worktree sạch', () => {
    expect(text(gitStatus(repoWithCommit()))).toContain('worktree sạch');
  });

  it('branch chưa sinh ra', () => {
    expect(text(gitStatus(emptyRepo()))).toContain('Chưa có commit nào');
  });

  it('hai cột TÁCH RIÊNG: staged và chưa staged là hai trục', () => {
    let repo = repoWithCommit();
    repo = ok(gitAdd(writeFile(repo, 'b.txt', ['b']), ['b.txt'])); // staged: file mới
    repo = writeFile(repo, 'a.txt', ['a sửa']); // chưa staged: sửa
    repo = writeFile(repo, 'la.txt', ['lạ']); // chưa track

    const out = text(gitStatus(repo));
    expect(out).toContain('SẼ vào commit tới');
    expect(out).toContain('CHƯA vào commit tới');
    expect(out).toContain('File chưa được theo dõi');
    expect(out).toContain('b.txt');
    expect(out).toContain('la.txt');
  });

  it('một file ở CẢ HAI cột thì nói thẳng ra (misfit MIT)', () => {
    let repo = repoWithCommit();
    repo = ok(gitAdd(writeFile(repo, 'a.txt', ['bản đã add']), ['a.txt']));
    repo = writeFile(repo, 'a.txt', ['bản sửa sau']);

    const out = text(gitStatus(repo));
    expect(out).toContain('CẢ HAI cột');
    expect(out).toContain('chỉ đóng bản đã `add`');
  });

  it('không bao giờ đổi trạng thái — kể cả kho object', () => {
    const repo = writeFile(repoWithCommit(), 'a.txt', ['sửa']);
    const result = gitStatus(repo);
    expect(result.repo).toBe(repo);
    expect(result.error).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// git diff
// ═══════════════════════════════════════════════════════════════════════════

describe('gitDiff', () => {
  it('mặc định so worktree với index', () => {
    const repo = writeFile(repoWithCommit(), 'a.txt', ['đã sửa']);
    const pairs = diffPairs(repo);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.change).toBe('modified');
    expect(pairs[0]?.before).toEqual(['dòng một']);
    expect(pairs[0]?.after).toEqual(['đã sửa']);
  });

  it('`--staged` so index với HEAD', () => {
    let repo = repoWithCommit();
    repo = ok(gitAdd(writeFile(repo, 'b.txt', ['b']), ['b.txt']));

    expect(diffPairs(repo, { staged: true }).map((pair) => pair.path)).toEqual(['b.txt']);
    // Cùng lúc đó, trục worktree↔index không thấy gì cả.
    expect(diffPairs(repo, { staged: false })).toEqual([]);
  });

  it('file chưa track KHÔNG lọt vào diff', () => {
    const repo = writeFile(repoWithCommit(), 'la.txt', ['lạ']);
    expect(diffPairs(repo)).toEqual([]);
  });

  it('file bị xoá khỏi worktree hiện ra là `deleted`', () => {
    const repo = removeFile(repoWithCommit(), 'a.txt');
    const pairs = diffPairs(repo);
    expect(pairs[0]?.change).toBe('deleted');
    expect(pairs[0]?.after).toEqual([]);
  });

  it('header do engine in, thân do `diff.ts` in — đúng ranh giới hai lane', () => {
    const repo = writeFile(repoWithCommit(), 'a.txt', ['đã sửa']);
    const out = text(gitDiff(repo));

    // Ba dòng này CHỈ engine in được: chỉ nó biết đường dẫn.
    expect(out).toContain('diff --git a/a.txt b/a.txt');
    expect(out).toContain('--- a/a.txt');
    expect(out).toContain('+++ b/a.txt');
    // Thân là của `diff.ts`: đầu hunk `@@` và hai dòng có dấu.
    expect(out).toContain('@@');
    expect(out).toContain('-dòng một');
    expect(out).toContain('+đã sửa');
  });

  it('file mới in `--- /dev/null`, file bị xoá in `+++ /dev/null`', () => {
    const added = ok(gitAdd(writeFile(repoWithCommit(), 'b.txt', ['b']), ['b.txt']));
    expect(text(gitDiff(added, { staged: true }))).toContain('--- /dev/null');

    const deleted = removeFile(repoWithCommit(), 'a.txt');
    expect(text(gitDiff(deleted))).toContain('+++ /dev/null');
  });

  it('lọc theo đường dẫn', () => {
    let repo = repoWithCommit();
    repo = ok(gitAdd(withFiles(repo, { 'b.txt': ['b'] }), ['b.txt']));
    repo = withFiles(repo, { 'a.txt': ['a sửa'], 'b.txt': ['b sửa'] });
    expect(diffPairs(repo, { paths: ['b.txt'] }).map((pair) => pair.path)).toEqual(['b.txt']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// git checkout -- <đường-dẫn>
// ═══════════════════════════════════════════════════════════════════════════

describe('gitCheckoutPaths', () => {
  it('không có ref ⇒ lấy lại từ index, index không đổi', () => {
    const committed = repoWithCommit();
    const dirty = writeFile(committed, 'a.txt', ['lỡ tay sửa']);
    const result = gitCheckoutPaths(dirty, { paths: ['a.txt'] });
    const next = ok(result);

    expect(next.worktree['a.txt']).toEqual(['dòng một']);
    expect(next.index).toEqual(dirty.index);
    expect(text(result)).toContain('KHÔNG cứu lại được');
  });

  it('có ref ⇒ ghi vào CẢ index lẫn worktree', () => {
    let repo = repoWithCommit();
    const firstOid = need(headOid(repo), 'HEAD');
    repo = ok(gitAdd(writeFile(repo, 'a.txt', ['bản hai']), ['a.txt']));
    repo = ok(gitCommit(repo, { message: 'c2', logicalTime: 2, author: 'Bạn' }));

    const next = ok(gitCheckoutPaths(repo, { paths: ['a.txt'], rev: firstOid }));
    expect(next.worktree['a.txt']).toEqual(['dòng một']);
    expect(indexContents(next)['a.txt']).toEqual(['dòng một']);
  });

  it('đường dẫn không có trong nguồn ⇒ path-not-found, repo không đổi', () => {
    const repo = repoWithCommit();
    const result = gitCheckoutPaths(repo, { paths: ['khong-co.txt'] });
    expect(result.error?.code).toBe('path-not-found');
    expect(result.repo).toBe(repo);
  });

  it('ref không phân giải được ⇒ lỗi từ tầng phân giải, repo không đổi', () => {
    const repo = repoWithCommit();
    const result = gitCheckoutPaths(repo, { paths: ['a.txt'], rev: 'khong-co' });
    expect(result.error?.code).toBe('not-a-ref');
    expect(result.repo).toBe(repo);
  });

  it('không đường dẫn nào ⇒ bad-usage', () => {
    const repo = repoWithCommit();
    expect(gitCheckoutPaths(repo, { paths: [] }).error?.code).toBe('bad-usage');
  });
});
