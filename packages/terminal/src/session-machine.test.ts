import { describe, expect, it } from 'vitest';
import { initialState, reduce, type SessionState } from './session-machine.ts';
import { CLOSE_ABNORMAL, CloseCode } from './protocol.ts';

const NOW = Date.parse('2026-08-11T12:00:00Z');
const IN_AN_HOUR = '2026-08-11T13:00:00Z';

/** Chạy một chuỗi event để tới trạng thái muốn test, thay vì dựng object bằng tay. */
function run(events: Parameters<typeof reduce>[1][], from: SessionState = initialState) {
  return events.reduce(reduce, from);
}

const CREATED = {
  type: 'CREATED' as const,
  session: { id: 's1', podName: 'sbx-1', status: 3, expiresAt: IN_AN_HOUR },
};

const READY = {
  type: 'CONTROL' as const,
  message: {
    type: 'ready' as const,
    sessionId: 's1',
    podName: 'sbx-1',
    expiresAt: IN_AN_HOUR,
    hardCapAt: '2026-08-11T14:00:00Z',
    maxFrameBytes: 32768,
  },
};

describe('đường đi thành công', () => {
  it('idle → creating → connecting → ready', () => {
    expect(run([{ type: 'START' }]).phase).toBe('creating');
    expect(run([{ type: 'START' }, CREATED]).phase).toBe('connecting');

    const ready = run([{ type: 'START' }, CREATED, READY]);
    expect(ready.phase).toBe('ready');
    expect(ready.podName).toBe('sbx-1');
    expect(ready.maxFrameBytes).toBe(32768);
    expect(ready.everReady).toBe(true);
    expect(ready.expiresAtMs).toBe(Date.parse(IN_AN_HOUR));
  });
});

describe('ENDED — người dùng tự kết thúc phiên', () => {
  it('ready → ENDED về idle, sessionId null, có câu thông báo', () => {
    const state = run([{ type: 'START' }, CREATED, READY, { type: 'ENDED' }]);
    expect(state.phase).toBe('idle');
    expect(state.sessionId).toBeNull();
    expect(state.retryDelayMs).toBeNull();
    expect(state.message).toContain('kết thúc');
  });

  it('ENDED giữa lúc reconnecting HUỶ lịch nối lại', () => {
    const reconnecting = run([
      { type: 'START' },
      CREATED,
      READY,
      { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: Date.parse(IN_AN_HOUR) - 30 * 60_000 },
    ]);
    expect(reconnecting.phase).toBe('reconnecting');
    expect(reconnecting.retryDelayMs).not.toBeNull();

    const ended = reduce(reconnecting, { type: 'ENDED' });
    expect(ended.phase).toBe('idle');
    expect(ended.retryDelayMs).toBeNull();
  });

  it('đuôi CLOSED 4404 tới SAU ENDED không ghi đè idle thành expired', () => {
    // Đối chứng: cùng mã 4404 trên một phiên đang ready thì PHẢI ra expired —
    // guard chỉ được bắt ca idle, không được nuốt mã đóng của phiên sống.
    const live = run([
      { type: 'START' },
      CREATED,
      READY,
      { type: 'CLOSED', code: CloseCode.SESSION_GONE, nowMs: Date.parse(IN_AN_HOUR) - 30 * 60_000 },
    ]);
    expect(live.phase).toBe('expired');

    const after = run([
      { type: 'START' },
      CREATED,
      READY,
      { type: 'ENDED' },
      { type: 'CLOSED', code: CloseCode.SESSION_GONE, nowMs: Date.parse(IN_AN_HOUR) - 30 * 60_000 },
    ]);
    expect(after.phase).toBe('idle');
    expect(after.message).toContain('kết thúc');
  });
});

