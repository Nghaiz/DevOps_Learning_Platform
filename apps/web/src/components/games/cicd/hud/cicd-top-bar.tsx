'use client';

/**
 * Thanh trên cùng của sân chơi CI/CD (19.D.4.2 + D.4.4), khối mực của hệ PTIT.
 *
 * Mượn vai trò của `k8s-arena/hud/top-bar.tsx` (quyết định #2), không chép bảng
 * props: thanh này chở đúng thứ game này có: chương/màn, nút chạy, chế độ vẽ,
 * bậc chất lượng, các công tắc lớp phủ, và trợ giúp.
 *
 * ⚠ **Chiều cao thanh là một hợp đồng bố cục**, không phải trang trí: sân chơi
 * neo ngay dưới nó (`CICD_FIELD_TOP_OFFSET`), và AC-D7 đo `boundingBox()` của
 * sân. Hai hằng chứ không một phép tính, vì Tailwind quét chuỗi lớp NGUYÊN VẸN
 * và không sinh được `top-${n}` từ một con số.
 *
 * Công tắc đang bật = khối vàng tín hiệu (không phải viền), chế độ vẽ đang chạy =
 * khối đỏ: trạng thái đọc ra bằng HÌNH khối, và `aria-pressed` nói nó bằng lời.
 */

import type { ReactElement } from 'react';
import { CircleHelp, LogOut, Play } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { Button, cn } from '@devops-platform/ui';

import type { RendererMode, ResolvedMode } from '../../shared/renderer-mode';
import { rendererModeReasonText } from '../../shared/renderer-mode';
import type { CicdPanelId, CicdPanelState } from './use-hud-panels';

export const CICD_TOP_BAR_HEIGHT = 'h-14';
export const CICD_FIELD_TOP_OFFSET = 'top-14';

/** Bậc chất lượng cảnh 3D. Hình dạng do `scene3d/` khai (`CicdScene3dProps`). */
export type CicdQualityTier = 'low' | 'medium' | 'high';

const QUALITY_LABEL: Readonly<Record<CicdQualityTier, string>> = {
  low: t('games.cicd.quality.low'),
  medium: t('games.cicd.quality.medium'),
  high: t('games.cicd.quality.high'),
};

const PANEL_LABEL: Readonly<Record<CicdPanelId, string>> = {
  editor: t('games.cicd.panel.editor'),
  mission: t('games.cicd.panel.mission'),
  inspector: t('games.cicd.panel.inspector'),
  result: t('games.cicd.panel.result'),
  tools: t('games.cicd.panel.tools'),
  learn: t('games.cicd.panel.learn'),
  minimap: t('games.cicd.panel.minimap'),
};

const ON_INK_GHOST = 'text-ink-foreground hover:bg-ink-foreground/10 hover:text-ink-foreground';

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
        'pointer-events-auto absolute inset-x-0 top-0 z-30 flex items-center gap-3 overflow-x-auto bg-ink px-3 text-ink-foreground',
        CICD_TOP_BAR_HEIGHT,
      )}
      aria-label={t('games.cicd.hud.bar-aria')}
    >
      <Button variant="ghost" size="sm" onClick={onExit} className={ON_INK_GHOST}>
        <LogOut className="size-4 rotate-180" aria-hidden="true" />
        {t('games.cicd.hud.exit')}
      </Button>

      <span aria-hidden="true" className="h-8 w-1.5 shrink-0 bg-line-cicd" />

      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-display text-[0.95rem] font-bold">{title}</span>
        <span className="font-mono text-[0.65rem] tracking-[0.08em] text-ink-foreground/70 uppercase">
          {t('games.cicd.hud.chapter', { id: levelId, chapter: chapter === 'cd' ? 'CD' : 'CI' })}
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button size="sm" onClick={onRun} iconLeft={<Play className="size-4" aria-hidden="true" />}>
          {t('games.cicd.hud.run')}
        </Button>

        {onNext === undefined ? null : (
          <Button variant="outline" size="sm" onClick={onNext} className="border-ink-foreground/60 text-ink-foreground hover:bg-ink-foreground/10">
            {t('games.cicd.hud.next')}
          </Button>
        )}

        {/*
         * Nút 2D/3D. `aria-pressed` chứ không `aria-selected`: đây là hai công
         * tắc, không phải một tab-list. Nhãn nói CHẾ ĐỘ, `title` nói VÌ SAO
         * (`rendererModeReasonText`): "2D vì bạn chọn" và "2D vì máy không chạy
         * nổi 3D" trông y hệt nhau mà đòi hai câu khác hẳn nhau.
         */}
        <div
          className="flex items-center border border-ink-foreground/30"
          role="group"
          aria-label={t('games.cicd.hud.mode-group')}
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
                'h-8 min-w-9 px-2 font-mono text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                resolved.mode === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-ink-foreground/75 hover:bg-ink-foreground/10 hover:text-ink-foreground',
              )}
            >
              {mode === '2d' ? '2D' : '3D'}
            </button>
          ))}
        </div>

        {/* Bậc chất lượng chỉ có nghĩa ở 3D: ở 2D nó là một núm không làm gì. */}
        {resolved.mode === '3d' ? (
          <label className="flex items-center gap-1.5 font-mono text-xs text-ink-foreground/75">
            {t('games.cicd.hud.quality')}
            <select
              value={quality}
              aria-label={t('games.cicd.quality.aria')}
              onChange={(event) => {
                onQuality(event.target.value as CicdQualityTier);
              }}
              className="h-8 border border-ink-foreground/30 bg-ink px-1 text-xs text-ink-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {(['low', 'medium', 'high'] as const).map((tier) => (
                <option key={tier} value={tier}>
                  {QUALITY_LABEL[tier]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-1" role="group" aria-label={t('games.cicd.hud.overlays')}>
          {panelIds.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={panels[id]}
              onClick={() => {
                onTogglePanel(id);
              }}
              className={cn(
                'h-8 px-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-safe:active:translate-y-px',
                panels[id]
                  ? 'bg-signal text-signal-foreground'
                  : 'text-ink-foreground/75 hover:bg-ink-foreground/10 hover:text-ink-foreground',
              )}
            >
              {PANEL_LABEL[id]}
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={onCloseAllPanels} className={ON_INK_GHOST}>
            {t('games.cicd.hud.close-all')}
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onHelp}
          className={ON_INK_GHOST}
          iconLeft={<CircleHelp className="size-4" aria-hidden="true" />}
        >
          {t('games.cicd.hud.help')}
        </Button>
      </div>
    </header>
  );
}
