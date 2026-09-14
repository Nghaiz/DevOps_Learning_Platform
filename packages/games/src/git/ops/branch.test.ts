import { describe, expect, it } from 'vitest';
import type { OutputLine, Repo, RepoOpResult } from '../contract.ts';
import { hasObject } from '../objects.ts';
import {
  branchRef,
  emptyRepo,
  headOid,
  isDetached,
  readReflog,
  removeFile,
  tagRef,
  writeFile,
} from '../repo.ts';
import { gitAdd, gitCommit, indexContents } from './basic.ts';
import { gitBranch, gitCheckout, gitSwitch, gitTag } from './branch.ts';

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

/** `main` với một commit: `a.txt` = ['một']. */
function baseRepo(): Repo {
  const staged = ok(gitAdd(writeFile(emptyRepo(), 'a.txt', ['một']), ['a.txt']));
  return ok(gitCommit(staged, { message: 'c1', logicalTime: 1, author: 'Bạn' }));
}

/**
 * `main` (c1) và `feature` (c1 → c2). HEAD đứng trên `main`.
 *
 * c2 vừa SỬA `a.txt` vừa THÊM `b.txt`, nên tree của hai branch khác nhau ở cả
 * hai kiểu — đó là điều kiện để phép kiểm "worktree bẩn" và phép kiểm "đè lên
 * file chưa track" đều có chỗ kích hoạt.
 */
function twoBranches(): Repo {
  let repo = baseRepo();
  repo = ok(gitBranch(repo, { names: ['feature'], logicalTime: 2 }));
  repo = ok(gitSwitch(repo, { target: 'feature', logicalTime: 3 }));
  repo = writeFile(repo, 'a.txt', ['hai']);
  repo = writeFile(repo, 'b.txt', ['b của feature']);
  repo = ok(gitAdd(repo, ['.']));
  repo = ok(gitCommit(repo, { message: 'c2', logicalTime: 4, author: 'Bạn' }));
  return ok(gitSwitch(repo, { target: 'main', logicalTime: 5 }));
}

// ═══════════════════════════════════════════════════════════════════════════
// git branch
// ═══════════════════════════════════════════════════════════════════════════

describe('gitBranch — liệt kê', () => {
  it('repo chưa có commit nào thì chưa có branch nào', () => {
    const result = gitBranch(emptyRepo(), { logicalTime: 1 });
    expect(result.error).toBeNull();
    expect(text(result)).toContain('Chưa có branch nào');
    expect(text(result)).toContain('chỉ ra đời cùng commit đầu tiên');
  });

  it('đánh dấu `*` vào branch HEAD đang bám', () => {
    const out = text(gitBranch(twoBranches(), { logicalTime: 6 }));
    expect(out).toMatch(/\* main/);
    expect(out).toMatch(/ {2}feature/);
  });
});

describe('gitBranch — tạo', () => {
  it('tạo branch KHÔNG sao chép gì và KHÔNG dời HEAD', () => {
    const before = baseRepo();
    const result = gitBranch(before, { names: ['feature'], logicalTime: 2 });
    const next = ok(result);

    expect(next.refs[branchRef('feature')]).toBe(headOid(before));
    expect(next.head).toEqual(before.head);
    expect(next.worktree).toEqual(before.worktree);
    expect(text(result)).toContain('KHÔNG sao chép');
  });

  it('tạo tại một điểm bắt đầu khác', () => {
    let repo = baseRepo();
    const firstOid = need(headOid(repo), 'c1');
    repo = ok(gitAdd(writeFile(repo, 'a.txt', ['hai']), ['a.txt']));
    repo = ok(gitCommit(repo, { message: 'c2', logicalTime: 2, author: 'Bạn' }));

    const next = ok(gitBranch(repo, { names: ['cu', 'HEAD~1'], logicalTime: 3 }));
    expect(next.refs[branchRef('cu')]).toBe(firstOid);
    expect(next.refs[branchRef('main')]).not.toBe(firstOid);
  });

  it('trùng tên ⇒ branch-exists, repo không đổi', () => {
    const repo = twoBranches();
    const result = gitBranch(repo, { names: ['feature'], logicalTime: 6 });
    expect(result.error?.code).toBe('branch-exists');
    expect(result.repo).toBe(repo);
  });

  it('tạo branch khi chưa có commit nào ⇒ lỗi nói ra rằng repo chưa có ref nào', () => {
    const result = gitBranch(emptyRepo(), { names: ['feature'], logicalTime: 1 });
    expect(result.error?.code).toBe('not-a-ref');
    expect(result.error?.explain).toContain('chưa có ref nào');
  });
});

