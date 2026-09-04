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

  it('rời chuột khỏi trigger ẩn lại tooltip', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.hover(screen.getByRole('button', { name: 'Thêm giờ' }));
    await screen.findByText('Thêm 15 phút vào phiên hiện tại');
    await user.unhover(screen.getByRole('button', { name: 'Thêm giờ' }));
    expect(screen.queryByText('Thêm 15 phút vào phiên hiện tại')).toBeNull();
  });

  it('focus bàn phím vào trigger cũng hiện tooltip (không chỉ hover chuột)', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.tab();
    expect(await screen.findByText('Thêm 15 phút vào phiên hiện tại')).toBeDefined();
  });
});
