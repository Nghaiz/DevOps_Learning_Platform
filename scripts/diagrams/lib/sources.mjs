// Băm nguồn, băm đầu ra và dòng đầu `<!-- dlp-diagram v1 src=… out=… -->` (contracts.md §C4).
// Dùng chung cho build.mjs và check.mjs: hai bên tính băm bằng CÙNG một hàm, không thể lệch nhau.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DIAGRAMS_DIR, toPosix } from './paths.mjs';

export const FORMAT = 'dlp-diagram v1';
const HEADER = /^<!-- dlp-diagram v1 src=([0-9a-f]{64}) out=([0-9a-f]{64}) -->$/;
// U+FEFF dựng từ mã số: viết thẳng ký tự (hay escape qua công cụ ghi file) dễ thành ký tự vô hình.
const LEADING_BOM = new RegExp('^' + String.fromCharCode(0xfeff));

/**
 * Những file mà đổi một byte là đầu ra có thể đổi theo. Băm nguồn của MỌI sơ đồ phủ cả chúng,
 * nên sửa bảng màu, preamble, font hay bộ hậu xử lý mà quên dựng lại thì `diagrams:check` đỏ.
 * KHÔNG có validate.mjs/check.mjs: luật kiểm thay đổi không làm byte đầu ra thay đổi.
 */
const TOOLCHAIN_FILES = ['palette.json', 'dlp-diagram.sty', 'lib/pipeline.mjs', 'lib/svg.mjs'];
const FONT_DIR = 'fonts';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Chuẩn hoá văn bản trước khi băm: bỏ BOM, CRLF → LF. Checkout Windows (autocrlf) không làm đỏ cổng. */
export const normalizeText = (s) => s.replace(LEADING_BOM, '').replace(/\r\n/g, '\n');

function fontFiles() {
  const out = [];
  // Chỉ các thư mục họ font; README.md nằm cạnh chúng thì bỏ qua.
  const families = readdirSync(join(DIAGRAMS_DIR, FONT_DIR), { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const family of families.map((d) => d.name).sort()) {
    for (const f of readdirSync(join(DIAGRAMS_DIR, FONT_DIR, family)).sort()) {
      if (/\.(ttf|otf)$/i.test(f)) out.push(`${FONT_DIR}/${family}/${f}`);
    }
  }
  return out;
}

let toolchainDigest = null;
/** Băm gộp của bộ công cụ, tính một lần mỗi tiến trình. */
export function toolchainHash() {
  if (toolchainDigest) return toolchainDigest;
  const h = createHash('sha256');
  for (const rel of TOOLCHAIN_FILES) {
    h.update(`${rel}\0${sha256(normalizeText(readFileSync(join(DIAGRAMS_DIR, rel), 'utf8')))}\n`);
  }
  for (const rel of fontFiles()) h.update(`${toPosix(rel)}\0${sha256(readFileSync(join(DIAGRAMS_DIR, rel)))}\n`);
  toolchainDigest = h.digest('hex');
  return toolchainDigest;
}

/** Băm nguồn = định dạng + bộ công cụ + thân .tex đã chuẩn hoá. */
export function sourceHash(texBody) {
  return sha256(`${FORMAT}\n${toolchainHash()}\nbody\0${normalizeText(texBody)}`);
}

export const outputHash = (svgBody) => sha256(normalizeText(svgBody));

/** Tiền tố id riêng của một sơ đồ. Theo nội dung chứ không theo tên file: đổi tên không phải dựng lại. */
export const idPrefix = (srcHash) => `dia-${srcHash.slice(0, 10)}-`;

export function formatSvgFile(srcHash, svgBody) {
  return `<!-- ${FORMAT} src=${srcHash} out=${outputHash(svgBody)} -->\n${svgBody}`;
}

/** Tách file .svg đã ghi thành dòng đầu + thân. Trả null nếu dòng đầu sai khuôn. */
export function splitSvgFile(fileText) {
  const text = normalizeText(fileText);
  const nl = text.indexOf('\n');
  const first = nl === -1 ? text : text.slice(0, nl);
  const m = HEADER.exec(first);
  if (!m) return null;
  return { src: m[1], out: m[2], body: text.slice(nl + 1) };
}
