/**
 * run.mjs — driver: N người học, RÀO CHẮN chung trước `docker build`.
 *
 * Trả lời đúng một câu: "N người CÙNG build thì có ai hỏng không, và chậm bao nhiêu?"
 *
 * Bốn khẳng định của ngưỡng "không ai hỏng" (mỗi cái có vế bắt-nói-dối):
 *   1. N/N build ra image CHẠY được   ← vế 'chưa đạt' trước khi build (trong student.mjs)
 *   2. 0 pod evict / OOMKill          ← đọc lastState.terminated.reason, KHÔNG đọc "còn Running"
 *   3. 0 phiên hỏng giữa chừng        ← fails[] của từng worker
 *   4. 0 lượt bị quota từ chối        ← N == trần ⇒ phải là 0
 *
 * Dùng: node run.mjs <N>
 */
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..', '..');
const N = Number(process.argv[2] ?? 21);
const BARRIER_DIR = join(HERE, `.barrier-${N}`);
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:13000';
const ORIGIN = process.env.ORIGIN ?? 'https://dlp.192.168.94.130.sslip.io:30443';

const users = JSON.parse(readFileSync(join(ROOT, 'infra', 'k6', '.users.json'), 'utf8'));
if (users.length < N) { console.error(`pool chỉ có ${users.length} user, cần ${N}`); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kc = (args) => execFileSync('kubectl', args, { encoding: 'utf8', maxBuffer: 32e6 });

rmSync(BARRIER_DIR, { recursive: true, force: true });
mkdirSync(BARRIER_DIR, { recursive: true });

console.log(`\n═══ ${N} người học, rào chắn chung trước docker build ═══`);
console.log(`đường: ${BASE_URL} (ClusterIP qua port-forward; origin giữ nguyên ⇒ origin-check của app vẫn chạy)\n`);

// ── Ảnh chụp quota TRƯỚC ─────────────────────────────────────────────────────
const quotaBefore = JSON.parse(kc(['get', 'resourcequota', '-n', 'dlp-sandbox', '-o', 'json'])).items[0];
console.log(`quota trước: pods=${quotaBefore.status.used.pods}/${quotaBefore.status.hard.pods} ` +
  `cpu=${quotaBefore.status.used['requests.cpu']}/${quotaBefore.status.hard['requests.cpu']}`);

// ── Spawn ────────────────────────────────────────────────────────────────────
const t0 = Date.now();
const outs = new Array(N).fill('');
const procs = users.slice(0, N).map((u, i) => {
  const p = spawn(process.execPath, [join(HERE, 'student.mjs')], {
    env: { ...process.env, BASE_URL, ORIGIN, COOKIE: u.cookie, SID: String(i), BARRIER_DIR },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  p.stdout.on('data', (d) => { outs[i] += d.toString(); });
  return p;
});

// ── Chờ mọi worker tới rào chắn, rồi phát cờ GO ─────────────────────────────
const deadline = Date.now() + 900_000;
let readyCount = 0;
while (Date.now() < deadline) {
  readyCount = readdirSync(BARRIER_DIR).filter((f) => f.startsWith('ready-')).length;
  const dead = procs.filter((p) => p.exitCode !== null).length;
  if (readyCount >= N) break;
  if (readyCount + dead >= N) { console.log(`\n⚠ ${dead} worker chết trước rào chắn — phát GO cho ${readyCount} còn lại`); break; }
  process.stdout.write(`\r  chuẩn bị: ${readyCount}/${N} tới rào chắn (${dead} chết) — ${Math.round((Date.now() - t0) / 1000)}s`);
  await sleep(1000);
}
console.log(`\n\n▶ PHÁT CỜ GO — ${readyCount} người cùng build, ${new Date().toISOString()}\n`);
const tGo = Date.now();
writeFileSync(join(BARRIER_DIR, 'GO'), String(tGo));

// ── Chờ xong ─────────────────────────────────────────────────────────────────
await Promise.all(procs.map((p) => new Promise((r) => p.on('close', r))));
const wallAll = Date.now() - tGo;

// ── Gom kết quả ──────────────────────────────────────────────────────────────
const rows = outs.map((o, i) => {
  const line = o.trim().split('\n').filter((l) => l.startsWith('{')).pop();
  if (!line) return { sid: i, ok: false, fails: ['worker không phát ra JSON'], marks: {} };
  try { return JSON.parse(line); } catch { return { sid: i, ok: false, fails: ['JSON hỏng'], marks: {} }; }
});

// ── Khẳng định 2: evict / OOMKill — đọc terminated.reason, không đọc "Running"
const pods = JSON.parse(kc(['get', 'pods', '-n', 'dlp-sandbox', '-l', 'app=sandbox', '-o', 'json'])).items;
const bad = [];
for (const p of pods) {
  if (p.status.reason === 'Evicted') bad.push(`${p.metadata.name}: Evicted`);
  for (const cs of p.status.containerStatuses ?? []) {
    const term = cs.lastState?.terminated;
    if (term && term.reason !== 'Completed') bad.push(`${p.metadata.name}/${cs.name}: ${term.reason} exit=${term.exitCode}`);
    if (cs.restartCount > 0) bad.push(`${p.metadata.name}/${cs.name}: restart×${cs.restartCount}`);
  }
}

const quotaAfter = JSON.parse(kc(['get', 'resourcequota', '-n', 'dlp-sandbox', '-o', 'json'])).items[0];
const refusedQuota = rows.filter((r) => (r.fails ?? []).some((f) => /quota|RESOURCE_EXHAUSTED|refused/i.test(f)));

// ── Báo cáo ──────────────────────────────────────────────────────────────────
const okRows = rows.filter((r) => r.ok);
const builds = rows.map((r) => r.marks?.build).filter((x) => typeof x === 'number').sort((a, b) => a - b);
const pct = (p) => builds.length ? builds[Math.min(builds.length - 1, Math.floor(builds.length * p))] : NaN;

console.log('\n─── mỗi người ───');
console.log('sid  claim   dockerd   pull    BUILD   kết cục');
for (const r of rows.sort((a, b) => a.sid - b.sid)) {
  const m = r.marks ?? {};
  const f = (v) => (typeof v === 'number' ? `${(v / 1000).toFixed(1)}s`.padStart(7) : '      -');
  console.log(`${String(r.sid).padStart(3)}${f(m.claim)}${f(m.dockerdReady)}${f(m.pull)}${f(m.build)}   ${r.ok ? 'OK' : 'ĐỎ: ' + (r.fails ?? []).join(' | ').slice(0, 120)}`);
}

console.log('\n─── bốn khẳng định của ngưỡng "không ai hỏng" ───');
const A = [
  [`1. ${okRows.length}/${N} hoàn tất bài + image CHẠY được`, okRows.length === N],
  [`2. 0 pod evict/OOMKill/restart`, bad.length === 0, bad.join('; ')],
  [`3. 0 phiên hỏng giữa chừng`, rows.every((r) => r.ok)],
  [`4. 0 lượt bị quota từ chối`, refusedQuota.length === 0, refusedQuota.map((r) => r.sid).join(',')],
];
for (const [name, ok, detail] of A) console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);

console.log('\n─── "chậm" — phân bố thời gian docker build ───');
console.log(`  n=${builds.length}  p50=${(pct(0.5) / 1000).toFixed(1)}s  p95=${(pct(0.95) / 1000).toFixed(1)}s  ` +
  `max=${(builds.at(-1) / 1000).toFixed(1)}s  min=${(builds[0] / 1000).toFixed(1)}s`);
console.log(`  cả lớp build xong sau ${(wallAll / 1000).toFixed(1)}s kể từ cờ GO`);
console.log(`\nquota sau: pods=${quotaAfter.status.used.pods}/${quotaAfter.status.hard.pods} ` +
  `cpu=${quotaAfter.status.used['requests.cpu']}/${quotaAfter.status.hard['requests.cpu']}`);

writeFileSync(join(HERE, `result-n${N}.json`), JSON.stringify({
  n: N, wallAllMs: wallAll, tGo, rows, bad,
  quota: { before: quotaBefore.status, after: quotaAfter.status },
}, null, 2));
console.log(`\n→ result-n${N}.json`);
process.exitCode = A.every(([, ok]) => ok) ? 0 : 1;
