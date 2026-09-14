'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { AlarmClock, Clock, Play, Square, TimerReset } from 'lucide-react';
import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@devops-platform/ui';
import type { SandboxSession } from '../../lib/use-sandbox-session';
import { DEFAULT_PROFILE, describeCapacity, type ProfileCapacityView } from './capacity';
import { PhaseIcon } from './session-status';
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

const HARD_CAP_REASON = t('session.controls.hard-cap');

export interface SessionControlsProps {
  readonly session: SandboxSession;
  readonly actions: SessionActions;
  /**
   * TTL của nội dung, hiện **TRƯỚC** khi bắt đầu (bắt buộc cho playground —
   * AC 8.E). Sau khi phiên mở thì đồng hồ thật thay chỗ nó.
   */
  readonly ttlSeconds?: number | null;
  /** `null` = chưa có payload ⇒ không hiện gì. Xem `describeCapacity`. */
  readonly capacity?: ProfileCapacityView | null;
  /**
   * Profile tài nguyên của CHÍNH bài đang mở (`''` · `ide` · `k8s` ·
   * `k8s-multinode`), do máy chủ tính bằng `profileForCapabilities`.
   *
   * ⚠ Bỏ trống ⇒ **profile mặc định**, và khi đó câu chữ tự thu hẹp về "cho bài
   * thường" (xem `describeProfileCapacity` ở vỏ). Đó là mặc định AN TOÀN chứ
   * không phải mặc định đúng: một trang truyền thiếu prop này sẽ hiện con số
   * của bài thường kèm ghi chú rằng bài IDE/K8s có trần riêng — không hứa sai,
   * nhưng cũng chưa trả lời được câu "còn mấy chỗ cho bài NÀY".
   */
  readonly profile?: string;
  readonly startLabel?: string;
  readonly canStart?: boolean;
  readonly compact?: boolean;
}

/**
 * Đồng hồ TTL. Chỉ hiện dưới 10 phút, và ĐỔI TRỌNG LƯỢNG ở mốc 2 phút.
 *
 * Vì sao chỉ tới phút, không tới giây: `useSandboxSession` nhịp đồng hồ 15 giây
 * một lần (có chủ ý — thứ nó điều khiển là một cái nhãn và một cái nút). Hiện
 * số giây từ một nguồn cập nhật 15s/lần là in ra một con số SAI trong 14 giây
 * mỗi 15 giây. Muốn có giây thì phải sửa nhịp ở `lib/use-sandbox-session.ts`,
 * ngoài phạm vi file này.
 *
 * `tabular-nums` để con số không nhảy ngang khi đổi từ "10" xuống "9".
 */