describe('cạnh creating → connecting có điều kiện (thay cho state `claiming`)', () => {
  it('podName rỗng ⇒ error, KHÔNG mở WS', () => {
    // Không có phép kiểm này thì FE mở WS vào một session gateway chắc chắn từ
    // chối, và contract §7 nói người dùng chỉ thấy `1006` trần trụi.
    const state = run([
      { type: 'START' },
      { type: 'CREATED', session: { id: 's1', podName: '', status: 3, expiresAt: IN_AN_HOUR } },
    ]);
    expect(state.phase).toBe('error');
    expect(state.message).toContain('chưa sẵn sàng');
  });

  it.each([
    ['PENDING', 1],
    ['WARM', 2],
    ['EXPIRED', 5],
    ['REAPED', 6],
    ['FAILED', 7],
  ])('status %s ⇒ error (gateway bước h chỉ nhận CLAIMED/RUNNING)', (_label, status) => {
    const state = run([
      { type: 'START' },
      { type: 'CREATED', session: { id: 's1', podName: 'p', status, expiresAt: IN_AN_HOUR } },
    ]);
    expect(state.phase).toBe('error');
  });

  it('status RUNNING (4) cũng nối được, không chỉ CLAIMED', () => {
    const state = run([
      { type: 'START' },
      { type: 'CREATED', session: { id: 's1', podName: 'p', status: 4, expiresAt: IN_AN_HOUR } },
    ]);
    expect(state.phase).toBe('connecting');
  });
});

describe('expiring — đồng hồ phải đi theo, không chỉ cảnh báo', () => {
  it('hardCapReached=false vẫn CẬP NHẬT expiresAt và KHÔNG dựng cảnh báo', () => {
    // Đây là ca của chính lỗi mà 1.C-3 phát hiện: hiểu `expiring` là "chỉ báo
    // lúc chạm trần" làm đồng hồ FE chạy về 0 ở mọi phiên dài hơn ~55 phút.
    const later = '2026-08-11T13:05:00Z';
    const state = run([
      { type: 'START' },
      CREATED,
      READY,
      { type: 'CONTROL', message: { type: 'expiring', expiresAt: later, hardCapReached: false } },
    ]);
    expect(state.expiresAtMs).toBe(Date.parse(later));
    expect(state.hardCapReached).toBe(false);
    expect(state.phase).toBe('ready'); // không rời khỏi ready
  });

  it('hardCapReached=true dựng cờ cảnh báo nhưng KHÔNG kết thúc phiên', () => {
    // Chạm trần ≠ hết phiên. Kết thúc là việc của close 4409.
    const state = run([
      { type: 'START' },
      CREATED,
      READY,
      {
        type: 'CONTROL',
        message: { type: 'expiring', expiresAt: IN_AN_HOUR, hardCapReached: true },
      },
    ]);
    expect(state.hardCapReached).toBe(true);
    expect(state.phase).toBe('ready');
  });
});

describe('close code → thông điệp người dùng', () => {
  it('4409 nói "hết thời lượng tối đa", KHÔNG nói "bị thu hồi"', () => {
    const state = run([
      { type: 'START' },
      CREATED,
      READY,
      { type: 'CLOSED', code: CloseCode.HARD_CAP_REACHED, nowMs: NOW },
    ]);
    expect(state.phase).toBe('expired');
    expect(state.message).toContain('hết thời lượng tối đa');
    expect(state.message).not.toContain('thu hồi');
    expect(state.retryDelayMs).toBeNull();
  });

  it('4404 ⇒ expired, không retry', () => {
    const state = run([
      { type: 'START' },
      CREATED,
      READY,
      { type: 'CLOSED', code: CloseCode.SESSION_GONE, nowMs: NOW },
    ]);
    expect(state.phase).toBe('expired');
    expect(state.retryDelayMs).toBeNull();
  });

  it('exit + close 1000 giữ nguyên câu của `exit`, không bị close ghi đè', () => {
    const state = run([
      { type: 'START' },
      CREATED,
      READY,
      { type: 'CONTROL', message: { type: 'exit', exitCode: 0 } },
      { type: 'CLOSED', code: CloseCode.NORMAL, nowMs: NOW },
    ]);
    expect(state.phase).toBe('exited');
    expect(state.message).toContain('Shell đã thoát');
  });
});

