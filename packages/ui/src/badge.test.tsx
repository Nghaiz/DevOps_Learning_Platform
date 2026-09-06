import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Badge } from './badge.tsx';

afterEach(() => {
  cleanup();
});

describe('Badge', () => {
  /**
   * ⚠ Khẳng định trên ÁNH XẠ variant → class token, không phải trên "render
   * được". `cva` không ném khi một biến thể biến mất — nó lặng lẽ trả class
   * rỗng — nên một test chỉ `getByText('Nhãn')` vẫn xanh sau khi ai đó xoá
   * `success` khỏi bảng, và mọi badge "Đạt" chuyển sang trông như badge
   * mặc định. Đây là chỗ duy nhất đo được điều đó trong jsdom (không có CSSOM
   * thật để đọc màu đã tính).
   */
  it.each([
    ['default', 'bg-primary'],
    ['secondary', 'bg-secondary'],
    ['success', 'bg-success'],
    ['warning', 'bg-warning'],
    ['destructive', 'bg-destructive'],
    ['outline', 'border-border'],
  ] as const)('variant=%s ánh xạ sang class %s', (variant, expectedClass) => {
    render(<Badge variant={variant}>Nhãn</Badge>);
    const badge = screen.getByText('Nhãn');
    expect(badge.className.split(/\s+/)).toContain(expectedClass);
  });

  it('mặc định là variant "default" khi không truyền gì', () => {
    render(<Badge>Nhãn</Badge>);
    expect(screen.getByText('Nhãn').className.split(/\s+/)).toContain('bg-primary');
  });

  it.each(['default', 'secondary', 'success', 'warning', 'destructive', 'outline'] as const)(
    'variant=%s không phát ra màu hardcode',
    (variant) => {
      render(<Badge variant={variant}>Nhãn</Badge>);
      const { className } = screen.getByText('Nhãn');
      expect(className).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(className).not.toMatch(/\b(slate|gray|zinc|neutral)-[0-9]{2,3}\b/);
    },
  );
});
