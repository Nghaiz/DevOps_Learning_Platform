#!/usr/bin/env node
/**
 * AC-A6 (P3 / 3.A) — WebSocket vẫn NÂNG CẤP ĐƯỢC sau khi gắn middleware ở biên.
 *
 * Ô AC này tồn tại để gác đúng MỘT quyết định thiết kế: tách `ingress.yaml` thành
 * `platform-web` (có middleware `buffering`) và `platform-ws` (không có). Lý do
 * tách là annotation `traefik.ingress.kubernetes.io/router.middlewares` áp cho
 * MỌI router sinh ra từ một Ingress — không có cú pháp per-path — nên "một Ingress
 * hai path" không thể cho `/` trần body mà không đệm luôn `/ws`.
 *
 * ⚠ VÌ SAO KHÔNG ĐO BẰNG `curl` HAY BẰNG HARNESS e2e:
 *   - Harness e2e đi qua API tRPC nên KHÔNG BAO GIỜ mở WebSocket — nó xanh 14/14
 *     kể cả khi `/ws` chết hẳn (đo được ở P2, 2026-08-14).
 *   - `curl` GET thường trả 404 ngay và không phát ra request upgrade thật.
 *   - Một handshake THIẾU cookie trả 401 — cũng "có phản hồi từ gateway", nhưng 401
 *     KHÔNG phải kết nối đã nâng cấp, nên nó không chứng minh được gì về buffering.
 *     Phải có 101 thật, và phải giữ socket đủ lâu để thấy nó không bị đóng.
 *
 * ⚠ ALPN PHẢI ép `http/1.1`: upgrade RFC 6455 không tồn tại trên HTTP/2. Để mặc
 * định thì Traefik chọn h2 và request upgrade thành vô nghĩa —
 * triệu chứng là một mã lỗi khó hiểu chứ không phải "WS hỏng".
 *
 * Chạy:
 *   BASE_URL=https://dlp.192.168.94.130.sslip.io:30443 \
 *   NODE_EXTRA_CA_CERTS=<đường dẫn WINDOWS tới ca.crt> \
 *   node ws-upgrade-probe.mjs
 *
 * Thoát 0 nếu 101 + socket còn mở sau HOLD_MS; thoát 1 nếu không.
 * Đảo kỳ vọng bằng EXPECT=fail (dùng cho đối chứng âm: gắn bodylimit vào /ws rồi
 * chạy lại — phải KHÔNG lên được 101).
 */
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';

const BASE = process.env.BASE_URL ?? 'https://dlp.192.168.94.130.sslip.io:30443';
const HOLD_MS = Number(process.env.HOLD_MS ?? 3500);
const EXPECT_FAIL = process.env.EXPECT === 'fail';
const url = new URL(BASE);
const HOST = url.hostname;
const PORT = Number(url.port || 443);
const ORIGIN = process.env.ORIGIN ?? BASE;

let cookie = '';

async function http(path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      ...(cookie ? { cookie } : {}),
      ...init.headers,
    },
    redirect: 'manual',
  });
  // Giữ MỌI cookie — cookie phiên Better Auth KHÔNG mang tiền tố `dlp_`, lọc theo
  // tiền tố đó sẽ vứt đúng cookie đăng nhập (bẫy đã ghi ở harness 2.D).
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(';')[0];
    if (!pair?.includes('=')) continue;
    const name = pair.split('=')[0];
    const kept = cookie.split('; ').filter((c) => c && !c.startsWith(`${name}=`));
    kept.push(pair);
    cookie = kept.join('; ');
  }
  return response;
}

async function trpcMutate(proc, input) {
  const response = await http(`/api/trpc/${proc}`, { method: 'POST', body: JSON.stringify(input) });
  const body = await response.json();
  if (body.error) throw new Error(`${proc}: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body.result.data;
}

/**
 * Frame text client→server. RFC 6455 §5.3: frame TỪ CLIENT **bắt buộc** mask —
 * server đóng kết nối nếu thiếu, và triệu chứng khi đó ("101 rồi rớt") giống hệt
 * ca buffering làm hỏng WS. Hai nguyên nhân, một triệu chứng.
 */
function textFrame(payload) {
  const body = Buffer.from(payload, 'utf8');
  if (body.length > 125) throw new Error('probe chỉ cần frame ngắn');
  const mask = randomBytes(4);
  const masked = Buffer.from(body.map((b, i) => b ^ mask[i % 4]));
  return Buffer.concat([Buffer.from([0x81, 0x80 | body.length]), mask, masked]);
}

/**
 * Giải MỘT frame server→client (không mask). Trả {opcode, payload, size} hoặc
 * null khi chưa đủ byte. `size` để caller cắt buffer và đọc frame kế tiếp.
 */
function readFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }
  if (buf.length < offset + len) return null;
  return {
    opcode,
    payload: buf.subarray(offset, offset + len).toString('utf8'),
    size: offset + len,
  };
}

/** Handshake WS THÔ trên TLS. Trả { status, ms, socket }. */
function upgrade(sessionId) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: HOST, port: PORT, servername: HOST, ALPNProtocols: ['http/1.1'] },
      () => {
        const key = randomBytes(16).toString('base64');
        const t0 = Date.now();
        socket.write(
          `GET /ws/session/${sessionId} HTTP/1.1\r\n` +
            `Host: ${HOST}:${PORT}\r\n` +
            `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
            `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n` +
            `Sec-WebSocket-Protocol: dlp.terminal.v1\r\n` +
            `Origin: ${ORIGIN}\r\n` +
            `Cookie: ${cookie}\r\n\r\n`,
        );
        {
          /*
           * ⚠ PHẢI GIỮ PHẦN DƯ SAU HEADER. Bản đầu làm
           * `socket.once('data', chunk => resolve(statusLine))` và VỨT phần còn
           * lại của chunk. Khi server gộp `101 …\r\n\r\n` và frame `ready` vào
           * CÙNG một segment TCP thì frame đó biến mất, và probe kết luận "không
           * nhận được ready" — tức báo ĐỎ cho một hệ đang chạy đúng.
           * Hai lượt đo đầu tiên xanh chỉ vì hai gói tới rời nhau; đó là một phép
           * đo phụ thuộc thời điểm, không phải một phép đo.
           */
          let acc = Buffer.alloc(0);
          const onData = (chunk) => {
            acc = Buffer.concat([acc, chunk]);
            const end = acc.indexOf('\r\n\r\n');
            if (end === -1) return;
            socket.off('data', onData);
            const head = acc.subarray(0, end).toString('latin1').split('\r\n')[0];
            const rest = acc.subarray(end + 4);
            resolve({ status: head, ms: Date.now() - t0, socket, alpn: socket.alpnProtocol, rest });
          };
          socket.on('data', onData);
        }
      },
    );
    socket.setTimeout(15000, () => reject(new Error('handshake timeout 15s')));
    socket.once('error', reject);
  });
}

