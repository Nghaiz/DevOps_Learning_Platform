/**
 * analyze-soak.mjs — kết luận độ PHẲNG của các đại lượng rò rỉ từ một file
 * `soak-*.jsonl` do `soak.mjs` sinh ra.
 *
 * Dùng:  node analyze-soak.mjs <soak.jsonl> [ket-qua.json]
 *
 * Đường ra mặc định nằm CẠNH file vào (`<ten>-analysis.json`). Truyền tham số
 * thứ hai khi phân tích lại một lượt CŨ: mặc định sẽ đè lên hiện vật đã công bố
 * của lượt ấy, và một hiện vật bị đè lặng lẽ thì không ai truy được nữa.
 *
 * Bản này là phiên bản DÙNG LẠI ĐƯỢC của script một-lần ở
 * `plans/devops-learning-platform/reports/harness/2026-09-05-p12-close/analyze-soak.mjs`
 * (bản kia ghim cứng tên file của lượt 2h và ở lại đó như một hiện vật của
 * report). Ba thứ bản này có thêm, và mỗi thứ đóng một cách đọc sai đã lường được:
 *
 *   1. NỬA ĐẦU vs NỬA SAU — thứ DUY NHẤT phân biệt "plateau" với "rò rỉ chậm".
 *   2. Phát hiện KHOẢNG TRỐNG mẫu — VM ngủ/treo làm dốc-theo-giờ loãng đi.
 *   3. Phát hiện TỤT ĐỘT NGỘT — pod restart reset gauge về 0, và một lần reset
 *      giữa chừng kéo hồi quy xuống thành "phẳng" một cách ngoạn mục.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = process.argv[2];
if (!FILE) { console.error('cần đường dẫn tới soak-*.jsonl'); process.exit(2); }

const rows = readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
if (rows.length < 4) { console.error(`chỉ có ${rows.length} mẫu — không đủ để kết luận gì`); process.exit(2); }

// `wsActive` KHÔNG nằm trong file (soak.mjs tính nó SAU khi append) — tính lại.
const wsOf = (r) => Object.keys(r).filter((k) => /^gw\d+$/.test(k))
  .reduce((s, k) => s + (r[k]?.dlp_gateway_ws_active ?? 0), 0);
const gwSum = (r, key) => Object.keys(r).filter((k) => /^gw\d+$/.test(k))
  .reduce((s, k) => s + (r[k]?.[key] ?? 0), 0);

// ⛔ CỬA SỔ HỢP LỆ = CÁC MẪU CÓ ĐỦ WS SỐNG.
// "Phẳng" khi WS đã rụng chỉ nói "không còn gì kết nối" — đúng lớp
// green-that-proves-nothing đã làm hỏng lượt soak đầu tiên của 12.D.
const maxWs = Math.max(...rows.map(wsOf));
const hopLe = rows.filter((r) => wsOf(r) === maxWs);
const soLoai = rows.length - hopLe.length;

const series = {
  'orch go_goroutines': (r) => r.orch?.go_goroutines,
  'orch process_open_fds': (r) => r.orch?.process_open_fds,
  'orch RSS (MiB)': (r) => r.orch?.process_resident_memory_bytes / 1048576,
  'orch dlp_pool_claimed_size': (r) => r.orch?.dlp_pool_claimed_size,
  'gateway go_goroutines (tổng)': (r) => gwSum(r, 'go_goroutines'),
  'gateway process_open_fds (tổng)': (r) => gwSum(r, 'process_open_fds'),
  'gateway RSS (MiB, tổng)': (r) => gwSum(r, 'process_resident_memory_bytes') / 1048576,
};

/** Hồi quy tuyến tính đơn; trả độ dốc theo đơn vị/GIỜ. */
function docPerHour(xs, ys) {
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0; let den = 0;
  for (let i = 0; i < n; i += 1) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? 0 : (num / den) * 3600_000;
}

const nguong = (ten) => (/RSS/.test(ten) ? 5 : /claimed/.test(ten) ? 0.5 : 2.0);

// ── Khoảng trống mẫu ────────────────────────────────────────────────────────
// Nhịp mẫu danh nghĩa suy ra từ TRUNG VỊ, không từ hằng số: soak.mjs cho phép
// đổi SAMPLE_MS, và ghim 60s ở đây là dựng nguồn sự thật thứ hai.
const dt = [];
for (let i = 1; i < rows.length; i += 1) dt.push(rows[i].t - rows[i - 1].t);
const dtSorted = [...dt].sort((a, b) => a - b);
const nhip = dtSorted[Math.floor(dtSorted.length / 2)];
const khoangTrong = [];
for (let i = 1; i < rows.length; i += 1) {
  if (rows[i].t - rows[i - 1].t > nhip * 3) {
    khoangTrong.push({ tu: rows[i - 1].ts, den: rows[i].ts, phut: Math.round((rows[i].t - rows[i - 1].t) / 60000) });
  }
}

// ── Tụt đột ngột (dấu hiệu pod restart làm reset gauge) ─────────────────────
const tutDot = [];
for (const [ten, f] of Object.entries(series)) {
  for (let i = 1; i < hopLe.length; i += 1) {
    const a = f(hopLe[i - 1]); const b = f(hopLe[i]);
    if (typeof a !== 'number' || typeof b !== 'number' || !a) continue;
    if (b < a * 0.7) tutDot.push({ daiLuong: ten, tai: hopLe[i].ts, tu: Math.round(a), xuong: Math.round(b) });
  }
}

