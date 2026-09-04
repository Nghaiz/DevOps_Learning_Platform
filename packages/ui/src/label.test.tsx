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
