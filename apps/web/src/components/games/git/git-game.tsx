'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';

import {
  GIT_LEVELS,
  buildView,
  createGitSession,
  evaluateObjectives,
  layoutDag,
  verdictOf,
  type GitEngineSession,
  type GitLevel,
  type TheoryDoc,
} from '@devops-platform/games';

import { CommandBar, OutputLog } from './git-console';
import { GitSandbox } from './git-sandbox';
import { GitSvgScene } from './git-svg-scene';
import { ModeToggle } from './mode-toggle';
import { buildSceneLayouts, type SceneView } from '../shared/scene-props';
import {
  readStoredMode,
  resolveRendererMode,
  writeStoredMode,
  type RendererMode,
  type ResolvedMode,
} from '../shared/renderer-mode';
import { detectWebgl2 } from '../shared/webgl-detect';

/**
 * Màn chơi của **Phòng thí nghiệm Git** — 17.L (HUD) nối với 17.R (route).
 *
 * Bốn quyết định bố cục, lấy nguyên từ design §3.6:
 *
 *  1. **Ô lệnh dưới cùng, rộng hết chiều ngang.** Nhập liệu là hoạt động chính
 *     (quyết định #7 của design doc: "gõ lệnh thật là chính, 3D là màn hình
 *     quan sát"), nên nó không được là một ô nhỏ ở góc.
 *  2. **Danh sách ref 2D thường trực.** VR-Git dù ở trong VR vẫn phải kèm một
 *     bảng 2D; đây là thứ người chơi liếc vào khi quên mình đang ở đâu.
 *  3. **Mục tiêu = testcase, hiện ngay.** Người chơi luôn thấy còn thiếu gì, và
 *     khi nộp bài OJ ở P18 thì đây chính là danh sách testcase.
 *  4. **Nút [2D]/[3D] ở thanh trên, không giấu trong cài đặt.** Chế độ ngang
 *     hàng thì phải trông ngang hàng.
 *
 * ⛔ **0 lời gọi backend trong lúc chơi** (AC-2). Không `fetch`, không tRPC,
 * không `useEffect` gọi mạng ở file này hay ở bất cứ thứ gì nó nạp. Bài lý
 * thuyết đi cùng payload của trang; engine chạy hoàn toàn trong bộ nhớ.
 */

export interface GitGameProps {
  /** 32 bài lý thuyết, đọc ở server. Xem `server/games/git-theory.ts`. */
  readonly theory: readonly TheoryDoc[];
  /** Level mở sẵn. `null` = hiện màn chọn level. */
  readonly initialLevelId: string | null;
}

export function GitGame({ theory, initialLevelId }: GitGameProps): ReactElement {
  const [levelId, setLevelId] = useState<string | null>(initialLevelId);
  const [sandbox, setSandbox] = useState(false);
  const level = useMemo(
    () => GIT_LEVELS.find((l) => l.id === levelId) ?? null,
    [levelId],
  );

  if (sandbox) {
    return (
      <GitSandbox
        onExit={() => {
          setSandbox(false);
        }}
      />
    );
  }
  if (level === null) {
    return (
      <LevelPicker
        onPick={setLevelId}
        onSandbox={() => {
          setSandbox(true);
        }}
      />
    );
  }
  return (
    <GitLevelScreen
      key={level.id}
      level={level}
      theory={theory.find((d) => d.frontmatter.id === level.theoryId) ?? null}
      onExit={() => {
        setLevelId(null);
      }}
    />
  );
}

/**
 * Chế độ renderer, đọc một lần lúc mount.
 *
 * ⚠ Phép dò WebGL2 và `localStorage` **chỉ chạy trong `useState` khởi tạo lười**,
 * không chạy ở thân component. Hai lý do:
 *
 *  1. Cả hai không tồn tại lúc server render. Gọi thẳng sẽ ném ở SSR.
 *  2. Gọi lại ở mỗi lần render sẽ dựng một `<canvas>` mới mỗi lượt vẽ, và trang
 *     này vẽ lại sau mỗi lệnh người chơi gõ.
 *
 * Trạng thái `'unknown'` của bộ dò được truyền thẳng xuống chứ không gộp vào
 * `'unavailable'`: gộp lại sẽ làm trang nháy chế độ lúc hydrate, và nó xoá mất
 * sự khác nhau giữa "máy không chạy nổi 3D" với "chưa đo được".
 */
const ENABLED_MODES: readonly RendererMode[] = ['2d', '3d'];

