/**
 * Bảng đăng ký plugin OJ và hai plugin đầu tiên — §18.A.4 / §18.A.5.
 *
 * ⛔ ĐÂY KHÔNG PHẢI ảnh chụp hồi quy. Ảnh chụp là `k8s/problem-regression.test.ts`
 * (§18.A.1) và nó khoá hành vi engine K8s ở mức sâu hơn hẳn. File này chỉ khẳng
 * định những gì HỢP ĐỒNG PLUGIN hứa và những gì một ảnh chụp không nói được:
 *
 * - ba chữ ký mà lane web khoá vào có đúng hình dạng đã hẹn;
 * - bài không chấm được thì ỒN ÀO chứ không im lặng đọc ra thành `WA 0/0`;
 * - `predicateNames` khớp hiện thực CẢ HAI CHIỀU;
 * - `initialSpec()` trả object MỚI mỗi lần gọi;
 * - `grade` tất định.
 *
 * Mỗi khối dưới đây nói ra thứ nó sẽ bắt được nếu hỏng — một test không nói được
 * điều đó là một test không ai biết nó có còn gác gì không.
 */

import { describe, expect, it } from 'vitest';

import type { Testcase } from './core/problem.ts';
import type { GameAction } from './core/run-log.ts';
import type { GitWorld, WorldSpec } from './git/contract.ts';
import type { ClusterSpec } from './k8s/contract.ts';
import { evaluatePredicate } from './git/predicates.ts';
import { GIT_PROBLEM_PLUGIN, GIT_UNSEEDED_REPLAY_SEED } from './git/problem-plugin.ts';
import { buildWorld } from './git/world-spec.ts';
import { K8S_PROBLEM_PLUGIN, K8S_UNSEEDED_REPLAY_SEED } from './k8s/problem-plugin.ts';
import { PREDICATES } from './k8s/predicates.ts';
import {
  PROBLEM_PLUGINS,
  UnknownProblemGameError,
  gradeProblemRun,
  problemPluginMeta,
} from './problem-plugins.ts';

// ── Dữ liệu dựng sẵn ────────────────────────────────────────────────────────

function testcase(id: string, check: string, args: Readonly<Record<string, unknown>>): Testcase {
  return { id, label: id, check, args, visible: true };
}

/** Cụm có ĐÚNG một Pod, để một vị từ đạt và một vị từ trượt cùng lúc. */
const CUM_MOT_POD: ClusterSpec = {
  nodes: [{ name: 'node-1', cpu: 2000, memory: 4096, ready: true }],
  namespaces: ['default'],
  resources: [
    { kind: 'Pod', name: 'web', namespace: 'default', spec: {} },
    { kind: 'ConfigMap', name: 'cau-hinh', namespace: 'default', spec: {} },
  ],
};

const POD_CO = testcase('co-web', 'resource-exists', {
  kind: 'Pod',
  name: 'web',
  namespace: 'default',
});
const POD_KHAC_KHONG_CO = testcase('khong-co-api', 'resource-absent', {
  kind: 'Pod',
  name: 'api',
  namespace: 'default',
});
const POD_KHONG_CO_NHUNG_CO = testcase('web-phai-vang', 'resource-absent', {
  kind: 'Pod',
  name: 'web',
  namespace: 'default',
});

/**
 * Seed mà client nạp khi mở một bài KHÔNG seedable, tra theo game.
 *
 * ⚠ Hai số này cố ý KHÁC nhau (`0` và `1`) và bảng này giữ nguyên sự khác nhau
 * đó thay vì gộp về một hằng chung. Đó chính là chỗ hợp đồng cũ hỏng: khi `grade`
 * còn nhận `seed: number | null`, mỗi plugin tự điền hằng của mình cho `null`, và
 * hai số khác nhau nghĩa là hai thế giới đầu khác nhau. `ae7ed23` bỏ nhánh đó —
 * lượt nộp mang theo số đã dùng — nên sự khác nhau này nay vô hại, và một test
 * chạy trên CẢ HAI số là bằng chứng cho điều đó.
 */