describe('gitBranch — xoá', () => {
  it('`-d` từ chối branch chưa merge, `-D` thì làm', () => {
    const repo = twoBranches();
    const refused = gitBranch(repo, { names: ['feature'], delete: true, logicalTime: 6 });
    expect(refused.error).not.toBeNull();
    expect(refused.error?.suggest).toContain('git branch -D feature');
    expect(refused.repo).toBe(repo);

    const forced = ok(
      gitBranch(repo, { names: ['feature'], delete: true, force: true, logicalTime: 6 }),
    );
    expect(Object.hasOwn(forced.refs, branchRef('feature'))).toBe(false);
  });

  it('xoá branch cũng xoá reflog RIÊNG của nó, nhưng reflog của HEAD giữ đường về (bài G27)', () => {
    const repo = twoBranches();
    const lostOid = need(repo.refs[branchRef('feature')], 'feature');

    const forced = ok(
      gitBranch(repo, { names: ['feature'], delete: true, force: true, logicalTime: 6 }),
    );

    // Đúng như git thật: `git reflog feature` sau khi xoá không còn gì.
    expect(readReflog(forced, branchRef('feature'))).toEqual([]);

    // Đường cứu thật: HEAD đã từng trỏ vào commit đó lúc còn đứng trên branch.
    expect(readReflog(forced, 'HEAD').map((entry) => entry.to)).toContain(lostOid);

    // Và commit vẫn nằm trong kho, chỉ mất chỗ trỏ tới — đó mới là bất biến.
    expect(hasObject(forced.objects, lostOid)).toBe(true);
  });

  it('xoá branch đang đứng trên ⇒ branch-checked-out', () => {
    const repo = twoBranches();
    const result = gitBranch(repo, {
      names: ['main'],
      delete: true,
      force: true,
      logicalTime: 6,
    });
    expect(result.error?.code).toBe('branch-checked-out');
    expect(result.repo).toBe(repo);
  });

  it('branch đã merge thì `-d` không cần `-f`', () => {
    const repo = ok(gitBranch(baseRepo(), { names: ['cung-cho'], logicalTime: 2 }));
    const next = ok(gitBranch(repo, { names: ['cung-cho'], delete: true, logicalTime: 3 }));
    expect(Object.hasOwn(next.refs, branchRef('cung-cho'))).toBe(false);
  });

  it('một tên hỏng trong danh sách ⇒ KHÔNG xoá cái nào', () => {
    const repo = twoBranches();
    const result = gitBranch(repo, {
      names: ['feature', 'khong-co'],
      delete: true,
      force: true,
      logicalTime: 6,
    });
    expect(result.error?.code).toBe('not-a-ref');
    expect(result.repo).toBe(repo);
  });
});

