'use client';

import { useState } from 'react';
import { Focus, GitBranch, Minus, Plus, Sparkles, X } from 'lucide-react';
import { motion, useReducedMotion } from '@devops-platform/motion/react';
import { sceneNodeId, type SceneProps } from '../shared/scene-props';
import { GitSvgScene } from './git-svg-scene';
import { ACCENT_STYLE } from './git-palette';

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
  return (
    <section className="git-map-stage" data-effects={effects} aria-label="Bản đồ lịch sử Git">
      <header className="git-map-toolbar">
        <span>
          <GitBranch size={15} /> BẢN ĐỒ COMMIT <i />
        </span>
        <div>
          <button
            type="button"
            aria-label="Thu nhỏ"
            disabled={zoom <= 0.6}
            onClick={() => setZoom((n) => Math.max(0.6, n - 0.2))}
          >
            <Minus size={16} />
          </button>
          <output aria-label="Tỉ lệ bản đồ">{Math.round(zoom * 100)}%</output>
          <button
            type="button"
            aria-label="Phóng to"
            disabled={zoom >= 2}
            onClick={() => setZoom((n) => Math.min(2, n + 0.2))}
          >
            <Plus size={16} />
          </button>
          <button type="button" aria-label="Đặt lại tỉ lệ" onClick={() => setZoom(1)}>
            <Focus size={16} />
          </button>
          <button
            type="button"
            aria-label="Hiệu ứng bản đồ"
            aria-pressed={effects}
            onClick={() => setEffects((v) => !v)}
          >
            <Sparkles size={16} />
          </button>
        </div>
      </header>
      <div className="git-map-scroll">
        <div className="git-map-stars" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <i
              key={i}
              style={{
                left: ((i * 37) % 100) + '%',
                top: ((i * 23) % 95) + '%',
                animationDelay: i * -0.7 + 's',
              }}
            />
          ))}
        </div>
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
            <GitBranch size={42} />
            <h3>Mọi lịch sử đều có một khởi đầu.</h3>
            <p>Kho đang trống. Đọc nhiệm vụ và tạo commit đầu tiên của bạn.</p>
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
            <span>TRẠM COMMIT / {selected.shortOid}</span>
            <button
              type="button"
              aria-label="Đóng thông tin commit"
              onClick={() => scene.interaction.onSelect(null)}
            >
              <X size={15} />
            </button>
          </header>
          <strong>{selected.message}</strong>
          <p>
            {ACCENT_STYLE[selected.accent].label} · {selected.repo}
          </p>
          <dl>
            <div>
              <dt>Tác giả</dt>
              <dd>{selected.author}</dd>
            </div>
            <div>
              <dt>Commit cha</dt>
              <dd>{selected.parents.map((oid) => oid.slice(0, 7)).join(', ') || 'Commit gốc'}</dd>
            </div>
          </dl>
        </div>
      )}
      <details className="git-file-pipeline">
        <summary>
          <span>◈ KHÔNG GIAN LÀM VIỆC</span>
          <span>
            {
              scene.view.files.filter(
                (file) => file.zone === 'worktree' && file.status !== 'unchanged',
              ).length
            }{' '}
            file thay đổi · Mở để xem
          </span>
        </summary>
        <div className="git-file-zones">
          {(['worktree', 'index', 'head'] as const).map((zone) => (
            <section key={zone} data-zone={zone}>
              <h3>
                {zone === 'worktree'
                  ? '01 · Working tree'
                  : zone === 'index'
                    ? '02 · Staging area'
                    : '03 · HEAD'}
                <small>
                  {zone === 'worktree'
                    ? 'git add →'
                    : zone === 'index'
                      ? 'git commit →'
                      : 'Đã ghi vào lịch sử'}
                </small>
              </h3>
              <ul>
                {scene.view.files
                  .filter((file) => file.zone === zone)
                  .map((file) => (
                    <li key={file.path} data-status={file.status}>
                      <code>{file.path}</code>
                      <span>
                        {
                          {
                            unchanged: 'Sạch',
                            modified: 'Đã sửa',
                            added: 'Thêm',
                            deleted: 'Xóa',
                            untracked: 'Mới',
                            conflicted: 'Xung đột',
                          }[file.status]
                        }
                      </span>
                    </li>
                  ))}
              </ul>
              {!scene.view.files.some((file) => file.zone === zone) && <p>Chưa có file</p>}
            </section>
          ))}
        </div>
      </details>
      <footer className="git-map-legend">
        <span>
          <i data-kind="head" /> @ HEAD
        </span>
        <span>
          <i data-kind="fresh" /> + Mới
        </span>
        <span>
          <i data-kind="duplicate" /> = Bản sao
        </span>
        <span>
          <i data-kind="conflict" /> ! Xung đột
        </span>
        <small>Chọn commit để khám phá · ↑↓←→ di chuyển</small>
      </footer>
    </section>
  );
}
