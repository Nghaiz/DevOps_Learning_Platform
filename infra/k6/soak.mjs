/**
 * soak.mjs — chạy dài (P12/12.D): giữ N phiên có WS mở liên tục, gõ định kỳ, và
 * lấy mẫu bốn đại lượng RÒ RỈ theo thời gian.
 *
 * Trả lời đúng một câu: "để hệ chạy vài giờ dưới tải vừa, có gì phình LÊN không?"
 *   go_goroutines, process_open_fds, process_resident_memory_bytes (gateway +
 *   orchestrator), và dlp_pool_claimed_size (orchestrator).
 * Cả bốn phải PHẲNG sau khi trừ tải — dốc lên là một lỗi, không phải ghi chú.
 *
 * ⛔ VÌ SAO SOAK LÀ PHÉP ĐO DUY NHẤT CHẠM ĐƯỢC RỦI RO SCORE-15 CỦA P3.
 * "Gateway không chịu nổi hàng nghìn WS" chưa từng bị đóng vì mọi lượt đo trước
 * đều là burst NGẮN — goroutine/fd rò rỉ chậm chỉ lộ qua thời gian, không qua
 * đỉnh tức thời. Một phiên burst 30s có thể rò 2 goroutine và không ai thấy;
 * 2 giờ thì con dốc ấy hiện rõ.
 *
 * ⚠ Metric của GATEWAY nằm trên cổng 8083 THEO TỪNG POD, KHÔNG qua Service
 * (services/terminal-gateway/cmd/session-probe/main.go: suyRaMetricsURL đổi
 * :8082→:8083). Với 2 replica phải đọc CẢ HAI — một leak chỉ hiện trên replica
 * đang giữ socket, và Service round-robin sẽ trộn hai nguồn thành nhiễu.
 *
 * Dùng (metric scrape qua port-forward do NGƯỜI GỌI dựng sẵn, xem soak-run.sh):
 *   ORCH_METRICS=http://localhost:18081/metrics \
 *   GW_METRICS=http://localhost:18083/metrics,http://localhost:18093/metrics \
 *   node soak.mjs --n 10 --hours 2
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openTerminal } from '../../plans/devops-learning-platform/reports/harness/2026-08-16-3i-concurrent-build/wsterm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i !== -1 ? process.argv[i + 1] : d;
};
const N = Number(arg('n', 10));
const HOURS = Number(arg('hours', 2));
const BASE = process.env.BASE_URL ?? 'https://dlp.192.168.94.130.sslip.io:30443';
const ORIGIN = process.env.ORIGIN ?? BASE;
const SCENARIO = process.env.SCENARIO ?? 'dlp-sandbox-basics';
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 60_000);
const TYPE_MS = Number(process.env.TYPE_MS ?? 30_000);
const ORCH = process.env.ORCH_METRICS ?? 'http://localhost:18081/metrics';
const GW = (process.env.GW_METRICS ?? 'http://localhost:18083/metrics').split(',').filter(Boolean);

const OUTDIR = join(HERE, 'out');
mkdirSync(OUTDIR, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const JSONL = join(OUTDIR, `soak-${STAMP}.jsonl`);

const users = JSON.parse(readFileSync(join(HERE, '.users.json'), 'utf8'));
if (users.length < N) { console.error(`pool ${users.length} < N ${N}`); process.exit(1); }

const log = (m) => console.log(`[soak ${new Date().toISOString().slice(11, 19)}] ${m}`);

/** Scrape các gauge cần từ một /metrics. Trả {} nếu không đọc được (KHÔNG ném:
 * một lần scrape hỏng không được làm chết soak 2 giờ; ghi null để phân biệt với 0). */
async function scrape(url, keys) {
  try {
    const txt = await (await fetch(url, { signal: AbortSignal.timeout(8000) })).text();
    const out = {};
    for (const k of keys) {
      const m = txt.match(new RegExp(`^${k}\\s+([0-9.e+-]+)`, 'm'));
      out[k] = m ? Number(m[1]) : null;
    }
    return out;
  } catch { return Object.fromEntries(keys.map((k) => [k, null])); }
}

const GAUGES = ['go_goroutines', 'process_open_fds', 'process_resident_memory_bytes'];
// ⛔ MẪU SỐ SỐNG. Bốn đại lượng rò rỉ "phẳng" KHÔNG có nghĩa gì nếu WS đã chết
// hết — phẳng khi ấy chỉ nói "không còn gì kết nối". `dlp_gateway_ws_active` là
// mẫu số biến mọi kết luận về độ phẳng thành có nghĩa.
// Đo được 2026-09-05: một timeout bất-hoạt-động 20s trong client làm 7/10 WS
// chết trong 10 phút mà MỌI đại lượng vẫn phẳng — đúng lớp green-that-proves-nothing.
const GW_GAUGES = [...GAUGES, 'dlp_gateway_ws_active'];

