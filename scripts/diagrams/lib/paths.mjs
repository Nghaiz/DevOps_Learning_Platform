// Đường dẫn gốc và cách tìm nguồn sơ đồ. Không phụ thuộc gói ngoài: check.mjs chạy trước `pnpm install`.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIAGRAMS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(DIAGRAMS_DIR, '..', '..');
export const EXAMPLES_DIR = join(DIAGRAMS_DIR, 'examples');
const CONTENT_DIR = join(REPO_ROOT, 'content');

export const toPosix = (p) => p.split(sep).join('/');
export const repoRel = (abs) => toPosix(relative(REPO_ROOT, abs));

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

/** Thư mục chứa sơ đồ: mọi `content/**\/diagrams/` cộng thư mục ví dụ của công cụ. */
export function diagramDirs() {
  const dirs = new Set();
  if (existsSync(CONTENT_DIR)) {
    for (const f of walk(CONTENT_DIR, [])) {
      if (/[\\/]diagrams[\\/][^\\/]+\.(tex|svg)$/.test(f)) dirs.add(dirname(f));
    }
  }
  if (existsSync(EXAMPLES_DIR)) dirs.add(EXAMPLES_DIR);
  return [...dirs].sort();
}

/** Mọi file trong các thư mục sơ đồ, tách theo đuôi. Sắp xếp để thứ tự xử lý (và log) ổn định. */
export function diagramFiles() {
  const tex = [];
  const svg = [];
  for (const dir of diagramDirs()) {
    for (const name of readdirSync(dir).sort()) {
      if (name.endsWith('.tex')) tex.push(join(dir, name));
      else if (name.endsWith('.svg')) svg.push(join(dir, name));
    }
  }
  return { tex, svg };
}

/** Đối số dòng lệnh → danh sách .tex tuyệt đối. Thư mục thì lấy mọi .tex bên trong. */
export function resolveTexArgs(args) {
  const out = [];
  for (const arg of args) {
    const abs = resolve(process.cwd(), arg);
    if (!existsSync(abs)) throw new Error(`không thấy ${arg}`);
    if (statSync(abs).isDirectory()) {
      out.push(...walk(abs, []).filter((f) => f.endsWith('.tex')));
    } else if (abs.endsWith('.tex')) {
      out.push(abs);
    } else {
      throw new Error(`${arg}: chỉ nhận file .tex hoặc thư mục`);
    }
  }
  return [...new Set(out)].sort();
}