describe('reconnect', () => {
  it('1006 sau khi đã ready ⇒ reconnecting với backoff 1s, KHÔNG hỏi lý do', () => {
    const state = run([
      { type: 'START' },
      CREATED,
      READY,
      { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: NOW },
    ]);
    expect(state.phase).toBe('reconnecting');
    expect(state.attempt).toBe(1);
    expect(state.retryDelayMs).toBe(1_000);
    expect(state.needsReasonLookup).toBe(false);
  });

  it('1006 khi CHƯA TỪNG ready ⇒ bật needsReasonLookup (contract §7)', () => {
    // Handshake hỏng (401/403/404/409/429) tới FE giống hệt "gateway chết", nên
    // một round-trip tRPC là cách DUY NHẤT biết lý do thật.
    const state = run([
      { type: 'START' },
      CREATED,
      { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: NOW },
    ]);
    expect(state.phase).toBe('reconnecting');
    expect(state.needsReasonLookup).toBe(true);
  });

  it('backoff leo 1→2→4s qua các lần rớt liên tiếp', () => {
    let state = run([{ type: 'START' }, CREATED, READY]);
    const delays: (number | null)[] = [];
    for (let i = 0; i < 3; i++) {
      state = reduce(state, { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: NOW });
      delays.push(state.retryDelayMs);
      state = reduce(state, { type: 'RETRY_NOW' });
    }
    expect(delays).toEqual([1_000, 2_000, 4_000]);
  });

  it('nối lại THÀNH CÔNG reset bộ đếm về 0', () => {
    // Thiếu reset thì một phiên rớt mạng 5 lần rải rác cả buổi sẽ chờ 15s cho
    // lần rớt thứ sáu, dù mỗi lần trước đó đều nối lại ngay được.
    let state = run([{ type: 'START' }, CREATED, READY]);
    state = reduce(state, { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: NOW });
    state = reduce(state, { type: 'RETRY_NOW' });
    state = reduce(state, READY);
    expect(state.attempt).toBe(0);

    state = reduce(state, { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: NOW });
    expect(state.retryDelayMs).toBe(1_000);
  });

  it('REASON_RESOLVED với gone=true dừng hẳn vòng nối lại', () => {
    const state = run([
      { type: 'START' },
      CREATED,
      { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: NOW },
      { type: 'REASON_RESOLVED', message: 'Phiên đã bị thu hồi.', gone: true },
    ]);
    expect(state.phase).toBe('expired');
    expect(state.retryDelayMs).toBeNull();
    expect(state.needsReasonLookup).toBe(false);
  });

  it('rớt sau khi session đã hết hạn ⇒ expired chứ không quay vòng', () => {
    const state = run([
      { type: 'START' },
      CREATED,
      READY,
      { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: Date.parse(IN_AN_HOUR) + 1 },
    ]);
    expect(state.phase).toBe('expired');
    expect(state.retryDelayMs).toBeNull();
  });
});

describe('START dọn sạch trạng thái cũ', () => {
  it('tạo phiên mới không kế thừa everReady/attempt của phiên trước', () => {
    // Kế thừa `everReady` làm mất luôn phép kiểm §7 cho phiên mới: 1006 đầu tiên
    // của phiên thứ hai sẽ không gọi `session.get` và người dùng mất lý do thật.
    const stale = run([
      { type: 'START' },
      CREATED,
      READY,
      { type: 'CLOSED', code: CloseCode.SESSION_GONE, nowMs: NOW },
    ]);
    const fresh = reduce(stale, { type: 'START' });
    expect(fresh).toEqual({ ...initialState, phase: 'creating' });
  });
});
