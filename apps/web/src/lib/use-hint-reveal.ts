'use client';

import { useCallback, useRef, useState } from 'react';
import { api } from './trpc-react';
import { describeTrpcError } from './trpc';

/**
 * Trạng thái mở một gợi ý trong chế độ làm bài OJ — DÙNG CHUNG cho cả hai game.
 *
 * ## Vì sao gợi ý phải đi qua máy chủ, chứ không đọc từ đề bài đã nạp
 *
 * `problems.byCode` che chữ của gợi ý CHƯA mở: `toHintTeasers` trả
 * `text: revealed ? hint.text : null` (`server/problems/solver.ts`). Đó là cố ý
 * — nếu chữ đi kèm đề bài thì "gợi ý có giá" chỉ là một cái nút, ai mở tab
 * Network cũng đọc được cả bốn gợi ý mà không trả đồng nào.
 *
 * Hệ quả là chữ CHỈ tới từ `problems.revealHint`, và trước 2026-09-15 không màn
 * chơi nào gọi nó. `problem-level.ts` của cả hai game ép `hint.text ?? ''`, nên
 * người học bấm "Gợi ý", BỊ TRỪ ĐIỂM, và nhận một ô trống:
 *
 * - K8s — `mission-card.tsx` hiện `hints[hintsRevealed - 1]`, tức chuỗi rỗng.
 * - Git — `git/engine.ts` đẩy `` `Gợi ý ${i + 1}: ${text}` `` vào bản ghi, tức
 *   đúng chữ *"Gợi ý 1: "* rồi hết.
 *
 * Điểm trừ thì CÓ THẬT ở cả hai: `hintsUsed` đếm từ NHẬT KÝ (`hintIdsFromLog`),
 * và máy chủ còn hợp thêm bảng `problem_hint_reveals`. Nên đây không phải một ô
 * hiển thị bị lỗi — nó là một lượt mua bán mà người mua không nhận được hàng.
 *
 * ## ⛔ Thứ tự: GỌI MÁY CHỦ TRƯỚC, thành công mới trừ điểm
 *
 * Chốt bởi chủ dự án 2026-09-15. Lý do không phải sự lịch sự với người dùng mà
 * là tính NHẤT QUÁN với máy chủ: `problems.revealHint` chỉ ghi
 * `problem_hint_reveals` khi nó CHẠY XONG. Nếu client trừ điểm trước rồi mới
 * gọi, một lượt gọi hỏng để lại đúng trạng thái lệch mà cả hệ thống này sinh ra
 * để tránh — nhật ký của client nói "đã mở gợi ý 1", bảng của máy chủ nói chưa,
 * và người học trả tiền cho một thứ không tồn tại ở phía bên kia.
 *
 * Gọi trước thì hai bên không bao giờ lệch: hỏng ⇒ không ai ghi gì, nút bấm lại
 * được, và câu lỗi hiện ra thay vì một ô trống.
 *
 * ⚠ Điều này KHÔNG mở đường đọc chùa. Máy chủ ghi nhận lượt mở ngay khi trả
 * chữ, nên một client cầm chữ rồi cố tình không ghi action vào nhật ký vẫn bị
 * trừ — `revealedHintIds` là HỢP của bảng và nhật ký, không phải chỉ nhật ký.
 */
export type HintReveal =
  | { readonly phase: 'pending' }
  | { readonly phase: 'ready'; readonly text: string }
  | { readonly phase: 'error'; readonly message: string };

export interface HintRevealHandle {
  /**
   * Khoá là CHỈ SỐ gợi ý, khớp với `{ kind: 'hint', index }` của nhật ký.
   *
   * Chỉ số chứ không phải id vì đây là trạng thái sống của MỘT lượt chơi trên
   * MỘT đề bài đã nạp, và cả hai đầu — nút bấm lẫn action — đã đánh địa chỉ
   * bằng chỉ số. Đổi sang id ở riêng chỗ này là thêm một phép ánh xạ để hai bên
   * có chỗ bất đồng.
   */
  readonly reveals: ReadonlyMap<number, HintReveal>;
  /**
   * Xin chữ của gợi ý thứ `index`.
   *
   * Trả chữ khi máy chủ đã ghi nhận, `null` khi hỏng — và `null` nghĩa là
   * **đừng trừ điểm**. Chỗ gọi phải rẽ theo giá trị trả về, không được bắn
   * action đi trước rồi mới chờ.
   */
  readonly reveal: (index: number, hintId: string) => Promise<string | null>;
}

export function useHintReveal(code: string): HintRevealHandle {
  /*
   * Bản NGUỒN là ref, `useState` chỉ là ảnh chụp để render.
   *
   * Cần ref vì `reveal` phải đọc trạng thái hiện tại để chặn lượt gọi trùng
   * (bấm hai lần liên tiếp), mà một `useCallback` đọc state sẽ đọc bản của lần
   * render nó được tạo ra — tức một closure cũ, và phép chặn đó sẽ hụt đúng
   * lúc cần nhất.
   */
  const ref = useRef<Map<number, HintReveal>>(new Map());
  const [reveals, setReveals] = useState<ReadonlyMap<number, HintReveal>>(ref.current);
  const mutateAsync = api.problems.revealHint.useMutation().mutateAsync;

  const publish = useCallback(() => {
    // Map MỚI mỗi lần: React so tham chiếu, sửa tại chỗ thì không render lại.
    setReveals(new Map(ref.current));
  }, []);

  const reveal = useCallback(
    async (index: number, hintId: string): Promise<string | null> => {
      const current = ref.current.get(index);
      if (current?.phase === 'ready') {
        // Đã có chữ — không gọi lại. Trả về để chỗ gọi vẫn mở được gợi ý.
        return current.text;
      }
      if (current?.phase === 'pending') {
        // Đang bay. Trả `null` để chỗ gọi KHÔNG trừ điểm lần thứ hai.
        return null;
      }

      ref.current.set(index, { phase: 'pending' });
      publish();

      try {
        const teaser = await mutateAsync({ code, hintId });
        if (teaser.text === null) {
          /*
           * Máy chủ vừa nói "đã mở" mà không kèm chữ. Đây là dữ liệu hỏng, KHÔNG
           * phải "chưa mở" — `null` chỉ có nghĩa thứ hai đó ở đường `byCode`.
           * Nuốt nó thành chuỗi rỗng là dựng lại đúng con bọ đang đi sửa.
           */
          const message = 'Máy chủ mở gợi ý nhưng không trả nội dung. Thử lại sau.';
          ref.current.set(index, { phase: 'error', message });
          publish();
          return null;
        }
        ref.current.set(index, { phase: 'ready', text: teaser.text });
        publish();
        return teaser.text;
      } catch (error) {
        ref.current.set(index, { phase: 'error', message: describeTrpcError(error) });
        publish();
        return null;
      }
    },
    [code, mutateAsync, publish],
  );

  return { reveals, reveal };
}
