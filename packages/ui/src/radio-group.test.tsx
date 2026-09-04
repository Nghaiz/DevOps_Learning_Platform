import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { RadioGroup, RadioGroupItem } from './radio-group.tsx';

afterEach(() => {
  cleanup();
});

// `onValueChange` mặc định no-op (không `?:` trên tham số đã huỷ cấu trúc) —
// xem chú thích tương đương ở `dropdown-menu.test.tsx` về lý do
// `exactOptionalPropertyTypes: true` từ chối một giá trị `T | undefined` cho
// prop optional-nhưng-kiểu-giá-trị-không-undefined của Radix.
function Example({ onValueChange = () => {} }: { onValueChange?: (value: string) => void }) {
  return (
    <RadioGroup aria-label="Shell mặc định" onValueChange={onValueChange} defaultValue="bash">
      <RadioGroupItem value="bash" aria-label="bash" />
      <RadioGroupItem value="zsh" aria-label="zsh" />
      <RadioGroupItem value="pwsh" aria-label="pwsh" disabled />
    </RadioGroup>
  );
}

describe('RadioGroup', () => {
  it('chỉ đúng một mục được chọn theo defaultValue', () => {
    render(<Example />);
    expect(screen.getByRole('radio', { name: 'bash' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'zsh' }).getAttribute('aria-checked')).toBe('false');
  });

  it('chọn mục khác gọi onValueChange và loại trừ lẫn nhau', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Example onValueChange={onValueChange} />);
    await user.click(screen.getByRole('radio', { name: 'zsh' }));
    expect(onValueChange).toHaveBeenCalledWith('zsh');
    expect(screen.getByRole('radio', { name: 'zsh' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'bash' }).getAttribute('aria-checked')).toBe('false');
  });

  it('mục disabled không chọn được', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Example onValueChange={onValueChange} />);
    await user.click(screen.getByRole('radio', { name: 'pwsh' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
