import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Alert, AlertDescription, AlertTitle } from './alert.tsx';

afterEach(() => {
  cleanup();
});

describe('Alert', () => {
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

  it.each(['default', 'warning', 'success'] as const)('variant=%s KHÔNG mang role="alert"', (variant) => {
    render(
      <Alert variant={variant}>
        <AlertTitle>Thông báo</AlertTitle>
      </Alert>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
