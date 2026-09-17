/**
 * Ghim plugin OJ của game CI/CD — §19.H.
 *
 * Mỗi khối dưới đây nói ra thứ nó BẮT ĐƯỢC nếu hỏng. Một test không nói được
 * điều đó là một test không ai biết nó có còn gác gì không.
 *
 * ⛔ KHÔNG DÁN MỘT BẢN YAML VIẾT TAY VÀO FILE NÀY, và đây không phải chuyện
 * thẩm mỹ. Cổng `scripts/check-cicd-vendor-neutral.mjs` quét CẢ thư mục
 * `cicd/`, kể cả chú thích, và một khoá của nhà cung cấp CI nằm trong một chuỗi
 * là đúng hình dạng nó bắt. Nên mọi nguồn YAML ở đây dựng bằng cách cho một
 * `WorkflowSpec` đi qua `writeWorkflowYaml` — không một chữ nào của nhà cung cấp
 * xuất hiện trong file, VÀ phép đo chạy trên đúng cặp ghi/đọc mà người chơi
 * dùng thật. Một chuỗi viết tay chỉ đo lại giả định của người viết test.
 */

import { describe, expect, it } from 'vitest';

import type { GradeResult, Testcase } from '../core/problem.ts';
import type { CicdGameAction } from './action.ts';
import type { CicdCdPolicies } from './cd-contract.ts';
import type { StageId, StageSpec, WorkflowSpec } from './contract.ts';
import type { CicdPlayerOverrides } from './hydrate.ts';
import type { CicdProblemSpec } from './problem-plugin.ts';
import {
  CICD_IMPLEMENTED_PREDICATE_NAMES,
  CICD_PROBLEM_CODE_PREFIX,
  CICD_PROBLEM_PLUGIN,
  gradeCicdProblem,
} from './problem-plugin.ts';
import {
  CD_PREDICATE_NEEDS,
  CD_SIMULATION_PREDICATES,
  CICD_PREDICATES,
  UNIMPLEMENTED_CICD_PREDICATES,
} from './predicates.ts';
import { writeWorkflowYaml } from './yaml-write.ts';

// ── Dữ liệu dựng sẵn ────────────────────────────────────────────────────────

function tc(
  id: string,
  check: string,
  args: Readonly<Record<string, unknown>> = {},
): Testcase {
  return { id, label: id, check, args, visible: true };
}

/**
 * Một stage tối thiểu nhưng ĐỦ CHẠY: có bước, có hạng máy khớp `workload` mặc
 * định của plugin. Thiếu một trong hai thì `evaluate()` trả
 * `error.kind === 'unschedulable'` và phép đo đổi nghĩa mà không ai thấy.
 */
function stage(id: StageId, dependsOn: readonly StageId[] = []): StageSpec {
  return {
    id,
    kind: 'build',
    name: id,
    dependsOn,
    blocking: true,
    retries: 0,
    runnerClass: 'linux',
    steps: [
      { id: `buoc-${id}`, name: id, durationTicks: 2, blocking: true, script: `chay-${id}` },
    ],
  };
}

function workflow(...stages: readonly StageSpec[]): WorkflowSpec {
  return { name: 'Đường ống thử', stages };
}

/** Bộ ba mặc định của plugin, thay mỗi phần `workflow`. */
function specVoi(wf: WorkflowSpec): CicdProblemSpec {
  return { ...CICD_PROBLEM_PLUGIN.initialSpec(), workflow: wf };
}

/**
 * Một lượt nộp: bản YAML của `wf`, đi qua đúng bộ ghi mà giao diện dùng.
 *
 * Ba mảnh vì `evaluate` chở ba (19.J); `overrides`/`cd` mặc định là "chưa xoay
 * núm nào" / "bài không có CD" — tức đúng thứ một lượt nộp trần trông như thế.
 */
function nop(
  wf: WorkflowSpec,
  extra: {
    readonly overrides?: CicdPlayerOverrides;
    readonly cd?: CicdCdPolicies | null;
  } = {},
): CicdGameAction {
  return {
    gameId: 'cicd',
    tick: 0,
    kind: 'evaluate',
    source: writeWorkflowYaml(wf).yaml,
    overrides: extra.overrides ?? {},
    cd: extra.cd ?? null,
  };
}

