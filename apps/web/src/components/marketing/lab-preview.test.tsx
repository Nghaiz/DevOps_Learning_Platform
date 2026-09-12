// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LabPreview } from './lab-preview';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

  it('scrubs the illustrative pipeline in both directions without executing a command', () => {
    let callback: FrameRequestCallback | undefined;
    const request = vi.fn((next: FrameRequestCallback) => {
      callback = next;
      return 1;
    });
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    vi.stubGlobal('IntersectionObserver', undefined);
    const { unmount } = render(<LabPreview />);
    const surface = screen.getByTestId('landing-lab-preview');
    const wrapper = surface.parentElement!;
    const measure = vi.spyOn(wrapper, 'getBoundingClientRect');
    function scrollTo(top: number) {
      measure.mockReturnValue({ top, height: 600 } as DOMRect);
      fireEvent.scroll(window);
      callback?.(0);
    }
    scrollTo(window.innerHeight + 20);
    expect(surface.style.getPropertyValue('--bench-progress')).toBe('0.0000');
    scrollTo(-700);
    expect(surface.style.getPropertyValue('--bench-progress')).toBe('1.0000');
    expect(surface.dataset.scrollStage).toBe('result');
    expect(screen.queryByText(/web\s+Up 2 seconds\s+0.0.0.0:8080->80\/tcp/)).toBeNull();
    scrollTo(window.innerHeight - 20);
    expect(surface.dataset.scrollStage).toBe('read');
    fireEvent.click(screen.getByRole('button', { name: 'Chạy ví dụ' }));
    expect(screen.getByText(/web\s+Up 2 seconds\s+0.0.0.0:8080->80\/tcp/)).toBeDefined();
    fireEvent.scroll(window);
    unmount();
    const requestedAtUnmount = request.mock.calls.length;
    fireEvent.scroll(window);
    expect(request).toHaveBeenCalledTimes(requestedAtUnmount);
    expect(cancel).toHaveBeenCalledWith(1);
  });

  it('keeps a fully revealed static workbench when reduced motion is requested', () => {
    let callback: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (next: FrameRequestCallback) => {
      callback = next;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    render(<LabPreview />);
    callback?.(0);
    const surface = screen.getByTestId('landing-lab-preview');
    expect(surface.style.getPropertyValue('--bench-progress')).toBe('0.5');
    expect(surface.style.getPropertyValue('--bench-reveal')).toBe('1');
    expect(screen.getByRole('button', { name: 'Chạy ví dụ' })).toBeDefined();
  });
});
