import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Difficulty } from './difficulty.tsx';

afterEach(() => {
  cleanup();
});

function filledCount(container: HTMLElement): number {
  return container.querySelectorAll('[data-filled="true"]').length;
}

describe('Difficulty', () => {
  it.each([
    ['basic', 1],
    ['intermediate', 2],
    ['advanced', 3],
    ['expert', 4],
  ] as const)('level=%s tô %i trên 4 vạch', (level, expected) => {
    const { container } = render(<Difficulty level={level} />);
    expect(container.querySelectorAll('[data-filled]')).toHaveLength(4);
    expect(filledCount(container)).toBe(expected);
  });

  it('không mang sắc độ: vạch tô bằng `currentColor`, không bằng token màu nào', () => {
    const { container } = render(<Difficulty level="advanced" />);
    const html = container.innerHTML;
    expect(html).toContain('bg-current');
    expect(html).not.toMatch(/bg-(difficulty|line|primary|success|warning|destructive)/);
  });

  it('có `label` + `showLabel` ⇒ hiện chữ, glyph ẩn khỏi cây trợ năng', () => {
    const { container } = render(<Difficulty level="basic" label="Cơ bản" showLabel />);
    expect(screen.getByText('Cơ bản')).toBeDefined();
    expect(container.querySelector('[data-slot="difficulty-glyph"]')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('có `label` nhưng không `showLabel` ⇒ glyph là `role="img"` mang tên đó', () => {
    render(<Difficulty level="expert" label="Rất khó" />);
    expect(screen.getByRole('img', { name: 'Rất khó' })).toBeDefined();
    expect(screen.queryByText('Rất khó')).toBeNull();
  });

  it('không có `label` ⇒ glyph trang trí, không chữ nào (primitive không tự mang tiếng Việt)', () => {
    const { container } = render(<Difficulty level="intermediate" showLabel />);
    expect(container.textContent).toBe('');
    expect(container.querySelector('[data-slot="difficulty-glyph"]')?.getAttribute('aria-hidden')).toBe('true');
  });
});
