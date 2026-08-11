import { describe, expect, it } from 'vitest';
import {
  CLOSE_ABNORMAL,
  CloseCode,
  clampDimension,
  isRetryableCloseCode,
  parseServerControl,
} from './protocol.ts';

describe('parseServerControl — ready', () => {
  it('đọc đủ 5 field của contract §5', () => {
    const parsed = parseServerControl(
      JSON.stringify({
        type: 'ready',
        sessionId: 'abc',
        podName: 'sbx-x1',
        expiresAt: '2026-08-11T12:00:00Z',
        hardCapAt: '2026-08-11T13:00:00Z',
        maxFrameBytes: 32768,
      }),
    );
    expect(parsed).toEqual({
      type: 'ready',
      sessionId: 'abc',
      podName: 'sbx-x1',
      expiresAt: '2026-08-11T12:00:00Z',
      hardCapAt: '2026-08-11T13:00:00Z',
      maxFrameBytes: 32768,
    });
  });

  it('CHẤP NHẬN ready VẮNG hardCapAt — đúng frame gateway thật gửi', () => {
    // Ca hồi quy của lệch contract tìm thấy trên cụm 2026-08-11 (1.F): bảng §5
    // liệt kê `hardCapAt` là bắt buộc, nhưng `buildReady` của gateway CỐ Ý không
    // gửi (nó không có HARD_CAP — đó là config của orchestrator). Parser bản đầu
    // bắt buộc field này nên loại SẠCH mọi `ready`, và triệu chứng là badge
    // "đang kết nối" vĩnh viễn trong khi terminal vẫn gõ được.
    //
    // Byte dưới đây copy từ frame THẬT gateway gửi, không phải tự bịa.
    const parsed = parseServerControl(
      '{"type":"ready","sessionId":"18f04fec","podName":"sandbox-6a60ffa2e63c",' +
        '"expiresAt":"2026-08-11T10:05:00Z","maxFrameBytes":32768}',
    );
    expect(parsed).toEqual({
      type: 'ready',
      sessionId: '18f04fec',
      podName: 'sandbox-6a60ffa2e63c',
      expiresAt: '2026-08-11T10:05:00Z',
      hardCapAt: null,
      maxFrameBytes: 32768,
    });
  });

  it('THIẾU expiresAt thì trả null, không trả object có field undefined', () => {
    // Đây là ca biện minh cho việc kiểm từng field thay vì `as ServerControl`.
    // Ép kiểu mù sẽ cho `expiresAt: undefined` chảy vào `new Date()` và đồng hồ
    // đếm ngược hiện NaN — lỗi hiện ở tận mắt người dùng, cách nguyên nhân 3 tầng.
    const parsed = parseServerControl(
      JSON.stringify({ type: 'ready', sessionId: 'a', podName: 'p', hardCapAt: 'x', maxFrameBytes: 1 }),
    );
    expect(parsed).toBeNull();
  });

  it('maxFrameBytes dạng chuỗi bị từ chối (server Go phát number)', () => {
    const parsed = parseServerControl(
      JSON.stringify({
        type: 'ready',
        sessionId: 'a',
        podName: 'p',
        expiresAt: 'x',
        hardCapAt: 'y',
        maxFrameBytes: '32768',
      }),
    );
    expect(parsed).toBeNull();
  });
});

describe('parseServerControl — expiring', () => {
  it('VẮNG hardCapReached ⇒ false, không phải undefined (contract §5 omitempty)', () => {
    const parsed = parseServerControl(
      JSON.stringify({ type: 'expiring', expiresAt: '2026-08-11T12:05:00Z' }),
    );
    expect(parsed).toEqual({
      type: 'expiring',
      expiresAt: '2026-08-11T12:05:00Z',
      hardCapReached: false,
    });
  });

  it('hardCapReached: true đi qua nguyên vẹn', () => {
    const parsed = parseServerControl(
      JSON.stringify({ type: 'expiring', expiresAt: 'x', hardCapReached: true }),
    );
    expect(parsed).toMatchObject({ hardCapReached: true });
  });

  it('hardCapReached là chuỗi "true" ⇒ vẫn false (không truthy-coerce)', () => {
    // Coerce kiểu `Boolean(x)` sẽ cho "false" → true. Cảnh báo "hết đường gia
    // hạn" hiện sai lúc là mất niềm tin vào chính cảnh báo đó.
    const parsed = parseServerControl(
      JSON.stringify({ type: 'expiring', expiresAt: 'x', hardCapReached: 'false' }),
    );
    expect(parsed).toMatchObject({ hardCapReached: false });
  });
});