const SEED_MAC_DINH = {
  k8s: K8S_UNSEEDED_REPLAY_SEED,
  git: GIT_UNSEEDED_REPLAY_SEED,
} as const;

/**
 * Cây ĐÍCH cho bài Git: đúng thế giới đầu, cộng thêm nhánh `tinh-nang`.
 *
 * Dựng từ `graphSignature` (`git/predicates.ts:137`) chứ không đoán: chữ ký đó
 * là danh sách `<tên nhánh>:<chuỗi commit theo cha thứ nhất>`, nên THÊM MỘT
 * NHÁNH là thay đổi nhỏ nhất làm chữ ký khác đi mà vẫn nằm trong tầm một lệnh
 * người chơi gõ được (`git branch tinh-nang`).
 *
 * Chọn như vậy để cặp test dưới đo đúng một điều: vị từ chuyển từ trượt sang đạt
 * VÌ hành động của người chơi, không phải vì hai spec vốn đã giống nhau.
 */
function gitDichThemNhanh(): WorldSpec {
  return {
    commits: [{ id: 'c1', message: 'khoi tao du an', changes: { 'README.md': 'Du an mau' } }],
    branches: { main: 'c1', 'tinh-nang': 'c1' },
    head: 'main',
  };
}

const HINH_DANG_KHOP = testcase('hinh-dang', 'graphShapeMatches', {});

// ── Bảng đăng ký ────────────────────────────────────────────────────────────

