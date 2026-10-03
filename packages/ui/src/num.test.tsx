import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Num } from './num.tsx';

afterEach(() => {
  cleanup();
});

describe('Num', () => {
  it('số trong câu: chữ display đậm + chữ số cùng bề rộng', () => {
    render(
      <p>
        Đang chạy <Num>12</Num> phiên
      </p>,
    );
    const num = screen.getByText('12');
    expect(num.tagName).toBe('SPAN');
    expect(num.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['font-display', 'font-extrabold', 'tabular-nums']),
    );
  });

  it.each([
    // `primary` là màu TÔ; chữ đỏ trên nền trang phải là `--brand`
    ['primary', 'text-brand'],
    ['success', 'text-success'],
    ['warning', 'text-warning'],
    ['destructive', 'text-destructive'],
    // tuyến chủ đề: chữ dùng `-ink`, không dùng màu tô
    ['git', 'text-line-git-ink'],
  ] as const)('tone=%s ra mực chữ %s', (tone, expected) => {
    render(<Num tone={tone}>7</Num>);
    expect(screen.getByText('7').className.split(/\s+/)).toContain(expected);
  });

  it('`default` thừa hưởng màu chữ của câu, không tự đặt màu', () => {
    render(<Num>3</Num>);
    expect(screen.getByText('3').className.split(/\s+/).filter((name) => name.startsWith('text-'))).toEqual([]);
  });
});
