'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { t, err } from '@devops-platform/copy';
import type { SessionPhase } from '@devops-platform/terminal';
import { BootLog, Button, Icon } from '@devops-platform/ds';
import { IDE_BOOT_TIMEOUT_MS, ideSessionUrl } from './ide-layout';

/**
 * Khoang IDE (Theia) trong iframe CÙNG ORIGIN.
 *
 * ## ⛔ Chỉ 2xx mới gắn iframe (đo trên cụm 2026-09-07)
 *
 * Theia bind cổng ~20s sau khi phiên trả về, và thân 503 của gateway VẪN bắn `load`.
 * Nên ở đây `fetch` chính URL đó trước, chỉ gắn iframe khi server trả 2xx. ⛔ KHÔNG
 * `onLoad`: `load` chưa bao giờ là bằng chứng thành công.
 *
 * ## Mã nào thì thử lại
 *
 * 5xx và lỗi mạng: upstream chưa lên, thử lại. 404/409/425/429 cũng thử lại: ngay sau
 * khi phiên mở, đường `/ide/session/<id>/` có thể chưa được đăng ký hoặc đang bị giới
 * hạn nhịp. Chỉ 401/403 dừng ngay: đó là chuyện quyền.
 *
 * ## Theo trạng thái MÁY, không theo trạng thái terminal
 *
 * Lớp phủ "trình soạn thảo đã dừng" chỉ hiện khi máy thật sự không còn
 * (`sessionGone`). Bản trước hiện nó ở mọi pha `error` của terminal, kể cả lỗi chỉ
 * của kết nối WebSocket (dán quá cỡ, gateway ngắt) trong khi pod và Theia vẫn chạy
 * bình thường: người học bị chặn khỏi trình soạn thảo đang sống.
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
  /** Pha phiên. Chỉ `expired` tự nó nói máy đã mất; các pha khác cần `sessionGone`. */
  readonly phase?: SessionPhase;
  /** Máy đã bị thu hồi (không chỉ kết nối terminal hỏng). Vắng ⇒ suy từ `phase === 'expired'`. */
  readonly sessionGone?: boolean;
}

export function IdePane({ sessionId, phase, sessionGone }: IdePaneProps): ReactElement {
  const [state, setState] = useState<BootState>({ kind: 'probing' });
  const [reloadKey, setReloadKey] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (sessionId === null) return;
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
    if (state.kind !== 'probing' || sessionId === null) return;
    setElapsedSec(0);
    const started = Date.now();
    const id = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - started) / 1000));
    }, ELAPSED_TICK_MS);
    return () => clearInterval(id);
  }, [state.kind, sessionId, reloadKey]);

  if (sessionId === null) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
        <Icon name="editor" size={34} className="text-ink-3" />
        <p className="max-w-xs text-sm text-ink-2">{t('session.ide.no-session')}</p>
      </div>
    );
  }

  const reload = (): void => setReloadKey((n) => n + 1);
  const gone = sessionGone ?? phase === 'expired';

  return (
    <div className="flex h-full w-full flex-col bg-canvas">
      <div className="flex h-9 shrink-0 items-center justify-end gap-1 border-b border-rule px-2">
        <Button size="sm" variant="ghost" icon="refresh" className="h-7" onClick={reload}>
          {t('session.ide.reload')}
        </Button>
        {/* Đường thoát BẮT BUỘC: khi iframe trắng, đây là chỗ duy nhất đọc được thông báo thật của máy chủ. */}
        <a
          href={ideSessionUrl(sessionId)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-sm text-ink-2 outline-none hover:bg-well hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Icon name="external-link" size={15} />
          {t('session.ide.open-new-tab')}
        </a>
      </div>

      <div className="relative min-h-0 flex-1">
        {state.kind === 'ready' ? (
          <iframe
            key={`${sessionId}:${String(reloadKey)}`}
            src={ideSessionUrl(sessionId)}
            title={t('session.ide.iframe-title')}
            className="h-full w-full border-0 bg-canvas"
          />
        ) : null}

        {state.kind === 'probing' ? <IdeBootScreen elapsedSec={elapsedSec} /> : null}

        {state.kind === 'failed' ? <IdeFailedScreen reason={state.reason} onRetry={reload} /> : null}

        {gone ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-canvas/92 px-6 text-center">
            <Icon name="hourglass" size={26} className="text-ink-3" />
            <p className="max-w-sm text-sm text-ink">{t('session.ide.session-down')}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Màn chờ: nhật ký hai dòng (máy đã có, trình soạn thảo đang lên) và số giây đã chờ.
 * Không thanh chạy tới hạn 45s: lúc thanh đầy chính là lúc thất bại. Số giây nằm ngoài
 * vùng `role="status"` để trình đọc màn hình không đọc lại mỗi giây.
 */
function IdeBootScreen({ elapsedSec }: { readonly elapsedSec: number }): ReactElement {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-canvas px-6">
      <BootLog
        title={t('session.ide.booting-title')}
        lines={[
          { key: 'pod', text: t('session.boot.step.pod'), state: 'done' },
          { key: 'ide', text: t('session.boot.step.ide'), state: 'active', detail: t('session.ide.booting-detail') },
        ]}
        className="w-full max-w-sm"
      />
      <p className="w-full max-w-sm pl-[26px] font-mono text-xs tabular-nums text-ink-3">
        {t('session.ide.booting-elapsed', { seconds: elapsedSec })}
      </p>
    </div>
  );
}

/** Màn thất bại: hỏng cái gì + làm gì tiếp (hai nửa tách ở tầng kiểu `ErrorEntry`). */
function IdeFailedScreen({ reason, onRetry }: { readonly reason: string; readonly onRetry: () => void }): ReactElement {
  const entry = err('session.ide.error.probe', { reason });
  return (
    <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
      <Icon name="unplug" size={28} className="text-bad-ink" />
      <p className="max-w-md text-sm font-medium text-ink">{entry.what}</p>
      <p className="max-w-md text-xs text-ink-2">{entry.next}</p>
      <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>
        {t('session.ide.retry')}
      </Button>
    </div>
  );
}
