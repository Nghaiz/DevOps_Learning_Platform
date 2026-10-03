import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Chip } from './chip.tsx';

afterEach(() => {
  cleanup();
});

const classesOf = (name: string) => screen.getByRole('button', { name }).className.split(/\s+/);

describe('Chip', () => {
  it('là nút bật/tắt: `aria-pressed` theo `selected`', () => {
    render(
      <div>
        <Chip onClick={() => {}}>Docker</Chip>
        <Chip selected onClick={() => {}}>
          Git
        </Chip>
      </div>,
    );
    expect(screen.getByRole('button', { name: 'Docker' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Git' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('đang chọn = khối mực đảo màu; chưa chọn = khung hairline trên card', () => {
    render(
      <div>
        <Chip onClick={() => {}}>Docker</Chip>
        <Chip selected onClick={() => {}}>
          Git
        </Chip>
      </div>,
    );
    expect(classesOf('Docker')).toEqual(expect.arrayContaining(['border-border', 'bg-card']));
    expect(classesOf('Docker')).not.toContain('bg-ink');
    expect(classesOf('Git')).toEqual(expect.arrayContaining(['bg-ink', 'text-ink-foreground']));
  });

  it('vuông, mono 12px, cao 32px ở cỡ md và 28px ở cỡ sm', () => {
    render(
      <div>
        <Chip onClick={() => {}}>Vừa</Chip>
        <Chip size="sm" onClick={() => {}}>
          Nhỏ
        </Chip>
      </div>,
    );
    expect(classesOf('Vừa')).toEqual(expect.arrayContaining(['rounded-control', 'font-mono', 'text-xs', 'h-8']));
    expect(classesOf('Nhỏ')).toContain('h-7');
  });

  it('`count` in sau nhãn bằng chữ số cùng bề rộng, và nằm trong tên trợ năng', () => {
    render(
      <Chip count={12} onClick={() => {}}>
        Linux
      </Chip>,
    );
    const button = screen.getByRole('button', { name: 'Linux12' });
    const count = button.querySelector('[data-slot="chip-count"]');
    expect(count?.textContent).toBe('12');
    expect(count?.className).toContain('tabular-nums');
  });

  it('bấm gọi `onClick`; `disabled` thì không', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Chip onClick={onClick}>Docker</Chip>);
    await user.click(screen.getByRole('button', { name: 'Docker' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <Chip disabled onClick={onClick}>
        Docker
      </Chip>,
    );
    await user.click(screen.getByRole('button', { name: 'Docker' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('mặc định `type="button"` để không nộp form bao ngoài', () => {
    render(<Chip onClick={() => {}}>Docker</Chip>);
    expect(screen.getByRole('button', { name: 'Docker' }).getAttribute('type')).toBe('button');
  });
});
