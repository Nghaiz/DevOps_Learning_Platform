// Phần của quy trình dựng QUYẾT ĐỊNH byte đầu ra: khuôn .tex, cờ dvisvgm, hậu xử lý SVG.
// File này nằm trong băm nguồn (sources.mjs). Việc gọi tiến trình và thông báo lỗi ở build.mjs.
import { parseSvg, getAttr, removeAttr, serializeSvg, walkSvg } from './svg.mjs';
import { normalizeHex, luminance } from './palette.mjs';
import { idPrefix } from './sources.mjs';

/** 1pt (đơn vị viewBox của dvisvgm, = 1/72 in) → px CSS (1/96 in). */
const PT_TO_PX = 96 / 72;

export const DVISVGM_ARGS = ['--no-fonts', '--optimize=all', '--precision=2', '--bbox=papersize', '--relative'];

/**
 * Đưa các dòng `\usetikzlibrary{…}` của tác giả lên preamble. Trong thân, dòng đó thành `%`
 * để số dòng giữ nguyên: lỗi TeX ở dòng N của thân chính là dòng N của file nguồn.
 */
export function splitBody(texBody) {
  const libs = [];
  const body = texBody.split('\n').map((line) => {
    if (!/^\s*\\usetikzlibrary\s*\{[^}]*\}\s*(%.*)?$/.test(line)) return line;
    libs.push(line.trim());
    return '%';
  });
  return { libs, body: body.join('\n') };
}

/** Thân .tex → { tex: main.tex đầy đủ, bodyLine: số dòng (1-based) của dòng đầu thân trong main.tex }. */
export function renderTemplate(texBody, palette) {
  const { libs, body } = splitBody(texBody);
  const colors = palette.colors.map((c) => `\\definecolor{${c.tex}}{HTML}{${c.light.slice(1).toUpperCase()}}`);
  const head = [
    '\\documentclass[11pt,tikz,dvisvgm,border=4pt]{standalone}',
    ...colors,
    '\\usepackage{dlp-diagram}',
    ...libs,
    '\\begin{document}',
  ];
  return { tex: [...head, body, '\\end{document}', ''].join('\n'), bodyLine: head.length + 1 };
}

function nearestColor(hex, palette) {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [n >> 16, (n >> 8) & 255, n & 255];
  let best = null;
  for (const c of palette.colors) {
    const m = parseInt(c.light.slice(1), 16);
    const d = Math.hypot(rgb[0] - (m >> 16), rgb[1] - ((m >> 8) & 255), rgb[2] - (m & 255));
    if (!best || d < best.d) best = { c, d };
  }
  return best.c;
}

function mapColor(node, key, value, palette, classes) {
  if (value === 'none' || value === 'currentColor') return value;
  const hex = normalizeHex(value);
  const color = hex && palette.byHex.get(hex);
  if (!color) {
    const near = hex ? nearestColor(hex, palette) : null;
    const pale = hex && luminance(hex) > 0.6 && near?.name !== 'paper';
    throw new Error(
      `màu ${value} (${key} của <${node.name}>) không thuộc bảng màu` +
        (near ? `; gần nhất là ${near.tex} ${near.light}` : '') +
        (pale ? '. Trông như màu đã pha (vd. dlpblue!15): bỏ pha, dùng `fill opacity=…`' : '') +
        '. Chỉ dùng tên dlp… trong bảng (docs/diagrams.md).',
    );
  }
  if (color.name === 'ink') return 'currentColor';
  classes.push(`dia-${key === 'fill' ? 'f' : 's'}-${color.name}`);
  return color.light;
}

/** SVG thô của dvisvgm → SVG đã làm sạch, gắn class màu, tiền tố id, kích thước px. */
export function postprocess(rawSvg, srcHash, palette) {
  const root = parseSvg(rawSvg);
  const prefix = idPrefix(srcHash);

  const viewBox = getAttr(root, 'viewBox');
  const vb = viewBox?.trim().split(/[\s,]+/).map(Number);
  if (!vb || vb.length !== 4 || vb.some(Number.isNaN) || vb[2] <= 0 || vb[3] <= 0) {
    throw new Error(`dvisvgm trả viewBox hỏng: "${viewBox}"`);
  }
  root.attrs = [
    ['xmlns', 'http://www.w3.org/2000/svg'],
    ['width', String(Math.round(vb[2] * PT_TO_PX))],
    ['height', String(Math.round(vb[3] * PT_TO_PX))],
    ['viewBox', vb.join(' ')],
    ['role', 'img'],
  ];

  const referenced = new Set();
  for (const node of walkSvg(root)) {
    for (const [k, v] of node.attrs) {
      if (k === 'xlink:href' || k === 'href') referenced.add(v.replace(/^#/, ''));
      if (k === 'clip-path') referenced.add(v.replace(/^url\(#(.*)\)$/, '$1'));
    }
  }

  for (const node of walkSvg(root)) {
    if (node === root) continue;
    node.children = node.children.filter((c) => !(c.name === 'g' && c.children.length === 0 && c.attrs.every(([k]) => k !== 'id')));
    const classes = [];
    const attrs = [];
    for (const [k, v] of node.attrs) {
      if (k === 'id') {
        if (referenced.has(v)) attrs.push(['id', prefix + v]);
      } else if (k === 'xlink:href' || k === 'href') {
        attrs.push(['href', `#${prefix}${v.replace(/^#/, '')}`]);
      } else if (k === 'clip-path') {
        attrs.push(['clip-path', v.replace(/^url\(#(.*)\)$/, `url(#${prefix}$1)`)]);
      } else if (k === 'fill' || k === 'stroke') {
        attrs.push([k, mapColor(node, k, v, palette, classes)]);
      } else {
        attrs.push([k, v]);
      }
    }
    node.attrs = attrs;
    removeAttr(node, 'class');
    if (classes.length > 0) node.attrs.push(['class', classes.join(' ')]);
  }
  root.children = root.children.filter((c) => !(c.name === 'g' && c.children.length === 0));

  // dvisvgm xếp các khối glyph trong <defs> theo thứ tự KHÔNG ổn định giữa hai lần chạy (đo:
  // cùng nguồn, ba lần --force cho ba băm out khác nhau, chỉ khác vị trí khối g0-*). Thứ tự trong
  // <defs> không ảnh hưởng hình, nên sắp theo id (so code unit, không phụ thuộc locale).
  for (const node of walkSvg(root)) {
    if (node.name !== 'defs') continue;
    const key = (n) => getAttr(n, 'id') ?? '';
    node.children.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  }
  return serializeSvg(root);
}
