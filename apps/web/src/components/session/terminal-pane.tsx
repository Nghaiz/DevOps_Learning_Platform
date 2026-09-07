'use client';

import dynamic from 'next/dynamic';
import type { ReactElement, ReactNode } from 'react';
import { LoaderCircle, Terminal } from 'lucide-react';
import type { ThemeName } from '@devops-platform/terminal/themes';
import { Kbd } from '@devops-platform/ui';
// Import THẲNG từng file, không qua barrel '../shell': barrel đó kéo theo
// 'use-capacity' (tRPC) và 'viewer-context', thứ khoang terminal không cần —
// cùng lý do 'app/layout.tsx' đã ghi trong chú thích của barrel.
import { TERMINAL_MIN_WIDTH_PX } from '../shell/breakpoints';
import { NarrowScreenNotice } from '../shell/narrow-screen-notice';
import { useMinWidth } from '../shell/use-min-width';
import type { SandboxSession } from '../../lib/use-sandbox-session';
import { PaneHeader } from './pane-header';
import { SessionStatusPill } from './session-status';
import { useResolvedTerminalTheme } from './use-resolved-terminal-theme';

/**
 * Khung chờ trong lúc bundle xterm được nạp động.
 *
 * Bản trước là `animate-pulse bg-card` trần — một ô xám nhấp nháy không nói gì.
 * Nạp xterm lần đầu là một chunk thật, và trên mạng chậm nó đủ lâu để đọc ra
 * là "trang hỏng". Ba dòng giả lập dấu nhắc shell cho thấy CÁI GÌ sắp hiện ra,
 * còn dòng chữ nói ta đang chờ ai.
 *
 * `aria-hidden` trên phần trang trí + `role="status"` trên đúng câu chữ: trình
 * đọc màn hình cần một thông báo, không cần ba thanh xám.
 */
function TerminalBootFrame(): ReactElement {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-4 bg-card px-6">
      <div aria-hidden="true" className="flex flex-col gap-2 font-mono text-xs text-muted-foreground">
        <span className="h-3 w-2/5 animate-pulse rounded bg-muted" />
        <span className="h-3 w-3/5 animate-pulse rounded bg-muted" />
        <span className="h-3 w-1/4 animate-pulse rounded bg-muted" />
      </div>
      {/*
        `LoaderCircle` trần chứ không `<Spinner>` của C2: Spinner tự mang
        `role="status"` + `aria-label`, nên đặt nó trong `<p role="status">` là
        vùng sống LỒNG vùng sống — đúng lỗi mà `session-controls.tsx` đã ghi
        chú và tránh. Ở đây cần đúng MỘT thông báo, và nó là câu chữ.
      */}
      <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Đang mở terminal…
      </p>
    </div>
  );
}

/**
 * ⛔ `ssr: false` PHẢI nằm trong một Client Component — Next 16 ném khi thấy nó
 * trong Server Component. Ba lớp giữ nguyên: `page.tsx` (server) → client của
 * trang → file này → `terminal-surface-lazy` (nạp động).
 */
const TerminalSurfaceLazy = dynamic(() => import('./terminal-surface-lazy'), {
  ssr: false,
  loading: () => <TerminalBootFrame />,
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

export function TerminalPane({ session, theme, placeholder }: TerminalPaneProps): ReactElement {
  // Hook luôn được gọi (không rẽ nhánh): `theme` truyền vào chỉ ghi đè kết quả.
  const followedTheme = useResolvedTerminalTheme(undefined);
  const resolvedTheme = theme ?? followedTheme;

  /**
   * 13.B mục 8 — dưới `TERMINAL_MIN_WIDTH_PX` thì KHÔNG mở terminal.
   *
   * Đây là chỗ DUY NHẤT quyết định điều đó, nên ba trang có terminal (lesson,
   * lab, playground) không thể lệch nhau. `NarrowScreenNotice` đã tồn tại từ
   * đợt 2 nhưng **không có một call-site nào** cho tới bản này (đo 2026-09-07:
   * `grep -rn NarrowScreenNotice` chỉ ra `index.ts` và chính nó) — tức nửa
   * "terminal hiện cảnh báo thay vì vỡ" của ô AC 13 là mã chết. Đúng lớp lỗi
   * `check-call-site-before-declaring-done`: component có thật, test của nó
   * xanh, và không ai từng thấy nó.
   *
   * `null` = chưa đo được (SSR + frame đầu). Ở đây `null` KHÔNG rơi vào nhánh
   * hẹp: nhánh hẹp là khẳng định "máy bạn quá nhỏ", và khẳng định đó khi chưa
   * đo là nói dối một nửa số lượt mở. Nó rơi xuống nhánh dưới, nơi
   * `TerminalSurfaceLazy` vẫn đang nạp chunk — tức khung chờ vốn đã hiện.
   */
  const wideEnough = useMinWidth(TERMINAL_MIN_WIDTH_PX);

  const header = (
    <PaneHeader icon={<Terminal />} title="Terminal">
      <SessionStatusPill phase={session.state.phase} />
    </PaneHeader>
  );

  if (wideEnough === false) {
    // Xét TRƯỚC nhánh "chưa có phiên": trên máy hẹp, câu đúng không phải "bấm
    // Bắt đầu để mở terminal" — bấm xong vẫn không có terminal. Nói thẳng lý do
    // còn hơn mời người ta làm một việc vô ích rồi im lặng.
    return (
      <div className="flex h-full w-full flex-col bg-card">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NarrowScreenNotice />
        </div>
      </div>
    );
  }

  if (session.state.sessionId === null) {
    return (
      <div className="flex h-full w-full flex-col bg-card">
        {header}
        {/*
          Trạng thái RỖNG, không phải trạng thái lỗi: chưa có phiên là điểm khởi
          đầu bình thường của mọi bài. Icon trong đĩa `bg-muted` cho khoang một
          trọng tâm thị giác thay vì một dòng chữ trôi giữa khoảng trắng — thứ
          đọc ra là "đang tải mãi không xong".
        */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <Terminal className="size-6" />
          </span>
          <div className="max-w-sm text-sm text-muted-foreground">
            {placeholder ?? <span>Bấm Bắt đầu để dựng sandbox và mở terminal.</span>}
          </div>
        </div>
      </div>
    );
  }

  return (
    // `group` + `group-focus-within:` — gợi ý Esc-Esc ĐẬM LÊN khi terminal có
    // focus, KHÔNG xuất hiện/biến mất. Một dòng chữ nhảy ra lúc focus sẽ đổi
    // chiều cao khoang, `ResizeObserver` của xterm bắn, và terminal fit lại
    // ngay giây người dùng vừa bấm vào nó.
    //
    // Thanh nhãn ở trên thì AN TOÀN với cùng lo ngại đó: nó cao cố định và có
    // mặt ở CẢ hai nhánh, nên nó không bao giờ xuất hiện/biến mất trong lúc
    // terminal đang sống.
    <div className="group flex h-full w-full flex-col bg-card">
      {header}
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
      <p
        className={
          'flex shrink-0 items-center gap-1.5 border-t border-border bg-card px-3 py-1 text-[11px] ' +
          'text-muted-foreground transition-colors duration-[var(--motion-fast)] ease-out ' +
          'group-focus-within:border-status-progress group-focus-within:text-foreground'
        }
      >
        Nhấn <Kbd>Esc</Kbd> <Kbd>Esc</Kbd> để rời khỏi terminal
      </p>
    </div>
  );
}
