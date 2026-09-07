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

  /**
   * Panel là điểm dừng Tab (Radix đặt `tabIndex=0` cùng `role="tabpanel"`), nên
   * nó PHẢI có dấu focus. Đo trên cụm 2026-09-07, `/me` báo "1 điểm dừng Tab
   * KHÔNG đổi gì trên màn hình khi nhận focus" — chính panel này.
   *
   * ⚠ Test khẳng định CẢ HAI nửa: panel focus được, VÀ nó mang lớp vẽ dấu focus.
   * Nửa đầu một mình vô dụng — `tabIndex` đến từ Radix nên nó xanh kể cả khi ta
   * xoá sạch style. Nửa sau một mình cũng vô dụng: một lớp focus trên phần tử
   * không focus được thì không bao giờ vẽ ra gì.
   *
   * jsdom không tính bố cục nên nó KHÔNG chứng minh được dấu focus thật sự nhìn
   * thấy; phép đo đó là `keyboard.spec.ts` trên cụm (chụp trước/sau focus rồi so
   * pixel). Test này gác chuyện lớp bị gỡ mất trong một lượt refactor — thứ mà
   * lượt e2e chỉ bắt được sau khi đã deploy.
   */
  it('panel nhận được focus và mang lớp dấu focus (regression /me 2026-09-07)', () => {
    render(<Example />);
    const panel = screen.getByRole('tabpanel');

    panel.focus();
    expect(document.activeElement).toBe(panel);

    const cls = panel.getAttribute('class') ?? '';
    expect(
      cls.includes('focus-visible:outline-2'),
      `panel không có lớp dấu focus — class hiện tại: ${cls}`,
    ).toBe(true);
  });
});
