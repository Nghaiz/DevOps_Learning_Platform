import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Textarea } from './textarea.tsx';

afterEach(() => {
  cleanup();
});

describe('Textarea', () => {
  it('gõ nhiều dòng cập nhật đúng giá trị', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Mô tả" />);
    const textarea = screen.getByLabelText('Mô tả') as HTMLTextAreaElement;
    await user.type(textarea, 'Dòng một{enter}Dòng hai');
    expect(textarea.value).toBe('Dòng một\nDòng hai');
  });

  it('invalid=true ⇒ aria-invalid="true"', () => {
    render(<Textarea aria-label="Mô tả" invalid />);
    expect(screen.getByLabelText('Mô tả').getAttribute('aria-invalid')).toBe('true');
  });

  it('disabled ⇒ không gõ được', () => {
    render(<Textarea aria-label="Mô tả" disabled />);
    expect((screen.getByLabelText('Mô tả') as HTMLTextAreaElement).disabled).toBe(true);
  });
});
