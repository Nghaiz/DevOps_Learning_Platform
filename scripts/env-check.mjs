#!/usr/bin/env node
/**
 * Cổng chống drift env. Không phụ thuộc gì ngoài stdlib — chạy được ngay sau
 * `git clone`, trước cả `pnpm install`.
 *
 * VÌ SAO TỒN TẠI: tên biến môi trường bị nhân bản ở BỐN nơi độc lập —
 *   1. code đọc nó          (process.env[...] / envx.String("..."))
 *   2. `.env.example`       (thứ dev copy sang `.env`)
 *   3. Helm deployment      (thứ chạy thật trên k8s)
 *   4. `.github/ci.env` + turbo.json (thứ CI cấp cho test)
 * Không có SSOT nào ép bốn danh sách này bằng nhau. Thêm một biến bắt buộc rồi
 * quên `.env.example` ⇒ người vừa clone repo gặp lỗi runtime khó hiểu; quên Helm
 * ⇒ pod CrashLoop trên VM; quên turbo.json `test.env` ⇒ turbo (envMode STRICT)
 * LỘT biến khỏi process con và test đỏ CHỈ ở CI. Cả ba đều đã là bẫy có thật
 * trong repo này (xem chú thích trong turbo.json).
 *
 * Cổng này đọc cả bốn nguồn và fail khi lệch. Chạy: `pnpm env:check`.
 *
 * CÚ PHÁP trong .env.example:
 *   FOO=bar                        khai ACTIVE — bắt buộc phải có code đọc nó
 *   # FOO=bar                      khai OPTIONAL — được phép chưa ai đọc (biến
 *                                  của phase sau, hoặc biến chỉ bật khi cần)
 *   # env-check: allow-unused      miễn trừ cho KEY ở dòng ngay dưới (biến do
 *   FOO=bar                        framework/container đọc, không có trong code)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');
const read = (p) => readFileSync(path.join(REPO, p), 'utf8');

/** Thư mục không bao giờ quét — rác build và dependency của người khác. */
const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', '.git', 'dist', 'gen', 'drizzle']);