// ── Tính dốc: toàn cửa sổ + hai nửa ─────────────────────────────────────────
const t0 = hopLe[0].t;
const xsAll = hopLe.map((r) => r.t - t0);
const giua = Math.floor(hopLe.length / 2);
const phutCuaSo = (hopLe.at(-1).t - t0) / 60000;

const out = {
  file: FILE,
  soMau: rows.length, mauHopLe: hopLe.length, mauBiLoai: soLoai,
  wsSong: maxWs, phutCuaSo: Math.round(phutCuaSo),
  nhipMauGiay: Math.round(nhip / 1000),
  khoangTrong, tutDot,
  moLaiPhien: rows.at(-1)?.moLai ?? null,
  daiLuong: {},
};

console.log(`file: ${FILE}`);
console.log(`mẫu: ${rows.length} · hợp lệ (ws=${maxWs}): ${hopLe.length} · loại: ${soLoai} · cửa sổ: ${Math.round(phutCuaSo)} phút · nhịp ${Math.round(nhip / 1000)}s`);
if (out.moLaiPhien) console.log(`mở lại phiên trong lượt: ${out.moLaiPhien} lượt (hard-cap 2h)`);
if (khoangTrong.length) {
  console.log(`\n⚠ ${khoangTrong.length} KHOẢNG TRỐNG mẫu (VM ngủ / sampler kẹt?) — dốc-theo-giờ bị loãng ở đó:`);
  for (const k of khoangTrong) console.log(`   ${k.tu} → ${k.den} (${k.phut} phút)`);
}
if (tutDot.length) {
  console.log(`\n⛔ ${tutDot.length} lần TỤT ĐỘT NGỘT >30% — nghi pod restart reset gauge. Một lần reset kéo hồi quy xuống thành "phẳng":`);
  for (const t of tutDot) console.log(`   ${t.daiLuong} ${t.tu} → ${t.xuong} tại ${t.tai}`);
}

console.log('\nđại lượng                          đầu    cuối    min    max   dốc/giờ  nửa₁   nửa₂  kết luận');
let tatCaPhang = true;
for (const [ten, f] of Object.entries(series)) {
  const ys = hopLe.map(f);
  const ok = ys.every((v) => typeof v === 'number' && Number.isFinite(v));
  if (!ok) {
    console.log(`${ten.padEnd(34)}THIẾU MẪU — không kết luận`);
    out.daiLuong[ten] = { ketLuan: 'thiếu mẫu' };
    tatCaPhang = false;
    continue;
  }
  const d = docPerHour(xsAll, ys);
  const d1 = docPerHour(xsAll.slice(0, giua), ys.slice(0, giua));
  const d2 = docPerHour(xsAll.slice(giua), ys.slice(giua));
  const ng = nguong(ten);
  const phang = d <= ng; // MỘT PHÍA: rò rỉ là dốc LÊN. Đi xuống là hồi phục.
  if (!phang) tatCaPhang = false;

  // ⛔ PHÉP THỬ PLATEAU — lý do lượt 4h tồn tại.
  // Một đại lượng đi lên ở nửa đầu rồi ĐỨNG ở nửa sau là heap tiến tới plateau.
  // Một đại lượng giữ nguyên độ dốc ở cả hai nửa là rò rỉ. Chỉ nhìn con dốc
  // trải suốt cửa sổ thì hai thứ đó cho ra CÙNG một con số.
  let nhan = phang ? (d < -0.5 ? '✅ giảm' : '✅ phẳng') : '❌ DỐC LÊN';
  if (d > ng * 0.2 && d1 > 0) {
    if (d2 <= Math.max(ng * 0.2, d1 * 0.35)) nhan += ' · PLATEAU (nửa sau đã chững)';
    else if (d2 >= d1 * 0.8) nhan += ' · DỐC ĐỀU (nghi rò rỉ thật)';
  }

  out.daiLuong[ten] = {
    dau: ys[0], cuoi: ys.at(-1), min: Math.min(...ys), max: Math.max(...ys),
    docPerHour: Number(d.toFixed(2)), docNua1: Number(d1.toFixed(2)), docNua2: Number(d2.toFixed(2)),
    nguong: ng, phang, nhan,
  };
  console.log(`${ten.padEnd(34)}${String(ys[0].toFixed(0)).padStart(5)}${String(ys.at(-1).toFixed(0)).padStart(8)}` +
    `${String(Math.min(...ys).toFixed(0)).padStart(7)}${String(Math.max(...ys).toFixed(0)).padStart(7)}` +
    `${d.toFixed(2).padStart(10)}${d1.toFixed(2).padStart(7)}${d2.toFixed(2).padStart(7)}  ${nhan}`);
}

out.ketLuan = tatCaPhang ? 'KHÔNG RÒ RỈ (không đại lượng nào dốc lên quá ngưỡng)' : 'CÓ ĐẠI LƯỢNG DỐC LÊN';
console.log(`\n⇒ ${out.ketLuan}`);
if (khoangTrong.length || tutDot.length) {
  console.log('⚠ Kết luận trên CÓ ĐIỀU KIỆN: xem khoảng trống / tụt đột ngột ở trên trước khi trích dẫn nó.');
}

const dich = process.argv[3] ?? FILE.replace(/\.jsonl$/, '-analysis.json');
writeFileSync(dich, JSON.stringify(out, null, 2));
console.log(`→ ${dich}`);