function cham(input: {
  readonly initialState: CicdProblemSpec;
  readonly actions?: readonly CicdGameAction[];
  readonly testcases: readonly Testcase[];
}): GradeResult {
  return gradeCicdProblem({
    initialState: input.initialState,
    actions: input.actions ?? [],
    testcases: input.testcases,
    seed: 1,
  });
}

const CO_CLONE = tc('co-clone', 'stageExists', { stage: 'clone' });
const CO_KIEM_TRA = tc('co-kiem-tra', 'stageExists', { stage: 'kiem-tra' });
const KHONG_CO_VONG = tc('khong-co-vong', 'graphAcyclic', {});

// ── Định danh ───────────────────────────────────────────────────────────────

describe('định danh plugin', () => {
  /*
   * Bắt được: một lượt "dọn dẹp" đổi tiền tố về `CI` cho khớp hai game kia (ba
   * ký tự). Game này ship cả chương CD, nên `CI-0007` trên một bài phát hành
   * đặt tên sai cho đúng nửa mà hợp đồng đã dành chỗ. Tiền tố là khoá chính
   * trong DB — đổi sau khi có dữ liệu thì không đổi được.
   */
  it('tiền tố là `CICD`, và hợp lệ theo luật của `isProblemCode`', () => {
    expect(CICD_PROBLEM_CODE_PREFIX).toBe('CICD');
    expect(CICD_PROBLEM_PLUGIN.codePrefix).toBe('CICD');
    expect(/^[A-Z0-9]+$/.test(CICD_PROBLEM_PLUGIN.codePrefix)).toBe(true);
  });

  it('`gameId` đúng game', () => {
    expect(CICD_PROBLEM_PLUGIN.gameId).toBe('cicd');
  });

  /*
   * ⛔ Ô này sẽ ĐỎ vào đúng ngày ai đó khai `seedSpec`, và lúc đó nó phải được
   * ĐẢO (khẳng định sinh đề chạy thật), không phải xoá đi. `core/problem-plugin.ts`
   * chốt: thiếu `seedSpec` ⇒ mọi bài CI/CD buộc `seedable: false`, và biên ghi
   * đang dựa vào đúng lời khai đó (`validate.ts` chặn `seedable: true`).
   */
  it('KHÔNG khai `seedSpec` — mọi bài CI/CD buộc `seedable: false`', () => {
    expect(CICD_PROBLEM_PLUGIN.seedSpec).toBeUndefined();
  });

  /*
   * BỐN ô `json` phẳng ở cấp cao nhất (ô `cd` thêm ở 19.J.2.1). Bắt được: ai đó
   * đổi sang đường có dấu chấm (`evaluation.baseSeed`) — form của trang soạn bài
   * đọc `props.value[field.path]` NGUYÊN VĂN, nên một đường như vậy tra ra
   * `undefined` và ô đó không bao giờ lưu được gì, im lặng.
   */
  it('`authorFields` là bốn khoá PHẲNG, khớp đúng bốn mảnh của đề bài', () => {
    expect(CICD_PROBLEM_PLUGIN.authorFields.map((field) => field.path)).toEqual([
      'workflow',
      'workload',
      'evaluation',
      'cd',
    ]);
    for (const field of CICD_PROBLEM_PLUGIN.authorFields) {
      expect(field.path).not.toContain('.');
      expect(field.label.length, field.path).toBeGreaterThan(0);
    }
  });

  /*
   * ⛔ `cd` là ô DUY NHẤT không bắt buộc, và nó phải giữ nguyên như vậy.
   *
   * Bắt được: một lượt "cho nhất quán" đánh `required: true` lên cả bốn ô. Lúc
   * đó mọi bài thuần CI — tức toàn bộ chương một, 14 màn — không lưu được nữa,
   * và thông điệp lỗi sẽ đòi người soạn khai một kịch bản phát hành cho một bài
   * dạy cache.
   */
  it('chỉ ô `cd` là tuỳ chọn; ba ô kia bắt buộc', () => {
    const batBuoc = new Map(
      CICD_PROBLEM_PLUGIN.authorFields.map((field) => [
        field.path,
        'required' in field ? field.required : null,
      ]),
    );
    expect(batBuoc.get('workflow')).toBe(true);
    expect(batBuoc.get('workload')).toBe(true);
    expect(batBuoc.get('evaluation')).toBe(true);
    expect(batBuoc.get('cd')).toBe(false);
  });
});

