'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

import { t } from '@devops-platform/copy';
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
 * Màn CHƠI của Phòng thí nghiệm Git: một màn duy nhất cho cả ba đường vào.
 *
 *  1. Level phát hành (`GIT_LEVELS`), qua `?level=`.
 *  2. Chơi thử một level vừa dựng bằng Builder (§18.E.6), qua prop `trial`.
 *  3. Làm một bài OJ (§18.C cho game thứ hai), qua prop `oj`.
 *
 * Một bản sao của màn chơi cho bất kỳ đường nào trong ba đường trên sẽ làm câu
 * "bài này chơi được" chỉ đúng với bản sao đó. Tách khỏi `git-game.tsx` vì
 * `git-problem.tsx` phải dùng LẠI màn này (tránh vòng import).
 *
 * Màn chơi ở trong vũ trụ tối `.git-odyssey` (giống terminal và IDE của khu thực
 * hành: không gian làm việc luôn tối). Khung quanh nó theo hệ PTIT: góc vuông,
 * tiêu đề Archivo, nhãn mono, viền màu chương dưới thanh trên.
 */

/** Tiêu đề chương ở thanh trên của màn chơi, đọc từ bản đồ chữ. */
function chapterTitle(chapter: 1 | 2 | 3): string {
  return t('games.git.chapter.title', { n: chapter, name: t(`games.git.chapter.${chapter}.name`) });
}

/**
 * Chế độ renderer, đọc một lần lúc mount. Phép dò WebGL2 và `localStorage` chỉ
 * chạy trong `useState` khởi tạo lười: cả hai không tồn tại lúc server render, và
 * gọi lại mỗi lần vẽ sẽ dựng một `<canvas>` mới sau mỗi lệnh người chơi gõ.
 */
const ENABLED_MODES: readonly RendererMode[] = ['2d', '3d'];

/**
 * Tầng 3D nạp động, `ssr: false`. `three` đụng `window` lúc dựng, và gói 3D nặng
 * ~631KB: một `import` tĩnh sẽ kéo nó vào bundle của mọi người chơi (cổng CI
 * `bundle:check` gác chỗ này).
 */
const GitScene3D = dynamic(() => import('./scene3d/index.ts').then((m) => m.GitScene3D), {
  ssr: false,
  loading: () => (
    <p className="p-4 font-mono text-sm text-muted-foreground" role="status">
      {t('games.git.play.loading-3d')}
    </p>
  ),
});

/**
 * Hậu kỳ (bloom) có bật không. Tắt bằng `?fx=off`.
 *
 * ĐÂY LÀ ĐIỀU KIỆN ĐỂ Ô AC-7 CÓ NGHĨA: `EffectComposer` reset `renderer.info.render`
 * ở mỗi lần `render()`, nên khi bloom bật `calls` đọc ra là 1 bất kể cảnh có bao
 * nhiêu object. Công tắc cố ý không có nút bấm: nó là một đường để ĐO.
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
    has3d: true,
    // Mặc định vẫn là 2D dù máy chạy được 3D: 2D là chế độ NGANG HÀNG, nạp ngay
    // và không tốn 631KB; ai muốn 3D thì bấm một lần và lựa chọn đó được nhớ.
    fallback: '2d',
  });

  const setMode = useCallback((mode: RendererMode) => {
    writeStoredMode(mode);
    setStored(mode);
  }, []);

  return { resolved, setMode };
}

/**
 * Phần thêm của chế độ LÀM BÀI OJ. `gradable` KHÔNG phải một cờ tiện tay: wire
 * của người học cắt `check`/`args` của mọi testcase (§18.B.4), nên engine trong
 * trình duyệt không chấm được, và danh sách mục tiêu phải nói "chấm ở máy chủ"
 * thay vì hiện ô trống (một ô chưa tích ở đây là lời khẳng định SAI "chưa đạt").
 */
export interface OjScreenProps {
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
   * Trạng thái xin chữ gợi ý từ máy chủ, theo chỉ số. Bài OJ nạp qua
   * `problems.byCode`, và đường đó CHE chữ của gợi ý chưa mở (§18.B.4).
   */
  readonly hintReveals: ReadonlyMap<number, HintReveal>;
  /** Xin chữ gợi ý thứ `index`; `null` ⇒ ĐỪNG mở gợi ý (không trừ điểm). */
  readonly onRevealHint: (index: number) => Promise<string | null>;
}

