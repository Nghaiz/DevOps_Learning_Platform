/**
 * Ô nghiệm thu cho bộ chấm mục tiêu (`predicates.ts`).
 *
 * ## Ba điều file này khẳng định, và vì sao từng điều cần có
 *
 * 1. **Mọi tên trong `CICD_PREDICATE_NAMES` đều có hiện thực**, đọc danh sách từ
 *    chính hằng runtime chứ không chép tay. Thêm một tên vào hợp đồng mà quên bộ
 *    chấm là đỏ ngay — chép tay thì danh sách ở đây ôi đi cùng lúc với bảng tra
 *    và không gì phát hiện ra.
 *
 * 2. **Hai vị từ chương CD NÉM, mười bảy vị từ kia KHÔNG ném.** Cả hai chiều,
 *    vì một chiều là nửa cổng: chiều thứ nhất một mình để lọt việc hiện thực
 *    xong mà quên xoá tên khỏi danh sách "chưa làm"; chiều thứ hai một mình để
 *    lọt việc thêm một nhánh ném mới mà không ai khai.
 *
 * 3. **Mỗi vị từ có CẢ ca đạt LẪN ca trượt**, chạy trên `EvaluationRecord` do
 *    `evaluate()` THẬT sinh ra. Một bộ chấm chỉ có ca đạt là một bộ chấm chưa ai
 *    thấy nó nói "không" — nó có thể đang trả `true` trên mọi đầu vào và mọi ô
 *    vẫn xanh (`rules/green-that-proves-nothing.md`).
 *
 * ## Vì sao bản ghi dựng từ engine chứ không dựng tay
 *
 * Bộ chấm là thứ ĐỌC bản ghi của engine. Dựng tay một `EvaluationRecord` là tự
 * ra đề rồi tự chấm: nó chứng minh hàm đọc đúng cái mảng ta vừa gõ, không chứng
 * minh nó đọc đúng cái engine phát ra. Mọi bối cảnh dưới đây đi qua `evaluate()`.
 */

import { describe, expect, it } from 'vitest';

import {
  CICD_PREDICATE_ARGS,
  CICD_PREDICATES,
  UNIMPLEMENTED_CICD_PREDICATES,
  checkObjective,
  failingObjectiveIds,
  validateObjectiveArgs,
} from './predicates.ts';
import type { CicdScoringContext } from './predicates.ts';
import { CICD_PREDICATE_NAMES } from './contract.ts';
import type {
  CicdObjective,
  CicdPredicateName,
  EvaluationSpec,
  StageKind,
  StageSpec,
  StepSpec,
  WorkflowSpec,
  WorkloadSpec,
} from './contract.ts';
import { evaluate } from './engine.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Bộ dựng
// ═══════════════════════════════════════════════════════════════════════════

const MAY = 'may';

function buoc(id: string, durationTicks: number, them: Partial<StepSpec> = {}): StepSpec {
  return { id, name: id, durationTicks, blocking: true, ...them };
}

function giaiDoan(
  id: string,
  kind: StageKind,
  dependsOn: readonly string[],
  steps: readonly StepSpec[],
  them: Partial<StageSpec> = {},
): StageSpec {
  return {
    id,
    kind,
    name: id,
    dependsOn,
    steps,
    blocking: true,
    retries: 0,
    runnerClass: MAY,
    ...them,
  };
}

/**
 * Ba commit giãn rộng, ba máy chạy.
 *
 * Giãn rộng có chủ ý: thực thể của commit sau không bao giờ phải chờ máy do
 * commit trước giữ, nên chuỗi `blockedBy` không đứt và hai vị từ đường găng có
 * mẫu số khác 0. `predicates.ts` mô tả vì sao chuyện đứt chuỗi lại quan trọng.
 *
 * `nguon` đổi ở MỌI commit, `khoa` đổi ở commit thứ 3 — đủ để một cache khoá vào
 * `khoa` trúng ở commit 2 và trượt ở commit 3.
 */