// ── Vị từ: khớp hai chiều ───────────────────────────────────────────────────

describe('predicateNames — khớp hiện thực CẢ HAI CHIỀU', () => {
  /*
   * Hợp đồng đòi đúng chữ này: *"mọi tên ở đây có hiện thực, VÀ mọi hiện thực
   * có tên ở đây"*.
   *
   * ⛔ Ô này ĐÃ ĐẢO ở 19.J, không phải ghim lại một con số mới. Bản trước cộng
   * ba tập (`khai` + `chưa hiện thực` + `cần mô phỏng CD`) vì tám vị từ CD bị
   * trừ khỏi tập khai. Nay chúng khai được, nên phép cộng đó sẽ ĐẾM ĐÔI tám tên
   * và đỏ — và cách sửa ĐÚNG là bỏ vế thứ ba đi, không phải `new Set()` cho nó
   * im: một `Set` ở đây sẽ nuốt luôn ca "một tên nằm ở cả hai danh sách", đúng
   * cái mâu thuẫn mà ô này tồn tại để bắt.
   */
  it('tập khai + tập chưa hiện thực = đúng bảng `CICD_PREDICATES`', () => {
    expect([...CICD_IMPLEMENTED_PREDICATE_NAMES, ...UNIMPLEMENTED_CICD_PREDICATES].sort()).toEqual(
      Object.keys(CICD_PREDICATES).sort(),
    );
  });

  /*
   * ⛔ ĐẢO của ô cũ *"tập khai KHÔNG chứa vị từ cần mô phỏng CD"*. Bài OJ nay
   * CHỞ kịch bản (`CicdProblemSpec.cd`), nên vế cũ đã thành sai — giữ nó là
   * khoá vĩnh viễn nửa CD của game khỏi chế độ làm bài.
   *
   * Bắt được: một lượt lùi đưa bộ lọc `CD_SIMULATION_PREDICATES` trở lại
   * `CICD_IMPLEMENTED_PREDICATE_NAMES`. Lúc đó trang soạn bài lặng lẽ mất tám
   * lựa chọn, và không gì đỏ ngoài ô này.
   */
  it('tập khai CHỨA đủ tám vị từ CD — chúng chấm được khi bài có kịch bản', () => {
    const khai: readonly string[] = CICD_IMPLEMENTED_PREDICATE_NAMES;
    expect(CD_SIMULATION_PREDICATES.filter((name) => !khai.includes(name))).toEqual([]);
  });

  /*
   * Bảng gác của 19.J.1.4 phải phủ ĐÚNG tập vị từ CD, hai chiều.
   *
   * Thiếu một tên: vị từ đó đi qua cổng mà không ai hỏi nó cần khối nào, rồi trả
   * `false` ở mọi lượt nộp — bài không giải được, không gì đỏ. Thừa một tên:
   * cổng đòi một khối kịch bản cho một vị từ không đọc khối nào, tức từ chối
   * những bài hoàn toàn hợp lệ.
   */
  it('`CD_PREDICATE_NEEDS` phủ đúng `CD_SIMULATION_PREDICATES`, không thiếu không thừa', () => {
    expect(Object.keys(CD_PREDICATE_NEEDS).sort()).toEqual([...CD_SIMULATION_PREDICATES].sort());
  });

  /*
   * Và mọi giá trị phải là một khối `cd` CÓ THẬT. Bắt được: một lỗi gõ
   * (`'realease'`) làm cổng đòi một khối không bao giờ tồn tại, tức chặn sạch
   * mọi bài dùng vị từ đó — im lặng, vì chuỗi nào cũng biên dịch nếu kiểu nới.
   */
  it('mọi khối `CD_PREDICATE_NEEDS` trỏ tới là một trong ba bộ mô phỏng', () => {
    expect([...new Set(Object.values(CD_PREDICATE_NEEDS))].sort()).toEqual([
      'gitops',
      'masking',
      'release',
    ]);
  });

  /*
   * Chiều còn lại, và là chiều bảo vệ người soạn: một tên chưa hiện thực lọt
   * vào tập khai sẽ hiện trong ô chọn vị từ của trang soạn bài, và mọi lượt nộp
   * vào bài đó sẽ `CE` — một bài không ai giải được, không ai biết vì sao.
   */
  it('tập khai KHÔNG chứa tên nào chưa hiện thực', () => {
    const chuaHienThuc: readonly string[] = UNIMPLEMENTED_CICD_PREDICATES;
    expect(CICD_IMPLEMENTED_PREDICATE_NAMES.filter((name) => chuaHienThuc.includes(name))).toEqual(
      [],
    );
  });

  it('plugin khai đúng tập đã trừ đó', () => {
    expect(CICD_PROBLEM_PLUGIN.predicateNames).toEqual(CICD_IMPLEMENTED_PREDICATE_NAMES);
  });
});

