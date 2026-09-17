'use client';

/**
 * Thanh trên cùng của sân chơi CI/CD (19.D.4.2 + D.4.4).
 *
 * Mượn vai trò và ngôn ngữ thị giác của `k8s-arena/hud/top-bar.tsx` (quyết định
 * #2), không chép bảng props: thanh của arena chở tốc độ mô phỏng, đồng hồ và
 * danh sách mục tiêu cụm — ba thứ game này không có. Thanh này chở đúng thứ game
 * này có: chương/level, nút chạy, chế độ vẽ, bậc chất lượng, các công tắc lớp
 * phủ, và trợ giúp.
 *
 * ⚠ **Chiều cao thanh là một hợp đồng bố cục**, không phải trang trí: sân chơi
 * neo ngay dưới nó (`CICD_FIELD_TOP_OFFSET`), và AC-D7 đo `boundingBox()` của
 * sân. Hai hằng chứ không một phép tính, vì Tailwind quét chuỗi lớp NGUYÊN VẸN
 * và không sinh được `top-${n}` từ một con số. Chúng phải khớp nhau; đặt cạnh
 * nhau ở đây để chỗ cần sửa là MỘT chỗ.
 */

import type { ReactElement } from 'react';
import { CircleHelp, LogOut, Play } from 'lucide-react';
import { Button, cn } from '@devops-platform/ui';

import type { RendererMode, ResolvedMode } from '../../shared/renderer-mode';
import { rendererModeReasonText } from '../../shared/renderer-mode';
import type { CicdPanelId, CicdPanelState } from './use-hud-panels';

export const CICD_TOP_BAR_HEIGHT = 'h-14';
export const CICD_FIELD_TOP_OFFSET = 'top-14';

/** Bậc chất lượng cảnh 3D. Hình dạng do `scene3d/` khai (`CicdScene3dProps`). */
export type CicdQualityTier = 'low' | 'medium' | 'high';

const QUALITY_LABEL: Readonly<Record<CicdQualityTier, string>> = {
  low: 'Thấp',
  medium: 'Vừa',
  high: 'Cao',
};

const PANEL_LABEL: Readonly<Record<CicdPanelId, string>> = {
  editor: 'Ô soạn',
  mission: 'Đề bài',
  inspector: 'Thông số',
  result: 'Kết quả',
  tools: 'Bảng núm',
  learn: 'Bài học',
  minimap: 'Bản đồ',
};

export interface CicdTopBarProps {
  readonly levelId: string;
  readonly title: string;
  readonly chapter: 'ci' | 'cd';
  readonly resolved: ResolvedMode;
  readonly onMode: (mode: RendererMode) => void;
  readonly quality: CicdQualityTier;
  readonly onQuality: (quality: CicdQualityTier) => void;
  readonly panels: CicdPanelState;
  /** Công tắc đang hiện, theo thứ tự. Bảng nào không có ở level này thì bỏ khỏi đây. */
  readonly panelIds: readonly CicdPanelId[];
  readonly onTogglePanel: (id: CicdPanelId) => void;
  readonly onCloseAllPanels: () => void;
  readonly onRun: () => void;
  readonly onHelp: () => void;
  readonly onExit: () => void;
  readonly onNext?: () => void;
}

export function CicdTopBar({
  levelId,
  title,
  chapter,
  resolved,
  onMode,
  quality,
  onQuality,
  panels,
  panelIds,
  onTogglePanel,
  onCloseAllPanels,
  onRun,
  onHelp,
  onExit,
  onNext,
}: CicdTopBarProps): ReactElement {
  return (
    <header
      className={cn(
        'pointer-events-auto absolute inset-x-0 top-0 z-30 flex items-center gap-2 overflow-x-auto border-b border-border bg-card/95 px-3 backdrop-blur-sm',
        CICD_TOP_BAR_HEIGHT,
      )}
      aria-label="Thanh điều khiển màn chơi"
    >
      <Button variant="ghost" size="sm" onClick={onExit}>
        <LogOut className="size-4 rotate-180" aria-hidden="true" />
        Danh sách màn
      </Button>

      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold text-foreground">{title}</span>
        <span className="font-mono text-[0.65rem] text-muted-foreground">
          {levelId} · chương {chapter === 'cd' ? 'CD' : 'CI'}
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button size="sm" onClick={onRun}>
          <Play className="size-4" aria-hidden="true" />
          Chạy thử
        </Button>

        {onNext === undefined ? null : (
          <Button variant="secondary" size="sm" onClick={onNext}>
            Màn tiếp
          </Button>
        )}

        {/*
         * Nút 2D/3D. `aria-pressed` chứ không `aria-selected`: đây là hai công
         * tắc, không phải một tab-list — chế độ đang chạy là một TRẠNG THÁI của
         * nút, và trình đọc màn hình đọc ra "đã bật".
         *
         * ⚠ Nhãn nói CHẾ ĐỘ, và câu giải thích nói VÌ SAO. Hai thứ tách nhau vì
         * "đang ở 2D vì bạn chọn" và "đang ở 2D vì máy không chạy nổi 3D" trông
         * y hệt nhau trên màn hình mà đòi hai câu khác hẳn nhau
         * (`rendererModeReasonText`).
         */}
        <div
          className="flex items-center rounded-md border border-border p-0.5"
          role="group"
          aria-label="Chế độ vẽ"
        >
          {(['2d', '3d'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={resolved.mode === mode}
              {...(resolved.mode === mode ? { title: rendererModeReasonText(resolved) } : {})}
              onClick={() => {
                onMode(mode);
              }}
              className={cn(
                'rounded px-2 py-1 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                resolved.mode === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {mode === '2d' ? '2D' : '3D'}
            </button>
          ))}
        </div>

        {/*
         * Bậc chất lượng chỉ có nghĩa ở 3D. Hiện một ô điều khiển không làm gì ở
         * 2D là mời người chơi đi sửa một thứ không liên quan tới thứ họ đang
         * thấy.
         */}
        {resolved.mode === '3d' ? (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Chất lượng
            <select
              value={quality}
              onChange={(event) => {
                onQuality(event.target.value as CicdQualityTier);
              }}
              className="rounded-md border border-border bg-background px-1 py-1 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {(['low', 'medium', 'high'] as const).map((tier) => (
                <option key={tier} value={tier}>
                  {QUALITY_LABEL[tier]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-1" role="group" aria-label="Lớp phủ">
          {panelIds.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={panels[id]}
              onClick={() => {
                onTogglePanel(id);
              }}
              className={cn(
                'rounded-md border px-2 py-1 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                panels[id]
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {PANEL_LABEL[id]}
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={onCloseAllPanels}>
            Thu hết
          </Button>
        </div>

        <Button variant="ghost" size="sm" onClick={onHelp}>
          <CircleHelp className="size-4" aria-hidden="true" />
          Trợ giúp
        </Button>
      </div>
    </header>
  );
}
