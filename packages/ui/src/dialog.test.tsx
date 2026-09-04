import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog.tsx';
import { Button } from './button.tsx';

afterEach(() => {
  cleanup();
});

function Example() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Mở hộp thoại</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xác nhận kết thúc phiên</DialogTitle>
          <DialogDescription>Phiên sandbox sẽ bị huỷ và không khôi phục được.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="destructive">Kết thúc</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('đóng mặc định — nội dung không có trong DOM', () => {
    render(<Example />);
    expect(screen.queryByText('Xác nhận kết thúc phiên')).toBeNull();
  });

  it('bấm trigger mở hộp thoại, hiện title + description, gắn đúng aria-labelledby/describedby', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Mở hộp thoại' }));

    const dialog = screen.getByRole('dialog');
    const title = screen.getByText('Xác nhận kết thúc phiên');
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    expect(screen.getByText('Phiên sandbox sẽ bị huỷ và không khôi phục được.')).toBeDefined();
  });

  it('bấm nút Đóng (X) đóng hộp thoại', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Mở hộp thoại' }));
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('bấm hành động trong footer (DialogClose asChild) cũng đóng hộp thoại', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Mở hộp thoại' }));
    await user.click(screen.getByRole('button', { name: 'Kết thúc' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('phím Escape đóng hộp thoại', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Mở hộp thoại' }));
    expect(screen.getByRole('dialog')).toBeDefined();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