// ── `initialSpec` ───────────────────────────────────────────────────────────

describe('initialSpec — bộ ba, mới mỗi lần gọi', () => {
  /*
   * Bắt được đúng cái bẫy `core/problem-plugin.ts` nêu: một hằng dùng chung thì
   * hai tab soạn bài trỏ vào cùng một object, và sửa tab này đổi luôn tab kia.
   * Triệu chứng là "tự nhiên mất dữ liệu", không phải một lỗi.
   */
  it('hai lần gọi cho hai object khác nhau, sâu tới từng mảnh', () => {
    const a = CICD_PROBLEM_PLUGIN.initialSpec();
    const b = CICD_PROBLEM_PLUGIN.initialSpec();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.workflow).not.toBe(b.workflow);
    expect(a.workload).not.toBe(b.workload);
  });

  /*
   * Bắt được: một bộ ba mặc định mà `evaluate()` từ chối — hạng máy không khớp
   * pool, hay stage không có bước. Người soạn mở bài mới ra sẽ thấy MỌI testcase
   * trượt trước cả khi gõ gì, và đi tìm lỗi trong bài của mình.
   *
   * ⚠ Ba commit chứ không phải một, đúng lời hợp đồng: một commit làm thông
   * lượng thành đúng `1 / leadTime`, tức trục thứ hai trở thành một phép chia
   * của trục thứ nhất và không đo được gì nữa.
   */
  it('bộ ba mặc định CHẠY được: stage đầu có thật, đồ thị không vòng', () => {
    const ket = cham({
      initialState: CICD_PROBLEM_PLUGIN.initialSpec(),
      testcases: [CO_CLONE, KHONG_CO_VONG],
    });
    expect(ket).toEqual({
      verdict: 'AC',
      passed: ['co-clone', 'khong-co-vong'],
      total: 2,
      failedReason: null,
      failedCode: null,
    });
    expect(CICD_PROBLEM_PLUGIN.initialSpec().workload.commits.length).toBeGreaterThanOrEqual(3);
  });
});

// ── Nhật ký: bản nộp CUỐI quyết định ────────────────────────────────────────

