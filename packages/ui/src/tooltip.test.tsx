import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip.tsx';
import { Button } from './button.tsx';

afterEach(() => {
  cleanup();
});

function Example() {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button aria-label="Thêm giờ">+</Button>
        </TooltipTrigger>
        <TooltipContent>Thêm 15 phút vào phiên hiện tại</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

describe('Tooltip', () => {
  it('ẩn mặc định — nội dung không có trong DOM', () => {
    render(<Example />);
    expect(screen.queryByText('Thêm 15 phút vào phiên hiện tại')).toBeNull();
  });

  it('hover vào trigger hiện tooltip', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.hover(screen.getByRole('button', { name: 'Thêm giờ' }));
    expect(await screen.findByText('Thêm 15 phút vào phiên hiện tại')).toBeDefined();
  });

  /**
   * KHÔNG test bằng `user.unhover()`: Radix Tooltip có logic "vùng an toàn"
   * (grace area) giữa trigger và content dựa trên `getBoundingClientRect()` —
   * jsdom không có bố cục thật nên mọi rect đều 0×0 tại (0,0)
   * (xem cảnh báo tương tự ở `split-pane.test.tsx`), khiến Radix luôn coi con
   * trỏ còn nằm trong "vùng an toàn" và không bao giờ đóng tooltip dù đã bắn
   * sự kiện pointerleave. Đóng bằng Escape — một đường đóng khác Radix hỗ trợ,
   * không phụ thuộc hình học — để test đúng thứ jsdom đo được.
   */
  it('phím Escape ẩn lại tooltip', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.hover(screen.getByRole('button', { name: 'Thêm giờ' }));
    await screen.findByText('Thêm 15 phút vào phiên hiện tại');
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Thêm 15 phút vào phiên hiện tại')).toBeNull();
  });

  it('focus bàn phím vào trigger cũng hiện tooltip (không chỉ hover chuột)', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.tab();
    expect(await screen.findByText('Thêm 15 phút vào phiên hiện tại')).toBeDefined();
  });
});
