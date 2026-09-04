'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

/** Khoá localStorage mặc định — trùng với hằng số dùng ở `THEME_INIT_SCRIPT`. */
export const THEME_STORAGE_KEY = 'dlp.theme';

/**
 * Script inline đặt class `dark` trên `<html>` TRƯỚC PAINT — nhúng bằng
 * `<script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />`
 * trong `<head>` (CSP `script-src` dùng nonce, không `unsafe-inline` — xem
 * `apps/web/src/server/security/headers.ts`).
 *
 * Đây là NGUỒN DUY NHẤT quyết định class ban đầu; `ThemeProvider` bên dưới chỉ
 * ĐỒNG BỘ LẠI (idempotent) sau khi React hydrate, không phải nguồn thứ hai —
 * nếu cả hai đặt class ở hai thời điểm khác nhau với hai logic khác nhau, một
 * cú resize/khác biệt race sẽ gây nháy màu (FOUC) đúng thứ token này sinh ra
 * để tránh.
 *
 * Là một CHUỖI thuần (không phải hàm) vì nó phải chạy trước khi bất kỳ bundle
 * JS nào của React nạp xong — `dangerouslySetInnerHTML` chèn thẳng text vào
 * script tag, không serialize một closure được.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var v=localStorage.getItem(k);var c=(v==='light'||v==='dark'||v==='system')?v:'system';var d=c==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):c;var el=document.documentElement;if(d==='dark'){el.classList.add('dark')}else{el.classList.remove('dark')}}catch(e){}})();`;

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredChoice(storageKey: string): ThemeChoice {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
    return 'system';
  } catch {
    // Chế độ riêng tư / storage bị chặn — coi như chưa từng chọn.
    return 'system';
  }
}

function applyResolvedClass(resolved: ResolvedTheme): void {
  const el = document.documentElement;
  if (resolved === 'dark') el.classList.add('dark');
  else el.classList.remove('dark');
}

interface ThemeContextValue {
  readonly choice: ThemeChoice;
  readonly resolved: ResolvedTheme;
  setChoice(choice: ThemeChoice): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  readonly children: ReactNode;
  /** Mặc định `THEME_STORAGE_KEY` ('dlp.theme'). */
  readonly storageKey?: string;
}

/**
 * Quản lý lựa chọn theme (`light`/`dark`/`system`) + đồng bộ class `dark` trên
 * `<html>`. `THEME_INIT_SCRIPT` đã đặt class đúng trước paint; provider này
 * chỉ tiếp quản sau khi React hydrate — để `useTheme()` có state phản ứng
 * được (đổi lựa chọn từ UI, theo dõi `prefers-color-scheme` khi ở chế độ
 * 'system').
 */
export function ThemeProvider(props: ThemeProviderProps): ReactElement {
  const { children, storageKey = THEME_STORAGE_KEY } = props;

  const [choice, setChoiceState] = useState<ThemeChoice>(() => readStoredChoice(storageKey));
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    choice === 'system' ? resolveSystemTheme() : choice,
  );

  const setChoice = useCallback(
    (next: ThemeChoice) => {
      setChoiceState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // Storage bị chặn/đầy — theme vẫn áp dụng trong phiên hiện tại, chỉ
        // không nhớ được cho lần sau. Không phải lỗi cần chặn người dùng.
      }
    },
    [storageKey],
  );

  // Đồng bộ lại class mỗi khi `choice` đổi (kể cả lần mount đầu — idempotent
  // với việc THEME_INIT_SCRIPT đã làm).
  useEffect(() => {
    const next = choice === 'system' ? resolveSystemTheme() : choice;
    setResolved(next);
    applyResolvedClass(next);
  }, [choice]);

  // Khi đang ở 'system', theo dõi đổi theme hệ điều hành trong lúc trang mở
  // (người dùng đổi theme OS mà không reload trang).
  useEffect(() => {
    if (choice !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (): void => {
      const next: ResolvedTheme = mql.matches ? 'dark' : 'light';
      setResolved(next);
      applyResolvedClass(next);
    };
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [choice]);

  const value = useMemo<ThemeContextValue>(
    () => ({ choice, resolved, setChoice }),
    [choice, resolved, setChoice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useTheme() phải được gọi bên trong <ThemeProvider>.');
  }
  return ctx;
}
