import { describe, expect, it } from 'vitest';
import type { Oid, Repo } from './contract.ts';
import { writeCommit, writeContents } from './objects.ts';
import { branchRef, emptyRepo, remoteRef, setRef, tagRef } from './repo.ts';
import {
  commitOidsWithPrefix,
  knownRefNames,
  resolveRevision,
  revisionError,
} from './refs-resolve.ts';

/**
 * `noUncheckedIndexedAccess` bật nên `array[i]` luôn là `T | undefined`, và
 * `no-non-null-assertion` của tseslint cấm `!`. Hàm này là đường thoát duy nhất
 * còn lại và nó tốt hơn `!` thật: một fixture hỏng thì ném lỗi NÊU TÊN thứ
 * thiếu, thay vì đỏ ở một dòng `expect` cách đó ba chục dòng.
 */
function need<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`fixture thiếu ${what}`);
  return value;
}

function addCommit(
  repo: Repo,
  parents: readonly Oid[],
  message: string,
  logicalTime: number,
): readonly [Repo, Oid] {
  const [withTree, tree] = writeContents(repo.objects, { 'a.txt': [message] });
  const [withCommit, oid] = writeCommit(withTree, {
    tree,
    parents,
    message,
    author: 'Bạn',
    logicalTime,
  });
  return [{ ...repo, objects: withCommit }, oid];
}

/** `c1 → c2 → c3 → c4`, `main` trỏ vào c4. */
function linearRepo(): { readonly repo: Repo; readonly oids: readonly Oid[] } {
  let repo = emptyRepo();
  const oids: Oid[] = [];
  let parent: Oid | null = null;
  for (let index = 1; index <= 4; index += 1) {
    const [next, oid] = addCommit(repo, parent === null ? [] : [parent], `c${String(index)}`, index);
    repo = next;
    oids.push(oid);
    parent = oid;
  }
  const tip = need(oids[oids.length - 1], 'commit cuối');
  repo = setRef(repo, branchRef('main'), tip, { op: 'commit', message: 'c4', logicalTime: 4 });
  return { repo, oids };
}

/**
 * Lịch sử có một commit merge:
 *
 * ```
 *   base ── ours ──┐
 *     └── theirs ──┴── merge   (main)
 * ```
 *
 * `merge^1` = ours, `merge^2` = theirs, `merge~1` = ours (cha THỨ NHẤT).
 * Đây là hình duy nhất phân biệt được `~` với `^`, nên nó là fixture của bài G06.
 */
function mergeRepo(): {
  readonly repo: Repo;
  readonly base: Oid;
  readonly ours: Oid;
  readonly theirs: Oid;
  readonly merge: Oid;
} {
  let repo = emptyRepo();
  const [r1, base] = addCommit(repo, [], 'base', 1);
  const [r2, ours] = addCommit(r1, [base], 'ours', 2);
  const [r3, theirs] = addCommit(r2, [base], 'theirs', 3);
  const [r4, merge] = addCommit(r3, [ours, theirs], 'merge', 4);
  repo = setRef(r4, branchRef('main'), merge, { op: 'merge', message: 'merge', logicalTime: 4 });
  return { repo, base, ours, theirs, merge };
}

