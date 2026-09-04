import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs.tsx';

afterEach(() => {
  cleanup();
});

function Example() {
  return (
    <Tabs defaultValue="lab">
      <TabsList aria-label="Chuyển tab">
        <TabsTrigger value="lab">Lab</TabsTrigger>
        <TabsTrigger value="quiz">Quiz</TabsTrigger>
        <TabsTrigger value="disabled" disabled>
          Đã khoá
        </TabsTrigger>
      </TabsList>
      <TabsContent value="lab">Nội dung Lab</TabsContent>
      <TabsContent value="quiz">Nội dung Quiz</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('hiện đúng tab mặc định, ẩn tab còn lại', () => {
    render(<Example />);
    expect(screen.getByText('Nội dung Lab')).toBeDefined();
    expect(screen.queryByText('Nội dung Quiz')).toBeNull();
  });

  it('bấm tab khác chuyển nội dung hiển thị, aria-selected đổi đúng', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('tab', { name: 'Quiz' }));
    expect(screen.getByText('Nội dung Quiz')).toBeDefined();
    expect(screen.queryByText('Nội dung Lab')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Quiz' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Lab' }).getAttribute('aria-selected')).toBe('false');
  });

  it('tab disabled không chuyển được bằng click', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('tab', { name: 'Đã khoá' }));
    expect(screen.getByText('Nội dung Lab')).toBeDefined();
  });

  it('điều hướng bằng bàn phím (ArrowRight) đổi tab active', async () => {
    const user = userEvent.setup();
    render(<Example />);
    screen.getByRole('tab', { name: 'Lab' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Nội dung Quiz')).toBeDefined();
  });
});
