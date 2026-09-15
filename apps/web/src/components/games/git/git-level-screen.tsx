'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';

import {
  createGitSession,
  layoutDag,
  verdictOf,
  type GitEngineSession,
  type GitLevel,
  type ObjectiveResult,
  type TheoryDoc,
} from '@devops-platform/games';

import { CommandBar, OutputLog } from './git-console';
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
 * Màn CHƠI của Phòng thí nghiệm Git — một màn duy nhất cho cả ba đường vào.
 *
 * Tách khỏi `git-game.tsx` ở 18.E (nửa client của khối 4) vì một lý do cơ học,
 * không phải vì file kia dài: chế độ chơi bài OJ (`git-problem.tsx`) phải dùng
 * LẠI đúng màn này, mà `git-game.tsx` lại là chỗ chọn giữa ba đường vào — để cả
 * hai ở một file là một vòng import (`git-game` → `git-problem` → `git-game`).
 *
 * ⛔ Ba đường vào, MỘT màn, và đó là điều kiện để mọi lời khai "chơi được" có
 * nghĩa:
 *
 *  1. Level phát hành (`GIT_LEVELS`), qua `?level=`.
 *  2. Chơi thử một level vừa dựng bằng Builder (§18.E.6), qua prop `trial`.
 *  3. Làm một bài OJ (§18.C cho game thứ hai), qua prop `oj`.
 *
 * Một bản sao của màn chơi cho bất kỳ đường nào trong ba đường trên sẽ làm câu
 * "bài này chơi được" chỉ đúng với bản sao đó.
 */
/**
 * Tiêu đề chương, dùng ở CẢ HAI file: màn chọn level (`git-game.tsx`) và thanh
 * trên của màn chơi (dưới). Mở ra thay vì chép sang file kia — hai bảng cùng nội
 * dung là hai chỗ để trôi, và chỗ trôi ở đây đọc ra thành "danh sách gọi chương này
 * một tên, màn chơi gọi nó một tên khác".
 */
export const CHAPTER_TITLE: Record<1 | 2 | 3, string> = {
  1: 'Chương 1 · Nắn lịch sử',
  2: 'Chương 2 · Làm việc nhóm',
  3: 'Chương 3 · Cứu hộ',
};

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

/**
 * Hậu kỳ (bloom) có bật không. Tắt bằng `?fx=off`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐÂY LÀ ĐIỀU KIỆN ĐỂ Ô AC-7 CÓ NGHĨA, KHÔNG PHẢI MỘT CỜ GỠ LỖI TIỆN TAY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `EffectComposer` reset `renderer.info.render` ở **mỗi** lần `render()`, và
 * pass cuối là một tam giác phủ toàn màn hình — nên `calls` đọc ra là **1** và
 * `triangles` là **1**, bất kể cảnh có 2 hay 2000 object. Một ô nghiệm thu viết
 * `expect(calls).toBeLessThan(100)` khi bloom đang bật sẽ XANH mãi mãi và
 * **chứng minh đúng zero điều gì** (`rules/green-that-proves-nothing.md`).
 *
 * Arena giải bằng cách ghim bậc chất lượng qua bảng cài đặt; game Git không có
 * bảng cài đặt, nên công tắc là tham số URL. Nó cố ý **không** có nút bấm: đây
 * không phải một lựa chọn của người chơi, nó là một đường để ĐO.
 *
 * Đọc một lần lúc mount, không theo dõi thay đổi — đổi `?fx=` giữa chừng thì
 * tải lại trang.
 */
function useEffectsEnabled(): boolean {
  const [enabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    return new URLSearchParams(window.location.search).get('fx') !== 'off';
  });
  return enabled;
}

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
// Màn chơi
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Phần thêm của chế độ LÀM BÀI OJ (§18.C cho game thứ hai).
 *
 * ## Vì sao một prop chứ không phải một màn riêng
 *
 * Cùng lý lẽ đã ghi cho `trial`: một bài OJ phải đi qua ĐÚNG màn người chơi thật sẽ
 * thấy, nếu không thì "bài này chơi được" chỉ đúng với bản sao.
 *
 * ## `gradable` KHÔNG phải một cờ tiện tay
 *
 * Wire của người học cắt `check`/`args` của mọi testcase (§18.B.4), nên engine trong
 * trình duyệt KHÔNG chấm được. Khi đó danh sách mục tiêu phải nói "chấm ở máy chủ"
 * chứ không được hiện ☐: một ô chưa tích ở đây là một lời khẳng định SAI ("chưa đạt"),
 * không phải một ô trống vô hại.
 */
export interface OjScreenProps {
  /** Chấm tại chỗ được không. `false` ⇒ đổi cả cách vẽ mục tiêu lẫn nút nộp. */
  readonly gradable: boolean;
  /** Câu nói ra giới hạn, hiện TRÊN MÀN khi `gradable` là `false`. */
  readonly notice: string | null;
  readonly submitLabel: string;
  readonly submitDisabled: boolean;
  readonly onSubmit: (session: GitEngineSession) => void;
  /** Dòng kết quả máy chủ trả về, hoặc câu lỗi. `null` = chưa nộp lần nào. */
  readonly result: string | null;
  /** Tên testcase chưa qua, theo lần chấm gần nhất của máy chủ. */
  readonly failedLabels: readonly string[];
}