describe('resolveRevision — chín dạng đầu vào', () => {
  it('HEAD trỏ vào commit của branch đang bám, và giữ lại tên ref đó', () => {
    const { repo, oids } = linearRepo();
    const resolved = resolveRevision(repo, 'HEAD');
    expect(resolved).toEqual({ ok: true, oid: oids[3], ref: 'refs/heads/main' });
  });

  it('`@` là bí danh của HEAD', () => {
    const { repo } = linearRepo();
    expect(resolveRevision(repo, '@')).toEqual(resolveRevision(repo, 'HEAD'));
  });

  it('tên branch ngắn', () => {
    const { repo, oids } = linearRepo();
    expect(resolveRevision(repo, 'main')).toEqual({
      ok: true,
      oid: oids[3],
      ref: 'refs/heads/main',
    });
  });

  it('ref theo dõi `origin/main` là MỘT ref, không phải hai token', () => {
    const base = linearRepo();
    const target = need(base.oids[1], 'c2');
    const repo = setRef(base.repo, remoteRef('origin/main'), target, {
      op: 'fetch',
      message: 'từ origin',
      logicalTime: 5,
    });
    expect(resolveRevision(repo, 'origin/main')).toEqual({
      ok: true,
      oid: target,
      ref: 'refs/remotes/origin/main',
    });
  });

  it('tag', () => {
    const base = linearRepo();
    const target = need(base.oids[0], 'c1');
    const repo = setRef(base.repo, tagRef('v1.0'), target, {
      op: 'tag',
      message: 'gắn v1.0',
      logicalTime: 5,
    });
    expect(resolveRevision(repo, 'v1.0')).toEqual({
      ok: true,
      oid: target,
      ref: 'refs/tags/v1.0',
    });
  });

  it('Oid đầy đủ 16 hex — không có ref nào được nêu tên', () => {
    const { repo, oids } = linearRepo();
    const target = need(oids[2], 'c3');
    expect(target).toHaveLength(16);
    expect(resolveRevision(repo, target)).toEqual({ ok: true, oid: target, ref: null });
  });

  it('Oid rút gọn 7 hex', () => {
    const { repo, oids } = linearRepo();
    const target = need(oids[2], 'c3');
    expect(resolveRevision(repo, target.slice(0, 7))).toEqual({
      ok: true,
      oid: target,
      ref: null,
    });
  });

  it('Oid rút gọn dưới 4 hex KHÔNG được nhận — tên branch ngắn phải sống được', () => {
    const { repo, oids } = linearRepo();
    const target = need(oids[2], 'c3');
    expect(resolveRevision(repo, target.slice(0, 3))).toEqual({ ok: false, reason: 'not-found' });
  });

  it('`HEAD~3` lùi ba bước theo cha thứ nhất', () => {
    const { repo, oids } = linearRepo();
    expect(resolveRevision(repo, 'HEAD~3')).toEqual({ ok: true, oid: oids[0], ref: null });
  });

  it('`main~2`', () => {
    const { repo, oids } = linearRepo();
    expect(resolveRevision(repo, 'main~2')).toEqual({ ok: true, oid: oids[1], ref: null });
  });

  it('`HEAD^` không có số nghĩa là cha thứ nhất', () => {
    const { repo, oids } = linearRepo();
    expect(resolveRevision(repo, 'HEAD^')).toEqual({ ok: true, oid: oids[2], ref: null });
  });

  it('`HEAD~~` bằng `HEAD~1~1`', () => {
    const { repo } = linearRepo();
    expect(resolveRevision(repo, 'HEAD~~')).toEqual(resolveRevision(repo, 'HEAD~2'));
  });
});

describe('resolveRevision — `~` KHÁC `^` trên commit merge (bài G06)', () => {
  it('`^2` chọn cha thứ hai, `~1` đi theo cha thứ nhất', () => {
    const { repo, ours, theirs } = mergeRepo();
    expect(resolveRevision(repo, 'HEAD^2')).toEqual({ ok: true, oid: theirs, ref: null });
    expect(resolveRevision(repo, 'HEAD~1')).toEqual({ ok: true, oid: ours, ref: null });
    expect(resolveRevision(repo, 'HEAD^1')).toEqual({ ok: true, oid: ours, ref: null });
  });

  it('`HEAD~2^2` — kết hợp hai phép, đối chiếu với Oid lấy từ fixture', () => {
    const { repo: merged, merge, ours, theirs } = mergeRepo();
    // Thêm hai commit lên trên merge để `HEAD~2` rơi đúng vào commit merge.
    const [r1, next1] = addCommit(merged, [merge], 'sau merge 1', 5);
    const [r2, next2] = addCommit(r1, [next1], 'sau merge 2', 6);
    const repo = setRef(r2, branchRef('main'), next2, {
      op: 'commit',
      message: 'sau merge 2',
      logicalTime: 6,
    });

    expect(resolveRevision(repo, 'HEAD~2')).toEqual({ ok: true, oid: merge, ref: null });
    expect(resolveRevision(repo, 'HEAD~2^2')).toEqual({ ok: true, oid: theirs, ref: null });
    expect(resolveRevision(repo, 'HEAD~2^1')).toEqual({ ok: true, oid: ours, ref: null });
  });

  it('`^0` là chính commit đó', () => {
    const { repo, merge } = mergeRepo();
    expect(resolveRevision(repo, 'HEAD^0')).toEqual({ ok: true, oid: merge, ref: null });
  });

  it('`^3` trên commit chỉ có hai cha là không tìm thấy', () => {
    const { repo } = mergeRepo();
    expect(resolveRevision(repo, 'HEAD^3')).toEqual({ ok: false, reason: 'not-found' });
  });
});

