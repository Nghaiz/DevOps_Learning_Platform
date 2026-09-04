import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select.tsx';

afterEach(() => {
  cleanup();
});

function Example(props: { onValueChange?: (value: string) => void; disabled?: boolean }) {
  return (
    <Select onValueChange={props.onValueChange} disabled={props.disabled}>
      <SelectTrigger aria-label="Độ khó">
        <SelectValue placeholder="Chọn độ khó" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="beginner">Cơ bản</SelectItem>
        <SelectItem value="intermediate">Trung bình</SelectItem>
        <SelectItem value="advanced" disabled>
          Nâng cao (khoá)
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

describe('Select', () => {
  it('hiện placeholder khi chưa chọn giá trị nào', () => {
    render(<Example />);
    expect(screen.getByText('Chọn độ khó')).toBeDefined();
  });

  it('bấm trigger mở danh sách, bấm một mục gọi onValueChange và cập nhật hiển thị', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Example onValueChange={onValueChange} />);

    await user.click(screen.getByRole('combobox', { name: 'Độ khó' }));
    await user.click(await screen.findByRole('option', { name: 'Trung bình' }));

    expect(onValueChange).toHaveBeenCalledWith('intermediate');
    expect(screen.getByText('Trung bình')).toBeDefined();
  });

  it('disabled ở cấp Select ⇒ trigger bị vô hiệu', () => {
    render(<Example disabled />);
    expect(screen.getByRole('combobox', { name: 'Độ khó' }).getAttribute('data-disabled')).not.toBeNull();
  });

  it('mục disabled hiện trong danh sách nhưng mang data-disabled', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('combobox', { name: 'Độ khó' }));
    const advanced = await screen.findByRole('option', { name: 'Nâng cao (khoá)' });
    expect(advanced.getAttribute('data-disabled')).not.toBeNull();
  });
});
