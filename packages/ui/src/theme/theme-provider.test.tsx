import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  ThemeProvider,
  useTheme,
  type ThemeChoice,
} from './theme-provider.tsx';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * `THEME_INIT_SCRIPT` là một CHUỖI JS thuần chạy trong `<script>` chèn bằng
 * `dangerouslySetInnerHTML` — test bằng cách thật sự `eval` nó trong jsdom
 * (đúng những gì trình duyệt làm khi parse thẻ script), không phải test hành
 * vi của một hàm TypeScript tương đương.
 */
describe('THEME_INIT_SCRIPT', () => {
  it('localStorage có "dark" ⇒ thêm class dark vào <html> trước khi React chạy', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    eval(THEME_INIT_SCRIPT);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('localStorage có "light" ⇒ KHÔNG thêm class dark', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    eval(THEME_INIT_SCRIPT);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('chưa từng chọn (localStorage rỗng) ⇒ theo prefers-color-scheme của hệ thống', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    eval(THEME_INIT_SCRIPT);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('localStorage ném lỗi (chế độ riêng tư) ⇒ không sập, không thêm class dark', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => eval(THEME_INIT_SCRIPT)).not.toThrow();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

function Probe() {
  const { choice, resolved, setChoice } = useTheme();
  return (
    <div>
      <span data-testid="choice">{choice}</span>
      <span data-testid="resolved">{resolved}</span>
      <button onClick={() => setChoice('dark')}>Chọn tối</button>
      <button onClick={() => setChoice('light')}>Chọn sáng</button>
    </div>
  );
}

describe('ThemeProvider / useTheme', () => {
  it('mặc định "system" khi chưa có gì trong localStorage', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('choice').textContent).toBe('system');
  });

  it('setChoice("dark") cập nhật context, ghi localStorage, và thêm class dark', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Chọn tối' }));

    expect(screen.getByTestId('choice').textContent).toBe('dark');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('setChoice("light") gỡ class dark', async () => {
    const user = userEvent.setup();
    document.documentElement.classList.add('dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Chọn sáng' }));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('đọc lựa chọn đã lưu từ localStorage lúc khởi tạo', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark' satisfies ThemeChoice);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('choice').textContent).toBe('dark');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  it('storageKey tuỳ chỉnh dùng đúng khoá đó, không đụng khoá mặc định', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider storageKey="other.key">
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Chọn tối' }));
    expect(localStorage.getItem('other.key')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('useTheme() ngoài ThemeProvider ném lỗi rõ ràng thay vì context rỗng im lặng', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/useTheme/);
    consoleError.mockRestore();
  });

  it('đổi prefers-color-scheme lúc đang ở "system" cập nhật resolved theo thời gian thực', () => {
    let changeHandler: (() => void) | undefined;
    const mql = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn((_event: string, handler: () => void) => {
        changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList);

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('resolved').textContent).toBe('light');

    mql.matches = true;
    act(() => {
      changeHandler?.();
    });
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });
});

/**
 * D2 có HAI cài đặt của cùng một quyết định: `THEME_INIT_SCRIPT` (chuỗi JS
 * thuần, chạy trước paint) và `ThemeProvider` (TypeScript, chạy sau hydrate).
 * Chúng phải cho ra CÙNG một class — hai bộ luật viết tay ở hai ngôn ngữ,
 * không có gì bắt chúng đi cùng nhau ngoài kỷ luật.
 *
 * Lệch nhau không gây lỗi nào: trang chỉ NHÁY MÀU một nhịp lúc hydrate (đúng
 * thứ script tồn tại để tránh) và `<html>` đổi thuộc tính sau khi React gắn
 * — nghĩa là `suppressHydrationWarning` ở `layout.tsx` sẽ nuốt luôn cảnh báo
 * duy nhất có thể tố giác nó. Nên phải gác ở đây.
 */
describe('THEME_INIT_SCRIPT ⇄ ThemeProvider — bàn giao không nháy màu', () => {
  it.each([
    ['dark', true],
    ['light', false],
  ] as const)('lựa chọn "%s": provider GIỮ NGUYÊN class script đã đặt', (choice, expectDark) => {
    localStorage.setItem(THEME_STORAGE_KEY, choice);

    eval(THEME_INIT_SCRIPT);
    const afterScript = document.documentElement.classList.contains('dark');
    expect(afterScript).toBe(expectDark);

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    // Không đảo, không nháy: cùng một kết luận trước và sau hydrate.
    expect(document.documentElement.classList.contains('dark')).toBe(afterScript);
    expect(screen.getByTestId('resolved').textContent).toBe(expectDark ? 'dark' : 'light');
  });

  it('"system" + prefers-dark: script và provider cùng kết luận "dark"', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);

    eval(THEME_INIT_SCRIPT);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  it('script dùng ĐÚNG khoá localStorage mà provider đọc (không phải một chuỗi chép tay)', () => {
    // Script là một chuỗi nội suy; đổi `THEME_STORAGE_KEY` mà quên cập nhật
    // chuỗi sẽ làm hai bên đọc hai khoá khác nhau — im lặng hoàn toàn.
    expect(THEME_INIT_SCRIPT).toContain(`'${THEME_STORAGE_KEY}'`);
  });

  it('script khớp selector `@custom-variant dark` của globals.css: đặt class trên documentElement', () => {
    // `@custom-variant dark (&:where(.dark, .dark *))` chỉ ăn khi `.dark` nằm
    // trên `<html>` (hoặc tổ tiên của phần tử được style). Script đặt sai chỗ
    // — ví dụ `document.body` — thì mọi `dark:` variant im lặng không áp dụng.
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    eval(THEME_INIT_SCRIPT);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.body.classList.contains('dark')).toBe(false);
  });
});