/**
 * Tầng 3D nạp động, `ssr: false`.
 *
 * ⚠ Cả hai vế đều bắt buộc. `ssr: false` vì `three` đụng `window`/`canvas` lúc
 * dựng; **nạp động** vì gói 3D nặng ~631KB và một `import` tĩnh sẽ kéo nó vào
 * bundle của mọi người chơi, kể cả người ở chế độ 2D và kể cả người chưa từng
 * mở game. P17 đã trả giá đúng chỗ này một lần (`44f8e39`), và cổng CI
 * `bundle:check` gác nó.
 */
const GitScene3D = dynamic(() => import('./scene3d/index.ts').then((m) => m.GitScene3D), {
  ssr: false,
  loading: () => (
    <p className="p-4 text-sm text-muted-foreground" role="status">
      Đang nạp cảnh 3D…
    </p>
  ),
});

function useRendererChoice(): {
  readonly resolved: ResolvedMode;
  readonly setMode: (mode: RendererMode) => void;
} {
  const [stored, setStored] = useState<RendererMode | null>(() =>
    typeof window === 'undefined' ? null : readStoredMode(),
  );
  const [support] = useState(() =>
    typeof document === 'undefined' ? ('unknown' as const) : detectWebgl2(),
  );

  const resolved = resolveRendererMode({
    stored,
    support,
    // 17.K đã xong ở P17b. Đây là chỗ duy nhất phải đổi, đúng như bản ghi đóng
    // chặng P17 dự trù.
    has3d: true,
    // Mặc định vẫn là 2D dù máy chạy được 3D. Chế độ 2D là NGANG HÀNG chứ không
    // phải đường lùi (ràng buộc 3 của chặng), nó nạp ngay và không tốn 631KB;
    // ai muốn 3D thì bấm một lần và lựa chọn đó được nhớ.
    fallback: '2d',
  });

  const setMode = useCallback((mode: RendererMode) => {
    writeStoredMode(mode);
    setStored(mode);
  }, []);

  return { resolved, setMode };
}

// ═══════════════════════════════════════════════════════════════════════════
// Màn chọn level
// ═══════════════════════════════════════════════════════════════════════════

const CHAPTER_TITLE: Record<1 | 2 | 3, string> = {
  1: 'Chương 1 · Nắn lịch sử',
  2: 'Chương 2 · Làm việc nhóm',
  3: 'Chương 3 · Cứu hộ',
};

