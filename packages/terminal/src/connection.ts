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

/** Trần cho lượt HANDSHAKE — lý do đầy đủ ở `handshakeTimer` trong `openConnection`. */
export const HANDSHAKE_TIMEOUT_MS = 10_000;

/**
 * C2 — trần MỘT frame stdin khi `ready` chưa tới để báo con số thật.
 *
 * Bằng đúng `MaxFrameBytes` của gateway (`services/terminal-gateway/internal/
 * podexec/bridge.go`, `SetReadLimit(32 KiB)`) và ví dụ `ready` ở contract §5.
 * Cần một giá trị trước `ready` vì stdin được phép đi ngay sau `init` — gateway
 * đệm nó qua `pendingStdin` trong lúc dial exec.
 */
export const DEFAULT_MAX_FRAME_BYTES = 32 * 1024;

/**
 * Khoảng chừa dưới trần. Contract §6 đo được `1009 "read limited at 1025 bytes"`
 * với limit 1024, tức trần là bao gồm — chừa 1 KiB không vì phép tính sai, mà vì
 * vượt trần ở đây là ĐÓNG PHIÊN (1009 không retry), còn chừa thừa chỉ tốn thêm
 * một frame mỗi 31 KiB.
 */
export const FRAME_MARGIN_BYTES = 1024;

/** Một ký tự UTF-8 dài tối đa 4 byte — mảnh nhỏ hơn thì không chứa nổi một ký tự. */
const MIN_CHUNK_BYTES = 4;

/** Số byte tối đa cho MỘT frame stdin khi gateway báo trần `maxFrameBytes`. */
export function inputChunkBytes(maxFrameBytes: number): number {
  if (maxFrameBytes > 2 * FRAME_MARGIN_BYTES) {
    return maxFrameBytes - FRAME_MARGIN_BYTES;
  }
  // Trần nhỏ bất thường: chừa 1 KiB sẽ ăn mất gần hết frame, nên chừa một nửa.
  return Math.max(MIN_CHUNK_BYTES, Math.floor(maxFrameBytes / 2));
}

/**
 * Cắt byte UTF-8 thành các mảnh ≤ `maxChunkBytes`, KHÔNG BAO GIỜ cắt giữa một ký
 * tự: ranh giới lùi lại tới khi byte đầu mảnh sau không phải byte nối tiếp
 * (`10xxxxxx`).
 *
 * Vì sao quan trọng dù PTY nhận một DÒNG byte: gateway và mọi tầng log/metric ở
 * giữa đọc từng frame như một đơn vị; một frame mở đầu bằng nửa ký tự là một
 * frame không hợp lệ UTF-8 đứng riêng. Không có lý do gì để tạo ra nó.
 *
 * Trả về view (`subarray`) chứ không copy — `WebSocket.send` gửi đúng phần view.
 */
export function splitUtf8(
  bytes: Uint8Array<ArrayBuffer>,
  maxChunkBytes: number,
): Uint8Array<ArrayBuffer>[] {
  const limit = Math.max(MIN_CHUNK_BYTES, Math.floor(maxChunkBytes));
  if (bytes.byteLength <= limit) {
    return [bytes];
  }
  const pieces: Uint8Array<ArrayBuffer>[] = [];
  let start = 0;
  while (start < bytes.byteLength) {
    let end = Math.min(start + limit, bytes.byteLength);
    if (end < bytes.byteLength) {
      while (end > start && ((bytes[end] ?? 0) & 0xc0) === 0x80) {
        end -= 1;
      }
      // Không có byte mở đầu nào trong cửa sổ ⇒ đầu vào không phải UTF-8 hợp lệ.
      // `TextEncoder` không bao giờ sinh ra nó; nếu có thì cắt cứng còn hơn lặp vô hạn.
      if (end === start) {
        end = Math.min(start + limit, bytes.byteLength);
      }
    }
    pieces.push(bytes.subarray(start, end));
    start = end;
  }
  return pieces;
}

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
  let opened = false;
  /** C2 — trần frame hiện hành; `ready` thay nó bằng con số gateway báo. */
  let chunkBytes = inputChunkBytes(DEFAULT_MAX_FRAME_BYTES);

  function sendStdin(bytes: Uint8Array<ArrayBuffer>): void {
    for (const piece of splitUtf8(bytes, chunkBytes)) {
      socket.send(piece);
    }
  }

  /**
   * Trần thời gian cho HANDSHAKE — không phải cho phiên.
   *
   * Vì sao cần: một handshake WS có thể không thành công MÀ CŨNG KHÔNG thất bại.
   * Đo được trên cụm 2026-08-13: khi `/ws` không có luật định tuyến và request
   * upgrade rơi xuống Next, server không trả gì cả — `curl` treo trọn 20s với
   * `http_code=000`, và trình duyệt ở nguyên trạng thái CONNECTING, KHÔNG phát
   * `error`, KHÔNG phát `close`. Máy trạng thái vì thế không nhận được sự kiện
   * nào để mà xử lý: badge đứng ở "Đang kết nối…" vĩnh viễn, không lỗi UI,
   * không một dòng console. Mọi phanh phía sau (backoff, hỏi lý do thật ở
   * contract §7) đều vô dụng vì chúng đều bắt đầu từ một `close`.
   *
   * Đây KHÔNG phải ca giả định của phòng lab: bất kỳ proxy/LB nào nuốt mất
   * upgrade — sai luật ingress, middleware chặn, gateway treo — đều cho đúng
   * hình dạng này ở production.
   *
   * 10s: handshake là một lượt HTTP upgrade, không phải provisioning (pod đã
   * `ready` trước khi FE nối). Chờ lâu hơn chỉ kéo dài đoạn người dùng ngồi nhìn
   * màn hình không nói gì.
   */
  const handshakeTimer = setTimeout(() => {
    if (opened || closed) {
      return;
    }
    closed = true;
    // Báo CLOSE_ABNORMAL chứ không phải một mã riêng: đó ĐÚNG là thứ đã xảy ra
    // dưới góc nhìn của client (không có close code từ server), và nó chảy vào
    // đúng nhánh mà `session-machine` đã có sẵn cho ca "1006 khi chưa từng
    // ready" — retry có backoff + đi hỏi lý do thật.
    options.onClose(CLOSE_ABNORMAL);
    socket.close();
  }, HANDSHAKE_TIMEOUT_MS);

  socket.addEventListener('open', () => {
    opened = true;
    clearTimeout(handshakeTimer);
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
      if (control.type === 'ready') {
        if (Number.isFinite(control.maxFrameBytes) && control.maxFrameBytes >= MIN_CHUNK_BYTES) {
          chunkBytes = inputChunkBytes(control.maxFrameBytes);
        } else {
          console.warn(
            '[dlp-terminal] `ready.maxFrameBytes` không dùng được, giữ trần mặc định:',
            control.maxFrameBytes,
          );
        }
      }
      options.onControl(control);
      return;
    }
    if (data instanceof ArrayBuffer) {
      options.onBinary(new Uint8Array(data));
    }
  });

  socket.addEventListener('close', (event: CloseEvent) => {
    clearTimeout(handshakeTimer);
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
      // C2 — và chia theo byte: một frame vượt `maxFrameBytes` là `1009`, đóng hẳn.
      sendStdin(encoder.encode(data));
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
      clearTimeout(handshakeTimer);
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
