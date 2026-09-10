import { createServer, type Server, type Socket } from 'node:net';

/**
 * Máy chủ SMTP GIẢ, chỉ dùng trong test. Không có phụ thuộc nào.
 *
 * ## Vì sao tự viết thay vì mock `nodemailer`
 *
 * Một `vi.mock('nodemailer')` chứng minh rằng ta đã GỌI một hàm với đúng tham
 * số. Nó không chứng minh có thư nào ra khỏi tiến trình, và nó xanh y hệt khi
 * cấu hình transport sai, khi cổng sai, khi thân thư dựng hỏng. Máy chủ này
 * nhận byte thật trên một socket thật, nên nó là thứ duy nhất phân biệt được
 * "đã gọi sendMail" với "thư đã tới nơi".
 *
 * Nó cũng là điều kiện để luật `no-outbound-from-this-project` không bị vi phạm
 * khi chạy AC "đầu đến cuối": mọi thư nằm trên loopback, không byte nào rời máy.
 *
 * ## Phần giao thức được cài, và phần cố ý KHÔNG cài
 *
 * Đủ cho nodemailer đi hết một lượt gửi không xác thực: chào 220, trả 250 cho
 * EHLO/MAIL/RCPT/RSET/NOOP, 354 cho DATA rồi gom tới dòng chỉ có một dấu chấm,
 * 221 cho QUIT.
 *
 * KHÔNG cài STARTTLS và KHÔNG quảng cáo AUTH. Đó là lý do transport phải để
 * `secure: false` và không đặt `SMTP_USER`: nodemailer chỉ nâng cấp TLS hoặc gửi
 * thông tin đăng nhập khi máy chủ quảng cáo, nên một bộ test chạy qua đây KHÔNG
 * chứng minh gì về đường TLS của prod. Nói ra thay vì để người đọc suy rằng
 * "gửi được ở test nghĩa là gửi được ở prod".
 */

export interface CapturedMail {
  readonly from: string;
  readonly to: readonly string[];
  readonly data: string;
}

export interface FakeSmtp {
  readonly port: number;
  readonly messages: readonly CapturedMail[];
  /** Chờ tới khi có thư gửi tới `to`, hoặc ném sau `timeoutMs`. */
  waitFor(to: string, timeoutMs?: number): Promise<CapturedMail>;
  /**
   * Chờ tới khi đã nhận ÍT NHẤT `count` thư.
   *
   * `waitFor` không thay được ô này: nó trả về ngay khi thấy một thư CŨ tới cùng
   * địa chỉ, nên một phép đếm chạy sau nó vẫn đua với lượt gửi mới. Đó đúng là
   * hình dạng đã làm ô "chống dò tài khoản" chớp tắt ở lượt viết đầu.
   */
  waitForCount(count: number, timeoutMs?: number): Promise<void>;
  close(): Promise<void>;
}

