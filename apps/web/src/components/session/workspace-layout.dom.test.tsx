// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFitOnLayoutChange, type FitScheduler } from './workspace-layout';
import { resolveSplitShape, resolveStackedBottom } from './split-shape';

/**
 * `p16-workspace.md` §8 **AC-5** đối chứng dương, cộng phần thuần của 16.D.2.
 *
 * ## Vì sao AC-5 cần một file DOM dù nó đã có `workspace-layout.test.ts`
 *
 * File hàm-thuần kia phủ `runFitAfterLayout`, tức TOÀN BỘ thân effect. Thứ nó
 * KHÔNG với tới được là mảng deps `[handle, layout, schedule]`, và đối chứng
 * dương mà AC-5 đòi nằm đúng ở đó:
 *
 *   "một ca render lại với CÙNG `layout` và khẳng định số lượt fit KHÔNG tăng
 *    — không có nó thì một effect chạy mỗi lượt render cũng xanh."
 *
 * Một effect quên deps chạy lại ở MỌI lượt render, và trang bài học re-render
 * mỗi giây vì đồng hồ đếm ngược TTL. Tức xterm sẽ đo lại chính nó mỗi giây,
 * suốt buổi học, trong lúc người ta đang gõ. Không có gì báo; chỉ là con trỏ
 * thỉnh thoảng nhảy.
 *
 * `workspace-tabs.test.ts` gác nửa còn lại của cùng mệnh đề (chuỗi `layout` có
 * đổi đúng lúc và chỉ đúng lúc không). Hai nửa hợp lại mới là một bảo đảm.
 */

afterEach(cleanup);

/** Scheduler chạy `run` ĐỒNG BỘ, để đếm số lượt fit ngay trong lượt commit. */
const immediate: FitScheduler = (run) => {
  run();
  return () => undefined;
};

/**
 * ⚠ `handle` là một object ỔN ĐỊNH do ô test dựng sẵn, KHÔNG phải `{ fit }`
 * viết thẳng trong thân component.
 *
 * Lượt viết đầu của file này truyền `{ fit }` tại chỗ, và ô đối chứng dương đỏ
 * ngay: object literal là một danh tính MỚI ở mỗi lượt render, mà `handle` nằm
 * trong deps của `useFitOnLayoutChange`, nên effect chạy lại mỗi lần. Thông báo
 * lỗi đọc ra như một lỗi sản phẩm ("effect fit đang chạy mỗi lượt render") trong
 * khi thứ hỏng là harness.
 *
 * Đó là một ô ĐỎ không chứng minh gì, phản chiếu của ô xanh không chứng minh gì.
 * Call site thật truyền `session.terminal`, một handle giữ nguyên danh tính cho
 * tới khi terminal nối lại, nên harness phải mô phỏng đúng điều đó.
 */
function Harness({
  layout,
  handle,
}: {
  readonly layout: string;
  readonly handle: { fit: () => void };
}): ReactElement {
  const [, bump] = useState(0);
  useFitOnLayoutChange(handle, layout, immediate);
  return (
    <button
      type="button"
      onClick={() => {
        bump((n) => n + 1);
      }}
    >
      render lại
    </button>
  );
}

/** Handle giả có danh tính ỔN ĐỊNH, giống `session.terminal` của call site thật. */
function stableHandle(): { handle: { fit: () => void }; fit: ReturnType<typeof vi.fn<() => void>> } {
  const fit = vi.fn<() => void>();
  return { handle: { fit }, fit };
}