async function sample() {
  const orch = await scrape(ORCH, [...GAUGES, 'dlp_pool_claimed_size', 'dlp_pool_free_size']);
  const gw = await Promise.all(GW.map((u, i) => scrape(u, GW_GAUGES).then((v) => [`gw${i}`, v])));
  const row = { ts: new Date().toISOString(), t: Date.now(), wsMucTieu: mucTieuWs, moLai: soLanMoLai, orch, ...Object.fromEntries(gw) };
  appendFileSync(JSONL, JSON.stringify(row) + '\n');
  const wsActive = Object.keys(row).filter((k) => k.startsWith('gw'))
    .reduce((s2, k) => s2 + (row[k]?.dlp_gateway_ws_active ?? 0), 0);
  row.wsActive = wsActive;
  const g = row.gw0 ?? {};
  const canhBao = (moPhien && wsActive < mucTieuWs) ? `  ⚠ WS SỐNG ${wsActive}/${mucTieuWs}` : '';
  log(`orch{gr=${orch.go_goroutines} fd=${orch.process_open_fds} rss=${mb(orch.process_resident_memory_bytes)} claimed=${orch.dlp_pool_claimed_size}} ` +
    `gw{gr=${g.go_goroutines} ws=${wsActive}}${canhBao}`);
  return row;
}
const mb = (b) => (b == null ? '?' : `${Math.round(b / 1048576)}Mi`);

