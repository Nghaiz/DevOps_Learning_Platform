import {
  CLOSE_ABNORMAL,
  SUBPROTOCOL,
  clampDimension,
  encodeClientControl,
  parseServerControl,
  type ServerControl,
} from './protocol.ts';
import type { TerminalDimensions } from './terminal-core.ts';

/**
 * Cầu WebSocket phía client — bản đối xứng của `services/terminal-gateway`.
 *
 * Tách khỏi `terminal-core.ts` có chủ ý: file này KHÔNG import xterm, nên test
 * được bằng một `WebSocket` giả mà không cần DOM. Cầu này là chỗ hai bẫy phía
 * client ở contract §1 sống, và cả hai đều là bẫy im lặng (không ném, chỉ hỏng
 * dữ liệu) nên phải có test đóng đinh.
 */

export interface ConnectionHandlers {
  readonly onControl: (message: ServerControl) => void;
  readonly onBinary: (chunk: Uint8Array) => void;
  readonly onClose: (code: number) => void;
}

export interface ConnectionOptions extends ConnectionHandlers {
  readonly url: string;
  /** Kích thước ĐO ĐƯỢC lúc mở — dùng cho frame `init` bắt buộc (contract §3 bước 4). */
  readonly initialSize: TerminalDimensions;
  /** Cho test tiêm WebSocket giả. Mặc định dùng `globalThis.WebSocket`. */
  readonly socketFactory?: (url: string, protocols: string) => WebSocket;
}

export interface Connection {
  /** Gửi stdin. No-op khi socket chưa mở — byte gõ lúc đang nối lại không được xếp hàng. */
  sendInput(data: string): void;
  sendResize(size: TerminalDimensions): void;
  close(): void;
}

const encoder = new TextEncoder();

export function openConnection(options: ConnectionOptions): Connection {
  const factory =
    options.socketFactory ??
    ((url: string, protocols: string): WebSocket => new WebSocket(url, protocols));

  const socket = factory(options.url, SUBPROTOCOL);
  // Contract §1 bẫy 2 — BẮT BUỘC. Mặc định của trình duyệt là 'blob', và một
  // Blob đi vào `terminal.write()` không phải Uint8Array: xterm nhận string |
  // Uint8Array, nên Blob rơi vào nhánh string và in ra "[object Blob]".
  socket.binaryType = 'arraybuffer';

  let closed = false;

  socket.addEventListener('open', () => {
    // Contract §3 bước 4 — `init` là frame ĐẦU TIÊN, trước mọi stdin. Server chờ
    // nó (3s) trước khi dial exec, nên gửi muộn là prompt vẽ ở 80×24 rồi nhảy.
    socket.send(
      encodeClientControl({
        type: 'init',
        cols: clampDimension(options.initialSize.cols),
        rows: clampDimension(options.initialSize.rows),
      }),
    );
  });

  socket.addEventListener('message', (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (typeof data === 'string') {
      // Text frame = control JSON (contract §1). Frame không parse được bị BỎ
      // QUA chứ không làm sập terminal — nhưng PHẢI kêu lên.
      //
      // ⛔ Bản đầu bỏ qua IM LẶNG, và đó chính là thứ giấu mất lệch contract
      // `hardCapAt` suốt buổi đo trên cụm: `ready` bị loại, badge đứng ở "Đang
      // kết nối…", terminal vẫn gõ được, và KHÔNG một dòng log nào. "Bỏ qua an
      // toàn" mà không có tín hiệu là fallback im lặng — đúng thứ
      // `development-principles.md` cấm.
      const control = parseServerControl(data);
      if (control === null) {
        console.warn(
          '[dlp-terminal] bỏ qua control frame không khớp contract dlp.terminal.v1:',
          data.slice(0, 200),
        );
        return;
      }
      options.onControl(control);
      return;
    }
    if (data instanceof ArrayBuffer) {
      options.onBinary(new Uint8Array(data));
    }
  });

  socket.addEventListener('close', (event: CloseEvent) => {
    if (closed) {
      return;
    }
    closed = true;
    options.onClose(event.code);
  });

  socket.addEventListener('error', () => {
    // Trình duyệt luôn phát `close` sau `error`, nên KHÔNG gọi onClose ở đây —
    // gọi cả hai chỗ là đếm hai lần một lần rớt, và bộ đếm backoff nhảy 2 bậc
    // mỗi lần mất mạng. Sự kiện này cố tình không mang thông tin gì (contract §7).
  });

  return {
    sendInput(data: string): void {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      // Contract §1 bẫy 1 — `onData` trả STRING; gửi thẳng thành text frame và
      // server đọc nó như control JSON hỏng rồi đóng 4400. Phải encode ra binary.
      socket.send(encoder.encode(data));
    },

    sendResize(size: TerminalDimensions): void {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      socket.send(
        encodeClientControl({
          type: 'resize',
          cols: clampDimension(size.cols),
          rows: clampDimension(size.rows),
        }),
      );
    },

    close(): void {
      if (closed) {
        return;
      }
      closed = true;
      // Đóng chủ động (unmount / đổi phiên) KHÔNG được gọi onClose: máy trạng
      // thái sẽ hiểu là mất kết nối và hẹn giờ nối lại vào một component đã
      // unmount — đúng ca rò WebSocket ở StrictMode dev.
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close(1000, 'client closed');
      }
    },
  };
}

/**
 * Contract §7 — dựng URL WS cùng origin với trang.
 *
 * Cùng origin là ĐIỀU KIỆN, không phải tiện nghi: cookie `dlp_sandbox` là
 * `SameSite=Strict` + host-only (§2), nên một origin khác thì trình duyệt không
 * gửi cookie và handshake trả 401 — mà FE chỉ thấy `1006` trần trụi.
 *
 * `https:` → `wss:`, `http:` → `ws:`. Không hardcode `wss:`: dev chạy qua
 * `http://localhost:8080` (proxy gộp origin) và ép wss ở đó là không nối được.
 */
export function buildSessionWsUrl(origin: string, sessionId: string): string {
  const url = new URL(origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/ws/session/${encodeURIComponent(sessionId)}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export { CLOSE_ABNORMAL };
