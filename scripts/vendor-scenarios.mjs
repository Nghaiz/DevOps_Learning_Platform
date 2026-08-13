#!/usr/bin/env node
/**
 * Kéo nội dung scenario upstream về `content/scenarios/` — NGUYÊN VĂN, tại đúng
 * commit đã ghim trong `dlp.json` của từng scenario.
 *
 * SSOT là chính các file `content/scenarios/<id>/dlp.json`: script này KHÔNG có
 * danh sách repo nào cứng trong mã (`rules/code-conventions.md` § Data-Driven
 * Over Hardcoded). Thêm một scenario = tạo thư mục + `dlp.json`, rồi chạy
 * `--fetch`; không sửa dòng nào ở đây.
 *
 *   node scripts/vendor-scenarios.mjs --check    # so byte với upstream (mặc định)
 *   node scripts/vendor-scenarios.mjs --fetch    # tải/ghi đè file upstream
 *   node scripts/vendor-scenarios.mjs --check --only <id>
 *
 * `--check` là cổng chống drift: nó trả lời câu "nội dung trong repo có ĐÚNG là
 * thứ commit đã ghim nói không". Một dòng bị sửa tay sau khi vendor sẽ làm mọi
 * lời khai license trong `dlp.json` thành sai, và không có phép kiểm nào khác
 * nhìn thấy điều đó.
 *
 * ⚠ Script này CHẠM MẠNG nên KHÔNG nằm trong `pnpm test`. Nó là việc của người
 * nhập nội dung và (về sau) của một job CI chạy theo lịch.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_ROOT = path.join(REPO_ROOT, 'content', 'scenarios');
const SIDECAR = 'dlp.json';
const UPSTREAM_LICENSE = 'LICENSE.upstream';

/** File do TA sở hữu trong thư mục scenario — không bao giờ bị `--fetch` đụng vào. */
const PLATFORM_OWNED = new Set([SIDECAR]);

function parseArgs(argv) {
  const args = { mode: 'check', only: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fetch') args.mode = 'fetch';
    else if (arg === '--check') args.mode = 'check';
    else if (arg === '--only') {
      args.only = argv[i + 1] ?? null;
      i += 1;
    } else {
      throw new Error(`tham số không nhận ra: ${arg}`);
    }
  }
  return args;
}

function ghSlug(repoUrl) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(repoUrl);
  if (match === null) {
    throw new Error(
      `source.repo phải là URL GitHub dạng https://github.com/owner/repo — nhận "${repoUrl}"`,
    );
  }
  return { owner: match[1], repo: match[2] };
}

/**
 * Tải NHỊ PHÂN, không phải text.
 *
 * `response.text()` giải mã UTF-8, và với `assets/topology.png` điều đó có nghĩa
 * là mọi byte không hợp lệ UTF-8 bị thay bằng U+FFFD rồi ghi ngược ra đĩa — ảnh
 * hỏng. Tệ hơn: `--check` vẫn XANH, vì bản local (đã hỏng) đọc lại bằng utf8 cho
 * ra đúng chuỗi mà bản remote vừa bị mã hoá thành. Một cổng chống drift đồng loã
 * với chính sự hỏng nó phải bắt thì tệ hơn không có cổng nào.
 */
async function fetchBytes(url) {
  const headers = { 'user-agent': 'dlp-vendor-scenarios' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GET ${url} → HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function fetchText(url) {
  return (await fetchBytes(url)).toString('utf8');
}

/** Danh sách file upstream dưới `prefix`, tại đúng `commit`. */
async function listUpstreamFiles({ owner, repo }, commit, prefix) {
  const body = await fetchText(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${commit}?recursive=1`,
  );
  const tree = JSON.parse(body);
  if (tree.truncated === true) {
    throw new Error(`cây git của ${owner}/${repo}@${commit} bị cắt bớt — cần đổi sang clone thưa`);
  }
  const normalized = prefix.replace(/\/+$/, '');
  const under = `${normalized}/`;
  const files = tree.tree
    .filter((entry) => entry.type === 'blob' && entry.path.startsWith(under))
    .map((entry) => ({ upstreamPath: entry.path, relative: entry.path.slice(under.length) }));
  if (files.length === 0) {
    throw new Error(`không có file nào dưới "${normalized}" trong ${owner}/${repo}@${commit}`);
  }
  return files;
}

function rawUrl({ owner, repo }, commit, upstreamPath) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${upstreamPath}`;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 12);
}

/** Mọi file hiện có trong thư mục scenario, trừ file do ta sở hữu. */
async function listLocalFiles(dir) {
  const out = [];
  const walk = async (current, prefix) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(path.join(current, entry.name), relative);
      else if (!PLATFORM_OWNED.has(relative)) out.push(relative);
    }
  };
  await walk(dir, '');
  return out.sort();
}

