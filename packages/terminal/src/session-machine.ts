import { backoffDelayMs, decideRetry } from './backoff.ts';
import { CLOSE_ABNORMAL, CloseCode, type ServerControl } from './protocol.ts';

/**
 * F9 — máy trạng thái UI của trang `/session`, viết dưới dạng reducer THUẦN để
 * test được không cần DOM, không cần WebSocket, không cần đồng hồ thật.
 *
 * ## Hai chỗ lệch có chủ ý so với danh sách state trong plan (`idle → creating →
 * claiming → connecting → ready → (reconnecting) → expired | error`)
 *
 * 1. **KHÔNG có `claiming`.** Sơ đồ luồng đã pin ở §"Kiến trúc luồng" cho
 *    `CreateSession` claim pod **ngay trong cùng lời gọi** (B3: pool rỗng thì đi
 *    cold-path *đồng bộ* rồi mới trả về), nên lúc `create` trả về thì `podName`
 *    đã có và status đã là `CLAIMED`. Một state chỉ đi qua trong 0ms và không
 *    bao giờ dừng lại ở đó là code chết — thứ chính plan này phê phán. Phép
 *    kiểm "session có nối được không" vẫn còn, nhưng nó là một *điều kiện* trên
 *    cạnh `creating → connecting`, không phải một *state*: xem `applyCreated`.
 * 2. **CÓ THÊM `exited`.** Contract §5 định nghĩa control message `exit` (shell
 *    tự thoát, kèm close `1000`) mà danh sách state của plan không có chỗ nào
 *    nhận. Gộp nó vào `idle` thì mất thông tin "pod vẫn còn, nối lại được ngay
 *    mà không tốn thêm một pod khỏi trần quota 4"; gộp vào `error` thì báo lỗi
 *    cho một hành động người dùng CỐ Ý làm (gõ `exit`).
 */
export type SessionPhase =
  | 'idle'
  | 'creating'
  | 'connecting'
  | 'ready'
  | 'reconnecting'
  | 'exited'
  | 'expired'
  | 'error';

/** Status enum của `orchestrator.v1.SessionStatus` mà gateway bước h chấp nhận. */
const CONNECTABLE_STATUS: ReadonlySet<number> = new Set<number>([
  3, // SESSION_STATUS_CLAIMED
  4, // SESSION_STATUS_RUNNING
]);

export interface SessionState {
  readonly phase: SessionPhase;
  readonly sessionId: string | null;
  readonly podName: string | null;
  readonly expiresAtMs: number | null;
  readonly hardCapAtMs: number | null;
  /** Contract §5 — chỉ CẢNH BÁO người dùng khi cờ này bật. */
  readonly hardCapReached: boolean;
  readonly maxFrameBytes: number | null;
  /**
   * Contract §7 — "thấy `1006` mà **chưa từng** nhận `ready`" là điều kiện gọi
   * `session.get`. Phải là "chưa từng trong SUỐT VÒNG ĐỜI session", không phải
   * "chưa ready ở lần nối này": sau một lần ready thành công, mọi 1006 về sau
   * đều có mã lỗi thật đi kèm qua `error`, và gọi thêm tRPC ở đó là một
   * round-trip thừa trên mỗi lần rớt mạng.
   */
  readonly everReady: boolean;
  readonly attempt: number;
  /** Hiệu ứng: khác `null` ⇒ tầng React hẹn giờ nối lại sau chừng này ms. */
  readonly retryDelayMs: number | null;
  /** Hiệu ứng: `true` ⇒ tầng React gọi tRPC `session.get` để biết lý do thật. */
  readonly needsReasonLookup: boolean;
  /** Tiếng Việt, hiển thị thẳng cho người dùng. */
  readonly message: string | null;
}

export const initialState: SessionState = {
  phase: 'idle',
  sessionId: null,
  podName: null,
  expiresAtMs: null,
  hardCapAtMs: null,
  hardCapReached: false,
  maxFrameBytes: null,
  everReady: false,
  attempt: 0,
  retryDelayMs: null,
  needsReasonLookup: false,
  message: null,
};

/** Shape tối thiểu của `JsonSession` mà BFF trả về (apps/web session.ts). */
export interface CreatedSession {
  readonly id: string;
  readonly podName: string;
  readonly status: number;
  readonly expiresAt: string | null;
}

export type SessionEvent =
  | { readonly type: 'START' }
  | { readonly type: 'CREATED'; readonly session: CreatedSession }
  | { readonly type: 'CREATE_FAILED'; readonly message: string }
  | { readonly type: 'CONTROL'; readonly message: ServerControl }
  | { readonly type: 'CLOSED'; readonly code: number; readonly nowMs: number }
  | { readonly type: 'RETRY_NOW' }
  | { readonly type: 'REASON_RESOLVED'; readonly message: string; readonly gone: boolean }
  /** Người dùng tự kết thúc phiên (BFF đã reap xong). Về idle, KHÔNG nối lại. */
  | { readonly type: 'ENDED' }
  /**
   * Server đã gia hạn xong. `expiresAt` là giá trị SERVER trả, không phải thứ
   * client tự cộng — đó là khác biệt giữa "nhận sự thật qua một kênh khác" và
   * "tự bịa ra một derived field".
   */
  | {
      readonly type: 'EXTENDED';
      readonly expiresAt: string | null;
      readonly hardCapReached: boolean;
    };

