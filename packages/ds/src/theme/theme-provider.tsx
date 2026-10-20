'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { THEME_STORAGE_KEY, isThemeChoice, type ResolvedTheme, type ThemeChoice } from './theme-script.ts';

interface ThemeContextValue {
  readonly choice: ThemeChoice;
  readonly resolved: ResolvedTheme;
  setChoice(choice: ThemeChoice): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const DARK_QUERY = '(prefers-color-scheme: dark)';
const CHANGE_EVENT = 'dlp:theme-change';

/** Lựa chọn khi storage không ghi được: phiên này vẫn đổi theme, chỉ là không nhớ qua lần tải sau. */
let memoryChoice: ThemeChoice | null = null;

function readChoice(): ThemeChoice {
  if (memoryChoice !== null) return memoryChoice;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

function systemTheme(): ResolvedTheme {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function subscribe(onChange: () => void): () => void {
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  media?.addEventListener('change', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
    media?.removeEventListener('change', onChange);
  };
}

/**
 * Lựa chọn và theme thực tế đọc qua `useSyncExternalStore`: server trả `system`
 * và `light`, client đọc localStorage ngay lượt hydrate mà không lệch markup.
 * Class `dark` trên `<html>` do THEME_INIT_SCRIPT đặt trước khi vẽ; provider này
 * chỉ đồng bộ lại khi người dùng đổi lựa chọn hoặc hệ điều hành đổi theme.
 */
export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const choice = useSyncExternalStore(subscribe, readChoice, () => 'system' as const);
  const system = useSyncExternalStore(subscribe, systemTheme, () => 'light' as const);
  const resolved: ResolvedTheme = choice === 'system' ? system : choice;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const setChoice = useCallback((next: ThemeChoice) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      memoryChoice = null;
    } catch {
      // Storage bị chặn: `readChoice` đọc lại storage sẽ ra `system` và nút như không làm gì.
      // Giữ lựa chọn trong bộ nhớ để theme vẫn đổi trong phiên này.
      memoryChoice = next;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error('useTheme() phải nằm trong <ThemeProvider>.');
  return ctx;
}
