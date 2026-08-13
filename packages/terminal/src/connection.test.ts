import { describe, expect, it, vi } from 'vitest';
import { HANDSHAKE_TIMEOUT_MS, buildSessionWsUrl, openConnection } from './connection.ts';
import { SUBPROTOCOL } from './protocol.ts';

/**
 * WebSocket giả tối thiểu. Không dùng jsdom: cầu WS không chạm DOM, và một fake
 * ở đây cho phép khẳng định CHÍNH XÁC byte nào rời máy — thứ mà một WS thật
 * trong test tích hợp không cho nhìn thấy.
 */
class FakeSocket {
  static instances: FakeSocket[] = [];

  readyState = 0; // CONNECTING
  binaryType = 'blob';
  readonly sent: (string | Uint8Array)[] = [];
  closedWith: { code: number; reason: string } | null = null;

  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor(
    readonly url: string,
    readonly protocols: string,
  ) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(handler);
    this.listeners.set(type, existing);
  }

  send(data: string | Uint8Array): void {
    this.sent.push(data);
  }

  close(code: number, reason: string): void {
    this.closedWith = { code, reason };
    this.readyState = 3; // CLOSED
  }

  emit(type: string, event: unknown): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }

  /** Mô phỏng handshake xong. */
  open(): void {
    this.readyState = 1; // OPEN
    this.emit('open', {});
  }

  get openCount(): number {
    return this.readyState === 1 ? 1 : 0;
  }
}

function setup(initialSize = { cols: 120, rows: 34 }) {
  FakeSocket.instances = [];
  const onControl = vi.fn();
  const onBinary = vi.fn();
  const onClose = vi.fn();
  const connection = openConnection({
    url: 'wss://lab.example/ws/session/s1',
    initialSize,
    onControl,
    onBinary,
    onClose,
    socketFactory: (url, protocols) => new FakeSocket(url, protocols) as unknown as WebSocket,
  });
  const socket = FakeSocket.instances[0];
  if (socket === undefined) {
    throw new Error('socketFactory chưa được gọi');
  }
  return { connection, socket, onControl, onBinary, onClose };
}