function parseIsoMs(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function applyCreated(state: SessionState, session: CreatedSession): SessionState {
  // Cạnh `creating → connecting` có điều kiện — xem ghi chú "không có claiming"
  // ở đầu file. Không nối vào một session mà gateway chắc chắn từ chối: bước h
  // trả 409 và bước f trả 404, nhưng contract §7 nói FE chỉ thấy `1006` trần
  // trụi. Chặn ở đây đổi một "mất kết nối" bí ẩn lấy một câu tiếng Việt đúng.
  if (session.podName === '' || !CONNECTABLE_STATUS.has(session.status)) {
    return {
      ...state,
      phase: 'error',
      sessionId: session.id,
      message:
        'orchestrator trả session chưa sẵn sàng (chưa có pod hoặc sai trạng thái) — thử tạo lại phiên.',
    };
  }
  return {
    ...state,
    phase: 'connecting',
    sessionId: session.id,
    podName: session.podName,
    expiresAtMs: parseIsoMs(session.expiresAt),
    attempt: 0,
    retryDelayMs: null,
    needsReasonLookup: false,
    message: null,
  };
}

function applyControl(state: SessionState, message: ServerControl): SessionState {
  switch (message.type) {
    case 'ready':
      return {
        ...state,
        phase: 'ready',
        podName: message.podName,
        sessionId: message.sessionId,
        expiresAtMs: parseIsoMs(message.expiresAt) ?? state.expiresAtMs,
        hardCapAtMs: parseIsoMs(message.hardCapAt) ?? state.hardCapAtMs,
        maxFrameBytes: message.maxFrameBytes,
        everReady: true,
        attempt: 0,
        retryDelayMs: null,
        needsReasonLookup: false,
        message: null,
      };

    case 'expiring':
      // Contract §5 (làm rõ ở 1.C-3): `expiring` phát MỖI LẦN `expiresAt` đổi,
      // không chỉ lúc chạm trần. Cập nhật đồng hồ luôn; chỉ dựng cảnh báo khi
      // `hardCapReached`. Bản trước của plan hiểu ngược, và hậu quả là đồng hồ
      // chạy về 0 ở mọi phiên dài hơn ~55 phút trong khi terminal vẫn sống.
      return {
        ...state,
        expiresAtMs: parseIsoMs(message.expiresAt) ?? state.expiresAtMs,
        hardCapReached: message.hardCapReached,
      };

    case 'error':
      // `message` là tiếng Việt của server — hiển thị, KHÔNG parse (contract §5).
      // Phân loại đi theo `code` (enum ổn định), đúng thứ contract bảo switch.
      return {
        ...state,
        phase: message.code === 'SESSION_EXPIRED' ? 'expired' : 'error',
        message: message.message,
      };

    case 'exit':
      return {
        ...state,
        phase: 'exited',
        message:
          message.exitCode === 0
            ? 'Shell đã thoát. Pod vẫn còn — nối lại để mở phiên mới trong cùng pod.'
            : `Shell thoát với mã ${String(message.exitCode)}. Nối lại để thử tiếp.`,
      };
  }
}

function closeMessage(code: number): { phase: SessionPhase; message: string } {
  switch (code) {
    case CloseCode.HARD_CAP_REACHED:
      // F9 nói thẳng: KHÔNG phải "phiên bị thu hồi".
      return {
        phase: 'expired',
        message: 'Bạn đã dùng hết thời lượng tối đa cho phiên này. Hãy tạo phiên mới.',
      };
    case CloseCode.SESSION_GONE:
      // Gánh CẢ hai nguyên nhân từ 2026-08-12 (1.G-1): bị thu hồi, và hết hạn
      // vì không hoạt động. `4408` đã bị bỏ khỏi contract §6 — hệ thống không
      // có idle-window tách rời, nên hai ca đó đi chung một đường code và người
      // dùng cần đọc được cả hai khả năng trong một câu.
      return {
        phase: 'expired',
        message: 'Phiên đã kết thúc và pod đã được thu hồi (hết hạn hoặc bị thu hồi).',
      };
    case CloseCode.UNAUTHENTICATED:
      return { phase: 'error', message: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' };
    case CloseCode.FORBIDDEN:
      return { phase: 'error', message: 'Không có quyền truy cập phiên này.' };
    case CloseCode.RATE_LIMITED:
      return { phase: 'error', message: 'Vượt giới hạn tốc độ. Hãy chờ một lát rồi tạo phiên mới.' };
    case CloseCode.MESSAGE_TOO_BIG:
      return { phase: 'error', message: 'Dữ liệu gửi lên vượt giới hạn một frame.' };
    case CloseCode.PROTOCOL_ERROR:
      return { phase: 'error', message: 'Lỗi giao thức giữa trình duyệt và gateway.' };
    default:
      return { phase: 'error', message: `Mất kết nối tới phiên (mã ${String(code)}).` };
  }
}

function applyClosed(state: SessionState, code: number, nowMs: number): SessionState {
  if (state.phase === 'idle') {
    // Không có phiên nào để đóng. Xảy ra thật sau `ENDED`: BFF reap xong, máy
    // trạng thái về idle, RỒI gateway mới đóng WS với 4404 — không có guard
    // này thì cái đuôi đó ghi đè idle thành `expired` với câu "pod đã bị thu
    // hồi", tức một phiên người dùng vừa CHỦ ĐỘNG kết thúc hiện ra như bị hệ
    // thống giết.
    return state;
  }
  if (code === CloseCode.NORMAL && state.phase === 'exited') {
    // `exit` đã tới trước và đã quyết định phase — close 1000 chỉ là đuôi của nó
    // (contract §5: "`exit` … kèm ngay sau là close `1000`"). Ghi đè ở đây sẽ
    // xoá mất câu thông báo mà `applyControl` vừa đặt.
    return state;
  }

  const decision = decideRetry({ closeCode: code, expiresAtMs: state.expiresAtMs, nowMs });

  if (decision.retry) {
    const attempt = state.attempt + 1;
    return {
      ...state,
      phase: 'reconnecting',
      attempt,
      // CƠ SỞ tất định của lịch backoff. Jitter KHÔNG áp ở đây vì `reduce` phải
      // thuần (nó còn được gọi qua `events.reduce(reduce, from)`, nên một tham
      // số thứ ba sẽ nhận nhầm CHỈ SỐ mảng làm nguồn ngẫu nhiên). Nơi hẹn giờ
      // gọi `backoffDelayMsJittered(state.attempt)` — xem backoff.ts § AC-H6.
      retryDelayMs: backoffDelayMs(attempt),
      // Contract §7 — chỉ hỏi lý do thật khi CHƯA TỪNG ready và đúng mã 1006.
      needsReasonLookup: code === CLOSE_ABNORMAL && !state.everReady,
      message: null,
    };
  }

  if (decision.reason === 'expired') {
    return {
      ...state,
      phase: 'expired',
      retryDelayMs: null,
      needsReasonLookup: false,
      message: 'Phiên đã hết hạn.',
    };
  }

  const resolved = closeMessage(code);
  return {
    ...state,
    phase: resolved.phase,
    retryDelayMs: null,
    needsReasonLookup: false,
    message: resolved.message,
  };
}

export function reduce(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'START':
      return { ...initialState, phase: 'creating' };

    case 'CREATED':
      return applyCreated(state, event.session);

    case 'CREATE_FAILED':
      return { ...state, phase: 'error', message: event.message };

    case 'CONTROL':
      return applyControl(state, event.message);

    case 'CLOSED':
      return applyClosed(state, event.code, event.nowMs);

    case 'RETRY_NOW':
      return { ...state, phase: 'connecting', retryDelayMs: null };

    case 'EXTENDED':
      // KHÔNG đổi `phase`: gia hạn không phải một chuyển trạng thái, nó chỉ đẩy
      // đồng hồ. Đổi phase ở đây sẽ đá một phiên đang `reconnecting` về `ready`
      // trong khi WS vẫn đứt.
      return {
        ...state,
        expiresAtMs: parseIsoMs(event.expiresAt) ?? state.expiresAtMs,
        hardCapReached: event.hardCapReached,
      };

    case 'ENDED':
      // Về đúng initialState (sessionId null ⇒ nút "Bắt đầu" hiện lại), chỉ giữ
      // một câu để người dùng biết chuyện gì vừa xảy ra. retryDelayMs null là
      // phần quan trọng: kết thúc giữa lúc đang `reconnecting` phải HUỶ lịch nối
      // lại, không thì effect hẹn giờ nối vào một phiên đã reap.
      return {
        ...initialState,
        message: 'Bạn đã kết thúc phiên. Bấm "Bắt đầu" để mở phiên mới.',
      };

    case 'REASON_RESOLVED':
      // Đã biết lý do thật từ `session.get` ⇒ dừng vòng nối lại nếu session chết.
      return event.gone
        ? {
            ...state,
            phase: 'expired',
            retryDelayMs: null,
            needsReasonLookup: false,
            message: event.message,
          }
        : { ...state, needsReasonLookup: false, message: event.message };
  }
}
