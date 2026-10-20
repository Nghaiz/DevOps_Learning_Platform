'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { t } from '@devops-platform/copy';
import type { ThemeName } from '@devops-platform/terminal/themes';
import { BootLog, Button, Icon, Kbd, cn, type BootLine } from '@devops-platform/ds';
import { canReconnect, type SandboxSession } from '../../lib/use-sandbox-session';
import type { TerminalHandoff } from './terminal-handoff';
import { overlayActionLabel, resolveTerminalOverlay, type OverlayAction, type TerminalOverlay } from './terminal-overlay';
import { useResolvedTerminalTheme } from './use-resolved-terminal-theme';
import { useFitOnLayoutChange, useWorkspaceLayout } from './workspace-layout';

/** Khung chờ trong lúc chunk xterm đang nạp: ba dòng giả dấu nhắc, không vòng xoay. */
function TerminalBootFrame(): ReactElement {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-4 bg-canvas px-6">
      <div aria-hidden="true" className="flex flex-col gap-2">
        <span className="h-3 w-2/5 animate-breathe rounded-xs bg-well-2" />
        <span className="h-3 w-3/5 animate-breathe rounded-xs bg-well-2 [animation-delay:120ms]" />
        <span className="h-3 w-1/4 animate-breathe rounded-xs bg-well-2 [animation-delay:240ms]" />
      </div>
      <p role="status" className="font-mono text-xs text-ink-3">
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
  /** Bỏ trống ⇒ theme tối mặc định (xem `resolveTerminalTheme`). */
  readonly theme?: ThemeName;
  /** Hiện khi máy chưa chạy (thường là `PracticeLaunch` có nút Bắt đầu). */
  readonly placeholder?: ReactNode;
  /** Bàn giao với cửa sổ terminal riêng. Vắng ⇒ terminal luôn ở trang này. */
  readonly handoff?: TerminalHandoff;
  /**
   * Thay nút "Mở máy mới" của lớp phủ. Vắng ⇒ nhãn chung + `session.start()`.
   *
   * Lab cần nó: máy mới ở đó là một LẦN THỬ mới (`labs.startAttempt` với key mới),
   * điểm về 0% và lần thử đang dở không nộp được từ trang nữa.
   */
  readonly newSession?: { readonly label: string; readonly onSelect: () => void };
}

/**
 * Các dòng của nhật ký dựng máy theo pha. `creating` = đang xin chỗ và dựng pod (một
 * lời gọi duy nhất ở máy chủ, nên hai dòng đầu cùng chạy); `connecting` = pod đã có,
 * đang mở WebSocket.
 */
function bootLines(phase: 'creating' | 'connecting'): readonly BootLine[] {
  const creating = phase === 'creating';
  return [
    { key: 'claim', text: t('session.boot.step.claim'), state: creating ? 'active' : 'done' },
    { key: 'pod', text: t('session.boot.step.pod'), state: creating ? 'pending' : 'done' },
    { key: 'connect', text: t('session.boot.step.connect'), state: creating ? 'pending' : 'active' },
  ];
}

