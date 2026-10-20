'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { AlarmClock, Clock, Play, Square, TimerReset } from 'lucide-react';
import { Badge, Button, Tooltip, TooltipContent, TooltipTrigger, cn } from '@devops-platform/ui';
import type { SandboxSession } from '../../lib/use-sandbox-session';
import { DEFAULT_PROFILE, describeCapacity, type ProfileCapacityView } from './capacity';
import { PhaseIcon } from './session-status';
import { SESSION_PHASE_LABEL, TTL_URGENT_MS, TTL_VISIBLE_MS, phaseBadgeVariant } from './session-phase';

/**
 * Khung phiên DÙNG CHUNG cho ba trình học, đặt trên thanh 48px tối.
 *
 * ⛔ KHÔNG có `useReducer` nào ở đây. Vòng đời phiên sống ở `session-machine.ts`
 * qua `useSandboxSession`; component này chỉ VẼ `session.state`.
 */
export type SessionActions = { start(): void; end(): void; extend(): void };

const HARD_CAP_REASON = t('session.controls.hard-cap');

export interface SessionControlsProps {
  readonly session: SandboxSession;
  readonly actions: SessionActions;
  /** TTL của nội dung, hiện TRƯỚC khi bắt đầu (bắt buộc cho playground). */
  readonly ttlSeconds?: number | null;
  /** `null` = chưa có payload ⇒ không hiện gì. Xem `describeCapacity`. */
  readonly capacity?: ProfileCapacityView | null;
  /**
   * Profile tài nguyên của CHÍNH bài đang mở, do máy chủ tính. Bỏ trống ⇒ profile
   * mặc định, và câu chữ tự thu hẹp về "cho bài thường".
   */
  readonly profile?: string;
  readonly startLabel?: string;
  readonly canStart?: boolean;
}

/**
 * Đồng hồ TTL, chỉ hiện dưới 10 phút và đổi HÌNH ở mốc 2 phút (SC 1.4.1).
 * Chỉ tới phút: nguồn đồng hồ nhịp 15 giây, in giây là in số sai.
 */
function TtlClock({ remainingMs, urgent }: { remainingMs: number; urgent: boolean }): ReactElement {
  const minutes = Math.ceil(remainingMs / 60_000);
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-1.5 px-2.5 font-mono text-xs tabular-nums',
        urgent ? 'bg-destructive/20 text-foreground' : 'bg-signal text-signal-foreground',
      )}
    >
      {urgent ? (
        <AlarmClock aria-hidden="true" className="size-4 animate-pulse text-destructive" />
      ) : (
        <Clock aria-hidden="true" className="size-4" />
      )}
      {t('session.controls.ttl-remaining', { minutes })}
    </span>
  );
}

export function SessionControls({
  session,
  actions,
  ttlSeconds = null,
  capacity = null,
  profile = DEFAULT_PROFILE,
  startLabel = t('session.controls.start'),
  canStart = true,
}: SessionControlsProps): ReactElement {
  const { state, remainingMs } = session;
  const hasSession = state.sessionId !== null;
  const hint = describeCapacity(capacity, profile);
  const showClock = hasSession && remainingMs !== null && remainingMs < TTL_VISIBLE_MS;
  const urgent = remainingMs !== null && remainingMs < TTL_URGENT_MS;
  const failed = state.phase === 'error' || state.phase === 'expired';

  return (
    /* `data-testid` ở gốc: harness neo vào đúng vùng phiên khi đếm vùng aria-live. */
    <div data-testid="dlp-session-controls" className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      {/* MỘT vùng aria-live cho cả pha lẫn câu lý do (D10). */}
      <div aria-live="polite" className="flex min-w-0 items-center gap-2">
        <Badge variant={phaseBadgeVariant(state.phase)} className="gap-1.5 px-2 py-1">
          <PhaseIcon phase={state.phase} />
          {SESSION_PHASE_LABEL[state.phase]}
        </Badge>
        {state.message !== null && (
          <span
            title={state.message}
            className={cn('max-w-80 truncate text-xs', failed ? 'text-destructive' : 'text-muted-foreground')}
          >
            {state.message}
          </span>
        )}
      </div>

      {/* TTL của nội dung, TRƯỚC khi bắt đầu: người học phải biết phiên sống bao lâu trước khi dựng nó. */}
      {!hasSession && ttlSeconds != null && ttlSeconds > 0 && (
        <Badge variant="outline" className="gap-1.5">
          <Clock aria-hidden="true" className="size-3.5" />
          {t('session.controls.ttl-preview', { minutes: Math.round(ttlSeconds / 60) })}
        </Badge>
      )}

      {/*
        Ba trạng thái: `null` không vẽ gì; `known: false` vẽ "Chưa rõ sức chứa"
        trung tính. ⛔ Không mượn con số của profile mặc định để lấp chỗ trống.
        `title` mang câu đầy đủ, vì phạm vi của con số là thứ quyết định nó đúng hay sai.
      */}
      {!hasSession &&
        hint !== null &&
        (hint.known ? (
          <Badge
            title={hint.detail}
            variant={hint.tone === 'full' ? 'destructive' : hint.tone === 'low' ? 'warning' : 'secondary'}
          >
            {hint.label}
          </Badge>
        ) : (
          <Badge title={hint.detail} variant="outline">
            {hint.label}
          </Badge>
        ))}

      {!hasSession && (
        <Button
          size="sm"
          iconLeft={<Play aria-hidden="true" className="size-4" />}
          onClick={actions.start}
          disabled={!canStart}
          loading={session.starting}
        >
          {startLabel}
        </Button>
      )}

      {showClock && <TtlClock remainingMs={remainingMs ?? 0} urgent={urgent} />}

      {showClock &&
        (state.hardCapReached ? (
          /*
            ⛔ Chạm hardCap thì KHOÁ KÈM LÝ DO, không ẩn. `<span tabIndex={0}>` bọc
            ngoài là bắt buộc: nút disabled không phát sự kiện chuột và không nhận
            focus, nên tooltip gắn thẳng lên nó không bao giờ mở.
          */
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} title={HARD_CAP_REASON} className="inline-flex">
                <Button size="sm" variant="secondary" iconLeft={<TimerReset aria-hidden="true" className="size-4" />} disabled>
                  {t('session.controls.extend')}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{HARD_CAP_REASON}</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<TimerReset aria-hidden="true" className="size-4" />}
            onClick={actions.extend}
            loading={session.extending}
          >
            {t('session.controls.extend')}
          </Button>
        ))}

      {/* Hiện ở MỌI pha có sessionId: một phiên đang hỏng vẫn giữ một khe quota. */}
      {hasSession && (
        <Button
          size="sm"
          variant="outline"
          iconLeft={<Square aria-hidden="true" className="size-4" />}
          onClick={actions.end}
          loading={session.ending}
        >
          {t('session.controls.end')}
        </Button>
      )}

      {/* Cảnh báo hết chỗ đứng TRƯỚC khi bấm. Nút vẫn bấm được: `slots_free` là cận dưới. */}
      {!hasSession && hint !== null && hint.known && hint.warning !== null && (
        <p className="basis-full text-right text-xs text-destructive">{hint.warning}</p>
      )}
    </div>
  );
}
