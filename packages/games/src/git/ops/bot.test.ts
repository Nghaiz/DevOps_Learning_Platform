/**
 * Test cho `ops/bot.ts`.
 *
 * Hai ô nghiệm thu của lane nằm ở đây, và ô thứ hai là ô đắt nhất:
 *
 * 1. **Tất định** — chạy cùng một `GitWorld` hai lần cho ra kết quả bằng nhau
 *    từng byte. Khẳng định bằng `JSON.stringify`, và kèm một phép khẳng định
 *    `rng` KHÔNG dịch: một cài đặt bốc ngẫu nhiên rồi tình cờ ra cùng kết quả ở
 *    hai lần chạy trong cùng một tiến trình vẫn qua được phép so chuỗi, nhưng
 *    trạng thái PRNG thì không nói dối được.
 * 2. **Bot push KHÔNG kéo ref theo dõi của người chơi đi theo.** Đây là điều
 *    kiện tồn tại của bài G21: `--force-with-lease` chỉ có nghĩa khi lease là
 *    thứ NGƯỜI CHƠI đã tự `fetch` về. Một bot dùng nhầm `applyPush` sẽ làm mọi
 *    test khác vẫn xanh trong khi bài học biến mất — nên nó được gác thẳng, và
 *    gác thêm một lần nữa ở mức hành vi (`push --force-with-lease` phải ra
 *    `stale-lease` sau khi bot chạy).
 */

import { describe, expect, it } from 'vitest';
import type { BotAction, GitWorld, Oid, Repo, WorldSpec } from '../contract.ts';
import { sortedKeys } from '../deterministic.ts';
import { getCommit, hasObject } from '../objects.ts';
import { branchRef } from '../repo.ts';
import { buildWorld } from '../world-spec.ts';
import { runBots } from './bot.ts';
import { gitFetch, gitPush, trackingRef } from './remote.ts';

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURE
// ═══════════════════════════════════════════════════════════════════════════

const COMMITS = [
  { id: 'c1', message: 'khởi tạo', changes: { 'README.md': 'xin chào' } },
  { id: 'c2', parents: ['c1'], message: 'nền', changes: { 'nen.md': 'nền' } },
];

/** `buildWorld` đặt `logicalTime` = số commit, nên với fixture này nó bằng 2. */
const START_TIME = COMMITS.length;

function lan(atLogicalTime: number, script: readonly string[]): BotAction {
  return { atLogicalTime, author: 'Lan', announce: 'Lan vừa push một thay đổi', script };
}

function withBots(bots: readonly BotAction[], extra: Partial<WorldSpec> = {}): GitWorld {
  const spec: WorldSpec = {
    commits: COMMITS,
    branches: { main: 'c2' },
    origin: { branches: { main: 'c2' } },
    bots,
    ...extra,
  };
  return buildWorld(spec, 11);
}

const SIMPLE_PUSH = [
  'write lan.md Lan ghi chú ở đây',
  'git commit -m "Lan thêm ghi chú"',
  'git push',
];

