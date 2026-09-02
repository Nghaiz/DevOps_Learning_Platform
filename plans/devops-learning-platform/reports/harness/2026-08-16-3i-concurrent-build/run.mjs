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

// ── Đường hầm: driver TỰ dựng và TỰ canh ─────────────────────────────────────
//
// ⛔ ĐÂY LÀ MỘT LỖ HỔNG ĐÃ LÀM HỎNG MỘT LƯỢT ĐO (2026-09-03, lượt thứ ba).
// Trước khối này, harness giả định `kubectl port-forward` do người chạy dựng sẵn
// ở ngoài. Đường hầm ấy chết trong im lặng — và khi nó chết, CẢ 18 worker chết
// cùng lúc, còn báo cáo chỉ nói "18 worker chết trước rào chắn". Không dòng nào
// nói rằng thứ chết là cái ống, không phải hệ đang đo. Một phép đo mà chế độ
// hỏng của CÔNG CỤ đọc giống hệt chế độ hỏng của ĐỐI TƯỢNG là một phép đo hỏng.
//
// Nay driver tự spawn nó, tự kiểm sống bằng `/api/health`, và tự dựng lại. Nếu
// không dựng nổi thì DỪNG với exit 2 ("không đo được") thay vì chạy tiếp rồi báo
// một tập kết quả toàn đỏ mà nguyên nhân nằm ở máy chạy.
let pfProc = null;
function spawnPf() {
  const port = new URL(BASE_URL).port || '13000';
  pfProc = spawn('kubectl', ['port-forward', 'svc/platform-web', `${port}:3000`],
    { stdio: 'ignore' });
  // ⛔ spawn() BÁO LỖI QUA SỰ KIỆN, KHÔNG QUA throw.
  // Thiếu handler `error` thì một `kubectl` vắng mặt (ENOENT) làm CẢ driver
  // chết bằng stack trace và exit 1 — thay vì đi vào đúng nhánh "không đo
  // được" mà cổng này sinh ra để đi. Đo được 2026-09-03: chạy với PATH không có
  // kubectl ⇒ `spawn kubectl ENOENT` chưa bắt, exit 1, không một dòng nào của
  // thông báo chẩn đoán được in ra.
  pfProc.on('error', () => { pfProc = null; });
  pfProc.on('close', () => { pfProc = null; });
}
async function pfKhoe() {
  try {
    const r = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(4000) });
    return r.ok;
  } catch { return false; }
}
async function bảoĐảmĐườngHầm(nhãn) {
  for (let i = 0; i < 12; i += 1) {
    if (await pfKhoe()) return true;
    // ⛔ GIẾT RỒI DỰNG LẠI, KHÔNG chỉ "dựng nếu tiến trình đã chết".
    // Bản đầu của khối này viết `if (!pfProc) spawnPf()` và nó KHÔNG BAO GIỜ
    // dựng lại — đo được ngay lượt sau: `kubectl port-forward` vào trạng thái
    // GIỮ CỔNG mà không còn chuyển tiếp gì (netstat thấy 13000 LISTENING, curl
    // trả 000). Tiến trình còn sống nên điều kiện `!pfProc` sai vĩnh viễn, và
    // guard vừa viết ra để tự lành thì lặp thông báo lỗi tới hết lượt.
    // Cùng một lỗi với thứ nó định gác: kiểm SỰ TỒN TẠI thay vì kiểm HOẠT ĐỘNG.
    if (pfProc) { try { pfProc.kill(); } catch { /* đã chết */ } pfProc = null; }
    spawnPf();
    await sleep(2500);
  }
  console.error(`\n✖ KHÔNG ĐO ĐƯỢC: đường hầm tới ${BASE_URL} không lên (${nhãn}).`);
  console.error('  Đây là lỗi của MÁY CHẠY, không phải của hệ đang đo — đừng đọc kết quả nào.');
  // Nguyên nhân đã gặp: một `kubectl port-forward` MỒ CÔI của lượt trước vẫn
  // GIỮ cổng (netstat thấy LISTENING) nhưng không chuyển tiếp gì. Nó KHÔNG phải
  // tiến trình con của driver, nên `pfProc.kill()` ở trên không với tới nó.
  console.error(`  Kiểm trước: netstat -ano | grep :${new URL(BASE_URL).port || '13000'}`);
  console.error('  Có tiến trình lạ đang giữ cổng ⇒ giết theo PID rồi chạy lại.');
  return false;
}
if (!(await bảoĐảmĐườngHầm('trước khi spawn'))) {
  process.exit(2);
}
// Canh trong suốt lượt đo: 18 worker im lặng chết là triệu chứng của ống rụng.
const pfCanh = setInterval(() => { void bảoĐảmĐườngHầm('giữa lượt'); }, 10_000);
process.on('exit', () => {
  clearInterval(pfCanh);
  if (pfProc) pfProc.kill();
});

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
