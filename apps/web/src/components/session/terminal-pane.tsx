'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { ExternalLink, Hourglass, LoaderCircle, Terminal, Unplug } from 'lucide-react';
import { t } from '@devops-platform/copy';
import type { ThemeName } from '@devops-platform/terminal/themes';
import { Button, Kbd, cn } from '@devops-platform/ui';
import { canReconnect, type SandboxSession } from '../../lib/use-sandbox-session';
import type { TerminalHandoff } from './terminal-handoff';
import {
  overlayActionLabel,
  resolveTerminalOverlay,
  type OverlayAction,
  type TerminalOverlay,
} from './terminal-overlay';
import { useResolvedTerminalTheme } from './use-resolved-terminal-theme';
import { useFitOnLayoutChange, useWorkspaceLayout } from './workspace-layout';

/** Khung chờ trong lúc chunk xterm đang nạp: ba dòng giả dấu nhắc + câu nói đang chờ gì. */
function TerminalBootFrame(): ReactElement {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-4 bg-background px-6">
      <div aria-hidden="true" className="flex flex-col gap-2">
        <span className="h-3 w-2/5 animate-pulse bg-muted" />
        <span className="h-3 w-3/5 animate-pulse bg-muted" />
        <span className="h-3 w-1/4 animate-pulse bg-muted" />
      </div>
      {/* `LoaderCircle` trần chứ không `Spinner`: Spinner tự mang role=status, lồng vào đây là vùng sống lồng vùng sống. */}
      <p role="status" className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        {t('session.terminal.booting')}
      </p>
    </div>
  );
}

/** ⛔ `ssr: false` phải nằm trong một Client Component (Next 16 ném nếu ở Server Component). */
const TerminalSurfaceLazy = dynamic(() => import('./terminal-surface-lazy'), {
  ssr: false,
  loading: () => <TerminalBootFrame />,
});

/** Nhãn a11y nêu luôn đường thoát: `role="application"` tắt chế độ duyệt của trình đọc màn hình. */
const TERMINAL_ARIA_LABEL = t('session.terminal.aria-label');

export interface TerminalPaneProps {
  readonly session: SandboxSession;
  /** Bỏ trống ⇒ theme đêm mặc định (xem `resolveTerminalTheme`). */
  readonly theme?: ThemeName;
  /** Hiện khi chưa có phiên. */
  readonly placeholder?: ReactNode;
  /** Bàn giao với cửa sổ terminal riêng. Vắng ⇒ terminal luôn ở trang này. */
  readonly handoff?: TerminalHandoff;
  /**
   * Thay nút "Mở phiên mới" của lớp phủ. Vắng ⇒ nhãn chung + `session.start()`.
   *
   * Lab cần nó: phiên mới ở đó là một LẦN THỬ mới (`labs.startAttempt` với key
   * mới), điểm về 0% và lần thử đang dở không nộp được từ trang nữa. Nhãn chung
   * "Mở phiên mới" giấu đúng hệ quả đó.
   */
  readonly newSession?: { readonly label: string; readonly onSelect: () => void };
}

const TONE_ICON = {
  wait: LoaderCircle,
  down: Unplug,
  elsewhere: ExternalLink,
} as const;

