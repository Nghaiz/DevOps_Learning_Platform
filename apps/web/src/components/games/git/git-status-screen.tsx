'use client';

import { ArrowLeft, GitBranch, LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react';
import { GitWorldArt } from './git-world-art';
import './git-odyssey.css';

export function GitStatusScreen({
  text,
  error = false,
  onRetry,
}: {
  readonly text: string;
  readonly error?: boolean;
  readonly onRetry?: (() => void) | undefined;
}) {
  return (
    <div className="git-odyssey git-loading">
      <div className="git-wordmark">
        <GitBranch size={23} />
        <span>
          GIT <b>ODYSSEY</b>
        </span>
      </div>
      <GitWorldArt />
      {error ? (
        <TriangleAlert size={30} className="text-warning" />
      ) : (
        <LoaderCircle className="git-loading-spinner" />
      )}
      <h1>{error ? 'Chưa thể mở cổng nhiệm vụ' : 'Đang kết nối hành trình…'}</h1>
      <p role={error ? 'alert' : 'status'}>{text}</p>
      {error && (
        <div className="git-status-actions">
          {onRetry && (
            <button className="git-button git-button-primary" onClick={onRetry}>
              <RotateCcw size={16} />
              Thử lại
            </button>
          )}
          <a className="git-button" href="/problems">
            <ArrowLeft size={16} />
            Về bài tập
          </a>
        </div>
      )}
    </div>
  );
}