interface LevelScreenProps {
  readonly level: GitLevel;
  readonly theory: TheoryDoc | null;
  readonly onExit: () => void;
  /**
   * Có mặt ⇒ lượt CHƠI THỬ một level vừa dựng bằng Builder (§18.E.6): màn hiện
   * thêm nút chạy lời giải mẫu. Chở `solutionCommands` riêng để chỗ gọi nói rõ ý
   * định: màn chơi bình thường KHÔNG được mọc ra nút đó.
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
   * ⚠ Phiên giữ trong `useRef`, KHÔNG trong `useState`: `createGitSession` trả một
   * object tự quản state bên trong; `useRef` + bộ đếm `tick` để ép vẽ lại là hình
   * dạng đúng.
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
   * ⚠ `session.getView()`, KHÔNG phải `buildView(world)`: hints do engine sinh ra
   * theo từng lệnh (`freshOids`, `duplicateOf`, `conflictedOids`) chỉ sống trong
   * phiên, và dựng lại view từ `world` là vứt sạch ba accent đó.
   */
  const view = session.getView();
  /*
   * ⚠ Kết quả mục tiêu đọc từ `session.getStatus()`, KHÔNG tự chấm lại với cây
   * đích `null`: `graphShapeMatches` trả `false` cứng khi target là `null`, trong
   * khi engine chấm bằng cây đích thật.
   */
  const met = new Set(session.getStatus().objectivesMet);
  const results: readonly ObjectiveResult[] = level.objectives.map((o) => ({
    id: o.id,
    label: o.label,
    required: o.required,
    met: met.has(o.id),
  }));
  const verdict = verdictOf(results);
  /* Engine có chấm được lượt này không, hay phải đợi máy chủ. Một tên, ba chỗ dùng. */
  const serverGraded = oj !== undefined;
  const output = session.getOutput();

  const sceneView = view as unknown as SceneView;
  const layouts = useMemo(() => buildSceneLayouts(sceneView, layoutDag), [sceneView]);

  const submit = useCallback(
    (command: string) => {
      const outcome = session.run(command);
      setFeedback({
        tone: outcome.result.error ? 'error' : 'success',
        text: outcome.result.error ? t('games.git.play.ran-error') : t('games.git.play.ran', { command }),
      });
      redraw();
    },
    [session, redraw],
  );

  const undo = useCallback(() => {
    const changed = session.undo();
    setFeedback({
      tone: changed ? 'success' : 'error',
      text: changed ? t('games.git.play.undo-done') : t('games.git.play.undo-none'),
    });
    redraw();
  }, [session, redraw]);

  const redo = useCallback(() => {
    const changed = session.redo();
    setFeedback({
      tone: changed ? 'success' : 'error',
      text: changed ? t('games.git.play.redo-done') : t('games.git.play.redo-none'),
    });
    redraw();
  }, [session, redraw]);

