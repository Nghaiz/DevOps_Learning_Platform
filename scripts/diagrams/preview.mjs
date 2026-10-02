#!/usr/bin/env node
// Dựng scripts/diagrams/examples/preview.html: mọi ví dụ nhúng inline trên ba nền
// (sáng có CSS theme, tối có CSS theme, sáng KHÔNG CSS để thấy màu fallback trong thuộc tính).
// build.mjs gọi tự động khi dựng lại ví dụ; chạy tay: node scripts/diagrams/preview.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EXAMPLES_DIR } from './lib/paths.mjs';
import { loadPalette } from './lib/palette.mjs';
import { splitSvgFile } from './lib/sources.mjs';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** CSS theme cho class dia-f-* / dia-s-*. FE dùng bảng này làm điểm khởi đầu (docs/diagrams.md). */
export function themeCss(palette, scope, theme) {
  return palette.colors
    .filter((c) => c.name !== 'ink')
    .flatMap((c) => [
      `${scope} .dia-f-${c.name}{fill:${c[theme]}}`,
      `${scope} .dia-s-${c.name}{stroke:${c[theme]}}`,
    ])
    .join('\n');
}

export function writePreview() {
  const palette = loadPalette();
  const { light, dark } = palette.surfaces;
  const examples = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.tex')).sort();
  const rows = examples.map((name) => {
    const tex = readFileSync(join(EXAMPLES_DIR, name), 'utf8');
    const caption = /^%\s*Mô tả:\s*(.+)$/m.exec(tex)?.[1] ?? name;
    const parts = splitSvgFile(readFileSync(join(EXAMPLES_DIR, name.replace(/\.tex$/, '.svg')), 'utf8'));
    if (!parts) throw new Error(`${name}: SVG chưa dựng hoặc dòng đầu hỏng`);
    const prefix = /id="(dia-[0-9a-f]{10}-)/.exec(parts.body)?.[1];
    // Cùng một SVG nhúng ba lần trong một trang ⇒ id trùng. Đổi tiền tố cho bản 2 và 3, như FE
    // sẽ phải làm nếu một sơ đồ xuất hiện hai lần trên cùng trang.
    const copy = (tag) => (prefix ? parts.body.split(prefix).join(`${prefix}${tag}-`) : parts.body);
    const fig = (cls, svg) => `<figure class="${cls}">${svg}<figcaption>${esc(caption)} · <code>${esc(name)}</code></figcaption></figure>`;
    return `<div class="row">\n${fig('t-light', parts.body)}\n${fig('t-dark', copy('dk'))}\n${fig('t-bare', copy('bare'))}\n</div>`;
  });
  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>dlp-diagram: xem trước ví dụ</title>
<style>
body{margin:0;padding:24px;font:15px/1.5 system-ui,sans-serif;background:#d9d6cc}
h1{font-size:18px;margin:0 0 4px} p{margin:0 0 16px;max-width:90ch}
.head,.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:12px;align-items:start}
.head div{font-weight:600}
figure{margin:0;padding:16px;border-radius:8px}
figure svg{display:block;max-width:100%;height:auto;margin:0 auto}
figcaption{font-size:13px;margin-top:10px}
.t-light{background:${light.surface};color:${light.text};border:1px solid ${light.hairline}}
.t-light figcaption{color:${light.muted}}
.t-dark{background:${dark.surface};color:${dark.text};border:1px solid ${dark.hairline}}
.t-dark figcaption{color:${dark.muted}}
.t-bare{background:#ffffff;color:${light.text};border:1px dashed ${light.hairline}}
.t-bare figcaption{color:${light.muted}}
${themeCss(palette, '.t-light', 'light')}
${themeCss(palette, '.t-dark', 'dark')}
</style>
</head>
<body>
<h1>dlp-diagram: ví dụ</h1>
<p>Sinh bởi scripts/diagrams/preview.mjs, đừng sửa tay. Cột 1 và 2 có CSS theme cho class <code>dia-f-*</code>/<code>dia-s-*</code>; cột 3 không có CSS nào, tức là màu fallback ghi sẵn trong thuộc tính.</p>
<div class="head"><div>Nền sáng ${light.surface}</div><div>Nền tối ${dark.surface}</div><div>Không CSS (fallback)</div></div>
${rows.join('\n')}
</body>
</html>
`;
  writeFileSync(join(EXAMPLES_DIR, 'preview.html'), html);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) writePreview();