describe('workflow nào được chấm', () => {
  /*
   * Bài có SẴN hai job độc lập; người làm chỉ nối cạnh. Bản trước cho bài một job
   * rồi nộp thêm job `kiem-tra` — từ khi có khuôn tập job (`job-shapes.ts`) bài OJ
   * không cho thêm job, nên phép đo "bản nộp được đọc" chuyển sang thứ người làm
   * ĐƯỢC sửa: một cạnh phụ thuộc.
   */
  const BAI = specVoi(workflow(stage('clone'), stage('kiem-tra')));
  const CO_CANH = tc('co-canh', 'stageDependsOn', { stage: 'kiem-tra', on: 'clone' });
  const NOI_CANH = workflow(stage('clone'), stage('kiem-tra', ['clone']));

  /*
   * ⛔ Cặp ô này đi CÙNG NHAU và không tách được. Ô dưới một mình vẫn xanh trên
   * một hiện thực luôn chấm `initialState` (nó chỉ đang xác nhận cạnh chưa có);
   * ô trên một mình vẫn xanh trên một hiện thực luôn trả `AC`. Chỉ hai ô cạnh
   * nhau mới nói được rằng NGUỒN của lượt nộp thật sự được đọc.
   */
  it('KHÔNG có hành động nào ⇒ chấm `initialState.workflow`', () => {
    const ket = cham({ initialState: BAI, testcases: [CO_CANH] });
    expect(ket.verdict).toBe('WA');
    expect(ket.passed).toEqual([]);
    expect(ket.total).toBe(1);
  });

  it('có hành động nộp ⇒ chấm workflow trong bản YAML đó', () => {
    const ket = cham({ initialState: BAI, actions: [nop(NOI_CANH)], testcases: [CO_CANH] });
    expect(ket.verdict).toBe('AC');
    expect(ket.passed).toEqual(['co-canh']);
  });

  /*
   * Bắt được: một hiện thực gộp các bản nộp lại (lấy bản ĐẦU, hay hợp nhất
   * chúng). Mỗi lần nộp là một bản YAML ĐỘC LẬP — bản sau THAY bản trước, không
   * áp lên nó. Gộp lại thì người chơi sửa một workflow cho tệ đi vẫn giữ nguyên
   * điểm của bản tốt trước đó, và không gì đỏ.
   */
  it('nhiều lần nộp ⇒ chỉ bản CUỐI được chấm', () => {
    const ket = cham({ initialState: BAI, actions: [nop(NOI_CANH), nop(BAI.workflow)], testcases: [CO_CANH] });
    expect(ket.verdict).toBe('WA');
  });

  /*
   * Hành động mở gợi ý không đụng tới workflow. Bắt được: một hiện thực coi mọi
   * action là nguồn YAML và ném ở dòng `action.source` của một `hint`.
   */
  it('hành động mở gợi ý không đổi kết quả', () => {
    const goiY: CicdGameAction = { gameId: 'cicd', tick: 1, kind: 'hint', index: 0 };
    const ket = cham({ initialState: BAI, actions: [nop(NOI_CANH), goiY], testcases: [CO_CANH] });
    expect(ket.verdict).toBe('AC');
  });

  it('nộp thêm một job bài không có ⇒ WA (khuôn tập job), không lặng lẽ chấm job đó với thời lượng 0', () => {
    const them = workflow(stage('clone'), stage('kiem-tra'), stage('lint'));
    const ket = cham({ initialState: BAI, actions: [nop(them)], testcases: [tc('co-lint', 'stageExists', { stage: 'lint' })] });
    expect(ket.verdict).toBe('WA');
  });
});

// ── Bản nộp phải được GHÉP trước khi chấm ─────────────────────────────────────

describe('bản nộp YAML được ghép với dữ liệu bài trước khi chấm', () => {
  /*
   * YAML không chở `durationTicks`, nên bộ đọc để 0. Chấm thẳng bản đọc được là
   * chấm một đường ống dài 0 giây: đo 2026-09-16, nộp YAML lời giải c01 ⇒
   * `leadTimeUnder 1 giây` ra AC. Mọi testcase về thời gian thành "nộp YAML nào
   * đọc được cũng qua".
   *
   * ⛔ Cặp ô, như khối trên: ô đầu một mình xanh trên một bộ chấm luôn trả WA;
   * ô sau một mình xanh trên bộ chấm cũ.
   */
  const BAI = specVoi(workflow(stage('clone')));

  it('ngưỡng rộng ⇒ AC — bản nộp chấm được, không phải bị từ chối', () => {
    const ket = cham({ initialState: BAI, actions: [nop(BAI.workflow)], testcases: [tc('nhanh', 'leadTimeUnder', { seconds: 100_000 })] });
    expect(ket.verdict).toBe('AC');
  });

  it('ĐỔI TÊN bước để thời lượng về 0 ⇒ WA, không phải AC (khuôn job, review PR #141)', () => {
    const doiTen = workflow({ ...stage('clone'), steps: [{ id: 'doi-ten', name: 'clone', durationTicks: 2, blocking: true }] });
    const ket = cham({ initialState: BAI, actions: [nop(doiTen)], testcases: [tc('sieu-nhanh', 'leadTimeUnder', { seconds: 1 })] });
    expect(ket.verdict).toBe('WA');
    expect(ket.failedCode).toBeNull();
  });

  it('ngưỡng 1 giây ⇒ WA — thời lượng lấy lại từ bài, không phải 0', () => {
    const ket = cham({ initialState: BAI, actions: [nop(BAI.workflow)], testcases: [tc('sieu-nhanh', 'leadTimeUnder', { seconds: 1 })] });
    expect(ket.verdict).toBe('WA');
  });
});