  /*
   * Chạy lời giải mẫu qua ĐÚNG `session.run` mà người chơi đi qua, từng lệnh một,
   * để người soạn NHÌN chuỗi lệnh chạy trên chính cây họ đang xem.
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

  const crumb = oj ? t('games.git.play.crumb-oj') : trial ? t('games.git.play.crumb-trial') : chapterTitle(level.chapter);

  return (
    <div className="git-odyssey git-play-screen" data-chapter={level.chapter}>
      <header className="git-play-header">
        <button type="button" className="git-button git-back-button" onClick={onExit}>
          <ArrowLeft size={17} aria-hidden="true" />
          <span>{exitLabel ?? t('games.git.play.back')}</span>
        </button>
        <span className="git-header-divider" />
        <div className="git-play-title">
          <p className="git-eyebrow">
            <span className="git-line-code">GIT</span> {crumb}
          </p>
          <h1>{level.title}</h1>
        </div>
        <div className="git-play-actions">
          <span className="git-move-count">
            <Terminal size={14} aria-hidden="true" /> {t('games.git.play.moves', { n: status.movesUsed })}
          </span>
          <ModeToggle resolved={resolved} enabled={ENABLED_MODES} onChange={setMode} />
          {trial && (
            <button type="button" className="git-button" onClick={runSolution} data-testid="git-run-solution">
              {t('games.git.play.run-solution')}
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
              <Send size={15} aria-hidden="true" />
              {oj.submitLabel}
            </button>
          )}
        </div>
      </header>
      <div className="git-mission-strip">
        <Flag size={15} aria-hidden="true" />
        <p>{level.mission}</p>
        {!serverGraded ? (
          <span aria-live="polite" data-testid="git-verdict">
            {won
              ? t('games.git.play.verdict-done', { passed: verdict.passedCount, total: verdict.totalCount })
              : t('games.git.play.verdict', { passed: verdict.passedCount, total: verdict.totalCount })}
          </span>
        ) : (
          <span>{t('games.git.play.server-graded')}</span>
        )}
      </div>
      <div className="git-play-body">
        <div className="git-play-world">
          {resolved.mode === '3d' ? (
            <div className="git-three-stage">
              <GitScene3D
                effects={effects}
                scene={scene}
                label={t('games.git.play.scene-label', { title: level.title })}
              />
            </div>
          ) : (
            <GitMapStage scene={scene} feedback={feedback} revision={tick} />
          )}
          {won && celebrate && (
            <section className="git-victory" aria-label={t('games.git.win.aria')}>
              <span className="git-victory-medal" aria-hidden="true">
                <Trophy size={32} />
              </span>
              <p className="git-eyebrow">{t('games.git.win.kicker')}</p>
              <h2>{t('games.git.win.title')}</h2>
              <p>
                {t('games.git.win.summary', {
                  passed: verdict.passedCount,
                  total: verdict.totalCount,
                  moves: status.movesUsed,
                })}
              </p>
              {level.teaching.takeaways.length > 0 && (
                <ul>
                  {level.teaching.takeaways.map((takeaway) => (
                    <li key={takeaway}>
                      <Check size={15} aria-hidden="true" />
                      {takeaway}
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <button type="button" className="git-button" onClick={() => setCelebrate(false)}>
                  {t('games.git.win.stay')}
                </button>
                {onNext ? (
                  <button type="button" className="git-button git-button-primary" onClick={onNext}>
                    {t('games.git.win.next')}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                ) : (
                  <button type="button" className="git-button git-button-primary" onClick={onExit}>
                    {trial ? t('games.git.win.back-builder') : t('games.git.win.back')}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
        {/*
          Landmark `complementary` cần một cái tên khi trên màn có hơn một cái.
        */}
        <aside className="git-side-panel" aria-label={t('games.git.panel.aria')}>
          <nav className="git-panel-tabs" aria-label={t('games.git.panel.tabs')}>
            <button type="button" aria-pressed={tab === 'mission'} onClick={() => setTab('mission')}>
              <Flag size={15} aria-hidden="true" />
              {oj ? t('games.git.panel.mission-oj') : t('games.git.panel.mission')}
            </button>
            <button type="button" aria-pressed={tab === 'guide'} onClick={() => setTab('guide')}>
              <BookOpen size={15} aria-hidden="true" />
              {t('games.git.panel.guide')}
            </button>
            <button type="button" aria-pressed={tab === 'refs'} onClick={() => setTab('refs')}>
              <GitBranch size={15} aria-hidden="true" />
              {t('games.git.panel.refs')}
            </button>
          </nav>
          <div className="git-panel-content">
            {tab === 'mission' && (
              <>
                <section className="git-objective-section">
                  <p className="git-eyebrow">
                    <Flag size={13} aria-hidden="true" />{' '}
                    {oj ? t('games.git.panel.goal-oj') : t('games.git.panel.goal')}
                  </p>
                  <h2>{level.title}</h2>
                  <div className="git-readable-content">
                    <MarkdownView markdown={level.brief || level.mission} resolveAssetUrl={() => null} />
                  </div>
                  {!serverGraded && (
                    <div
                      className="git-objective-progress"
                      role="progressbar"
                      aria-label={t('games.git.panel.progress')}
                      aria-valuenow={verdict.passedCount}
                      aria-valuemin={0}
                      aria-valuemax={verdict.totalCount || 1}
                    >
                      <span
                        style={{
                          width:
                            (verdict.totalCount ? (verdict.passedCount / verdict.totalCount) * 100 : 0) +
                            '%',
                        }}
                      />
                    </div>
                  )}
                  <h3>{oj ? t('games.git.panel.criteria') : t('games.git.panel.objectives')}</h3>
                  <ul className="git-objective-list">
                    {results.map((result) => (
                      <li key={result.id} data-met={!serverGraded && result.met}>
                        <span className="git-objective-check" aria-hidden="true">
                          {serverGraded ? '?' : result.met ? <Check size={14} /> : <span />}
                        </span>
                        <span>
                          {result.label}
                          {!result.required && <small>{t('games.git.panel.bonus')}</small>}
                          <span className="sr-only">
                            {', '}
                            {serverGraded
                              ? t('games.git.panel.on-server')
                              : result.met
                                ? t('games.git.panel.met')
                                : t('games.git.panel.unmet')}
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
                    data-verdict={oj.result?.startsWith('AC') ? 'accepted' : oj.result ? 'review' : 'waiting'}
                  >
                    <h3>
                      <Medal size={18} aria-hidden="true" /> {t('games.git.panel.last-result')}
                    </h3>
                    <p aria-live="polite" data-testid="git-oj-result">
                      {oj.result ?? t('games.git.panel.no-result')}
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
                    <Lightbulb size={16} aria-hidden="true" /> {t('games.git.panel.hints')}
                  </h3>
                  {level.hints.length === 0 ? (
                    <p>{t('games.git.panel.no-hints')}</p>
                  ) : (
                    level.hints.map((_hint, i) => {
                      const reveal = oj?.hintReveals.get(i);
                      /*
                       * Dòng gợi ý đã mở do ENGINE in ra terminal (`revealHint`), nên
                       * tiền tố của nó là chữ của engine, không phải chữ giao diện.
                       */
                      const revealedText = [...output]
                        .reverse()
                        .find((line) => line.text.startsWith(`Gợi ý ${String(i + 1)}: `))?.text;
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
                              <Lightbulb size={14} aria-hidden="true" />
                              {reveal?.phase === 'pending'
                                ? t('games.git.panel.hint-pending')
                                : t('games.git.panel.hint-open', { n: i + 1 })}
                            </span>
                            <ChevronDown size={14} aria-hidden="true" />
                          </button>
                          {revealedText && <p className="git-revealed-hint">{revealedText}</p>}
                          {reveal?.phase === 'error' && (
                            <p role="alert" className="text-destructive">
                              {t('games.git.panel.hint-error', { message: reveal.message })}
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
                    <BookOpen size={13} aria-hidden="true" /> {t('games.git.panel.guide-kicker')}
                  </p>
                  <h2>{t('games.git.panel.guide-title')}</h2>
                  {level.teaching.primer && (
                    <div className="git-readable-content">
                      <MarkdownView markdown={level.teaching.primer} resolveAssetUrl={() => null} />
                    </div>
                  )}
                  <p className="git-inline-notice">{t('games.git.panel.keys')}</p>
                </section>
                <section className="git-cheatsheet">
                  <h3>{t('games.git.panel.tools')}</h3>
                  {level.teaching.cheatsheet.length > 0 ? (
                    level.teaching.cheatsheet.map((entry, i) => (
                      <div key={i}>
                        <code>{entry.command}</code>
                        <p>{entry.explain}</p>
                      </div>
                    ))
                  ) : (
                    <p>{t('games.git.panel.no-tools')}</p>
                  )}
                </section>
                {level.teaching.pitfalls?.map((pitfall) => (
                  <p className="git-inline-notice" key={pitfall}>
                    {pitfall}
                  </p>
                ))}
                {level.teaching.proTips?.map((tip) => (
                  <p className="git-revealed-hint" key={tip}>
                    <Sparkles size={14} aria-hidden="true" /> {tip}
                  </p>
                ))}
                {theory && (
                  <section>
                    <button
                      type="button"
                      className="git-hint-button"
                      aria-expanded={showTheory}
                      onClick={() => setShowTheory((v) => !v)}
                    >
                      <BookOpen size={16} aria-hidden="true" />
                      {t('games.git.panel.theory', {
                        title: theory.frontmatter.title,
                        minutes: theory.frontmatter.readMinutes,
                      })}
                      <ChevronDown size={14} aria-hidden="true" />
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
                  <GitBranch size={13} aria-hidden="true" /> {t('games.git.panel.refs-kicker')}
                </p>
                <h2>{t('games.git.panel.refs-title')}</h2>
                <p className="git-inline-notice">
                  {view.detached ? t('games.git.panel.detached') : t('games.git.panel.attached')}
                </p>
                <ul className="git-ref-list">
                  {view.refs.map((ref) => (
                    <li key={ref.repo + ':' + ref.name}>
                      <button
                        type="button"
                        onClick={() => setSelected(ref.repo + ':' + ref.oid)}
                        data-current={ref.isCurrent}
                      >
                        <GitBranch size={16} aria-hidden="true" />
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
      <section className="git-terminal" aria-label={t('games.git.play.terminal')}>
        <header>
          <span>
            <Terminal size={14} aria-hidden="true" /> {t('games.git.play.terminal')} <small>~/git-lab</small>
          </span>
          <div>
            <button type="button" onClick={undo}>
              <Undo2 size={14} aria-hidden="true" />
              {t('games.git.play.undo')}
            </button>
            <button type="button" onClick={redo}>
              <Redo2 size={14} aria-hidden="true" />
              {t('games.git.play.redo')}
            </button>
          </div>
        </header>
        <OutputLog output={output} />
        <CommandBar onSubmit={submit} onUndo={undo} allowedCommands={level.allowedCommands} />
      </section>
    </div>
  );
}
