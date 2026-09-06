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

describe('EXTENDED — server đã gia hạn', () => {
  it('đẩy expiresAtMs theo giá trị SERVER trả, không đổi phase', () => {
    const ready = run([{ type: 'START' }, CREATED, READY]);
    expect(ready.phase).toBe('ready');

    const later = new Date(Date.parse(IN_AN_HOUR) + 30 * 60_000).toISOString();
    const extended = reduce(ready, {
      type: 'EXTENDED',
      expiresAt: later,
      hardCapReached: false,
    });
    expect(extended.expiresAtMs).toBe(Date.parse(later));
    expect(extended.phase).toBe('ready');
    expect(extended.hardCapReached).toBe(false);
  });

  it('KHÔNG đá một phiên đang reconnecting về ready', () => {
    // Gia hạn chỉ đẩy đồng hồ. Đổi phase ở đây sẽ nói "đã kết nối" trong khi WS
    // vẫn đứt — đúng loại nhãn khẳng định nhiều hơn thứ ta biết.
    const reconnecting = run([
      { type: 'START' },
      CREATED,
      READY,
      { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: Date.parse(IN_AN_HOUR) - 30 * 60_000 },
    ]);
    expect(reconnecting.phase).toBe('reconnecting');

    const extended = reduce(reconnecting, {
      type: 'EXTENDED',
      expiresAt: IN_AN_HOUR,
      hardCapReached: false,
    });
    expect(extended.phase).toBe('reconnecting');
    expect(extended.retryDelayMs).toBe(reconnecting.retryDelayMs);
  });

  it('expiresAt null giữ nguyên đồng hồ cũ thay vì xoá nó', () => {
    const ready = run([{ type: 'START' }, CREATED, READY]);
    const extended = reduce(ready, { type: 'EXTENDED', expiresAt: null, hardCapReached: true });
    expect(extended.expiresAtMs).toBe(ready.expiresAtMs);
    expect(extended.hardCapReached).toBe(true);
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

/**
 * F3 — MỘT close frame không được lật ngược phán quyết server đã nói ra.
 *
 * Chế độ hỏng đo được (2026-09-06): gateway gửi `error`/`SESSION_GONE` rồi kết
 * nối đứt trước khi close frame kịp tới, nên trình duyệt tự phát `1006`. Máy
 * trạng thái nhận `1006`, thấy nó "retry được", và ghi đè cả pha lẫn câu lý do:
 *
 *   after ctrl error : error        | "Pod của phiên đã biến mất."
 *   after close 1006 : reconnecting | retryDelayMs=1000 | message=null
 *
 * Người dùng thấy "Đang nối lại…" quay vòng tới trần 15s cho một pod đã biến
 * mất. Hai chốt chặn cũ (`idle`, và `exited` + đúng mã `1000`) là CÙNG một mẫu
 * hình bắt được hai lần và bỏ sót ở phần còn lại của họ — nên bộ này gác CẢ HỌ
 * "phiên đã kết thúc", không phải thêm một `case`.
 */
describe('F3 — close frame không lật ngược phán quyết của server', () => {
  function ctrlError(code: string, message: string) {
    return { type: 'CONTROL' as const, message: { type: 'error' as const, code, message } };
  }

  const GONE = ctrlError('SESSION_GONE', 'Pod của phiên đã biến mất.');
  const LIVE = [{ type: 'START' as const }, CREATED, READY];

  describe('mã `error` của server phân loại "phiên đã hết" ↔ "kết nối này hỏng"', () => {
    // Gateway chỉ phát ĐÚNG bốn mã (bridge.go): SESSION_GONE + HARD_CAP_REACHED
    // là phiên đã hết; EXEC_FAILED + RATE_LIMITED là sự cố của kết nối này.
    // Gộp cả bốn vào `error` làm mất đúng thứ chốt chặn dưới cần để quyết định.
    it.each([
      ['SESSION_GONE', 'expired'],
      ['HARD_CAP_REACHED', 'expired'],
      ['SESSION_EXPIRED', 'expired'],
      ['EXEC_FAILED', 'error'],
      ['RATE_LIMITED', 'error'],
    ])('%s ⇒ pha %s', (code, phase) => {
      const state = run([...LIVE, ctrlError(code, 'câu của server')]);
      expect(state.phase).toBe(phase);
      expect(state.message).toBe('câu của server');
    });
  });

  it('ctrl error SESSION_GONE rồi 1006 ⇒ GIỮ phán quyết, không quay vòng nối lại', () => {
    const settled = run([...LIVE, GONE]);
    expect(settled.phase).toBe('expired');

    const after = reduce(settled, { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: NOW });
    expect(after.phase).toBe('expired');
    expect(after.message).toBe('Pod của phiên đã biến mất.');
    expect(after.retryDelayMs).toBeNull();
    // Không cần round-trip nào: lý do THẬT đã nằm sẵn trong state.
    expect(after.needsReasonLookup).toBe(false);
  });

  it('`exited` giữ nguyên với MỌI mã đóng, không chỉ 1000', () => {
    // Chốt cũ chỉ bắt `code === 1000`. Một `exit` mà close frame thất lạc (⇒
    // 1006) rơi thẳng vào nhánh retry và xoá mất câu "Shell đã thoát".
    const exited = run([...LIVE, { type: 'CONTROL', message: { type: 'exit', exitCode: 0 } }]);
    expect(exited.phase).toBe('exited');

    const after = reduce(exited, { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: NOW });
    expect(after.phase).toBe('exited');
    expect(after.message).toContain('Shell đã thoát');
    expect(after.retryDelayMs).toBeNull();
  });

  it('REASON_RESOLVED gone=true rồi 1006 ⇒ vẫn expired', () => {
    // Cùng một họ: `session.get` vừa nói phiên đã chết, một 1006 đến sau sẽ
    // khởi động lại đúng vòng lặp mà lượt hỏi đó tồn tại để dừng.
    const resolved = run([
      { type: 'START' },
      CREATED,
      { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: NOW },
      { type: 'REASON_RESOLVED', message: 'Phiên đã bị thu hồi.', gone: true },
      { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: NOW },
    ]);
    expect(resolved.phase).toBe('expired');
    expect(resolved.message).toBe('Phiên đã bị thu hồi.');
    expect(resolved.retryDelayMs).toBeNull();
  });

  it.each([
    ['idle (sau ENDED)', [...LIVE, { type: 'ENDED' as const }], 'idle'],
    ['exited', [...LIVE, { type: 'CONTROL' as const, message: { type: 'exit' as const, exitCode: 0 } }], 'exited'],
    ['expired (ctrl error)', [...LIVE, GONE], 'expired'],
    ['expired (close 4404)', [...LIVE, { type: 'CLOSED' as const, code: CloseCode.SESSION_GONE, nowMs: NOW }], 'expired'],
  ])('cả họ: %s + MỌI mã đóng vẫn đứng yên', (_label, events, phase) => {
    const settled = run(events);
    expect(settled.phase).toBe(phase);

    for (const code of [
      CLOSE_ABNORMAL,
      CloseCode.NORMAL,
      CloseCode.SERVICE_RESTART,
      CloseCode.INTERNAL,
      CloseCode.SESSION_GONE,
      CloseCode.HARD_CAP_REACHED,
    ]) {
      const after = reduce(settled, { type: 'CLOSED', code, nowMs: NOW });
      expect(after).toEqual(settled);
    }
  });

  it('ĐỐI CHỨNG DƯƠNG: `error` của EXEC_FAILED + close 4500 VẪN nối lại', () => {
    // Chốt chặn cố ý KHÔNG gác `error`. Gateway phát EXEC_FAILED kèm đúng mã
    // `4500` — nằm trong bảng RETRYABLE của contract §6 — tức nó đang nói
    // "thử lại đi". Gác cả `error` sẽ khoá người dùng ở một sự cố hạ tầng
    // thoáng qua mà chính server bảo là nối lại được.
    const faulted = run([...LIVE, ctrlError('EXEC_FAILED', 'phiên tới pod bị gián đoạn')]);
    expect(faulted.phase).toBe('error');

    const after = reduce(faulted, { type: 'CLOSED', code: CloseCode.INTERNAL, nowMs: NOW });
    expect(after.phase).toBe('reconnecting');
    expect(after.retryDelayMs).toBe(1_000);
  });

  it('ĐỐI CHỨNG DƯƠNG: phiên đang sống + 1006 vẫn nối lại như cũ', () => {
    const after = run([...LIVE, { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: NOW }]);
    expect(after.phase).toBe('reconnecting');
  });

  it('phanh thứ hai: 1006 lặp lại sau khi đã ready thì ĐI HỎI lý do thật', () => {
    // `everReady` một mình không đủ làm phanh: tiền đề "sau ready thì mọi 1006
    // đều kèm mã lỗi thật" chỉ đúng khi close frame TỚI NƠI. Gateway bị giết
    // giữa chừng thì không có frame nào cả, và không có chốt này máy trạng thái
    // quay vòng tới tận `expiresAt` (có thể ~50 phút) mà không hỏi ai câu nào.
    let state = run([...LIVE, { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: NOW }]);
    expect(state.attempt).toBe(1);
    expect(state.needsReasonLookup).toBe(false); // lần rớt đầu = rớt mạng, không tốn round-trip

    state = reduce(state, { type: 'RETRY_NOW' });
    state = reduce(state, { type: 'CLOSED', code: CLOSE_ABNORMAL, nowMs: NOW });
    expect(state.attempt).toBe(2);
    expect(state.needsReasonLookup).toBe(true);
  });
});
