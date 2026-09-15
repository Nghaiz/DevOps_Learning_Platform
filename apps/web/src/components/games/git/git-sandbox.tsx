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

import { GitLevelBuilder } from './builder/git-builder';
import { CommandBar, OutputLog } from './git-console';
import { GitSvgScene } from './git-svg-scene';
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

  const [, setTick] = useState(0);
  const redraw = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  const rebuild = useCallback((next: WorldSpec) => {
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
      setProblem('Kho chưa có commit nào nên origin không có gì để trỏ vào. Tạo một commit trước.');
      return;
    }
    rebuild(next);
  }, [hasOrigin, spec, rebuild]);

  const doImport = useCallback(() => {
    const parsed = importSandboxJson(importText);
    if (parsed === null) {
      setProblem('Không đọc được chuỗi này. Nó phải là một bản xuất của chính màn sandbox.');
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
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-input px-4 py-2">
        <button
          type="button"
          onClick={onExit}
          className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          ← Danh sách level
        </button>
        <span className="text-sm font-medium text-foreground">Sandbox · kho tự do</span>
        <span className="ml-auto">
          <SandboxButton onClick={toggleBuilder}>
            {builderOpen ? 'Đóng Level Builder' : 'Mở Level Builder'}
          </SandboxButton>
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <GitSvgScene
            view={sceneView}
            layouts={layouts}
            interaction={{
              selectedId: null,
              hoveredId: null,
              onSelect: () => undefined,
              onHover: () => undefined,
            }}
            label="Đồ thị commit của sandbox"
          />
        </div>

        <aside
          className={
            builderOpen
              ? 'flex w-full shrink-0 flex-col gap-4 overflow-auto border-t border-input p-4 lg:w-md lg:border-t-0 lg:border-l'
              : 'flex w-full shrink-0 flex-col gap-4 border-t border-input p-4 lg:w-96 lg:border-t-0 lg:border-l'
          }
          data-testid="git-sandbox-panel"
        >
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
              Kịch bản khởi tạo
            </h2>
            <label htmlFor="sandbox-scenario" className="sr-only">
              Chọn kịch bản khởi tạo
            </label>
            <select
              id="sandbox-scenario"
              value={scenario}
              onChange={(e) => {
                const next = e.target.value as SandboxScenario;
                setScenario(next);
                rebuild(sandboxSpec(next));
              }}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {SANDBOX_SCENARIOS.map((s) => (
                <option key={s} value={s}>
                  {SANDBOX_SCENARIO_LABEL[s]}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">
              Đổi kịch bản, bật/tắt origin, hay nhập một cây đều dựng lại kho — và việc đó xoá
              ngăn xếp hoàn tác.
            </p>
          </section>

          <section aria-labelledby="sandbox-thao-tac" className="flex flex-col gap-2">
            <h2 id="sandbox-thao-tac" className="text-sm font-semibold text-foreground">
              Thao tác
            </h2>
            <div className="flex flex-wrap gap-2">
              <SandboxButton
                onClick={() => {
                  rebuild(spec);
                }}
              >
                Đặt lại
              </SandboxButton>
              <SandboxButton onClick={undo}>Hoàn tác một bước</SandboxButton>
              <SandboxButton onClick={toggleOrigin} disabled={!hasOrigin && !canEnableOrigin}>
                {hasOrigin ? 'Tắt origin' : 'Bật origin'}
              </SandboxButton>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="git-sandbox-origin-state">
              origin: {hasOrigin ? 'đang bật' : 'đang tắt'}
            </p>
          </section>

          <section aria-labelledby="sandbox-xuat">
            <h2 id="sandbox-xuat" className="mb-2 text-sm font-semibold text-foreground">
              Xuất cây
            </h2>
            <label htmlFor="sandbox-export" className="sr-only">
              Chuỗi JSON của cây hiện tại
            </label>
            <textarea
              id="sandbox-export"
              data-testid="git-sandbox-export"
              readOnly
              rows={6}
              value={exported}
              className="w-full rounded-md border border-input bg-muted p-2 font-mono text-[10px] text-muted-foreground"
            />
          </section>

          <section aria-labelledby="sandbox-nhap">
            <h2 id="sandbox-nhap" className="mb-2 text-sm font-semibold text-foreground">
              Nhập cây
            </h2>
            <label htmlFor="sandbox-import" className="sr-only">
              Dán chuỗi JSON của một cây đã xuất
            </label>
            <textarea
              id="sandbox-import"
              data-testid="git-sandbox-import"
              rows={4}
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
              }}
              placeholder="Dán chuỗi đã xuất vào đây"
              className="w-full rounded-md border border-input bg-card p-2 font-mono text-[10px] text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <div className="mt-2">
              <SandboxButton onClick={doImport} disabled={importText.trim().length === 0}>
                Nhập
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

      <div className="border-t border-input">
        <OutputLog output={session.getOutput()} />
        <CommandBar
          onSubmit={(command) => {
            session.run(command);
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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled ?? false}
      className="rounded-md border border-input px-3 py-1.5 text-xs text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