interface LevelScreenProps {
  readonly level: GitLevel;
  readonly theory: TheoryDoc | null;
  readonly onExit: () => void;
  /**
   * Có mặt ⇒ đây là lượt CHƠI THỬ một level vừa dựng bằng Builder (§18.E.6), và
   * màn hiện thêm nút chạy lời giải mẫu.
   *
   * Vì sao là một prop chứ không phải một màn riêng: chơi thử phải đi qua ĐÚNG
   * màn người chơi thật sẽ thấy, nếu không thì "chơi được" chỉ đúng với bản sao.
   * Và nó chở `solutionCommands` riêng thay vì đọc `level.solutionCommands` để
   * chỗ gọi nói rõ ý định — một level phát hành cũng có trường đó, nhưng màn chơi
   * bình thường KHÔNG được mọc ra nút chạy lời giải.
   */
  readonly trial?: { readonly solutionCommands: readonly string[] };
  /** Có mặt ⇒ đây là một lượt làm BÀI OJ. Xem `OjScreenProps`. */
  readonly oj?: OjScreenProps;
  readonly exitLabel?: string;
}

export function GitLevelScreen({
  level,
  theory,
  onExit,
  trial,
  oj,
  exitLabel,
}: LevelScreenProps): ReactElement {
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
  const effects = useEffectsEnabled();

  /*
   * ⚠ `session.getView()`, KHÔNG phải `buildView(world)`.
   *
   * `buildView(world, hints = {})` — tham số thứ hai mặc định RỖNG, và
   * `accentFor()` đọc đúng nó để quyết ba trong sáu accent:
   * `conflictedOids` → `conflicted`, `duplicateOf` → `duplicate`,
   * `freshOids` → `fresh`. Hints do engine sinh ra THEO TỪNG LỆNH (commit phát
   * `freshOids`, cherry-pick phát `duplicateOf`, merge xung đột phát
   * `conflictedOids`) và chỉ sống trong phiên.
   *
   * Dựng lại view từ `world` là vứt sạch chúng, nên ba accent đó **chưa bao giờ
   * hiện ra trong sản phẩm** — dù `git-palette.ts` khai đủ màu/hình/chuyển
   * động, `accent-3d.ts` khai đủ khối, và test của cả hai đều xanh. Các ô đó
   * kiểm bảng khai TỰ NHẤT QUÁN, không kiểm có gì được vẽ.
   *
   * Tìm ra 2026-09-14 khi phép đo mù màu chỉ dựng được 2/6 accent. Không cổng
   * nào bắt được, vì không cổng nào đi từ một lệnh git tới một pixel.
   */
  const view = session.getView();
  /*
   * ⚠ Kết quả mục tiêu đọc từ `session.getStatus()`, KHÔNG tự chấm lại bằng
   * `evaluateObjectives` với cây đích `null`.
   *
   * Cùng lý lẽ với `getView()` ngay trên, và cùng hình dạng lỗi. Bản cũ truyền
   * `null` làm cây đích, mà `evaluatePredicate` trả `false` CỨNG cho
   * `graphShapeMatches` khi target là `null` (`predicates.ts:178`) — trong khi
   * engine chấm bằng cây đích thật dựng từ `level.target` (`engine.ts:135`).
   *
   * Hệ quả: một level dùng `graphShapeMatches` hiện mục tiêu đó VĨNH VIỄN đỏ
   * trên màn, còn engine thì coi là đã đạt. Hai phần của mã trả lời khác nhau về
   * cùng một level, và phần người chơi nhìn thấy là phần sai.
   *
   * Hôm nay chưa ai chạm: không level nào trong 32 level phát hành dùng vị từ đó
   * (đo 2026-09-15), nên nhánh này là mã chết. **Level Builder (§18.E) làm nó
   * sống** — "rebase cho ra hình dạng này" chính là loại level mà một builder
   * trực quan dựng ra tự nhiên nhất.
   *
   * Đọc từ engine thay vì dựng lại cây đích ở đây còn tránh một bản sao thứ hai
   * của hằng seed: `createGitSession` mặc định `seed = 1`, và một `buildWorld(
   * level.target, <seed khác>)` ở tầng giao diện sẽ so với một cây đích khác.
   */
  const met = new Set(session.getStatus().objectivesMet);
  const results: readonly ObjectiveResult[] = level.objectives.map((o) => ({
    id: o.id,
    label: o.label,
    required: o.required,
    met: met.has(o.id),
  }));
  const verdict = verdictOf(results);
  /*
   * Engine có chấm được lượt này không, hay phải đợi máy chủ.
   *
   * Đặt thành một biến có TÊN thay vì viết `oj !== undefined && !oj.gradable` ở ba
   * chỗ trong JSX: ba bản của cùng một điều kiện là ba chỗ để một lần sửa bỏ sót, và bỏ
   * sót ở đây nghĩa là màn hình vừa nói "chấm ở máy chủ" vừa hiện một con số `0/n`.
   */
  const serverGraded = oj !== undefined && !oj.gradable;
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

  /*
   * Chạy lời giải mẫu qua ĐÚNG `session.run` mà người chơi đi qua, từng lệnh một.
   *
   * KHÔNG gọi `checkSolvable`: hàm đó dựng một phiên RIÊNG để trả một báo cáo, và
   * nó đã có nút của nó ở §E.7. Ở đây người soạn muốn NHÌN chuỗi lệnh chạy trên
   * chính cây họ đang xem — bản ghi lệnh, ô kết quả và đồ thị đều phải nhúc nhích.
   * Gọi `checkSolvable` sẽ để màn hình y nguyên và chỉ ô kết quả đổi, tức trả lời
   * một câu hỏi khác câu người soạn đang hỏi.
   */
  const runSolution = useCallback(() => {
    if (trial === undefined) return;
    for (const command of trial.solutionCommands) session.run(command);
    redraw();
  }, [trial, session, redraw]);

  return (
    <div className="flex h-full flex-col">
      {/* ── Thanh trên ─────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-3 border-b border-input px-4 py-2">
        <button
          type="button"
          onClick={onExit}
          className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {exitLabel ?? '← Danh sách level'}
        </button>
        <span className="text-sm font-medium text-foreground">
          {CHAPTER_TITLE[level.chapter]} · {level.title}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {trial !== undefined && (
            <button
              type="button"
              onClick={runSolution}
              data-testid="git-run-solution"
              className="rounded-md border border-input px-3 py-1 text-xs text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Chạy lời giải mẫu
            </button>
          )}
          {oj !== undefined && (
            <button
              type="button"
              onClick={() => {
                oj.onSubmit(session);
              }}
              disabled={oj.submitDisabled}
              data-testid="git-oj-submit"
              className="rounded-md border border-input px-3 py-1 text-xs text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {oj.submitLabel}
            </button>
          )}
          {/*
            ⚠ Ở chế độ OJ KHÔNG chấm được tại chỗ, dòng verdict của engine là một
            con số NÓI DỐI: mọi vị từ trả `undefined` nên nó luôn đọc ra `0/n`, giống
            hệt một lượt chơi chưa đạt gì. Giấu hẳn nó đi thay vì hiện một con số không
            có nghĩa — kết quả thật nằm ở `oj.result`, do máy chủ trả về.
          */}
          {(oj === undefined || oj.gradable) && (
            <span
              className="text-xs text-muted-foreground"
              aria-live="polite"
              data-testid="git-verdict"
            >
              {verdict.accepted
                ? `AC (${String(verdict.passedCount)}/${String(verdict.totalCount)})`
                : `${String(verdict.passedCount)}/${String(verdict.totalCount)} testcase`}
            </span>
          )}
          <ModeToggle resolved={resolved} enabled={ENABLED_MODES} onChange={setMode} />
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ── Khung cảnh ───────────────────────────────────────────────── */}
        <div className={resolved.mode === '3d' ? 'min-h-0 flex-1' : 'min-h-0 flex-1 overflow-auto p-4'}>
          {resolved.mode === '3d' ? (
            <GitScene3D
              effects={effects}
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
                  {/*
                    Ba trạng thái, không hai. `☐` khẳng định "chưa đạt"; khi engine
                    không có `check` để chạy thì lời khẳng định đó SAI, và nó sai theo
                    kiểu người chơi tin được — họ sửa bài mãi vì màn hình nói họ chưa đạt.
                  */}
                  <span aria-hidden="true" className="mt-0.5">
                    {serverGraded ? '•' : r.met ? '☑' : '☐'}
                  </span>
                  <span
                    className={
                      !serverGraded && r.met
                        ? 'text-muted-foreground line-through'
                        : 'text-foreground'
                    }
                  >
                    {r.label}
                    {!r.required && <span className="text-muted-foreground"> (thưởng)</span>}
                  </span>
                  <span className="sr-only">
                    {serverGraded ? 'chấm ở máy chủ' : r.met ? 'đã đạt' : 'chưa đạt'}
                  </span>
                </li>
              ))}
            </ul>
            {oj?.notice != null && (
              <p className="mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
                {oj.notice}
              </p>
            )}
          </section>

          {oj !== undefined && (
            <section aria-labelledby="git-oj-ket-qua">
              <h2 id="git-oj-ket-qua" className="mb-2 text-sm font-semibold text-foreground">
                Kết quả lượt nộp
              </h2>
              {/*
                `aria-live` vì kết quả tới SAU một vòng mạng, không tới cùng lúc người
                dùng bấm. Không có nó thì người dùng trình đọc màn hình bấm "Nộp bài" rồi
                không bao giờ biết điều gì xảy ra.
              */}
              <p
                className="text-xs text-muted-foreground"
                aria-live="polite"
                data-testid="git-oj-result"
              >
                {oj.result ?? 'Chưa nộp lượt nào.'}
              </p>
              {oj.failedLabels.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {oj.failedLabels.map((label) => (
                    <li key={label} className="text-xs text-foreground">
                      ✗ {label}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

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
