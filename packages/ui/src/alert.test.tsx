import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Alert, AlertDescription, AlertTitle } from './alert.tsx';

afterEach(() => {
  cleanup();
});

describe('Alert', () => {
  it('keeps h5 by default and supports headings at the enclosing page or section level', () => {
    const { rerender } = render(<AlertTitle>Notice</AlertTitle>);
    const style = screen.getByRole('heading', { level: 5, name: 'Notice' }).className;
    rerender(<AlertTitle as="h2">Notice</AlertTitle>);
    expect(screen.getByRole('heading', { level: 2, name: 'Notice' }).className).toBe(style);
    rerender(<AlertTitle as="h3">Notice</AlertTitle>);
    expect(screen.getByRole('heading', { level: 3, name: 'Notice' }).className).toBe(style);
  });

  it('variant destructive mang role="alert" (ngắt lời trình đọc màn hình)', () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>Không kết nối được sandbox</AlertTitle>
        <AlertDescription>Thử lại sau ít phút.</AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Không kết nối được sandbox')).toBeDefined();
  });

  it.each(['default', 'warning', 'success'] as const)(
    'variant=%s KHÔNG mang role="alert"',
    (variant) => {
      render(
        <Alert variant={variant}>
          <AlertTitle>Thông báo</AlertTitle>
        </Alert>,
      );
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );
});
