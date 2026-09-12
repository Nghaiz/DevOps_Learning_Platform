// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from '../forgot-password/forgot-password-form';
import { ResetPasswordForm } from './reset-password-form';

const requests = vi.hoisted(() => ({ requestPasswordReset: vi.fn(), resetPassword: vi.fn() }));
vi.mock('../../lib/auth-client', () => ({ authClient: requests }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('password reset forms use the real client contract', () => {
  it('shows success only after the request completes and keeps an SMTP failure visible', async () => {
    requests.requestPasswordReset.mockResolvedValue({ error: { status: 503 } });
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'learner@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã đặt lại mật khẩu' }));
    await screen.findByText('Chưa gửi được yêu cầu đặt lại mật khẩu.');
    expect(screen.queryByText('Yêu cầu đã được tiếp nhận')).toBeNull();
    requests.requestPasswordReset.mockResolvedValue({ data: { status: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã đặt lại mật khẩu' }));
    await screen.findByText('Yêu cầu đã được tiếp nhận');
    expect(requests.requestPasswordReset).toHaveBeenLastCalledWith({
      email: 'learner@example.test',
    });
    expect(
      screen.getByRole('link', { name: 'Nhập mã đặt lại mật khẩu' }).getAttribute('href'),
    ).toBe('/reset-password');
  });

  it('does not submit mismatched passwords and posts a pasted code on success', async () => {
    requests.resetPassword.mockResolvedValue({ data: { status: true } });
    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText('Mã đặt lại mật khẩu'), {
      target: { value: '  pasted-code  ' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), {
      target: { value: 'New-password-123' },
    });
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu mới'), {
      target: { value: 'Wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt mật khẩu mới' }));
    expect(requests.resetPassword).not.toHaveBeenCalled();
    expect(screen.getByText('Hai ô mật khẩu chưa khớp nhau.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu mới'), {
      target: { value: 'New-password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt mật khẩu mới' }));
    await screen.findByText('Đã đổi mật khẩu');
    expect(requests.resetPassword).toHaveBeenCalledWith({
      newPassword: 'New-password-123',
      token: 'pasted-code',
    });
    expect(screen.queryByLabelText('Mật khẩu mới')).toBeNull();
  });

  it('keeps password fields when the server rejects an expired code', async () => {
    requests.resetPassword.mockResolvedValue({ error: { status: 400 } });
    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText('Mã đặt lại mật khẩu'), {
      target: { value: 'expired-code' },
    });
    for (const label of ['Mật khẩu mới', 'Nhập lại mật khẩu mới']) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: 'New-password-123' } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Đặt mật khẩu mới' }));
    await screen.findByText('Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    expect((screen.getByLabelText('Mật khẩu mới') as HTMLInputElement).value).toBe(
      'New-password-123',
    );
    expect(screen.queryByText('Đã đổi mật khẩu')).toBeNull();
  });

  it('prevents duplicate sends while pending and restores the form after a network error', async () => {
    let fail: (reason: Error) => void = () => {
      throw new Error('Request did not start');
    };
    requests.requestPasswordReset.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'learner@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã đặt lại mật khẩu' }));
    expect(
      (screen.getByRole('button', { name: 'Đang gửi yêu cầu…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(requests.requestPasswordReset).toHaveBeenCalledTimes(1);
    fail(new Error('offline'));
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Gửi mã đặt lại mật khẩu' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(screen.getByRole('alert').textContent).toContain('Không gọi được máy chủ');
    expect(screen.queryByText('Yêu cầu đã được tiếp nhận')).toBeNull();
  });
});
