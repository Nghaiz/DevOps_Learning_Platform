/**
 * Ô nghiệm thu của chế độ làm bài CI/CD — 19.J.1.5 / J.1.7, AC-J2 · J3 · J4 · J8.
 *
 * Mỗi khối dưới đây nói ra thứ nó BẮT ĐƯỢC nếu hỏng. Một test không nói được
 * điều đó là một test không ai biết nó có còn gác gì không.
 *
 * Nửa còn lại của AC-J5 (tất định ở `jsdom`) nằm ở `problem-oj.jsdom.test.ts`,
 * chạy trên CÙNG bộ đề của `problem-oj-fixture.ts`.
 */

import { describe, expect, it } from 'vitest';

import type { Testcase } from '../core/problem.ts';
import type { CicdGameAction } from './action.ts';
import {
  CD_DI_TIEP,
  CD_LUI,
  OJ_WORKFLOW,
  baiCanary,
  baiCi,
  ojNop,
  ojStage,
  ojWorkflow,
} from './problem-oj-fixture.ts';
import type { CicdProblemSpec } from './problem-plugin.ts';
import { gradeCicdProblem } from './problem-plugin.ts';

function tc(id: string, check: string, args: Readonly<Record<string, unknown>> = {}): Testcase {
  return { id, label: id, check, args, visible: true };
}

function cham(input: {
  readonly initialState: CicdProblemSpec;
  readonly actions?: readonly CicdGameAction[];
  readonly testcases: readonly Testcase[];
  readonly seed?: number;
}) {
  return gradeCicdProblem({
    initialState: input.initialState,
    actions: input.actions ?? [],
    testcases: input.testcases,
    seed: input.seed ?? 1,
  });
}

/**
 * Rút khỏi bản xấu trong dưới hai phút.
 *
 * ⚠ Vị từ này chọn sau khi ĐO, không phải chọn theo tên nghe hợp lý. Ứng viên
 * đầu là `badReleasePromotedAtMost { max: 0 }`, và nó KHÔNG phân biệt được hai
 * chính sách: canary 5% với `maxErrorRateDelta: 0.03` phát hiện bản xấu và dừng
 * TRƯỚC khi thăng hạng ở cả hai đường, nên cả `rollback` lẫn `roll-forward` đều
 * ra AC. `onBadRelease` quyết định chuyện xảy ra SAU khi phát hiện, và
 * `rollbackUnder` là vị từ đọc đúng quãng đó: lùi thì nhanh, còn vá-đi-tới phải
 * chờ `fixForwardSeconds` của kịch bản (300 giây).
 */
const LUI_DUOI_HAI_PHUT = tc('lui-duoi-hai-phut', 'rollbackUnder', { seconds: 120 });

// ── AC-J2: núm retries/cache tới được bộ chấm ───────────────────────────────

describe('AC-J2 — bảng núm đi vào phép chấm', () => {
  /*
   * Bắt được: `gradeCicdProblem` bỏ `action.overrides` khi gọi `hydrateWorkflow`
   * — đúng trạng thái trước 19.J, và nó hỏng CÂM. Bảng núm trên màn làm bài vẫn
   * xoay được, vẫn hiện số, và verdict không nhúc nhích; không ô nào đỏ vì cả
   * hai lượt chấm đều chạy tới nơi và đều trả một verdict hợp lệ.
   *
   * Cặp giá trị chọn quanh ngưỡng của `retriesAtMost { max: 0 }`: nộp không xoay
   * núm ⇒ stage giữ `retries: 0` ⇒ AC; xoay lên 2 ⇒ WA. Nếu `overrides` bị bỏ
   * rơi, hai lượt ra CÙNG verdict và ô này đỏ.
   */
  it('cùng YAML, hai bộ `overrides` khác nhau ⇒ hai kết quả khác nhau', () => {
    const bai = baiCi();
    const testcases = [tc('it-thu-lai', 'retriesAtMost', { stage: 'kiem-tra', max: 0 })];

    const khongXoay = cham({ initialState: bai, actions: [ojNop(OJ_WORKFLOW)], testcases });
    const xoay = cham({
      initialState: bai,
      actions: [ojNop(OJ_WORKFLOW, { overrides: { retries: { 'kiem-tra': 2 } } })],
      testcases,
    });

    expect(khongXoay.verdict).toBe('AC');
    expect(xoay.verdict).toBe('WA');
  });
});

