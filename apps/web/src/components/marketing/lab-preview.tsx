'use client';

import { useState } from 'react';
import { Check, CornerDownRight, Play, RotateCcw, Terminal } from 'lucide-react';
import { t } from '@devops-platform/copy';
import styles from './landing.module.css';

const TOPICS = ['linux', 'docker', 'kubernetes'] as const;
type Topic = (typeof TOPICS)[number];

/** Local examples only; real commands require the authenticated sandbox. */
export function LabPreview() {
  const [topic, setTopic] = useState<Topic>('docker');
  const [hasRun, setHasRun] = useState(false);

  function selectTopic(next: Topic) {
    setTopic(next);
    setHasRun(false);
  }

  return (
    <div className={styles.workbench} data-testid="landing-lab-preview">
      <div className={styles.workbenchToolbar}>
        <span className={styles.workbenchLabel}>
          <Terminal size={17} aria-hidden="true" />
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
          <h2 className={styles.assignmentTitle}>{t(`home.demo.${topic}.title`)}</h2>
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
            <span>{t('home.preview.terminal-title')}</span>
            <span>{t(`home.topic.${topic}`)}</span>
          </div>
          <div className={styles.terminalContent}>
            <p className={styles.terminalComment}>{t(`home.demo.${topic}.comment`)}</p>
            <pre className={styles.command} translate="no">
              <code>{t(`home.demo.${topic}.command`)}</code>
            </pre>
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
    </div>
  );
}
