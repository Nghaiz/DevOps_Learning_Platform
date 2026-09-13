/**
 * Ô nghiệm thu **AC-Q**: xuất rồi nhập lại một cây bất kỳ ⇒ hash trạng thái
 * không đổi.
 *
 * ⚠ Một ô "xuất rồi nhập lại bằng nhau" rất dễ xanh mà chẳng chứng minh gì: nếu
 * `sandboxStateHash` trả một hằng số, hoặc nếu `worldToSpec` trả một spec rỗng
 * và `buildWorld` dựng một kho rỗng, thì hai bên vẫn bằng nhau. Nên mọi ô dưới
 * đây đi kèm một khẳng định rằng hai cây KHÁC nhau cho hai hash KHÁC nhau.
 */

import { describe, expect, it } from 'vitest';

import {
  SANDBOX_SCENARIOS,
  exportSandboxJson,
  importSandboxJson,
  sandboxSpec,
  sandboxStateHash,
  worldToSpec,
} from './sandbox.ts';
import { buildWorld } from './world-spec.ts';
import { runCommands } from './engine.ts';
import { GIT_LEVELS } from './levels/index.ts';
import { getCommit, hasObject, reachableFrom } from './objects.ts';
import { branchRef, headOid } from './repo.ts';

describe('AC-Q — xuất rồi nhập lại giữ nguyên trạng thái', () => {
  it('cả bốn kịch bản khởi tạo đi qua vòng tròn mà hash không đổi', () => {
    for (const scenario of SANDBOX_SCENARIOS) {
      const before = buildWorld(sandboxSpec(scenario), 1);
      const json = exportSandboxJson(before, 1);
      const after = importSandboxJson(json);

      expect(after, `${scenario}: nhập lại thất bại`).not.toBeNull();
      if (after === null) continue;
      expect(sandboxStateHash(after), `${scenario}: hash lệch sau vòng xuất-nhập`).toBe(
        sandboxStateHash(before),
      );
    }
  });

  it('đối chứng: hai cây KHÁC nhau cho hai hash KHÁC nhau', () => {
    // Không có ô này thì ô trên xanh kể cả khi `sandboxStateHash` trả hằng số.
    const a = buildWorld(sandboxSpec('kho-roi'), 1);
    const b = buildWorld(sandboxSpec('hai-kho'), 1);
    expect(sandboxStateHash(a)).not.toBe(sandboxStateHash(b));
  });

  it('đối chứng: spec xuất ra KHÔNG rỗng', () => {
    // Không có ô này thì `worldToSpec` trả `{}` cũng làm ô đầu xanh — hai kho
    // rỗng thì hash bằng nhau.
    const world = buildWorld(sandboxSpec('kho-roi'), 1);
    const spec = worldToSpec(world);
    expect(spec.commits?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(Object.keys(spec.branches ?? {})).toContain('main');
    expect(Object.keys(spec.branches ?? {})).toContain('nhanh-phu');
    expect(Object.keys(spec.tags ?? {})).toContain('v0.1');
  });

  it('vòng tròn giữ được cây SAU khi người chơi đã gõ lệnh', () => {
    // Cây dựng sẵn đi qua được là chuyện dễ; cây do lệnh người chơi tạo ra mới
    // là thứ sandbox thật sự phải chia sẻ được.
    const level = GIT_LEVELS.find((l) => l.id === 'git-07-merge-hai-cha');
    expect(level).toBeDefined();
    if (level === undefined) return;

    const played = runCommands(level, level.solutionCommands).world;
    const round = importSandboxJson(exportSandboxJson(played, 1));

    expect(round).not.toBeNull();
    if (round === null) return;
    expect(sandboxStateHash(round)).toBe(sandboxStateHash(played));
  });

  it('xuất HAI LẦN cùng một cây ra hai chuỗi bằng nhau từng byte', () => {
    // Id nội bộ đặt theo thứ tự tô-pô ổn định, không theo Oid. Không có tính
    // ổn định đó thì `diff` giữa hai bản xuất là vô nghĩa, và AC-Q sẽ đỏ ngẫu
    // nhiên khi hai commit trùng mốc thời gian logic.
    const world = buildWorld(sandboxSpec('kho-roi'), 1);
    expect(exportSandboxJson(world, 1)).toBe(exportSandboxJson(world, 1));
  });
});

describe('kịch bản khởi tạo', () => {
  it('`kho-vua-hong` THẬT SỰ có commit mồ côi', () => {
    // Cả kịch bản này chỉ có nghĩa nếu commit nằm trong kho mà không ai trỏ
    // tới. Một spec viết nhầm (khai nhánh trỏ vào c3) sẽ làm nó thành một kho
    // bình thường, và người chơi mở ra không thấy gì để cứu.
    const world = buildWorld(sandboxSpec('kho-vua-hong'), 1);
    const repo = world.local;

    const live = reachableFrom(repo.objects, [repo.refs[branchRef('main')] ?? '']);
    const orphans = Object.keys(repo.objects).filter(
      (oid) => getCommit(repo.objects, oid) !== null && !live.has(oid),
    );

    expect(orphans.length, 'không có commit mồ côi nào — kịch bản này vô nghĩa').toBeGreaterThanOrEqual(2);
    for (const oid of orphans) {
      expect(hasObject(repo.objects, oid)).toBe(true);
    }
  });

  it('`hai-kho` có origin, ba kịch bản kia thì không', () => {
    expect(buildWorld(sandboxSpec('hai-kho'), 1).origin).not.toBeNull();
    expect(buildWorld(sandboxSpec('kho-trong'), 1).origin).toBeNull();
    expect(buildWorld(sandboxSpec('kho-roi'), 1).origin).toBeNull();
    expect(buildWorld(sandboxSpec('kho-vua-hong'), 1).origin).toBeNull();
  });

  it('`kho-trong` không có commit nào nhưng có file chưa track', () => {
    const world = buildWorld(sandboxSpec('kho-trong'), 1);
    expect(headOid(world.local)).toBeNull();
    expect(Object.keys(world.local.worktree)).toContain('README.md');
  });
});

describe('nhập dữ liệu không tin được', () => {
  it('JSON hỏng trả null, KHÔNG ném', () => {
    expect(importSandboxJson('{{{')).toBeNull();
    expect(importSandboxJson('null')).toBeNull();
    expect(importSandboxJson('"chuỗi"')).toBeNull();
    expect(importSandboxJson('[]')).toBeNull();
  });

  it('version hoặc gameId lạ trả null', () => {
    expect(importSandboxJson('{"version":2,"gameId":"git","spec":{}}')).toBeNull();
    expect(importSandboxJson('{"version":1,"gameId":"k8s","spec":{}}')).toBeNull();
  });

  it('spec sai hình dạng trả null thay vì ném', () => {
    // `buildWorld` NÉM khi cha chưa định nghĩa. Ở tầng level đó là đúng; ở đây
    // nó là chuỗi người dùng dán vào, nên phải nuốt lại.
    const bad = JSON.stringify({
      version: 1,
      gameId: 'git',
      spec: { commits: [{ id: 'c1', parents: ['khong-ton-tai'], message: 'x' }] },
    });
    expect(() => importSandboxJson(bad)).not.toThrow();
    expect(importSandboxJson(bad)).toBeNull();
  });
});
