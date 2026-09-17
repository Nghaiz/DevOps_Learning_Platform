// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionCard } from './mission-card';
import type { HintReveal } from '../../../lib/use-hint-reveal';

/**
 * Ô gác của C3 — nửa GIAO DIỆN của đấu trường K8s.
 *
 * ## Cái đang gác, nói bằng triệu chứng
 *
 * Trước 2026-09-15, bấm "Gợi ý" ở chế độ làm bài sẽ bắn một action `hint` vào
 * nhật ký — tức TRỪ ĐIỂM — rồi hiện `hints[hintsRevealed - 1]`, mà ở chế độ đó
 * cả mảng là chuỗi rỗng (`problems.byCode` che chữ gợi ý chưa mở, §18.B.4). Người
 * học trả điểm và nhận một ô trống, không có gì nói tại sao.
 *
 * ## ⛔ Vì sao ô này KHÔNG mock tRPC, và vì sao đó là điểm mạnh chứ không phải lỗ hổng
 *
 * `MissionCard` render ở CẢ HAI chế độ, mà `app/games/layout.tsx` cố ý không cấp
 * `TrpcQueryProvider` — nên thẻ nhiệm vụ KHÔNG được phép gọi `api.*` (đúng lỗi
 * C1 đã phải vá ở `c4fa97a`). Thiết kế vì thế đẩy hết phần mạng lên
 * `arena-problem.tsx` và để thẻ này chỉ cầm một callback.
 *
 * Hệ quả: ô này dựng được thẻ bằng props thuần, và việc nó KHÔNG cần mock tRPC
 * chính là bằng chứng cho ràng buộc trên. Ngày nào phải thêm `vi.mock` cho
 * `trpc-react` vào đây thì ràng buộc đó đã vỡ.
 *
 * Phần mạng + thứ tự gọi-trước-trừ-sau có ô riêng: `lib/use-hint-reveal.dom.test.tsx`.
 */

const dispatch = vi.fn();
const getTick = vi.fn(() => 42);

function veThe({
  hints = [''],
  hintsRevealed = 0,
  hintReveals = new Map<number, HintReveal>(),
  onRevealHint = null as ((index: number) => Promise<string | null>) | null,
}: {
  hints?: readonly string[];
  hintsRevealed?: number;
  hintReveals?: ReadonlyMap<number, HintReveal>;
  onRevealHint?: ((index: number) => Promise<string | null>) | null;
} = {}) {
  return render(
    <MissionCard
      open
      code="K8S-0001"
      goal="Dựng một pod tên `web`"
      objectives={[{ id: 'o1', label: 'Pod chạy', required: true, check: 'resource-exists' }]}
      metIds={[]}
      guardIds={[]}
      hints={hints}
      hintsRevealed={hintsRevealed}
      hintReveals={hintReveals}
      onRevealHint={onRevealHint}
      codexAvailable={onRevealHint === null}
      hintsCostPoints={onRevealHint !== null}
      dispatch={dispatch}
      getTick={getTick}
      onOpenCodex={() => undefined}
    />,
  );
}

const nutGoiY = () => screen.getByRole('button', { name: /Gợi ý|Đang mở gợi ý|Hết gợi ý/ });

beforeEach(() => {
  dispatch.mockReset();
  getTick.mockClear();
});

/*
 * Dọn DOM sau mỗi ô. Không có nó, các lần render dồn lại trong cùng một
 * `document` và `getByRole` ném "multiple elements" — một lượt đỏ nói về harness
 * chứ không nói gì về mã đang gác.
 */
afterEach(cleanup);

describe('MissionCard — mở gợi ý ở chế độ làm bài', () => {
  it('xin được chữ ⇒ MỚI bắn action `hint` (tức mới trừ điểm)', async () => {
    const onRevealHint = vi.fn(async () => 'Dùng `kubectl run`');
    veThe({ onRevealHint });

    await userEvent.click(nutGoiY());

    expect(onRevealHint).toHaveBeenCalledExactlyOnceWith(0);
    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledExactlyOnceWith({
        gameId: 'k8s',
        tick: 42,
        kind: 'hint',
        index: 0,
      });
    });
  });

  it('⛔ xin HỎNG ⇒ KHÔNG bắn action nào — không trừ điểm cho một gợi ý không nhận được', async () => {
    /*
     * Ô quan trọng nhất của file. Nếu `dispatch` chạy ở đây thì nhật ký có một
     * action `hint`, `hintIdsFromLog` đếm nó, và người học mất điểm cho một lượt
     * xin đã hỏng — đúng con bọ đang đi sửa, chỉ hiếm hơn.
     */
    const onRevealHint = vi.fn(async () => null);
    veThe({ onRevealHint });

    await userEvent.click(nutGoiY());

    expect(onRevealHint).toHaveBeenCalledExactlyOnceWith(0);
    /*
     * Chờ lời hứa của chính lượt gọi đó ngã ngũ, rồi nhường thêm một nhịp
     * microtask cho `.then(...)` trong `onClick`. Không có hai bước này thì ô
     * xanh chỉ vì nó đo TRƯỚC khi `dispatch` có cơ hội chạy — một ô xanh vì đo
     * sớm không gác được gì.
     */
    await onRevealHint.mock.results[0]?.value;
    await Promise.resolve();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('chế độ DẠY (`onRevealHint === null`) ⇒ bắn action ngay, không chờ ai', async () => {
    veThe({ hints: ['Gợi ý có sẵn trong LEVELS'], onRevealHint: null });

    await userEvent.click(nutGoiY());

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      gameId: 'k8s',
      tick: 42,
      kind: 'hint',
      index: 0,
    });
  });

  it('⛔ ĐỐI CHỨNG DƯƠNG — đã mở mà chưa có chữ ⇒ KHÔNG hiện nhãn "Gợi ý 1:" rỗng', () => {
    /*
     * Triệu chứng cũ, viết thành ô: `hints` toàn chuỗi rỗng ở chế độ bài, và bản
     * trước in ra đúng *"Gợi ý 1: "*. Im lặng thật thà hơn một nhãn không có nội
     * dung — nó không giả vờ đã trả hàng.
     */
    veThe({ hints: [''], hintsRevealed: 1, onRevealHint: vi.fn(async () => null) });
    expect(screen.queryByText(/^Gợi ý 1:/)).toBeNull();
  });

  it('có chữ từ máy chủ ⇒ hiện đúng chữ đó, KHÔNG hiện `hints[i]` rỗng', () => {
    veThe({
      hints: [''],
      hintsRevealed: 1,
      hintReveals: new Map([[0, { phase: 'ready', text: 'Dùng `kubectl scale`' } as HintReveal]]),
      onRevealHint: vi.fn(async () => null),
    });
    expect(screen.getByText(/Dùng `kubectl scale`/)).toBeTruthy();
  });

  it('xin hỏng ⇒ câu lỗi hiện ra dưới dạng `alert`, không im lặng', () => {
    veThe({
      hintReveals: new Map([[0, { phase: 'error', message: 'Mất kết nối' } as HintReveal]]),
      onRevealHint: vi.fn(async () => null),
    });
    expect(screen.getByRole('alert').textContent).toContain('Mất kết nối');
  });

  it('đang xin ⇒ nút đổi chữ và bị khoá, nên không bấm chồng lượt', () => {
    veThe({
      hintReveals: new Map([[0, { phase: 'pending' } as HintReveal]]),
      onRevealHint: vi.fn(async () => null),
    });
    const nut = screen.getByRole('button', { name: /Đang mở gợi ý/ });
    expect(nut.hasAttribute('disabled')).toBe(true);
  });
});
