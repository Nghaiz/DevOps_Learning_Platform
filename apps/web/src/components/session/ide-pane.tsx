'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { ExternalLink, Hourglass, RotateCw } from 'lucide-react';
import { t, err } from '@devops-platform/copy';
import { ARC_VIEWBOX, arcSpinnerProps, arcTrackProps } from '@devops-platform/motion/motif';
import type { SessionPhase } from '@devops-platform/terminal';
import { Button, cn } from '@devops-platform/ui';
import { IDE_BOOT_TIMEOUT_MS, ideSessionUrl } from './ide-layout';

/**
 * Khoang IDE (Theia của P6) trong iframe CÙNG ORIGIN.
 *
 * ## ⛔ Chỉ 2xx mới gắn iframe (đo trên cụm 2026-09-07)
 *
 * Theia bind cổng ~20s sau khi phiên trả về, và thân 503 của gateway VẪN bắn
 * `load`. Nên ở đây `fetch` chính URL đó trước, chỉ gắn iframe khi server trả
 * 2xx. ⛔ KHÔNG `onLoad`: `load` chưa bao giờ là bằng chứng thành công.
 *
 * ## Mã nào thì thử lại (M3)
 *
 * 5xx và lỗi mạng: upstream chưa lên, thử lại. 404/409/425/429 cũng thử lại:
 * ngay sau khi phiên mở, đường `/ide/session/<id>/` có thể chưa được đăng ký
 * hoặc đang bị giới hạn nhịp, và bản trước coi MỌI 4xx là vĩnh viễn nên một nhịp
 * khởi động chậm thành màn lỗi. Chỉ 401/403 dừng ngay: đó là chuyện quyền, thử
 * 22 lần vẫn ra đúng kết quả đó.
 *
 * ## Theo pha phiên
 *
 * Phiên hết hạn hay lỗi ⇒ lớp phủ nói trình soạn thảo đã dừng, thay vì để một
 * iframe chết trông như còn chạy. Phiên MỚI (id khác) ⇒ thăm dò lại từ đầu.
 *
 * ⚠ `/ide` chưa từng đi qua Traefik trong repo này (mọi phép đo P6 dùng
 * port-forward), nên nút "Mở trong tab mới" là đường thoát bắt buộc.
 */

/** Nhịp thăm dò. */
const IDE_PROBE_INTERVAL_MS = 2_000;
/** Nhịp đếm số giây đã chờ. */
const ELAPSED_TICK_MS = 1_000;
/** Mã 4xx đáng chờ thêm: đường chưa đăng ký hoặc đang bị giới hạn nhịp. */
const RETRYABLE_4XX: ReadonlySet<number> = new Set([404, 408, 409, 425, 429]);

type BootState =
  | { readonly kind: 'probing' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'failed'; readonly reason: string };

export interface IdePaneProps {
  readonly sessionId: string | null;
  /** Pha phiên: `expired`/`error` ⇒ lớp phủ "trình soạn thảo đã dừng". */
  readonly phase?: SessionPhase;
}