describe('handshake treo — không mở được mà cũng không đóng', () => {
  /**
   * Ca này KHÔNG phải giả định: đo trên cụm 2026-08-13. Khi `/ws` mất luật định
   * tuyến và request upgrade rơi xuống Next, server không trả gì cả — `curl`
   * treo trọn 20s với `http_code=000`, trình duyệt ở nguyên CONNECTING, không
   * phát `error`, không phát `close`. Máy trạng thái không nhận sự kiện nào nên
   * badge đứng ở "Đang kết nối…" vĩnh viễn: 0 lỗi UI, 0 dòng console.
   *
   * Mọi phanh khác đều bắt đầu từ một `close`, nên nếu thiếu trần này thì
   * backoff và lượt hỏi lý do thật (contract §7) đều không bao giờ chạy.
   */
  it('quá trần handshake mà chưa `open` ⇒ báo 1006 cho máy trạng thái', () => {
    vi.useFakeTimers();
    try {
      const { onClose, socket } = setup();
      vi.advanceTimersByTime(HANDSHAKE_TIMEOUT_MS - 1);
      expect(onClose).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      // 1006 chứ không phải mã riêng: đó đúng là thứ client quan sát được (không
      // có close code từ server), và nó chảy vào nhánh "1006 khi chưa từng ready"
      // mà `session-machine` đã có sẵn — retry backoff + đi hỏi lý do thật.
      expect(onClose).toHaveBeenCalledExactlyOnceWith(1006);
      expect(socket.closedWith).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ĐỐI CHỨNG: mở kịp thì trần không bắn, và không có close giả', () => {
    vi.useFakeTimers();
    try {
      const { socket, onClose } = setup();
      socket.open();
      vi.advanceTimersByTime(HANDSHAKE_TIMEOUT_MS * 3);
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('close thật tới trước trần ⇒ đúng MỘT lần onClose, mang mã của server', () => {
    // Không có `clearTimeout` ở nhánh close, một phiên đóng bằng 4401 sẽ bị trần
    // bồi thêm một 1006 nữa và bộ đếm backoff nhảy hai bậc cho một lần rớt.
    vi.useFakeTimers();
    try {
      const { socket, onClose } = setup();
      socket.emit('close', { code: 4401 });
      vi.advanceTimersByTime(HANDSHAKE_TIMEOUT_MS * 3);
      expect(onClose).toHaveBeenCalledExactlyOnceWith(4401);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('handshake', () => {
  it('chào đúng subprotocol dlp.terminal.v1 (contract §0)', () => {
    const { socket } = setup();
    expect(socket.protocols).toBe(SUBPROTOCOL);
  });

  it('đặt binaryType=arraybuffer TRƯỚC khi mở (contract §1 bẫy 2)', () => {
    // Mặc định của trình duyệt là 'blob', và một Blob đi vào terminal.write()
    // rơi vào nhánh string rồi in ra "[object Blob]".
    const { socket } = setup();
    expect(socket.binaryType).toBe('arraybuffer');
  });

  it('`init` là frame ĐẦU TIÊN, mang đúng cols/rows đo được (contract §3 bước 4)', () => {
    const { socket } = setup({ cols: 132, rows: 40 });
    socket.open();
    expect(socket.sent).toHaveLength(1);
    expect(socket.sent[0]).toBe(JSON.stringify({ type: 'init', cols: 132, rows: 40 }));
  });

  it('kích thước ngoài khoảng bị clamp trước khi gửi', () => {
    const { socket } = setup({ cols: 5000, rows: 0 });
    socket.open();
    expect(socket.sent[0]).toBe(JSON.stringify({ type: 'init', cols: 1000, rows: 1 }));
  });
});

describe('stdin — contract §1 bẫy 1', () => {
  it('gửi stdin dưới dạng BINARY, không phải text frame', () => {
    // `term.onData` trả string; gửi thẳng thành text frame và server đọc nó như
    // control JSON hỏng rồi đóng 4400.
    const { connection, socket } = setup();
    socket.open();
    connection.sendInput('ls -la\r');

    const payload = socket.sent[1];
    expect(payload).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(payload as Uint8Array)).toBe('ls -la\r');
  });

  it('ký tự đa-byte (tiếng Việt) encode đúng UTF-8', () => {
    const { connection, socket } = setup();
    socket.open();
    connection.sendInput('echo "phiên"');
    expect(new TextDecoder().decode(socket.sent[1] as Uint8Array)).toBe('echo "phiên"');
  });

  it('gõ khi socket CHƯA mở thì bỏ qua, không ném và không xếp hàng', () => {
    const { connection, socket } = setup();
    connection.sendInput('x');
    expect(socket.sent).toHaveLength(0);
  });
});

describe('nhận dữ liệu', () => {
  it('text frame → onControl đã parse; binary frame → onBinary dạng Uint8Array', () => {
    const { socket, onControl, onBinary } = setup();
    socket.open();

    socket.emit('message', { data: JSON.stringify({ type: 'exit', exitCode: 0 }) });
    expect(onControl).toHaveBeenCalledWith({ type: 'exit', exitCode: 0 });

    const bytes = new TextEncoder().encode('hello');
    socket.emit('message', { data: bytes.buffer });
    expect(onBinary).toHaveBeenCalledTimes(1);
    expect(onBinary.mock.calls[0]?.[0]).toBeInstanceOf(Uint8Array);
  });

  it('control JSON hỏng bị BỎ QUA, không làm sập và không gọi onControl', () => {
    const { socket, onControl } = setup();
    socket.open();
    expect(() => socket.emit('message', { data: '{broken' })).not.toThrow();
    expect(onControl).not.toHaveBeenCalled();
  });
});

describe('đóng kết nối — chống rò WebSocket ở StrictMode', () => {
  it('close() chủ động KHÔNG gọi onClose', () => {
    // Đây là bẫy rò: nếu close() báo ngược lên, máy trạng thái hiểu là mất kết
    // nối và hẹn giờ nối lại vào một component đã unmount ⇒ WS thứ hai sống mãi.
    const { connection, socket, onClose } = setup();
    socket.open();
    connection.close();
    expect(socket.closedWith).toEqual({ code: 1000, reason: 'client closed' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('close() hai lần chỉ đóng một lần', () => {
    const { connection, socket } = setup();
    socket.open();
    connection.close();
    socket.closedWith = null;
    connection.close();
    expect(socket.closedWith).toBeNull();
  });

  it('server đóng ⇒ onClose đúng MỘT lần với mã thật', () => {
    const { socket, onClose } = setup();
    socket.open();
    socket.emit('close', { code: 4409 });
    socket.emit('close', { code: 4409 });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(4409);
  });

  it('`error` KHÔNG gọi onClose — trình duyệt luôn phát `close` ngay sau', () => {
    // Gọi ở cả hai chỗ là đếm hai lần một lần rớt, và bộ đếm backoff nhảy 2 bậc.
    const { socket, onClose } = setup();
    socket.open();
    socket.emit('error', {});
    expect(onClose).not.toHaveBeenCalled();
    socket.emit('close', { code: 1006 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mở rồi đóng 3 lần liên tiếp ⇒ 0 socket còn sống (AC StrictMode)', () => {
    FakeSocket.instances = [];
    for (let i = 0; i < 3; i++) {
      const noop = () => undefined;
      const connection = openConnection({
        url: 'wss://lab.example/ws/session/s1',
        initialSize: { cols: 80, rows: 24 },
        onControl: noop,
        onBinary: noop,
        onClose: noop,
        socketFactory: (url, protocols) => new FakeSocket(url, protocols) as unknown as WebSocket,
      });
      FakeSocket.instances[i]?.open();
      connection.close();
    }
    expect(FakeSocket.instances).toHaveLength(3);
    expect(FakeSocket.instances.reduce((sum, s) => sum + s.openCount, 0)).toBe(0);
  });
});

describe('buildSessionWsUrl — cùng origin (contract §2 hệ quả topology)', () => {
  it('https → wss', () => {
    expect(buildSessionWsUrl('https://lab.example', 's1')).toBe('wss://lab.example/ws/session/s1');
  });

  it('http → ws (dev qua proxy gộp origin, KHÔNG ép wss)', () => {
    expect(buildSessionWsUrl('http://localhost:8080', 's1')).toBe(
      'ws://localhost:8080/ws/session/s1',
    );
  });

  it('giữ nguyên port', () => {
    expect(buildSessionWsUrl('https://lab.example:8443', 's1')).toBe(
      'wss://lab.example:8443/ws/session/s1',
    );
  });

  it('bỏ query/hash của trang và encode sessionId', () => {
    // sessionId đi thẳng vào path — không encode là mở đường cho `../` đổi route.
    expect(buildSessionWsUrl('https://lab.example/session?x=1#y', 'a/b')).toBe(
      'wss://lab.example/ws/session/a%2Fb',
    );
  });
});
