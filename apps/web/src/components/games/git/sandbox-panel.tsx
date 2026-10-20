'use client';

import type { ReactElement, ReactNode } from 'react';

import { t } from '@devops-platform/copy';
import { Button, cn, Icon, NativeSelect, Textarea } from '@devops-platform/ds';
import {
  SANDBOX_SCENARIOS,
  SANDBOX_SCENARIO_LABEL,
  type GitLevel,
  type LevelDraft,
  type SandboxScenario,
  type WorldSpec,
} from '@devops-platform/games';

import { GitLevelBuilder } from './builder/git-builder';

export interface SandboxPanelProps {
  readonly builderOpen: boolean;
  readonly draft: LevelDraft | null;
  readonly onDraftChange: (next: LevelDraft) => void;
  readonly onPlayTest: (level: GitLevel) => void;
  /** Chụp kho lúc BẤM, không lúc render — xem `GitLevelBuilderProps.captureSpec`. */
  readonly captureSpec: () => WorldSpec;
  readonly scenario: SandboxScenario;
  readonly onScenarioChange: (next: SandboxScenario) => void;
  readonly onReset: () => void;
  readonly onUndo: () => void;
  readonly hasOrigin: boolean;
  readonly canEnableOrigin: boolean;
  readonly onToggleOrigin: () => void;
  readonly exported: string;
  readonly importText: string;
  readonly onImportTextChange: (next: string) => void;
  readonly onImport: () => void;
  readonly problem: string | null;
}

/**
 * Bảng bên của sandbox Git: Level Builder và công cụ kho (kịch bản, đặt lại, hoàn tác, origin,
 * xuất và nhập cây).
 *
 * Màn sandbox giữ giao diện cũ (`git-odyssey.css`, bọc trong `LegacySkin`), còn bảng này là giao
 * diện MỚI. `.ds-island` (packages/ds/src/styles/theme.css) lấy lại font, thang chữ, bo góc và bảng
 * màu của hệ ds mà `.legacy-skin` khai đè. Thiếu nó thì ở theme sáng chữ ds màu tối nằm trên nền
 * xanh đậm của màn chơi, gần như không đọc được (đo 2026-10-20).
 *
 * `relative` không phải trang trí: bảng là vùng cuộn, và một nhãn `sr-only` (`position: absolute`)
 * bên trong mà không có tổ tiên định vị sẽ thoát khỏi vùng cuộn, kéo trang dài thêm hàng nghìn
 * pixel trống (đo cùng ngày: tài liệu cao 6977px cho nội dung 1051px).
 *
 * Nhãn, `id` và `data-testid` giữ đúng bản trước: `games-git-sandbox.spec.ts` chọn kịch bản bằng
 * `getByLabel('Chọn kịch bản khởi tạo')` và bấm nút theo tên.
 */
export function SandboxPanel(props: SandboxPanelProps): ReactElement {
  const { builderOpen, draft, hasOrigin } = props;
  return (
    <aside
      aria-label={t('games.git.sandbox.panel-aria')}
      data-testid="git-sandbox-panel"
      className={cn(
        'ds-island relative flex min-h-0 w-full shrink-0 flex-col gap-7 overflow-y-auto border-t border-rule bg-paper px-5 py-6',
        'max-[800px]:max-h-[520px] min-[801px]:border-t-0 min-[801px]:border-l',
        builderOpen
          ? 'min-[801px]:w-[430px]'
          : 'min-[801px]:w-[310px] min-[1101px]:w-[350px] min-[1600px]:w-[390px]',
      )}
    >
      <header className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center bg-acc-tint text-acc-ink">
          <Icon name={builderOpen ? 'pen' : 'sandbox'} size={20} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-display text-base font-semibold text-ink">
            {builderOpen ? t('games.git.sandbox.panel-builder') : t('games.git.sandbox.panel-lab')}
          </p>
          <p className="text-xs text-ink-2">
            {builderOpen ? t('games.git.sandbox.panel-builder-sub') : t('games.git.sandbox.panel-lab-sub')}
          </p>
        </div>
      </header>

      {builderOpen && draft !== null ? (
        <GitLevelBuilder
          captureSpec={props.captureSpec}
          draft={draft}
          onDraftChange={props.onDraftChange}
          onPlayTest={props.onPlayTest}
        />
      ) : null}

      <ToolSection id="sandbox-kich-ban" title={t('games.git.sandbox.scenario')}>
        <label htmlFor="sandbox-scenario" className="sr-only">
          {t('games.git.sandbox.scenario-select')}
        </label>
        <NativeSelect
          id="sandbox-scenario"
          value={props.scenario}
          onChange={(e) => {
            props.onScenarioChange(e.target.value as SandboxScenario);
          }}
        >
          {SANDBOX_SCENARIOS.map((s) => (
            <option key={s} value={s}>
              {SANDBOX_SCENARIO_LABEL[s]}
            </option>
          ))}
        </NativeSelect>
        <p className="text-xs leading-relaxed text-ink-2">{t('games.git.sandbox.rebuild-note')}</p>
      </ToolSection>

      <ToolSection id="sandbox-thao-tac" title={t('games.git.sandbox.actions')}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon="refresh" onClick={props.onReset}>
            {t('games.git.sandbox.reset')}
          </Button>
          <Button size="sm" icon="undo" onClick={props.onUndo}>
            {t('games.git.sandbox.undo')}
          </Button>
          <Button
            size="sm"
            icon={hasOrigin ? 'unplug' : 'plug'}
            onClick={props.onToggleOrigin}
            disabled={!hasOrigin && !props.canEnableOrigin}
          >
            {hasOrigin ? t('games.git.sandbox.origin-off') : t('games.git.sandbox.origin-on')}
          </Button>
        </div>
        <p className="text-xs text-ink-2" data-testid="git-sandbox-origin-state">
          {hasOrigin ? t('games.git.sandbox.origin-state-on') : t('games.git.sandbox.origin-state-off')}
        </p>
      </ToolSection>

      <ToolSection id="sandbox-xuat" title={t('games.git.sandbox.export')}>
        <label htmlFor="sandbox-export" className="sr-only">
          {t('games.git.sandbox.export-aria')}
        </label>
        <Textarea
          id="sandbox-export"
          data-testid="git-sandbox-export"
          readOnly
          mono
          rows={6}
          value={props.exported}
          className="min-h-0 resize-y bg-well text-xs text-ink-2"
        />
      </ToolSection>

      <ToolSection id="sandbox-nhap" title={t('games.git.sandbox.import')}>
        <label htmlFor="sandbox-import" className="sr-only">
          {t('games.git.sandbox.import-aria')}
        </label>
        <Textarea
          id="sandbox-import"
          data-testid="git-sandbox-import"
          mono
          rows={4}
          value={props.importText}
          onChange={(e) => {
            props.onImportTextChange(e.target.value);
          }}
          placeholder={t('games.git.sandbox.import-placeholder')}
          className="min-h-0 resize-y text-xs"
        />
        <div>
          <Button
            size="sm"
            icon="upload"
            onClick={props.onImport}
            disabled={props.importText.trim().length === 0}
          >
            {t('games.git.sandbox.import-run')}
          </Button>
        </div>
        {props.problem === null ? null : (
          <p role="alert" data-testid="git-sandbox-problem" className="flex items-start gap-1.5 text-xs text-bad-ink">
            <Icon name="warning" size={16} className="shrink-0" />
            {props.problem}
          </p>
        )}
      </ToolSection>
    </aside>
  );
}

function ToolSection({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5 border-t border-rule pt-5">
      <h2 id={id} className="text-sm font-semibold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}
