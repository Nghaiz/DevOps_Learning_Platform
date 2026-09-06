'use client';

import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@devops-platform/ui';
import type { SandboxSession } from '../../lib/use-sandbox-session';
import { describeCapacity, type CapacitySnapshot } from './capacity';
import {
  SESSION_PHASE_LABEL,
  TTL_URGENT_MS,
  TTL_VISIBLE_MS,
  phaseBadgeVariant,
} from './session-phase';

/**
 * C5 — khung phiên DÙNG CHUNG cho bốn trình học (lesson · lab · quiz ·
 * playground).
 *
 * ⛔ KHÔNG có `useReducer` nào ở đây, và không được thêm. Vòng đời phiên sống ở
 * `session-machine.ts` của `packages/terminal`, đi qua `useSandboxSession` —
 * ba thứ đắt giá (backoff có jitter, phân biệt rớt-mạng ↔ phiên-chết, ca "1006
 * khi chưa từng ready") nằm trong đó và đã được trả giá ở 1.F/3.H. Component
 * này chỉ VẼ `session.state`; nó không sở hữu một mẩu trạng thái phiên nào.
 * Đây là hàng rủi ro số 2 của bảng Risk P13.
 */
export type SessionActions = { start(): void; end(): void; extend(): void };

const HARD_CAP_REASON =
  'Đã dùng hết thời lượng tối đa cho phiên này — hãy kết thúc rồi mở phiên mới.';

export interface SessionControlsProps {
  readonly session: SandboxSession;
  readonly actions: SessionActions;
  /**
   * TTL của nội dung, hiện **TRƯỚC** khi bắt đầu (bắt buộc cho playground —
   * AC 8.E). Sau khi phiên mở thì đồng hồ thật thay chỗ nó.
   */
  readonly ttlSeconds?: number | null;
  /** `null` = chưa biết ⇒ không hiện gì. Xem `describeCapacity`. */
  readonly capacity?: CapacitySnapshot | null;
  readonly startLabel?: string;
  readonly canStart?: boolean;
  readonly compact?: boolean;
}

export function SessionControls({
  session,
  actions,
  ttlSeconds = null,
  capacity = null,
  startLabel = 'Bắt đầu',
  canStart = true,
  compact = false,
}: SessionControlsProps): React.ReactElement {
  const { state, remainingMs } = session;
  const hasSession = state.sessionId !== null;
  const hint = describeCapacity(capacity);
  const showClock = hasSession && remainingMs !== null && remainingMs < TTL_VISIBLE_MS;
  const urgent = remainingMs !== null && remainingMs < TTL_URGENT_MS;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/*
        MỘT vùng aria-live duy nhất cho cả badge lẫn câu lý do (D10).
        Tách làm hai vùng sống thì trình đọc màn hình đọc hai lần cho một lần
        đổi pha; còn bọc thêm `role="status"` bên trong lại là vùng sống lồng
        vùng sống.
      */}
      <div aria-live="polite" className="flex flex-wrap items-center gap-2">
        <Badge variant={phaseBadgeVariant(state.phase)}>{SESSION_PHASE_LABEL[state.phase]}</Badge>
        {state.message !== null && (
          <span
            className={
              state.phase === 'error' || state.phase === 'expired'
                ? 'text-xs text-destructive'
                : 'text-xs text-muted-foreground'
            }
          >
            {state.message}
          </span>
        )}
      </div>

      {/*
        TTL của nội dung, TRƯỚC khi bắt đầu. Người học phải biết phiên sống bao
        lâu trước khi bỏ công dựng nó, không phải sau.
      */}
      {!hasSession && ttlSeconds != null && ttlSeconds > 0 && (
        <Badge variant="outline">Phiên kéo dài {Math.round(ttlSeconds / 60)} phút</Badge>
      )}

      {!hasSession && hint !== null && (
        <Badge variant={hint.tone === 'full' ? 'destructive' : hint.tone === 'low' ? 'warning' : 'secondary'}>
          {hint.label}
        </Badge>
      )}

      {!hasSession && (
        /*
          `loading` (C2) chứ không đổi chữ nút: nó khoá nút, hiện spinner và
          GIỮ NGUYÊN bề rộng — đổi nhãn thì thanh công cụ nhảy ngang giữa lúc
          người dùng vừa bấm. Câu chữ vẫn có: badge pha bên trái chuyển sang
          "Đang tạo phiên…" trong cùng nhịp, và nó nằm trong vùng aria-live.
        */
        <Button onClick={actions.start} disabled={!canStart} loading={session.starting}>
          {startLabel}
        </Button>
      )}

      {/*
        Đồng hồ + "Thêm giờ" chỉ hiện dưới 10 phút: một đồng hồ chạy suốt buổi
        học là nhiễu, mười phút cuối mới là lúc nó nói được điều gì.
      */}
      {showClock && (
        <span
          className={
            urgent ? 'text-xs font-semibold text-destructive' : 'text-xs text-warning'
          }
        >
          Còn {Math.ceil((remainingMs ?? 0) / 60_000)} phút
        </span>
      )}

      {showClock &&
        (state.hardCapReached ? (
          /*
            ⛔ Chạm `hardCap` thì DISABLE KÈM LÝ DO, không ẩn. Một nút biến mất
            không nói được vì sao nó biến mất, và người học đọc ra là trang
            hỏng chứ không phải "đã hết thời lượng tối đa".

            `<span tabIndex={0}>` bọc ngoài là BẮT BUỘC, không phải trang trí:
            `<button disabled>` không phát sự kiện chuột (class
            `disabled:pointer-events-none` của C2 còn chặt hơn nữa) nên Radix
            Tooltip gắn thẳng lên nó sẽ KHÔNG BAO GIỜ mở, và nút disabled cũng
            không nhận focus nên người dùng bàn phím không có đường nào đọc
            được lý do. `title` giữ lại làm lưới an toàn nếu portal tooltip bị
            chặn (CSP, iframe mất quyền).
          */
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} title={HARD_CAP_REASON} className="inline-flex">
                <Button variant="secondary" disabled>
                  Thêm giờ
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{HARD_CAP_REASON}</TooltipContent>
          </Tooltip>
        ) : (
          <Button variant="secondary" onClick={actions.extend} loading={session.extending}>
            Thêm giờ
          </Button>
        ))}

      {/*
        Hiện ở MỌI pha có sessionId, kể cả `reconnecting`/`error`: một phiên
        đang hỏng vẫn đang giữ một khe quota, và "Kết thúc" là cách duy nhất
        người học tự nhả nó ra mà không đợi hết TTL.
      */}
      {hasSession && (
        <Button variant="secondary" onClick={actions.end} loading={session.ending}>
          Kết thúc phiên
        </Button>
      )}

      {/*
        Cảnh báo hết chỗ đứng ở đây — TRƯỚC khi bấm, không phải sau khi ăn 429.
        Nút Bắt đầu vẫn bấm được (C5): trần mềm là ước lượng đọc lúc `fetchedAt`,
        và chặn cứng theo một con số có thể đã cũ vài giây là từ chối nhầm người
        học trong khi chỗ vừa trống ra.
      */}
      {!hasSession && hint?.warning != null && (
        <p className={compact ? 'text-xs text-destructive' : 'basis-full text-xs text-destructive'}>
          {hint.warning}
        </p>
      )}
    </div>
  );
}
