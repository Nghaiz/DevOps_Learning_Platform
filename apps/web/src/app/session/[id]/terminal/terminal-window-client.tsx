'use client';

import { errText, t } from '@devops-platform/copy';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { buildSessionWsUrl, type ServerControl } from '@devops-platform/terminal';
import { Button, Icon, LogoMark, Pill } from '@devops-platform/ds';
import { useWindowHandoff } from '../../../../components/session/terminal-handoff';
import { useResolvedTerminalTheme } from '../../../../components/session/use-resolved-terminal-theme';
import { api } from '../../../../lib/trpc-react';

/**
 * Cửa sổ terminal riêng cho `/session/<id>/terminal`.
 *
 * ## Bàn giao (H3)
 *
 * Gateway cho đúng MỘT WebSocket mỗi phiên. Cửa sổ này báo `claim` qua kênh bàn
 * giao trước khi nối, nên trang học tự ngắt và hiện "Đang mở ở cửa sổ riêng".
 * Trang đòi lại ⇒ cửa sổ này thả kết nối và nói terminal đã về tab bài học.
 *
 * ## Tự thử lại
 *
 * Lượt nối đầu có thể tới trước khi trang kịp thả khe (gateway trả 429 lúc bắt
 * tay, trình duyệt chỉ thấy `1006`). Nên `1006` được thử lại theo backoff vài
 * lần trước khi hiện màn "kết nối đã đóng". Shell thoát hay server báo lỗi thì
 * không thử lại: đó là phán quyết, không phải tranh khe.
 *
 * Route này immersive (`immersive-routes.ts`), nên không cần lớp phủ `fixed`.
 */
const TerminalSurfaceLazy = dynamic(() => import('../../../../components/session/terminal-surface-lazy'), {
  ssr: false,
  loading: () => (
    <p role="status" className="p-6 font-mono text-xs text-ink-3">
      {t('session.terminal.booting')}
    </p>
  ),
});

const ARIA_LABEL = t('session.terminal.aria-label-window');
/** Lịch thử lại khi gặp `1006` (tranh khe với trang học đang thả). */
const RETRY_SCHEDULE_MS = [1_000, 2_000, 4_000, 8_000] as const;
const CLOSE_ABNORMAL = 1006;

type WindowPhase =
  | { readonly kind: 'connecting' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'retrying'; readonly seconds: number }
  | { readonly kind: 'stopped'; readonly detail: string };

export function TerminalWindowClient({ sessionId }: { readonly sessionId: string }): ReactElement {
  const me = api.me.get.useQuery({});
  const theme = useResolvedTerminalTheme(me.data?.preferences.terminalTheme ?? null);
  const handoff = useWindowHandoff(sessionId);
  const [phase, setPhase] = useState<WindowPhase>({ kind: 'connecting' });
  const [wsUrl, setWsUrl] = useState('');
  const [connectionKey, setConnectionKey] = useState<number | null>(null);
  const retries = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    handoff.claim();
    setPhase({ kind: 'connecting' });
    setConnectionKey((key) => (key ?? 0) + 1);
  }, [handoff]);

  // `wsUrl` tính trong effect: `location` không có ở lượt render phía server.
  useEffect(() => {
    setWsUrl(buildSessionWsUrl(globalThis.location.origin, sessionId));
    connect();
    return () => {
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    };
    // Chỉ chạy khi đổi phiên: `connect` đổi danh tính theo `handoff` mỗi lượt render.
  }, [sessionId]);

  // Trang đã đòi lại terminal: thả kết nối của cửa sổ này.
  useEffect(() => {
    if (handoff.state === 'returned') {
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
      setConnectionKey(null);
    }
  }, [handoff.state]);

  const onControl = useCallback((message: ServerControl) => {
    switch (message.type) {
      case 'ready':
        retries.current = 0;
        setPhase({ kind: 'ready' });
        return;
      case 'error':
        // Contract §5: không parse chuỗi này, chỉ hiện lại.
        setPhase({ kind: 'stopped', detail: message.message });
        return;
      case 'exit':
        setPhase({ kind: 'stopped', detail: t('session.window.exited', { code: message.exitCode }) });
        return;
      default:
        // 'expiring': cửa sổ này không quản vòng đời phiên, tab bài học mới có nút gia hạn.
        return;
    }
  }, []);

  const onClose = useCallback(
    (code: number) => {
      setConnectionKey(null);
      const delay = RETRY_SCHEDULE_MS[retries.current];
      if (code === CLOSE_ABNORMAL && delay !== undefined) {
        retries.current += 1;
        setPhase({ kind: 'retrying', seconds: Math.round(delay / 1000) });
        retryTimer.current = setTimeout(() => {
          setPhase({ kind: 'connecting' });
          setConnectionKey((key) => (key ?? 0) + 1);
        }, delay);
        return;
      }
      handoff.release();
      setPhase({ kind: 'stopped', detail: errText('session.window.closed', { code }) });
    },
    [handoff],
  );

  const reconnect = useCallback(() => {
    retries.current = 0;
    connect();
  }, [connect]);

  const returned = handoff.state === 'returned';
  const stopped = phase.kind === 'stopped' || returned;

  return (
    <div className="dark flex h-dvh flex-col bg-canvas text-ink [color-scheme:dark]">
      <div className="flex h-10 shrink-0 items-center gap-2.5 border-b border-rule bg-paper px-3">
        <LogoMark size={20} />
        <h1 className="truncate font-mono text-xs text-ink-2">{t('session.window.title', { sessionId })}</h1>
        {!stopped && phase.kind !== 'ready' ? (
          <span role="status" className="ml-auto">
            <Pill tone={phase.kind === 'retrying' ? 'warn' : 'info'} dot live>
              {phase.kind === 'retrying' ? t('session.window.retrying', { seconds: phase.seconds }) : t('session.window.connecting')}
            </Pill>
          </span>
        ) : null}
      </div>

      {stopped ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <Icon name={returned ? 'enter' : 'unplug'} size={30} className="text-ink-3" />
          <p role="status" className="max-w-md text-sm text-ink-2">
            {returned ? t('session.window.returned') : phase.kind === 'stopped' ? phase.detail : null}
          </p>
          <Button size="sm" variant="secondary" icon={returned ? 'enter' : 'refresh'} onClick={reconnect}>
            {returned ? t('session.window.take-back') : t('session.window.reconnect')}
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <TerminalSurfaceLazy
            wsUrl={wsUrl}
            connectionKey={wsUrl === '' ? null : connectionKey}
            theme={theme}
            ariaLabel={ARIA_LABEL}
            onControl={onControl}
            onClose={onClose}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}