describe('AC-5 — fit chạy khi bố cục đổi, và CHỈ khi đó', () => {
  it('đổi `layout` ⇒ đúng MỘT lượt fit thêm', () => {
    const { handle, fit } = stableHandle();
    const { rerender } = render(<Harness layout="editor-split:40" handle={handle} />);
    expect(fit).toHaveBeenCalledTimes(1);

    rerender(<Harness layout="terminal-full" handle={handle} />);
    expect(fit).toHaveBeenCalledTimes(2);

    rerender(<Harness layout="editor-split:70" handle={handle} />);
    expect(fit).toHaveBeenCalledTimes(3);
  });

  it('⛔ ĐỐI CHỨNG DƯƠNG — render lại với CÙNG `layout` KHÔNG sinh lượt fit nào', () => {
    /*
      Đây là ô mà AC-5 đòi và cho tới 2026-09-10 chưa có.

      Không có nó thì một `useFitOnLayoutChange` quên hẳn mảng deps (tức chạy
      mỗi lượt render) vẫn làm mọi ô "đổi layout ⇒ fit" ở trên xanh — chúng chỉ
      khẳng định fit CÓ chạy, không khẳng định nó KHÔNG chạy thừa.
    */
    const { handle, fit } = stableHandle();
    const { rerender } = render(<Harness layout="terminal-full" handle={handle} />);
    expect(fit).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 5; i += 1) {
      rerender(<Harness layout="terminal-full" handle={handle} />);
    }

    expect(
      fit,
      'effect fit đang chạy mỗi lượt render. Trang bài học re-render mỗi giây ' +
        'vì đồng hồ TTL, nên đây là xterm đo lại chính nó mỗi giây suốt buổi học.',
    ).toHaveBeenCalledTimes(1);
  });

  it('handle MỚI (terminal nối lại) ⇒ fit lại, dù `layout` không đổi', () => {
    // Handle gắn với ĐÚNG một `Connection`, nên nối lại là một handle mới. Nếu
    // terminal nối lại sau khi bố cục đã đổi mà effect không chạy, bản vẽ mới
    // giữ nguyên số cột mặc định của xterm.
    const a = stableHandle();
    const b = stableHandle();

    const { rerender } = render(<Harness layout="terminal-full" handle={a.handle} />);
    expect(a.fit).toHaveBeenCalledTimes(1);

    rerender(<Harness layout="terminal-full" handle={b.handle} />);
    expect(b.fit).toHaveBeenCalledTimes(1);
    expect(a.fit).toHaveBeenCalledTimes(1);
  });
});

// ── 16.D.2 · quyết định hình học của lượt chia NGANG ────────────────────────

describe('resolveSplitShape', () => {
  it('đo được và đủ rộng ⇒ chia đôi; đo được và hẹp ⇒ xếp chồng', () => {
    expect(resolveSplitShape(true)).toBe('side-by-side');
    expect(resolveSplitShape(false)).toBe('stacked');
  });

  it('⛔ CHƯA ĐO ĐƯỢC đi theo nhánh RỘNG, không theo nhánh hẹp', () => {
    /*
      Nhánh hẹp không phải một trạng thái trung tính: nó KHẲNG ĐỊNH với người
      dùng rằng màn hình của họ quá nhỏ để mở terminal. Khẳng định đó khi chưa
      đo là nói sai với một nửa số lượt mở, và nó còn bắt mọi máy desktop nhìn
      bố cục nhảy một cái ở mỗi lần tải trang.
    */
    expect(resolveSplitShape(null)).toBe('side-by-side');
  });
});

describe('resolveStackedBottom — `null` là một lựa chọn, không phải "chưa khai"', () => {
  it('chưa khai (undefined) ⇒ lấy khoang phải', () => {
    expect(resolveStackedBottom('side', undefined)).toBe('side');
  });

  it('có khai ⇒ lấy thứ đã khai', () => {
    expect(resolveStackedBottom('side', 'narrow')).toBe('narrow');
  });

  it('⚠ HỒI QUY: `null` KHÔNG bị nuốt thành mặc định', () => {
    /*
      Bản trước viết `narrowSide ?? side`. `null` là một `ReactNode` hợp lệ có
      nghĩa "khi hẹp thì không hiện gì ở dưới", nhưng `??` gộp nó với `undefined`
      và trả về `side` — tức khoang editor (Theia trong iframe) rơi xuống dưới
      một khung 768px, đúng thứ nhánh hẹp tồn tại để tránh.

      TypeScript không kêu, vì cả hai đều hợp kiểu.
    */
    expect(resolveStackedBottom('side', null)).toBeNull();
  });
});
