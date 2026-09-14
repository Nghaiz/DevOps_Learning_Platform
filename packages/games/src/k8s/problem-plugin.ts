/**
 * Phần RIÊNG của K8s Arena trong hệ OJ đa-game — §18.A.4.
 *
 * ⛔ Việc của bước này là **CHUYỂN CHỖ, KHÔNG ĐỔI HÀNH VI**. Chín chủ đề, ba
 * mươi hai tên vị từ, tiền tố `K8S`: tất cả đã tồn tại và đang được dùng; file
 * này chỉ gom chúng lại sau một hợp đồng (`GameProblemPlugin`) để một game thứ
 * hai cắm vào được mà không ai phải viết thêm một `switch (gameId)`.
 *
 * Ô nghiệm thu A.7 là `k8s/problem-regression.test.ts` — nó khoá hành vi TRƯỚC
 * refactor và phải xanh y nguyên sau. Đỏ một dòng ở đó nghĩa là bước chuyển chỗ
 * này đã đổi nghĩa một thứ gì đó, và phải dừng chứ không phải sửa test.
 *
 * ── VÌ SAO `topics` / `predicateNames` SUY RA CHỨ KHÔNG CHÉP ──
 *
 * Chín tên chủ đề và ba mươi hai tên vị từ đều đã có một nguồn sự thật
 * (`PROBLEM_TOPICS` + `PROBLEM_TOPIC_LABELS` ở `problem.ts`, `PREDICATE_NAMES` ở
 * `predicate-names.ts`). Chép chúng sang đây là dựng bản sao thứ hai, và bản sao
 * đó sẽ lệch đúng vào lần đầu ai thêm một chủ đề — im lặng, vì một chủ đề thiếu
 * ở plugin chỉ làm cổng kiểm từ chối một bài hợp lệ chứ không ném.
 *
 * `.map()` ở tầng module là phép tính THUẦN, không phải side effect: nó không
 * đọc, không ghi, không đụng gì ngoài hằng đầu vào — nên lời khai
 * `sideEffects: false` của `package.json` vẫn đúng. `predicates.ts:1005`
 * (`IMPLEMENTED_PREDICATE_NAMES`) đã là đúng khuôn này từ trước.
 */

import { t } from '@devops-platform/copy';

import type { AuthorField, GameProblemPlugin } from '../core/problem-plugin.ts';
import type { GradeResult, ProblemTopicOption, Testcase } from '../core/problem.ts';
import { problemVerdictOf } from '../core/problem.ts';
import type { K8sActionShape } from '../core/run-log.ts';
import type { ClusterSpec, K8sGameAction, Level } from './contract.ts';
import type { ClusterState } from './model.ts';
import { PREDICATE_NAMES } from './predicate-names.ts';
import { PREDICATES } from './predicates.ts';
import { PROBLEM_TOPICS, PROBLEM_TOPIC_LABELS } from './problem.ts';
import { ALL_KINDS } from './resources.ts';
import type { K8sEngineSession } from './session.ts';
import { createSession } from './session.ts';

// ── Định danh ───────────────────────────────────────────────────────────────

/**
 * Tiền tố mã bài. Giữ NGUYÊN `K8S` — mọi bài đang có trong DB mang tiền tố này,
 * và `code` là thứ duy nhất trong hệ không bao giờ được đổi (xem `core/problem.ts`).
 */
export const K8S_PROBLEM_CODE_PREFIX = 'K8S';

/**
 * Seed dùng khi bài KHÔNG seedable (`seed === null`).
 *
 * ⚠ Đây KHÔNG mâu thuẫn với luật *"đừng dùng `0` làm không-có-seed"* ở
 * `core/problem.ts`. Luật đó nói về chỗ **LƯU**: một cột `seed` mà `0` vừa nghĩa
 * là seed số không vừa nghĩa là không có seed thì không ai gỡ ra được. Ở đây
 * không lưu gì — engine BẮT BUỘC phải nhận một số để dựng trạng thái đầu, nên
 * câu hỏi không phải "lưu gì" mà "hai bên có dùng CÙNG một số không".
 *
 * Hằng này là câu trả lời, và nó phải được export: client chấm tại chỗ và server
 * chấm lại phải nạp cùng một số, nếu không thì mọi lượt nộp hợp lệ vào một bài
 * không-seedable đều lệch trạng thái đầu và bị từ chối — một lỗi trông giống hệt
 * "hệ thống từ chối người chơi ngẫu nhiên".
 */
