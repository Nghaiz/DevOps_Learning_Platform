// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Ô gác của C3 — phần DÙNG CHUNG cho cả hai game.
 *
 * ## Vì sao ô này đặt ở tầng hook, không ở tầng màn hình
 *
 * Luật cần gác là *"xin chữ TRƯỚC, thành công mới trừ điểm"*, và luật đó sống
 * trong hook — cả `mission-card.tsx` (K8s) lẫn `git-level-screen.tsx` (Git) chỉ
 * rẽ theo giá trị hook trả về. Gác ở đây thì một ô phủ cả hai đường; gác ở hai
 * màn hình thì phải mock hai cây giao diện (trong đó có cảnh 3D của Git) để đo
 * đúng một phép rẽ nhánh.
 *
 * ⛔ Phép rẽ nhánh đó là TOÀN BỘ phần chống-trừ-oan. `reveal` trả `null` ⇒ chỗ
 * gọi không bắn action `hint` ⇒ nhật ký không có gì ⇒ không trừ điểm. Nếu một
 * ngày `reveal` trả chuỗi rỗng thay vì `null` khi hỏng, mọi chỗ gọi sẽ trừ điểm
 * cho một gợi ý không tồn tại và KHÔNG ô nào khác đỏ.
 */

const revealAsync = vi.fn();

vi.mock('./trpc-react', () => ({
  api: {
    problems: {
      revealHint: { useMutation: () => ({ mutateAsync: revealAsync }) },
    },
  },
}));

const { useHintReveal } = await import('./use-hint-reveal');

const CODE = 'K8S-0007';

beforeEach(() => {
  revealAsync.mockReset();
});

describe('useHintReveal — xin chữ gợi ý từ máy chủ', () => {
  it('thành công ⇒ trả chữ, và map ghi `ready` kèm đúng chữ đó', async () => {
    revealAsync.mockResolvedValue({
      id: 'h1',
      penaltyPoints: 120,
      revealed: true,
      text: 'Dùng `kubectl scale`',
    });

    const { result } = renderHook(() => useHintReveal(CODE));

    let tra: string | null = null;
    await act(async () => {
      tra = await result.current.reveal(0, 'h1');
    });

    expect(tra).toBe('Dùng `kubectl scale`');
    expect(revealAsync).toHaveBeenCalledExactlyOnceWith({ code: CODE, hintId: 'h1' });
    await waitFor(() => {
      expect(result.current.reveals.get(0)).toEqual({
        phase: 'ready',
        text: 'Dùng `kubectl scale`',
      });
    });
  });

  it('⛔ máy chủ lỗi ⇒ trả `null` (chỗ gọi KHÔNG trừ điểm) và map ghi câu lỗi', async () => {
    revealAsync.mockRejectedValue(new Error('Mất kết nối'));

    const { result } = renderHook(() => useHintReveal(CODE));

    let tra: string | null = 'chưa gán';
    await act(async () => {
      tra = await result.current.reveal(0, 'h1');
    });

    /*
     * `null` CHỨ KHÔNG PHẢI `''`. Đây là khác biệt mang toàn bộ ý nghĩa của ô:
     * chuỗi rỗng là một giá trị "thành công" với chỗ gọi, và nó sẽ bắn action
     * `hint` đi — tức trừ điểm cho một lượt xin đã hỏng.
     */
    expect(tra).toBeNull();
    await waitFor(() => {
      expect(result.current.reveals.get(0)).toEqual({ phase: 'error', message: 'Mất kết nối' });
    });
  });

  it('⛔ máy chủ nói "đã mở" mà `text` là `null` ⇒ coi là LỖI, không nuốt thành chuỗi rỗng', async () => {
    /*
     * Đây đúng là hình dạng con bọ đang đi sửa, chỉ tới từ phía máy chủ. Nuốt nó
     * thành `''` sẽ dựng lại y nguyên triệu chứng: trừ điểm, hiện ô trống.
     */
    revealAsync.mockResolvedValue({ id: 'h1', penaltyPoints: 120, revealed: true, text: null });

    const { result } = renderHook(() => useHintReveal(CODE));

    let tra: string | null = 'chưa gán';
    await act(async () => {
      tra = await result.current.reveal(0, 'h1');
    });

    expect(tra).toBeNull();
    expect(result.current.reveals.get(0)?.phase).toBe('error');
  });

  it('đã có chữ ⇒ KHÔNG gọi máy chủ lần hai, nhưng vẫn trả chữ', async () => {
    revealAsync.mockResolvedValue({ id: 'h1', penaltyPoints: 1, revealed: true, text: 'chữ' });

    const { result } = renderHook(() => useHintReveal(CODE));
    await act(async () => {
      await result.current.reveal(0, 'h1');
    });
    await act(async () => {
      await result.current.reveal(0, 'h1');
    });

    expect(revealAsync).toHaveBeenCalledTimes(1);
  });

  it('⛔ hai cú bấm liên tiếp ⇒ chỉ MỘT lời gọi, và lượt thứ hai trả `null`', async () => {
    /*
     * Không có phép chặn này thì bấm nhanh hai lần sẽ bắn hai action `hint` cho
     * cùng một chỉ số. Engine chặn trùng (`index < hintsRevealed`), nhưng lời gọi
     * thứ hai vẫn tiêu một suất của trần nhịp dùng chung với `submit` — và trần
     * đó chỉ có 6 lượt mỗi phút.
     */
    let moKhoa: (value: unknown) => void = () => undefined;
    revealAsync.mockImplementation(
      async () =>
        await new Promise((resolve) => {
          moKhoa = resolve;
        }),
    );

    const { result } = renderHook(() => useHintReveal(CODE));

    let thuNhat: Promise<string | null> = Promise.resolve(null);
    let thuHai: string | null = 'chưa gán';
    await act(async () => {
      thuNhat = result.current.reveal(0, 'h1');
      thuHai = await result.current.reveal(0, 'h1');
    });

    expect(thuHai).toBeNull();
    expect(revealAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      moKhoa({ id: 'h1', penaltyPoints: 1, revealed: true, text: 'chữ' });
      await thuNhat;
    });
    expect(await thuNhat).toBe('chữ');
  });
});