// ── `WA` chứ KHÔNG phải `CE`: đồ thị có vòng ────────────────────────────────

describe('đồ thị có chu trình là câu trả lời SAI, không phải bài hỏng', () => {
  /*
   * ⛔ Ô GÁC QUAN TRỌNG NHẤT CỦA FILE NÀY.
   *
   * Một workflow có vòng làm `evaluate()` trả `EvaluationRecord` mang
   * `error.kind === 'cycle'` và `passes` rỗng. Cám dỗ là đọc "chạy không tới
   * nơi" ⇒ `CE`. Nhưng `graphAcyclic` là một vị từ THẬT, đọc `ctx.workflow`
   * bằng `findCycle` chứ không đọc bản ghi, và nó tồn tại để chấm ĐÚNG cái đầu
   * vào có vòng đó.
   *
   * Trả `CE` ở đây biến mọi bài "hãy gỡ vòng phụ thuộc" thành bài không bao giờ
   * chấm được, và người làm nhận một thông điệp nói BÀI SOẠN HỎNG trong khi bài
   * hoàn toàn đúng — họ sẽ đi báo lỗi thay vì đi sửa đồ thị.
   */
  it('vòng phụ thuộc ⇒ `WA` kèm đủ `total`, KHÔNG phải `CE`', () => {
    const ket = cham({
      initialState: specVoi(workflow(stage('a', ['b']), stage('b', ['a']))),
      testcases: [KHONG_CO_VONG],
    });
    expect(ket.verdict).toBe('WA');
    expect(ket.passed).toEqual([]);
    expect(ket.total).toBe(1);
    expect(ket.failedCode).toBeNull();
    expect(ket.failedReason).toBeNull();
  });

  /*
   * Đối chứng dương ở chiều ngược lại: gỡ đúng một cạnh thì vị từ ĐẠT. Không có
   * vế này thì một hiện thực "`graphAcyclic` luôn trả `false`" vẫn làm ô trên
   * xanh, và bài trở thành không giải được theo một kiểu khác.
   */
  it('gỡ cạnh gây vòng thì vị từ ĐẠT', () => {
    const ket = cham({
      initialState: specVoi(workflow(stage('a'), stage('b', ['a']))),
      testcases: [KHONG_CO_VONG],
    });
    expect(ket.verdict).toBe('AC');
  });
});

// ── Mọi đường `CE` đều phải ỒN ÀO ───────────────────────────────────────────

