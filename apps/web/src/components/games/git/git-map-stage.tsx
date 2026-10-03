'use client';

import { useState } from 'react';
import { Focus, GitBranch, Minus, Plus, Sparkles, X } from 'lucide-react';
import { motion, useReducedMotion } from '@devops-platform/motion/react';
import { t } from '@devops-platform/copy';
import { sceneNodeId, type SceneProps } from '../shared/scene-props';
import { GitSvgScene } from './git-svg-scene';
import { ACCENT_STYLE } from './git-palette';

type FileZone = 'worktree' | 'index' | 'head';
type FileStatus = SceneProps['view']['files'][number]['status'];

const ZONE_TITLE: Readonly<Record<FileZone, string>> = {
  worktree: t('games.git.map.zone.worktree'),
  index: t('games.git.map.zone.index'),
  head: t('games.git.map.zone.head'),
};

const ZONE_NEXT: Readonly<Record<FileZone, string>> = {
  worktree: t('games.git.map.zone.next-worktree'),
  index: t('games.git.map.zone.next-index'),
  head: t('games.git.map.zone.next-head'),
};

const FILE_STATUS: Readonly<Record<FileStatus, string>> = {
  unchanged: t('games.git.map.file.unchanged'),
  modified: t('games.git.map.file.modified'),
  added: t('games.git.map.file.added'),
  deleted: t('games.git.map.file.deleted'),
  untracked: t('games.git.map.file.untracked'),
  conflicted: t('games.git.map.file.conflicted'),
};

/**
 * Sân 2D của màn chơi Git: thanh công cụ thu phóng, đồ thị commit, khung thông tin
 * commit đang chọn, ba vùng file (working tree → staging → HEAD) và chú giải.
 */
export function GitMapStage({
  scene,
  feedback,
  revision = 0,
}: {
  readonly scene: SceneProps;
  readonly feedback?: { readonly tone: 'success' | 'error'; readonly text: string } | null;
  readonly revision?: number;
}) {
  const [zoom, setZoom] = useState(1);
  const [effects, setEffects] = useState(true);
  const reduced = useReducedMotion();
  const selected = scene.view.nodes.find(
    (node) => sceneNodeId(node.repo, node.oid) === scene.interaction.selectedId,
  );
  const changed = scene.view.files.filter(
    (file) => file.zone === 'worktree' && file.status !== 'unchanged',
  ).length;
  return (
    <section className="git-map-stage" data-effects={effects} aria-label={t('games.git.map.aria')}>
      <header className="git-map-toolbar">
        <span>
          <GitBranch size={15} aria-hidden="true" /> {t('games.git.map.title')} <i />
        </span>
        <div>
          <button
            type="button"
            aria-label={t('games.git.map.zoom-out')}
            disabled={zoom <= 0.6}
            onClick={() => setZoom((n) => Math.max(0.6, n - 0.2))}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <output aria-label={t('games.git.map.zoom')}>{Math.round(zoom * 100)}%</output>
          <button
            type="button"
            aria-label={t('games.git.map.zoom-in')}
            disabled={zoom >= 2}
            onClick={() => setZoom((n) => Math.min(2, n + 0.2))}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
          <button type="button" aria-label={t('games.git.map.zoom-reset')} onClick={() => setZoom(1)}>
            <Focus size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t('games.git.map.effects')}
            aria-pressed={effects}
            onClick={() => setEffects((v) => !v)}
          >
            <Sparkles size={16} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="git-map-scroll">
        <div
          className="git-scene-size"
          style={{
            width: zoom * 100 + '%',
            minWidth:
              Math.max(
                440,
                scene.layouts.local.depthCount * 176 + 120,
                (scene.layouts.origin?.depthCount ?? 0) * 176 + 120,
              ) * zoom,
          }}
        >
          <GitSvgScene {...scene} effects={effects} />
        </div>
        {scene.view.nodes.length === 0 && (
          <div className="git-empty-repo">
            <GitBranch size={42} aria-hidden="true" />
            <h3>{t('games.git.map.empty-title')}</h3>
            <p>{t('games.git.map.empty-body')}</p>
          </div>
        )}
      </div>
      {feedback && (
        <motion.div
          key={revision}
          initial={{ opacity: 0, y: reduced || !effects ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="git-command-feedback"
          data-tone={feedback.tone}
          role="status"
        >
          {feedback.tone === 'error' ? '!' : '✓'} {feedback.text}
        </motion.div>
      )}
      {selected && (
        <div className="git-commit-inspector">
          <header>
            <span>{t('games.git.map.inspector', { oid: selected.shortOid })}</span>
            <button
              type="button"
              aria-label={t('games.git.map.inspector-close')}
              onClick={() => scene.interaction.onSelect(null)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </header>
          <strong>{selected.message}</strong>
          <p>
            {ACCENT_STYLE[selected.accent].label} · {selected.repo}
          </p>
          <dl>
            <div>
              <dt>{t('games.git.map.author')}</dt>
              <dd>{selected.author}</dd>
            </div>
            <div>
              <dt>{t('games.git.map.parents')}</dt>
              <dd>{selected.parents.map((oid) => oid.slice(0, 7)).join(', ') || t('games.git.map.root')}</dd>
            </div>
          </dl>
        </div>
      )}
      <details className="git-file-pipeline">
        <summary>
          <span>{t('games.git.map.files')}</span>
          <span>{t('games.git.map.files-changed', { n: changed })}</span>
        </summary>
        <div className="git-file-zones">
          {(['worktree', 'index', 'head'] as const).map((zone) => (
            <section key={zone} data-zone={zone}>
              <h3>
                {ZONE_TITLE[zone]}
                <small>{ZONE_NEXT[zone]}</small>
              </h3>
              <ul>
                {scene.view.files
                  .filter((file) => file.zone === zone)
                  .map((file) => (
                    <li key={file.path} data-status={file.status}>
                      <code>{file.path}</code>
                      <span>{FILE_STATUS[file.status]}</span>
                    </li>
                  ))}
              </ul>
              {!scene.view.files.some((file) => file.zone === zone) && <p>{t('games.git.map.zone.empty')}</p>}
            </section>
          ))}
        </div>
      </details>
      <footer className="git-map-legend">
        <span>
          <i data-kind="head" /> @ HEAD
        </span>
        <span>
          <i data-kind="fresh" /> {t('games.git.map.legend.fresh')}
        </span>
        <span>
          <i data-kind="duplicate" /> {t('games.git.map.legend.duplicate')}
        </span>
        <span>
          <i data-kind="conflict" /> {t('games.git.map.legend.conflict')}
        </span>
        <small>{t('games.git.map.legend.keys')}</small>
      </footer>
    </section>
  );
}
