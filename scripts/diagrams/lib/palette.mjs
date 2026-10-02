// Đọc palette.json (SSOT màu sơ đồ) và các phép tính màu dùng chung cho build/check/preview.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIAGRAMS_DIR } from './paths.mjs';

const HEX6 = /^#[0-9a-f]{6}$/i;

/** '#fff' / '#FFFFFF' → '#ffffff'; trả null nếu không phải hex. */
export function normalizeHex(value) {
  const v = String(value).trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

export function loadPalette() {
  const raw = JSON.parse(readFileSync(join(DIAGRAMS_DIR, 'palette.json'), 'utf8'));
  const colors = Object.entries(raw.colors).map(([name, c]) => {
    if (!/^[a-z]+$/.test(name)) throw new Error(`palette.json: tên màu "${name}" chỉ được gồm chữ thường a-z`);
    for (const k of ['light', 'dark']) {
      if (!HEX6.test(c[k])) throw new Error(`palette.json: ${name}.${k} = "${c[k]}" không phải #RRGGBB`);
    }
    return { name, tex: `dlp${name}`, light: normalizeHex(c.light), dark: normalizeHex(c.dark), accent: c.accent === true };
  });
  const byHex = new Map();
  for (const c of colors) {
    if (byHex.has(c.light)) throw new Error(`palette.json: ${c.name} và ${byHex.get(c.light).name} trùng hex ${c.light}`);
    byHex.set(c.light, c);
  }
  if (!byHex.has(normalizeHex(raw.colors.ink?.light ?? ''))) throw new Error('palette.json: thiếu màu "ink"');
  return { colors, byHex, surfaces: raw.surfaces, minAccentContrast: raw.minAccentContrast };
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const n = parseInt(normalizeHex(hex).slice(1), 16);
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Tỉ lệ tương phản WCAG 2.x. */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Mọi màu accent phải đọc được trên cả mặt nền sáng lẫn tối. Trả danh sách lỗi (rỗng = đạt). */
export function paletteContrastProblems(palette) {
  const problems = [];
  for (const c of palette.colors.filter((x) => x.accent)) {
    for (const theme of ['light', 'dark']) {
      const bg = palette.surfaces[theme].surface;
      const fg = theme === 'light' ? c.light : c.dark;
      const ratio = contrast(fg, bg);
      if (ratio < palette.minAccentContrast) {
        problems.push(`palette: ${c.name} ${fg} trên nền ${theme} ${bg} chỉ đạt ${ratio.toFixed(2)}:1 (cần ≥${palette.minAccentContrast}:1)`);
      }
    }
  }
  return problems;
}
