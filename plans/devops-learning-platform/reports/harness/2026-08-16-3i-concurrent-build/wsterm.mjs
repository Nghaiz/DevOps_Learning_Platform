/**
 * wsterm.mjs — client WebSocket THÔ cho `dlp.terminal.v1`, đủ để đo độ trễ gõ.
 *
 * Vì sao viết tay thay vì dùng `ws` hay `WebSocket` toàn cục của Node 24:
 *   1. Handshake phải ép ALPN `http/1.1`. Upgrade RFC 6455 không tồn tại trên
 *      HTTP/2; để mặc định thì Traefik chọn h2 và request upgrade thành vô
 *      nghĩa — triệu chứng là một mã lỗi khó hiểu, không phải "WS hỏng".
 *   2. Cụm lab dùng chứng chỉ tự ký cho `sslip.io`, nên phải điều khiển được
 *      TLS ở tầng socket.
 *   3. Phép đo cần dấu thời gian NGAY TẠI byte đầu tiên của frame đọc được,
 *      không phải sau một lớp trừu tượng có đệm riêng.
 *
 * Phần handshake + framing kế thừa `2026-08-14-3a-edge/ws-upgrade-probe.mjs`
 * (đã chứng minh trên chính cụm này), bổ sung frame NHỊ PHÂN — giao thức tách
 * data (binary) khỏi control (text/JSON) nên chỉ có text frame là không đủ.
 */
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';

/**
 * Frame client→server. RFC 6455 §5.3: frame TỪ CLIENT **bắt buộc** mask —
 * server đóng kết nối nếu thiếu, và triệu chứng khi đó ("101 rồi rớt") giống
 * hệt ca buffering làm hỏng WS. Hai nguyên nhân, một triệu chứng.
 *
 * `opcode` 0x1 = text (control JSON), 0x2 = binary (stdin của terminal).
 */
export function frame(payload, opcode = 0x1) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const mask = randomBytes(4);
  const masked = Buffer.from(body.map((b, i) => b ^ mask[i % 4]));
  const first = Buffer.from([0x80 | opcode]);
  let lenPart;
  if (body.length < 126) {
    lenPart = Buffer.from([0x80 | body.length]);
  } else if (body.length < 65536) {
    lenPart = Buffer.alloc(3);
    lenPart[0] = 0x80 | 126;
    lenPart.writeUInt16BE(body.length, 1);
  } else {
    lenPart = Buffer.alloc(9);
    lenPart[0] = 0x80 | 127;
    lenPart.writeBigUInt64BE(BigInt(body.length), 1);
  }
  return Buffer.concat([first, lenPart, mask, masked]);
}

/**
 * Giải MỘT frame server→client (không mask). Trả {opcode, payload, size} hoặc
 * null khi chưa đủ byte. `size` để caller cắt buffer và đọc frame kế tiếp.
 *
 * `payload` giữ nguyên Buffer: stdout của terminal là byte thô, và giải sang
 * chuỗi ở đây sẽ cắt hỏng glyph UTF-8 nằm vắt qua ranh giới hai frame.
 */
export function readFrame(buf) {
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
  return { opcode, payload: buf.subarray(offset, offset + len), size: offset + len };
}

/**
 * Mở WS tới `/ws/session/<id>` và chờ tới frame `ready`.
 *
 * ⛔ `init` LÀ BẮT BUỘC, KHÔNG PHẢI TUỲ CHỌN (docs/ws-terminal-protocol.md §3).
 * Không gửi thì gateway chờ 3s, rơi về 80x24, huỷ dial exec và ĐÓNG — đọc ra y
 * hệt ca "biên làm hỏng WS", trong khi nguyên nhân nằm ở client.
 *
 * Trả { socket, onData(cb), send(buf, opcode), close(), handshakeMs, readyMs }.
 */
