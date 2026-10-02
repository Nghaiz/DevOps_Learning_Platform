#!/usr/bin/env node
// pnpm diagrams:build [đường dẫn .tex hoặc thư mục…] [--force] [--keep]
//
// Dựng diagrams/<tên>.tex → diagrams/<tên>.svg (contracts.md §C4). Không có đối số: mọi
// content/**/diagrams/*.tex và scripts/diagrams/examples/*.tex. Sơ đồ có băm nguồn chưa đổi
// thì bỏ qua (--force để dựng lại hết). --keep giữ thư mục tạm để soi khi TeX báo lỗi.
// Cần XeLaTeX + dvisvgm ≥ 3 trên PATH. CI không chạy file này; CI chạy check.mjs.
import { execFile, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DIAGRAMS_DIR, EXAMPLES_DIR, diagramFiles, repoRel, resolveTexArgs } from './lib/paths.mjs';
import { loadPalette, paletteContrastProblems } from './lib/palette.mjs';
import { DVISVGM_ARGS, postprocess, renderTemplate } from './lib/pipeline.mjs';
import { formatSvgFile, idPrefix, normalizeText, outputHash, sourceHash, splitSvgFile } from './lib/sources.mjs';
import { validateSvg, validateTexBody } from './lib/validate.mjs';
import { writePreview } from './preview.mjs';

const run = promisify(execFile);
const TEX_TIMEOUT_MS = 120_000;
const WIDE_PX = 760; // rộng hơn cột nội dung thì trình duyệt sẽ thu nhỏ, chữ nhỏ theo

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const paths = argv.filter((a) => !a.startsWith('--'));
if (flags.has('--help')) {
  console.log('pnpm diagrams:build [file.tex|thư mục…] [--force] [--keep]');
  process.exit(0);
}

function probeTool(cmd) {
  const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
  if (r.error) return null;
  return `${r.stdout}${r.stderr}`;
}

function toolchain() {
  const xe = probeTool('xelatex');
  const dv = probeTool('dvisvgm');
  const missing = [!xe && 'xelatex', !dv && 'dvisvgm'].filter(Boolean);
  if (missing.length > 0) {
    console.error(
      `✗ thiếu ${missing.join(' và ')} trên PATH.\n` +
        '  Cài MiKTeX (Windows) hoặc TeX Live (Linux/macOS: gói texlive-xetex, texlive-pictures,\n' +
        '  texlive-latex-extra, dvisvgm). Cần các gói LaTeX: standalone, pgf/tikz, fontspec, xcolor.\n' +
        '  Chỉ người SOẠN sơ đồ cần TeX; `pnpm diagrams:check` (CI) thì không.',
    );
    process.exit(2);
  }
  const isMiktex = /MiKTeX/i.test(xe);
  const dvVersion = /dvisvgm (\d+)\.(\d+)/.exec(dv);
  if (!dvVersion || Number(dvVersion[1]) < 3) {
    console.error(`✗ cần dvisvgm ≥ 3.0, đang có: ${dv.split('\n')[0]}`);
    process.exit(2);
  }
  const safety = isMiktex ? ['-disable-installer', '-disable-write18'] : ['-no-shell-escape'];
  return { xelatexArgs: ['-no-pdf', '-interaction=nonstopmode', '-halt-on-error', ...safety, 'main.tex'], versions: `${xe.split('\n')[0].trim()} · ${dv.split('\n')[0].trim()}` };
}

/** Trích lỗi TeX từ log, đổi số dòng của main.tex về số dòng của file nguồn. */
function texErrors(log, bodyLine) {
  const lines = log.split('\n');
  const out = [];
  for (let i = 0; i < lines.length && out.length < 12; i++) {
    if (lines[i].startsWith('!')) {
      out.push(lines[i]);
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const m = /^l\.(\d+)(.*)$/.exec(lines[j]);
        if (m) {
          const src = Number(m[1]) - bodyLine + 1;
          out.push(src >= 1 ? `  → dòng ${src} của file nguồn:${m[2]}` : `  → trong preamble (dòng ${m[1]} của main.tex)`);
          break;
        }
      }
    }
  }
  return out.length > 0 ? out : lines.slice(-15);
}