describe('bài không chấm được thì nói ra', () => {
  const BAI = specVoi(workflow(stage('clone')));

  it('không có testcase nào ⇒ `CE` mang đúng mã `chua-co-testcase`', () => {
    const ket = cham({ initialState: BAI, testcases: [] });
    expect(ket.verdict).toBe('CE');
    expect(ket.failedCode).toBe('chua-co-testcase');
    expect(ket.total).toBe(0);
  });

  /*
   * Tác giả gõ nhầm tên vị từ. Bỏ qua nó nghĩa là một testcase vĩnh viễn đỏ,
   * trông y hệt một lời giải sai.
   */
  it('vị từ không tồn tại ⇒ `CE` kèm chính cái tên đã gõ', () => {
    const ket = cham({
      initialState: BAI,
      testcases: [tc('go-nham', 'khong-co-vi-tu-nao-ten-the-nay')],
    });
    expect(ket.verdict).toBe('CE');
    expect(ket.failedReason).toContain('khong-co-vi-tu-nao-ten-the-nay');
  });

  /*
   * ĐẢO 2026-09-17, đúng như chú thích cũ ở đây dặn ("phải được ĐẢO, không phải
   * nới cho xanh"). 19.B hiện thực xong mọi vị từ CD, nên:
   * - vị từ đọc bản ghi ĐƯỜNG ỐNG (`promotedArtifactUnchanged`) CHẤM THẬT ở OJ;
   * - vị từ đọc bản ghi MÔ PHỎNG (`CD_SIMULATION_PREDICATES`) vẫn `CE`, nhưng vì lý
   *   do khác — bài OJ không chở kịch bản — và thông điệp phải nói đúng lý do đó.
   */
  it('vị từ CD đọc bản ghi đường ống chấm thật ở OJ — không còn `CE`', () => {
    expect(UNIMPLEMENTED_CICD_PREDICATES).toEqual([]);
    const ket = cham({
      initialState: BAI,
      testcases: [tc('thang-hang', 'promotedArtifactUnchanged', { output: 'image', from: 'staging', to: 'prod' })],
    });
    // Bài mẫu không phát hành gì ⇒ không có gì để so ⇒ WA (luật 4), KHÔNG phải CE.
    expect(ket.verdict).toBe('WA');
  });

  it('vị từ cần bản ghi mô phỏng CD ⇒ `CE` nói rõ là thiếu kịch bản', () => {
    expect(CD_SIMULATION_PREDICATES.length).toBeGreaterThan(0);
    for (const name of CD_SIMULATION_PREDICATES) {
      const ket = cham({ initialState: BAI, testcases: [tc('cd', name, { seconds: 10, max: 0, field: 'x' })] });
      expect(ket.verdict, name).toBe('CE');
      expect(ket.failedReason, name).toContain(name);
      expect(ket.failedReason, name).toContain('kịch bản');
    }
  });

  /*
   * Đối trọng của luật 3 ở `predicates.ts`: vị từ trả `false` khi thiếu tham số
   * để một bài viết sai không làm sập phiên chơi. KHÔNG gọi
   * `validateObjectiveArgs` ở tầng chấm thì một testcase gõ `stages` thay vì
   * `stage` sẽ không bao giờ qua được và không có gì đỏ ở đâu cả.
   */
  it('testcase thiếu tham số ⇒ `CE` chỉ thẳng tên tham số', () => {
    const ket = cham({
      initialState: BAI,
      testcases: [tc('thieu-tham-so', 'stageExists', { stages: 'clone' })],
    });
    expect(ket.verdict).toBe('CE');
    expect(ket.failedReason).toContain('stage');
  });

  /*
   * YAML người làm gõ không đọc được — đúng nghĩa §18.B.5. Thông điệp phải chở
   * DÒNG và CỘT: `yaml-read.ts` giữ chúng nguyên vẹn qua cả tầng quét để ô soạn
   * thảo gạch chân được, và gộp thành một câu chung chung ở tầng chấm là vứt đi
   * đúng thứ 19.C.3 tồn tại để có.
   *
   * Nguồn hỏng dựng bằng một tài liệu HAI PHẦN — bộ đọc từ chối nó tường minh,
   * nên phép đo không phụ thuộc vào chi tiết của bộ quét.
   */
  it('YAML không đọc được ⇒ `CE` chở theo vị trí lỗi', () => {
    const hong: CicdGameAction = {
      gameId: 'cicd',
      tick: 0,
      kind: 'evaluate',
      source: ['ten: mot', '---', 'ten: hai'].join('\n'),
      overrides: {},
      cd: null,
    };
    const ket = cham({ initialState: BAI, actions: [hong], testcases: [CO_CLONE] });
    expect(ket.verdict).toBe('CE');
    expect(ket.failedReason).toContain('dòng');
  });

  /*
   * `initialState` tới đây qua `gradeProblemRun` ở kiểu `unknown` rồi bị ép, và
   * hợp đồng nói thẳng rằng phép ép đó không kiểm được gì. Một bộ ba thiếu mảnh
   * phải hiện ra thành một `CE` đọc được, KHÔNG phải một ngoại lệ không ai bắt
   * ở giữa một điểm cuối HTTP.
   */
  it('`initialState` sai hình dạng ⇒ `CE`, không ném ra ngoài', () => {
    const ket = cham({
      initialState: { day: 'khong phai bo ba' } as unknown as CicdProblemSpec,
      testcases: [CO_CLONE],
    });
    expect(ket.verdict).toBe('CE');
    expect(ket.failedReason).not.toBeNull();
  });
});

