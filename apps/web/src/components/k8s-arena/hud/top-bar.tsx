'use client';

import { type ReactElement } from 'react';
import { Clock, LogOut, Pause, Settings, ShieldAlert, Star } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@devops-platform/ui';
import type { Objective } from '@devops-platform/games';

/**
 * Bốn nấc tốc độ hiện trên thanh.
 *
 * ⚠ Nấc `0` KHÔNG đi thẳng vào `K8sSession.setSpeed`: hàm đó kẹp đầu vào về
 * `[0.25, 8]` một cách có chủ ý (chu kỳ `setInterval` bằng 0 làm treo tab), nên
 * `setSpeed(0)` cho ra 0.25× chứ không phải dừng — một cái nút nói dối. Việc
 * dừng thật phải làm ở tầng trên: `onSpeedChange(0)` là tín hiệu "tạm dừng", và
 * bên gọi dừng vòng lặp thay vì hạ nhịp. Đã báo lead: hợp đồng `K8sSession`
 * chưa có `pause`/`resume`.
 */
const SPEEDS: readonly number[] = [0, 1, 2, 4];

/**
 * Chiều cao thanh trên cùng, và độ lệch mà mọi lớp nổi neo mép trên phải dùng.
 *
 * Hai hằng chứ không một, vì Tailwind quét chuỗi lớp NGUYÊN VẸN — không sinh
 * được `top-${n}` từ một con số. Chúng phải khớp nhau; đặt cạnh nhau ở đây để
 * chỗ cần sửa là MỘT chỗ.
 *
 * Lý do tồn tại: bản trước lớp nổi để `top-0`, mà khối chứa chúng bao cả thanh
 * trên cùng — nên ô đầu tiên của bảng công cụ ("Pod") bị thanh trên che mất nửa
 * (chủ dự án báo 2026-09-08). Nếu sau này lead bọc HUD trong một khối đã nằm
 * dưới thanh, đổi `HUD_TOP_OFFSET` về `'top-0'` là xong — một dòng.
 */
export const TOP_BAR_HEIGHT = 'h-12';
export const HUD_TOP_OFFSET = 'top-12';

/**
 * Vùng cuộn được nhưng KHÔNG hiện thanh trượt.
 *
 * Hợp đồng (`NO_VISIBLE_SCROLLBARS`) cho phép cuộn dọc ở đúng hai chỗ — vùng nội
 * dung dài thật, nơi cuộn là hành vi mong đợi — với điều kiện ẩn thanh trượt.
 * Trong lane này đó là kết quả terminal và thân ngăn tra cứu. Bảng công cụ
 * KHÔNG thuộc nhóm đó và không được dùng hằng này.
 *
 * `scrollbar-width: none` phủ Firefox và Chromium mới; `::-webkit-scrollbar`
 * phủ WebKit cũ. Cần cả hai — không trình duyệt nào nhận đủ một mình.
 */
export const HUD_SCROLL_HIDDEN = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export interface TopBarProps {
  /** Mã bài, ví dụ `K8S-01`. */
  readonly code: string;
  readonly title: string;
  readonly objectives: readonly Objective[];
  /** `SessionStatus.objectivesMet`. */
  readonly metIds: readonly string[];
  /**
   * `ObjectiveKinds.guards` — mục tiêu đúng sẵn mà người chơi phải GIỮ.
   *
   * Bị loại khỏi thanh tiến độ. Đếm chúng làm mọi bài mở ra ở một tỉ lệ khác 0
   * cho một việc chưa ai làm — chủ dự án đọc đúng nó thành *"tôi vừa vào mà đã
   * có task được hoàn thành rồi"*.
   */
  readonly guardIds: readonly string[];
  /** `Date.now()` lúc vào bài. Thanh tự đếm từ đó, không nhận một con số đổi mỗi giây qua prop. */
  readonly startedAt: number;
  readonly simulationTick?: number;
  /** 0..3. Điểm sao do tầng chấm điểm tính, thanh chỉ hiển thị. */
  readonly stars: number;
  /** Nhịp hiện tại; `0` = đang tạm dừng. */
  readonly speed: number;
  readonly onSpeedChange: (multiplier: number) => void;
  readonly onExit: () => void;
  /**
   * Mở bảng CÀI ĐẶT.
   *
   * Trước đây nút này mở ngăn tra cứu: biểu tượng nói "cài đặt", nhãn nói "trợ
   * giúp bài học", và cú bấm mở một thứ thứ ba. Ngăn tra cứu có nút riêng ở
   * thanh công cụ dưới.
   */
  readonly onSettings: () => void;
}

