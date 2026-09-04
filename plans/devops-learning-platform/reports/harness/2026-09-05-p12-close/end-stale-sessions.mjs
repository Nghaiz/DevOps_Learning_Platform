/**
 * end-stale-sessions.mjs — dọn phiên MỒ CÔI bằng đúng đường API.
 *
 * Bối cảnh: một lượt soak bị kill từ ngoài nên `trap`/cleanup không chạy, để lại
 * 10 phiên sống chiếm quota. Chúng đẩy `pods` lên 23/28 và `requests.cpu` lên
 * 5750m/5850m — tức ĐÚNG trần, nên warm pool không refill được và mọi phép đo
 * sau đó không còn chỗ.
 *
 * ⛔ KHÔNG dọn bằng `kubectl delete pod`. Xoá pod làm LỆCH warm pool: orchestrator
 * còn giữ tên pod trong `pool:claimed` và có thể giao lại một tên đã chết
 * (`kubectl-delete-desyncs-warm-pool`). Đường dọn đúng là `lessons.endSession`
 * của CHÍNH chủ phiên — nó gỡ cả pod lẫn sổ sách.
 *
 * Nguồn danh sách phiên là Redis (`session:{id}` hash), vì image web đang chạy
 * (`p10a`) chưa có `me.activeSessions` của P13.
 *
 * Dùng:  node end-stale-sessions.mjs <mốc-epoch-giây: phiên TẠO TRƯỚC mốc này sẽ bị đóng>
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..', '..');
const BASE = process.env.BASE_URL ?? 'https://dlp.192.168.94.130.sslip.io:30443';
const ORIGIN = process.env.ORIGIN ?? BASE;
const CUTOFF = Number(process.argv[2] ?? 0);
if (!CUTOFF) { console.error('cần mốc epoch giây'); process.exit(2); }

const kc = (a) => execFileSync('kubectl', a, { encoding: 'utf8', maxBuffer: 32e6 });
const users = JSON.parse(readFileSync(join(ROOT, 'infra', 'k6', '.users.json'), 'utf8'));
const byUser = new Map(users.map((u) => [u.userId, u.cookie]));

const redisPod = kc(['get', 'pods', '-n', 'default', '--no-headers', '-o', 'custom-columns=:metadata.name'])
  .split('\n').map((s) => s.trim()).find((s) => s.includes('redis'));
const rcli = (args) => kc(['exec', '-n', 'default', redisPod, '--', 'sh', '-c',
  `redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ${args} 2>/dev/null`]).trim();

const keys = rcli('--scan --pattern "session:*"').split('\n')
  .map((s) => s.trim()).filter((s) => /^session:[0-9a-f]+$/.test(s));
console.log(`${keys.length} session key`);

let done = 0; let skipped = 0; let failed = 0;
for (const key of keys) {
  const raw = rcli(`HGETALL ${key}`);
  if (/NOAUTH|ERR /i.test(raw) || raw === '') { skipped += 1; continue; }
  const f = raw.split('\n').map((s) => s.trim());
  const get = (k) => { const i = f.indexOf(k); return i >= 0 ? f[i + 1] : undefined; };
  const status = get('status');
  const createdAt = Number(get('createdAt') ?? 0);
  const userId = get('userId');
  const id = key.slice('session:'.length);
  // ⚠ Trạng thái phiên đang phục vụ là **CLAIMED**, không phải ACTIVE. Bản đầu
  // lọc ACTIVE|READY|PENDING nên bỏ qua ĐÚNG 22/22 phiên và báo "đã đóng=0" —
  // một lượt dọn thành công giả. Chỉ BỎ QUA các trạng thái đã kết thúc.
  if (/^(EXPIRED|REAPED|ENDED|FAILED)$/i.test(status ?? '')) { skipped += 1; continue; }
  if (!createdAt || createdAt >= CUTOFF) { skipped += 1; continue; }
  const cookie = byUser.get(userId);
  if (!cookie) { console.log(`  ${id}: không có cookie của ${userId} — bỏ`); skipped += 1; continue; }
  try {
    const r = await fetch(`${BASE}/api/trpc/lessons.endSession`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie },
      body: JSON.stringify({ sessionId: id }),
    });
    const b = await r.json();
    if (b.error) { console.log(`  ${id}: ${String(b.error.message).slice(0, 70)}`); failed += 1; }
    else { done += 1; }
  } catch (e) { console.log(`  ${id}: ${String(e.message).slice(0, 70)}`); failed += 1; }
}
console.log(`đã đóng=${done} bỏ qua=${skipped} lỗi=${failed}`);