function LevelPicker({
  onPick,
  onSandbox,
}: {
  readonly onPick: (id: string) => void;
  readonly onSandbox: () => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-8 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Phòng thí nghiệm Git</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Gõ lệnh git thật trên một kho mô phỏng chạy hoàn toàn trong trình duyệt. Không tốn
          sandbox, không cần đăng nhập, tiến độ lưu ngay trên máy bạn.
        </p>
        <div>
          <button
            type="button"
            onClick={onSandbox}
            className="rounded-md border border-input px-3 py-1.5 text-sm text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Mở sandbox
          </button>
        </div>
      </header>

      {([1, 2, 3] as const).map((chapter) => (
        <section key={chapter} className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-foreground">{CHAPTER_TITLE[chapter]}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GIT_LEVELS.filter((l) => l.chapter === chapter).map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(l.id);
                  }}
                  className="flex w-full flex-col gap-1 rounded-lg border border-input bg-card p-4 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                >
                  <span className="text-sm font-medium text-card-foreground">{l.title}</span>
                  <span className="text-xs text-muted-foreground">{l.mission}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Màn chơi
// ═══════════════════════════════════════════════════════════════════════════

interface LevelScreenProps {
  readonly level: GitLevel;
  readonly theory: TheoryDoc | null;
  readonly onExit: () => void;
}

function GitLevelScreen({ level, theory, onExit }: LevelScreenProps): ReactElement {
  /*
   * ⚠ Phiên giữ trong `useRef`, KHÔNG trong `useState`.
   *
   * `createGitSession` trả một object có định danh ổn định và tự quản state bên
   * trong; nhét nó vào `useState` sẽ khiến React coi mỗi lần `setState` là một
   * giá trị mới và dựng lại phiên, tức mất sạch tiến độ của người chơi ở mỗi
   * lần render. `useRef` + một bộ đếm `tick` để ép vẽ lại là hình dạng đúng.
   */
  const sessionRef = useRef<GitEngineSession | null>(null);
  sessionRef.current ??= createGitSession({ level });
  const session = sessionRef.current;

  const [, setTick] = useState(0);
  const redraw = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showTheory, setShowTheory] = useState(false);

  const { resolved, setMode } = useRendererChoice();

  const world = session.getWorld();
  const view = buildView(world);
  const results = evaluateObjectives(world, null, level.objectives);
  const verdict = verdictOf(results);
  const output = session.getOutput();

  const sceneView = view as unknown as SceneView;
  const layouts = useMemo(() => buildSceneLayouts(sceneView, layoutDag), [sceneView]);

  const submit = useCallback(
    (command: string) => {
      session.run(command);
      redraw();
    },
    [session, redraw],
  );

  const undo = useCallback(() => {
    session.undo();
    redraw();
  }, [session, redraw]);

  return (
    <div className="flex h-full flex-col">
      {/* ── Thanh trên ─────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-3 border-b border-input px-4 py-2">
        <button
          type="button"
          onClick={onExit}
          className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          ← Danh sách level
        </button>
        <span className="text-sm font-medium text-foreground">
          {CHAPTER_TITLE[level.chapter]} · {level.title}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span
            className="text-xs text-muted-foreground"
            aria-live="polite"
            data-testid="git-verdict"
          >
            {verdict.accepted
              ? `AC (${String(verdict.passedCount)}/${String(verdict.totalCount)})`
              : `${String(verdict.passedCount)}/${String(verdict.totalCount)} testcase`}
          </span>
          <ModeToggle resolved={resolved} enabled={ENABLED_MODES} onChange={setMode} />
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ── Khung cảnh ───────────────────────────────────────────────── */}
        <div className={resolved.mode === '3d' ? 'min-h-0 flex-1' : 'min-h-0 flex-1 overflow-auto p-4'}>
          {resolved.mode === '3d' ? (
            <GitScene3D
              scene={{
                view: sceneView,
                layouts,
                interaction: {
                  selectedId: selected,
                  hoveredId: hovered,
                  onSelect: setSelected,
                  onHover: setHovered,
                },
              }}
              label={`Đồ thị commit của level ${level.title}`}
            />
          ) : (
            <GitSvgScene
              view={sceneView}
              layouts={layouts}
              interaction={{
                selectedId: selected,
                hoveredId: hovered,
                onSelect: setSelected,
                onHover: setHovered,
              }}
              label={`Đồ thị commit của level ${level.title}`}
            />
          )}
        </div>

        {/* ── Cột phải ─────────────────────────────────────────────────── */}
        <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-input p-4 lg:w-96 lg:border-t-0 lg:border-l">
          <section aria-labelledby="git-muc-tieu">
            <h2 id="git-muc-tieu" className="mb-2 text-sm font-semibold text-foreground">
              Mục tiêu
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">{level.mission}</p>
            <ul className="flex flex-col gap-1">
              {results.map((r) => (
                <li key={r.id} className="flex items-start gap-2 text-xs">
                  <span aria-hidden="true" className="mt-0.5">
                    {r.met ? '☑' : '☐'}
                  </span>
                  <span className={r.met ? 'text-muted-foreground line-through' : 'text-foreground'}>
                    {r.label}
                    {!r.required && <span className="text-muted-foreground"> (thưởng)</span>}
                  </span>
                  <span className="sr-only">{r.met ? 'đã đạt' : 'chưa đạt'}</span>
                </li>
              ))}
            </ul>
          </section>

          {theory !== null && (
            <section aria-labelledby="git-bai-giang">
              <h2 id="git-bai-giang" className="mb-2 text-sm font-semibold text-foreground">
                Bài giảng
              </h2>
              <button
                type="button"
                aria-expanded={showTheory}
                onClick={() => {
                  setShowTheory((v) => !v);
                }}
                className="w-full rounded-md border border-input px-3 py-2 text-left text-xs text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {theory.frontmatter.title} · {String(theory.frontmatter.readMinutes)} phút đọc
              </button>
              {showTheory && (
                <div className="mt-2 max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap text-muted-foreground">
                  {theory.body}
                </div>
              )}
            </section>
          )}

          <section aria-labelledby="git-ref-list">
            <h2 id="git-ref-list" className="mb-2 text-sm font-semibold text-foreground">
              Ref
            </h2>
            <ul className="flex flex-col gap-1 font-mono text-xs">
              {view.refs.map((r) => (
                <li key={`${r.repo}:${r.name}`} className="text-muted-foreground">
                  <span className={r.isCurrent ? 'text-foreground' : undefined}>{r.shortName}</span>
                  {' → '}
                  {r.oid.slice(0, 7)}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="git-goi-y">
            <h2 id="git-goi-y" className="mb-2 text-sm font-semibold text-foreground">
              Gợi ý
            </h2>
            <ul className="flex flex-col gap-1">
              {level.hints.map((hint, i) => (
                <li key={hint}>
                  <button
                    type="button"
                    onClick={() => {
                      session.revealHint(i);
                      redraw();
                    }}
                    className="text-left text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    Mở gợi ý {i + 1}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {/* ── Bản ghi lệnh + ô lệnh, rộng hết chiều ngang ─────────────────── */}
      <div className="border-t border-input">
        <OutputLog output={output} />
        <CommandBar onSubmit={submit} onUndo={undo} />
      </div>
    </div>
  );
}
