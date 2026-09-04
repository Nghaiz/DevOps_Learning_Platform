import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Badge } from './badge.tsx';

afterEach(() => {
  cleanup();
});

describe('Badge', () => {
  it.each(['default', 'secondary', 'success', 'warning', 'destructive', 'outline'] as const)(
    'variant=%s render đúng nội dung',
    (variant) => {
      render(<Badge variant={variant}>Nhãn</Badge>);
      expect(screen.getByText('Nhãn')).toBeDefined();
    },
  );
});