describe('parseServerControl — biên tin cậy', () => {
  it.each([
    ['JSON hỏng', '{not json'],
    ['mảng thay vì object', '[1,2,3]'],
    ['null', 'null'],
    ['type lạ (server mới hơn FE)', '{"type":"quantum"}'],
    ['thiếu type', '{"expiresAt":"x"}'],
    ['exit thiếu exitCode', '{"type":"exit"}'],
    ['error thiếu code', '{"type":"error","message":"x"}'],
  ])('%s ⇒ null, không ném', (_label, raw) => {
    expect(() => parseServerControl(raw)).not.toThrow();
    expect(parseServerControl(raw)).toBeNull();
  });

  it('error thiếu message vẫn qua — code mới là thứ FE switch trên đó', () => {
    expect(parseServerControl('{"type":"error","code":"SESSION_EXPIRED"}')).toEqual({
      type: 'error',
      code: 'SESSION_EXPIRED',
      message: '',
    });
  });
});

describe('clampDimension — contract §4 (1 ≤ n ≤ 1000)', () => {
  it.each([
    [0, 1],
    [-5, 1],
    [1, 1],
    [120, 120],
    [1000, 1000],
    [1001, 1000],
    [99999, 1000],
    [80.7, 80],
  ])('%d → %d', (input, expected) => {
    expect(clampDimension(input)).toBe(expected);
  });

  it('NaN → 1 chứ không lọt NaN vào JSON', () => {
    expect(clampDimension(Number.NaN)).toBe(1);
    expect(clampDimension(Number.POSITIVE_INFINITY)).toBe(1000);
  });
});

describe('isRetryableCloseCode — bảng contract §6', () => {
  it('chỉ 1012 và 4500 được retry', () => {
    expect(isRetryableCloseCode(CloseCode.SERVICE_RESTART)).toBe(true);
    expect(isRetryableCloseCode(CloseCode.INTERNAL)).toBe(true);
  });

  it.each([
    ['NORMAL', CloseCode.NORMAL],
    ['MESSAGE_TOO_BIG', CloseCode.MESSAGE_TOO_BIG],
    ['PROTOCOL_ERROR', CloseCode.PROTOCOL_ERROR],
    ['UNAUTHENTICATED', CloseCode.UNAUTHENTICATED],
    ['FORBIDDEN', CloseCode.FORBIDDEN],
    ['SESSION_GONE', CloseCode.SESSION_GONE],
    ['IDLE_TIMEOUT', CloseCode.IDLE_TIMEOUT],
    ['HARD_CAP_REACHED', CloseCode.HARD_CAP_REACHED],
    ['RATE_LIMITED', CloseCode.RATE_LIMITED],
  ])('%s KHÔNG retry', (_label, code) => {
    expect(isRetryableCloseCode(code)).toBe(false);
  });

  it('mã lạ mặc định KHÔNG retry', () => {
    // Vế chống-suy-luận-theo-dải: 4501 nằm cạnh 4500 (retry) nhưng phải là false.
    expect(isRetryableCloseCode(4501)).toBe(false);
    expect(isRetryableCloseCode(1013)).toBe(false);
  });

  it('1006 KHÔNG nằm trong bảng — nó do decideRetry xử lý riêng', () => {
    expect(isRetryableCloseCode(CLOSE_ABNORMAL)).toBe(false);
  });
});
