'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Button, Pill, Tip, cn } from '@devops-platform/ds';
import type { SandboxSession } from '../../lib/use-sandbox-session';
import { DEFAULT_PROFILE, describeCapacity, type ProfileCapacityView } from './capacity';
import { SessionStatusPill } from './session-status';
import { TTL_URGENT_MS, TTL_VISIBLE_MS } from './session-phase';

/**
 * Khung điều khiển máy trên thanh trên của khu thực hành.
 *
 * ⛔ KHÔNG có `useReducer` nào ở đây. Vòng đời phiên sống ở `session-machine.ts`
 * qua `useSandboxSession`; component này chỉ VẼ `session.state`.
 *
 * Nút Bắt đầu KHÔNG ở đây: nó nằm giữa khoang làm việc (`PracticeLaunch`), nơi mắt
 * người học đang nhìn khi máy chưa chạy. Trang chỉ có đúng một nút Bắt đầu.
 */
export type SessionActions = { start(): void; end(): void; extend(): void };

export interface SessionControlsProps {
  readonly session: SandboxSession;
  readonly actions: SessionActions;
  /** TTL của nội dung, hiện TRƯỚC khi bắt đầu (bắt buộc cho playground). */
  readonly ttlSeconds?: number | null;
  /** `null` = chưa có payload ⇒ không hiện gì. Xem `describeCapacity`. */
  readonly capacity?: ProfileCapacityView | null;
  /** Profile tài nguyên của CHÍNH bài đang mở, do máy chủ tính. */
  readonly profile?: string;
}

/**
 * Đồng hồ còn lại, chỉ hiện dưới 10 phút và đổi sắc ở mốc 2 phút (không chỉ đổi màu:
 * biểu tượng cũng đổi). Chỉ tới phút: nguồn đồng hồ nhịp 15 giây, in giây là in số sai.
 */
function TtlClock({ remainingMs, urgent }: { remainingMs: number; urgent: boolean }): ReactElement {
  const minutes = Math.ceil(remainingMs / 60_000);
  return (
    <Pill tone={urgent ? 'bad' : 'warn'} icon={urgent ? 'hourglass' : 'timer'} className="tabular-nums">
      {t('session.controls.ttl-remaining', { minutes })}
    </Pill>
  );
}

export function SessionControls({
  session,
  actions,
  ttlSeconds = null,
  capacity = null,
  profile = DEFAULT_PROFILE,
}: SessionControlsProps): ReactElement {
  const { state, remainingMs } = session;
  const hasSession = state.sessionId !== null;
  const hint = describeCapacity(capacity, profile);
  const showClock = hasSession && state.phase !== 'expired' && remainingMs !== null && remainingMs < TTL_VISIBLE_MS;
  const urgent = remainingMs !== null && remainingMs < TTL_URGENT_MS;
  const failed = state.phase === 'error' || state.phase === 'expired';

  return (
    /* `data-testid` ở gốc: harness neo vào đúng vùng phiên khi đếm vùng aria-live. */
    <div data-testid="dlp-session-controls" className="flex min-w-0 items-center justify-end gap-2">
      {/* MỘT vùng aria-live cho cả pha lẫn câu lý do. */}
      <div aria-live="polite" className="flex min-w-0 items-center gap-2">
        <SessionStatusPill phase={state.phase} />
        {state.message === null ? null : (
          <span
            title={state.message}
            className={cn('hidden max-w-72 truncate text-xs xl:inline', failed ? 'text-bad-ink' : 'text-ink-3')}
          >
            {state.message}
          </span>
        )}
      </div>

      {/* TTL của nội dung, TRƯỚC khi bắt đầu: người học biết máy sống bao lâu trước khi dựng nó. */}
      {!hasSession && ttlSeconds != null && ttlSeconds > 0 ? (
        <Pill icon="hourglass" className="hidden md:inline-flex">
          {t('session.controls.ttl-preview', { minutes: Math.round(ttlSeconds / 60) })}
        </Pill>
      ) : null}

      {/*
        Ba trạng thái: `null` không vẽ gì; `known: false` vẽ "Chưa rõ sức chứa" trung
        tính. ⛔ Không mượn con số của profile mặc định để lấp chỗ trống. Câu đầy đủ
        nằm ở `title`, vì phạm vi của con số là thứ quyết định nó đúng hay sai.
      */}
      {!hasSession && hint !== null ? (
        <Pill
          tone={hint.known ? (hint.tone === 'full' ? 'bad' : hint.tone === 'low' ? 'warn' : 'neutral') : 'neutral'}
          icon="server"
          title={hint.detail}
          className="hidden sm:inline-flex"
        >
          {hint.label}
        </Pill>
      ) : null}

      {showClock ? <TtlClock remainingMs={remainingMs ?? 0} urgent={urgent} /> : null}

      {showClock ? (
        state.hardCapReached ? (
          /*
            ⛔ Chạm trần thì KHOÁ KÈM LÝ DO, không ẩn. `<span tabIndex={0}>` bọc ngoài là
            bắt buộc: nút disabled không nhận focus nên tooltip gắn thẳng lên nó không mở.
          */
          <Tip content={t('session.controls.hard-cap')}>
            <span tabIndex={0} className="inline-flex rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-focus">
              <Button size="sm" variant="secondary" icon="history" disabled>
                <span className="hidden lg:inline">{t('session.controls.extend')}</span>
                <span className="sr-only lg:hidden">{t('session.controls.extend')}</span>
              </Button>
            </span>
          </Tip>
        ) : (
          <Button size="sm" variant="secondary" icon="history" onClick={actions.extend} loading={session.extending}>
            <span className="hidden lg:inline">{t('session.controls.extend')}</span>
            <span className="sr-only lg:hidden">{t('session.controls.extend')}</span>
          </Button>
        )
      ) : null}

      {/*
        Hiện ở mọi pha có máy, TRỪ `expired`: máy hỏng vẫn giữ một khe quota nên phải
        tắt được, còn máy đã hết hạn thì không còn gì để tắt (bấm chỉ nhận lỗi).
      */}
      {hasSession && state.phase !== 'expired' ? (
        <Button size="sm" variant="danger" icon="power" onClick={actions.end} loading={session.ending}>
          <span className="hidden lg:inline">{t('session.controls.end')}</span>
          <span className="sr-only lg:hidden">{t('session.controls.end')}</span>
        </Button>
      ) : null}

    </div>
  );
}
