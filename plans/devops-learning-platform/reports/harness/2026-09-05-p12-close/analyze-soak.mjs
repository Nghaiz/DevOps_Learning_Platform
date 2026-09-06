/**
 * analyze-soak.mjs — kết luận độ PHẲNG của 4 đại lượng rò rỉ (P12/12.D).
 *
 * ⛔ HIỆN VẬT CỦA LƯỢT 2h — ĐỪNG SỬA, ĐỪNG DÙNG CHO LƯỢT MỚI.
 * Nó ghim cứng tên file `12d-soak.jsonl` và ở lại đây như bằng chứng của
 * report ngày 2026-09-05. Công cụ SỐNG là `infra/k6/analyze-soak.mjs`:
 * nhận đường dẫn làm tham số, và thêm ba phép đọc mà bản này thiếu —
 * tách NỬA ĐẦU/NỬA SAU (phân biệt plateau với rò rỉ chậm), phát hiện
 * KHOẢNG TRỐNG mẫu (VM ngủ), phát hiện TỤT ĐỘT NGỘT (pod restart reset
 * gauge). Bản mới tái tạo đúng cả bảy con số của bản này trên cùng dữ liệu.
 *
 * ⛔ CHỈ XÉT CỬA SỔ CÓ ĐỦ WS SỐNG. Một mẫu lấy lúc WS đã rụng thì "phẳng" chỉ
 * nói "không còn gì kết nối" — đúng lớp green-that-proves-nothing. Cửa sổ hợp lệ
 * = các mẫu có `wsActive == max(wsActive)`; hai mẫu cuối (phiên chạm hard-cap
 * rồi đóng) bị loại vì thế, và việc loại ấy được IN RA chứ không lặng lẽ.
 *
 * Phép kết luận: hồi quy tuyến tính đơn, quy độ dốc về "đơn vị / giờ".
 *
 * ⛔ PHÉP THỬ MỘT PHÍA — RÒ RỈ LÀ DỐC **LÊN**. Bản đầu lấy |dốc| và vì thế đọc
 * `fds 28→23` và `goroutines 309→300` (tức hệ đang HỒI PHỤC) thành "DỐC/hỏng".
 * Một đại lượng đi xuống hoặc đứng yên KHÔNG phải rò rỉ; chỉ chiều tăng mới là.
 * Ngưỡng chiều tăng:
 *   · goroutines / fds : dốc ≤ +2.0 /giờ
 *   · RSS              : dốc ≤ +5 MiB/giờ
 *   · pool:claimed     : dốc ≤ +0.5 /giờ
 * Kèm (đầu, cuối, min, max) để người đọc tự nhìn, không chỉ tin con dốc.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const rows = readFileSync(join(HERE, '12d-soak.jsonl'), 'utf8')
  .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

// wsActive không nằm trong file (nó được tính lúc log); tính lại từ gw*.
const wsOf = (r) => Object.keys(r).filter((k) => /^gw\d+$/.test(k))
  .reduce((s, k) => s + (r[k]?.dlp_gateway_ws_active ?? 0), 0);
const maxWs = Math.max(...rows.map(wsOf));
const valid = rows.filter((r) => wsOf(r) === maxWs);
const loai = rows.length - valid.length;

const gwSum = (r, key) => Object.keys(r).filter((k) => /^gw\d+$/.test(k))
  .reduce((s, k) => s + (r[k]?.[key] ?? 0), 0);

const series = {
  'orch go_goroutines': (r) => r.orch.go_goroutines,
  'orch process_open_fds': (r) => r.orch.process_open_fds,
  'orch RSS (MiB)': (r) => r.orch.process_resident_memory_bytes / 1048576,
  'orch dlp_pool_claimed_size': (r) => r.orch.dlp_pool_claimed_size,
  'gateway go_goroutines (tổng)': (r) => gwSum(r, 'go_goroutines'),
  'gateway process_open_fds (tổng)': (r) => gwSum(r, 'process_open_fds'),
  'gateway RSS (MiB, tổng)': (r) => gwSum(r, 'process_resident_memory_bytes') / 1048576,
};

/** Hồi quy tuyến tính; trả độ dốc theo đơn vị/giờ. */
function docPerHour(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0; let den = 0;
  for (let i = 0; i < n; i += 1) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? 0 : (num / den) * 3600_000; // ms → giờ
}

const t0 = valid[0].t;
const xs = valid.map((r) => r.t - t0);
const phutCuaSo = (valid.at(-1).t - t0) / 60000;

const nguong = (ten) => (/RSS/.test(ten) ? 5 : /claimed/.test(ten) ? 0.5 : 2.0);
const out = { soMau: rows.length, mauHopLe: valid.length, mauBiLoai: loai,
  wsSong: maxWs, phutCuaSo: Math.round(phutCuaSo), daiLuong: {} };

console.log(`mẫu: ${rows.length} · hợp lệ (ws=${maxWs}): ${valid.length} · loại: ${loai} · cửa sổ: ${Math.round(phutCuaSo)} phút\n`);
console.log('đại lượng                          đầu    cuối    min    max   dốc/giờ  kết luận');
let tatCaPhang = true;
for (const [ten, f] of Object.entries(series)) {
  const ys = valid.map(f).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (ys.length < valid.length * 0.9) { console.log(`${ten}: THIẾU MẪU (${ys.length}/${valid.length}) — không kết luận`); tatCaPhang = false; continue; }
  const d = docPerHour(xs.slice(0, ys.length), ys);
  const ng = nguong(ten);
  const phang = d <= ng; // một phía: chỉ chiều TĂNG mới là rò rỉ
  if (!phang) tatCaPhang = false;
  out.daiLuong[ten] = { dau: ys[0], cuoi: ys.at(-1), min: Math.min(...ys), max: Math.max(...ys),
    docPerHour: Number(d.toFixed(2)), nguong: ng, phang };
  console.log(`${ten.padEnd(34)}${String(ys[0].toFixed(0)).padStart(5)}${String(ys.at(-1).toFixed(0)).padStart(8)}` +
    `${String(Math.min(...ys).toFixed(0)).padStart(7)}${String(Math.max(...ys).toFixed(0)).padStart(7)}` +
    `${d.toFixed(2).padStart(10)}  ${phang ? (d < -0.5 ? '✅ giảm' : '✅ phẳng') : '❌ DỐC LÊN'}`);
}
out.ketLuan = tatCaPhang ? 'KHÔNG RÒ RỈ (không đại lượng nào dốc lên quá ngưỡng)' : 'CÓ ĐẠI LƯỢNG DỐC LÊN';
console.log(`\n⇒ ${out.ketLuan}`);
writeFileSync(join(HERE, '12d-soak-analysis.json'), JSON.stringify(out, null, 2));
