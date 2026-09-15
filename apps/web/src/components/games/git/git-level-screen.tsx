'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

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
import { MarkdownView } from '@devops-platform/ui';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Flag,
  GitBranch,
  Lightbulb,
  Medal,
  Redo2,
  Send,
  Sparkles,
  Terminal,
  Trophy,
  Undo2,
} from 'lucide-react';
import { GitMapStage } from './git-map-stage';
import { saveGitMilestone } from './git-progress';
import './git-odyssey.css';
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
import type { HintReveal } from '../../../lib/use-hint-reveal';

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
  /** Bài có đủ testcase để nộp không. OJ luôn chấm trên máy chủ. */
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
  /**
   * Trạng thái xin chữ gợi ý từ máy chủ, theo chỉ số.
   *
   * Bài OJ nạp qua `problems.byCode`, và đường đó CHE chữ của gợi ý chưa mở
   * (§18.B.4) — nên `level.hints` ở chế độ này toàn chuỗi rỗng. Không có hai
   * trường này thì nút "Mở gợi ý" trừ điểm rồi đẩy ra đúng chữ *"Gợi ý 1: "*.
   */
  readonly hintReveals: ReadonlyMap<number, HintReveal>;
  /**
   * Xin chữ gợi ý thứ `index`; `null` ⇒ ĐỪNG mở gợi ý (không trừ điểm).
   *
   * Xem `lib/use-hint-reveal.ts` về thứ tự gọi-trước-trừ-sau.
   */
  readonly onRevealHint: (index: number) => Promise<string | null>;
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
  readonly onNext?: (() => void) | undefined;
}

