// Danh sách cho phép của SVG sơ đồ. Build chạy nó sau hậu xử lý; check chạy nó trên file đã commit.
// Hàm trả MẢNG lỗi (rỗng = đạt) để check gom được mọi lỗi của mọi file trong một lượt.
import { parseSvg, getAttr, walkSvg } from './svg.mjs';
import { normalizeHex } from './palette.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

const ELEMENTS = new Set([
  'svg', 'g', 'path', 'use', 'defs', 'symbol', 'title', 'desc', 'rect', 'circle', 'ellipse',
  'line', 'polyline', 'polygon', 'clipPath',
]);

const NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const NUM_LIST = /^[-+0-9.eE, ]+$/;
const isNum = (v) => NUM.test(v.trim());

// Mỗi thuộc tính cho phép kèm luật giá trị. Không có trong bảng ⇒ bị từ chối.
const ATTRS = {
  d: (v) => /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\- \n]*$/.test(v),
  points: (v) => NUM_LIST.test(v),
  x: isNum, y: isNum, width: isNum, height: isNum, cx: isNum, cy: isNum, r: isNum, rx: isNum, ry: isNum,
  x1: isNum, y1: isNum, x2: isNum, y2: isNum,
  transform: (v) => /^((matrix|translate|scale|rotate|skewX|skewY)\([-+0-9.eE, ]*\)\s*)+$/.test(v.trim()),
  viewBox: (v) => v.trim().split(/[\s,]+/).length === 4 && v.trim().split(/[\s,]+/).every(isNum),
  fill: () => true, stroke: () => true, // giá trị màu kiểm riêng ở checkColor
  'fill-opacity': isNum, 'stroke-opacity': isNum, opacity: isNum, 'stroke-width': isNum,
  'stroke-miterlimit': isNum, 'stroke-dashoffset': isNum,
  'stroke-dasharray': (v) => v === 'none' || NUM_LIST.test(v),
  'stroke-linecap': (v) => ['butt', 'round', 'square'].includes(v),
  'stroke-linejoin': (v) => ['miter', 'round', 'bevel'].includes(v),
  'fill-rule': (v) => ['nonzero', 'evenodd'].includes(v),
  'clip-rule': (v) => ['nonzero', 'evenodd'].includes(v),
  'clip-path': () => true, // kiểm ở checkRefs
  clipPathUnits: (v) => ['userSpaceOnUse', 'objectBoundingBox'].includes(v),
  class: () => true, id: () => true, href: () => true, 'xlink:href': () => true, // kiểm riêng
  role: (v) => v === 'img',
  xmlns: (v) => v === SVG_NS,
  'xmlns:xlink': (v) => v === XLINK_NS,
};
const ROOT_ONLY = new Set(['xmlns', 'xmlns:xlink', 'role', 'viewBox']);

/**
 * @param {string} svgText thân SVG (không có dòng đầu dlp-diagram)
 * @param {{ prefix: string, palette: ReturnType<import('./palette.mjs').loadPalette> }} ctx
 */
