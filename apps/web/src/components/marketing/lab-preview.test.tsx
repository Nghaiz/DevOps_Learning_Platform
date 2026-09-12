// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { LabPreview } from './lab-preview';

afterEach(cleanup);

describe('landing lab preview', () => {
  it('labels the sample and never presents it as a connected sandbox', () => {
    render(<LabPreview />);
    expect(screen.getByText('Bản minh hoạ tương tác')).toBeDefined();
    expect(screen.getByText(/Kết quả mẫu, không kết nối sandbox/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Docker' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.queryByText(/web\s+Up 2 seconds\s+0.0.0.0:8080->80\/tcp/)).toBeNull();
  });

  it('runs the example, clears stale output on topic change, and resets for another attempt', () => {
    render(<LabPreview />);
    fireEvent.click(screen.getByRole('button', { name: 'Chạy ví dụ' }));
    expect(screen.getByText(/web\s+Up 2 seconds\s+0.0.0.0:8080->80\/tcp/)).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'Đã chạy ví dụ' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Linux' }));
    expect(screen.queryByText(/web\s+Up 2 seconds\s+0.0.0.0:8080->80\/tcp/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Chạy ví dụ' }));
    expect(screen.getByText('-rwxr--r-- 1 learner learner 128 deploy.sh')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại ví dụ' }));
    expect(screen.queryByText('-rwxr--r-- 1 learner learner 128 deploy.sh')).toBeNull();
    expect((screen.getByRole('button', { name: 'Chạy ví dụ' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('supports choosing and running a different example with only the keyboard', async () => {
    const user = userEvent.setup();
    render(<LabPreview />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Linux' }));
    await user.tab();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Kubernetes' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await user.tab();
    await user.keyboard(' ');
    expect(screen.getByText(/deployment.apps\/web created/)).toBeDefined();
    expect(screen.getByText(/Deployment đã có đủ 1 Pod sẵn sàng/)).toBeDefined();
  });
});