function OverlayPanel({
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
  const glyph = overlay.tone === 'elsewhere' ? 'external-link' : overlay.tone === 'wait' ? 'unplug' : overlay.action === 'new-session' ? 'hourglass' : 'unplug';
  return (
    <div data-overlay={overlay.tone} className="absolute inset-0 z-10 flex items-center justify-center bg-canvas/92 p-6 backdrop-blur-[2px] animate-fade">
      <div className="flex max-w-md flex-col items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-11 place-items-center rounded-md',
            overlay.tone === 'down' ? 'bg-bad-tint text-bad-ink' : overlay.tone === 'wait' ? 'bg-warn-tint text-warn-ink' : 'bg-info-tint text-info-ink',
          )}
        >
          <Icon name={glyph} size={22} />
        </span>
        <p className="font-display text-lg font-semibold text-ink">{overlay.title}</p>
        {overlay.detail === null ? null : <p className="text-sm text-ink-2">{overlay.detail}</p>}
        {overlay.action === null ? null : (
          <Button
            size="sm"
            variant={overlay.action === 'new-session' ? 'primary' : 'secondary'}
            icon={overlay.action === 'reclaim' ? 'enter' : overlay.action === 'reconnect' ? 'refresh' : 'play'}
            loading={busy}
            onClick={() => {
              if (overlay.action !== null) onAction(overlay.action);
            }}
          >
            {overlay.action === 'new-session' && newSessionLabel !== undefined ? newSessionLabel : overlayActionLabel(overlay.action)}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Khoang terminal của ba trình học. Luôn tối: `WorkspacePanel` đặt phạm vi `.dark`.
 *
 * ## Bất biến
 *
 * - Node terminal mount một lần cho mỗi phiên và KHÔNG bị gỡ khi đổi bề rộng cửa sổ.
 * - Pha khác `ready` ⇒ lớp phủ có lý do + đúng một việc làm được, và phím gõ bị khoá
 *   (`setInputEnabled(false)`). Đang dựng máy ⇒ nhật ký dựng máy, không vòng xoay.
 * - Terminal ở cửa sổ riêng ⇒ trang thả kết nối (`connectionKey = null`), vì gateway
 *   chỉ cho một WebSocket mỗi phiên.
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

  if (session.state.sessionId === null) {
    // Vừa bấm Bắt đầu: phiên chưa có id nhưng máy đang được dựng. Bản trước hiện lại
    // màn "chưa có máy" đúng lúc này, và người học bấm Bắt đầu lần nữa.
    if (phase === 'creating') {
      return (
        <div className="flex h-full w-full items-center justify-center bg-canvas p-6">
          <BootLog title={t('session.boot.title')} lines={bootLines('creating')} className="w-full max-w-sm" />
        </div>
      );
    }
    return <div className="relative h-full w-full overflow-y-auto bg-canvas">{placeholder ?? null}</div>;
  }

  const overlay = resolveTerminalOverlay({
    phase,
    message: session.state.message,
    handoff: handoffState,
    // CÙNG điều kiện `reconnect()` dùng: lỗi tạo phiên không có pod thì "Nối lại" là nút chết.
    canReconnect: canReconnect(session.state),
    closeCode,
  });

  const onAction = (action: OverlayAction): void => {
    switch (action) {
      case 'reclaim':
        handoff?.reclaim();
        return;
      case 'reconnect':
        session.reconnect();
        return;
      case 'new-session':
        if (newSession === undefined) session.start();
        else newSession.onSelect();
        return;
    }
  };

  const booting = handoffState === 'here' && phase === 'connecting';

  return (
    // `group-focus-within:` làm gợi ý Esc rồi Tab đậm lên khi terminal có focus, không xuất hiện/biến mất:
    // một dòng nhảy ra lúc focus đổi chiều cao khoang và làm xterm fit lại đúng giây người dùng bấm vào.
    <div className="group flex h-full w-full flex-col bg-canvas">
      <div className="relative min-h-0 flex-1">
        <TerminalSurfaceLazy
          wsUrl={session.wsUrl}
          connectionKey={handoffState === 'here' ? session.connectionKey : null}
          theme={resolvedTheme}
          ariaLabel={TERMINAL_ARIA_LABEL}
          onControl={session.onControl}
          onClose={onClose}
          onReady={session.onTerminalReady}
          /* Surface chỉ mount khi đã có phiên, tức ngay sau cú bấm Bắt đầu: đưa focus vào
             terminal lúc đó là đúng ý người học, không phải giật focus lúc tải trang. */
          autoFocus
        />
        {booting ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-canvas p-6">
            <BootLog title={t('session.boot.title')} lines={bootLines('connecting')} className="w-full max-w-sm" />
          </div>
        ) : overlay !== null ? (
          <OverlayPanel overlay={overlay} busy={session.starting} newSessionLabel={newSession?.label} onAction={onAction} />
        ) : null}
      </div>
      <p
        className={cn(
          'flex h-7 shrink-0 items-center gap-1.5 border-t border-rule px-3 text-[11px] text-ink-3',
          'transition-colors duration-150 ease-out group-focus-within:text-ink-2',
        )}
      >
        {t('session.terminal.escape-hint-prefix')} <Kbd>Esc</Kbd> {t('session.terminal.escape-hint-then')} <Kbd>Tab</Kbd>{' '}
        {t('session.terminal.escape-hint-suffix')}
      </p>
    </div>
  );
}
