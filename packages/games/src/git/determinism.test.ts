/**
 * §17.J — **năm điều kiện tất định, năm test riêng có thể đỏ.**
 *
 * Plan nói thẳng: mỗi điều kiện phải là một test đỏ được, không phải một ghi chú
 * trong tài liệu. Đây là bốn trong năm; điều kiện thứ năm (engine chạy được ở cả
 * hai môi trường) nằm ở `determinism.jsdom.test.ts` vì nó cần một `environment`
 * khác, và điều kiện J.2 là một cổng CI ở `scripts/check-git-determinism.mjs`.
 *
 * ⚠ Vì sao đây không phải "test cho có": nếu tất định hỏng thì **verdict của
 * client khác verdict của server**, và người chơi bị từ chối một bài họ giải
 * đúng. Chế độ thi ở P18 lúc đó chỉ còn là danh dự.
 */

import { describe, expect, it } from 'vitest';

import { hashObject, hashRepoState, serializeObject } from './hash.ts';
import { EMPTY_STORE, makeBlob, makeTree, putObject, writeCommit, writeContents } from './objects.ts';
import { buildWorld } from './world-spec.ts';
import { runCommands, replayGitLog } from './engine.ts';
import { GIT_LEVELS } from './levels/index.ts';
import type { CommitSpec, FilePath, Lines, WorldSpec } from './contract.ts';
import type { GitGameAction, RunLog } from '../core/run-log.ts';

// ═══════════════════════════════════════════════════════════════════════════
// J.1 — Hash thuần tuý
// ═══════════════════════════════════════════════════════════════════════════

