import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StatusDot } from './status-dot.tsx';

afterEach(() => {
  cleanup();
});

function dotClasses(container: HTMLElement): string[] {
  return (container.querySelector('[data-slot="status-dot"]') as HTMLElement).className.split(/\s+/);
}

describe('StatusDot', () => {
  it.each([
    ['ok', 'bg-success'],
    ['warn', 'bg-warning'],
    ['bad', 'bg-destructive'],
    ['idle', 'bg-muted-foreground'],
    ['live', 'bg-success'],
  ] as const)('tone=%s tô %s', (tone, expected) => {
    const { container } = render(<StatusDot tone={tone} />);
    expect(dotClasses(container)).toContain(expected);
  });

  it('chấm tròn 8px — một trong số ít thứ được tròn', () => {
    const { container } = render(<StatusDot tone="ok" />);
    expect(dotClasses(container)).toEqual(expect.arrayContaining(['size-2', 'rounded-full']));
  });

  it('chỉ `live` nhấp nháy', () => {
    const { container, rerender } = render(<StatusDot tone="live" />);
    expect(dotClasses(container)).toContain('animate-pulse');
    rerender(<StatusDot tone="ok" />);
    expect(dotClasses(container)).not.toContain('animate-pulse');
  });

  it('mặc định ẩn khỏi cây trợ năng; có `aria-label` thì thành `role="img"`', () => {
    const { container, rerender } = render(<StatusDot tone="bad" />);
    expect(container.querySelector('[data-slot="status-dot"]')?.getAttribute('aria-hidden')).toBe('true');
    rerender(<StatusDot tone="bad" aria-label="Lỗi" />);
    expect(screen.getByRole('img', { name: 'Lỗi' })).toBeDefined();
  });
});
