'use client';

import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';

import {
  SANDBOX_SCENARIOS,
  SANDBOX_SCENARIO_LABEL,
  createGitSession,
  emptyDraft,
  exportSandboxJson,
  importSandboxJson,
  layoutDag,
  sandboxLevel,
  sandboxSpec,
  withOrigin,
  withoutOrigin,
  worldToSpec,
  type GitEngineSession,
  type GitLevel,
  type LevelDraft,
  type SandboxScenario,
  type WorldSpec,
} from '@devops-platform/games';

import { t } from '@devops-platform/copy';
import { GitLevelBuilder } from './builder/git-builder';
import { CommandBar, OutputLog } from './git-console';
import { ArrowLeft, FlaskConical, Hammer, Terminal } from 'lucide-react';
import { GitMapStage } from './git-map-stage';
import './git-odyssey.css';
import { buildSceneLayouts, type SceneView } from '../shared/scene-props';

/**
 * §17.Q — màn **sandbox**: kho tự do, không mục tiêu, không chấm.
 *
 * Năm thao tác plan đòi: đặt lại · hoàn tác từng bước · nhập/xuất cây JSON ·
 * bật/tắt `origin` · chọn kịch bản khởi tạo. Bốn thứ đầu là nút; cái cuối là
 * một `select`.
 *
 * ⛔ **Không hiện ô kết quả.** `sandboxLevel` khai `objectives: []`, và
 * `verdictOf` trên mảng rỗng trả "đạt" — nên một ô kết quả ở đây sẽ vĩnh viễn
 * nói "AC (0/0)", tức nói dối một cách trông rất hợp lệ.
 *
 * ⛔ **0 lời gọi backend** (AC-2) cũng áp cho màn này: xuất là `JSON.stringify`
 * tại chỗ, nhập là `JSON.parse` tại chỗ. Không đường nào chạm mạng.
 *
 * ⚠ Đổi spec (kịch bản / origin / nhập file) **dựng lại phiên**, và dựng lại
 * phiên **xoá ngăn xếp hoàn tác**. Đó là hành vi đúng — undo qua một lần thay
 * cả thế giới thì hoàn về đâu? — nhưng nó phải được nói ra trên màn, nếu không
 * người dùng sẽ tưởng Ctrl+Z hỏng.
 */

export interface GitSandboxProps {
  readonly onExit: () => void;
  /**
   * Bản nháp của Level Builder (§18.E). `null` = chưa mở Builder lần nào.
   *
   * ⚠ State NÂNG LÊN `GitGame` chứ không giữ ở đây, và lý do nằm ở E.6: "chơi
   * thử" thay màn sandbox bằng `GitLevelScreen`, nên component này **unmount** và
   * mọi state của nó biến mất. Khối chú thích ở `git-game.tsx` ghi đủ.
   */
  readonly draft: LevelDraft | null;
  readonly onDraftChange: (next: LevelDraft) => void;
  readonly builderOpen: boolean;
  readonly onBuilderOpenChange: (open: boolean) => void;
  readonly onPlayTest: (level: GitLevel) => void;
}