/**
 * Thanh trên cùng — dải duy nhất mà canvas 3D KHÔNG chiếm.
 *
 * Mọi thứ ở đây là trạng thái người chơi liếc mắt là thấy, không phải thứ họ
 * thao tác liên tục: còn bao nhiêu mục tiêu, đã chơi bao lâu, mô phỏng đang chạy
 * nhanh cỡ nào. Nút hành động thật nằm ở các lớp nổi.
 */
export function TopBar({
  code,
  title,
  objectives,
  metIds,
  guardIds,
  simulationTick = 0,
  stars,
  speed,
  onSpeedChange,
  onExit,
  onSettings,
}: TopBarProps): ReactElement {
  const met = new Set(metIds);
  const guard = new Set(guardIds);
  const required = objectives.filter(
    (objective) => objective.required && !guard.has(objective.id),
  );
  /* Ràng buộc "phải giữ" bị VỠ là tin xấu, và nó phải thấy được mà không cần mở thẻ nhiệm vụ. */
  const brokenGuards = objectives.filter(
    (objective) => guard.has(objective.id) && !met.has(objective.id),
  ).length;
  const done = required.filter((objective) => met.has(objective.id)).length;
  const percent = required.length === 0 ? 0 : Math.round((done / required.length) * 100);

  return (
    <TooltipProvider delayDuration={300}>
      <header className={cn('arena-topbar pointer-events-auto flex shrink-0 items-center gap-3 border-b border-border bg-card px-3', TOP_BAR_HEIGHT)}>
        <IconButton label="Thoát bài" onClick={onExit}>
          <LogOut className="size-4" />
        </IconButton>

        <div className="arena-title flex min-w-0 items-baseline gap-2">
          <span className="arena-level-code font-mono text-xs font-semibold text-muted-foreground" title={code}>K8S / {code.split('-')[1]?.padStart(2, '0') ?? code}</span>
          <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
        </div>

        <div className="arena-progress ml-2 flex min-w-24 max-w-40 flex-1 items-center gap-2">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-status-done transition-[width] duration-(--motion-base) ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="font-mono text-xs text-muted-foreground" aria-label={`Đã đạt ${done} trên ${required.length} mục tiêu`}>
            {done}/{required.length}
          </span>
        </div>

        {brokenGuards === 0 ? null : (
          <span
            className="arena-guard-alarm flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            title="Bạn đã làm hỏng một thứ mà bài yêu cầu giữ nguyên. Mở thẻ nhiệm vụ để xem là thứ gì."
          >
            <ShieldAlert className="size-3.5" aria-hidden />
            {brokenGuards}
          </span>
        )}

        <div className="arena-stars ml-auto flex items-center gap-1 text-muted-foreground" aria-label={`${stars} trên 3 sao`}>
          {[1, 2, 3].map((position) => (
            <Star
              key={position}
              aria-hidden
              className={cn('size-4', position <= stars ? 'fill-warning text-warning' : 'text-input')}
            />
          ))}
        </div>

        <span title="Thời gian mô phỏng" className="arena-clock flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          {formatElapsed(simulationTick * 500)}
        </span>

        <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5" role="group" aria-label="Tốc độ mô phỏng">
          {SPEEDS.map((value) => (
            <SpeedButton key={value} value={value} current={speed} onPick={onSpeedChange} />
          ))}
        </div>

        <IconButton label="Cài đặt" onClick={onSettings}>
          <Settings className="size-4" />
        </IconButton>
      </header>
    </TooltipProvider>
  );
}

function SpeedButton({
  value,
  current,
  onPick,
}: {
  readonly value: number;
  readonly current: number;
  readonly onPick: (multiplier: number) => void;
}): ReactElement {
  const label = value === 0 ? 'Tạm dừng' : `Chạy ${value}×`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onPick(value)}
          aria-pressed={current === value}
          aria-label={label}
          className={cn(
            'flex h-6 min-w-7 items-center justify-center rounded-sm px-1 font-mono text-[11px] font-semibold',
            'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
            current === value
              ? 'bg-background text-foreground shadow-elevation-1'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {value === 0 ? <Pause className="size-3" aria-hidden /> : `${value}×`}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactElement;
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className="rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** `mm:ss`, và `h:mm:ss` khi vượt một giờ. Không hiện mili-giây — không ai đọc. */
function formatElapsed(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = total < 3600 ? String(Math.floor(total / 60)) : String(Math.floor(total / 60) % 60).padStart(2, '0');
  return total < 3600 ? `${minutes}:${seconds}` : `${Math.floor(total / 3600)}:${minutes}:${seconds}`;
}