describe('resolveRevision — hậu tố xoá `ref` về null', () => {
  it('`main` giữ ref, `main~1` thì không — đây là chỗ checkout quyết định detach hay không', () => {
    const { repo } = linearRepo();
    const attached = resolveRevision(repo, 'main');
    const detachedish = resolveRevision(repo, 'main~1');
    expect(attached.ok && attached.ref).toBe('refs/heads/main');
    expect(detachedish.ok && detachedish.ref).toBeNull();
  });

  it('HEAD tách rời thì `ref` là null', () => {
    const { repo, oids } = linearRepo();
    const target = need(oids[2], 'c3');
    const detached: Repo = { ...repo, head: { type: 'detached', oid: target } };
    expect(resolveRevision(detached, 'HEAD')).toEqual({ ok: true, oid: target, ref: null });
  });
});

describe('resolveRevision — branch thắng tag khi trùng tên', () => {
  it('chọn branch, không chọn tag (cố tình khác git thật)', () => {
    const { repo, oids } = linearRepo();
    const branchTip = need(oids[3], 'c4');
    const tagTarget = need(oids[0], 'c1');
    const withTag = setRef(repo, tagRef('main'), tagTarget, {
      op: 'tag',
      message: 'tag trùng tên branch',
      logicalTime: 5,
    });
    expect(resolveRevision(withTag, 'main')).toEqual({
      ok: true,
      oid: branchTip,
      ref: 'refs/heads/main',
    });
  });
});

