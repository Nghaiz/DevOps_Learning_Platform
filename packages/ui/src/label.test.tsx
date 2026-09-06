import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Label } from './label.tsx';
import { Input } from './input.tsx';

afterEach(() => {
  cleanup();
});

describe('Label', () => {
  it('htmlFor trùng id ⇒ bấm label focus đúng input (accessible name qua label)', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Label htmlFor="ten">Tên</Label>
        <Input id="ten" />
      </div>,
    );
    const input = screen.getByLabelText('Tên') as HTMLInputElement;
    await user.click(screen.getByText('Tên'));
    expect(document.activeElement).toBe(input);
  });
});

/**
 * Bảng 4 trạng thái ở `docs/design-system.md` §4a khai `Label` → disabled =
 * "theo `peer-disabled` của control liên kết". Đó là một khẳng định về CODE,
 * nên nó phải có một phép kiểm — nếu không, bảng đang nói nhiều hơn thứ
 * `packages/ui` thật sự làm, và mục "n/a có lý do" mất hết giá trị vì không
 * phân biệt được với "quên viết".
 *
 * Hình dạng `peer-*` của Tailwind cần control mang class `peer` đứng TRƯỚC
 * label trong DOM. jsdom không tính CSS thật nên phép kiểm dừng ở mức class có
 * mặt — mức sâu hơn (chữ có mờ đi thật không) thuộc về cổng axe/ảnh chụp của
 * 13.H.
 */
describe('Label — trạng thái disabled (§4a)', () => {
  it('mang class peer-disabled để mờ theo control liên kết', () => {
    render(
      <div>
        <Input id="ho-ten" className="peer" disabled />
        <Label htmlFor="ho-ten">Họ tên</Label>
      </div>,
    );
    const classes = screen.getByText('Họ tên').className.split(/\s+/);
    expect(classes).toContain('peer-disabled:opacity-50');
    expect(classes).toContain('peer-disabled:cursor-not-allowed');
  });
});