async function processScenario(id, mode) {
  const dir = path.join(CONTENT_ROOT, id);
  const sidecar = JSON.parse(await readFile(path.join(dir, SIDECAR), 'utf8'));
  const { source } = sidecar;

  // `source: null` = bài FIRST-PARTY, soạn ngay trong repo này. Không có upstream
  // nên không có gì để so byte — và quan trọng hơn, `--fetch` mà chạy vào đây sẽ
  // XOÁ SẠCH thư mục (nhánh "xoá trước rồi ghi lại" ở dưới) rồi không tải lại
  // được gì. Bỏ qua sớm, và ĐẾM nó ra để "N scenario khớp upstream" không lặng lẽ
  // biến thành lời khai bao gồm cả bài chưa từng được kiểm.
  if (source === null) {
    return { count: 0, skipped: true, problems: [] };
  }

  const slug = ghSlug(source.repo);

  const upstream = await listUpstreamFiles(slug, source.commit, source.path);
  const wanted = new Map(upstream.map((f) => [f.relative, f]));
  wanted.set(UPSTREAM_LICENSE, { licenseUrl: source.licenseUrl });

  const problems = [];

  if (mode === 'fetch') {
    // Xoá trước rồi ghi lại: nếu upstream BỎ một file, giữ bản cũ lại sẽ tạo ra
    // một thư mục không khớp commit nào — đúng thứ `--check` sinh ra để chặn.
    for (const relative of await listLocalFiles(dir).catch(() => [])) {
      await rm(path.join(dir, relative), { force: true });
    }
  }

  for (const [relative, entry] of wanted) {
    const url = entry.licenseUrl ?? rawUrl(slug, source.commit, entry.upstreamPath);
    const remote = await fetchBytes(url);
    const target = path.join(dir, relative);
    if (mode === 'fetch') {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, remote);
      continue;
    }
    let local;
    try {
      local = await readFile(target);
    } catch {
      problems.push(`THIẾU  ${relative}`);
      continue;
    }
    if (!local.equals(remote)) {
      problems.push(`LỆCH   ${relative} (local ${sha256(local)} ≠ upstream ${sha256(remote)})`);
    }
  }

  if (mode === 'check') {
    for (const relative of await listLocalFiles(dir)) {
      if (!wanted.has(relative)) problems.push(`THỪA   ${relative} (không có ở upstream)`);
    }
  }

  return { id, count: wanted.size, problems };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = await readdir(CONTENT_ROOT, { withFileTypes: true });
  const ids = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => args.only === null || id === args.only)
    .sort();

  if (ids.length === 0) {
    throw new Error(
      `không có scenario nào trong ${CONTENT_ROOT}${args.only ? ` khớp --only ${args.only}` : ''}`,
    );
  }

  let failed = 0;
  for (const id of ids) {
    const result = await processScenario(id, args.mode);
    if (result.skipped === true) {
      console.log(`− ${id} — first-party (source: null), không có upstream để đối chiếu`);
    } else if (result.problems.length === 0) {
      console.log(
        `✓ ${id} — ${result.count} file ${args.mode === 'fetch' ? 'đã tải' : 'khớp upstream'}`,
      );
    } else {
      failed += 1;
      console.error(`✗ ${id}`);
      for (const problem of result.problems) console.error(`    ${problem}`);
    }
  }

  if (failed > 0) {
    console.error(
      `\n${failed}/${ids.length} scenario lệch với commit đã ghim. ` +
        `Chạy \`node scripts/vendor-scenarios.mjs --fetch\` để đồng bộ lại, ` +
        `hoặc cập nhật source.commit trong dlp.json nếu ĐANG CHỦ Ý nâng lên bản mới.`,
    );
    process.exitCode = 1;
  }
}

await main();