async function trpc(cookie, proc, input) {
  const r = await fetch(`${BASE}/api/trpc/${proc}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie },
    body: JSON.stringify(input),
  });
  const setC = r.headers.getSetCookie?.() ?? [];
  const b = await r.json();
  if (b.error) throw new Error(`${proc}: ${b.error.message ?? JSON.stringify(b.error)}`);
  return { data: b.result.data, setCookie: setC };
}

function mergeCookies(jar, setC) {
  let out = jar;
  for (const raw of setC) {
    const pair = raw.split(';')[0];
    if (!pair?.includes('=')) continue;
    const name = pair.split('=')[0];
    out = out.split('; ').filter((c) => c && !c.startsWith(`${name}=`)).concat(pair).join('; ');
  }
  return out;
}

// `sessions` là các Ô THEO CHỈ SỐ, không phải danh sách đẩy vào. Lượt mở lại
// phải trả đúng ô của user đó — dùng push thì sau vài lượt churn, chỉ số i và
// user không còn khớp nhau và log "phiên 3" nói về một người khác.
const sessions = [];
// Số WS kỳ vọng còn sống; chỉ bật kiểm sau khi đã mở xong (trước đó = 0 là đúng).
let mucTieuWs = 0;
let moPhien = false;
let soLanMoLai = 0;
const maDong = [];
async function openOne(i) {
  let jar = users[i].cookie;
  const { data, setCookie } = await trpc(jar, 'lessons.startSession',
    { scenarioId: SCENARIO, idempotencyKey: `soak-${i}-${Date.now()}` });
  jar = mergeCookies(jar, setCookie);
  const term = await openTerminal({ base: BASE, sessionId: data.session.id, cookie: jar, origin: ORIGIN });
  const s = { i, sessionId: data.session.id, term, jar, song: true };
  sessions[i] = s;

  // Timeout PHẢI dài hơn cả lượt soak: `waitClose` mặc định 120s và trả
  // `code:'TIMEOUT'` khi hết giờ — dùng mặc định thì mọi phiên còn sống bị đánh
  // dấu chết sau 2 phút, và vòng mở-lại sẽ churn liên tục một hệ hoàn toàn lành.
  void term.waitClose(HOURS * 3600_000 + 900_000).then((info) => {
    s.song = false;
    maDong.push({ i, code: info?.code ?? null, reason: String(info?.reason ?? ''), t: Date.now() });
    log(`phiên ${i} đóng: code=${info?.code} reason="${String(info?.reason ?? '').slice(0, 60)}"`);
  });
  return data.session.id;
}

// ⛔ VÌ SAO SOAK DÀI HƠN 2h BẮT BUỘC PHẢI CÓ HÀM NÀY.
//
// `hardCap` của orchestrator là **2h** và nó KHÔNG gia hạn được. Một lượt soak
// 4h vì thế mất SẠCH phiên ở đúng mốc giữa: từ đó `dlp_gateway_ws_active` về 0
// và hai giờ còn lại đo một hệ KHÔNG CÓ TẢI. Bốn đại lượng sẽ phẳng tuyệt đối,
// và "phẳng" ấy chỉ nói "không còn gì kết nối" — đúng lớp bẫy đã làm hỏng lượt
// soak đầu tiên của 12.D, chỉ khác nguyên nhân.
//
// Sửa ở HARNESS chứ không nâng `hardCap` của cụm: nâng hard-cap là đổi cấu hình
// production cho một phép đo, rồi phải nhớ trả lại — thứ mà một lượt chạy đêm
// không nên phụ thuộc vào. Mở lại phiên cũng gần với thực tế hơn: một lớp học 4
// tiếng vốn dĩ là nhiều phiên nối nhau, không phải một phiên bất tử.
//
// ⚠ ĐÁNH ĐỔI PHẢI KHAI: churn ở mốc 2h là một BIẾN MỚI so với lượt 2h (vốn
// không churn). Nên phần phân tích phải đọc cả hai nửa RIÊNG, đừng chỉ đọc một
// con dốc trải suốt 4h.
async function moLai() {
  if (!moPhien) return;
  for (let i = 0; i < N; i += 1) {
    const s = sessions[i];
    if (s && s.song) continue;
    if (s) {
      try { s.term.close(); } catch { /* đã đóng */ }
      try { await trpc(s.jar, 'lessons.endSession', { sessionId: s.sessionId }); } catch { /* phiên có thể đã bị reap */ }
    }
    sessions[i] = null;
    try { await openOne(i); soLanMoLai += 1; log(`mở lại phiên ${i} (lần thứ ${soLanMoLai})`); }
    catch (e) { log(`mở lại phiên ${i} THẤT BẠI: ${String(e.message).slice(0, 90)}`); }
    await new Promise((r) => setTimeout(r, 500));
  }
}

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
let typeSeq = 0;
async function typeRound() {
  const ch = ALPHA[typeSeq++ % ALPHA.length];
  for (const s of sessions) {
    if (!s || !s.song) continue;
    try { s.term.send(Buffer.from(ch, 'utf8'), 0x2); } catch { /* socket có thể đã rớt */ }
  }
}

async function cleanup() {
  log('dọn phiên…');
  for (const s of sessions) {
    if (!s) continue;
    try { s.term.close(); } catch { /* rồi */ }
    try { await trpc(s.jar, 'lessons.endSession', { sessionId: s.sessionId }); } catch { /* rồi */ }
  }
}

async function main() {
  log(`bắt đầu: N=${N}, ${HOURS}h, mẫu mỗi ${SAMPLE_MS / 1000}s, gõ mỗi ${TYPE_MS / 1000}s → ${JSONL}`);
  const t0Row = await sample(); // mốc TRƯỚC tải — trừ nền dựa vào nó
  writeFileSync(join(OUTDIR, `soak-${STAMP}.meta.json`), JSON.stringify(
    { n: N, hours: HOURS, base: BASE, scenario: SCENARIO, baseline: t0Row, jsonl: JSONL }, null, 2));

  let opened = 0;
  for (let i = 0; i < N; i += 1) {
    try { await openOne(i); opened += 1; }
    catch (e) { log(`phiên ${i} KHÔNG mở được: ${String(e.message).slice(0, 100)}`); }
    await new Promise((r) => setTimeout(r, 500)); // giãn để không đấm rate-limit
  }
  mucTieuWs = opened; moPhien = true;
  log(`đã mở ${opened}/${N} phiên có WS`);

  const deadline = Date.now() + HOURS * 3600_000;
  const sampler = setInterval(() => { void sample(); }, SAMPLE_MS);
  const typer = setInterval(() => { void typeRound(); }, TYPE_MS);
  // Nhịp 60s: đủ nhanh để cửa sổ "WS chết" không nuốt mất một mẫu nào đáng kể,
  // đủ chậm để không đấm rate-limit khi cả 10 phiên chạm hard-cap CÙNG LÚC.
  const boSung = setInterval(() => { void moLai(); }, 60_000);

  const stop = async () => {
    clearInterval(sampler); clearInterval(typer); clearInterval(boSung);
    const cuoi = await sample(); // mốc SAU
    if (moPhien && cuoi.wsActive < mucTieuWs) {
      log(`⛔ KHÔNG KẾT LUẬN ĐƯỢC ĐỘ PHẲNG: WS sống ${cuoi.wsActive}/${mucTieuWs} lúc kết thúc.`);
      log('   Bốn đại lượng có thể phẳng chỉ vì kết nối đã rụng, không phải vì không rò rỉ.');
    }
    log(`mở lại tổng cộng ${soLanMoLai} lượt; mã đóng đã thấy: ` +
      (maDong.length ? [...new Set(maDong.map((m) => String(m.code)))].join(',') : 'không có'));
    await cleanup();
    log('xong.');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  while (Date.now() < deadline) await new Promise((r) => setTimeout(r, 5000));
  await stop();
}

main().catch((e) => { console.error(e); process.exit(1); });