// ── Tất định ────────────────────────────────────────────────────────────────

describe('grade — tất định', () => {
  /*
   * Bất biến sống còn của chế độ thi: client chấm tại chỗ, server chấm lại,
   * §18.C so hai verdict. Lệch nghĩa là người làm bị từ chối một bài họ giải
   * ĐÚNG, và triệu chứng trông như hệ thống từ chối người chơi ngẫu nhiên.
   *
   * Engine CI/CD có hạt giống riêng (`EvaluationSpec.baseSeed`) và rút qua khoá
   * chứ không qua một bộ sinh chạy dọc, nên chỗ duy nhất file plugin có thể làm
   * hỏng bất biến là chính nó.
   */
  it('hai lượt chấm cùng đầu vào cho kết quả y hệt', () => {
    const dauVao = {
      initialState: specVoi(workflow(stage('clone'), stage('kiem-tra', ['clone']))),
      actions: [nop(workflow(stage('clone'), stage('kiem-tra', ['clone'])))],
      testcases: [CO_CLONE, CO_KIEM_TRA, KHONG_CO_VONG],
    };
    expect(cham(dauVao)).toEqual(cham(dauVao));
  });

  /*
   * Hạt giống của LƯỢT NỘP không đi vào phép mô phỏng — nó chỉ là số ghi kèm
   * `Submission.seed`. Bắt được: ai đó nối `seed` vào `evaluate()` thay cho
   * `evaluation.baseSeed`, thứ làm cùng một lời giải đạt ở lượt này và trượt ở
   * lượt sau mà người làm không có cách nào đọc ra vì sao.
   */
  it('`seed` của lượt nộp không đổi verdict', () => {
    const chung = {
      initialState: CICD_PROBLEM_PLUGIN.initialSpec(),
      actions: [] as readonly CicdGameAction[],
      testcases: [CO_CLONE, KHONG_CO_VONG],
    };
    expect(gradeCicdProblem({ ...chung, seed: 1 })).toEqual(
      gradeCicdProblem({ ...chung, seed: 987654 }),
    );
  });
});

// ── Bất biến `failedCode` ⇔ `CE` ────────────────────────────────────────────

/**
 * `core/problem.ts` § `GradeResult` tuyên: *"cả hai khác `null` đúng khi verdict
 * là `CE`"*. Kiểu không ép được điều đó, nên nó chỉ sống nhờ test — và một
 * plugin mới là đúng chỗ bất biến ấy dễ gãy nhất.
 */
describe('bất biến: `failedCode` khác `null` ĐÚNG KHI verdict là `CE`', () => {
  const BAI = specVoi(workflow(stage('clone')));
  const CA: readonly { readonly ten: string; readonly ket: GradeResult }[] = [
    { ten: 'qua hết (AC)', ket: cham({ initialState: BAI, testcases: [CO_CLONE] }) },
    { ten: 'trượt (WA)', ket: cham({ initialState: BAI, testcases: [CO_KIEM_TRA] }) },
    { ten: 'không testcase (CE)', ket: cham({ initialState: BAI, testcases: [] }) },
    {
      ten: 'vị từ lạ (CE)',
      ket: cham({ initialState: BAI, testcases: [tc('x', 'khong-ton-tai')] }),
    },
  ];

  for (const { ten, ket } of CA) {
    it(`${ten} — hai trường đi cùng nhịp`, () => {
      // Viết dưới dạng tương đương hai chiều chứ không phải hai phép kiểm rời:
      // một ô chỉ khẳng định "CE thì có mã" vẫn xanh khi MỌI lượt đều có mã.
      expect(ket.failedCode !== null).toBe(ket.verdict === 'CE');
      expect(ket.failedReason !== null).toBe(ket.verdict === 'CE');
    });
  }
});