const WORKLOAD: WorkloadSpec = {
  runners: [{ id: MAY, label: 'Máy chạy chung', count: 3 }],
  inputs: [
    { id: 'nguon', label: 'Mã nguồn', changesEvery: 1 },
    { id: 'khoa', label: 'Khoá phụ thuộc', changesEvery: 3 },
  ],
  commits: [
    { id: 'c1', tick: 0 },
    { id: 'c2', tick: 40 },
    { id: 'c3', tick: 80 },
  ],
};

const CHAM: EvaluationSpec = { baseSeed: 4711, passes: 3 };
/** Nhiều lượt hơn cho các bối cảnh có ngẫu nhiên, để phân bố đọc được. */
const CHAM_NHIEU: EvaluationSpec = { baseSeed: 4711, passes: 12 };

function chay(workflow: WorkflowSpec, cham: EvaluationSpec = CHAM): CicdScoringContext {
  return { workflow, record: evaluate(workflow, WORKLOAD, cham) };
}

// ── Bối cảnh ────────────────────────────────────────────────────────────────

const WF_NOI_TIEP: WorkflowSpec = {
  name: 'nối tiếp',
  stages: [
    giaiDoan('clone', 'clone', [], [buoc('lay-ma', 5)]),
    giaiDoan('dung', 'build', ['clone'], [buoc('bien-dich', 10, { produces: ['dist'] })]),
    giaiDoan('kiem-tra', 'unit-test', ['dung'], [buoc('chay-test', 10, { requires: ['dist'] })]),
  ],
};

/** Thêm `lint` không chặn, chạy song song, xong sớm ⇒ ngoài đường găng. */
const WF_CO_LINT: WorkflowSpec = {
  name: 'có lint',
  stages: [
    ...WF_NOI_TIEP.stages,
    giaiDoan('lint', 'lint', ['clone'], [buoc('soi-ma', 2)], { blocking: false }),
  ],
};

/** `kiem-tra` phụ thuộc BẮC CẦU vào `clone` qua `chuan-bi`. */
const WF_BAC_CAU: WorkflowSpec = {
  name: 'bắc cầu',
  stages: [
    giaiDoan('clone', 'clone', [], [buoc('lay-ma', 5)]),
    giaiDoan('chuan-bi', 'build', ['clone'], [buoc('cai-dat', 5)]),
    giaiDoan('kiem-tra', 'unit-test', ['chuan-bi'], [buoc('chay-test', 5)]),
  ],
};

const WF_CHU_TRINH: WorkflowSpec = {
  name: 'chu trình',
  stages: [
    giaiDoan('a', 'build', ['b'], [buoc('x', 5)]),
    giaiDoan('b', 'unit-test', ['a'], [buoc('y', 5)]),
  ],
};

/** `kiem-tra` cần `dist` nhưng không phụ thuộc vào nơi tạo ra nó ⇒ đỏ THẬT. */
const WF_THIEU_SAN_PHAM: WorkflowSpec = {
  name: 'thiếu sản phẩm',
  stages: [
    giaiDoan('clone', 'clone', [], [buoc('lay-ma', 5)]),
    giaiDoan('dung', 'build', ['clone'], [buoc('bien-dich', 10, { produces: ['dist'] })]),
    giaiDoan('kiem-tra', 'unit-test', ['clone'], [buoc('chay-test', 10, { requires: ['dist'] })]),
  ],
};

function wfCache(keyParts: readonly string[], invalidatedBy: readonly string[]): WorkflowSpec {
  return {
    name: 'có cache',
    stages: [
      giaiDoan('clone', 'clone', [], [buoc('lay-ma', 5)]),
      giaiDoan(
        'dung',
        'build',
        ['clone'],
        [
          buoc('bien-dich', 12, {
            cache: { id: 'phu-thuoc', keyParts, invalidatedBy, savesTicks: 6 },
          }),
        ],
      ),
    ],
  };
}

/** Khoá vào `khoa` (đổi thưa) ⇒ TRÚNG ở commit 2. Nội dung cũng phụ thuộc `khoa` ⇒ ĐÚNG. */
const WF_CACHE_TRUNG = wfCache(['khoa'], ['khoa']);
/** Khoá vào `khoa` nhưng nội dung phụ thuộc `nguon` ⇒ trúng một cache ÔI (C08). */
const WF_CACHE_OI = wfCache(['khoa'], ['nguon']);
/** Khoá vào `nguon` (đổi mọi commit) ⇒ KHÔNG BAO GIỜ trúng (C07). */
const WF_CACHE_RONG = wfCache(['nguon'], ['nguon']);

