import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from './sheet.tsx';
import type { SheetSide } from './sheet.tsx';

afterEach(() => {
  cleanup();
});

function Example({ rootSide, contentSide, closeLabel }: {
  readonly rootSide?: SheetSide;
  readonly contentSide?: SheetSide;
  readonly closeLabel?: string;
}) {
  return (
    <Sheet {...(rootSide === undefined ? {} : { side: rootSide })}>
      <SheetTrigger>Mở menu</SheetTrigger>
      <SheetContent
        {...(contentSide === undefined ? {} : { side: contentSide })}
        {...(closeLabel === undefined ? {} : { closeLabel })}
      >
        <SheetTitle>Điều hướng</SheetTitle>
        <SheetDescription>Các mục của trang</SheetDescription>
        <SheetClose>Xong</SheetClose>
      </SheetContent>
    </Sheet>
  );
}

async function open(): Promise<HTMLElement> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Mở menu' }));
  return screen.getByRole('dialog', { name: 'Điều hướng' });
}

describe('Sheet', () => {
  it('đóng mặc định; bấm trigger mở một dialog có tên + mô tả', async () => {
    render(<Example />);
    expect(screen.queryByRole('dialog')).toBeNull();
    const dialog = await open();
    expect(dialog.getAttribute('aria-describedby')).toBe(screen.getByText('Các mục của trang').id);
  });

  it('mặc định mép phải, viền mực và bóng lớp nổi', async () => {
    render(<Example />);
    const dialog = await open();
    expect(dialog.getAttribute('data-side')).toBe('right');
    expect(dialog.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['right-0', 'border-ink', 'shadow-float']),
    );
  });

  it('`side` đặt ở `Sheet` có tác dụng; `SheetContent` thắng khi cả hai có mặt', async () => {
    render(<Example rootSide="bottom" />);
    expect((await open()).getAttribute('data-side')).toBe('bottom');
    cleanup();
    render(<Example rootSide="bottom" contentSide="full" />);
    const dialog = await open();
    expect(dialog.getAttribute('data-side')).toBe('full');
    expect(dialog.className.split(/\s+/)).toContain('inset-0');
  });

  it('không có `closeLabel` ⇒ không tự vẽ nút X', async () => {
    render(<Example />);
    const dialog = await open();
    expect(dialog.querySelector('[data-slot="sheet-close"]')).toBeNull();
  });

  it('có `closeLabel` ⇒ nút X mang đúng nhãn đó và đóng tấm trượt', async () => {
    const user = userEvent.setup();
    render(<Example closeLabel="Đóng menu" />);
    await open();
    await user.click(screen.getByRole('button', { name: 'Đóng menu' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('`SheetClose` và phím Escape đều đóng', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await open();
    await user.click(screen.getByRole('button', { name: 'Xong' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await open();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
