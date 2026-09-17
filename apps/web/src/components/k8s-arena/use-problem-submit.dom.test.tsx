// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ArenaModeContext } from './arena-contract';
import type { ArenaSessionHandle } from './arena-session';
import type { K8sOjProblem } from './problem-level';

/**
 * Ô nghiệm thu của lane 18.C — phía CLIENT của đường nộp bài K8s.
 *
 * ⛔ Ô này KHÔNG khẳng định "bảng nộp bài render được". Một ô như vậy xanh cả
 * khi đấu trường tiếp tục không nộp gì về máy chủ — tức xanh cho đúng trạng
 * thái mà lane này sinh ra để sửa (`rules/green-that-proves-nothing.md`).
 *
 * ## ⛔ VIẾT LẠI 2026-09-15, và lý do đáng đọc hơn nội dung mới
 *
 * Bản trước đo rằng một lượt chơi **kết thúc THẮNG** dẫn tới đúng một lời gọi
 * `problems.submit`, và nó XANH suốt thời gian chế độ bài tập K8s hoàn toàn
 * không chạy được. Nó xanh được vì nó mock cả tầng mạng và tự cấp một `level`
 * có `id: 'l-01'` — nên ba lỗi thật của đường đó đều nằm ngoài tầm nó:
 *
 * 1. Ngoài đời `log.levelId` là một id trong `LEVELS`, không phải mã bài, nên
 *    máy chủ trả `BAD_REQUEST`. Ô này tự đặt id nên không bao giờ thấy.
 * 2. Ngoài đời không có `TrpcQueryProvider` nào ở `/games`, nên hook ném. Ô này
 *    mock `api` nên không bao giờ thấy.
 * 3. Ngoài đời điểm tính bằng `computeScore` ≠ công thức máy chủ. Ô này không
 *    đọc `score`.
 *
 * Bài học giữ lại: một ô mock trọn biên ngoài chỉ đo được mã GIỮA hai biên đó.
 * Nó không nói gì về việc hai biên có nối vào đâu không — và chính chỗ nối là
 * thứ đã hỏng. Ô đối chứng thật cho phần đó là `problem-level.test.ts`, nơi hai
 * bản dựng được so trực tiếp với nhau.
 *
 * Thứ bản MỚI này khẳng định: **một lượt bấm "Nộp bài" dẫn tới đúng MỘT lượt
 * `tryGrade` rồi đúng MỘT lượt `submit`, cả hai mang y hệt một nhật ký, và lời
 * khai lấy `objectivesMet` từ MÁY CHỦ chứ không từ phiên cục bộ.**
 */

const PASSED_MAY_CHU = ['t1'];

const tryGradeAsync = vi.fn(async (_input: unknown) => ({
  passed: PASSED_MAY_CHU,
  total: 2,
  verdict: 'WA' as const,
  failedReason: null,
  failedCode: null,
}));
const mutateAsync = vi.fn(async (_input: unknown) => ({
  grade: {
    verdict: 'WA' as const,
    passed: PASSED_MAY_CHU,
    total: 2,
    failedReason: null,
    failedCode: null,
  },
}));
const byCodeFetch = vi.fn(async () => ({
  problem: {
    testcases: [
      { id: 't1', label: 'Pod chạy', visible: true },
      { id: 't2', label: 'Service trỏ đúng', visible: false },
    ],
  },
}));

vi.mock('../../lib/trpc-react', () => ({
  api: {
    useUtils: () => ({ problems: { byCode: { fetch: byCodeFetch } } }),
    problems: {
      submit: { useMutation: () => ({ mutateAsync, isPending: false }) },
      tryGrade: { useMutation: () => ({ mutateAsync: tryGradeAsync, isPending: false }) },
    },
  },
}));

const { useProblemSubmit } = await import('./use-problem-submit');

const CODE = 'K8S-0003';

/*
 * `levelId` LÀ mã bài — đúng như `k8sOjLevel` dựng nó. Bản trước đặt `'l-01'`,
 * một id không tồn tại ở đường thật, và đó là chỗ nó mù với lỗi #1.
 */
const LOG = {
  gameId: 'k8s' as const,
  levelId: CODE,
  seed: 424242,
  actions: [
    { gameId: 'k8s' as const, kind: 'scale', tick: 7 },
    { gameId: 'k8s' as const, kind: 'hint', index: 0, tick: 8 },
  ],
};

const problem: K8sOjProblem = {
  code: CODE,
  title: 'Nâng số bản sao',
  statement: 'Nâng web lên 3 bản sao.',
  difficulty: 'easy',
  initialState: { nodes: [], workloads: [] },
  allowedResources: null,
  testcases: [
    { id: 't1', label: 'Pod chạy', visible: true },
    { id: 't2', label: null, visible: false },
  ],
  hints: [{ id: 'h1', penaltyPoints: 120, revealed: false, text: null }],
  parMoves: 4,
};

const mode: ArenaModeContext = {
  mode: 'problem',
  problemCode: CODE,
  codexAvailable: false,
  hintsCostPoints: true,
  problem,
  /*
   * Ô này đo ĐƯỜNG NỘP BÀI, không đo gợi ý — nên hai trường gợi ý để trơ.
   * Đường gợi ý có ô riêng ở `mission-card.hint.dom.test.tsx`.
   */
  hintReveals: new Map(),
  onRevealHint: async () => null,
};

