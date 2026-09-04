/**
 * keystroke-smoke.mjs — lượt khói MỘT người cho `wsterm.mjs`.
 *
 * Mục đích: chứng minh client WS đo được thật TRƯỚC khi đem nó vào lượt N
 * người. Một client WS hỏng và một hệ chậm cho ra cùng một triệu chứng
 * ("không có số"), nên phải tách hai thứ đó ra ở quy mô 1.
 *
 * Dùng:  node keystroke-smoke.mjs [samples]
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openTerminal, measureKeystrokes } from './wsterm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..', '..');
const BASE = process.env.BASE_URL ?? 'https://dlp.192.168.94.130.sslip.io:30443';
const ORIGIN = process.env.ORIGIN ?? BASE;
const SAMPLES = Number(process.argv[2] ?? 15);
const SCENARIO = process.env.SCENARIO ?? 'dlp-docker-basics';

const users = JSON.parse(readFileSync(join(ROOT, 'infra', 'k6', '.users.json'), 'utf8'));
let cookie = users[0].cookie;

/**
 * ⛔ PHẢI GOM Set-Cookie CỦA MỌI PHẢN HỒI. Handshake `/ws` cần cookie
 * `dlp_sandbox` (Path=/ws, HttpOnly) mà `lessons.startSession` phát ra — chỉ
 * mang theo cookie đăng nhập thì gateway trả **401**, và 401 đọc y hệt ca
 * "token sai/hết hạn". Bản đầu của script này vứt Set-Cookie và mất đúng 20
 * phút vào việc nghi ngờ JWT trong khi thứ thiếu là một cookie.
 *
 * Giữ MỌI cookie, không lọc theo tiền tố `dlp_`: cookie phiên Better Auth
 * KHÔNG mang tiền tố ấy nên lọc như vậy sẽ vứt đúng cookie đăng nhập.
 */
function soakCookies(response) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(';')[0];
    if (!pair?.includes('=')) continue;
    const name = pair.split('=')[0];
    const kept = cookie.split('; ').filter((c) => c && !c.startsWith(`${name}=`));
    kept.push(pair);
    cookie = kept.join('; ');
  }
}

async function trpc(proc, input) {
  const r = await fetch(`${BASE}/api/trpc/${proc}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie },
    body: JSON.stringify(input),
  });
  soakCookies(r);
  const b = await r.json();
  if (b.error) throw new Error(`${proc}: ${b.error.message ?? JSON.stringify(b.error)}`);
  return b.result.data;
}

const started = await trpc('lessons.startSession', {
  scenarioId: SCENARIO, idempotencyKey: `ks-smoke-${Date.now()}`,
});
const sessionId = started.session.id;
console.log(`session=${sessionId} pod=${started.session.podName}`);

try {
  const term = await openTerminal({ base: BASE, sessionId, cookie, origin: ORIGIN });
  console.log(`handshake=${term.handshakeMs}ms ready=${term.readyMs}ms`);
  const ks = await measureKeystrokes(term, { samples: SAMPLES, paceMs: 150 });
  console.log(JSON.stringify(ks, null, 2));
  term.close();
  if (ks.received === 0) { console.error('KHÔNG ĐO ĐƯỢC: 0 tiếng vọng'); process.exitCode = 2; }
} finally {
  await trpc('lessons.endSession', { sessionId }).catch((e) => console.error(`dọn: ${e.message}`));
  console.log('đã dọn phiên');
}
