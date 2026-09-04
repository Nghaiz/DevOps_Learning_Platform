import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu.tsx';
import { Button } from './button.tsx';

afterEach(() => {
  cleanup();
});

function Example(props: { onSelectSettings?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>Tài khoản</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>qa.theonestudio@gmail.com</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={props.onSelectSettings}>Hồ sơ & cài đặt</DropdownMenuItem>
        <DropdownMenuItem disabled>Quản trị (không có quyền)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('DropdownMenu', () => {
  it('đóng mặc định — menu không có trong DOM', () => {
    render(<Example />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('bấm trigger mở menu, hiện đủ mục', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Tài khoản' }));
    expect(await screen.findByRole('menu')).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Hồ sơ & cài đặt' })).toBeDefined();
  });

  it('bấm một mục gọi onSelect và đóng menu', async () => {
    const user = userEvent.setup();
    const onSelectSettings = vi.fn();
    render(<Example onSelectSettings={onSelectSettings} />);
    await user.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Hồ sơ & cài đặt' }));
    expect(onSelectSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('mục disabled mang aria-disabled, không gọi được onSelect', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Tài khoản' }));
    const disabledItem = await screen.findByRole('menuitem', { name: 'Quản trị (không có quyền)' });
    expect(disabledItem.getAttribute('data-disabled')).not.toBeNull();
  });

  it('phím Escape đóng menu', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Tài khoản' }));
    expect(await screen.findByRole('menu')).toBeDefined();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
