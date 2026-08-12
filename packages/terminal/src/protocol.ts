/**
 * Bản dịch phía client của `docs/ws-terminal-protocol.md` (contract SSOT).
 *
 * ⛔ File này KHÔNG được tự chế shape. Mọi tên field, mọi giá trị enum, mọi mã
 * đóng đều copy từ contract; sửa ở đây mà không sửa contract là tạo ra đúng loại
 * lệch mà `rules/contract-first-integration.md` tồn tại để chặn — và typecheck
 * của riêng lane FE sẽ không bao giờ bắt được, vì mỗi bên tự nhất quán.
 */

/** Contract §0 — version nằm ở subprotocol, không ở field trong message. */
export const SUBPROTOCOL = 'dlp.terminal.v1';

/** Contract §4 — client → server, text frame JSON camelCase. */
export type ClientControl =
  | { readonly type: 'init'; readonly cols: number; readonly rows: number }
  | { readonly type: 'resize'; readonly cols: number; readonly rows: number };

/**
 * Contract §4 — `1 ≤ n ≤ 1000`. Server clamp và log chứ KHÔNG đóng kết nối, nên
 * client clamp ở đây là để không gửi rác đi, không phải để tránh bị ngắt.
 */
export const MIN_DIMENSION = 1;
export const MAX_DIMENSION = 1000;

export function clampDimension(value: number): number {
  // Chỉ NaN mới rơi về MIN. `Number.isFinite` chặn cả `Infinity`, và với nó thì
  // một chiều rộng vô hạn (bug layout ⇒ container 0 ⇒ phép chia ra Infinity)
  // biến thành terminal RỘNG 1 CỘT — hỏng nặng hơn nhiều so với việc kẹp về
  // trần 1000. NaN thì khác: nó không phải "quá lớn", nó là "không phải số".
  if (Number.isNaN(value)) {
    return MIN_DIMENSION;
  }
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.trunc(value)));
}

/** Contract §5 — server → client. */
export interface ReadyMessage {
  readonly type: 'ready';
  readonly sessionId: string;
  readonly podName: string;
  readonly expiresAt: string;
  /**
   * ⛔ `null` ở v1 — gateway CỐ Ý KHÔNG gửi field này, dù contract §5 từng liệt
   * kê nó như bắt buộc.
   *
   * Lý do nằm ở `services/terminal-gateway/internal/podexec/bridge.go`
   * (`buildReady`): mốc đó = `createdAt + HARD_CAP`, mà `HARD_CAP` là config của
   * ORCHESTRATOR. Để gateway tự tính, nó phải mang một `GATEWAY_HARD_CAP` riêng
   * — tức hằng số THỨ HAI cho cùng một con số. Lý lẽ đó đúng, nên bên phải sửa
   * là contract + FE, không phải gateway.
   *
   * **Vì sao đây là bug thật, không phải chi tiết:** bản đầu của parser này BẮT
   * BUỘC `hardCapAt`, nên MỌI frame `ready` bị trả `null` và bỏ qua — im lặng.
   * Triệu chứng trên cụm: terminal vẽ prompt và gõ được (byte binary vẫn chảy),
   * nhưng badge đứng ở "Đang kết nối…" mãi mãi và đồng hồ không bao giờ hiện.
   * Không log, không lỗi, không gì cả. Đúng loại lệch contract mà
   * `rules/contract-first-integration.md` nói typecheck từng bên không bắt được.
   */
  readonly hardCapAt: string | null;
  readonly maxFrameBytes: number;
}

export interface ExpiringMessage {
  readonly type: 'expiring';
  readonly expiresAt: string;
  /**
   * Contract §5: `omitempty` phía Go ⇒ **vắng field nghĩa là `false`**, không
   * phải "không biết". `parseServerControl` vì thế điền `false` chứ không để
   * `undefined` — nếu để, mọi call-site phải nhớ `?? false` và một chỗ quên là
   * một cảnh báo "hết đường gia hạn" hiện ra sai lúc.
   */
  readonly hardCapReached: boolean;
}

export interface ErrorMessage {
  readonly type: 'error';
  readonly code: string;
  /** Tiếng Việt cho người đọc. Contract §5 nói rõ: FE **không** parse chuỗi này. */
  readonly message: string;
}

export interface ExitMessage {
  readonly type: 'exit';
  readonly exitCode: number;
}

export type ServerControl = ReadyMessage | ExpiringMessage | ErrorMessage | ExitMessage;

/**
 * Contract §6 — dải 4000–4999 là dải ứng dụng (RFC 6455).
 *
 * `MESSAGE_TOO_BIG = 1009` KHÔNG phải `4413`: chốt bằng spike 1.A-1 vì
 * `SetReadLimit` của `coder/websocket` tự đóng ngay trong tầng thư viện, code
 * ứng dụng không bao giờ thấy frame vi phạm nên không có chỗ phát mã 4xxx.
 */
