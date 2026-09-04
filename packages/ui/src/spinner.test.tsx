import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Spinner } from './spinner.tsx';

afterEach(() => {
  cleanup();
});

describe('Spinner', () => {
  it('render với role="status" và nhãn "Đang tải" cho trình đọc màn hình', () => {
    render(<Spinner />);
    expect(screen.getByRole('status', { name: 'Đang tải' })).toBeDefined();
  });

  it.each(['sm', 'md', 'lg'] as const)('size=%s render không lỗi', (size) => {
    render(<Spinner size={size} />);
    expect(screen.getByRole('status')).toBeDefined();
  });
});
