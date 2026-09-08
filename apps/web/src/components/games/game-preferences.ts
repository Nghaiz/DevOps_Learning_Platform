'use client';

import { useCallback, useEffect, useState } from 'react';
import type { QualityChoice } from './scene-quality';

/**
 * Tuỳ chọn hiển thị của game, lưu ở `localStorage` (§4.4).
 *
 * Khoá theo đúng khuôn `dlp.games.v1.<gameId>` mà §3.3 chốt, thêm hậu tố để
 * không giẫm lên bản lưu tiến độ của `core/progress.ts` (lane B sở hữu). Đây là
 * tuỳ chọn HIỂN THỊ, không phải tiến độ chơi: trộn chung thì một lần xoá tiến độ
 * sẽ kéo theo cả lựa chọn "tắt 3D" của người dùng — và người tắt 3D thường tắt
 * vì máy họ không kham nổi, tức đúng người ít chịu được nhất việc bị bật lại.
 */
export const SCENE_PREF_KEY = 'dlp.games.v1.k8s.display';

export interface DisplayPreference {
  readonly scene3d: boolean;
  readonly quality: QualityChoice;
}

/** Giao diện tối thiểu của `localStorage` — tiêm vào để test được ở env node. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isQuality(value: unknown): value is QualityChoice {
  return value === 'auto' || value === 'low' || value === 'medium' || value === 'high';
}

export function parseDisplayPreference(raw: string | null): Partial<DisplayPreference> | null {
  if (raw === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Giá trị rác (bản cũ, hoặc người dùng tự sửa) — coi như chưa lưu gì.
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const result: { scene3d?: boolean; quality?: QualityChoice } = {};
  if (typeof record['scene3d'] === 'boolean') {
    result.scene3d = record['scene3d'];
  }
  if (isQuality(record['quality'])) {
    result.quality = record['quality'];
  }
  return result;
}

/**
 * `localStorage` nếu đọc được, `null` nếu không.
 *
 * Cùng khuôn `browserStorage()` ở `session/workspace-tabs.ts`: truy cập
 * `localStorage` NÉM trong một số chế độ riêng tư, và một tuỳ chọn hiển thị
 * không bao giờ được phép làm sập trang game.
 */
export function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readDisplayPreference(storage: StorageLike | null): Partial<DisplayPreference> | null {
  if (storage === null) {
    return null;
  }
  try {
    return parseDisplayPreference(storage.getItem(SCENE_PREF_KEY));
  } catch {
    return null;
  }
}

export function writeDisplayPreference(storage: StorageLike | null, value: DisplayPreference): void {
  if (storage === null) {
    return;
  }
  try {
    storage.setItem(SCENE_PREF_KEY, JSON.stringify(value));
  } catch {
    // Storage bị chặn/đầy — phiên này vẫn chơi được, chỉ là lần sau không nhớ.
  }
}

/**
 * Mặc định khi CHƯA có gì lưu: 3D bật, trừ khi người dùng đã khai
 * `prefers-reduced-motion: reduce` — lúc đó mặc định là TẮT (§4.4).
 *
 * Đây là chỗ duy nhất `prefers-reduced-motion` quyết định *có nạp module hay
 * không*. Khối `@media` ở `globals.css` chỉ hạ thời lượng transition xuống ~0;
 * nó không thể ngăn một chunk WebGL được tải về. Hai cơ chế cho hai việc khác
 * nhau, không phải một cơ chế bị dựng hai lần.
 */
export function defaultScene3d(prefersReducedMotion: boolean): boolean {
  return !prefersReducedMotion;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export interface DisplayPreferenceState {
  /**
   * `null` = CHƯA ĐO ĐƯỢC (lượt render trên server và frame đầu ở client).
   *
   * Cùng lý do `useMinWidth` trả `null`: mọi giá trị boolean ở lần render đầu là
   * một phỏng đoán, và phỏng đoán sai gây hydration mismatch. Quan trọng hơn ở
   * đây: đoán "bật" rồi sửa lại sẽ NẠP chunk `three` một nhịp trước khi kịp biết
   * người dùng đã tắt nó — tức vi phạm đúng ô "bật thì không nạp module scene
   * chút nào" của §4.4.
   */
  readonly scene3d: boolean | null;
  readonly quality: QualityChoice;
  setScene3d(on: boolean): void;
  setQuality(choice: QualityChoice): void;
}

export function useDisplayPreference(): DisplayPreferenceState {
  const [scene3d, setScene3dState] = useState<boolean | null>(null);
  const [quality, setQualityState] = useState<QualityChoice>('auto');

  useEffect(() => {
    const stored = readDisplayPreference(browserStorage());
    setScene3dState(stored?.scene3d ?? defaultScene3d(prefersReducedMotion()));
    setQualityState(stored?.quality ?? 'auto');
  }, []);

  const persist = useCallback((next: DisplayPreference): void => {
    writeDisplayPreference(browserStorage(), next);
  }, []);

  const setScene3d = useCallback(
    (on: boolean): void => {
      setScene3dState(on);
      setQualityState((currentQuality) => {
        persist({ scene3d: on, quality: currentQuality });
        return currentQuality;
      });
    },
    [persist],
  );

  const setQuality = useCallback(
    (choice: QualityChoice): void => {
      setQualityState(choice);
      setScene3dState((currentScene3d) => {
        persist({ scene3d: currentScene3d ?? true, quality: choice });
        return currentScene3d;
      });
    },
    [persist],
  );

  return { scene3d, quality, setScene3d, setQuality };
}