async function buildOne(texPath, ctx) {
  const rel = repoRel(texPath);
  const svgPath = texPath.replace(/\.tex$/, '.svg');
  const body = normalizeText(readFileSync(texPath, 'utf8'));
  const bodyProblems = validateTexBody(body);
  if (bodyProblems.length > 0) throw new Error(bodyProblems.join('\n'));

  const src = sourceHash(body);
  if (!flags.has('--force') && existsSync(svgPath)) {
    const prev = splitSvgFile(readFileSync(svgPath, 'utf8'));
    if (prev && prev.src === src && prev.out === outputHash(prev.body)) return { rel, status: 'skip' };
  }

  const tmp = mkdtempSync(join(tmpdir(), 'dlp-diagram-'));
  try {
    cpSync(join(DIAGRAMS_DIR, 'fonts'), join(tmp, 'fonts'), { recursive: true });
    cpSync(join(DIAGRAMS_DIR, 'dlp-diagram.sty'), join(tmp, 'dlp-diagram.sty'));
    const { tex, bodyLine } = renderTemplate(body, ctx.palette);
    writeFileSync(join(tmp, 'main.tex'), tex);
    try {
      await run('xelatex', ctx.xelatexArgs, { cwd: tmp, timeout: TEX_TIMEOUT_MS, windowsHide: true });
    } catch {
      const log = existsSync(join(tmp, 'main.log')) ? readFileSync(join(tmp, 'main.log'), 'utf8') : '';
      throw new Error(`XeLaTeX lỗi:\n${texErrors(log, bodyLine).join('\n')}`);
    }
    const log = readFileSync(join(tmp, 'main.log'), 'utf8');
    const lost = [...log.matchAll(/Missing character: There is no (.+?) in font/g)].map((m) => m[1]);
    if (lost.length > 0) {
      throw new Error(`font không có glyph cho: ${[...new Set(lost)].join(' ')}. Chữ đó sẽ biến mất khỏi hình; đổi chữ khác.`);
    }
    try {
      await run('dvisvgm', [...DVISVGM_ARGS, '-o', 'raw.svg', 'main.xdv'], { cwd: tmp, timeout: TEX_TIMEOUT_MS, windowsHide: true });
    } catch (e) {
      throw new Error(`dvisvgm lỗi:\n${String(e.stderr || e.stdout || e.message).trim()}`);
    }
    const svg = postprocess(readFileSync(join(tmp, 'raw.svg'), 'utf8'), src, ctx.palette);
    const problems = validateSvg(svg, { prefix: idPrefix(src), palette: ctx.palette });
    if (problems.length > 0) throw new Error(`SVG không qua danh sách cho phép:\n  ${problems.join('\n  ')}`);
    writeFileSync(svgPath, formatSvgFile(src, svg));
    const width = Number(/ width="([\d.]+)"/.exec(svg)[1]);
    const height = Number(/ height="([\d.]+)"/.exec(svg)[1]);
    return { rel, status: 'built', width, height, bytes: Buffer.byteLength(svg) };
  } finally {
    if (flags.has('--keep')) console.log(`  (giữ thư mục tạm: ${tmp})`);
    else rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const targets = paths.length > 0 ? resolveTexArgs(paths) : diagramFiles().tex;
  if (targets.length === 0) {
    console.log('diagrams:build: không có file .tex nào để dựng');
    return 0;
  }
  const palette = loadPalette();
  const paletteProblems = paletteContrastProblems(palette);
  if (paletteProblems.length > 0) {
    console.error(paletteProblems.map((p) => `✗ ${p}`).join('\n'));
    return 1;
  }
  const ctx = { palette, ...toolchain() };
  console.log(`diagrams:build: ${targets.length} nguồn · ${ctx.versions}`);

  const queue = [...targets];
  const results = [];
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      try {
        results.push(await buildOne(t, ctx));
      } catch (e) {
        results.push({ rel: repoRel(t), status: 'fail', error: e.message });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, availableParallelism(), targets.length) }, worker));

  results.sort((a, b) => a.rel.localeCompare(b.rel));
  for (const r of results) {
    if (r.status === 'fail') console.error(`✗ ${r.rel}\n  ${r.error.replace(/\n/g, '\n  ')}`);
    else if (r.status === 'skip') console.log(`· ${r.rel} (không đổi)`);
    else {
      const wide = r.width > WIDE_PX ? `  ⚠ rộng hơn ${WIDE_PX}px, chữ sẽ bị thu nhỏ theo cột` : '';
      console.log(`✓ ${r.rel}  ${r.width}×${r.height}px  ${(r.bytes / 1024).toFixed(1)} KiB${wide}`);
    }
  }
  if (results.some((r) => r.status === 'built' && r.rel.startsWith(repoRel(EXAMPLES_DIR)))) {
    writePreview();
    console.log(`✓ ${repoRel(join(EXAMPLES_DIR, 'preview.html'))} (dựng lại)`);
  }
  const failed = results.filter((r) => r.status === 'fail').length;
  if (failed > 0) console.error(`diagrams:build: ${failed}/${results.length} sơ đồ lỗi`);
  return failed > 0 ? 1 : 0;
}

process.exitCode = await main();