/**
 * Engine ở một pha bất kỳ.
 *
 * `objectivesMet` để RỖNG có chủ ý: đó là sự thật của chế độ bài tập, vì level
 * tổng hợp mang vị từ rỗng (§18.B.4 cắt `check`). Một fixture khai sẵn mục tiêu
 * đã đạt sẽ che mất việc lời khai phải lấy số đó từ máy chủ.
 */
function engineAt(phase: 'playing' | 'won'): ArenaSessionHandle {
  return {
    seed: LOG.seed,
    status: { phase, objectivesMet: [], movesUsed: 1, hintsRevealed: 1 },
    getLog: () => LOG,
  } as unknown as ArenaSessionHandle;
}

describe('nộp bài từ đấu trường', () => {
  it('một lượt bấm ⇒ tryGrade rồi submit, cùng một nhật ký', async () => {
    tryGradeAsync.mockClear();
    mutateAsync.mockClear();
    const { result } = renderHook(() =>
      useProblemSubmit(engineAt('playing'), mode, 1_700_000_000_000),
    );

    // Chưa bấm thì chưa gửi gì — bài OJ không có "tự nộp khi thắng".
    expect(mutateAsync).not.toHaveBeenCalled();

    result.current.submit();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(tryGradeAsync).toHaveBeenCalledTimes(1);

    const thu = tryGradeAsync.mock.calls[0]?.[0] as unknown as { code: string; runLog: typeof LOG };
    const nop = mutateAsync.mock.calls[0]?.[0] as unknown as {
      code: string;
      runLog: typeof LOG;
      claimed: {
        seed: number;
        levelId: string;
        objectivesMet: readonly string[];
        objectivesTotal: number;
        commandsUsed: number;
        hintsUsed: number;
      };
    };

    expect(nop.code).toBe(CODE);
    /*
     * Hai lượt gọi phải mang Y HỆT một nhật ký. Lệch nhau thì "thử thì đạt, nộp
     * thì trượt" và không ai có cách nào biết vì sao.
     */
    expect(thu.runLog).toEqual(nop.runLog);
    expect(nop.runLog).toEqual(LOG);

    // `levelId` của lời khai là mã bài — trường mà máy chủ so đầu tiên.
    expect(nop.claimed.levelId).toBe(CODE);
    expect(nop.claimed.seed).toBe(LOG.seed);
    /*
     * ⛔ Lời khai lấy `objectivesMet` từ MÁY CHỦ, không từ `engine.status` (vốn
     * rỗng). Ô này đỏ nếu ai đó nối lại vào phiên cục bộ — và hồi quy đó sẽ làm
     * MỌI lượt nộp K8s hợp lệ nhận `CE`.
     */
    expect(nop.claimed.objectivesMet).toEqual(PASSED_MAY_CHU);
    expect(nop.claimed.objectivesTotal).toBe(2);
    // Đếm từ nhật ký, không từ `status.movesUsed`/`hintsRevealed`.
    expect(nop.claimed.commandsUsed).toBe(1);
    expect(nop.claimed.hintsUsed).toBe(1);

    // Verdict hiện ra là verdict MÁY CHỦ trả, dựng qua `toVerdictView`.
    await waitFor(() => expect(result.current.phase).toBe('done'));
    expect(result.current.view?.verdict).toBe('WA');
    expect(result.current.view?.fraction).toEqual({ passed: 1, total: 2 });
    // Nhãn tới từ bộ teaser đọc LẠI sau khi nộp; trước lượt nộp nó còn là `null`.
    expect(result.current.view?.failed.map((item) => item.label)).toEqual(['Service trỏ đúng']);
    expect(byCodeFetch).toHaveBeenCalledWith({ code: CODE });
  });

  it('KHÔNG tự nộp khi engine báo thắng', async () => {
    /*
     * Pha `won` không tới được ở chế độ bài tập (vị từ rỗng ⇒ không mục tiêu nào
     * đạt), nhưng ô này khoá điều mạnh hơn: kể cả khi một engine báo `won`, hook
     * không được tự gửi gì. Nộp bài là một hành động TƯỜNG MINH.
     */
    tryGradeAsync.mockClear();
    mutateAsync.mockClear();
    renderHook(() => useProblemSubmit(engineAt('won'), mode, 1_700_000_000_000));
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
    expect(tryGradeAsync).not.toHaveBeenCalled();
  });

  it('ở chế độ màn thường thì không nộp gì, kể cả khi bấm', async () => {
    tryGradeAsync.mockClear();
    mutateAsync.mockClear();
    const { result } = renderHook(() =>
      useProblemSubmit(
        engineAt('won'),
        {
          mode: 'level',
          problemCode: null,
          codexAvailable: true,
          hintsCostPoints: false,
          problem: null,
          hintReveals: new Map(),
          onRevealHint: null,
        },
        1_700_000_000_000,
      ),
    );
    result.current.submit();
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
    expect(tryGradeAsync).not.toHaveBeenCalled();
  });

  it('bài không testcase nào ⇒ nói ra, và nút nộp không được render', () => {
    const { result } = renderHook(() =>
      useProblemSubmit(
        engineAt('playing'),
        { ...mode, problem: { ...problem, testcases: [] } },
        1_700_000_000_000,
      ),
    );
    expect(result.current.notice).not.toBeNull();
  });
});