/** Đỏ giả loại `latent-defect` + có thử lại ⇒ khiếm khuyết bị retry che. */
const WF_FLAKE: WorkflowSpec = {
  name: 'đỏ giả che được',
  stages: [
    giaiDoan('clone', 'clone', [], [buoc('lay-ma', 5)]),
    giaiDoan(
      'kiem-tra',
      'unit-test',
      ['clone'],
      [buoc('chay-test', 8, { flake: { rate: 0.5, nature: 'latent-defect' } })],
      { retries: 3 },
    ),
  ],
};

const CTX_NOI_TIEP = chay(WF_NOI_TIEP);
const CTX_CO_LINT = chay(WF_CO_LINT);
const CTX_BAC_CAU = chay(WF_BAC_CAU);
const CTX_CHU_TRINH = chay(WF_CHU_TRINH);
const CTX_THIEU_SAN_PHAM = chay(WF_THIEU_SAN_PHAM);
const CTX_CACHE_TRUNG = chay(WF_CACHE_TRUNG);
const CTX_CACHE_OI = chay(WF_CACHE_OI);
const CTX_CACHE_RONG = chay(WF_CACHE_RONG);
const CTX_FLAKE = chay(WF_FLAKE, CHAM_NHIEU);

// ═══════════════════════════════════════════════════════════════════════════
// 1. Bảng tra phủ đúng hợp đồng
// ═══════════════════════════════════════════════════════════════════════════

describe('bảng tra phủ đúng `CICD_PREDICATE_NAMES`', () => {
  it('mọi tên trong hợp đồng đều có một hiện thực, và không có hiện thực thừa', () => {
    // Đọc từ hằng runtime, KHÔNG chép tay: một danh sách chép tay ở đây ôi đi
    // cùng lúc với bảng tra, nên nó không gác được gì.
    expect(Object.keys(CICD_PREDICATES).sort()).toEqual([...CICD_PREDICATE_NAMES].sort());
  });

  it('bảng tham số cũng phủ đúng từng ấy tên', () => {
    expect(Object.keys(CICD_PREDICATE_ARGS).sort()).toEqual([...CICD_PREDICATE_NAMES].sort());
  });

  it('danh sách "chưa hiện thực" chỉ chứa tên có thật trong hợp đồng', () => {
    for (const ten of UNIMPLEMENTED_CICD_PREDICATES) {
      expect(CICD_PREDICATE_NAMES).toContain(ten);
    }
  });
});

const DA_HIEN_THUC: readonly CicdPredicateName[] = CICD_PREDICATE_NAMES.filter(
  (ten) => !UNIMPLEMENTED_CICD_PREDICATES.includes(ten),
);

// ═══════════════════════════════════════════════════════════════════════════
// 2. Ném hay không ném — ghim CẢ HAI chiều
// ═══════════════════════════════════════════════════════════════════════════