export const CloseCode = {
  NORMAL: 1000,
  MESSAGE_TOO_BIG: 1009,
  SERVICE_RESTART: 1012,
  PROTOCOL_ERROR: 4400,
  UNAUTHENTICATED: 4401,
  FORBIDDEN: 4403,
  SESSION_GONE: 4404,
  // `IDLE_TIMEOUT: 4408` ĐÃ BỊ BỎ 2026-08-12 (chặng 1.G-1). Nó là mã chết từ
  // đầu: hệ thống không có idle-window tách rời — phiên im lặng chỉ đơn giản là
  // hết `expiresAt` → reaper xoá pod → gateway đóng `SESSION_GONE`. Giữ nó lại
  // là giữ một nhánh `switch` không bao giờ chạy và nói dối người đọc bảng.
  // Xem contract §6.
  HARD_CAP_REACHED: 4409,
  RATE_LIMITED: 4429,
  INTERNAL: 4500,
} as const;

export type CloseCodeValue = (typeof CloseCode)[keyof typeof CloseCode];

/**
 * Mã đóng "trình duyệt tự phát khi handshake hỏng" — contract §7.
 *
 * WebSocket API KHÔNG phơi HTTP status của handshake fail, nên mọi lỗi ở bước 2
 * (401/403/404/409/429) tới FE dưới dạng `1006` giống hệt "gateway chết". Đây là
 * lý do `session.get` phải được gọi khi thấy 1006 mà **chưa từng** nhận `ready`.
 */
export const CLOSE_ABNORMAL = 1006;

/**
 * Contract §6 cột "FE nên retry?" — copy nguyên bảng, không suy luận theo dải số.
 *
 * Suy luận theo dải là bẫy: `1012` (retry) và `1000` (không) cùng dải 1xxx, còn
 * `4500` (retry) nằm giữa một rừng 4xxx không retry. Bảng tường minh làm một mã
 * mới lọt vào mà không ai quyết định phải **mặc định KHÔNG retry**, thay vì âm
 * thầm thừa hưởng hành vi của hàng xóm cùng dải.
 */
const RETRYABLE: ReadonlySet<number> = new Set<number>([
  CloseCode.SERVICE_RESTART,
  CloseCode.INTERNAL,
]);

export function isRetryableCloseCode(code: number): boolean {
  return RETRYABLE.has(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Parse control message của server. Trả `null` cho MỌI thứ không khớp contract.
 *
 * Đây là biên tin-cậy: chuỗi vào đây đến từ mạng. `JSON.parse` ném trên chuỗi
 * hỏng, và một `type` lạ (server mới hơn FE) không được phép làm sập terminal —
 * cả hai đều thành `null` để call-site bỏ qua frame đó và chạy tiếp.
 *
 * Kiểm từng field thay vì `as ServerControl`: ép kiểu mù làm `ready.expiresAt`
 * thành `undefined` lọt vào `new Date()` và đồng hồ đếm ngược hiện `NaN` — một
 * lỗi hiện ra ở tận mắt người dùng, cách nguyên nhân ba tầng.
 */
export function parseServerControl(raw: string): ServerControl | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }

  switch (parsed['type']) {
    case 'ready': {
      const sessionId = readString(parsed, 'sessionId');
      const podName = readString(parsed, 'podName');
      const expiresAt = readString(parsed, 'expiresAt');
      const maxFrameBytes = readNumber(parsed, 'maxFrameBytes');
      // `hardCapAt` KHÔNG nằm trong danh sách bắt buộc — xem ReadyMessage.
      // Ba field dưới thì có: thiếu `sessionId`/`podName` là không biết đang nối
      // vào đâu, thiếu `expiresAt` là đồng hồ đếm ngược hiện NaN.
      if (sessionId === null || podName === null || expiresAt === null || maxFrameBytes === null) {
        return null;
      }
      return {
        type: 'ready',
        sessionId,
        podName,
        expiresAt,
        hardCapAt: readString(parsed, 'hardCapAt'),
        maxFrameBytes,
      };
    }

    case 'expiring': {
      const expiresAt = readString(parsed, 'expiresAt');
      if (expiresAt === null) {
        return null;
      }
      // Vắng ⇒ false (§5 `omitempty`). Giá trị không phải boolean cũng về false:
      // "không đọc được" và "chưa chạm trần" dẫn tới cùng một hành vi FE (cập
      // nhật đồng hồ, im lặng), nên không cần một nhánh thứ ba.
      const hardCapReached = parsed['hardCapReached'] === true;
      return { type: 'expiring', expiresAt, hardCapReached };
    }

    case 'error': {
      const code = readString(parsed, 'code');
      const message = readString(parsed, 'message');
      if (code === null) {
        return null;
      }
      return { type: 'error', code, message: message ?? '' };
    }

    case 'exit': {
      const exitCode = readNumber(parsed, 'exitCode');
      if (exitCode === null) {
        return null;
      }
      return { type: 'exit', exitCode };
    }

    default:
      return null;
  }
}

export function encodeClientControl(message: ClientControl): string {
  return JSON.stringify(message);
}
