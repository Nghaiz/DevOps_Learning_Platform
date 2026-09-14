// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Level } from '@devops-platform/games';
import type { ArenaModeContext } from './arena-contract';
import type { ArenaSessionHandle } from './arena-session';

/**
 * Ô nghiệm thu của lane 18.C — phía CLIENT của đường nộp bài.
 *
 * ⛔ Ô này KHÔNG khẳng định "bảng nộp bài render được". Một ô như vậy xanh cả
 * khi đấu trường tiếp tục không nộp gì về máy chủ — tức xanh cho đúng trạng
 * thái mà lane này sinh ra để sửa (`rules/green-that-proves-nothing.md`).
 *
 * Thứ ô này khẳng định là: **một lượt chơi thật, kết thúc thắng ở chế độ bài
 * tập, dẫn tới đúng MỘT lời gọi `problems.submit` mang đúng nhật ký của lượt
 * đó.** Bỏ lời gọi `submit()` trong effect ⇒ ô đỏ ngay tại dòng
 * `toHaveBeenCalledTimes(1)`.
 *
 * Nhật ký được so NGUYÊN VẸN chứ không so từng trường: `seed` đúng mà `actions`
 * của một lượt khác là một lượt phát lại ra trạng thái khác, và máy chủ trả
 * `CE khong-khop` — một lỗi ghép nhật ký đọc ra như một lượt chơi gian lận.
 */

const mutateAsync = vi.fn(async (_input: unknown) => ({
  grade: { verdict: 'WA' as const, passed: ['t1'], total: 2, failedReason: null },
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
    },
  },
}));

const { useProblemSubmit } = await import('./use-problem-submit');

const LOG = {
  gameId: 'k8s' as const,
  levelId: 'l-01',
  seed: 424242,
  actions: [{ gameId: 'k8s' as const, kind: 'scale', tick: 7 }],
};

const level = {
  id: 'l-01',
  objectives: [{ id: 'o1' }, { id: 'o2' }],
  parMoves: 5,
  hints: [{ id: 'h1' }],
} as unknown as Level;

const mode: ArenaModeContext = {
  mode: 'problem',
  problemCode: 'K8S-0003',
  codexAvailable: false,
  hintsCostPoints: true,
};

function engineAt(phase: 'playing' | 'won'): ArenaSessionHandle {
  return {
    seed: LOG.seed,
    status: { phase, objectivesMet: ['o1'], movesUsed: 4, hintsRevealed: 1 },
    getLog: () => LOG,
  } as unknown as ArenaSessionHandle;
}

describe('nộp bài từ đấu trường', () => {
  it('gọi problems.submit đúng một lần với nhật ký của chính lượt vừa thắng', async () => {
    mutateAsync.mockClear();
    const { rerender, result } = renderHook(
      ({ phase }: { phase: 'playing' | 'won' }) =>
        useProblemSubmit(level, engineAt(phase), mode, 1_700_000_000_000),
      { initialProps: { phase: 'playing' } as { phase: 'playing' | 'won' } },
    );

    // Chưa thắng thì chưa có gì được gửi đi — nộp sớm là nộp một lượt dở dang.
    expect(mutateAsync).not.toHaveBeenCalled();

    rerender({ phase: 'won' });
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));

    const sent = mutateAsync.mock.calls[0]?.[0] as unknown as {
      code: string;
      runLog: typeof LOG;
      claimed: { seed: number; levelId: string; objectivesTotal: number; hintsUsed: number };
    };
    expect(sent.code).toBe('K8S-0003');
    expect(sent.runLog).toEqual(LOG);
    expect(sent.claimed.seed).toBe(LOG.seed);
    expect(sent.claimed.levelId).toBe('l-01');
    expect(sent.claimed.objectivesTotal).toBe(2);
    expect(sent.claimed.hintsUsed).toBe(1);

    // Verdict hiện ra là verdict MÁY CHỦ trả, dựng qua `toVerdictView` — không
    // phải suy từ pha thắng của engine.
    await waitFor(() => expect(result.current.phase).toBe('done'));
    expect(result.current.view?.verdict).toBe('WA');
    expect(result.current.view?.fraction).toEqual({ passed: 1, total: 2 });
    // Nhãn tới từ bộ teaser đọc LẠI sau khi nộp; trước lượt nộp nó còn là `null`.
    expect(result.current.view?.failed.map((item) => item.label)).toEqual(['Service trỏ đúng']);
    expect(byCodeFetch).toHaveBeenCalledWith({ code: 'K8S-0003' });
  });

  it('ở chế độ màn thường thì không nộp gì', async () => {
    mutateAsync.mockClear();
    renderHook(() =>
      useProblemSubmit(
        level,
        engineAt('won'),
        { mode: 'level', problemCode: null, codexAvailable: true, hintsCostPoints: false },
        1_700_000_000_000,
      ),
    );
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
  });
});