describe('vị từ chưa hiện thực thì NÉM', () => {
  it.each(UNIMPLEMENTED_CICD_PREDICATES.map((ten) => [ten] as const))(
    '%s — ném kèm thông điệp nói ra được là nó chưa hiện thực',
    (ten) => {
      expect(() => CICD_PREDICATES[ten](CTX_NOI_TIEP, { seconds: 10 })).toThrow(/chưa hiện thực/);
    },
  );

  it.each(DA_HIEN_THUC.map((ten) => [ten] as const))(
    '%s — đã hiện thực nên KHÔNG ném, kể cả khi tham số rỗng',
    (ten) => {
      expect(() => CICD_PREDICATES[ten](CTX_NOI_TIEP, {})).not.toThrow();
    },
  );

  it('tham số thiếu thì trả `false`, không ném — lỗi của một level không được làm sập phiên chơi', () => {
    for (const ten of DA_HIEN_THUC) {
      if (CICD_PREDICATE_ARGS[ten].length === 0) continue;
      expect(CICD_PREDICATES[ten](CTX_NOI_TIEP, {})).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Ca đạt và ca trượt của từng vị từ
// ═══════════════════════════════════════════════════════════════════════════

interface CaThu {
  readonly dat: readonly [CicdScoringContext, Readonly<Record<string, unknown>>];
  readonly truot: readonly [CicdScoringContext, Readonly<Record<string, unknown>>];
}

/**
 * Mỗi vị từ đã hiện thực có đúng một ca đạt và một ca trượt.
 *
 * ⚠ Ca trượt KHÔNG được là "ngưỡng vô lý" ở những chỗ có thể dựng một tình
 * huống thật: `greenRateAtLeast` trượt trên một workflow ĐỎ THẬT, không trượt
 * bằng `rate: 2`. Một ngưỡng vô lý chỉ chứng minh phép so sánh chạy, không chứng
 * minh vị từ đọc đúng bản ghi.
 */
const CA_THU: Readonly<Record<string, CaThu>> = {
  graphAcyclic: {
    dat: [CTX_NOI_TIEP, {}],
    truot: [CTX_CHU_TRINH, {}],
  },
  stageExists: {
    dat: [CTX_NOI_TIEP, { stage: 'dung' }],
    truot: [CTX_NOI_TIEP, { stage: 'khong-ton-tai' }],
  },
  stageDependsOn: {
    // BẮC CẦU: `kiem-tra` → `chuan-bi` → `clone`, không có cạnh trực tiếp nào.
    dat: [CTX_BAC_CAU, { stage: 'kiem-tra', on: 'clone' }],
    truot: [CTX_BAC_CAU, { stage: 'clone', on: 'kiem-tra' }],
  },
  stageNotDependsOn: {
    dat: [CTX_CO_LINT, { stage: 'lint', on: 'dung' }],
    truot: [CTX_BAC_CAU, { stage: 'kiem-tra', on: 'clone' }],
  },
  stageCountAtMost: {
    dat: [CTX_NOI_TIEP, { max: 3 }],
    truot: [CTX_NOI_TIEP, { max: 2 }],
  },
  leadTimeUnder: {
    dat: [CTX_NOI_TIEP, { seconds: 100_000 }],
    truot: [CTX_NOI_TIEP, { seconds: 1 }],
  },
  throughputAtLeast: {
    dat: [CTX_NOI_TIEP, { perHour: 1 }],
    truot: [CTX_NOI_TIEP, { perHour: 100_000 }],
  },
  runnerMinutesUnder: {
    dat: [CTX_NOI_TIEP, { minutes: 100_000 }],
    truot: [CTX_NOI_TIEP, { minutes: 0.001 }],
  },
  greenRateAtLeast: {
    dat: [CTX_NOI_TIEP, { rate: 1 }],
    // Đỏ THẬT vì thiếu sản phẩm đầu vào, không phải vì một ngưỡng bịa ra.
    truot: [CTX_THIEU_SAN_PHAM, { rate: 1 }],
  },
  cacheHitsAtLeast: {
    dat: [CTX_CACHE_TRUNG, { count: 1 }],
    truot: [CTX_CACHE_RONG, { count: 1 }],
  },
  cacheNeverHits: {
    dat: [CTX_CACHE_RONG, { cache: 'phu-thuoc' }],
    truot: [CTX_CACHE_TRUNG, { cache: 'phu-thuoc' }],
  },
  noFailureCause: {
    dat: [CTX_NOI_TIEP, { cause: 'stale-cache' }],
    truot: [CTX_CACHE_OI, { cause: 'stale-cache' }],
  },
  retriesAtMost: {
    dat: [CTX_NOI_TIEP, { stage: 'dung', max: 0 }],
    truot: [CTX_FLAKE, { stage: 'kiem-tra', max: 0 }],
  },
  stageOnCriticalPath: {
    dat: [CTX_CO_LINT, { stage: 'kiem-tra', rate: 1 }],
    truot: [CTX_CO_LINT, { stage: 'lint', rate: 1 }],
  },
  stageOffCriticalPath: {
    dat: [CTX_CO_LINT, { stage: 'lint', rate: 1 }],
    truot: [CTX_CO_LINT, { stage: 'kiem-tra', rate: 1 }],
  },
  escapedDefectsAtMost: {
    dat: [CTX_NOI_TIEP, { max: 0 }],
    truot: [CTX_FLAKE, { max: 0 }],
  },
  stageNonBlocking: {
    dat: [CTX_CO_LINT, { stage: 'lint' }],
    truot: [CTX_CO_LINT, { stage: 'clone' }],
  },
};

describe('mỗi vị từ đã hiện thực có cả ca đạt lẫn ca trượt', () => {
  it('bảng ca thử phủ đúng tập vị từ đã hiện thực', () => {
    // Thêm một vị từ mà quên ca thử ⇒ đỏ ở đây, không lặng lẽ thiếu đối chứng.
    expect(Object.keys(CA_THU).sort()).toEqual([...DA_HIEN_THUC].sort());
  });

  it.each(DA_HIEN_THUC.map((ten) => [ten] as const))('%s — ca ĐẠT trả true', (ten) => {
    const ca = CA_THU[ten];
    expect(ca).toBeDefined();
    if (ca === undefined) return;
    expect(CICD_PREDICATES[ten](ca.dat[0], ca.dat[1])).toBe(true);
  });

  it.each(DA_HIEN_THUC.map((ten) => [ten] as const))('%s — ca TRƯỢT trả false', (ten) => {
    const ca = CA_THU[ten];
    expect(ca).toBeDefined();
    if (ca === undefined) return;
    expect(CICD_PREDICATES[ten](ca.truot[0], ca.truot[1])).toBe(false);
  });

  it('bỏ TỪNG tham số khai trong bảng ⇒ vị từ trả false', () => {
    // Đây là thứ ràng `CICD_PREDICATE_ARGS` với thân vị từ: hai chỗ cùng gọi tên
    // một tham số, và đổi tên ở một bên là đỏ ngay.
    for (const ten of DA_HIEN_THUC) {
      const ca = CA_THU[ten];
      if (ca === undefined) continue;
      for (const spec of CICD_PREDICATE_ARGS[ten]) {
        const thieu: Record<string, unknown> = { ...ca.dat[1] };
        delete thieu[spec.key];
        expect(
          CICD_PREDICATES[ten](ca.dat[0], thieu),
          `${ten} thiếu "${spec.key}" mà vẫn trả true`,
        ).toBe(false);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Không mục tiêu nào thoả được bằng cách XOÁ bằng chứng
// ═══════════════════════════════════════════════════════════════════════════

describe('xoá đối tượng đi KHÔNG thoả được mục tiêu', () => {
  it('`stageNotDependsOn` — xoá stage đi thì trả false, không phải true', () => {
    expect(CICD_PREDICATES.stageNotDependsOn(CTX_NOI_TIEP, { stage: 'lint', on: 'dung' })).toBe(
      false,
    );
  });

  it('`stageOffCriticalPath` — xoá `lint` đi thì trả false', () => {
    // Bỏ hẳn lint thì nó đương nhiên không nằm trên đường găng. Thoả mục tiêu
    // "đặt lint ở chỗ nó không cản ai" bằng cách không làm việc là xoá bài học.
    expect(CICD_PREDICATES.stageOffCriticalPath(CTX_NOI_TIEP, { stage: 'lint', rate: 1 })).toBe(
      false,
    );
  });

  it('`retriesAtMost` — xoá stage đi thì trả false', () => {
    expect(CICD_PREDICATES.retriesAtMost(CTX_NOI_TIEP, { stage: 'khong-con', max: 0 })).toBe(false);
  });

  it('`cacheNeverHits` — bỏ hẳn cache đi thì trả false', () => {
    expect(CICD_PREDICATES.cacheNeverHits(CTX_NOI_TIEP, { cache: 'phu-thuoc' })).toBe(false);
  });

  it('`stageDependsOn` — phụ thuộc vào một stage không tồn tại KHÔNG tính là đạt', () => {
    expect(CICD_PREDICATES.stageDependsOn(CTX_NOI_TIEP, { stage: 'dung', on: 'ma' })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Các cách đọc mà hợp đồng chốt, ghim riêng
// ═══════════════════════════════════════════════════════════════════════════

describe('cách đọc đã chốt trong hợp đồng', () => {
  it('`stageDependsOn` là BẮC CẦU, không phải trực tiếp', () => {
    // Chuỗi `clone → chuan-bi → kiem-tra` không có cạnh trực tiếp nào từ
    // `kiem-tra` tới `clone`. Đọc thành trực tiếp sẽ loại đúng lời giải B của
    // C01 — hợp đồng ghi rằng chuyện đó đã cắn thật.
    expect(
      CTX_BAC_CAU.workflow.stages.find((s) => s.id === 'kiem-tra')?.dependsOn,
    ).toEqual(['chuan-bi']);
    expect(CICD_PREDICATES.stageDependsOn(CTX_BAC_CAU, { stage: 'kiem-tra', on: 'clone' })).toBe(
      true,
    );
  });

  it('`stageNotDependsOn` là phủ định CHÍNH XÁC của `stageDependsOn`', () => {
    const cap = [
      { stage: 'kiem-tra', on: 'clone' },
      { stage: 'clone', on: 'kiem-tra' },
      { stage: 'chuan-bi', on: 'clone' },
    ];
    for (const args of cap) {
      expect(CICD_PREDICATES.stageNotDependsOn(CTX_BAC_CAU, args)).toBe(
        !CICD_PREDICATES.stageDependsOn(CTX_BAC_CAU, args),
      );
    }
  });

  it('`graphAcyclic` đọc ĐỒ THỊ, không đọc `EvaluationRecord.error`', () => {
    // Workflow vừa có cạnh treo vừa có vòng: `validateGraph` báo cạnh treo
    // TRƯỚC, nên bản ghi mang `unknown-dependency`. Một hiện thực đọc
    // `error?.kind !== 'cycle'` sẽ trả lời "không có chu trình" trong khi có.
    const wf: WorkflowSpec = {
      name: 'vừa treo vừa vòng',
      stages: [
        giaiDoan('a', 'build', ['b'], [buoc('x', 5)]),
        giaiDoan('b', 'unit-test', ['a', 'ma'], [buoc('y', 5)]),
      ],
    };
    const ctx = chay(wf);
    expect(ctx.record.error?.kind).toBe('unknown-dependency');
    expect(CICD_PREDICATES.graphAcyclic(ctx, {})).toBe(false);
  });

  it('`noFailureCause` với một `cause` lạ trả FALSE, không trả true', () => {
    // Trả `true` ở đây là một ô nghiệm thu luôn xanh vì nó tìm một thứ không tồn
    // tại được. Gõ nhầm dấu gạch thành gạch dưới là đủ để dựng ra nó.
    expect(CICD_PREDICATES.noFailureCause(CTX_CACHE_OI, { cause: 'stale_cache' })).toBe(false);
  });

  it('`cacheNeverHits` phân biệt "trúng khoá" với "nội dung đúng"', () => {
    // Cache ôi VẪN trúng khoá — đó chính là bài C08. Nên `cacheNeverHits` phải
    // trả false trên bản ghi có cache ôi, dù mỗi lần trúng là một lần đỏ thật.
    expect(CICD_PREDICATES.cacheNeverHits(CTX_CACHE_OI, { cache: 'phu-thuoc' })).toBe(false);
    expect(CICD_PREDICATES.noFailureCause(CTX_CACHE_OI, { cause: 'stale-cache' })).toBe(false);
  });

  it('hai vị từ đường găng bù nhau trên cùng một bản ghi', () => {
    // `on` và `off` chia cùng một mẫu số (các lượt phân định được), nên với
    // `rate: 1` đúng một trong hai đạt. Hai hiện thực rời nhau sẽ trôi khỏi
    // tính chất này mà không gì đỏ.
    for (const stage of ['clone', 'dung', 'kiem-tra', 'lint']) {
      const tren = CICD_PREDICATES.stageOnCriticalPath(CTX_CO_LINT, { stage, rate: 1 });
      const ngoai = CICD_PREDICATES.stageOffCriticalPath(CTX_CO_LINT, { stage, rate: 1 });
      expect(tren).not.toBe(ngoai);
    }
  });

  it('`escapedDefectsAtMost` chỉ đếm lần đỏ ĐÃ BỊ CHE, không đếm lần đỏ hiện ra', () => {
    // Cùng một tỷ lệ đỏ giả, KHÔNG thử lại ⇒ lỗi hiện ra, không lọt xuống đâu.
    const khongThuLai: WorkflowSpec = {
      name: 'không thử lại',
      stages: WF_FLAKE.stages.map((stage) =>
        stage.id === 'kiem-tra' ? { ...stage, retries: 0 } : stage,
      ),
    };
    const ctx = chay(khongThuLai, CHAM_NHIEU);
    expect(CICD_PREDICATES.escapedDefectsAtMost(ctx, { max: 0 })).toBe(true);
    expect(CICD_PREDICATES.escapedDefectsAtMost(CTX_FLAKE, { max: 0 })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Tầng gọi
// ═══════════════════════════════════════════════════════════════════════════

function mucTieu(check: CicdPredicateName, args: Readonly<Record<string, unknown>>): CicdObjective {
  return { id: `muc-${check}`, label: check, check, args, required: true };
}

describe('tầng gọi', () => {
  it('`checkObjective` đọc `args` của mục tiêu, và coi `args` vắng là rỗng', () => {
    expect(checkObjective(mucTieu('stageExists', { stage: 'dung' }), CTX_NOI_TIEP)).toBe(true);
    const khongArgs: CicdObjective = {
      id: 'khong-args',
      label: 'không args',
      check: 'graphAcyclic',
      required: true,
    };
    expect(checkObjective(khongArgs, CTX_NOI_TIEP)).toBe(true);
  });

  it('`checkObjective` NÉM khi mục tiêu trỏ tới vị từ chưa hiện thực', () => {
    expect(() => checkObjective(mucTieu('rollbackUnder', { seconds: 30 }), CTX_NOI_TIEP)).toThrow(
      /chưa hiện thực/,
    );
  });

  it('`failingObjectiveIds` lọc theo `required` và chỉ trả mục TRƯỢT', () => {
    const objectives: readonly CicdObjective[] = [
      mucTieu('stageExists', { stage: 'dung' }),
      mucTieu('stageExists', { stage: 'khong-ton-tai' }),
      { ...mucTieu('stageCountAtMost', { max: 1 }), id: 'thuong-truot', required: false },
      { ...mucTieu('graphAcyclic', {}), id: 'thuong-dat', required: false },
    ];
    expect(failingObjectiveIds(objectives, CTX_NOI_TIEP, true)).toEqual(['muc-stageExists']);
    expect(failingObjectiveIds(objectives, CTX_NOI_TIEP, false)).toEqual(['thuong-truot']);
  });

  it('`validateObjectiveArgs` bắt tham số thiếu, sai kiểu, và giá trị lạ', () => {
    expect(validateObjectiveArgs(mucTieu('stageExists', { stage: 'dung' }))).toBeNull();
    expect(validateObjectiveArgs(mucTieu('stageExists', {}))).toMatch(/thiếu tham số chuỗi/);
    expect(validateObjectiveArgs(mucTieu('stageCountAtMost', { max: 'ba' }))).toMatch(
      /thiếu tham số số học/,
    );
    expect(validateObjectiveArgs(mucTieu('noFailureCause', { cause: 'stale_cache' }))).toMatch(
      /giá trị lạ/,
    );
    expect(validateObjectiveArgs(mucTieu('noFailureCause', { cause: 'stale-cache' }))).toBeNull();
  });

  it('mọi ca ĐẠT trong bảng đều là mục tiêu hợp lệ theo `validateObjectiveArgs`', () => {
    // Nếu một ca đạt tự nó thiếu tham số thì ô "ca đạt trả true" đang đo một
    // đường khác đường mà level thật đi qua.
    for (const ten of DA_HIEN_THUC) {
      const ca = CA_THU[ten];
      if (ca === undefined) continue;
      expect(validateObjectiveArgs(mucTieu(ten, ca.dat[1]))).toBeNull();
    }
  });
});