export const K8S_UNSEEDED_REPLAY_SEED = 0;

/**
 * `Level.id` của level tổng hợp dựng để phát lại. Không bao giờ tới màn hình.
 *
 * Giá trị cụ thể KHÔNG ảnh hưởng kết quả chấm: `initialState(level, seed)` chỉ
 * đọc `level.initialState`, và `level.id` chỉ đi vào `getLog()` — đường mà bộ
 * chấm này không dùng (kiểm bằng grep `level\.id` trong `reducer.ts` /
 * `session.ts` / `tick.ts`, 2026-09-14). Đặt tên rõ để lần sau ai đọc `RunLog`
 * sinh ra từ đây không tưởng nó là một level thật.
 */
const K8S_PROBLEM_REPLAY_LEVEL_ID = 'k8s-problem-replay';

// ── Chủ đề ──────────────────────────────────────────────────────────────────

/**
 * Chín chủ đề K8s, nguyên vẹn từ `problem.ts`.
 *
 * Tra nhãn qua `PROBLEM_TOPIC_LABELS` là phép tra **toàn phần** (kiểu của nó là
 * `Record<ProblemTopic, string>`), nên không có nhánh `?? ''` nào — một nhãn
 * thiếu là lỗi biên dịch chứ không phải một ô trống trên giao diện.
 */
export const K8S_PROBLEM_TOPICS: readonly ProblemTopicOption[] = PROBLEM_TOPICS.map((id) => ({
  id,
  label: PROBLEM_TOPIC_LABELS[id],
}));

// ── Form soạn `initialState` ────────────────────────────────────────────────

/**
 * Mô tả form cho `ClusterSpec` — ba khối đúng như trang soạn bài hiện có
 * (`apps/web/src/app/author/problems/cluster-fields.tsx`): node, namespace, tài
 * nguyên.
 *
 * ⚠ HAI CHỖ PHẢI DÙNG `json`, và cả hai đều là giới hạn THẬT chứ không phải lười:
 *
 * 1. `namespaces` là `readonly string[]` — một **danh sách giá trị đơn**, mà
 *    `AuthorField` chưa có dạng nào cho nó: `list` mô tả danh sách của một NHÓM
 *    trường con (mỗi mục là một object), `text` mô tả đúng một chuỗi. Trang soạn
 *    bài hiện dùng textarea "mỗi dòng một namespace" rồi tự tách — một quy ước
 *    nằm trong mã giao diện, không nằm trong kiểu. Đã báo lead; tới khi hợp đồng
 *    có `kind: 'string-list'` thì `json` là bản mô tả TRUNG THỰC nhất, vì nó
 *    không hứa một widget mà tầng UI chưa dựng được.
 * 2. `resources[].spec` là `Record<string, unknown>` với hình dạng tuỳ 26 loại
 *    tài nguyên — `contract.ts:110` đã chốt là cố ý lỏng. Đây đúng là "van an
 *    toàn có chủ ý" mà `AuthorField` mô tả, không phải một chỗ bỏ dở.
 *
 * Mọi chữ hiển thị lấy từ khoá đã có trong `packages/copy` — file này KHÔNG thêm
 * khoá mới, vì trang soạn bài K8s đã đặt hết chúng từ trước.
 */