function OverlayCard({
  overlay,
  busy,
  newSessionLabel,
  onAction,
}: {
  readonly overlay: TerminalOverlay;
  readonly busy: boolean;
  readonly newSessionLabel: string | undefined;
  readonly onAction: (action: OverlayAction) => void;
}): ReactElement {
  const Icon = overlay.tone === 'down' && overlay.action === 'new-session' ? Hourglass : TONE_ICON[overlay.tone];
  return (
    <div
      data-overlay={overlay.tone}
      className="absolute inset-0 z-10 flex items-center justify-center bg-background/90 p-6 animate-rise"
    >
      <div className="flex max-w-md flex-col items-start gap-3 border border-border bg-card p-5">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-10 place-items-center',
            overlay.tone === 'down' ? 'bg-destructive/15 text-destructive' : 'bg-muted text-foreground',
          )}
        >
          <Icon className={cn('size-5', overlay.tone === 'wait' && 'animate-spin')} />
        </span>
        <p className="type-title text-foreground">{overlay.title}</p>
        {overlay.detail !== null && <p className="text-sm text-muted-foreground">{overlay.detail}</p>}
        {overlay.action !== null && (
          <Button
            size="sm"
            variant={overlay.action === 'new-session' ? 'primary' : 'ink'}
            loading={busy}
            onClick={() => {
              if (overlay.action !== null) onAction(overlay.action);
            }}
          >
            {overlay.action === 'new-session' && newSessionLabel !== undefined
              ? newSessionLabel
              : overlayActionLabel(overlay.action)}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Khoang terminal của ba trình học. Luôn tối (theme đêm) dù ứng dụng sáng hay tối:
 * `WorkspacePanel` đặt phạm vi `.dark` quanh nó.
 *
 * ## Bất biến
 *
 * - Node terminal mount một lần cho mỗi phiên và KHÔNG bị gỡ khi đổi bề rộng
 *   cửa sổ. Bản trước gỡ nó dưới 1024px (thay bằng một câu "cần màn hình rộng
 *   hơn"), nên kéo cửa sổ qua ngưỡng là đóng WebSocket. Nay màn hẹp xếp chồng
 *   khoang bằng CSS (`WorkspaceSplit`), terminal vẫn ở đó.
 * - Pha khác `ready` ⇒ lớp phủ có lý do + một việc làm được, và phím gõ bị khoá
 *   (`setInputEnabled(false)`).
 * - Terminal ở cửa sổ riêng ⇒ trang thả kết nối (`connectionKey = null`), vì
 *   gateway chỉ cho một WebSocket mỗi phiên.
 */
export function TerminalPane({ session, theme, placeholder, handoff, newSession }: TerminalPaneProps): ReactElement {
  const followedTheme = useResolvedTerminalTheme(undefined);
  const resolvedTheme = theme ?? followedTheme;

  // Fit lại khi hình học khoang đổi (đổi tab, đổi bố cục). Gọi vô điều kiện, trước mọi `return`.
  const layout = useWorkspaceLayout();
  useFitOnLayoutChange(session.terminal, layout);

  const handoffState = handoff?.state ?? 'here';
  const phase = session.state.phase;
  const inputEnabled = phase === 'ready' && handoffState === 'here';
  const terminal = session.terminal;
  // Khoá gõ/dán ngoài pha `ready` (sendInput của nút chạy lệnh vẫn đi). Sống qua các lần nối lại.
  useEffect(() => {
    terminal?.setInputEnabled(inputEnabled);
  }, [terminal, inputEnabled]);

  // Mã đóng gần nhất: máy trạng thái chỉ giữ câu chung, lớp phủ cần biết ca 4429 để nói đúng nguyên nhân.
  const [closeCode, setCloseCode] = useState<number | null>(null);
  const sessionOnClose = session.onClose;
  const onClose = useCallback(
    (code: number) => {
      setCloseCode(code);
      sessionOnClose(code);
    },
    [sessionOnClose],
  );
  useEffect(() => {
    if (phase === 'ready') setCloseCode(null);
  }, [phase]);

  const overlay = resolveTerminalOverlay({
    phase,
    message: session.state.message,
    handoff: handoffState,
    // CÙNG điều kiện `reconnect()` dùng: lỗi tạo phiên không có pod thì "Nối lại" là nút chết.
    canReconnect: canReconnect(session.state),
    closeCode,
  });

  if (session.state.sessionId === null) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <span aria-hidden="true" className="grid size-14 place-items-center border-2 border-border text-muted-foreground">
          <Terminal className="size-7" />
        </span>
        <div className="max-w-sm text-sm text-muted-foreground">
          {placeholder ?? <span>{t('session.terminal.empty')}</span>}
        </div>
      </div>
    );
  }

  const onAction = (action: OverlayAction): void => {
    switch (action) {
      case 'reclaim':
        handoff?.reclaim();
        return;
      case 'reconnect':
        session.reconnect();
        return;
      case 'new-session':
        if (newSession === undefined) {
          session.start();
        } else {
          newSession.onSelect();
        }
        return;
    }
  };

  return (
    // `group-focus-within:` làm gợi ý Esc rồi Tab đậm lên khi terminal có focus, không xuất hiện/biến mất:
    // một dòng nhảy ra lúc focus đổi chiều cao khoang và làm xterm fit lại đúng giây người dùng bấm vào.
    <div className="group flex h-full w-full flex-col bg-background">
      <div className="relative min-h-0 flex-1">
        <TerminalSurfaceLazy
          wsUrl={session.wsUrl}
          connectionKey={handoffState === 'here' ? session.connectionKey : null}
          theme={resolvedTheme}
          ariaLabel={TERMINAL_ARIA_LABEL}
          onControl={session.onControl}
          onClose={onClose}
          onReady={session.onTerminalReady}
          /* Surface chỉ mount khi đã có phiên, tức ngay sau cú bấm Bắt đầu (hoặc Mở phiên mới):
             đưa focus vào terminal lúc đó là đúng ý người học, không phải giật focus lúc tải trang. */
          autoFocus
        />
        {overlay !== null && (
          <OverlayCard
            overlay={overlay}
            busy={session.starting}
            newSessionLabel={newSession?.label}
            onAction={onAction}
          />
        )}
      </div>
      <p
        className={cn(
          'flex shrink-0 items-center gap-1.5 border-t border-border px-3 py-1 font-mono text-[11px] text-muted-foreground',
          'transition-colors duration-[var(--motion-fast)] ease-out group-focus-within:text-foreground',
        )}
      >
        {t('session.terminal.escape-hint-prefix')} <Kbd>Esc</Kbd> {t('session.terminal.escape-hint-then')} <Kbd>Tab</Kbd>{' '}
        {t('session.terminal.escape-hint-suffix')}
      </p>
    </div>
  );
}