export function openTerminal({ base, sessionId, cookie, origin, cols = 120, rows = 34,
  timeoutMs = 20_000 }) {
  const url = new URL(base);
  const host = url.hostname;
  const port = Number(url.port || 443);

  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const socket = tls.connect(
      {
        host, port, servername: host,
        ALPNProtocols: ['http/1.1'],
        // Cụm lab dùng cert tự ký cho sslip.io. Khai TƯỜNG MINH ở đây thay vì
        // đặt NODE_TLS_REJECT_UNAUTHORIZED=0 toàn tiến trình — biến môi trường
        // ấy tắt kiểm TLS cho MỌI kết nối khác của harness luôn.
        rejectUnauthorized: process.env.WS_TLS_STRICT === '1',
      },
      () => {
        const key = randomBytes(16).toString('base64');
        socket.write(
          `GET /ws/session/${sessionId} HTTP/1.1\r\n` +
            `Host: ${host}:${port}\r\n` +
            `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
            `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n` +
            `Sec-WebSocket-Protocol: dlp.terminal.v1\r\n` +
            `Origin: ${origin}\r\n` +
            `Cookie: ${cookie}\r\n\r\n`,
        );

        // ⚠ PHẢI GIỮ PHẦN DƯ SAU HEADER. Nếu server gộp `101 …\r\n\r\n` và
        // frame `ready` vào CÙNG một segment TCP thì vứt phần dư = mất `ready`,
        // và probe kết luận "không nhận được ready" — báo ĐỎ cho hệ đang đúng.
        let acc = Buffer.alloc(0);
        const onHead = (chunk) => {
          acc = Buffer.concat([acc, chunk]);
          const end = acc.indexOf('\r\n\r\n');
          if (end === -1) return;
          socket.off('data', onHead);
          const status = acc.subarray(0, end).toString('latin1').split('\r\n')[0];
          const handshakeMs = Date.now() - t0;
          if (!status.includes('101')) {
            socket.destroy();
            reject(new Error(`handshake không lên 101: ${status}`));
            return;
          }

          let buf = acc.subarray(end + 4);
          const listeners = [];
          let readyAt = null;

          const closeCbs = [];
          let closeInfo = null;
          const pump = () => {
            for (;;) {
              const f = readFrame(buf);
              if (!f) break;
              buf = buf.subarray(f.size);
              if (f.opcode === 0x8) {
                // ⛔ ĐỌC MÃ ĐÓNG, ĐỪNG CHỈ DESTROY. Bản đầu vứt frame close đi,
                // và khi đó ca 12.E ("pod biến mất giữa phiên") KHÔNG kiểm được
                // gì: 4404 (đúng) và 1000 (sai — FE hiểu thành "người dùng tự
                // gõ exit") trông y hệt nhau khi chỉ thấy "socket đã đóng".
                // RFC 6455 §5.5.1: 2 byte đầu là code, phần còn lại là reason.
                const code = f.payload.length >= 2 ? f.payload.readUInt16BE(0) : null;
                const reason = f.payload.length > 2 ? f.payload.subarray(2).toString('utf8') : '';
                closeInfo = { code, reason };
                for (const cb of closeCbs) cb(closeInfo);
                socket.destroy();
                return;
              }
              if (f.opcode === 0x9) { socket.write(frame(f.payload, 0xa)); continue; } // ping→pong
              for (const cb of listeners) cb(f);
            }
          };
          // Socket đứt mà KHÔNG có frame close (hạ tầng cắt giữa chừng) là một
          // kết cục KHÁC với "server đóng có mã". Báo code=null để phân biệt,
          // đừng lặng lẽ coi như đóng bình thường.
          socket.on('close', () => {
            if (closeInfo) return;
            closeInfo = { code: null, reason: 'socket đứt, không có frame close' };
            for (const cb of closeCbs) cb(closeInfo);
          });

          socket.on('data', (c) => { buf = Buffer.concat([buf, c]); pump(); });

          const api = {
            socket,
            handshakeMs,
            get readyMs() { return readyAt; },
            onData: (cb) => { listeners.push(cb); return () => {
              const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1);
            }; },
            /** Chờ server đóng. Trả {code, reason}; code=null nghĩa là socket
             * đứt không kèm frame close (hạ tầng), KHÁC với đóng có mã. */
            waitClose: (timeoutMs = 120_000) => new Promise((res) => {
              if (closeInfo) { res(closeInfo); return; }
              const timer = setTimeout(() => res({ code: 'TIMEOUT', reason: `không đóng trong ${timeoutMs}ms` }), timeoutMs);
              closeCbs.push((info) => { clearTimeout(timer); res(info); });
            }),
            send: (payload, opcode = 0x2) => socket.write(frame(payload, opcode)),
            close: () => { try { socket.write(frame(Buffer.alloc(0), 0x8)); } catch { /* đã đóng */ }
              socket.destroy(); },
          };

          // Chờ `ready` — frame ĐẦU TIÊN server gửi (§3 bước 6).
          const timer = setTimeout(() => {
            api.close();
            reject(new Error(`không nhận được 'ready' trong ${timeoutMs}ms`));
          }, timeoutMs);
          const off = api.onData((f) => {
            if (f.opcode !== 0x1) return; // control là text
            let msg;
            try { msg = JSON.parse(f.payload.toString('utf8')); } catch { return; }
            if (msg.type !== 'ready') return;
            readyAt = Date.now() - t0;
            clearTimeout(timer);
            off();
            // ⛔ TẮT TIMEOUT BẤT-HOẠT-ĐỘNG SAU KHI ĐÃ SẴN SÀNG.
            // `socket.setTimeout(ms, cb)` ở dưới đặt cho HANDSHAKE, nhưng nó là
            // timeout BẤT HOẠT ĐỘNG và sống suốt đời socket — không phải hạn một
            // lần. Để nguyên thì mọi kết nối im lặng quá `timeoutMs` (mặc định
            // 20s) bị CHÍNH CLIENT destroy.
            //
            // Đo được 2026-09-05: soak gõ mỗi 30s > 20s ⇒ 7/10 WS chết dần,
            // `dlp_gateway_ws_active` tụt còn 3, và gateway ghi
            // "failed to read frame header: EOF" — trông y hệt server đóng.
            // Bốn đại lượng rò rỉ khi ấy vẫn "phẳng", nhưng phẳng vì KHÔNG CÒN
            // GÌ KẾT NỐI. Phép đo gõ phím (200ms/phím) không bao giờ chạm bẫy
            // này nên nó ẩn cho tới lượt chạy dài đầu tiên.
            socket.setTimeout(0);
            resolve(api);
          });

          // `init` phải là frame ĐẦU TIÊN client gửi.
          api.send(JSON.stringify({ type: 'init', cols, rows }), 0x1);
          pump(); // phần dư có thể đã chứa `ready`
        };
        socket.on('data', onHead);
      },
    );
    socket.setTimeout(timeoutMs, () => { socket.destroy(); reject(new Error('handshake timeout')); });
    socket.once('error', reject);
  });
}

/**
 * Đo độ trễ "gõ → ký tự hiện": gửi MỘT ký tự stdin, chờ chính nó vọng lại trên
 * stdout. Đây là đại lượng người học CẢM được, và trước P12 chưa ai đo nó.
 *
 * ⛔ KHÔNG BAO GIỜ gửi Enter. Ký tự đi vào dòng lệnh của shell thật trong pod
 * của người học; gửi Enter là CHẠY thứ vừa gõ. Cuối lượt đo gửi Ctrl-C (0x03)
 * để bỏ dòng dở — không thực thi gì.
 *
 * ⚠ Vế bắt-nói-dối: mỗi lượt dùng một ký tự SINH RA TỪ danh sách xoay vòng và
 * chỉ tính khi đúng ký tự ấy xuất hiện. Nếu chỉ chờ "có byte nào đó về" thì
 * một prompt tự vẽ lại, một dòng log, hay tiếng vọng của lượt TRƯỚC đều làm
 * phép đo xanh — và con số thu được sẽ nhỏ hơn sự thật.
 */
export async function measureKeystrokes(term, { samples = 30, paceMs = 200,
  perKeyTimeoutMs = 5000 } = {}) {
  // Ký tự an toàn: chữ cái, không phải ký tự điều khiển, không phải ký tự có
  // nghĩa với shell (`|`, `&`, `;`, `$`, backtick…).
  //
  // ⚠ DÙNG CẢ HOA LẪN THƯỜNG (52) THAY VÌ 26. Với 26 ký tự thì mẫu thứ 27 lặp
  // lại 'a', và một tiếng vọng ĐẾN MUỘN của mẫu 1 (đã tính là timeout) có thể
  // khớp mẫu 27 — cho ra một độ trễ nhỏ giả. Lớp lỗi này chỉ xuất hiện khi
  // samples > 26, tức đúng ở lượt đo dài mà ta cần con số nhất.
  const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (samples > ALPHABET.length) {
    throw new Error(`samples=${samples} > ${ALPHABET.length}: ký tự sẽ lặp và phép đo có thể khớp nhầm tiếng vọng cũ`);
  }
  const latencies = [];
  let timeouts = 0;
  let echoMismatch = 0;

  // Xả những gì pod đang in dở (prompt, MOTD) trước khi bấm giờ.
  await new Promise((r) => setTimeout(r, 600));

  for (let i = 0; i < samples; i += 1) {
    const ch = ALPHABET[i % ALPHABET.length];
    const sentAt = Date.now();
    const got = await new Promise((resolve) => {
      const timer = setTimeout(() => { off(); resolve(null); }, perKeyTimeoutMs);
      const off = term.onData((f) => {
        if (f.opcode !== 0x2) return; // chỉ stdout thật, bỏ control
        if (!f.payload.includes(ch)) return;
        clearTimeout(timer);
        off();
        resolve(Date.now() - sentAt);
      });
      term.send(Buffer.from(ch, 'utf8'), 0x2);
    });
    if (got === null) timeouts += 1;
    else latencies.push(got);
    await new Promise((r) => setTimeout(r, paceMs));
  }

  // Bỏ dòng dở — KHÔNG Enter.
  try { term.send(Buffer.from([0x03]), 0x2); } catch { /* socket đã đóng */ }

  const sorted = [...latencies].sort((a, b) => a - b);
  const pct = (p) => (sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1,
    Math.floor((p / 100) * sorted.length))]);
  return {
    samples, received: latencies.length, timeouts, echoMismatch,
    p50: pct(50), p95: pct(95), max: sorted.at(-1) ?? null, min: sorted[0] ?? null,
  };
}