function walk(dir, exts, out = []) {
  const abs = path.join(REPO, dir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(abs, entry);
    if (statSync(full).isDirectory()) walk(rel(full), exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(rel(full));
  }
  return out;
}

// ---------------------------------------------------------------- extractors

const matchAll = (text, re) => [...text.matchAll(re)].map((m) => m[1]);

/**
 * `_test.go` bị loại: envx_test.go đặt DLP_TEST_* bằng t.Setenv để test chính
 * envx — đó là fixture của test, không phải cấu hình của service.
 */
function envNamesFromGo(files) {
  const found = new Map();
  for (const f of files.filter((f) => !f.endsWith('_test.go'))) {
    const text = read(f);
    for (const name of [
      ...matchAll(text, /envx\.(?:String|Bool|Duration|Int)\(\s*"([A-Z][A-Z0-9_]*)"/g),
      ...matchAll(text, /os\.Getenv\(\s*"([A-Z][A-Z0-9_]*)"/g),
    ]) {
      if (!found.has(name)) found.set(name, f);
    }
  }
  return found;
}

function envNamesFromTs(files) {
  const found = new Map();
  for (const f of files) {
    const text = read(f);
    for (const name of [
      ...matchAll(text, /process\.env\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g),
      ...matchAll(text, /process\.env\.([A-Z][A-Z0-9_]*)/g),
      // requireEnv('X') / process.loadEnvFile không khai tên trực tiếp — env.ts
      // gói process.env lại, nhưng requireEnv nhận tên dạng literal nên bắt được.
      ...matchAll(text, /requireEnv\(\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\)/g),
    ]) {
      if (!found.has(name)) found.set(name, f);
    }
  }
  return found;
}

/** Biến BẮT BUỘC của web = đối số của requireEnv(). Thiếu là app không boot. */
function requiredTsNames(files) {
  const req = new Set();
  for (const f of files) {
    for (const n of matchAll(read(f), /requireEnv\(\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\)/g)) req.add(n);
  }
  return req;
}

function envNamesFromCompose(file) {
  const found = new Map();
  for (const name of matchAll(read(file), /\$\{([A-Z][A-Z0-9_]*)/g)) {
    if (!found.has(name)) found.set(name, file);
  }
  return found;
}

/**
 * Tên env trong Deployment. Lọc theo CHỮ HOA: `- name: http` / `- name: web` là
 * tên port và tên container, không phải biến môi trường.
 */
function envNamesFromHelm(file) {
  return new Set(matchAll(read(file), /^\s*-\s*name:\s*([A-Z][A-Z0-9_]*)\s*$/gm));
}

/**
 * turbo.json là JSONC — JSON.parse nghẹn ở comment. Không dùng regex trần: giá
 * trị `"https://turbo.build/schema.json"` chứa "//" và sẽ bị cắt mất nửa sau,
 * biến file thành JSON hỏng. Máy trạng thái nhỏ này bỏ qua comment NGOÀI chuỗi.
 */
function parseJsonc(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += c;
    }
  }
  // Dấu phẩy thừa trước } hoặc ] — hợp lệ trong JSONC, không hợp lệ trong JSON.
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

/** Trả { active:Set, optional:Set, allowUnused:Set } từ một file .env. */
function parseEnvFile(file) {
  const active = new Set();
  const optional = new Set();
  const allowUnused = new Set();
  let pendingAllow = false;

  for (const raw of read(file).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    if (/^#\s*env-check:\s*allow-unused\s*$/.test(line)) {
      pendingAllow = true;
      continue;
    }
    const commented = line.match(/^#\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (commented) {
      optional.add(commented[1]);
      pendingAllow = false;
      continue;
    }
    if (line.startsWith('#')) continue;
    const declared = line.match(/^([A-Z][A-Z0-9_]*)\s*=/);
    if (declared) {
      active.add(declared[1]);
      if (pendingAllow) allowUnused.add(declared[1]);
    }
    pendingAllow = false;
  }
  return { active, optional, allowUnused };
}

// -------------------------------------------------------------------- scopes

const webSources = [
  ...walk('apps/web', ['.ts', '.tsx', '.mjs']),
  ...walk('packages', ['.ts', '.tsx']),
];

const SCOPES = [
  {
    name: 'root (docker-compose)',
    envFile: '.env.example',
    used: envNamesFromCompose('docker-compose.yml'),
  },
  {
    name: 'apps/web',
    envFile: 'apps/web/.env.example',
    used: envNamesFromTs(webSources),
    helm: 'infra/helm/platform/templates/web-deployment.yaml',
  },
  {
    name: 'services/orchestrator',
    envFile: 'services/orchestrator/.env.example',
    used: envNamesFromGo(walk('services/orchestrator', ['.go'])),
    helm: 'infra/helm/platform/templates/orchestrator-deployment.yaml',
  },
  {
    name: 'services/terminal-gateway',
    envFile: 'services/terminal-gateway/.env.example',
    used: envNamesFromGo(walk('services/terminal-gateway', ['.go'])),
    helm: 'infra/helm/platform/templates/gateway-deployment.yaml',
  },
];

// -------------------------------------------------------------------- checks

const errors = [];
const fail = (scope, msg) => errors.push(`[${scope}] ${msg}`);

for (const scope of SCOPES) {
  const { active, optional, allowUnused } = parseEnvFile(scope.envFile);
  const declared = new Set([...active, ...optional]);

  for (const [name, where] of scope.used) {
    if (!declared.has(name)) {
      fail(scope.name, `code đọc ${name} (${where}) nhưng ${scope.envFile} không khai nó`);
    }
  }

  for (const name of active) {
    if (!scope.used.has(name) && !allowUnused.has(name)) {
      fail(
        scope.name,
        `${scope.envFile} khai ${name} nhưng không code nào đọc — xoá đi, đổi thành "# ${name}=..." (optional), ` +
          `hoặc thêm "# env-check: allow-unused" ngay trên nó nếu framework/container đọc`,
      );
    }
  }

  if (scope.helm) {
    for (const name of envNamesFromHelm(scope.helm)) {
      if (!declared.has(name)) {
        fail(
          scope.name,
          `${rel(scope.helm)} cấp ${name} cho pod nhưng ${scope.envFile} không khai nó`,
        );
      }
    }
  }
}

// --- CI: .github/ci.env phải đủ cho mọi biến BẮT BUỘC của web -----------------------
//
// Thiếu một biến ở đây thì test không đỏ ở máy dev (apps/web/.env che mất) mà chỉ
// đỏ trên runner — đúng họ lỗi "xanh ở dev, đỏ ở CI" đã dính nhiều lần.
const required = requiredTsNames(webSources);
const ci = parseEnvFile('.github/ci.env').active;
for (const name of required) {
  if (!ci.has(name))
    fail('CI', `.github/ci.env thiếu ${name} — code gọi requireEnv('${name}'), test sẽ đỏ trên runner`);
}

// --- turbo.json: envMode STRICT lột biến không khai --------------------------
const turbo = parseJsonc(read('turbo.json'));
const turboTestEnv = new Set(turbo.tasks?.test?.env ?? []);
for (const name of required) {
  if (!turboTestEnv.has(name)) {
    fail(
      'turbo',
      `turbo.json tasks.test.env thiếu ${name} — turbo (envMode STRICT) sẽ lột nó khỏi vitest trên CI`,
    );
  }
}
const turboBuildEnv = new Set(turbo.tasks?.build?.env ?? []);
for (const name of [...parseEnvFile('apps/web/.env.example').active].filter((n) =>
  n.startsWith('NEXT_PUBLIC_'),
)) {
  if (!turboBuildEnv.has(name)) {
    fail(
      'turbo',
      `turbo.json tasks.build.env thiếu ${name} — biến NEXT_PUBLIC_* được nướng vào bundle LÚC BUILD; ` +
        `không khai thì turbo trả CACHED của lần build với giá trị khác`,
    );
  }
}

// -------------------------------------------------------------------- report

if (errors.length > 0) {
  console.error('\nenv-check FAIL — env bị drift:\n');
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(`\n${errors.length} lỗi. Bản đồ env + cách sửa: docs/env/README.md\n`);
  process.exit(1);
}

const total = SCOPES.reduce((n, s) => n + s.used.size, 0);
console.log(
  `env-check OK — ${total} biến, ${SCOPES.length} scope, khớp code ↔ .env.example ↔ Helm ↔ CI.`,
);