// ── AC-J3: chính sách CD tới được bộ chấm ───────────────────────────────────

describe('AC-J3 — chính sách CD đi vào phép chấm', () => {
  /*
   * Bắt được: `grade` không chạy `runLevelCd`, hoặc chạy nó với `cd.initial`
   * thay vì chính sách của lượt nộp. Cả hai đều làm mọi bài CD thành bài mà
   * bảng núm không đổi được gì — người làm xoay núm đúng vẫn trượt, và thông
   * điệp duy nhất họ nhận là "chưa đạt".
   */
  it('cùng YAML, hai bộ `cd` khác nhau ⇒ hai verdict khác nhau', () => {
    const bai = baiCanary();
    const testcases = [LUI_DUOI_HAI_PHUT];

    const lui = cham({ initialState: bai, actions: [ojNop(OJ_WORKFLOW, { cd: CD_LUI })], testcases });
    const diTiep = cham({
      initialState: bai,
      actions: [ojNop(OJ_WORKFLOW, { cd: CD_DI_TIEP })],
      testcases,
    });

    expect(lui.verdict).toBe('AC');
    expect(diTiep.verdict).toBe('WA');
  });

  /*
   * Cổng 19.J.1.4 với ĐỐI CHỨNG DƯƠNG: cùng một testcase, một đề CÓ khối
   * `cd.release` và một đề KHÔNG. Chỉ đề thiếu khối mới được `CE`.
   *
   * Không có vế dương, ô này vẫn xanh khi cổng chặn NHẦM mọi bài CD — tức là
   * xanh trong khi tính năng chết. Đó đúng là hình dạng "một cổng không bao giờ
   * đỏ vì thứ nó định gác" mà `rules/green-that-proves-nothing.md` gọi tên.
   */
  it('vị từ CD trên đề THIẾU khối kịch bản ⇒ `CE` nói rõ thiếu khối nào', () => {
    const thieu = cham({ initialState: baiCi(), testcases: [LUI_DUOI_HAI_PHUT] });
    expect(thieu.verdict).toBe('CE');
    expect(thieu.failedReason).toContain('cd.release');

    const du = cham({
      initialState: baiCanary(),
      actions: [ojNop(OJ_WORKFLOW, { cd: CD_LUI })],
      testcases: [LUI_DUOI_HAI_PHUT],
    });
    expect(du.verdict).toBe('AC');
  });

  /*
   * Vị từ đọc bộ mô phỏng KHÁC với bộ mà đề khai. Bắt được: một cổng chỉ hỏi
   * "đề có khối `cd` nào không" thay vì "đề có ĐÚNG khối vị từ này đọc không" —
   * bài sẽ lưu được, chấm được, và trượt vĩnh viễn.
   */
  it('vị từ `masking` trên đề chỉ có `release` ⇒ `CE`', () => {
    const ket = cham({
      initialState: baiCanary(),
      testcases: [tc('khong-ro-bi-mat', 'secretLeaksAtMost', { max: 0 })],
    });
    expect(ket.verdict).toBe('CE');
    expect(ket.failedReason).toContain('cd.masking');
  });
});

// ── AC-J4: máy chủ khoá chính sách ──────────────────────────────────────────