describe('PROBLEM_PLUGINS — bảng đăng ký', () => {
  /*
   * Bắt được: ai đó thêm một game vào bảng mà quên khai plugin đúng `gameId` của
   * nó. `PROBLEM_PLUGINS['git'].gameId === 'k8s'` sẽ làm mọi lượt chấm bài Git
   * chạy engine K8s, và triệu chứng là `CE` hàng loạt chứ không phải một lỗi
   * đọc ra được.
   */
  it('khoá của bảng khớp `gameId` mà chính plugin khai', () => {
    for (const [key, plugin] of Object.entries(PROBLEM_PLUGINS)) {
      expect(plugin?.gameId, key).toBe(key);
    }
  });

  it('hai game có plugin, bốn game còn lại chưa', () => {
    expect(Object.keys(PROBLEM_PLUGINS).sort()).toEqual(['git', 'k8s']);
  });

  /*
   * Bắt được: hai game vô tình dùng chung một tiền tố mã bài. Mã bài là khoá
   * chính trong DB (`core/problem.ts`), nên `GIT-0001` và `K8S-0001` va nhau là
   * một lỗi không sửa được sau khi đã có dữ liệu.
   */
  it('tiền tố mã bài không trùng nhau giữa các game', () => {
    const prefixes = Object.values(PROBLEM_PLUGINS).map((plugin) => plugin?.codePrefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('`problemPluginMeta` trả `null` cho game chưa có plugin, không ném', () => {
    expect(problemPluginMeta('cicd')).toBeNull();
    expect(problemPluginMeta('k8s')?.codePrefix).toBe('K8S');
  });
});

// ── Chủ đề ──────────────────────────────────────────────────────────────────

describe('topics — tập đóng, có nhãn', () => {
  /*
   * Bắt được: một chủ đề trùng id trong cùng một game (bộ lọc sẽ hiện hai ô
   * giống hệt nhau), hoặc một chủ đề thiếu nhãn — `t()` trả chuỗi rỗng khi khoá
   * chữ chưa tồn tại, và một ô checkbox không nhãn trông như một lỗi render.
   */
  it.each(['k8s', 'git'] as const)('%s: id duy nhất, nhãn không rỗng', (gameId) => {
    const topics = PROBLEM_PLUGINS[gameId]?.topics ?? [];
    expect(topics.length).toBeGreaterThan(0);
    expect(new Set(topics.map((topic) => topic.id)).size).toBe(topics.length);
    for (const topic of topics) {
      expect(topic.label.length, topic.id).toBeGreaterThan(0);
    }
  });
});

// ── Vị từ: khớp hai chiều ───────────────────────────────────────────────────

describe('predicateNames — khớp hiện thực CẢ HAI CHIỀU', () => {
  /*
   * Hợp đồng (`core/problem-plugin.ts`) đòi đúng chữ này: *"mọi tên ở đây có
   * hiện thực, VÀ mọi hiện thực có tên ở đây"*.
   *
   * Chiều thiếu-hiện-thực bắt được một bài KHÔNG AI GIẢI ĐƯỢC (testcase gọi một
   * tên không tra ra gì). Chiều thừa-hiện-thực bắt được một vị từ CHẾT sống mãi
   * — không ai gọi được nó nên không ai biết nó đã hỏng.
   */
  it('k8s: `PREDICATE_NAMES` và bảng `PREDICATES` phủ nhau', () => {
    expect([...(K8S_PROBLEM_PLUGIN.predicateNames as readonly string[])].sort()).toEqual(
      Object.keys(PREDICATES).sort(),
    );
  });

  /*
   * Git chốt chiều này ở TẦNG KIỂU: `evaluatePredicate` là một `switch` vét cạn
   * trên union `GitPredicateName`, nên thiếu một nhánh là đỏ ở `tsc` chứ không
   * đợi test. Thứ test này thêm vào là phép kiểm RUNTIME rằng mỗi tên thật sự
   * chạy được và trả về boolean — một `switch` vét cạn vẫn có thể ném.
   */
  /*
   * ⚠ KHÔNG còn `continue` nào ở vòng lặp này, và đó là điểm của lượt sửa
   * 2026-09-14. Bản trước bỏ qua `graphShapeMatches` vì không có cây đích để
   * truyền, nên tên duy nhất cần một tham số thứ hai lại là tên duy nhất không
   * ai kiểm — đúng chỗ mà một vị từ hỏng sống sót được lâu nhất. Nay truyền một
   * cây đích thật cho mọi tên: vị từ nào không dùng `target` thì bỏ qua nó, và
   * phép đo không yếu đi.
   */
  it('git: mọi tên chạy được và trả boolean', () => {
    const world = gitWorldBanDau();
    const target = buildWorld(gitDichThemNhanh(), GIT_UNSEEDED_REPLAY_SEED);
    for (const name of GIT_PROBLEM_PLUGIN.predicateNames) {
      expect(typeof evaluatePredicate(world, target, name as never, {}), name).toBe('boolean');
    }
  });
});

/**
 * Thế giới Git ban đầu, dựng bằng ĐÚNG đường mà `createGitSession` đi.
 *
 * `buildWorld` là đường duy nhất dựng `GitWorld` từ một `WorldSpec`; dựng tay
 * một `GitWorld` thứ hai trong test là tạo ra một thế giới mà engine thật không
 * bao giờ sinh ra, và lúc đó test gác một thứ không tồn tại.
 */
function gitWorldBanDau(): GitWorld {
  return buildWorld(GIT_PROBLEM_PLUGIN.initialSpec(), GIT_UNSEEDED_REPLAY_SEED);
}

// ── `initialSpec` — object MỚI mỗi lần ──────────────────────────────────────

describe('initialSpec — hàm chứ không phải hằng dùng chung', () => {
  /*
   * Bắt được đúng cái bẫy mà `core/problem-plugin.ts` nêu: trả một hằng dùng
   * chung thì hai tab soạn bài cùng trỏ vào một object, và sửa tab này đổi luôn
   * tab kia. Triệu chứng trên giao diện là "tự nhiên mất dữ liệu", không phải
   * một lỗi.
   */
  it.each(['k8s', 'git'] as const)('%s: hai lần gọi cho hai object khác nhau', (gameId) => {
    const plugin = PROBLEM_PLUGINS[gameId];
    const a = plugin?.initialSpec();
    const b = plugin?.initialSpec();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

// ── Chấm: đường xanh ────────────────────────────────────────────────────────

describe('gradeProblemRun — verdict', () => {
  it('k8s: qua hết testcase thì `AC`', () => {
    expect(
      gradeProblemRun({
        gameId: 'k8s',
        initialState: CUM_MOT_POD,
        actions: [],
        testcases: [POD_CO, POD_KHAC_KHONG_CO],
        seed: K8S_UNSEEDED_REPLAY_SEED,
      }),
    ).toEqual({
      verdict: 'AC',
      passed: ['co-web', 'khong-co-api'],
      total: 2,
      failedReason: null,
      failedCode: null,
    });
  });

  /*
   * `WA` mang theo `passed` để tầng hiển thị dựng được `WA (1/2)` và nói ĐƯỢC
   * testcase nào đỏ (§18.B.3). Một `WA` không kèm danh sách chỉ nói "sai" và
   * người làm không biết sai ở đâu.
   */
  it('k8s: trượt một testcase thì `WA` kèm đúng id đã qua', () => {
    const ket_qua = gradeProblemRun({
      gameId: 'k8s',
      initialState: CUM_MOT_POD,
      actions: [],
      testcases: [POD_CO, POD_KHONG_CO_NHUNG_CO],
      seed: K8S_UNSEEDED_REPLAY_SEED,
    });
    expect(ket_qua.verdict).toBe('WA');
    expect(ket_qua.passed).toEqual(['co-web']);
    expect(ket_qua.total).toBe(2);
  });

  /*
   * ⚠ XOÁ ĐÂY LÀ ConfigMap CHỨ KHÔNG PHẢI Pod, và đó không phải tùy tiện.
   *
   * `reducer.ts:282` tách riêng nhánh Pod: xoá một Pod gọi `markDeleting(...,
   * DEFAULT_GRACE_TICKS)` chứ không gỡ object ra khỏi cụm — đúng hành vi
   * Kubernetes thật (kết thúc có ân hạn). Nên `resource-absent` vẫn trả `false`
   * ngay sau lệnh xoá, và một test dựng trên Pod sẽ đỏ vì MỘT LÝ DO KHÁC hẳn
   * thứ nó định gác — đọc ra thành "action bị bỏ qua" trong khi action chạy
   * hoàn toàn đúng. Đã dính thật ở lượt viết đầu tiên của chính test này.
   *
   * ConfigMap đi nhánh `removeObjectCascade`, biến mất ngay, nên phép đo ở đây
   * chỉ còn đo đúng một điều: nhật ký CÓ được phát lại hay không.
   */
  it('k8s: hành động trong nhật ký được phát lại (không bị bỏ qua)', () => {
    const ket_qua = gradeProblemRun({
      gameId: 'k8s',
      initialState: CUM_MOT_POD,
      actions: [
        {
          gameId: 'k8s',
          tick: 0,
          kind: 'delete',
          target: { kind: 'ConfigMap', namespace: 'default', name: 'cau-hinh' },
        },
      ],
      testcases: [
        testcase('cau-hinh-phai-vang', 'resource-absent', {
          kind: 'ConfigMap',
          name: 'cau-hinh',
          namespace: 'default',
        }),
      ],
      seed: K8S_UNSEEDED_REPLAY_SEED,
    });
    // ConfigMap bị xoá ⇒ `resource-absent` đạt. Nếu action bị bỏ qua thì đây là
    // `WA`, và đó chính là hình dạng lỗi "action biến mất không một tiếng động"
    // mà `core/verify.ts` cảnh báo.
    expect(ket_qua.verdict).toBe('AC');
  });

  it('git: lệnh trong nhật ký được phát lại', () => {
    const ket_qua = gradeProblemRun({
      gameId: 'git',
      initialState: GIT_PROBLEM_PLUGIN.initialSpec(),
      actions: [{ gameId: 'git', tick: 0, kind: 'command', command: 'git branch tinh-nang' }],
      testcases: [testcase('co-nhanh-moi', 'refExists', { ref: 'tinh-nang' })],
      seed: GIT_UNSEEDED_REPLAY_SEED,
    });
    expect(ket_qua).toEqual({
      verdict: 'AC',
      passed: ['co-nhanh-moi'],
      total: 1,
      failedReason: null,
      failedCode: null,
    });
  });
});

// ── Chấm: mọi đường đỏ đều phải ỒN ÀO ───────────────────────────────────────

describe('gradeProblemRun — bài không chấm được thì nói ra', () => {
  /*
   * ⛔ Đây là ô gác quan trọng nhất của cả file.
   *
   * `development-principles.md` §"Errors Over Silent Fallbacks": một game chưa
   * có plugin mà trả `{ verdict: 'WA', passed: [], total: 0 }` sẽ hiện lên màn
   * hình là "bạn sai 0/0" cho MỌI lượt nộp, và không ai lần ra được vì không có
   * gì hỏng cả.
   */
  it('game chưa có plugin thì NÉM lỗi có tên, không trả GradeResult rỗng', () => {
    expect(() =>
      gradeProblemRun({
        gameId: 'cicd',
        initialState: {},
        actions: [],
        testcases: [POD_CO],
        seed: K8S_UNSEEDED_REPLAY_SEED,
      }),
    ).toThrow(UnknownProblemGameError);
  });

  it('nhật ký của game khác thì `CE` kèm câu nói rõ, không âm thầm bỏ qua', () => {
    const la: GameAction = { gameId: 'git', tick: 0, kind: 'command', command: 'git status' };
    const ket_qua = gradeProblemRun({
      gameId: 'k8s',
      initialState: CUM_MOT_POD,
      actions: [la],
      testcases: [POD_CO],
      seed: K8S_UNSEEDED_REPLAY_SEED,
    });
    expect(ket_qua.verdict).toBe('CE');
    expect(ket_qua.failedReason).toContain('git');
  });

  it.each(['k8s', 'git'] as const)('%s: bài không có testcase nào thì `CE`', (gameId) => {
    const ket_qua = gradeProblemRun({
      gameId,
      initialState: PROBLEM_PLUGINS[gameId]?.initialSpec(),
      actions: [],
      testcases: [],
      seed: SEED_MAC_DINH[gameId],
    });
    expect(ket_qua.verdict).toBe('CE');
    expect(ket_qua.failedReason).not.toBeNull();
  });

  /*
   * Tác giả gõ nhầm tên vị từ. Ở LEVEL, `evaluateObjectives` bỏ qua vị từ lạ và
   * đó là đúng (hỏng một level, không hỏng phiên chơi). Ở một OJ CÓ CHẤM ĐIỂM
   * thì bỏ qua nghĩa là một testcase vĩnh viễn đỏ, trông y hệt một lời giải sai.
   */
  it.each(['k8s', 'git'] as const)('%s: vị từ không tồn tại thì `CE`, không phải `WA`', (gameId) => {
    const ket_qua = gradeProblemRun({
      gameId,
      initialState: PROBLEM_PLUGINS[gameId]?.initialSpec(),
      actions: [],
      testcases: [testcase('go-nham', 'khong-co-vi-tu-nao-ten-the-nay', {})],
      seed: SEED_MAC_DINH[gameId],
    });
    expect(ket_qua.verdict).toBe('CE');
    expect(ket_qua.failedReason).toContain('khong-co-vi-tu-nao-ten-the-nay');
  });

  /*
   * Bài DÙNG `graphShapeMatches` mà KHÔNG khai `targetState` — một bài soạn
   * thiếu. `evaluatePredicate` trả `false` khi `target === null`, nên để nó chạy
   * bình thường thì testcase đó không bao giờ qua được và trông y hệt một lời
   * giải sai.
   *
   * ⚠ Phạm vi của ô này HẸP ĐI từ `ae7ed23` và phải giữ đúng bề rộng đó: nó gác
   * ca THIẾU `targetState`, không còn gác mọi lần gọi `graphShapeMatches`. Ô
   * chứng minh chiều ngược lại (có `targetState` thì vị từ chạy thật) nằm ở
   * describe ngay dưới — một vị từ chỉ được kiểm ở nhánh lỗi là một vị từ chưa
   * ai biết có chạy đúng không.
   */
  it('git: vị từ cần cây đích mà bài không khai `targetState` thì `CE` kèm lý do', () => {
    const ket_qua = gradeProblemRun({
      gameId: 'git',
      initialState: GIT_PROBLEM_PLUGIN.initialSpec(),
      actions: [],
      testcases: [HINH_DANG_KHOP],
      seed: GIT_UNSEEDED_REPLAY_SEED,
    });
    expect(ket_qua.verdict).toBe('CE');
    expect(ket_qua.failedReason).toContain('cây đích');
  });

  /*
   * `initialState` là `unknown` ở mép ngoài, nên một spec sai loại LỌT được qua
   * tầng kiểu. Nó phải hiện ra thành một `CE` đọc được, không phải một ngoại lệ
   * không ai bắt ở giữa một điểm cuối HTTP.
   */
  it('k8s: `initialState` sai loại thì `CE`, không ném ra ngoài', () => {
    const ket_qua = gradeProblemRun({
      gameId: 'k8s',
      initialState: { day: 'khong phai ClusterSpec' },
      actions: [],
      testcases: [POD_CO],
      seed: K8S_UNSEEDED_REPLAY_SEED,
    });
    expect(ket_qua.verdict).toBe('CE');
    expect(ket_qua.failedReason).not.toBeNull();
  });
});

// ── `targetState` — vị từ so hình dạng CHẠY THẬT ────────────────────────────

/**
 * Ô gác cho thứ `ae7ed23` vừa mở ra, và nó cố ý đo chiều ĐẠT chứ không chỉ chiều
 * trượt.
 *
 * Trước lượt sửa đó, `graphShapeMatches` chỉ được kiểm ở một chỗ duy nhất: bài
 * thiếu cây đích thì `CE`. Một vị từ chỉ có bằng chứng ở nhánh lỗi là một vị từ
 * chưa ai biết có chạy đúng không — nó có thể ném, có thể luôn trả `false`, có
 * thể so nhầm cây, và không phép đo nào của repo này nói ra được.
 *
 * Cặp dưới đây khoá cả hai chiều trên CÙNG một cây đích, khác nhau đúng một
 * hành động của người chơi. Khác một hành động là điều kiện: nếu chỉ có ô `AC`
 * thì một hiện thực "luôn trả `true`" vẫn xanh, và nếu chỉ có ô `WA` thì hiện
 * thực cũ "luôn trả `false`" cũng xanh.
 */
describe('graphShapeMatches — chạy thật khi bài có `targetState`', () => {
  const BAI_CO_DICH = {
    gameId: 'git' as const,
    initialState: GIT_PROBLEM_PLUGIN.initialSpec(),
    targetState: gitDichThemNhanh(),
    testcases: [HINH_DANG_KHOP],
    seed: GIT_UNSEEDED_REPLAY_SEED,
  };

  /*
   * Bắt được: vị từ không bao giờ đạt (hiện thực cũ trả `false` vì `target ===
   * null`), hoặc `targetState` không được nối từ `gradeProblemRun` xuống
   * `plugin.grade` — cả hai đọc ra thành `WA` trên một lời giải ĐÚNG, tức là hệ
   * thống từ chối một người làm đúng.
   */
  it('lệnh của người chơi làm hình dạng KHỚP cây đích thì `AC`', () => {
    const ket_qua = gradeProblemRun({
      ...BAI_CO_DICH,
      actions: [{ gameId: 'git', tick: 0, kind: 'command', command: 'git branch tinh-nang' }],
    });
    expect(ket_qua).toEqual({
      verdict: 'AC',
      passed: ['hinh-dang'],
      total: 1,
      failedReason: null,
      failedCode: null,
    });
  });

  /*
   * Bắt được: một hiện thực "luôn trả `true`", và — quan trọng hơn — bắt được
   * việc `CE` bị nới lại thành "mọi lần gọi `graphShapeMatches` đều `CE`". Ở đây
   * bài CÓ khai `targetState`, nên verdict phải là `WA` (người chơi chưa làm tới
   * đích) chứ tuyệt đối không phải `CE` (bài soạn hỏng).
   */
  it('chưa gõ lệnh thì hình dạng LỆCH cây đích, ra `WA` chứ không phải `CE`', () => {
    const ket_qua = gradeProblemRun({ ...BAI_CO_DICH, actions: [] });
    expect(ket_qua.verdict).toBe('WA');
    expect(ket_qua.passed).toEqual([]);
    expect(ket_qua.total).toBe(1);
  });

  /*
   * Cây đích dựng bằng CÙNG seed với thế giới đầu — `gradeGitProblem` gọi
   * `buildWorld(targetState, seed)` bằng đúng seed của phiên. Bắt được: ai đó
   * đóng đinh một seed riêng cho cây đích, thứ làm `graphShapeMatches` trượt
   * trên lời giải đúng ở mọi bài có bot.
   */
  it('seed khác vẫn `AC`: cây đích đi theo seed của lượt chơi', () => {
    const ket_qua = gradeProblemRun({
      ...BAI_CO_DICH,
      seed: 12345,
      actions: [{ gameId: 'git', tick: 0, kind: 'command', command: 'git branch tinh-nang' }],
    });
    expect(ket_qua.verdict).toBe('AC');
  });

  /*
   * K8s nhận `targetState` rồi BỎ QUA — 32 vị từ của nó không có cái nào cần một
   * cụm thứ hai để so. Bắt được: một lượt nối dây làm K8s ném hoặc đổi verdict
   * chỉ vì hợp đồng thêm một trường nó không dùng.
   */
  it('k8s: `targetState` không đổi kết quả vì không vị từ nào đọc tới', () => {
    const chung = {
      gameId: 'k8s' as const,
      initialState: CUM_MOT_POD,
      actions: [],
      testcases: [POD_CO, POD_KHAC_KHONG_CO],
      seed: K8S_UNSEEDED_REPLAY_SEED,
    };
    expect(gradeProblemRun({ ...chung, targetState: CUM_MOT_POD })).toEqual(
      gradeProblemRun(chung),
    );
  });
});

// ── Tất định ────────────────────────────────────────────────────────────────

describe('grade — tất định', () => {
  /*
   * Bất biến sống còn của chế độ thi: client chấm tại chỗ, server chấm lại, và
   * §18.C so hai verdict. Lệch nghĩa là người làm bị từ chối một bài họ giải
   * ĐÚNG — và triệu chứng trông như hệ thống từ chối người chơi ngẫu nhiên.
   *
   * Hai lượt chấm trong cùng một tiến trình không chứng minh được tất định GIỮA
   * trình duyệt và Node — đó là việc của `git/determinism.jsdom.test.ts` và cổng
   * `scripts/check-git-determinism.mjs`. Nó bắt được thứ rẻ hơn nhưng phổ biến
   * hơn: một `Date.now()` hay một trạng thái dùng chung lọt vào đường chấm.
   */
  it('k8s: hai lượt chấm cùng đầu vào cho kết quả y hệt', () => {
    const dau_vao = {
      gameId: 'k8s' as const,
      initialState: CUM_MOT_POD,
      actions: [{ gameId: 'k8s' as const, tick: 0, kind: 'wait' as const, ticks: 7 }],
      testcases: [POD_CO, POD_KHONG_CO_NHUNG_CO],
      seed: K8S_UNSEEDED_REPLAY_SEED,
    };
    expect(gradeProblemRun(dau_vao)).toEqual(gradeProblemRun(dau_vao));
  });

  it('git: hai lượt chấm cùng đầu vào cho kết quả y hệt', () => {
    const dau_vao = {
      gameId: 'git' as const,
      initialState: GIT_PROBLEM_PLUGIN.initialSpec(),
      actions: [
        { gameId: 'git' as const, tick: 0, kind: 'command' as const, command: 'git branch a' },
      ],
      testcases: [testcase('co-a', 'refExists', { ref: 'a' })],
      seed: GIT_UNSEEDED_REPLAY_SEED,
    };
    expect(gradeProblemRun(dau_vao)).toEqual(gradeProblemRun(dau_vao));
  });
});