export function GitLevelScreen({
  level,
  theory,
  onExit,
  trial,
  oj,
  exitLabel,
  onNext,
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

  const [tick, setTick] = useState(0);
  const redraw = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showTheory, setShowTheory] = useState(false);
  const [tab, setTab] = useState<'mission' | 'guide' | 'refs'>('mission');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [celebrate, setCelebrate] = useState(true);

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
  const serverGraded = oj !== undefined;
  const output = session.getOutput();

  const sceneView = view as unknown as SceneView;
  const layouts = useMemo(() => buildSceneLayouts(sceneView, layoutDag), [sceneView]);

  const submit = useCallback(
    (command: string) => {
      const outcome = session.run(command);
      setFeedback({
        tone: outcome.result.error ? 'error' : 'success',
        text: outcome.result.error
          ? 'Lệnh chưa thực hiện được. Xem hướng dẫn ở terminal.'
          : command + ' · Đã thực hiện',
      });
      redraw();
    },
    [session, redraw],
  );

  const undo = useCallback(() => {
    const changed = session.undo();
    setFeedback({
      tone: changed ? 'success' : 'error',
      text: changed ? 'Đã hoàn tác một bước.' : 'Chưa có bước nào để hoàn tác.',
    });
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
    setCelebrate(true);
    for (const command of trial.solutionCommands) session.run(command);
    redraw();
  }, [trial, session, redraw]);

  const status = session.getStatus();
  const won = !serverGraded && verdict.accepted && results.length > 0;
  useEffect(() => {
    if (!won) setCelebrate(true);
  }, [won]);
  useEffect(() => {
    if (oj === undefined && trial === undefined) saveGitMilestone(level.id, won, status.movesUsed);
  }, [level.id, won, status.movesUsed, oj, trial]);
  const scene = {
    view: sceneView,
    layouts,
    interaction: {
      selectedId: selected,
      hoveredId: hovered,
      onSelect: setSelected,
      onHover: setHovered,
    },
  };

  return (
    <div className="git-odyssey git-play-screen" data-chapter={level.chapter}>
      <header className="git-play-header">
        <button type="button" className="git-button git-back-button" onClick={onExit}>
          <ArrowLeft size={17} />
          <span>{exitLabel?.replace('← ', '') ?? 'Bản đồ'}</span>
        </button>
        <span className="git-header-divider" />
        <div className="git-play-title">
          <p className="git-eyebrow">
            GIT ODYSSEY /{' '}
            {oj ? 'ĐẤU TRƯỜNG OJ' : trial ? 'LEVEL BUILDER' : CHAPTER_TITLE[level.chapter]}
          </p>
          <h1>{level.title}</h1>
        </div>
        <div className="git-play-actions">
          <span className="git-move-count">
            <Terminal size={14} /> {status.movesUsed} lệnh
          </span>
          <ModeToggle resolved={resolved} enabled={ENABLED_MODES} onChange={setMode} />
          {trial && (
            <button
              type="button"
              className="git-button"
              onClick={runSolution}
              data-testid="git-run-solution"
            >
              Chạy lời giải mẫu
            </button>
          )}
          {oj && (
            <button
              type="button"
              className="git-button git-button-primary"
              disabled={oj.submitDisabled}
              onClick={() => oj.onSubmit(session)}
              data-testid="git-oj-submit"
            >
              <Send size={15} />
              {oj.submitLabel}
            </button>
          )}
        </div>
      </header>
      <div className="git-mission-strip">
        <Flag size={15} />
        <p>{level.mission}</p>
        {!serverGraded ? (
          <span aria-live="polite" data-testid="git-verdict">
            {won ? '✓ Hoàn thành' : 'Mục tiêu'} {verdict.passedCount}/{verdict.totalCount}
          </span>
        ) : (
          <span>Chấm trên máy chủ</span>
        )}
      </div>
      <div className="git-play-body">
        <div className="git-play-world">
          {resolved.mode === '3d' ? (
            <div className="git-three-stage">
              <GitScene3D
                effects={effects}
                scene={scene}
                label={'Đồ thị commit của level ' + level.title}
              />
            </div>
          ) : (
            <GitMapStage scene={scene} feedback={feedback} revision={tick} />
          )}
          {won && celebrate && (
            <section className="git-victory" aria-label="Hoàn thành nhiệm vụ">
              <div className="git-confetti" aria-hidden="true">
                {Array.from({ length: 24 }, (_, i) => (
                  <i
                    key={i}
                    style={{
                      left: ((i * 29) % 100) + '%',
                      animationDelay: i * 0.045 + 's',
                      rotate: i * 37 + 'deg',
                    }}
                  />
                ))}
              </div>
              <span className="git-victory-medal">
                <Trophy size={32} />
              </span>
              <p className="git-eyebrow">TRẠM ĐÃ ĐƯỢC CHINH PHỤC</p>
              <h2>Lịch sử nằm trong tay bạn.</h2>
              <p>
                Hoàn thành {verdict.passedCount}/{verdict.totalCount} mục tiêu · {status.movesUsed}{' '}
                lệnh
              </p>
              {level.teaching.takeaways.length > 0 && (
                <ul>
                  {level.teaching.takeaways.map((takeaway) => (
                    <li key={takeaway}>
                      <Check size={15} />
                      {takeaway}
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <button className="git-button" onClick={() => setCelebrate(false)}>
                  Tiếp tục khám phá
                </button>
                {onNext ? (
                  <button className="git-button git-button-primary" onClick={onNext}>
                    Trạm tiếp theo
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <button className="git-button git-button-primary" onClick={onExit}>
                    Về {trial ? 'Builder' : 'bản đồ'}
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
        <aside className="git-side-panel">
          <nav className="git-panel-tabs" aria-label="Nội dung nhiệm vụ">
            <button aria-pressed={tab === 'mission'} onClick={() => setTab('mission')}>
              <Flag size={15} />
              {oj ? 'Đề bài' : 'Nhiệm vụ'}
            </button>
            <button aria-pressed={tab === 'guide'} onClick={() => setTab('guide')}>
              <BookOpen size={15} />
              Cẩm nang
            </button>
            <button aria-pressed={tab === 'refs'} onClick={() => setTab('refs')}>
              <GitBranch size={15} />
              Refs
            </button>
          </nav>
          <div className="git-panel-content">
            {tab === 'mission' && (
              <>
                <section className="git-objective-section">
                  <p className="git-eyebrow">
                    <Flag size={13} /> {oj ? 'ĐỀ BÀI OJ' : 'ĐÍCH ĐẾN CỦA BẠN'}
                  </p>
                  <h2>{level.title}</h2>
                  <div className="git-readable-content">
                    <MarkdownView
                      markdown={level.brief || level.mission}
                      resolveAssetUrl={() => null}
                    />
                  </div>
                  {!serverGraded && (
                    <div
                      className="git-objective-progress"
                      role="progressbar"
                      aria-label="Tiến độ mục tiêu"
                      aria-valuenow={verdict.passedCount}
                      aria-valuemin={0}
                      aria-valuemax={verdict.totalCount || 1}
                    >
                      <span
                        style={{
                          width:
                            (verdict.totalCount
                              ? (verdict.passedCount / verdict.totalCount) * 100
                              : 0) + '%',
                        }}
                      />
                    </div>
                  )}
                  <h3>{oj ? 'Tiêu chí chấm bài' : 'Mục tiêu nhiệm vụ'}</h3>
                  <ul className="git-objective-list">
                    {results.map((result) => (
                      <li key={result.id} data-met={!serverGraded && result.met}>
                        <span className="git-objective-check" aria-hidden="true">
                          {serverGraded ? '?' : result.met ? <Check size={14} /> : <span />}
                        </span>
                        <span>
                          {result.label}
                          {!result.required && <small>Thưởng</small>}
                          <span className="sr-only">
                            {serverGraded
                              ? ' — chấm ở máy chủ'
                              : result.met
                                ? ' — đã đạt'
                                : ' — chưa đạt'}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {oj?.notice && <p className="git-inline-notice">{oj.notice}</p>}
                </section>
                {oj && (
                  <section
                    className="git-oj-result"
                    data-verdict={
                      oj.result?.startsWith('AC') ? 'accepted' : oj.result ? 'review' : 'waiting'
                    }
                  >
                    <h3>
                      <Medal size={18} /> Kết quả lượt nộp gần nhất
                    </h3>
                    <p aria-live="polite" data-testid="git-oj-result">
                      {oj.result ??
                        'Sẵn sàng khi bạn sẵn sàng. Hoàn thành đề bài rồi nhấn Nộp bài.'}
                    </p>
                    {oj.failedLabels.length > 0 && (
                      <ul>
                        {oj.failedLabels.map((label, i) => (
                          <li key={i}>✗ {label}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
                <section className="git-hints">
                  <h3>
                    <Lightbulb size={16} /> Tiếp sức hành trình
                  </h3>
                  {level.hints.length === 0 ? (
                    <p>Nhiệm vụ này không có gợi ý.</p>
                  ) : (
                    level.hints.map((_hint, i) => {
                      const reveal = oj?.hintReveals.get(i);
                      const revealedText = [...output]
                        .reverse()
                        .find((line) => line.text.startsWith('Gợi ý ' + (i + 1) + ': '))?.text;
                      return (
                        <div key={i}>
                          <button
                            type="button"
                            className="git-hint-button"
                            disabled={reveal?.phase === 'pending'}
                            onClick={() => {
                              if (!oj) {
                                session.revealHint(i);
                                redraw();
                                return;
                              }
                              void oj.onRevealHint(i).then((text) => {
                                if (text !== null) session.revealHint(i, text);
                                redraw();
                              });
                            }}
                          >
                            <span>
                              <Lightbulb size={14} />
                              {reveal?.phase === 'pending' ? 'Đang mở…' : 'Mở gợi ý ' + (i + 1)}
                            </span>
                            <ChevronDown size={14} />
                          </button>
                          {revealedText && <p className="git-revealed-hint">{revealedText}</p>}
                          {reveal?.phase === 'error' && (
                            <p role="alert" className="text-destructive">
                              Không mở được: {reveal.message}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </section>
              </>
            )}
            {tab === 'guide' && (
              <>
                <section>
                  <p className="git-eyebrow">
                    <BookOpen size={13} /> CẨM NANG THÁM HIỂM
                  </p>
                  <h2>Hiểu lệnh. Hiểu lịch sử.</h2>
                  {level.teaching.primer && (
                    <div className="git-readable-content">
                      <MarkdownView markdown={level.teaching.primer} resolveAssetUrl={() => null} />
                    </div>
                  )}
                  <p className="git-inline-notice">
                    Gõ lệnh ở terminal, nhấn Enter để thực hiện. ↑↓ xem lại lệnh. Ctrl/Cmd + Z hoàn
                    tác.
                  </p>
                </section>
                <section className="git-cheatsheet">
                  <h3>Công cụ của nhiệm vụ</h3>
                  {level.teaching.cheatsheet.length > 0 ? (
                    level.teaching.cheatsheet.map((entry, i) => (
                      <div key={i}>
                        <code>{entry.command}</code>
                        <p>{entry.explain}</p>
                      </div>
                    ))
                  ) : (
                    <p>Tra cú pháp tại nút “Thư viện lệnh” bên dưới terminal.</p>
                  )}
                </section>
                {level.teaching.pitfalls?.map((pitfall) => (
                  <p className="git-inline-notice" key={pitfall}>
                    {pitfall}
                  </p>
                ))}
                {level.teaching.proTips?.map((tip) => (
                  <p className="git-revealed-hint" key={tip}>
                    <Sparkles size={14} /> {tip}
                  </p>
                ))}
                {theory && (
                  <section>
                    <button
                      className="git-hint-button"
                      aria-expanded={showTheory}
                      onClick={() => setShowTheory((v) => !v)}
                    >
                      <BookOpen size={16} />
                      {theory.frontmatter.title} · {theory.frontmatter.readMinutes} phút
                      <ChevronDown size={14} />
                    </button>
                    {showTheory && (
                      <div className="git-readable-content git-theory">
                        <MarkdownView markdown={theory.body} resolveAssetUrl={() => null} />
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
            {tab === 'refs' && (
              <section>
                <p className="git-eyebrow">
                  <GitBranch size={13} /> ĐỊNH VỊ TRONG KHO
                </p>
                <h2>Bạn đang ở đâu?</h2>
                <p className="git-inline-notice">
                  {view.detached
                    ? 'Detached HEAD: bạn đang đứng trực tiếp trên một commit.'
                    : 'HEAD đi cùng nhánh hiện tại. Chọn một ref để tìm commit trên bản đồ.'}
                </p>
                <ul className="git-ref-list">
                  {view.refs.map((ref) => (
                    <li key={ref.repo + ':' + ref.name}>
                      <button
                        onClick={() => setSelected(ref.repo + ':' + ref.oid)}
                        data-current={ref.isCurrent}
                      >
                        <GitBranch size={16} />
                        <span>
                          <strong>{ref.shortName}</strong>
                          <small>
                            {ref.repo} → {ref.oid.slice(0, 7)}
                          </small>
                        </span>
                        {ref.isCurrent && <b>HEAD</b>}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </aside>
      </div>
      <section className="git-terminal">
        <header>
          <span>
            <i />
            <i />
            <i />
            <Terminal size={14} /> TERMINAL <small>~/git-odyssey</small>
          </span>
          <div>
            <button type="button" onClick={undo}>
              <Undo2 size={14} />
              Hoàn tác
            </button>
            <button
              type="button"
              onClick={() => {
                const changed = session.redo();
                setFeedback({
                  tone: changed ? 'success' : 'error',
                  text: changed ? 'Đã làm lại một bước.' : 'Chưa có bước nào để làm lại.',
                });
                redraw();
              }}
            >
              <Redo2 size={14} />
              Làm lại
            </button>
          </div>
        </header>
        <OutputLog output={output} />
        <CommandBar onSubmit={submit} onUndo={undo} allowedCommands={level.allowedCommands} />
      </section>
    </div>
  );
}