export async function startFakeSmtp(): Promise<FakeSmtp> {
  const messages: CapturedMail[] = [];
  const sockets = new Set<Socket>();

  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.setEncoding('utf8');

    let buffer = '';
    let inData = false;
    let from = '';
    let to: string[] = [];
    let data = '';

    socket.write('220 fake-smtp ESMTP\r\n');

    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\r\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        handleLine(line);
        newline = buffer.indexOf('\r\n');
      }
    });

    function handleLine(line: string): void {
      if (inData) {
        if (line === '.') {
          inData = false;
          messages.push({ from, to: [...to], data });
          from = '';
          to = [];
          data = '';
          socket.write('250 OK: queued\r\n');
          return;
        }
        // Dấu chấm đầu dòng do phía gửi nhân đôi (RFC 5321 §4.5.2). Bóc lại,
        // nếu không thì một dòng thân thư bắt đầu bằng dấu chấm đọc ra sai.
        data += `${line.startsWith('..') ? line.slice(1) : line}\n`;
        return;
      }

      const upper = line.toUpperCase();
      if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
        socket.write('250-fake-smtp\r\n250 8BITMIME\r\n');
        return;
      }
      if (upper.startsWith('MAIL FROM')) {
        from = extractAddress(line);
        socket.write('250 OK\r\n');
        return;
      }
      if (upper.startsWith('RCPT TO')) {
        to.push(extractAddress(line));
        socket.write('250 OK\r\n');
        return;
      }
      if (upper.startsWith('DATA')) {
        inData = true;
        socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        return;
      }
      if (upper.startsWith('QUIT')) {
        socket.write('221 Bye\r\n');
        socket.end();
        return;
      }
      // RSET, NOOP, và bất cứ gì khác: trả 250 chứ không 502. Một 502 làm
      // nodemailer đổi đường và bộ test sẽ đo một luồng khác luồng sản phẩm.
      socket.write('250 OK\r\n');
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('fake-smtp: không lấy được cổng đã gán');
  }
  const port = address.port;

  return {
    port,
    messages,
    async waitFor(recipient: string, timeoutMs = 5_000): Promise<CapturedMail> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const found = messages.find((message) => message.to.includes(recipient));
        if (found !== undefined) {
          return found;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `fake-smtp: không có thư nào tới ${recipient} sau ${String(timeoutMs)}ms (đã nhận ${String(messages.length)} thư)`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    },
    async waitForCount(count: number, timeoutMs = 5_000): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      while (messages.length < count) {
        if (Date.now() >= deadline) {
          throw new Error(
            `fake-smtp: chỉ nhận ${String(messages.length)} thư sau ${String(timeoutMs)}ms, cần ${String(count)}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    },
    async close(): Promise<void> {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      });
    },
  };
}

/**
 * Giải mã THÂN thư đã nhận.
 *
 * Bắt buộc phải có, không phải tiện nghi: thân thư của ta là tiếng Việt, nên
 * nodemailer mã hoá nó bằng `quoted-printable` hoặc `base64`. Một phép khẳng
 * định `expect(raw).toContain(link)` chạy trên chuỗi thô sẽ đỏ khi bộ mã hoá
 * chèn một dấu ngắt dòng mềm vào GIỮA liên kết, và nó sẽ đỏ vì phép đo sai chứ
 * không phải vì thư sai. Giải mã trước rồi mới khẳng định.
 */
export function decodeMailText(raw: string): string {
  const separator = raw.indexOf('\n\n');
  const headers = separator === -1 ? raw : raw.slice(0, separator);
  const body = separator === -1 ? '' : raw.slice(separator + 2);
  const encoding = /content-transfer-encoding:\s*(\S+)/i.exec(headers)?.[1]?.toLowerCase() ?? '7bit';

  if (encoding === 'base64') {
    return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  }
  if (encoding === 'quoted-printable') {
    return decodeQuotedPrintable(body);
  }
  return body;
}

function decodeQuotedPrintable(input: string): string {
  const withoutSoftBreaks = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < withoutSoftBreaks.length; i += 1) {
    const ch = withoutSoftBreaks[i] as string;
    if (ch === '=' && i + 2 < withoutSoftBreaks.length) {
      bytes.push(Number.parseInt(withoutSoftBreaks.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    bytes.push(...Buffer.from(ch, 'utf8'));
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Giải mã một header dạng encoded-word (RFC 2047), ví dụ `Subject:` tiếng Việt.
 *
 * ⚠ PHẢI gỡ gấp dòng TRƯỚC khi giải mã, không phải sau. Một encoded-word tối đa
 * 75 ký tự, nên tiêu đề tiếng Việt của thư đặt lại mật khẩu bị bộ mã hoá cắt
 * thành HAI encoded-word nằm trên hai dòng. Một regex `^Subject:(.*)$` chỉ lấy
 * dòng đầu và trả về một nửa tiêu đề, rồi ô test đỏ với thông báo "chuỗi không
 * khớp" mà không nhắc gì tới gấp dòng.
 *
 * Khoảng trắng GIỮA hai encoded-word liền nhau bị bỏ (RFC 2047 §6.2), khác với
 * khoảng trắng giữa một encoded-word và chữ thường.
 */
export function decodeHeaderValue(raw: string, header: string): string | null {
  const lines = raw.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^${header}:`, 'i').test(line));
  if (start === -1) {
    return null;
  }

  let value = (lines[start] as string).slice(header.length + 1).trim();
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (!/^[ \t]/.test(line) || line.trim() === '') {
      break;
    }
    value += ` ${line.trim()}`;
  }

  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi, (_whole, kind: string, payload: string) =>
      kind.toLowerCase() === 'b'
        ? Buffer.from(payload, 'base64').toString('utf8')
        : decodeQuotedPrintable(payload.replace(/_/g, ' ')),
    );
}

function extractAddress(line: string): string {
  const open = line.indexOf('<');
  const close = line.indexOf('>');
  return open === -1 || close === -1 ? line.slice(line.indexOf(':') + 1).trim() : line.slice(open + 1, close);
}
