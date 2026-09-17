/**
 * Bảng token màu RIÊNG của cảnh CI/CD, buộc vào bộ phân giải chung.
 *
 * Phần khó — vì sao phải đi qua `getComputedStyle` rồi qua canvas 1×1 thay vì
 * đọc thẳng `getPropertyValue('--primary')`, và vì sao `THREE.Color.setStyle`
 * không cứu được — nằm ở `games/shared/scene-tokens.ts` và dùng chung cho mọi
 * game. Ở đây chỉ còn hai thứ mà duy nhất game này biết: danh sách token của nó,
 * và ràng buộc "thiếu một `statusToken` là đỏ lúc biên dịch".
 *
 * ⛔ Không một mã màu nào ở file này, chỉ có TÊN biến CSS. Cổng
 * `pnpm tokens:check` cấm `#hex`, thang màu Tailwind và `0xRRGGBB` trong vùng
 * quét, và AC-D8 đòi cổng đó xanh **mà không thêm dòng `KNOWN_HARDCODED` nào**.
 */

import type { StageNodeView } from '@devops-platform/games';

import {
  fallbackSceneColors as fallbackSceneColorsOf,
  readSceneColors as readSceneColorsOf,
  type Rgb,
  type SceneColorsOf,
  type SceneColorsResultOf,
} from '../../shared/scene-tokens';

export { createCanvasColorResolver, parseCssRgb } from '../../shared/scene-tokens';
export type { Rgb };

/** Token màu ngữ nghĩa mà `StageNodeView.statusToken` có thể mang. */
export type CicdStatusToken = StageNodeView['statusToken'];

/**
 * Token → tên biến CSS.
 *
 * `satisfies Record<CicdStatusToken, string>` là một cổng lúc BIÊN DỊCH: engine
 * thêm một giá trị `statusToken` mới mà bảng này chưa có ⇒ đỏ ngay ở typecheck,
 * thay vì một node màu xám giữa cảnh mà không ai giải thích được.
 *
 * Năm token đầu đến thẳng từ `STATE_ENCODING`; phần còn lại là màu của khung
 * cảnh (nền, chữ, đường kẻ) và hai màu tương tác.
 */
export const CICD_TOKEN_VARS = {
  success: '--success',
  destructive: '--destructive',
  warning: '--warning',
  'status-progress': '--status-progress',
  'status-locked': '--status-locked',
  background: '--background',
  foreground: '--foreground',
  border: '--border',
  'muted-foreground': '--muted-foreground',
  /** Màu viền sáng của node đang chọn / đang rê, và màu đường găng. */
  primary: '--primary',
} as const satisfies Record<CicdStatusToken, string> & Record<string, string>;

export type CicdTokenName = keyof typeof CICD_TOKEN_VARS;

export type CicdSceneColors = SceneColorsOf<typeof CICD_TOKEN_VARS>;

export type CicdSceneColorsResult = SceneColorsResultOf<typeof CICD_TOKEN_VARS>;

/**
 * Đọc bảng màu của cảnh CI/CD.
 *
 * Mọi ghi chú về `probe` (phải nằm TRONG document và dưới `<html>`, nơi `.dark`
 * được gắn) ở module chung — đặt sai chỗ thì cảnh giữ nguyên bảng màu sáng khi
 * người dùng đổi sang theme tối, và không gì báo.
 */
export function readCicdSceneColors(
  probe: HTMLElement,
  getComputedColor: (el: HTMLElement) => string,
  resolve: (css: string) => Rgb | null,
): CicdSceneColorsResult {
  return readSceneColorsOf(CICD_TOKEN_VARS, probe, getComputedColor, resolve);
}

/** Bảng dự phòng đồng nhất — dùng khi chưa có DOM (khung hình đầu). */
export function fallbackCicdSceneColors(): CicdSceneColors {
  return fallbackSceneColorsOf(CICD_TOKEN_VARS);
}
