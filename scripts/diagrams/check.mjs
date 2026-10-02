#!/usr/bin/env node
// pnpm diagrams:check: cổng CI của sơ đồ (contracts.md §C4). KHÔNG cần TeX, KHÔNG cần pnpm install.
//
// Với mỗi diagrams/<tên>.tex (content/** và scripts/diagrams/examples):
//   1. có <tên>.svg cạnh nó, dòng đầu đúng khuôn `<!-- dlp-diagram v1 src=… out=… -->`
//   2. src = băm(thân .tex + bộ công cụ): sửa nguồn/bảng màu/font/hậu xử lý mà chưa dựng lại ⇒ đỏ
//   3. out = băm(phần SVG còn lại): sửa tay SVG ⇒ đỏ
//   4. SVG qua danh sách cho phép (phần tử, thuộc tính, màu, id có tiền tố, tham chiếu nội bộ)
// Cộng: .svg mồ côi (không có .tex) ⇒ đỏ; màu accent dưới 3:1 trên nền sáng hoặc tối ⇒ đỏ.
//
// Trước khi kiểm thật, cổng tự kiểm: lấy một cặp ví dụ đã commit, làm hỏng nó theo từng kiểu
// (sửa nguồn, sửa tay, chèn <script>, href ra ngoài, màu lạ…) và đòi MỖI kiểu phải đỏ. Một cổng
// không tự chứng minh được là nó biết đỏ thì xanh của nó không nói lên gì.
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { EXAMPLES_DIR, diagramFiles, repoRel } from './lib/paths.mjs';
import { loadPalette, paletteContrastProblems } from './lib/palette.mjs';
import { formatSvgFile, idPrefix, outputHash, sourceHash, splitSvgFile } from './lib/sources.mjs';
import { validateSvg } from './lib/validate.mjs';

/** Kiểm một cặp nguồn/SVG đã đọc vào bộ nhớ. svgText = null nghĩa là thiếu file. Trả mảng lỗi. */
export function checkPair(texText, svgText, palette) {
  if (svgText === null) return ['thiếu file .svg: chạy `pnpm diagrams:build <file.tex>` rồi commit cả hai'];
  const parts = splitSvgFile(svgText);
  if (!parts) return ['dòng đầu SVG không phải `<!-- dlp-diagram v1 src=<sha256> out=<sha256> -->`'];
  const problems = [];
  const src = sourceHash(texText);
  if (parts.src !== src) {
    problems.push('nguồn đã đổi (thân .tex, bảng màu, preamble, font hoặc bộ hậu xử lý) sau lần dựng cuối: chạy `pnpm diagrams:build`');
  }
  if (parts.out !== outputHash(parts.body)) {
    problems.push('SVG bị sửa tay sau khi dựng (băm out không khớp): đừng sửa .svg, sửa .tex rồi dựng lại');
  }
  problems.push(...validateSvg(parts.body, { prefix: idPrefix(parts.src), palette }));
  return problems;
}

/** Đột biến có chủ đích. Mỗi cái phải làm cổng đỏ; bản gốc phải xanh. */
function mutations(tex, svg) {
  const { src, body } = splitSvgFile(svg);
  // Kẻ sửa tay "khéo" tính lại cả băm out: chỉ danh sách cho phép còn bắt được.
  const forge = (b) => formatSvgFile(src, b);
  const inject = (frag) => forge(body.replace(/<\/svg>\n$/, `${frag}\n</svg>\n`));
  return [
    ['sửa .tex mà không dựng lại', `${tex}\n% sửa một dòng\n`, svg],
    ['sửa tay .svg', tex, svg.replace(/ width="(\d+)"/, (_, w) => ` width="${Number(w) + 1}"`)],
    ['thiếu .svg', tex, null],
    ['dòng đầu hỏng', tex, svg.replace('dlp-diagram v1', 'dlp-diagram v0')],
    ['chèn <script> (băm out giả mạo)', tex, inject('<script>alert(1)</script>')],
    ['thuộc tính onload', tex, forge(body.replace('<svg ', '<svg onload="alert(1)" '))],
    ['href ra ngoài', tex, inject('<use href="https://example.com/x.svg#a"/>')],
    ['thuộc tính style', tex, inject('<g style="fill:red"/>')],
    ['màu ngoài bảng', tex, inject('<rect width="1" height="1" fill="#000000"/>')],
    ['id không tiền tố', tex, inject('<path id="g0-1" d="M0 0"/>')],
    ['phần tử ngoài danh sách', tex, inject('<image href="#x" width="1" height="1"/>')],
  ];
}

function selfTest(palette) {
  const { tex } = diagramFiles();
  const example = tex.find((t) => t.startsWith(EXAMPLES_DIR) && existsSync(t.replace(/\.tex$/, '.svg')));
  if (!example) return { ok: false, lines: ['tự kiểm: không có cặp ví dụ nào trong scripts/diagrams/examples để làm đối chứng'] };
  const texText = readFileSync(example, 'utf8');
  const svgText = readFileSync(example.replace(/\.tex$/, '.svg'), 'utf8');
  const lines = [];
  const pristine = checkPair(texText, svgText, palette);
  if (pristine.length > 0) lines.push(`tự kiểm: bản gốc ${repoRel(example)} lẽ ra phải xanh: ${pristine[0]}`);
  const cases = mutations(texText, svgText);
  for (const [name, t, s] of cases) {
    if (checkPair(t, s, palette).length === 0) lines.push(`tự kiểm: đột biến "${name}" KHÔNG bị bắt, cổng đang mù`);
  }
  return { ok: lines.length === 0, lines, count: cases.length };
}

function main() {
  const palette = loadPalette();
  const failures = paletteContrastProblems(palette).map((p) => `✗ ${p}`);

  const test = selfTest(palette);
  if (!test.ok) {
    console.error(test.lines.map((l) => `✗ ${l}`).join('\n'));
    return 1;
  }

  const { tex, svg } = diagramFiles();
  for (const t of tex) {
    const svgPath = t.replace(/\.tex$/, '.svg');
    const svgText = existsSync(svgPath) ? readFileSync(svgPath, 'utf8') : null;
    for (const p of checkPair(readFileSync(t, 'utf8'), svgText, palette)) failures.push(`✗ ${repoRel(t)}: ${p}`);
  }
  const texSet = new Set(tex);
  for (const s of svg) {
    if (!texSet.has(s.replace(/\.svg$/, '.tex'))) failures.push(`✗ ${repoRel(s)}: SVG mồ côi, không có .tex nguồn`);
  }

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    console.error(`diagrams:check: ĐỎ (${failures.length} lỗi trên ${tex.length} sơ đồ)`);
    return 1;
  }
  console.log(`diagrams:check: xanh. ${tex.length} sơ đồ khớp nguồn, bảng màu đạt ≥${palette.minAccentContrast}:1 cả hai nền, tự kiểm bắt đủ ${test.count}/${test.count} đột biến`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