export const K8S_AUTHOR_FIELDS: readonly AuthorField[] = [
  {
    kind: 'list',
    path: 'nodes',
    label: t('problem.cluster-fields-node'),
    itemLabel: t('problem.cluster-fields-node'),
    minItems: 1,
    fields: [
      {
        kind: 'text',
        path: 'name',
        label: t('problem.node-fields-ten-node'),
        required: true,
      },
      {
        kind: 'number',
        path: 'cpu',
        label: t('problem.node-fields-cpu-milli-core-1-core-1000'),
        required: true,
        min: 0,
        integer: true,
      },
      {
        kind: 'number',
        path: 'memory',
        label: t('problem.cluster-to-spec-bo-nho-mib'),
        required: true,
        min: 0,
        integer: true,
      },
      {
        kind: 'boolean',
        path: 'ready',
        label: t('problem.node-fields-node-o-trang-thai-ready'),
      },
    ],
  },
  {
    kind: 'json',
    path: 'namespaces',
    label: t('problem.cluster-fields-namespace'),
    help: t(
      'problem.cluster-fields-moi-dong-mot-namespace-tai-nguyen-chi-dat-duoc-vao-namespace-da-khai-o-day',
    ),
    required: true,
  },
  {
    kind: 'list',
    path: 'resources',
    label: t('problem.cluster-fields-tai-nguyen'),
    itemLabel: t('problem.cluster-fields-tai-nguyen'),
    fields: [
      {
        kind: 'select',
        path: 'kind',
        label: t('problem.resource-fields-loai'),
        required: true,
        multiple: false,
        // Tên kỹ thuật giữ nguyên, không dịch — cùng quy ước mà
        // `packages/copy/src/surfaces/problem.ts` đã ghi ở đầu file cho
        // `ResourceKind` và `PredicateName`.
        options: ALL_KINDS.map((kind) => ({ value: kind, label: kind })),
      },
      {
        kind: 'text',
        path: 'name',
        label: t('problem.predicate-arg-types-ten'),
        required: true,
      },
      {
        kind: 'text',
        path: 'namespace',
        label: t('problem.cluster-fields-namespace'),
        help: t('problem.resource-fields-phai-la-mot-trong-cac-namespace-da-khai-o-tren'),
        required: true,
      },
      {
        kind: 'json',
        path: 'spec',
        label: t('problem.resource-fields-phan-than-json'),
        help: t(
          'problem.resource-fields-hinh-dang-tuy-loai-tai-nguyen-engine-chi-doc-nhung-field-no-can-va-bo-qua-p',
        ),
        required: true,
      },
    ],
  },
];

// ── Chấm ────────────────────────────────────────────────────────────────────

/**
 * `Level` tổng hợp, chỉ để engine chạy. KHÔNG bao giờ tới màn hình.
 *
 * Ba field mang nghĩa thật với engine: `id`, `initialState`, `objectives` —
 * `session.ts` và `reducer.ts` không đọc gì khác (cùng phép kiểm mà
 * `apps/web/src/server/problems/replay.ts` đã ghi lại ngày 2026-09-08, kiểm lại
 * 2026-09-14). Các ô còn lại để rỗng chứ KHÔNG bịa một câu chữ: một chuỗi không
 * ai đọc là dữ liệu rác, và ở đây nó còn dễ bị tưởng là đề bài thật.
 *
 * ⚠ `allowedResources: ALL_KINDS` chứ KHÔNG phải `[]`. Hai giá trị mang nghĩa
 * NGƯỢC NHAU — `[]` là "cấm mọi loại". Hôm nay engine không đọc field này khi
 * phát lại, nên viết sai chưa hại; ngày nào nó bắt đầu chặn theo danh sách thì
 * `[]` làm MỌI lượt chấm trượt, im lặng, vì một hành động bị chặn không phải một
 * lỗi. Cái bẫy này đã cắn một lần rồi (`git/contract.ts:951` ghi lại nó).
 *
 * `objectives: []` là đúng nghĩa: bài OJ chấm bằng `testcases`, và testcase được
 * chạy thẳng trên trạng thái cuối ở `gradeK8sProblem`. Đi vòng qua `objectives`
 * sẽ kéo theo `required` — thứ mà `Testcase` cố ý KHÔNG có.
 */
function replayLevel(initialState: ClusterSpec): Level {
  return {
    id: K8S_PROBLEM_REPLAY_LEVEL_ID,
    chapter: 0,
    title: '',
    mission: '',
    brief: '',
    difficulty: 'basic',
    initialState,
    allowedResources: ALL_KINDS,
    objectives: [],
    hints: [],
    parMoves: 0,
    teaches: [],
    teaching: { primer: '', cheatsheet: [], takeaways: [] },
  };
}

function compileError(reason: string): GradeResult {
  return { verdict: 'CE', passed: [], total: 0, failedReason: reason };
}

