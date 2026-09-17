/**
 * Bảng token màu RIÊNG của arena, và lớp vỏ mỏng buộc nó vào bộ phân giải chung.
 *
 * Phần khó — vì sao phải đi qua `getComputedStyle` rồi qua canvas 1×1 thay vì
 * đọc thẳng `getPropertyValue('--primary')` — nằm ở
 * `components/games/shared/scene-tokens.ts` và dùng chung cho mọi game. Ở đây
 * chỉ còn hai thứ mà duy nhất arena biết: danh sách token của nó, và ràng buộc
 * "thiếu một `statusToken` là đỏ lúc biên dịch".
 *
 * Mọi ký hiệu file này từng xuất ra vẫn còn nguyên tên và nguyên kiểu; chỗ gọi
 * không phải sửa gì.
 */

import type { ObjectView } from '@devops-platform/games';
import {
  fallbackSceneColors as fallbackSceneColorsOf,
  readSceneColors as readSceneColorsOf,
  type Rgb,
  type SceneColorsOf,
  type SceneColorsResultOf,
} from '../../games/shared/scene-tokens';

export { createCanvasColorResolver, parseCssRgb } from '../../games/shared/scene-tokens';
export type { Rgb };

/** Token màu ngữ nghĩa mà `ObjectView.statusToken` có thể mang. */
export type StatusToken = ObjectView['statusToken'];

/**
 * Token → tên biến CSS.
 *
 * `satisfies Record<StatusToken, string>` là một cổng lúc BIÊN DỊCH: lane B thêm
 * một giá trị `statusToken` mới vào hợp đồng mà bảng này chưa có ⇒ đỏ ngay ở
 * typecheck, thay vì ra một pod màu xám không ai giải thích được.
 *
 * Ràng buộc này ở lại ĐÂY chứ không lên module chung, vì module chung cố ý
 * không biết game nào có những token nào — nó nhận bảng và suy kiểu theo bảng.
 */
export const SCENE_TOKEN_VARS = {
  success: '--success',
  destructive: '--destructive',
  warning: '--warning',
  'status-progress': '--status-progress',
  'status-locked': '--status-locked',
  background: '--background',
  card: '--card',
  border: '--border',
  'muted-foreground': '--muted-foreground',
  foreground: '--foreground',
  primary: '--primary',
  /*
   * Màu theo LOẠI tài nguyên. Cùng nguồn với bảng công cụ bên trái, cố ý: nếu
   * Pod xanh dương ở bảng mà xanh lá trong cảnh thì người chơi phải học hai hệ
   * màu cho một khái niệm. `KIND_ACCENT` trong hợp đồng ánh xạ 26 `ResourceKind`
   * về đúng tám tên này.
   */
  'kind-pod': '--kind-pod',
  'kind-controller': '--kind-controller',
  'kind-batch': '--kind-batch',
  'kind-network': '--kind-network',
  'kind-config': '--kind-config',
  'kind-storage': '--kind-storage',
  'kind-security': '--kind-security',
  'kind-cluster': '--kind-cluster',
} as const satisfies Record<StatusToken, string> & Record<string, string>;

export type SceneTokenName = keyof typeof SCENE_TOKEN_VARS;

export const SCENE_TOKEN_NAMES = Object.keys(SCENE_TOKEN_VARS) as readonly SceneTokenName[];

export type SceneColors = SceneColorsOf<typeof SCENE_TOKEN_VARS>;

export type SceneColorsResult = SceneColorsResultOf<typeof SCENE_TOKEN_VARS>;

/**
 * Đọc bảng màu của arena.
 *
 * Chỉ buộc `SCENE_TOKEN_VARS` vào bộ phân giải chung — mọi ghi chú về `probe`
 * (phải nằm trong document, dưới `<html>` nơi `.dark` được gắn) ở module chung.
 */
export function readSceneColors(
  probe: HTMLElement,
  getComputedColor: (el: HTMLElement) => string,
  resolve: (css: string) => Rgb | null,
): SceneColorsResult {
  return readSceneColorsOf(SCENE_TOKEN_VARS, probe, getComputedColor, resolve);
}

/** Bảng dự phòng đồng nhất — dùng khi chưa có DOM (SSR, frame đầu). */
export function fallbackSceneColors(): SceneColors {
  return fallbackSceneColorsOf(SCENE_TOKEN_VARS);
}
