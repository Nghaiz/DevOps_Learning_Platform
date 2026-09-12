'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, CornerDownRight, Play, RotateCcw, Terminal } from 'lucide-react';
import { t } from '@devops-platform/copy';
import styles from './landing.module.css';

const TOPICS = ['linux', 'docker', 'kubernetes'] as const;
type Topic = (typeof TOPICS)[number];

/** A demand-only scroll observer: visual progress never executes an example. */
function useWorkbenchScroll() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const surface = node.firstElementChild as HTMLElement | null;
    if (!surface) return;
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let visible = true;
    let disposed = false;
    function measure() {
      frame = 0;
      if (disposed || document.hidden || !node || !surface) return;
      const rect = node.getBoundingClientRect();
      const height = Math.max(1, window.innerHeight);
      const progress = Math.min(1, Math.max(0, (height - rect.top) / (height + rect.height)));
      const reveal = Math.min(1, Math.max(0, (height * 0.95 - rect.top) / (height * 0.45)));
      surface.style.setProperty('--bench-progress', motion?.matches ? '0.5' : progress.toFixed(4));
      surface.style.setProperty('--bench-reveal', motion?.matches ? '1' : reveal.toFixed(4));
      surface.dataset.scrollStage = progress < 0.34 ? 'read' : progress < 0.68 ? 'run' : 'result';
    }
    function schedule() {
      if (!frame && visible && !document.hidden && !disposed) {
        frame = requestAnimationFrame(measure);
      }
    }
    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else schedule();
    }
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            ([entry]) => {
              visible = entry?.isIntersecting ?? false;
              if (visible) schedule();
              else {
                cancelAnimationFrame(frame);
                frame = 0;
              }
            },
            { rootMargin: '120px' },
          );
    observer?.observe(node);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resize?.observe(node);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('visibilitychange', onVisibility);
    motion?.addEventListener('change', schedule);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      resize?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('visibilitychange', onVisibility);
      motion?.removeEventListener('change', schedule);
    };
  }, []);
  return ref;
}

/** Preserve the exact command text while tinting its shell prompt and executable. */
function Command({ value }: { readonly value: string }) {
  return (
    <code>
      {value.split('\n').map((line, index) => {
        const [prompt, executable, ...args] = line.split(' ');
        return (
          <span className={styles.commandLine} key={line}>
            {index > 0 ? '\n' : null}
            <span className={styles.commandPrompt}>{prompt}</span>{' '}
            <span className={styles.commandExecutable}>{executable}</span>{' '}
            <span>{args.join(' ')}</span>
          </span>
        );
      })}
    </code>
  );
}

/** Local examples only; real commands require the authenticated sandbox. */
export function LabPreview() {
  const workbenchRef = useWorkbenchScroll();
  const [topic, setTopic] = useState<Topic>('docker');
  const [hasRun, setHasRun] = useState(false);

  function selectTopic(next: Topic) {
    setTopic(next);
    setHasRun(false);
  }

  return (
    <div ref={workbenchRef} className={styles.workbenchFrame}>
      <div
        className={styles.workbench}
        data-testid="landing-lab-preview"
        data-topic={topic}
        data-has-run={hasRun}
      >
        <div className={styles.workbenchToolbar}>
          <span className={styles.workbenchLabel}>
            <span className={styles.workbenchIcon}>
              <Terminal size={19} aria-hidden="true" />
            </span>
            {t('home.preview.name')}
          </span>
          <span className={styles.demoLabel}>{t('home.preview.disclosure')}</span>
        </div>
        <div className={styles.workbenchBody}>
          <div className={styles.assignment}>
            <div
              className={styles.topicPicker}
              role="group"
              aria-label={t('home.preview.topic-label')}
            >
              {TOPICS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={topic === id}
                  aria-controls="landing-demo-console"
                  onClick={() => selectTopic(id)}
                >
                  {t(`home.topic.${id}`)}
                </button>
              ))}
            </div>
            <p className={styles.assignmentLabel}>{t('home.preview.task-label')}</p>
            <h3 className={styles.assignmentTitle}>{t(`home.demo.${topic}.title`)}</h3>
            <p className={styles.assignmentDescription}>{t(`home.demo.${topic}.description`)}</p>
            <div className={styles.demoActions}>
              <button
                type="button"
                className={styles.runButton}
                onClick={() => setHasRun(true)}
                disabled={hasRun}
                aria-controls="landing-demo-output"
              >
                {hasRun ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Play size={15} aria-hidden="true" />
                )}
                {hasRun ? t('home.preview.ran') : t('home.preview.run')}
              </button>
              <button
                type="button"
                className={styles.resetButton}
                onClick={() => setHasRun(false)}
                disabled={!hasRun}
                aria-label={t('home.preview.reset')}
                title={t('home.preview.reset')}
              >
                <RotateCcw size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div
            id="landing-demo-console"
            role="region"
            className={styles.terminal}
            aria-label={t('home.preview.console-label')}
          >
            <div className={styles.terminalToolbar}>
              <span className={styles.terminalTab}>
                <Terminal size={14} aria-hidden="true" />
                {t('home.preview.terminal-title')}
              </span>
              <span className={styles.terminalTopic}>{t(`home.topic.${topic}`)}</span>
            </div>
            <div className={styles.terminalContent}>
              <p className={styles.shellPrompt} translate="no">
                <span>{t('home.preview.prompt')}</span>
                <span>{t('home.preview.directory')}</span>
              </p>
              <p className={styles.terminalComment}>{t(`home.demo.${topic}.comment`)}</p>
              <pre className={styles.command} translate="no">
                <Command value={t(`home.demo.${topic}.command`)} />
              </pre>
              <p className={styles.outputLabel}>{t('home.preview.output-label')}</p>
              <div
                id="landing-demo-output"
                data-testid="landing-demo-output"
                className={styles.demoOutput}
                aria-live="polite"
                aria-atomic="true"
              >
                {hasRun ? (
                  <>
                    <pre translate="no">
                      <code>{t(`home.demo.${topic}.output`)}</code>
                    </pre>
                    <p className={styles.outputExplanation}>
                      <Check size={16} aria-hidden="true" />
                      {t(`home.demo.${topic}.result`)}
                    </p>
                  </>
                ) : (
                  <p className={styles.outputPlaceholder}>
                    <CornerDownRight size={16} aria-hidden="true" />
                    {t('home.preview.waiting')}
                  </p>
                )}
              </div>
            </div>
            <p className={styles.terminalFooter}>{t('home.preview.sandbox-note')}</p>
          </div>
        </div>
        <div className={styles.workbenchFlow}>
          <ol className={styles.flowSteps} aria-label={t('home.preview.flow-label')}>
            <li data-step="read">
              <BookOpen size={16} aria-hidden="true" />
              {t('home.preview.flow-read')}
            </li>
            <li data-step="run">
              <Play size={15} aria-hidden="true" />
              {t('home.preview.flow-run')}
            </li>
            <li data-step="result">
              <Check size={17} aria-hidden="true" />
              {t('home.preview.flow-result')}
            </li>
          </ol>
          <p>{t('home.preview.scroll-note')}</p>
        </div>
      </div>
    </div>
  );
}