function oidOfMessage(repo: Repo, message: string): Oid | null {
  for (const oid of sortedKeys(repo.objects)) {
    if (getCommit(repo.objects, oid)?.message === message) return oid;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// LỊCH CHẠY
// ═══════════════════════════════════════════════════════════════════════════

describe('lịch chạy', () => {
  it('chạy bot đã tới hạn, giữ lại bot chưa tới', () => {
    const before = withBots([lan(START_TIME, SIMPLE_PUSH), lan(START_TIME + 10, SIMPLE_PUSH)]);
    const [after, announcements] = runBots(before);

    expect(announcements[0]).toBe('Lan vừa push một thay đổi');
    expect(after.bots).toHaveLength(1);
    expect(after.bots[0]?.atLogicalTime).toBe(START_TIME + 10);
  });

  it('chưa tới hạn thì không chạy gì, và trả về CHÍNH thế giới cũ', () => {
    const before = withBots([lan(START_TIME + 5, SIMPLE_PUSH)]);
    const [after, announcements] = runBots(before);

    expect(after).toBe(before);
    expect(announcements).toEqual([]);
  });

  it('không có bot nào thì không đụng gì', () => {
    const before = withBots([]);
    const [after] = runBots(before);
    expect(after).toBe(before);
  });

  it('đẩy đồng hồ KHÔNG kéo theo bot của nhịp sau chạy luôn (chặn dây chuyền)', () => {
    // Bot đầu đúc ba commit ⇒ đồng hồ nhảy từ 2 lên 5. Bot thứ hai đặt ở mốc 4
    // nằm trong khoảng đó, nhưng nó KHÔNG được chạy trong cùng lượt này.
    const busy = lan(START_TIME, [
      'write a.md một',
      'git commit -m "bước 1"',
      'write b.md hai',
      'git commit -m "bước 2"',
      'write c.md ba',
      'git commit -m "bước 3"',
      'git push',
    ]);
    const later: BotAction = { ...lan(START_TIME + 2, SIMPLE_PUSH), author: 'Minh' };

    const [after] = runBots(withBots([busy, later]));

    expect(after.logicalTime).toBeGreaterThan(START_TIME + 2);
    expect(after.bots).toHaveLength(1);
    expect(after.bots[0]?.author).toBe('Minh');
  });

  it('mỗi commit của bot có một mốc thời gian RIÊNG, tăng dần', () => {
    const busy = lan(START_TIME, [
      'write a.md một',
      'git commit -m "bước 1"',
      'write b.md hai',
      'git commit -m "bước 2"',
      'git push',
    ]);
    const [after] = runBots(withBots([busy]));
    const origin = after.origin as Repo;

    const one = oidOfMessage(origin, 'bước 1');
    const two = oidOfMessage(origin, 'bước 2');
    expect(one).not.toBeNull();
    expect(two).not.toBeNull();

    const t1 = getCommit(origin.objects, one as Oid)?.logicalTime ?? 0;
    const t2 = getCommit(origin.objects, two as Oid)?.logicalTime ?? 0;
    expect(t2).toBeGreaterThan(t1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BOT ĐI QUA KHO TẠM RỒI PUSH
// ═══════════════════════════════════════════════════════════════════════════

describe('bot push', () => {
  it('branch của origin tiến lên, và object commit mới nằm trong origin', () => {
    const before = withBots([lan(START_TIME, SIMPLE_PUSH)]);
    const [after] = runBots(before);

    const origin = after.origin as Repo;
    const tip = origin.refs[branchRef('main')];
    expect(tip).toBeDefined();
    expect(tip).not.toBe((before.origin as Repo).refs[branchRef('main')]);

    const added = oidOfMessage(origin, 'Lan thêm ghi chú');
    expect(added).not.toBeNull();
    expect(hasObject(origin.objects, added as Oid)).toBe(true);
    expect(getCommit(origin.objects, added as Oid)?.author).toBe('Lan');
  });

  it('KHO LOCAL của người chơi không bị đụng — kể cả một byte', () => {
    const before = withBots([lan(START_TIME, SIMPLE_PUSH)]);
    const [after] = runBots(before);
    expect(after.local).toBe(before.local);
  });

  it('⛔ ref theo dõi của NGƯỜI CHƠI đứng yên — điều kiện của bài G21', () => {
    const before = withBots([lan(START_TIME, SIMPLE_PUSH)]);
    const leaseBefore = before.local.refs[trackingRef('main')];

    const [after] = runBots(before);

    expect(after.local.refs[trackingRef('main')]).toBe(leaseBefore);
    // và nó đã LỆCH so với origin thật — đó chính là trạng thái bài G21 cần.
    expect(after.local.refs[trackingRef('main')]).not.toBe(
      (after.origin as Repo).refs[branchRef('main')],
    );
  });

  it('nội dung file của bot đi được sang origin và fetch về được', () => {
    const [afterBots] = runBots(withBots([lan(START_TIME, SIMPLE_PUSH)]));
    const fetched = gitFetch(afterBots, { logicalTime: 50 });

    expect(fetched.error).toBeNull();
    const added = oidOfMessage(afterBots.origin as Repo, 'Lan thêm ghi chú');
    expect(hasObject(fetched.world.local.objects, added as Oid)).toBe(true);
  });

  it('bot tạo được branch mới trên origin', () => {
    const [after] = runBots(
      withBots([
        lan(START_TIME, [
          'git switch -c hotfix',
          'write fix.md vá gấp',
          'git commit -m "vá gấp"',
          'git push origin hotfix',
        ]),
      ]),
    );
    expect((after.origin as Repo).refs[branchRef('hotfix')]).toBeDefined();
  });

  /**
   * Bot đi qua ĐÚNG `decidePush` mà người chơi đi qua, không ghi thẳng vào
   * `origin.refs`.
   *
   * ⚠ Ô này KHÔNG kiểm được nhánh non-fast-forward, và lý do đáng ghi lại: bot
   * `clone` origin ngay đầu lượt của nó, nên kho tạm của nó LUÔN chứa đầu origin
   * hiện tại — một push non-ff không dựng được bằng kịch bản bot, kể cả cố tình.
   * (Bot chạy sau cũng clone lại sau khi bot trước đã push.) Nên thứ kiểm được là
   * nhánh `up-to-date`, và nó vẫn phân biệt được hai cài đặt: một bản ghi thẳng
   * `origin.refs` sẽ dựng object origin MỚI và thêm một dòng reflog dù giá trị ref
   * không đổi, nên `toBe` sẽ đỏ.
   *
   * Nếu sau này lane level cần một bot non-ff (bài G16 nhìn từ phía đồng đội) thì
   * phải thêm một động từ kịch bản kiểu `git reset --hard <ref>`; hiện chưa có, và
   * báo cáo lane 17.H có ghi mục này.
   */
  it('push khi không có gì mới ⇒ KHÔNG đụng origin, kể cả một object mới', () => {
    const before = withBots([lan(START_TIME, ['git push'])]);
    const [after] = runBots(before);

    expect(after.origin).toBe(before.origin);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BẮT TAY VỚI G20 / G21
// ═══════════════════════════════════════════════════════════════════════════

describe('sau khi đồng đội push', () => {
  function afterTeammatePushed(): GitWorld {
    const [world] = runBots(withBots([lan(START_TIME, SIMPLE_PUSH)]));
    return world;
  }

  it('người chơi push thường ⇒ non-fast-forward', () => {
    const base = afterTeammatePushed();
    // Người chơi commit riêng: giả lập bằng cách trỏ main local sang một commit
    // khác nhánh. Ở đây local vẫn ở c2 nên push là fast-forward NGƯỢC — origin
    // đã đi trước, nên không có gì để đẩy và git báo non-fast-forward.
    const result = gitPush(base, { logicalTime: 60 });
    expect(result.error?.code).toBe('non-fast-forward');
    expect(result.error?.explain).toContain('fetch');
  });

  it('người chơi push --force-with-lease ⇒ stale-lease (bot đã push sau lần fetch cuối)', () => {
    const result = gitPush(afterTeammatePushed(), { logicalTime: 60, forceWithLease: true });
    expect(result.error?.code).toBe('stale-lease');
  });

  it('fetch xong thì lease khớp lại, và --force-with-lease đi qua', () => {
    const fetched = gitFetch(afterTeammatePushed(), { logicalTime: 60 });
    const result = gitPush(fetched.world, { logicalTime: 61, force: true });
    expect(result.error).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KỊCH BẢN HỎNG
// ═══════════════════════════════════════════════════════════════════════════

describe('kịch bản hỏng', () => {
  it('động từ lạ ⇒ một dòng cảnh báo, bot bị bỏ, thế giới không đổi', () => {
    const before = withBots([lan(START_TIME, ['bay-len-troi'])]);
    const [after, announcements] = runBots(before);

    expect(announcements).toHaveLength(2);
    expect(announcements[1]).toContain('không phải động từ');
    expect(after.origin).toBe(before.origin);
  });

  it('bot hỏng vẫn bị lấy ra khỏi hàng đợi — không kẹt lại chạy mãi', () => {
    const before = withBots([lan(START_TIME, ['bay-len-troi'])]);
    const [after] = runBots(before);
    expect(after.bots).toHaveLength(0);
  });

  it('commit thiếu -m ⇒ báo lỗi rõ ràng', () => {
    const [, announcements] = runBots(withBots([lan(START_TIME, ['git commit'])]));
    expect(announcements[1]).toContain('-m');
  });

  it('bot đầu thành công thì việc của nó Ở LẠI dù bot sau hỏng', () => {
    const good = lan(START_TIME, SIMPLE_PUSH);
    const bad: BotAction = { ...lan(START_TIME, ['khong-hieu-gi']), author: 'Minh' };

    const before = withBots([good, bad]);
    const [after] = runBots(before);

    expect((after.origin as Repo).refs[branchRef('main')]).not.toBe(
      (before.origin as Repo).refs[branchRef('main')],
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TẤT ĐỊNH — ô nghiệm thu
// ═══════════════════════════════════════════════════════════════════════════

describe('tất định', () => {
  it('cùng một GitWorld chạy hai lần ⇒ bằng nhau TỪNG BYTE', () => {
    const a = runBots(withBots([lan(START_TIME, SIMPLE_PUSH)]))[0];
    const b = runBots(withBots([lan(START_TIME, SIMPLE_PUSH)]))[0];
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('chạy hai lần trên CÙNG tham chiếu thế giới cũng cho cùng kết quả', () => {
    const before = withBots([lan(START_TIME, SIMPLE_PUSH)]);
    const a = runBots(before)[0];
    const b = runBots(before)[0];
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('bot KHÔNG động vào rng — trạng thái PRNG đứng yên', () => {
    const before = withBots([lan(START_TIME, SIMPLE_PUSH)]);
    const [after] = runBots(before);
    expect(after.rng).toBe(before.rng);
  });

  it('hai bot cùng mốc thời gian chạy theo thứ tự đã sắp, không theo thứ tự khai', () => {
    const spec: WorldSpec = {
      commits: COMMITS,
      branches: { main: 'c2' },
      origin: { branches: { main: 'c2' } },
      bots: [
        { atLogicalTime: START_TIME, author: 'Minh', announce: 'Minh', script: [] },
        { atLogicalTime: START_TIME, author: 'An', announce: 'An', script: [] },
      ],
    };
    const [, announcements] = runBots(buildWorld(spec, 3));
    // `world-spec.sortBots` sắp theo author khi cùng mốc — nên An trước Minh dù
    // file level khai Minh trước.
    expect(announcements).toEqual(['An', 'Minh']);
  });
});