export function validateSvg(svgText, { prefix, palette }) {
  const problems = [];
  let root;
  try {
    root = parseSvg(svgText);
  } catch (e) {
    return [e.message];
  }
  const ink = palette.colors.find((c) => c.name === 'ink');
  const ids = new Set();
  const refs = [];

  for (const node of walkSvg(root)) {
    const at = `<${node.name}>`;
    if (!ELEMENTS.has(node.name)) {
      problems.push(`phần tử ${at} không nằm trong danh sách cho phép`);
      continue;
    }
    if (node.text.trim() !== '' && node.name !== 'title' && node.name !== 'desc') {
      problems.push(`${at} chứa chữ thô (chỉ <title>/<desc> được có chữ)`);
    }
    const classes = (getAttr(node, 'class') ?? '').split(/\s+/).filter(Boolean);
    for (const [key, value] of node.attrs) {
      const rule = ATTRS[key];
      if (!rule) {
        problems.push(`${at} có thuộc tính ${key} không được phép`);
      } else if (!rule(value)) {
        problems.push(`${at} ${key}="${value.slice(0, 60)}" sai khuôn giá trị`);
      } else if (ROOT_ONLY.has(key) && node !== root) {
        problems.push(`${at} ${key} chỉ được có ở <svg> gốc`);
      }
      if (key === 'id') {
        if (!value.startsWith(prefix) || !/^[\w.:-]+$/.test(value)) problems.push(`${at} id="${value}" thiếu tiền tố ${prefix}`);
        if (ids.has(value)) problems.push(`id "${value}" lặp lại`);
        ids.add(value);
      }
      if (key === 'href' || key === 'xlink:href') {
        const m = /^#([\w.:-]+)$/.exec(value);
        if (!m) problems.push(`${at} ${key}="${value.slice(0, 60)}" không phải tham chiếu nội bộ #id`);
        else refs.push(m[1]);
      }
      if (key === 'clip-path') {
        const m = /^url\(#([\w.:-]+)\)$/.exec(value);
        if (!m) problems.push(`${at} clip-path="${value.slice(0, 60)}" không phải url(#id) nội bộ`);
        else refs.push(m[1]);
      }
      if (key === 'fill' || key === 'stroke') checkColor(node, key, value, classes, palette, ink, problems);
    }
    for (const cls of classes) {
      const m = /^dia-([fs])-([a-z]+)$/.exec(cls);
      const attr = m?.[1] === 'f' ? 'fill' : 'stroke';
      const color = m && palette.colors.find((c) => c.name === m[2]);
      if (!color || color.name === 'ink' || normalizeHex(getAttr(node, attr) ?? '') !== color.light) {
        problems.push(`${at} class="${cls}" không khớp màu ${attr} của chính phần tử`);
      }
    }
  }
  for (const ref of refs) if (!ids.has(ref)) problems.push(`tham chiếu tới #${ref} nhưng không có id đó`);

  for (const key of ['xmlns', 'width', 'height', 'viewBox', 'role']) {
    if (getAttr(root, key) === undefined) problems.push(`<svg> thiếu ${key}`);
  }
  for (const key of ['width', 'height']) {
    const v = getAttr(root, key);
    if (v !== undefined && !(isNum(v) && Number(v) > 0)) problems.push(`<svg> ${key}="${v}" phải là số px dương`);
  }
  return problems;
}

// Thân .tex chỉ được là MỘT tikzpicture (+ \usetikzlibrary). Preamble, màu, đọc/ghi file là việc
// của bộ công cụ. Kiểm trên bản đã bỏ chú thích `%` để lời giải thích trong chú thích không bị bắt nhầm.
const TEX_FORBIDDEN = [
  [/\\(documentclass|usepackage|RequirePackage)\b/, 'thân chỉ chứa tikzpicture; preamble do scripts/diagrams/dlp-diagram.sty cấp'],
  [/\\(begin|end)\s*\{document\}/, 'không viết \\begin{document}: build.mjs tự bọc'],
  [/\\(definecolor|colorlet|providecolor)\b/, 'không định nghĩa màu; chỉ dùng tên dlp… trong palette.json'],
  [/\\(input|include|openin|openout|write|immediate|special|directlua|catcode)\b/, 'lệnh đọc/ghi/đổi catcode không được phép trong sơ đồ'],
  [/\b(dlp[a-z]+|black|white|gray|red|green|blue|cyan|magenta|yellow|orange|violet|teal|brown)\s*!\s*[\d.]/,
    'cấm pha màu kiểu dlpblue!15 (mã màu bị trộn mất); làm nhạt bằng `fill opacity=…`'],
];

export function validateTexBody(texBody) {
  const code = texBody.split('\n').map((l) => l.replace(/(^|[^\\])%.*$/, '$1')).join('\n');
  const problems = [];
  for (const [re, why] of TEX_FORBIDDEN) {
    const m = re.exec(code);
    if (m) problems.push(`dòng ${code.slice(0, m.index).split('\n').length}: "${m[0]}" — ${why}`);
  }
  const begins = code.match(/\\begin\s*\{tikzpicture\}/g)?.length ?? 0;
  const ends = code.match(/\\end\s*\{tikzpicture\}/g)?.length ?? 0;
  if (begins !== 1 || ends !== 1) problems.push(`cần đúng một tikzpicture (đang có ${begins} \\begin, ${ends} \\end)`);
  return problems;
}

function checkColor(node, key, value, classes, palette, ink, problems) {
  const at = `<${node.name}>`;
  if (value === 'none' || value === 'currentColor') return;
  const hex = normalizeHex(value);
  const color = hex && palette.byHex.get(hex);
  if (!color) {
    problems.push(`${at} ${key}="${value}" không thuộc bảng màu`);
  } else if (color === ink) {
    problems.push(`${at} ${key}="${value}" là màu ink — phải ghi currentColor`);
  } else if (!classes.includes(`dia-${key === 'fill' ? 'f' : 's'}-${color.name}`)) {
    problems.push(`${at} ${key}="${value}" thiếu class dia-${key === 'fill' ? 'f' : 's'}-${color.name}`);
  }
}