export function GitSandbox({
  onExit,
  draft,
  onDraftChange,
  builderOpen,
  onBuilderOpenChange,
  onPlayTest,
}: GitSandboxProps): ReactElement {
  const [scenario, setScenario] = useState<SandboxScenario>('kho-roi');
  const [spec, setSpec] = useState<WorldSpec>(() => sandboxSpec('kho-roi'));
  const [problem, setProblem] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );

  /*
   * `generation` là thứ DUY NHẤT quyết định khi nào dựng lại phiên.
   *
   * So `spec` bằng tham chiếu thì "Đặt lại" (spec không đổi) sẽ chẳng làm gì cả;
   * so sâu thì mỗi lần render phải duyệt cả cây. Một bộ đếm tăng ở đúng bốn chỗ
   * là cách nói thẳng ý định.
   */
  const [generation, setGeneration] = useState(0);
  const sessionRef = useRef<{ gen: number; session: GitEngineSession } | null>(null);
  if (sessionRef.current === null || sessionRef.current.gen !== generation) {
    sessionRef.current = {
      gen: generation,
      session: createGitSession({ level: sandboxLevel(spec) }),
    };
  }
  const session = sessionRef.current.session;

  const [tick, setTick] = useState(0);
  const redraw = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  const rebuild = useCallback((next: WorldSpec) => {
    setSelected(null);
    setHovered(null);
    setFeedback(null);
    setSpec(next);
    setProblem(null);
    setGeneration((g) => g + 1);
  }, []);

  const undo = useCallback(() => {
    session.undo();
    redraw();
  }, [session, redraw]);

  const world = session.getWorld();
  // ⚠ `getView()` chứ không `buildView(world)` — xem khối giải thích ở
  // `git-game.tsx`. Dựng lại từ `world` vứt mất `ViewHints`, và ba accent
  // (`fresh`, `duplicate`, `conflicted`) không còn đường nào hiện ra.
  const view = session.getView();
  const sceneView = view as unknown as SceneView;
  const layouts = useMemo(() => buildSceneLayouts(sceneView, layoutDag), [sceneView]);

  const hasOrigin = spec.origin !== undefined;
  // KHÔNG lưu "bật được hay không" — nó suy ra từ spec, và một bản sao được lưu
  // là một bản sao sẽ lệch.
  const canEnableOrigin = useMemo(() => withOrigin(spec) !== null, [spec]);

  const exported = exportSandboxJson(world, 1);

  const toggleOrigin = useCallback(() => {
    if (hasOrigin) {
      rebuild(withoutOrigin(spec));
      return;
    }
    const next = withOrigin(spec);
    if (next === null) {
      setProblem(t('games.git.sandbox.origin-empty'));
      return;
    }
    rebuild(next);
  }, [hasOrigin, spec, rebuild]);

  const doImport = useCallback(() => {
    const parsed = importSandboxJson(importText);
    if (parsed === null) {
      setProblem(t('games.git.sandbox.import-bad'));
      return;
    }
    // Đi qua `worldToSpec` chứ không giữ thẳng `GitWorld`: phiên dựng từ
    // `WorldSpec`, và vòng world → spec → world chính là vòng AC-Q đo.
    rebuild(worldToSpec(parsed));
    setImportText('');
  }, [importText, rebuild]);

  // Chụp lúc BẤM, không chụp lúc render — xem `GitLevelBuilderProps.captureSpec`.
  const captureSpec = useCallback((): WorldSpec => worldToSpec(session.getWorld()), [session]);

  /*
   * ⚠ ĐÓNG/MỞ là một biến RIÊNG, không phải `draft === null`.
   *
   * Gộp hai thứ vào một biến rẻ hơn một dòng và biến một lần bấm nhầm thành xoá
   * sạch đề bài đang soạn: không hỏi lại, không hoàn tác được. Nên đóng bảng là
   * ẩn đi, và bản nháp ở lại.
   */
  const toggleBuilder = useCallback(() => {
    if (draft === null) onDraftChange(emptyDraft(worldToSpec(session.getWorld())));
    onBuilderOpenChange(!builderOpen);
  }, [draft, onDraftChange, builderOpen, onBuilderOpenChange, session]);

  return (
    <div className="git-odyssey git-play-screen git-sandbox" data-chapter="2">
      <header className="git-play-header">
        <button type="button" onClick={onExit} className="git-button">
          <ArrowLeft size={16} aria-hidden="true" /> {t('games.git.sandbox.back')}
        </button>
        <div className="git-play-title">
          <p className="git-eyebrow">
            <span className="git-line-code">GIT</span> {t('games.git.sandbox.kicker')}
          </p>
          <h1>{t('games.git.sandbox.title')}</h1>
        </div>
        <span className="ml-auto">
          <SandboxButton onClick={toggleBuilder}>
            {builderOpen ? t('games.git.sandbox.builder-close') : t('games.git.sandbox.builder-open')}
          </SandboxButton>
        </span>
      </header>

      <div className="git-mission-strip">
        <FlaskConical size={16} />
        <p>
          {t('games.git.sandbox.strip')}
        </p>
        <span>{t('games.git.sandbox.mode')}</span>
      </div>
      <div className="git-play-body">
        <div className="git-play-world">
          <GitMapStage
            key={generation}
            revision={tick}
            feedback={feedback}
            scene={{
              view: sceneView,
              layouts,
              interaction: {
                selectedId: selected,
                hoveredId: hovered,
                onSelect: setSelected,
                onHover: setHovered,
              },
              label: t('games.git.sandbox.scene-label'),
            }}
          />
        </div>

        <aside
          className={
            builderOpen
              ? 'git-side-panel git-builder-panel git-sandbox-tools git-builder-open'
              : 'git-side-panel git-builder-panel git-sandbox-tools'
          }
          /*
           * Tên của landmark `complementary`. Vỏ ứng dụng cũng dựng một
           * `<aside>` (`app-shell.tsx`), nên hai cái cùng vô danh là vi phạm
           * `landmark-unique` của axe. `shell.sidebar.aria` đã đặt tên cho cái
           * kia và một mình nó đủ để cổng xanh; cái tên ở đây là để người dùng
           * trình đọc màn hình nghe được panel này LÀ gì, chứ không phải nghe
           * "complementary" trống không.
           *
           * Chuỗi viết thẳng, không qua `t()`: cây `components/games/git` chưa
           * có surface copy nào và nằm ngoài vùng quét của
           * `ui-source-coverage.test.ts`; cả file này đang viết thẳng mọi nhãn
           * (`aria-label="Đồ thị commit của sandbox"` ngay phía trên). Nhét nó
           * vào surface `shell.` sẽ là copy của trò chơi nằm trong bản đồ của
           * vỏ ứng dụng — chính thứ đầu file `surfaces/shell.ts` cấm.
           */
          aria-label={t('games.git.sandbox.panel-aria')}
          data-testid="git-sandbox-panel"
        >
          <div className="git-builder-heading">
            <Hammer size={23} />
            <span>
              <strong>{builderOpen ? t('games.git.sandbox.panel-builder') : t('games.git.sandbox.panel-lab')}</strong>
              <small>
                {builderOpen
                  ? t('games.git.sandbox.panel-builder-sub')
                  : t('games.git.sandbox.panel-lab-sub')}
              </small>
            </span>
          </div>
          {builderOpen && draft !== null && (
            <GitLevelBuilder
              captureSpec={captureSpec}
              draft={draft}
              onDraftChange={onDraftChange}
              onPlayTest={onPlayTest}
            />
          )}

          <section aria-labelledby="sandbox-kich-ban">
            <h2 id="sandbox-kich-ban" className="mb-2 text-sm font-semibold text-foreground">
              {t('games.git.sandbox.scenario')}
            </h2>
            <label htmlFor="sandbox-scenario" className="sr-only">
              {t('games.git.sandbox.scenario-select')}
            </label>
            <select
              id="sandbox-scenario"
              value={scenario}
              onChange={(e) => {
                const next = e.target.value as SandboxScenario;
                setScenario(next);
                rebuild(sandboxSpec(next));
              }}
              className="w-full border border-input bg-card px-3 py-2 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {SANDBOX_SCENARIOS.map((s) => (
                <option key={s} value={s}>
                  {SANDBOX_SCENARIO_LABEL[s]}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('games.git.sandbox.rebuild-note')}
            </p>
          </section>

          <section aria-labelledby="sandbox-thao-tac" className="flex flex-col gap-2">
            <h2 id="sandbox-thao-tac" className="text-sm font-semibold text-foreground">
              {t('games.git.sandbox.actions')}
            </h2>
            <div className="flex flex-wrap gap-2">
              <SandboxButton
                onClick={() => {
                  rebuild(spec);
                }}
              >
                {t('games.git.sandbox.reset')}
              </SandboxButton>
              <SandboxButton onClick={undo}>{t('games.git.sandbox.undo')}</SandboxButton>
              <SandboxButton onClick={toggleOrigin} disabled={!hasOrigin && !canEnableOrigin}>
                {hasOrigin ? t('games.git.sandbox.origin-off') : t('games.git.sandbox.origin-on')}
              </SandboxButton>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="git-sandbox-origin-state">
              {hasOrigin ? t('games.git.sandbox.origin-state-on') : t('games.git.sandbox.origin-state-off')}
            </p>
          </section>

          <section aria-labelledby="sandbox-xuat">
            <h2 id="sandbox-xuat" className="mb-2 text-sm font-semibold text-foreground">
              {t('games.git.sandbox.export')}
            </h2>
            <label htmlFor="sandbox-export" className="sr-only">
              {t('games.git.sandbox.export-aria')}
            </label>
            <textarea
              id="sandbox-export"
              data-testid="git-sandbox-export"
              readOnly
              rows={6}
              value={exported}
              className="w-full border border-input bg-muted p-2 font-mono text-[10px] text-muted-foreground"
            />
          </section>

          <section aria-labelledby="sandbox-nhap">
            <h2 id="sandbox-nhap" className="mb-2 text-sm font-semibold text-foreground">
              {t('games.git.sandbox.import')}
            </h2>
            <label htmlFor="sandbox-import" className="sr-only">
              {t('games.git.sandbox.import-aria')}
            </label>
            <textarea
              id="sandbox-import"
              data-testid="git-sandbox-import"
              rows={4}
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
              }}
              placeholder={t('games.git.sandbox.import-placeholder')}
              className="w-full border border-input bg-card p-2 font-mono text-[10px] text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <div className="mt-2">
              <SandboxButton onClick={doImport} disabled={importText.trim().length === 0}>
                {t('games.git.sandbox.import-run')}
              </SandboxButton>
            </div>
            {problem !== null && (
              <p
                role="alert"
                data-testid="git-sandbox-problem"
                className="mt-2 text-xs text-destructive"
              >
                {problem}
              </p>
            )}
          </section>
        </aside>
      </div>

      <div className="git-terminal">
        <header>
          <span>
            <Terminal size={14} aria-hidden="true" /> {t('games.git.play.terminal')} <small>~/sandbox</small>
          </span>
          <span>{t('games.git.play.moves', { n: session.getStatus().movesUsed })}</span>
        </header>
        <OutputLog output={session.getOutput()} />
        <CommandBar
          onSubmit={(command) => {
            const outcome = session.run(command);
            setFeedback({
              tone: outcome.result.error ? 'error' : 'success',
              text: outcome.result.error
                ? t('games.git.play.ran-error')
                : t('games.git.play.ran', { command }),
            });
            redraw();
          }}
          onUndo={undo}
        />
      </div>
    </div>
  );
}

function SandboxButton({
  children,
  onClick,
  disabled,
}: {
  readonly children: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}): ReactElement {
  return (
    <button type="button" onClick={onClick} disabled={disabled ?? false} className="git-button">
      {children}
    </button>
  );
}