function TtlClock({ remainingMs, urgent }: { remainingMs: number; urgent: boolean }): ReactElement {
  const minutes = Math.ceil(remainingMs / 60_000);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums',
        'text-foreground',
        urgent ? 'border-destructive/50 bg-destructive/10' : 'border-warning/40 bg-warning/10',
      )}
    >
      {/*
        Icon đổi HÌNH ở mốc khẩn, không chỉ đổi màu: đồng hồ báo thức khác đồng
        hồ thường ngay cả khi in đen trắng (SC 1.4.1). `animate-pulse` chỉ đặt
        trên icon — nhấp nháy cả viên chữ suốt hai phút cuối là quấy rối, và
        `prefers-reduced-motion` đã được `globals.css` hạ xuống 0.01ms.
      */}
      {urgent ? (
        <AlarmClock aria-hidden="true" className="size-4 animate-pulse text-destructive" />
      ) : (
        <Clock aria-hidden="true" className="size-4 text-warning" />
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
  compact = false,
}: SessionControlsProps): ReactElement {
  const { state, remainingMs } = session;
  const hasSession = state.sessionId !== null;
  const hint = describeCapacity(capacity, profile);
  const showClock = hasSession && remainingMs !== null && remainingMs < TTL_VISIBLE_MS;
  const urgent = remainingMs !== null && remainingMs < TTL_URGENT_MS;

  return (
    /*
      `data-testid` ở gốc khoang: harness cần NEO vào đúng vùng phiên khi đếm
      vùng aria-live. Đếm trên cả trang gom luôn container của Sonner
      (`app/layout.tsx` gắn `<Toaster />` cho mọi trang), và khi ấy phép kiểm D10
      đỏ ở mọi trang có toast kể cả khi khoang phiên hoàn toàn đúng — tức đo sai
      đối tượng. Xem `e2e/flows/playground.flow.spec.ts`.
    */
    <div data-testid="dlp-session-controls" className="flex flex-wrap items-center gap-2">
      {/*
        MỘT vùng aria-live duy nhất cho cả badge lẫn câu lý do (D10).
        Tách làm hai vùng sống thì trình đọc màn hình đọc hai lần cho một lần
        đổi pha; còn bọc thêm `role="status"` bên trong lại là vùng sống lồng
        vùng sống.
      */}
      <div aria-live="polite" className="flex flex-wrap items-center gap-2">
        {/*
          Icon `aria-hidden` bên trong badge: pha đã có nhãn chữ ngay cạnh, nên
          icon chỉ được nói với MẮT. Nó mang thông tin thật — vòng quay cho
          "đang tạo/đang kết nối", dấu kiểm cho "sẵn sàng", tam giác cho lỗi —
          nên hai pha cùng màu vẫn phân biệt được (SC 1.4.1).
        */}
        <Badge variant={phaseBadgeVariant(state.phase)} className="gap-1.5 px-2 py-1">
          <PhaseIcon phase={state.phase} />
          {SESSION_PHASE_LABEL[state.phase]}
        </Badge>
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
        <Badge variant="outline" className="gap-1.5">
          <Clock aria-hidden="true" className="size-3.5" />
          {t('session.controls.ttl-preview', { minutes: Math.round(ttlSeconds / 60) })}
        </Badge>
      )}

      {/*
        Ba trạng thái, không phải hai. `hint === null` (chưa có payload) không
        vẽ gì; `known: false` vẽ "Chưa rõ sức chứa" bằng biến thể TRUNG TÍNH —
        ⛔ tuyệt đối không mượn con số của profile mặc định để lấp chỗ trống,
        vì đúng con số đó đã in "Còn 14 chỗ" trong lúc server trả 429.

        `title` mang câu đầy đủ ("Còn 6/7 chỗ cho bài này." / lý do chưa rõ):
        badge chỉ đủ chỗ cho vài chữ, còn phạm vi của con số — "bài này" hay
        "bài thường" — là thứ quyết định nó có phải một lời hứa đúng hay không.
      */}
      {!hasSession &&
        hint !== null &&
        (hint.known ? (
          <Badge
            title={hint.detail}
            variant={
              hint.tone === 'full' ? 'destructive' : hint.tone === 'low' ? 'warning' : 'secondary'
            }
          >
            {hint.label}
          </Badge>
        ) : (
          <Badge title={hint.detail} variant="outline">
            {hint.label}
          </Badge>
        ))}

      {!hasSession && (
        /*
          `loading` (C2) chứ không đổi chữ nút: nó khoá nút, hiện spinner và
          GIỮ NGUYÊN bề rộng — đổi nhãn thì thanh công cụ nhảy ngang giữa lúc
          người dùng vừa bấm. Câu chữ vẫn có: badge pha bên trái chuyển sang
          "Đang tạo phiên…" trong cùng nhịp, và nó nằm trong vùng aria-live.
        */
        <Button
          iconLeft={<Play aria-hidden="true" className="size-4" />}
          onClick={actions.start}
          disabled={!canStart}
          loading={session.starting}
        >
          {startLabel}
        </Button>
      )}

      {/*
        Đồng hồ + "Thêm giờ" chỉ hiện dưới 10 phút: một đồng hồ chạy suốt buổi
        học là nhiễu, mười phút cuối mới là lúc nó nói được điều gì.
      */}
      {showClock && <TtlClock remainingMs={remainingMs ?? 0} urgent={urgent} />}

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
                <Button variant="secondary" iconLeft={<TimerReset aria-hidden="true" className="size-4" />} disabled>
                  {t('session.controls.extend')}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{HARD_CAP_REASON}</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="secondary"
            iconLeft={<TimerReset aria-hidden="true" className="size-4" />}
            onClick={actions.extend}
            loading={session.extending}
          >
            {t('session.controls.extend')}
          </Button>
        ))}

      {/*
        Hiện ở MỌI pha có sessionId, kể cả `reconnecting`/`error`: một phiên
        đang hỏng vẫn đang giữ một khe quota, và "Kết thúc" là cách duy nhất
        người học tự nhả nó ra mà không đợi hết TTL.
      */}
      {hasSession && (
        <Button
          variant="secondary"
          iconLeft={<Square aria-hidden="true" className="size-4" />}
          onClick={actions.end}
          loading={session.ending}
        >
          {t('session.controls.end')}
        </Button>
      )}

      {/*
        Cảnh báo hết chỗ đứng ở đây — TRƯỚC khi bấm, không phải sau khi ăn 429.
        Nút Bắt đầu vẫn bấm được (C5): `slots_free` là CẬN DƯỚI (orchestrator
        không cộng pod đang ấm trong `pool:free`) và nó đọc lúc `fetchedAt`, nên
        chặn cứng theo con số đó là từ chối nhầm người học trong khi chỗ đang có.

        ⛔ Và "chưa rõ" KHÔNG sinh cảnh báo: nhánh `known === false` không có
        `warning`, nên một lỗi đọc quota không biến thành một câu doạ màu đỏ.
      */}
      {!hasSession && hint !== null && hint.known && hint.warning !== null && (
        <p className={compact ? 'text-xs text-destructive' : 'basis-full text-xs text-destructive'}>
          {hint.warning}
        </p>
      )}
    </div>
  );
}