async function main() {
  const email = `wsprobe-${Date.now()}@dlp.local`;
  await http('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'ws-Probe-123', name: 'WSProbe' }),
  });
  const started = await trpcMutate('lessons.startSession', {
    scenarioId: 'dlp-sandbox-basics',
    idempotencyKey: `wsprobe-${Date.now()}`,
  });
  const sessionId = started.session.id;
  console.log(`session=${sessionId} pod=${started.session.podName}`);

  let result;
  try {
    result = await upgrade(sessionId);
  } catch (error) {
    console.log(`handshake NÉM: ${error.message}`);
    process.exit(EXPECT_FAIL ? 0 : 1);
  }
  console.log(`handshake: ${result.status}  (${result.ms}ms, alpn=${result.alpn})`);

  const is101 = result.status.includes('101');
  if (!is101) {
    console.log(`KHÔNG lên được 101 ⇒ ${EXPECT_FAIL ? 'ĐÚNG kỳ vọng đối chứng âm' : 'AC-A6 ĐỎ'}`);
    result.socket.destroy();
    process.exit(EXPECT_FAIL ? 0 : 1);
  }

  // ── `init` LÀ BẮT BUỘC, KHÔNG PHẢI TUỲ CHỌN ────────────────────────────────
  // docs/ws-terminal-protocol.md §3 bước 4: frame ĐẦU TIÊN client gửi phải là
  // `init`. Không gửi thì gateway chờ 3s, rơi về 80x24, huỷ dial exec và ĐÓNG.
  //
  // ⚠ Bản đầu của probe này bỏ qua init và kết luận "socket ĐÃ ĐÓNG sau 3.5s" —
  // đọc ra y hệt ca buffering làm hỏng WS, trong khi nguyên nhân nằm ở probe.
  // Log gateway mới phân biệt được: "không nhận được init trong hạn — dùng 80x24"
  // rồi `duration=3.008s`. Con số ~3.0s đó là HẠN INIT của server, nên nó ra
  // ~3.0s bất kể script giữ socket bao lâu — một trùng hợp đủ để đọc nhầm thành
  // "script giữ 3s nên đóng ở 3s".
  let closed = false;
  let ready = '';
  result.socket.on('close', () => {
    closed = true;
  });
  result.socket.on('end', () => {
    closed = true;
  });
  // Buffer tích luỹ, khởi đầu bằng phần dư đi CÙNG segment với header 101.
  let buf = result.rest ?? Buffer.alloc(0);
  const drain = () => {
    for (;;) {
      const frame = readFrame(buf);
      if (!frame) break;
      buf = buf.subarray(frame.size);
      if (frame.opcode === 0x1 && !ready) ready = frame.payload.slice(0, 90);
    }
  };
  drain();
  result.socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    drain();
  });
  result.socket.write(textFrame(JSON.stringify({ type: 'init', cols: 120, rows: 34 })));

  await new Promise((r) => setTimeout(r, HOLD_MS));
  console.log(`server gửi: ${ready || '(chưa frame text nào)'}`);
  console.log(`sau ${HOLD_MS}ms: socket ${closed ? 'ĐÃ ĐÓNG' : 'CÒN MỞ'}`);
  result.socket.destroy();

  const ok = is101 && !closed && ready.includes('ready');
  console.log(ok ? 'AC-A6 XANH' : 'AC-A6 ĐỎ');
  process.exit(EXPECT_FAIL ? (ok ? 1 : 0) : ok ? 0 : 1);
}

main().catch((error) => {
  console.error('lỗi:', error.message);
  process.exit(EXPECT_FAIL ? 0 : 1);
});
