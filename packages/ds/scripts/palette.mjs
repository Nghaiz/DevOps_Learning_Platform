// Bảng màu của hệ thiết kế: SSOT số học cho packages/ds/src/styles/theme.css.
// Chạy: node packages/ds/scripts/palette.mjs           → in bảng tương phản
//       node packages/ds/scripts/palette.mjs --css     → in khối CSS biến màu
// Chuyển OKLCH → sRGB theo Björn Ottosson; tương phản theo WCAG 2.

export function oklchToLinear(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (rgb) => rgb.every((v) => v >= -0.001 && v <= 1.001);
const lum = (rgb) => {
  const c = rgb.map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a, b) => {
  const x = lum(oklchToLinear(...a));
  const y = lum(oklchToLinear(...b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const fmt = ([L, C, H]) => `oklch(${L} ${C} ${H})`;

// ── Nền và chữ ─────────────────────────────────────────────────────────────
export const NEUTRAL = {
  light: {
    canvas: [0.987, 0.004, 247],
    paper: [1, 0, 0],
    well: [0.966, 0.006, 247],
    'well-2': [0.942, 0.008, 247],
    ink: [0.235, 0.016, 262],
    'ink-2': [0.43, 0.016, 262],
    'ink-3': [0.515, 0.014, 262],
    rule: [0.915, 0.008, 250],
    'rule-2': [0.855, 0.01, 250],
    control: [0.64, 0.014, 255],
    focus: [0.53, 0.17, 258],
    overlay: [0.235, 0.016, 262],
  },
  dark: {
    canvas: [0.185, 0.006, 255],
    paper: [0.228, 0.007, 255],
    well: [0.214, 0.007, 255],
    'well-2': [0.262, 0.008, 255],
    ink: [0.945, 0.005, 255],
    'ink-2': [0.8, 0.008, 255],
    'ink-3': [0.69, 0.01, 255],
    rule: [0.292, 0.008, 255],
    'rule-2': [0.365, 0.01, 255],
    control: [0.58, 0.012, 255],
    focus: [0.74, 0.13, 255],
    overlay: [0.1, 0.005, 255],
  },
};

// ── Màu của sáu mục cha ────────────────────────────────────────────────────
// Một hue cho mỗi mục; độ sáng giống nhau giữa các mục nên không mục nào lấn mục nào.
export const SECTIONS = {
  learn: { h: 254, c: 1 },
  practice: { h: 158, c: 1 },
  judge: { h: 68, c: 0.92 },
  games: { h: 28, c: 1 },
  studio: { h: 326, c: 0.95 },
  admin: { h: 252, c: 0.32 },
};

// ── Màu chủ đề nội dung ────────────────────────────────────────────────────
export const TOPICS = {
  security: { h: 12, c: 1 },
  git: { h: 32, c: 1 },
  iac: { h: 55, c: 0.95 },
  linux: { h: 78, c: 0.9 },
  bash: { h: 108, c: 0.85 },
  cicd: { h: 150, c: 1 },
  networking: { h: 190, c: 0.9 },
  docker: { h: 228, c: 1 },
  kubernetes: { h: 262, c: 1 },
  observability: { h: 300, c: 0.95 },
  general: { h: 252, c: 0.25 },
};

// ── Trạng thái ─────────────────────────────────────────────────────────────
export const STATUS = {
  ok: { h: 152, c: 1 },
  warn: { h: 70, c: 0.92 },
  bad: { h: 25, c: 1 },
  info: { h: 254, c: 1 },
};

// Hạ chroma tới mức lớn nhất còn trong gam sRGB (giữ nguyên L và H).
export function fitC(L, C, H) {
  if (inGamut(oklchToLinear(L, C, H))) return [L, C, H];
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear(L, mid, H))) lo = mid;
    else hi = mid;
  }
  return [L, Math.floor(lo * 0.98 * 1000) / 1000, H];
}

// Bậc của một hue. `k` là hệ số nhân chroma; mỗi bậc được kéo về trong gam sRGB.
export function steps(h, k, theme) {
  const raw = rawSteps(h, k, theme);
  return Object.fromEntries(Object.entries(raw).map(([key, v]) => [key, fitC(...v)]));
}

function rawSteps(h, k, theme) {
  if (theme === 'light') {
    return {
      wash: [0.968, +(0.022 * k).toFixed(3), h],
      tint: [0.925, +(0.052 * k).toFixed(3), h],
      soft: [0.855, +(0.085 * k).toFixed(3), h],
      mid: [0.7, +(0.14 * k).toFixed(3), h],
      solid: [0.53, +(0.15 * k).toFixed(3), h],
      ink: [0.455, +(0.13 * k).toFixed(3), h],
    };
  }
  return {
    wash: [0.232, +(0.028 * k).toFixed(3), h],
    tint: [0.305, +(0.055 * k).toFixed(3), h],
    soft: [0.42, +(0.08 * k).toFixed(3), h],
    mid: [0.68, +(0.13 * k).toFixed(3), h],
    solid: [0.76, +(0.125 * k).toFixed(3), h],
    ink: [0.83, +(0.1 * k).toFixed(3), h],
  };
}

const failures = [];
function check(label, a, b, min) {
  const r = contrast(a, b);
  const ok = r >= min;
  if (!ok) failures.push(`${label}: ${r.toFixed(2)} < ${min}`);
  return `${label.padEnd(44)} ${r.toFixed(2).padStart(6)} ${ok ? '' : '  ✗ < ' + min}`;
}
function gamut(label, v) {
  if (!inGamut(oklchToLinear(...v))) failures.push(`${label} ngoài gam sRGB ${fmt(v)}`);
}

export function report() {
  const lines = [];
  for (const theme of ['light', 'dark']) {
    const n = NEUTRAL[theme];
    lines.push(`\n══ ${theme} ══`);
    for (const [k, v] of Object.entries(n)) gamut(`${theme}.${k}`, v);
    for (const t of ['ink', 'ink-2', 'ink-3']) {
      for (const bg of ['canvas', 'paper', 'well', 'well-2']) lines.push(check(`${t} / ${bg}`, n[t], n[bg], 4.5));
    }
    lines.push(check('control / paper (3:1 viền ô nhập)', n.control, n.paper, 3));
    lines.push(check('control / canvas', n.control, n.canvas, 3));
    lines.push(check('focus / canvas', n.focus, n.canvas, 3));
    lines.push(check('focus / paper', n.focus, n.paper, 3));
    const groups = [
      ['section', SECTIONS],
      ['topic', TOPICS],
      ['status', STATUS],
    ];
    for (const [gname, group] of groups) {
      for (const [name, { h, c }] of Object.entries(group)) {
        const s = steps(h, c, theme);
        for (const [k, v] of Object.entries(s)) gamut(`${theme}.${gname}.${name}.${k}`, v);
        lines.push(check(`${gname}.${name} ink / canvas`, s.ink, n.canvas, 4.5));
        lines.push(check(`${gname}.${name} ink / wash`, s.ink, s.wash, 4.5));
        lines.push(check(`${gname}.${name} ink / tint`, s.ink, s.tint, 4.5));
        const onSolid = theme === 'light' ? [1, 0, 0] : NEUTRAL.dark.canvas;
        lines.push(check(`${gname}.${name} chữ trên solid`, onSolid, s.solid, 4.5));
        lines.push(check(`${gname}.${name} mid / canvas (đồ hoạ)`, s.mid, n.canvas, 1.8));
      }
    }
  }
  return lines.join('\n');
}

export function css() {
  const block = (theme) => {
    const out = [];
    const n = NEUTRAL[theme];
    for (const [k, v] of Object.entries(n)) out.push(`  --${k}: ${fmt(v)};`);
    for (const [gname, group] of [
      ['s', SECTIONS],
      ['t', TOPICS],
      ['st', STATUS],
    ]) {
      for (const [name, { h, c }] of Object.entries(group)) {
        const s = steps(h, c, theme);
        for (const [k, v] of Object.entries(s)) out.push(`  --${gname}-${name}-${k}: ${fmt(v)};`);
      }
    }
    return out.join('\n');
  };
  // `.ds-island` đứng chung bộ chọn: một khối giao diện ds nằm trong màn chơi cũ lấy lại bảng màu
  // này, vì `.legacy-skin` của legacy.css khai đè `--ink`. Xem khối `.ds-island` trong theme.css.
  return `:root,\n.ds-island {\n${block('light')}\n}\n.dark,\n.dark .ds-island {\n${block('dark')}\n}\n`;
}

/** Các cặp màu trượt ngưỡng hoặc màu ngoài gam (rỗng là đạt). `report()` in bảng đầy đủ. */
export function audit() {
  failures.length = 0;
  report();
  return [...failures];
}

const THEME_FILE = new URL('../src/styles/theme.css', import.meta.url);
const BEGIN = '/* @palette:begin */';
const END = '/* @palette:end */';

/** Thay khối giữa hai dấu mốc trong theme.css bằng bản sinh từ bảng trên. */
export function withPalette(source) {
  const start = source.indexOf(BEGIN);
  const stop = source.indexOf(END);
  if (start < 0 || stop < start) throw new Error('theme.css thiếu dấu mốc @palette:begin/@palette:end');
  return `${source.slice(0, start + BEGIN.length)}\n${css()}${source.slice(stop)}`;
}

if (process.argv[1] && process.argv[1].endsWith('palette.mjs')) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  if (process.argv.includes('--css')) {
    process.stdout.write(css());
  } else if (process.argv.includes('--write')) {
    writeFileSync(THEME_FILE, withPalette(readFileSync(THEME_FILE, 'utf8')));
    console.log('Đã ghi khối màu vào packages/ds/src/styles/theme.css');
  } else if (process.argv.includes('--check')) {
    const current = readFileSync(THEME_FILE, 'utf8');
    report();
    if (withPalette(current) !== current) {
      console.error('theme.css lệch với palette.mjs. Chạy: node packages/ds/scripts/palette.mjs --write');
      process.exitCode = 1;
    } else if (failures.length > 0) {
      console.error(`${failures.length} cặp màu không đạt:\n${failures.join('\n')}`);
      process.exitCode = 1;
    } else {
      console.log('palette: theme.css khớp bảng, mọi cặp tương phản đạt.');
    }
  } else {
    console.log(report());
    console.log(failures.length === 0 ? '\nTất cả cặp đạt.' : `\n${failures.length} cặp KHÔNG đạt:\n` + failures.join('\n'));
    process.exitCode = failures.length === 0 ? 0 : 1;
  }
}
