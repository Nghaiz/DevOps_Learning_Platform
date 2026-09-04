import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Input } from './input.tsx';

afterEach(() => {
  cleanup();
});

describe('Input', () => {
  it('gõ chữ gọi onChange, giá trị hiện đúng trong ô', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input aria-label="Tên" onChange={onChange} />);
    const input = screen.getByLabelText('Tên') as HTMLInputElement;
    await user.type(input, 'Xin chào');
    expect(input.value).toBe('Xin chào');
    expect(onChange).toHaveBeenCalled();
  });

  it('invalid=true ⇒ aria-invalid="true"', () => {
    render(<Input aria-label="Email" invalid />);
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
  });

  it('invalid=false (mặc định) ⇒ không có aria-invalid', () => {
    render(<Input aria-label="Email" />);
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBeNull();
  });

  it('disabled ⇒ không gõ được', () => {
    render(<Input aria-label="Tên" disabled />);
    expect((screen.getByLabelText('Tên') as HTMLInputElement).disabled).toBe(true);
  });
});