describe('gitBranch — đổi tên', () => {
  it('đổi tên branch đang đứng trên thì HEAD đi theo', () => {
    const next = ok(gitBranch(baseRepo(), { names: ['chinh'], move: true, logicalTime: 2 }));
    expect(next.head).toEqual({ type: 'ref', ref: branchRef('chinh') });
    expect(Object.hasOwn(next.refs, branchRef('main'))).toBe(false);
  });

  it('đổi tên một branch khác, hai tham số', () => {
    const repo = twoBranches();
    const next = ok(gitBranch(repo, { names: ['feature', 'tinh-nang'], move: true, logicalTime: 6 }));
    expect(next.refs[branchRef('tinh-nang')]).toBe(repo.refs[branchRef('feature')]);
    expect(Object.hasOwn(next.refs, branchRef('feature'))).toBe(false);
    expect(next.head).toEqual(repo.head);
  });

  it('tên mới đã tồn tại ⇒ branch-exists', () => {
    const repo = twoBranches();
    const result = gitBranch(repo, { names: ['feature', 'main'], move: true, logicalTime: 6 });
    expect(result.error?.code).toBe('branch-exists');
    expect(result.repo).toBe(repo);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// git switch
// ═══════════════════════════════════════════════════════════════════════════

describe('gitSwitch', () => {
  it('chuyển branch thì nạp lại CẢ worktree lẫn index từ commit đích', () => {
    const next = ok(gitSwitch(twoBranches(), { target: 'feature', logicalTime: 6 }));
    expect(next.worktree['a.txt']).toEqual(['hai']);
    expect(next.worktree['b.txt']).toEqual(['b của feature']);
    expect(indexContents(next)['b.txt']).toEqual(['b của feature']);
    expect(next.head).toEqual({ type: 'ref', ref: branchRef('feature') });
  });

  it('chuyển về branch không có file đó thì file biến khỏi worktree', () => {
    let repo = ok(gitSwitch(twoBranches(), { target: 'feature', logicalTime: 6 }));
    repo = ok(gitSwitch(repo, { target: 'main', logicalTime: 7 }));
    expect(Object.hasOwn(repo.worktree, 'b.txt')).toBe(false);
    expect(Object.hasOwn(repo.index, 'b.txt')).toBe(false);
  });

  it('worktree bẩn ⇒ CHẶN, và thông báo nói ra `stash`', () => {
    const repo = writeFile(twoBranches(), 'a.txt', ['đang sửa dở']);
    const result = gitSwitch(repo, { target: 'feature', logicalTime: 6 });

    expect(result.error).not.toBeNull();
    expect(result.error?.suggest).toContain('stash');
    expect(result.repo).toBe(repo);
    expect(result.repo.worktree['a.txt']).toEqual(['đang sửa dở']);
  });

  it('index bẩn cũng chặn', () => {
    const dirty = ok(gitAdd(writeFile(twoBranches(), 'a.txt', ['đang sửa dở']), ['a.txt']));
    const result = gitSwitch(dirty, { target: 'feature', logicalTime: 6 });
    expect(result.error).not.toBeNull();
    expect(result.repo).toBe(dirty);
  });

  it('`-c` vẫn chạy được với worktree bẩn — branch mới cùng tree nên không mất gì', () => {
    const repo = writeFile(twoBranches(), 'a.txt', ['đang làm dở']);
    const next = ok(gitSwitch(repo, { create: 'wip', logicalTime: 6 }));

    expect(next.head).toEqual({ type: 'ref', ref: branchRef('wip') });
    expect(next.worktree['a.txt']).toEqual(['đang làm dở']);
  });

  it('file chưa track sống sót qua lần chuyển branch', () => {
    const repo = writeFile(twoBranches(), 'ghi-chu.txt', ['ghi chú riêng']);
    const next = ok(gitSwitch(repo, { target: 'feature', logicalTime: 6 }));
    expect(next.worktree['ghi-chu.txt']).toEqual(['ghi chú riêng']);
    expect(next.worktree['a.txt']).toEqual(['hai']);
  });

  it('file chưa track sẽ bị đè ⇒ CHẶN thay vì im lặng ghi đè', () => {
    const repo = writeFile(twoBranches(), 'b.txt', ['bản nháp của tôi']);
    const result = gitSwitch(repo, { target: 'feature', logicalTime: 6 });
    expect(result.error).not.toBeNull();
    expect(result.error?.message).toContain('b.txt');
    expect(result.repo).toBe(repo);
  });

  it('đích không phải branch ⇒ từ chối và chỉ sang `--detach` (bài G05)', () => {
    const repo = twoBranches();
    const oid = need(headOid(repo), 'HEAD');
    const result = gitSwitch(repo, { target: oid, logicalTime: 6 });

    expect(result.error?.code).toBe('bad-usage');
    expect(result.error?.suggest).toContain('--detach');
    expect(result.repo).toBe(repo);
  });

  it('`--detach` thì làm, kèm cảnh báo giải thích', () => {
    const repo = twoBranches();
    const oid = need(headOid(repo), 'HEAD');
    const result = gitSwitch(repo, { target: oid, detach: true, logicalTime: 6 });
    const next = ok(result);

    expect(isDetached(next)).toBe(true);
    expect(text(result)).toContain('không thuộc branch nào');
  });

  it('branch chưa có ⇒ gợi ý tạo luôn bằng `-c`', () => {
    const repo = twoBranches();
    const result = gitSwitch(repo, { target: 'chua-co', logicalTime: 6 });
    expect(result.error?.suggest).toContain('git switch -c chua-co');
  });

  it('không đích và không `-c` ⇒ bad-usage', () => {
    expect(gitSwitch(twoBranches(), { logicalTime: 6 }).error?.code).toBe('bad-usage');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// git checkout <ref>
// ═══════════════════════════════════════════════════════════════════════════

describe('gitCheckout', () => {
  it('checkout một Oid ⇒ detached HEAD kèm cảnh báo', () => {
    const repo = twoBranches();
    const oid = need(headOid(repo), 'HEAD');
    const result = gitCheckout(repo, { target: oid, logicalTime: 6 });
    const next = ok(result);

    expect(isDetached(next)).toBe(true);
    expect(next.head).toEqual({ type: 'detached', oid });
    expect(text(result)).toContain('không thuộc branch nào');
    // ⚠ Cảnh báo đi ra bằng output, KHÔNG bằng `error` — vì trạng thái ĐÃ đổi.
    expect(result.error).toBeNull();
  });

  it('checkout `main~1` detach dù `main` là branch — hậu tố xoá ref', () => {
    let repo = baseRepo();
    repo = ok(gitAdd(writeFile(repo, 'a.txt', ['hai']), ['a.txt']));
    repo = ok(gitCommit(repo, { message: 'c2', logicalTime: 2, author: 'Bạn' }));

    const next = ok(gitCheckout(repo, { target: 'main~1', logicalTime: 3 }));
    expect(isDetached(next)).toBe(true);
    expect(next.worktree['a.txt']).toEqual(['một']);
  });

  it('checkout tên branch thì bám vào branch, không detach', () => {
    const next = ok(gitCheckout(twoBranches(), { target: 'feature', logicalTime: 6 }));
    expect(isDetached(next)).toBe(false);
    expect(next.head).toEqual({ type: 'ref', ref: branchRef('feature') });
  });

  it('`-b` tạo rồi chuyển sang', () => {
    const next = ok(gitCheckout(baseRepo(), { createBranch: 'feature', logicalTime: 2 }));
    expect(next.head).toEqual({ type: 'ref', ref: branchRef('feature') });
  });

  it('ref không có ⇒ lỗi có gợi ý tên gần đúng, repo không đổi', () => {
    const repo = twoBranches();
    const result = gitCheckout(repo, { target: 'mian', logicalTime: 6 });
    expect(result.error?.code).toBe('not-a-ref');
    expect(result.error?.suggest).toContain('main');
    expect(result.repo).toBe(repo);
  });

  it('worktree có file bị xoá cũng là bẩn ⇒ chặn', () => {
    const repo = removeFile(twoBranches(), 'a.txt');
    const result = gitCheckout(repo, { target: 'feature', logicalTime: 6 });
    expect(result.error).not.toBeNull();
    expect(result.repo).toBe(repo);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// git tag
// ═══════════════════════════════════════════════════════════════════════════

describe('gitTag', () => {
  it('gắn vào HEAD khi không nêu ref', () => {
    const repo = baseRepo();
    const result = gitTag(repo, { names: ['v1.0'], logicalTime: 2 });
    const next = ok(result);

    expect(next.refs[tagRef('v1.0')]).toBe(headOid(repo));
    expect(text(result)).toContain('KHÔNG tự dời');
  });

  it('gắn vào một ref nêu tên', () => {
    let repo = baseRepo();
    const firstOid = need(headOid(repo), 'HEAD');
    repo = ok(gitAdd(writeFile(repo, 'a.txt', ['hai']), ['a.txt']));
    repo = ok(gitCommit(repo, { message: 'c2', logicalTime: 2, author: 'Bạn' }));

    const next = ok(gitTag(repo, { names: ['v0.1', 'HEAD~1'], logicalTime: 3 }));
    expect(next.refs[tagRef('v0.1')]).toBe(firstOid);
  });

  it('liệt kê', () => {
    const repo = ok(gitTag(baseRepo(), { names: ['v1.0'], logicalTime: 2 }));
    expect(text(gitTag(repo, { list: true, logicalTime: 3 }))).toContain('v1.0');
    expect(text(gitTag(baseRepo(), { logicalTime: 2 }))).toContain('Chưa có tag nào');
  });

  it('xoá tag không đụng tới commit', () => {
    const repo = ok(gitTag(baseRepo(), { names: ['v1.0'], logicalTime: 2 }));
    const oid = need(headOid(repo), 'HEAD');
    const next = ok(gitTag(repo, { names: ['v1.0'], delete: true, logicalTime: 3 }));

    expect(Object.hasOwn(next.refs, tagRef('v1.0'))).toBe(false);
    expect(hasObject(next.objects, oid)).toBe(true);
  });

  it('xoá tag không có ⇒ not-a-ref, repo không đổi', () => {
    const repo = baseRepo();
    const result = gitTag(repo, { names: ['khong-co'], delete: true, logicalTime: 2 });
    expect(result.error?.code).toBe('not-a-ref');
    expect(result.repo).toBe(repo);
  });

  it('trùng tên tag ⇒ từ chối thay vì im lặng dời con trỏ', () => {
    const repo = ok(gitTag(baseRepo(), { names: ['v1.0'], logicalTime: 2 }));
    const result = gitTag(repo, { names: ['v1.0'], logicalTime: 3 });
    expect(result.error).not.toBeNull();
    expect(result.error?.message).toContain('tag');
    expect(result.repo).toBe(repo);
  });

  it('`-a` được nhận nhưng nói thẳng rằng game chỉ có tag nhẹ', () => {
    const result = gitTag(baseRepo(), {
      names: ['v1.0'],
      annotate: true,
      message: 'bản phát hành đầu',
      logicalTime: 2,
    });
    expect(result.error).toBeNull();
    expect(text(result)).toContain('tag NHẸ');
  });
});