/**
 * Phát lại nhật ký rồi chấm từng testcase trên trạng thái CUỐI.
 *
 * ⛔ Hàm thuần và tất định. Không `Date.now()`, không `Math.random()`, không lặp
 * trên `Set`/`Map`: `testcases` là mảng, `actions` là mảng, và `autoTick: false`
 * cắt đứt mọi phụ thuộc vào đồng hồ treo tường. Thiếu một trong ba thì verdict
 * của client khác verdict của server và người làm bị từ chối một bài họ giải
 * ĐÚNG — `core/problem-plugin.ts` gọi đó là điều kiện sống còn của chế độ thi.
 *
 * ── VÌ SAO BA TÌNH HUỐNG DƯỚI ĐÂY LÀ `CE` CHỨ KHÔNG PHẢI `WA` ──
 *
 * `CE` trong hợp đồng nghĩa là *"lượt chơi không chạy tới nơi, nên `passed`/
 * `total` không nói lên gì"*. Cả ba đều đúng nghĩa đó, và điều quan trọng hơn là
 * cả ba đều KHÔNG được phép im lặng thành `WA`:
 *
 * - **Bài không có testcase nào** — `problemVerdictOf(0, 0)` đã trả `CE` sẵn, vì
 *   "qua hết 0 testcase" đúng về logic và sai về nghĩa.
 * - **Testcase gọi một vị từ không tồn tại** (tác giả gõ nhầm tên) — nếu bỏ qua
 *   như `evaluateObjectives` của LEVEL làm thì bài đó KHÔNG AI GIẢI ĐƯỢC và
 *   không ai biết tại sao: một testcase vĩnh viễn đỏ trông y hệt một người làm
 *   sai. Ở level, bỏ qua là đúng (hỏng một level, không hỏng phiên chơi); ở một
 *   OJ có chấm điểm thì im lặng là thứ `development-principles.md`
 *   §"Errors Over Silent Fallbacks" cấm thẳng.
 * - **Engine ném khi phát lại** — lỗi của TA hoặc của dữ liệu, không phải bằng
 *   chứng người làm sai. `core/verify.ts` tách đúng hai thứ đó thành
 *   `phat-lai-loi` và `khong-khop`; ở đây chỉ có ba verdict nên `CE` kèm câu nói
 *   rõ là chỗ duy nhất chứa được nó.
 */