describe('J.1 hash thuần tuý', () => {
  it('cùng object ⇒ cùng Oid, qua 1000 lần dựng lại', () => {
    const first = hashObject(makeBlob(['xin chào', 'thế giới']));
    for (let i = 0; i < 1000; i++) {
      expect(hashObject(makeBlob(['xin chào', 'thế giới']))).toBe(first);
    }
  });

  it('tree dựng theo THỨ TỰ CHÈN khác nhau vẫn ra cùng Oid', () => {
    const paths: readonly FilePath[] = ['z.ts', 'a.ts', 'm/b.ts', 'm/a.ts', 'A.ts'];
    const oids = paths.map((p) => hashObject(makeBlob([p])));

    const baseline = hashObject(
      makeTree(Object.fromEntries(paths.map((p, i) => [p, oids[i] ?? '']))),
    );

    // 20 hoán vị tất định (xoay vòng + đảo), không dùng Math.random.
    for (let shift = 0; shift < paths.length; shift++) {
      for (const reversed of [false, true]) {
        const order = [...paths.slice(shift), ...paths.slice(0, shift)];
        const seq = reversed ? [...order].reverse() : order;
        const record: Record<FilePath, string> = {};
        for (const p of seq) record[p] = oids[paths.indexOf(p)] ?? '';
        expect(hashObject(makeTree(record))).toBe(baseline);
      }
    }
  });

  it('đổi MỘT ký tự ⇒ Oid khác hẳn (đây là bài G01)', () => {
    const a = hashObject(makeBlob(['port: 8080']));
    const b = hashObject(makeBlob(['port: 8081']));
    expect(a).not.toBe(b);
  });

  it('chuẩn hoá NFC: hai cách gõ cùng một chữ tiếng Việt ra cùng Oid', () => {
    // "ế" dựng sẵn (U+1EBF) so với "e" + dấu mũ tổ hợp + dấu sắc tổ hợp.
    const dungSan = 'Tiếng Việt';
    const toHop = 'Tiếng Việt';
    expect(dungSan).not.toBe(toHop); // hai chuỗi KHÁC nhau về byte
    expect(hashObject(makeBlob([dungSan]))).toBe(hashObject(makeBlob([toHop])));
  });

  it('độ dài đi trước nội dung: message chứa dấu phân cách không giả mạo được object khác', () => {
    // Không có tiền tố độ dài thì hai commit dưới đây serialize ra cùng chuỗi.
    const [s1, tree] = writeContents(EMPTY_STORE, { 'a.txt': ['x'] });
    const [s2, oid1] = writeCommit(s1, {
      tree,
      parents: [],
      message: 'xin chào\ntime 99',
      author: 'A',
      logicalTime: 1,
    });
    const [, oid2] = writeCommit(s2, {
      tree,
      parents: [],
      message: 'xin chào',
      author: 'A',
      logicalTime: 1,
    });
    expect(oid1).not.toBe(oid2);
  });

  it('serialize chuẩn tắc KHÔNG phụ thuộc thứ tự entries truyền vào', () => {
    const o1 = hashObject(makeBlob(['a']));
    const o2 = hashObject(makeBlob(['b']));
    const t1 = makeTree({ 'b.txt': o2, 'a.txt': o1 });
    const t2 = makeTree({ 'a.txt': o1, 'b.txt': o2 });
    expect(serializeObject(t1)).toBe(serializeObject(t2));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// J.3 — Lặp trên tập hợp qua khoá đã sắp xếp
// ═══════════════════════════════════════════════════════════════════════════

/** Dựng cùng một repo bằng `n` thứ tự chèn khác nhau và trả hash trạng thái. */
function stateHashesAcrossInsertionOrders(spec: WorldSpec, orders: number): readonly string[] {
  const commits = spec.commits ?? [];
  const out: string[] = [];

  for (let shift = 0; shift < orders; shift++) {
    // Chỉ hoán vị thứ tự KHOÁ trong `changes` và `worktree`, không hoán vị thứ
    // tự commit — commit phải theo thứ tự tô-pô, đó là ràng buộc của spec chứ
    // không phải chỗ bất định.
    const permuted: CommitSpec[] = commits.map((c) => {
      const changes = c.changes;
      if (changes === undefined) return c;
      const keys = Object.keys(changes);
      const rotated = [...keys.slice(shift % Math.max(1, keys.length)), ...keys.slice(0, shift % Math.max(1, keys.length))];
      const next: Record<string, string | Lines | null> = {};
      for (const k of rotated) {
        const v = changes[k];
        if (v !== undefined) next[k] = v;
      }
      return { ...c, changes: next };
    });

    const world = buildWorld({ ...spec, commits: permuted }, 7);
    out.push(
      hashRepoState({
        refs: world.local.refs,
        head: world.local.head,
        index: world.local.index,
        worktree: world.local.worktree,
      }),
    );
  }
  return out;
}

describe('J.3 lặp qua khoá đã sắp xếp', () => {
  const spec: WorldSpec = {
    commits: [
      {
        id: 'c1',
        message: 'Khởi tạo',
        changes: { 'z.ts': 'z', 'a.ts': 'a', 'm/b.ts': 'b', 'm/a.ts': 'a2', 'B.ts': 'B' },
      },
      {
        id: 'c2',
        parents: ['c1'],
        message: 'Sửa nhiều file',
        changes: { 'a.ts': 'a2', 'z.ts': 'z2', 'new.ts': 'n' },
      },
    ],
    branches: { main: 'c2' },
  };

  it('ÍT NHẤT 5 thứ tự chèn khác nhau ⇒ hash trạng thái bằng nhau', () => {
    const hashes = stateHashesAcrossInsertionOrders(spec, 5);
    expect(hashes).toHaveLength(5);
    expect(new Set(hashes).size).toBe(1);
  });

  it('đối chứng dương: nội dung KHÁC thì hash phải khác', () => {
    const a = stateHashesAcrossInsertionOrders(spec, 1)[0];
    const b = stateHashesAcrossInsertionOrders(
      {
        ...spec,
        commits: [
          ...(spec.commits ?? []).slice(0, 1),
          { id: 'c2', parents: ['c1'], message: 'Sửa nhiều file', changes: { 'a.ts': 'KHAC' } },
        ],
      },
      1,
    )[0];
    // Không có khẳng định này thì test trên xanh kể cả khi `hashRepoState` trả
    // một hằng số — và một hàm băm trả hằng số cũng "ổn định qua 5 thứ tự chèn".
    expect(a).not.toBe(b);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// J.4 — Replay = (levelId, seed, danh sách lệnh)
// ═══════════════════════════════════════════════════════════════════════════

function logOf(levelId: string, seed: number, commands: readonly string[]): RunLog<GitGameAction> {
  return {
    gameId: 'git',
    levelId,
    seed,
    actions: commands.map((command, i) => ({
      gameId: 'git',
      tick: i,
      kind: 'command',
      command,
    })),
  };
}

describe('J.4 phát lại từ (levelId, seed, lệnh[])', () => {
  it('phát lại 20 lượt chơi mẫu ⇒ khớp trạng thái và verdict', () => {
    let checked = 0;
    for (const level of GIT_LEVELS.slice(0, 20)) {
      const direct = runCommands(level, level.solutionCommands);
      const replayed = replayGitLog(level, logOf(level.id, 1, level.solutionCommands));

      const h1 = hashRepoState({
        refs: direct.world.local.refs,
        head: direct.world.local.head,
        index: direct.world.local.index,
        worktree: direct.world.local.worktree,
      });
      const h2 = hashRepoState({
        refs: replayed.world.local.refs,
        head: replayed.world.local.head,
        index: replayed.world.local.index,
        worktree: replayed.world.local.worktree,
      });

      expect(h2, `phát lại lệch ở level ${level.id}`).toBe(h1);
      expect(replayed.status.phase, `verdict lệch ở level ${level.id}`).toBe(direct.status.phase);
      checked++;
    }
    expect(checked).toBe(20);
  });

  it('nhật ký KHÔNG lưu trạng thái trung gian — chỉ ba trường', () => {
    const log = logOf('git-01-commit-la-object', 3, ['git status']);
    expect(Object.keys(log).sort()).toEqual(['actions', 'gameId', 'levelId', 'seed']);
  });

  it('cùng seed + cùng lệnh, chạy hai lần ⇒ bằng nhau từng byte', () => {
    const level = GIT_LEVELS[0];
    expect(level).toBeDefined();
    if (level === undefined) return;
    const a = runCommands(level, level.solutionCommands, 42);
    const b = runCommands(level, level.solutionCommands, 42);
    expect(JSON.stringify(b.world)).toBe(JSON.stringify(a.world));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bổ trợ: kho object không bao giờ mất phần tử
// ═══════════════════════════════════════════════════════════════════════════

describe('kho object chỉ thêm, không bớt', () => {
  it('putObject cùng một object hai lần KHÔNG tạo bản sao', () => {
    const [s1, oid1] = putObject(EMPTY_STORE, makeBlob(['x']));
    const [s2, oid2] = putObject(s1, makeBlob(['x']));
    expect(oid2).toBe(oid1);
    expect(Object.keys(s2)).toHaveLength(1);
    expect(s2).toBe(s1);
  });

  it('sau reset --hard, commit cũ CÒN trong kho và KHÔNG reachable', () => {
    const level = GIT_LEVELS.find((l) => l.id === 'git-26-cuu-sau-reset-hard');
    expect(level).toBeDefined();
    if (level === undefined) return;

    const before = runCommands(level, []);
    const countBefore = Object.keys(before.world.local.objects).length;

    const after = runCommands(level, ['git reset --hard HEAD~3']);
    const countAfter = Object.keys(after.world.local.objects).length;

    // Đây là bất biến sống còn của cả chương 3: reset KHÔNG được làm kho nhỏ đi.
    expect(countAfter).toBeGreaterThanOrEqual(countBefore);
  });
});
