'use client';

import { useEffect, useState } from 'react';
import { readProgress } from '../../k8s-arena/level-progress';
import { readCicdProgress } from '../cicd/cicd-progress';
import { readGitProgress } from '../git/git-progress';
import type { PlayableGameId } from './game-facts';

/**
 * Tiến độ của ba game, đọc từ ĐÚNG kho mà từng game tự ghi.
 *
 * Không có kho tổng hợp thứ hai: một bảng "đã qua bao nhiêu màn" lưu riêng sẽ
 * là trường suy ra được và lệch ngay lần đầu một game ghi mà quên cập nhật nó.
 * Mỗi game giữ kho của nó (K8s: lượt chơi ở `level-progress.ts`, Git:
 * `git-progress.ts`, CI/CD: `cicd-progress.ts`); trang `/games` chỉ đọc.
 */
export interface GameProgress {
  /** Màn đã qua ít nhất một lần. */
  readonly completed: ReadonlySet<string>;
  /** Màn đã mở ít nhất một lần, kể cả chưa qua. */
  readonly touched: ReadonlySet<string>;
}

export type ProgressByGame = Readonly<Record<PlayableGameId, GameProgress>>;

function fromEntries(
  entries: Readonly<Record<string, { readonly completed: boolean }>>,
): GameProgress {
  const completed = new Set<string>();
  const touched = new Set<string>();
  for (const [id, entry] of Object.entries(entries)) {
    touched.add(id);
    if (entry.completed) completed.add(id);
  }
  return { completed, touched };
}

export function readAllProgress(): ProgressByGame {
  return {
    k8s: fromEntries(readProgress()),
    git: fromEntries(readGitProgress()),
    cicd: fromEntries(readCicdProgress()),
  };
}

/**
 * `null` ở lần render đầu, rồi điền sau khi mount.
 *
 * `localStorage` không tồn tại lúc Next dựng HTML ở máy chủ. Đọc nó trong thân
 * component làm lần render đầu ở máy khách khác bản máy chủ, tức một lỗi
 * hydrate. "Chưa biết" phải khác "chưa chơi": nơi gọi hiện khung trung tính chứ
 * không hiện "Chưa chơi màn nào" rồi nhảy sang số thật.
 */
export function useGameProgress(): ProgressByGame | null {
  const [progress, setProgress] = useState<ProgressByGame | null>(null);
  useEffect(() => {
    setProgress(readAllProgress());
  }, []);
  return progress;
}
