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
  sandboxLevel,
  sandboxSpec,
  sandboxStateHash,
  withOrigin,
  withoutOrigin,
  worldToSpec,
} from './sandbox.ts';
import { buildWorld } from './world-spec.ts';
import { createGitSession, runCommands } from './engine.ts';
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

describe('bật / tắt origin (17.Q)', () => {
  it('bật được trên spec CÓ commit, và origin thật sự xuất hiện trong world', () => {
    const on = withOrigin(sandboxSpec('kho-roi'));
    expect(on).not.toBeNull();
    if (on === null) return;
    expect(buildWorld(on, 1).origin).not.toBeNull();
  });

  it('KHÔNG bật được trên kho trống, và trả null thay vì spec hỏng', () => {
    // Đối chứng của cả cặp: nếu `withOrigin` cứ trả spec kèm origin trỏ vào một
    // id không tồn tại thì `buildWorld` sẽ NÉM — tức giao diện sập, chứ không
    // phải "nút không ăn". Ô này chốt rằng ta phát hiện ở tầng spec.
    expect(withOrigin(sandboxSpec('kho-trong'))).toBeNull();
  });

  it('tắt rồi bật lại cho một world vẫn dựng được', () => {
    const off = withoutOrigin(sandboxSpec('hai-kho'));
    expect(off.origin).toBeUndefined();
    expect(buildWorld(off, 1).origin).toBeNull();

    const back = withOrigin(off);
    expect(back).not.toBeNull();
    if (back === null) return;
    expect(buildWorld(back, 1).origin).not.toBeNull();
  });

  it('bật trên spec ĐÃ có origin thì giữ nguyên, không ghi đè', () => {
    // `hai-kho` cố ý để `origin/main` LỆCH khỏi `main` — đó là cả bài G14–G15.
    // Một `withOrigin` ngây thơ sẽ đặt lại tracking = main và xoá mất cảnh đó.
    const spec = sandboxSpec('hai-kho');
    expect(withOrigin(spec)).toBe(spec);
  });
});

describe('sandboxLevel — mượn lại engine', () => {
  it('chạy được một chuỗi lệnh thật và trạng thái tiến', () => {
    const level = sandboxLevel(sandboxSpec('kho-roi'));
    const session = createGitSession({ level });
    const before = sandboxStateHash(session.getWorld());

    // ⚠ Cú pháp là `git write <path> -c "<nội dung>"`. Bản đầu của ô này viết
    // `git write note.md "xin chao"` — SAI, và ô vẫn XANH: hash đã đổi từ lệnh
    // `checkout -b` ở trên, còn ref `thu-nghiem` cũng do chính lệnh đó tạo. Ba
    // trong bốn lệnh lỗi mà ô không hề biết. Nên bây giờ mỗi lệnh tự khẳng định
    // nó KHÔNG lỗi, và cuối cùng khẳng định có commit MỚI.
    for (const cmd of [
      'git checkout -b thu-nghiem',
      'git write note.md -c "xin chao"',
      'git add note.md',
      'git commit -m "Ghi chu"',
    ]) {
      const outcome = session.run(cmd);
      expect(outcome.result.error, cmd + ' -> ' + JSON.stringify(outcome.result.error)).toBeNull();
    }

    const after = session.getWorld();
    expect(sandboxStateHash(after)).not.toBe(before);
    expect(Object.keys(after.local.refs)).toContain('refs/heads/thu-nghiem');
    // Commit MỚI phải tồn tại — đây là thứ ô cũ không hề đo.
    expect(headOid(after.local)).not.toBe(headOid(buildWorld(sandboxSpec('kho-roi'), 1).local));
    expect(after.local.worktree['note.md']).toEqual(['xin chao']);
  });

  it('hoàn tác đưa hash về đúng giá trị cũ', () => {
    const session = createGitSession({ level: sandboxLevel(sandboxSpec('kho-roi')) });
    const before = sandboxStateHash(session.getWorld());
    session.run('git checkout -b thu-nghiem');
    expect(sandboxStateHash(session.getWorld())).not.toBe(before);
    expect(session.undo()).toBe(true);
    expect(sandboxStateHash(session.getWorld())).toBe(before);
  });

  it('KHÔNG giới hạn lệnh — `allowedCommands` là null, không phải mảng rỗng', () => {
    // `[]` mang nghĩa NGƯỢC LẠI (cấm tất). Ô này gác đúng cái bẫy đó: nếu ai
    // đổi sang `[]` thì lệnh dưới đây sẽ bị từ chối thay vì chạy.
    const level = sandboxLevel(sandboxSpec('kho-roi'));
    expect(level.allowedCommands).toBeNull();
    const session = createGitSession({ level });
    const outcome = session.run('git branch bat-ky');
    expect(outcome.result.error, 'lệnh bị từ chối — `allowedCommands` đang chặn').toBeNull();
  });
});