describe('resolveRevision — ba lý do hỏng', () => {
  it('not-found: tên không có thật', () => {
    const { repo } = linearRepo();
    expect(resolveRevision(repo, 'khong-ton-tai')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('not-found: HEAD trên branch chưa sinh ra', () => {
    expect(resolveRevision(emptyRepo(), 'HEAD')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('not-found: lùi quá gốc lịch sử', () => {
    const { repo } = linearRepo();
    expect(resolveRevision(repo, 'HEAD~99')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('bad-syntax: ký tự lạ trong hậu tố, base rỗng, chuỗi rỗng', () => {
    const { repo } = linearRepo();
    expect(resolveRevision(repo, 'HEAD~a')).toEqual({ ok: false, reason: 'bad-syntax' });
    expect(resolveRevision(repo, '~2')).toEqual({ ok: false, reason: 'bad-syntax' });
    expect(resolveRevision(repo, '')).toEqual({ ok: false, reason: 'bad-syntax' });
    expect(resolveRevision(repo, '   ')).toEqual({ ok: false, reason: 'bad-syntax' });
  });

  it('ambiguous: hai commit cùng tiền tố 4 hex', () => {
    const { repo, prefix, matches } = collidingRepo();
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(resolveRevision(repo, prefix)).toEqual({ ok: false, reason: 'ambiguous' });
    // …và gõ thêm ký tự thì hết mơ hồ. Không có vế này thì thông báo "gõ dài
    // hơn đi" chỉ là một lời khuyên chưa ai kiểm chứng.
    const longer = need(matches[0], 'commit đụng độ');
    expect(resolveRevision(repo, longer)).toEqual({ ok: true, oid: longer, ref: null });
  });
});

/**
 * Repo chứa hai commit có 4 hex đầu trùng nhau.
 *
 * Dựng bằng vòng lặp chứ không ghim sẵn hai Oid: Oid phụ thuộc phép băm ở
 * `hash.ts`, nên một hằng số chép tay sẽ mục ngay lần đầu ai đó đụng vào phép
 * serialize. Vòng lặp thì tự tìm lại. Với 65536 rổ, xác suất chưa đụng độ sau
 * 3000 lượt là dưới 10^-27 — nhưng vẫn ném lỗi rõ ràng thay vì treo im lặng.
 */
interface CollidingFixture {
  readonly repo: Repo;
  readonly prefix: string;
  readonly matches: readonly Oid[];
}

/**
 * Nhớ lại kết quả giữa các ô.
 *
 * ⚠ Dựng cái này KHÔNG rẻ: mỗi `addCommit` trả một `Repo` MỚI, tức copy cả
 * object store, nên vòng lặp là O(n²) theo số commit — và tới lúc đụng độ 4 hex
 * thì n đã vài trăm. Hai ô dùng fixture này; gọi hai lần là trả giá hai lần.
 *
 * Đo được 2026-09-14: chạy riêng thì hai ô mất 8,7s và 6,3s, còn dưới tải song
 * song của `turbo` thì CẢ HAI vượt trần 5000ms và làm cổng toàn cây đỏ — trong
 * khi chạy một mình vẫn xanh. Đúng họ lỗi `turbo-parallel-load-times-out-io-tests`.
 *
 * Nhớ lại thì rẻ và KHÔNG đổi ngữ nghĩa: fixture thuần tất định (Oid sinh từ nội
 * dung, không có đồng hồ, không có ngẫu nhiên), nên lượt thứ hai nhận đúng cây
 * mà lượt đầu dựng ra.
 */
let collidingCache: CollidingFixture | null = null;

function collidingRepo(): CollidingFixture {
  if (collidingCache !== null) return collidingCache;
  collidingCache = buildCollidingRepo();
  return collidingCache;
}

function buildCollidingRepo(): CollidingFixture {
  let repo = emptyRepo();
  const seen: Record<string, Oid> = {};
  for (let index = 0; index < 3000; index += 1) {
    const [next, oid] = addCommit(repo, [], `đụng độ ${String(index)}`, index + 1);
    repo = next;
    const prefix = oid.slice(0, 4);
    const earlier = seen[prefix];
    if (earlier !== undefined && earlier !== oid) {
      return { repo, prefix, matches: commitOidsWithPrefix(repo, prefix) };
    }
    seen[prefix] = oid;
  }
  throw new Error('không dựng được cặp Oid trùng 4 hex đầu sau 3000 lượt');
}

describe('knownRefNames', () => {
  it('trả dạng ngắn, có HEAD, đã sắp, không lặp', () => {
    const base = linearRepo();
    const tip = need(base.oids[3], 'c4');
    let repo = setRef(base.repo, branchRef('feature'), tip, {
      op: 'branch',
      message: 'tạo',
      logicalTime: 5,
    });
    repo = setRef(repo, tagRef('v1'), tip, { op: 'tag', message: 'gắn', logicalTime: 6 });
    repo = setRef(repo, remoteRef('origin/main'), tip, {
      op: 'fetch',
      message: 'từ origin',
      logicalTime: 7,
    });
    expect(knownRefNames(repo)).toEqual(['HEAD', 'feature', 'main', 'origin/main', 'v1']);
  });

  it('repo chưa commit lần nào thì KHÔNG liệt kê HEAD — HEAD chưa trỏ vào đâu cả', () => {
    expect(knownRefNames(emptyRepo())).toEqual([]);
    // Và nhờ vậy `notARefError` còn nói được câu giải thích tốt nhất của nó.
    expect(revisionError(emptyRepo(), 'main', 'not-found', 'Ngữ cảnh.').explain).toContain(
      'chưa có ref nào',
    );
  });
});

describe('revisionError — ba phần, ba lý do', () => {
  it('not-found nêu được tên gần đúng', () => {
    const { repo } = linearRepo();
    const error = revisionError(repo, 'mian', 'not-found', 'Ngữ cảnh.');
    expect(error.code).toBe('not-a-ref');
    expect(error.suggest).toContain('main');
    expect(error.explain).toContain('Ngữ cảnh.');
  });

  it('ambiguous liệt kê đúng các ứng viên', () => {
    const { repo, prefix, matches } = collidingRepo();
    const error = revisionError(repo, prefix, 'ambiguous', 'Ngữ cảnh.');
    expect(error.code).toBe('not-a-commit');
    for (const oid of matches) expect(error.explain).toContain(oid);
    expect(error.suggest).toContain('thêm');
  });

  it('bad-syntax giải thích `~` và `^`', () => {
    const { repo } = linearRepo();
    const error = revisionError(repo, 'HEAD~a', 'bad-syntax', 'Ngữ cảnh.');
    expect(error.code).toBe('bad-usage');
    expect(error.explain).toContain('cha THỨ NHẤT');
    expect(error.explain).toContain('cha THỨ n');
  });
});
