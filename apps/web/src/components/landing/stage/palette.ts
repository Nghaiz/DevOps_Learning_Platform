import { Color, SRGBColorSpace } from 'three';

/**
 * Bảng màu của cảnh 3D, đọc từ ĐÚNG các biến `--l-*` mà CSS của landing dùng. Không khai màu lần
 * thứ hai ở đây: DOM và WebGL lệch màu nhau là thứ mắt thấy ngay, còn cổng `tokens:check` thì
 * cấm hex dưới apps/web/src.
 */
export const PALETTE_KEYS = [
  'bg',
  'bg-2',
  'bg-3',
  'ink',
  'muted',
  'faint',
  'red',
  'star',
  'gold',
  'linux',
  'git',
  'docker',
  'k8s',
  'cicd',
  'prod',
  'observe',
  'obs',
  'iac',
] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type StagePalette = Readonly<Record<PaletteKey, Color>>;

/**
 * Đọc một biến màu như trình duyệt trả về. Nguồn CSS viết `rgb(10, 13, 20)`, nhưng bộ tối ưu CSS
 * lúc `next build` rút gọn nó thành mã thập lục phân, nên lúc chạy phải nhận cả hai dạng (đo được
 * 2026-10-03: bản build trả dạng rút gọn, bản dev trả nguyên văn). Dạng khác trả `null` thay vì
 * đoán: một màu đọc hỏng mà rơi về trắng là lỗi im lặng.
 */
export function parseCssColor(raw: string): readonly [number, number, number] | null {
  const value = raw.trim();
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i.exec(value);
  if (rgb !== null) {
    const channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] as const;
    return channels.every((channel) => channel <= 255) ? channels : null;
  }
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value)?.[1];
  if (hex === undefined) return null;
  const full = hex.length === 3 ? Array.from(hex, (digit) => digit + digit).join('') : hex;
  const channel = (offset: number): number => Number.parseInt(full.slice(offset, offset + 2), 16);
  return [channel(0), channel(2), channel(4)];
}

export function readPalette(element: Element): StagePalette | null {
  const style = getComputedStyle(element);
  const entries: [PaletteKey, Color][] = [];
  for (const key of PALETTE_KEYS) {
    const rgb = parseCssColor(style.getPropertyValue(`--l-${key}`));
    if (rgb === null) {
      console.error(`[landing] palette variable --l-${key} missing or not a plain sRGB color`);
      return null;
    }
    entries.push([key, new Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, SRGBColorSpace)]);
  }
  return Object.fromEntries(entries) as StagePalette;
}

/** Màu phát sáng: nhân lên trên 1 để vượt ngưỡng bloom (chỉ thứ phát sáng mới loá, nền thì không). */
export const glow = (color: Color, strength = 2.4): Color => color.clone().multiplyScalar(strength);

/** Họ font thật (tên băm của next/font) để vẽ chữ lên CanvasTexture đúng font của trang. */
export function readFontFamily(element: Element, variable: string, fallback: string): string {
  const value = getComputedStyle(element).getPropertyValue(variable).trim();
  return value === '' ? fallback : value;
}