export function gradeK8sProblem(input: {
  readonly initialState: ClusterSpec;
  readonly actions: readonly K8sActionShape[];
  readonly testcases: readonly Testcase[];
  readonly seed: number | null;
}): GradeResult {
  const { initialState, actions, testcases, seed } = input;

  if (testcases.length === 0) {
    return compileError('bài chưa có testcase nào nên không chấm được');
  }

  // Tên vị từ kiểm TRƯỚC khi phát lại: một bài soạn hỏng thì báo ngay, không bắt
  // engine chạy xong một nhật ký dài rồi mới nói.
  for (const testcase of testcases) {
    if (!(testcase.check in PREDICATES)) {
      return compileError(`testcase "${testcase.id}" gọi vị từ không tồn tại: "${testcase.check}"`);
    }
  }

  let state: ClusterState;
  /*
   * ⚠ `createSession` phải nằm TRONG `try`, và đây là một lỗi thật đã bị chính
   * test của file này bắt (2026-09-14).
   *
   * `initialState` tới đây dưới dạng `unknown` (xem `problem-plugins.ts`), nên
   * một spec sai loại LỌT được qua tầng kiểu: `createCluster` lặp trên
   * `spec.resources` và ném `TypeError` khi trường đó vắng. Dựng phiên ở ngoài
   * `try` nghĩa là ngoại lệ đó bay thẳng ra khỏi `grade`, qua cả điểm cuối HTTP,
   * thành một lỗi 500 không ai đọc được — trong khi hợp đồng đã có sẵn ô đúng
   * cho nó là `CE` kèm câu nói rõ.
   *
   * `session` do đó phải là `let ... | null`: nhánh ném có thể xảy ra TRƯỚC khi
   * phiên tồn tại, nên `finally` không được giả định là nó đã có.
   */
  let session: K8sEngineSession | null = null;
  try {
    session = createSession({
      level: replayLevel(initialState),
      seed: seed ?? K8S_UNSEEDED_REPLAY_SEED,
      autoTick: false,
    });
    for (const action of actions) {
      /*
       * `as` sau khi đã biết `gameId === 'k8s'` (bộ gọi ở `problem-plugins.ts`
       * lọc chuyện đó). Vẫn cần ép: `core/` chỉ biết `target` là
       * `ResourceRefLike` (`kind: string`), còn `dispatch` đòi `ResourceRef`
       * (`kind: ResourceKind`). Kiểm lại `kind` ở đây là chép `resolveKind` sang
       * chỗ thứ hai, và không cần — một `kind` bịa ra không tra ra object nào
       * trong `reducer.ts` nên hành động không được chấp nhận, đúng như nó phải.
       * Cùng lập luận `k8s/replay-engine.ts:sessionReplayEngine` đã ghi.
       */
      session.dispatch(action as K8sGameAction);
    }
    state = session.getState();
  } catch (error) {
    return compileError(`phát lại nhật ký lỗi: ${errorText(error)}`);
  } finally {
    // `K8sSession` giữ một vòng lặp thời gian và tự nói phải gọi `dispose()`.
    // `finally` chứ không phải cuối hàm: nhánh ném ở trên cũng phải dọn.
    session?.dispose();
  }

  const passed: string[] = [];
  for (const testcase of testcases) {
    const predicate = PREDICATES[testcase.check as keyof typeof PREDICATES];
    try {
      if (predicate(state, testcase.args ?? {})) {
        passed.push(testcase.id);
      }
    } catch (error) {
      return compileError(`testcase "${testcase.id}" chấm lỗi: ${errorText(error)}`);
    }
  }

  return {
    verdict: problemVerdictOf(passed.length, testcases.length),
    passed,
    total: testcases.length,
    failedReason: null,
  };
}

/**
 * Lấy câu mô tả từ một thứ `catch` bắt được.
 *
 * `catch` trong TypeScript nhận `unknown` vì JavaScript ném được mọi giá trị.
 * `String(error)` trên một object lạ cho ra `[object Object]` — đúng cú pháp,
 * vô dụng với người đọc — nên tách nhánh `Error` ra.
 */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ── Plugin ──────────────────────────────────────────────────────────────────

/**
 * Plugin K8s. `seedSpec` cố ý VẮNG MẶT, và đó là một lời khai chứ không phải
 * một chỗ bỏ trống.
 *
 * `core/problem-plugin.ts` chốt: `seedSpec` thiếu nghĩa là **mọi bài K8s buộc
 * phải `seedable: false`**. Hôm nay đúng như vậy — không có đường nào trong
 * `k8s/` sinh một `ClusterSpec` biến thể theo seed (`seededIncident` nằm trong
 * chính spec, do tác giả đặt, không do seed sinh ra). Khai một `seedSpec` trả
 * thẳng `base` sẽ là lời nói dối tệ hơn nhiều so với việc vắng mặt: cổng
 * §18.G.3 sẽ cho một kỳ thi `per-student` chạy, và mỗi sinh viên nhận **cùng một
 * đề** trong khi hệ thống khai là đề riêng.
 */
export const K8S_PROBLEM_PLUGIN: GameProblemPlugin<ClusterSpec, K8sActionShape> = {
  gameId: 'k8s',
  codePrefix: K8S_PROBLEM_CODE_PREFIX,
  topics: K8S_PROBLEM_TOPICS,
  predicateNames: PREDICATE_NAMES,
  initialSpec: () => ({
    // Một node, một namespace, không tài nguyên: đủ để engine chạy và đủ để
    // người soạn thấy ngay mình phải điền gì. Hàm chứ không phải hằng dùng chung
    // — hai tab soạn bài cùng trỏ vào một object thì sửa tab này đổi luôn tab
    // kia (`core/problem-plugin.ts` ghi rõ lý do).
    nodes: [{ name: 'node-1', cpu: 2000, memory: 4096, ready: true }],
    namespaces: ['default'],
    resources: [],
  }),
  authorFields: K8S_AUTHOR_FIELDS,
  grade: gradeK8sProblem,
};
