'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import type { ThemeName } from '@devops-platform/terminal/themes';
import { Kbd } from '@devops-platform/ui';
import type { SandboxSession } from '../../lib/use-sandbox-session';
import { useResolvedTerminalTheme } from './use-resolved-terminal-theme';

/**
 * ⛔ `ssr: false` PHẢI nằm trong một Client Component — Next 16 ném khi thấy nó
 * trong Server Component. Ba lớp giữ nguyên: `page.tsx` (server) → client của
 * trang → file này → `terminal-surface-lazy` (nạp động).
 */
const TerminalSurfaceLazy = dynamic(() => import('./terminal-surface-lazy'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-card" />,
});

/**
 * Nhãn a11y của terminal. Nêu luôn đường thoát: `role="application"` tắt chế độ
 * duyệt của trình đọc màn hình, nên câu đầu tiên người dùng nghe phải nói được
 * cách ra.
 */
const TERMINAL_ARIA_LABEL = 'Terminal sandbox. Nhấn Esc hai lần để rời khỏi terminal.';

export interface TerminalPaneProps {
  readonly session: SandboxSession;
  /** Bỏ trống ⇒ đi theo `useTheme()` của C1 (xem `useResolvedTerminalTheme`). */
  readonly theme?: ThemeName;
  /** Hiện khi chưa có phiên. */
  readonly placeholder?: ReactNode;
}

export function TerminalPane({
  session,
  theme,
  placeholder,
}: TerminalPaneProps): React.ReactElement {
  // Hook luôn được gọi (không rẽ nhánh): `theme` truyền vào chỉ ghi đè kết quả.
  const followedTheme = useResolvedTerminalTheme(undefined);
  const resolvedTheme = theme ?? followedTheme;

  if (session.state.sessionId === null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-card px-6 text-center text-sm text-muted-foreground">
        {placeholder ?? <span>Bấm Bắt đầu để dựng sandbox và mở terminal.</span>}
      </div>
    );
  }

  return (
    // `group` + `group-focus-within:` — gợi ý Esc-Esc đậm lên khi terminal có
    // focus, KHÔNG xuất hiện/biến mất. Một dòng chữ nhảy ra lúc focus sẽ đổi
    // chiều cao khoang, `ResizeObserver` của xterm bắn, và terminal fit lại
    // ngay giây người dùng vừa bấm vào nó.
    <div className="group flex h-full w-full flex-col">
      <div className="min-h-0 flex-1">
        <TerminalSurfaceLazy
          wsUrl={session.wsUrl}
          connectionKey={session.connectionKey}
          theme={resolvedTheme}
          ariaLabel={TERMINAL_ARIA_LABEL}
          onControl={session.onControl}
          onClose={session.onClose}
          onReady={session.onTerminalReady}
        />
      </div>
      <p className="shrink-0 border-t border-border bg-card px-3 py-1 text-[11px] text-muted-foreground group-focus-within:text-foreground">
        Nhấn <Kbd>Esc</Kbd> <Kbd>Esc</Kbd> để rời khỏi terminal
      </p>
    </div>
  );
}