describe('AC-J4 — chính sách ngoài `editable` bị bỏ', () => {
  /*
   * Ô CHỐNG LÁCH quan trọng nhất của chương CD.
   *
   * Đề dưới đây khai `editable: []` — người làm chỉ QUAN SÁT kịch bản, không
   * xoay núm nào. Gửi `CD_LUI` lên phải cho verdict GIỐNG HỆT khi không gửi gì.
   *
   * Bắt được: `grade` gọi thẳng `simulateRelease(action.cd, ...)` thay vì đi qua
   * `runLevelCd` (thứ tự gọi `mergeCdPolicies` bên trong). Không có bước khoá,
   * một bài "tìm đúng ngưỡng canary" giải được bằng cách gửi lên luôn lời giải,
   * và mọi bài CD thành bài tự chấm.
   *
   * ⚠ So bằng `toEqual` trên CẢ `GradeResult`, không chỉ `verdict`: hai lượt có
   * thể cùng `WA` mà khác `passed`, và một rò rỉ chính sách làm đúng chuyện đó
   * khi bài có nhiều testcase.
   */
  it('đề không cho xoay núm ⇒ gửi chính sách lên cũng như không gửi', () => {
    const khoa = baiCanary([]);
    const testcases = [LUI_DUOI_HAI_PHUT];

    const guiLoiGiai = cham({
      initialState: khoa,
      actions: [ojNop(OJ_WORKFLOW, { cd: CD_LUI })],
      testcases,
    });
    const khongGui = cham({
      initialState: khoa,
      actions: [ojNop(OJ_WORKFLOW, { cd: null })],
      testcases,
    });

    expect(guiLoiGiai).toEqual(khongGui);
    /*
     * Và phải là câu trả lời của `initial` (vá-đi-tới ⇒ chờ 300 giây, quá hai
     * phút), không phải của lời giải. Thiếu dòng này, ô trên vẫn xanh nếu cổng
     * khoá NHẦM chiều — lấy `edited` cho cả hai lượt.
     */
    expect(khongGui.verdict).toBe('WA');
  });

  /*
   * Vế còn lại, và nó phải ở ngay cạnh: khi núm ĐƯỢC mở thì chính sách gửi lên
   * phải có hiệu lực. Một cổng khoá mọi thứ cũng làm ô trên xanh.
   */
  it('đề CHO xoay đúng núm đó ⇒ chính sách gửi lên có hiệu lực', () => {
    const mo = cham({
      initialState: baiCanary(['release.onBadRelease']),
      actions: [ojNop(OJ_WORKFLOW, { cd: CD_LUI })],
      testcases: [LUI_DUOI_HAI_PHUT],
    });
    expect(mo.verdict).toBe('AC');
  });
});

// ── AC-J8 + nhật ký rỗng ────────────────────────────────────────────────────

