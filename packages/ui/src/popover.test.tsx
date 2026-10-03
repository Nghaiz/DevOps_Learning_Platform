import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Popover, PopoverContent, PopoverTrigger } from './popover.tsx';

afterEach(() => {
  cleanup();
});

function Example() {
  return (
    <Popover>
      <PopoverTrigger>Bộ lọc</PopoverTrigger>
      <PopoverContent aria-label="Chọn bộ lọc">Nội dung lọc</PopoverContent>
    </Popover>
  );
}

describe('Popover', () => {
  it('đóng mặc định; bấm trigger mở, `aria-expanded` đổi theo', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Bộ lọc' });
    expect(screen.queryByText('Nội dung lọc')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await user.click(trigger);
    expect(screen.getByText('Nội dung lọc')).toBeDefined();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('lớp nổi: vuông qua `rounded-surface`, viền mực, bóng `shadow-float`', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Bộ lọc' }));
    const content = screen.getByText('Nội dung lọc');
    expect(content.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['rounded-surface', 'border-ink', 'shadow-float']),
    );
    expect(content.className).not.toContain('shadow-elevation');
  });

  it('Escape đóng và trả focus về trigger', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Bộ lọc' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Nội dung lọc')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
