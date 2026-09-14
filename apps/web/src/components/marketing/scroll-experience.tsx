'use client';

import dynamic from 'next/dynamic';
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  Box,
  Check,
  Command,
  Power,
  RotateCcw,
  Server,
} from 'lucide-react';
import { t } from '@devops-platform/copy';
import { useReducedMotion } from '@devops-platform/motion/reduced-motion';
import type { JourneyEvent } from './experience-contract';
import { sampleJourney, sectionTravel, type JourneyAnchor } from './full-page-motion';
import styles from './experience.module.css';

const ExperienceScene = dynamic(() => import('./experience-scene'), {
  ssr: false,
  loading: () => null,
});

const CHAPTERS = [0, 1, 2, 3] as const;
const SCENE_LOAD_TIMEOUT_MS = 15_000;
type SceneState = 'loading' | 'ready' | 'fallback';

/** A failed GPU or lazy chunk must never take the readable landing down with it. */
class SceneBoundary extends Component<
  { readonly children: ReactNode; readonly onError: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Semantic, locally drawn alternative. It also reserves the scene's first-paint space. */
function JourneySchematic({ event }: { readonly event: JourneyEvent }) {
  return (
    <div className={styles.schematic} role="img" aria-label={t('home.journey.fallback')}>
      <div className={styles.schematicFlow} aria-hidden="true">
        <div className={styles.schematicWorkstation}>
          <div className={styles.schematicScreen}>
            <Command size={36} strokeWidth={1.5} />
            <i />
            <i />
            <i />
          </div>
          <div className={styles.schematicStand} />
          <div className={styles.schematicKeyboard} />
        </div>
        <div className={styles.schematicContainers}>
          <div>
            <Box size={28} strokeWidth={1.5} />
          </div>
          <div>
            <Box size={28} strokeWidth={1.5} />
          </div>
        </div>
        <div className={styles.schematicCluster} data-event={event}>
          {[0, 1, 2].map((node) => (
            <div key={node} className={styles.schematicNode}>
              <Server size={28} strokeWidth={1.4} />
              <i />
              <i />
              <i />
              <b />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** One viewport canvas travels through actual document sections; the page itself never pins. */
export function ScrollExperience({
  intro,
  children,
}: {
  readonly intro: ReactNode;
  readonly children: ReactNode;
}) {
  const section = useRef<HTMLDivElement>(null);
  const sceneLayer = useRef<HTMLDivElement>(null);
  const progressBar = useRef<HTMLSpanElement>(null);
  const progress = useRef(0);
  const placement = useRef({ x: 0.76, y: 0.5, scale: 0.8 });
  const pointer = useRef<readonly [number, number]>([0, 0]);
  const invalidate = useRef<(() => void) | null>(null);
  const stageRef = useRef(0);
  const [stage, setStage] = useState(0);
  const [event, setEvent] = useState<JourneyEvent>('idle');
  const [sceneState, setSceneState] = useState<SceneState>('loading');
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(true);
  const reducedMotion = useReducedMotion();
  const displayedSceneState = reducedMotion ? 'fallback' : sceneState;

  const markReady = useCallback(() => {
    setSceneState((current) => (current === 'fallback' ? current : 'ready'));
  }, []);
  const markError = useCallback(() => setSceneState('fallback'), []);
  const registerInvalidation = useCallback((callback: (() => void) | null) => {
    invalidate.current = callback;
    callback?.();
  }, []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || !active || reducedMotion || sceneState !== 'loading') return;
    const timeout = window.setTimeout(markError, SCENE_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [active, markError, mounted, reducedMotion, sceneState]);

  useEffect(() => {
    const outer = section.current;
    if (!outer) return;
    let pendingFrame = 0;
    let anchors: JourneyAnchor[] = [];
    let movingContent: { element: HTMLElement; top: number; height: number }[] = [];
    let pageTop = 0;
    let pageHeight = 1;
    let needsMeasure = true;

    const frame = () => {
      pendingFrame = 0;
      const scrollY = window.scrollY;
      const width = window.innerWidth;
      const height = window.innerHeight;
      // Stable wrappers are never transformed. Cache all geometry before writing any styles.
      if (needsMeasure) {
        const outerBox = outer.getBoundingClientRect();
        pageTop = outerBox.top + scrollY;
        pageHeight = outerBox.height;
        anchors = Array.from(outer.querySelectorAll<HTMLElement>('[data-journey-anchor]'))
          .map((anchor) => {
            const box = anchor.getBoundingClientRect();
            const css = getComputedStyle(anchor);
            return {
              x: box.left + box.width / 2,
              y: box.top + scrollY + box.height / 2,
              scale: Number.parseFloat(css.getPropertyValue('--anchor-scale')) || 0.8,
              opacity: Number.parseFloat(anchor.dataset.opacity ?? '1'),
              progress: Number.parseFloat(anchor.dataset.progress ?? '0'),
              chapter: Number.parseInt(anchor.dataset.chapter ?? '3', 10),
            };
          })
          .sort((left, right) => left.y - right.y);
        movingContent = Array.from(
          outer.querySelectorAll<HTMLElement>('[data-journey-section]'),
        ).flatMap((wrapper) => {
          const elements = wrapper.querySelectorAll<HTMLElement>('[data-journey-depth]');
          const box = wrapper.getBoundingClientRect();
          return Array.from(elements, (element) => ({
            element,
            top: box.top + scrollY,
            height: box.height,
          }));
        });
        needsMeasure = false;
      }
      const sample = sampleJourney(anchors, scrollY, width, height);
      progress.current = sample.progress;
      placement.current = sample.placement;
      if (sample.chapter !== stageRef.current) {
        stageRef.current = sample.chapter;
        setStage(sample.chapter);
      }
      if (sceneLayer.current) sceneLayer.current.style.opacity = String(sample.opacity);
      if (progressBar.current) {
        const overall = Math.max(
          0,
          Math.min(1, (scrollY - pageTop) / Math.max(1, pageHeight - height)),
        );
        progressBar.current.style.transform = `scaleX(${overall})`;
      }
      for (const item of movingContent) {
        const travel = reducedMotion ? 0 : sectionTravel(item.top, item.height, scrollY, height);
        item.element.style.setProperty('--section-travel', `${travel}px`);
      }
      invalidate.current?.();
    };
    const schedule = () => {
      if (!pendingFrame) pendingFrame = requestAnimationFrame(frame);
    };
    const remeasure = () => {
      needsMeasure = true;
      schedule();
    };
    const resize = new ResizeObserver(remeasure);
    resize.observe(outer);
    resize.observe(document.body);
    for (const wrapper of outer.querySelectorAll('[data-journey-section]')) resize.observe(wrapper);
    for (const anchor of outer.querySelectorAll('[data-journey-anchor]')) resize.observe(anchor);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', remeasure, { passive: true });
    frame();
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', remeasure);
      resize.disconnect();
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
    };
  }, [reducedMotion]);

  useEffect(() => {
    const outer = section.current;
    if (!outer) return;
    let intersecting = true;
    const update = () => {
      const visible = intersecting && document.visibilityState !== 'hidden';
      setActive(visible);
      if (visible) invalidate.current?.();
    };
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry?.isIntersecting ?? false;
      update();
    });
    observer.observe(outer);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  useEffect(() => {
    if (reducedMotion || !matchMedia('(pointer: fine)').matches) return;
    const move = (e: globalThis.PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointer.current = [
        (e.clientX / window.innerWidth) * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1,
      ];
      invalidate.current?.();
    };
    const reset = () => {
      pointer.current = [0, 0];
      invalidate.current?.();
    };
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', reset);
    return () => {
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', reset);
      reset();
    };
  }, [reducedMotion]);

  const goToChapter = (chapter: number) => {
    const destination = section.current?.querySelector<HTMLElement>(
      `[data-journey-chapter="${chapter}"]`,
    );
    destination?.focus({ preventScroll: true });
    destination?.scrollIntoView({
      block: 'start',
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
  };

  return (
    <div
      ref={section}
      className={styles.journey}
      data-testid="landing-journey"
      data-stage={stage}
      data-event={event}
      data-scene-state={displayedSceneState}
      data-reduced-motion={reducedMotion}
    >
      <div
        ref={sceneLayer}
        className={styles.sceneLayer}
        data-testid="journey-scene-layer"
        aria-hidden="true"
      >
        {mounted && !reducedMotion && sceneState !== 'fallback' ? (
          <SceneBoundary onError={markError}>
            <ExperienceScene
              progress={progress}
              pointer={pointer}
              placement={placement}
              event={event}
              active={active}
              reducedMotion={reducedMotion}
              onReady={markReady}
              onError={markError}
              onInvalidateReady={registerInvalidation}
            />
          </SceneBoundary>
        ) : null}
      </div>
      <div className={styles.masthead}>
        <span className={styles.identity}>{t('home.identity.name')}</span>
        <a href="#lo-trinh" className={styles.skip}>
          {t('home.journey.skip')}
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </div>
      {CHAPTERS.map((chapter) => (
        <section
          key={chapter}
          className={styles.chapter}
          data-journey-chapter={chapter}
          tabIndex={-1}
          data-testid={`journey-chapter-${chapter}`}
          data-journey-section
          aria-labelledby={chapter === 0 ? 'home-title' : `journey-title-${chapter}`}
        >
          <div className={styles.chapterAtmosphere} aria-hidden="true" />
          <div className={styles.story} data-journey-depth>
            <p className={styles.kicker}>
              <span />
              {t(`home.journey.stage${chapter}.kicker`)}
            </p>
            {chapter === 0 ? (
              <h1 id="home-title" className={styles.title}>
                {t('home.journey.heading')}
                <span>{t('home.journey.accent')}</span>
              </h1>
            ) : (
              <h2 id={`journey-title-${chapter}`} className={styles.title}>
                {t(`home.journey.stage${chapter}.title`)}
              </h2>
            )}
            <p className={styles.description}>
              {chapter === 0 ? t('home.journey.lede') : t(`home.journey.stage${chapter}.body`)}
            </p>
            {chapter === 0 ? <div className={styles.entryActions}>{intro}</div> : null}
            <div className={styles.command}>
              <code>{t(`home.journey.stage${chapter}.command`)}</code>
              <span>
                <Check size={13} aria-hidden="true" />
                {t(`home.journey.stage${chapter}.status`)}
              </span>
            </div>
            {chapter === 3 ? (
              <div className={styles.eventControls}>
                <div className={styles.eventButtons}>
                  <button
                    type="button"
                    data-testid="journey-fault"
                    disabled={event === 'fault'}
                    onClick={() => setEvent('fault')}
                  >
                    <Power size={15} aria-hidden="true" />
                    {t('home.journey.fault')}
                  </button>
                  <button
                    type="button"
                    data-testid="journey-recover"
                    disabled={event !== 'fault'}
                    onClick={() => setEvent('recovered')}
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    {t('home.journey.recover')}
                  </button>
                </div>
                <p role="status" aria-live="polite" data-testid="journey-status">
                  {event === 'fault'
                    ? t('home.journey.fault-status')
                    : event === 'recovered'
                      ? t('home.journey.recovered-status')
                      : t('home.journey.idle')}
                </p>
              </div>
            ) : null}
          </div>
          <div
            className={styles.visualAnchor}
            data-journey-anchor
            data-progress={chapter / 3}
            data-chapter={chapter}
          >
            {displayedSceneState !== 'ready' ? <JourneySchematic event={event} /> : null}
            <span className={styles.chapterNumber} aria-hidden="true" data-journey-depth>
              {String(chapter + 1).padStart(2, '0')}
            </span>
            <div className={styles.sceneCaption}>
              <span aria-hidden="true" />
              <p>{reducedMotion ? t('home.journey.reduced') : t('home.journey.disclosure')}</p>
            </div>
          </div>
          {chapter === 0 ? (
            <div className={styles.journeyFooter}>
              <span className={styles.scrollHint}>
                <ArrowDown size={16} aria-hidden="true" />
                {t('home.journey.scroll')}
              </span>
              <nav className={styles.stageNavigation} aria-label={t('home.journey.label')}>
                {CHAPTERS.map((target) => (
                  <button
                    key={target}
                    type="button"
                    data-testid={`journey-stage-button-${target}`}
                    aria-current={stage === target ? 'step' : undefined}
                    onClick={() => goToChapter(target)}
                  >
                    {t(`home.journey.stage${target}.kicker`)}
                  </button>
                ))}
              </nav>
            </div>
          ) : null}
        </section>
      ))}
      {children}
      <div className={styles.progressTrack} aria-hidden="true">
        <span ref={progressBar} />
      </div>
    </div>
  );
}

/** Stable normal-flow wrappers also give the scene destinations throughout the real product content. */
export function JourneyContinuation({
  kind,
  children,
}: {
  readonly kind: 'terminal' | 'catalog' | 'curriculum' | 'practice' | 'closing';
  readonly children: ReactNode;
}) {
  const state = {
    terminal: { progress: 0.35, opacity: 0.7 },
    catalog: { progress: 0.7, opacity: 0.45 },
    curriculum: { progress: 0.1, opacity: 0.5 },
    practice: { progress: 0.7, opacity: 0.5 },
    closing: { progress: 1, opacity: 0.8 },
  }[kind];
  return (
    <div
      className={styles.continuation}
      data-journey-section
      data-kind={kind}
      data-testid={`journey-section-${kind}`}
    >
      <div
        className={styles.continuationAnchor}
        data-journey-anchor
        data-progress={state.progress}
        data-opacity={state.opacity}
        data-chapter="3"
        aria-hidden="true"
      />
      <div className={styles.continuationContent} data-journey-depth>
        {children}
      </div>
    </div>
  );
}