describe('AC-J8 — không lách được bằng khuôn job', () => {
  /*
   * Bắt được: bỏ `checkJobShapes` khỏi đường chấm. Đổi tên một bước làm bộ ghép
   * mất chỗ mượn thời lượng, nên bước chạy 0 giây và `leadTimeUnder` ra AC —
   * review PR #141 đo được điều này trên 9–10/13 level.
   */
  it('đổi tên bước ⇒ WA, không được chấm với thời lượng 0', () => {
    const doiTen: typeof OJ_WORKFLOW = {
      name: OJ_WORKFLOW.name,
      stages: OJ_WORKFLOW.stages.map((stage) =>
        stage.id === 'kiem-tra'
          ? { ...stage, steps: stage.steps.map((step) => ({ ...step, id: 'buoc-la' })) }
          : stage,
      ),
    };
    const ket = cham({
      initialState: baiCi(),
      actions: [ojNop(doiTen)],
      testcases: [tc('nhanh', 'leadTimeUnder', { seconds: 1 })],
    });
    expect(ket.verdict).toBe('WA');
  });

  /*
   * Bỏ HẲN một job cũng không được tính — khuôn TẬP job, không chỉ khuôn bước.
   */
  it('bỏ một job ⇒ WA', () => {
    const ket = cham({
      initialState: baiCi(),
      actions: [ojNop(ojWorkflow(ojStage('clone')))],
      testcases: [tc('co-kiem-tra', 'stageExists', { stage: 'kiem-tra' })],
    });
    expect(ket.verdict).toBe('WA');
  });

  /*
   * Nhật ký RỖNG chấm `initialState.workflow`, và ra `WA` chứ không `CE`: trạng
   * thái đầu là một workflow hợp lệ, chạy được, chỉ là chưa giải xong bài. Trả
   * `CE` ở đó là nói bài soạn hỏng trong khi người làm chỉ chưa bắt đầu.
   */
  it('nhật ký rỗng ⇒ chấm workflow ban đầu, ra WA chứ không CE', () => {
    const ket = cham({
      initialState: baiCi(ojWorkflow(ojStage('clone'))),
      testcases: [tc('co-kiem-tra', 'stageExists', { stage: 'kiem-tra' })],
    });
    expect(ket.verdict).toBe('WA');
    expect(ket.failedCode).toBeNull();
  });

  /*
   * Nhật ký rỗng trên một đề CÓ chương CD: không có lượt nộp nào nên không có
   * chính sách nào gửi lên, và bộ mô phỏng phải chạy bằng `cd.initial` thay vì
   * ném. Bắt được: một hiện thực đọc `cuoi.cd` mà quên rằng `cuoi` có thể `null`.
   */
  it('nhật ký rỗng trên đề CD ⇒ chạy bằng `cd.initial`, không ném', () => {
    const ket = cham({ initialState: baiCanary(), testcases: [LUI_DUOI_HAI_PHUT] });
    expect(ket.verdict).toBe('WA');
    expect(ket.failedCode).toBeNull();
  });
});

// ── Cổng CD đòi CẢ hai khối (sửa sau review PR #146) ────────────────────────

describe('cổng vị từ CD — kịch bản VÀ chính sách khởi điểm', () => {
  /*
   * Bản đầu chỉ hỏi về KỊCH BẢN. Một đề có `cd.release.scenarios` mà `cd.initial`
   * rỗng lọt qua, rồi `mergeCdPolicies` bỏ hẳn bộ mô phỏng đó (`cd-run.ts` chỉ
   * dựng khối khi `initial` có nó), `runLevelCd` không ghi bản ghi nào, và
   * `releaseOf` trả `null` ⇒ vị từ `false` ở MỌI lượt nộp. Bài không giải được,
   * không gì đỏ.
   */
  it('thiếu `cd.initial.release` ⇒ `CE` nói rõ khối nào thiếu', () => {
    const goc = baiCanary();
    const thieuChinhSach: CicdProblemSpec = {
      ...goc,
      ...(goc.cd === undefined ? {} : { cd: { ...goc.cd, initial: {} } }),
    };
    const ket = cham({ initialState: thieuChinhSach, testcases: [LUI_DUOI_HAI_PHUT] });
    expect(ket.verdict).toBe('CE');
    expect(ket.failedReason).toContain('cd.initial.release');
  });

  /*
   * `null` thoả `!== undefined` nhưng ném ở `cd-run.ts` tại một phép destructure
   * ngoài khối `try` — lượt chấm khi đó vẫn thành `CE`, nhưng kèm một câu lỗi JS
   * thô thay vì một câu nói ra đề thiếu gì.
   */
  it('`cd.release: null` ⇒ `CE` đọc được, không phải một lỗi JS thô', () => {
    const goc = baiCanary();
    const hong = {
      ...goc,
      cd: { ...goc.cd, release: null },
    } as unknown as CicdProblemSpec;
    const ket = cham({ initialState: hong, testcases: [LUI_DUOI_HAI_PHUT] });
    expect(ket.verdict).toBe('CE');
    expect(ket.failedReason).toContain('cd.release');
    expect(ket.failedReason).not.toContain('Cannot destructure');
  });
});
