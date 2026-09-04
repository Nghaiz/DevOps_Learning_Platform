import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmptyState } from './empty-state.tsx';
import { Button } from './button.tsx';

afterEach(() => {
  cleanup();
});

describe('EmptyState', () => {
  it('render title, không có description/action thì không render các phần đó', () => {
    render(<EmptyState title="Chưa có lab nào" />);
    expect(screen.getByText('Chưa có lab nào')).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('có action ⇒ render được nút hành động và bấm được', () => {
    render(
      <EmptyState
        title="Chưa có lab nào"
        description="Là tác giả? Tạo lab đầu tiên."
        action={<Button>Tạo lab</Button>}
      />,
    );
    expect(screen.getByText('Là tác giả? Tạo lab đầu tiên.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tạo lab' })).toBeDefined();
  });
});