export function IdePane({ sessionId, phase }: IdePaneProps): ReactElement {
  const [state, setState] = useState<BootState>({ kind: 'probing' });
  const [reloadKey, setReloadKey] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (sessionId === null) {
      return;
    }
    const id = sessionId;
    setState({ kind: 'probing' });

    let cancelled = false;
    const controller = new AbortController();
    const deadline = Date.now() + IDE_BOOT_TIMEOUT_MS;

    async function probe(): Promise<void> {
      while (!cancelled) {
        try {
          const res = await fetch(ideSessionUrl(id), { signal: controller.signal, cache: 'no-store' });
          if (cancelled) return;
          if (res.ok) {
            setState({ kind: 'ready' });
            return;
          }
          if (res.status < 500 && !RETRYABLE_4XX.has(res.status)) {
            setState({ kind: 'failed', reason: t('session.ide.reason-http', { status: res.status }) });
            return;
          }
        } catch {
          if (cancelled) return;
          // Lỗi mạng: cùng nhóm với 5xx, có thể vẫn đang lên.
        }
        if (Date.now() + IDE_PROBE_INTERVAL_MS >= deadline) {
          if (!cancelled) {
            setState({
              kind: 'failed',
              reason: t('session.ide.reason-timeout', { seconds: Math.round(IDE_BOOT_TIMEOUT_MS / 1000) }),
            });
          }
          return;
        }
        await new Promise((resolve) => {
          timerRef.current = setTimeout(resolve, IDE_PROBE_INTERVAL_MS);
        });
      }
    }

    void probe();

    return () => {
      cancelled = true;
      controller.abort();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [sessionId, reloadKey]);

  // Đồng hồ đếm, TÁCH khỏi vòng thăm dò: gộp vào thì số giây nhảy hai giây một lần.
  useEffect(() => {
    if (state.kind !== 'probing' || sessionId === null) {
      return;
    }
    setElapsedSec(0);
    const started = Date.now();
    const id = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - started) / 1000));
    }, ELAPSED_TICK_MS);
    return () => {
      clearInterval(id);
    };
  }, [state.kind, sessionId, reloadKey]);

  if (sessionId === null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background px-6 text-center text-sm text-muted-foreground">
        {t('session.ide.no-session')}
      </div>
    );
  }

  const reload = (): void => {
    setReloadKey((n) => n + 1);
  };
  const sessionDown = phase === 'expired' || phase === 'error';

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center justify-end gap-1 border-b border-border px-2">
        <Button size="sm" variant="ghost" className="h-7" iconLeft={<RotateCw aria-hidden="true" className="size-3.5" />} onClick={reload}>
          {t('session.ide.reload')}
        </Button>
        {/* Đường thoát BẮT BUỘC: khi iframe trắng, đây là chỗ duy nhất đọc được thông báo thật của máy chủ. */}
        <a
          href={ideSessionUrl(sessionId)}
          target="_blank"
          rel="noreferrer"
          className={cn(
            'inline-flex h-7 items-center gap-1.5 px-2 font-mono text-xs text-foreground underline-offset-4 hover:underline',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <ExternalLink aria-hidden="true" className="size-3.5" />
          {t('session.ide.open-new-tab')}
        </a>
      </div>

      <div className="relative min-h-0 flex-1">
        {state.kind === 'ready' && (
          <iframe
            key={`${sessionId}:${String(reloadKey)}`}
            src={ideSessionUrl(sessionId)}
            title={t('session.ide.iframe-title')}
            className="h-full w-full border-0"
          />
        )}

        {state.kind === 'probing' && <IdeBootScreen elapsedSec={elapsedSec} />}

        {state.kind === 'failed' && <IdeFailedScreen reason={state.reason} onRetry={reload} />}

        {sessionDown && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/90 px-6 text-center">
            <Hourglass aria-hidden="true" className="size-6 text-muted-foreground" />
            <p className="max-w-sm text-sm text-foreground">{t('session.ide.session-down')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Màn chờ. Cung KHÔNG XÁC ĐỊNH (không phải thanh chạy tới hạn 45s: lúc thanh đầy
 * chính là lúc thất bại). `role="status"` bọc đúng phần chữ tĩnh; số giây nằm
 * ngoài để trình đọc màn hình không đọc lại mỗi giây.
 */
function IdeBootScreen({ elapsedSec }: { readonly elapsedSec: number }): ReactElement {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <svg viewBox={ARC_VIEWBOX} aria-hidden="true" className="size-16 shrink-0 text-signal">
        <path {...arcTrackProps()} />
        <path {...arcSpinnerProps()} />
      </svg>

      <div role="status" className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{t('session.ide.booting-title')}</p>
        <p className="max-w-sm text-xs text-muted-foreground">{t('session.ide.booting-detail')}</p>
      </div>

      <p className="font-mono text-xs text-muted-foreground tabular-nums">
        {t('session.ide.booting-elapsed', { seconds: elapsedSec })}
      </p>
    </div>
  );
}

/** Màn thất bại: hỏng cái gì + làm gì tiếp (hai nửa tách ở tầng kiểu `ErrorEntry`). */
function IdeFailedScreen({ reason, onRetry }: { readonly reason: string; readonly onRetry: () => void }): ReactElement {
  const entry = err('session.ide.error.probe', { reason });

  return (
    <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <p className="text-sm font-semibold text-destructive">{entry.what}</p>
      <p className="max-w-md text-xs text-muted-foreground">{entry.next}</p>
      <Button size="sm" variant="secondary" iconLeft={<RotateCw aria-hidden="true" className="size-3.5" />} onClick={onRetry}>
        {t('session.ide.retry')}
      </Button>
    </div>
  );
}
