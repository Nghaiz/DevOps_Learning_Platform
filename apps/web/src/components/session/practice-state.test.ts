import { describe, expect, it } from 'vitest';
import type { SessionPhase } from '@devops-platform/terminal';
import { checkBlockedReason, execBlockedReason } from './practice-gates';
import { CLOSE_RATE_LIMITED, resolveTerminalOverlay } from './terminal-overlay';
import { pageStateAfter, parseHandoffMessage, terminalWindowUrl } from './terminal-handoff';
import { STACK_BELOW_PX, UNSTACK_FROM_PX, nextWideEnough } from './workspace-split';

const ALL_PHASES: readonly SessionPhase[] = [
  'idle',
  'creating',
  'connecting',
  'ready',
  'reconnecting',
  'exited',
  'expired',
  'error',
];

describe('M6: nút Kiểm tra chỉ mở ở pha ready, và luôn kèm lý do khi khoá', () => {
  const here = { hasSession: true, handoff: 'here' as const };

  it('ready + có phiên ⇒ mở (null)', () => {
    expect(checkBlockedReason({ ...here, phase: 'ready' })).toBeNull();
  });

  it('MỌI pha khác ⇒ khoá, và lý do là một câu không rỗng', () => {
    for (const phase of ALL_PHASES.filter((p) => p !== 'ready')) {
      const reason = checkBlockedReason({ ...here, phase });
      expect(reason, phase).not.toBeNull();
      expect((reason ?? '').length, phase).toBeGreaterThan(0);
    }
  });

  it('chưa có phiên ⇒ khoá, kể cả khi pha lỡ là ready', () => {
    expect(checkBlockedReason({ ...here, phase: 'ready', hasSession: false })).not.toBeNull();
  });

  it('hết hạn và đang chờ nói HAI câu khác nhau', () => {
    expect(checkBlockedReason({ ...here, phase: 'expired' })).not.toBe(
      checkBlockedReason({ ...here, phase: 'connecting' }),
    );
  });
});

describe('nút Kiểm tra khi terminal đã giao sang cửa sổ riêng', () => {
  /*
    Trang thả kết nối lúc giao, nên `phase` của trang đứng yên ở pha lúc giao.
    Bấm giao lúc còn `connecting` là trang không bao giờ tới `ready`: bản trước
    khoá nút Kiểm tra mãi với "chờ terminal nối" trong khi cửa sổ kia chạy được.
  */
  it('giao đi lúc còn connecting / reconnecting ⇒ mở', () => {
    for (const handoff of ['elsewhere', 'reclaiming'] as const) {
      expect(checkBlockedReason({ phase: 'connecting', hasSession: true, handoff }), handoff).toBeNull();
      expect(checkBlockedReason({ phase: 'reconnecting', hasSession: true, handoff }), handoff).toBeNull();
      expect(checkBlockedReason({ phase: 'ready', hasSession: true, handoff }), handoff).toBeNull();
    }
  });

  it('ĐỐI CHỨNG: cùng pha connecting mà terminal còn ở trang ⇒ vẫn khoá', () => {
    expect(checkBlockedReason({ phase: 'connecting', hasSession: true, handoff: 'here' })).not.toBeNull();
  });

  it('expired vẫn khoá dù đã giao đi: máy chủ đã nói pod không còn', () => {
    expect(checkBlockedReason({ phase: 'expired', hasSession: true, handoff: 'elsewhere' })).toBe(
      checkBlockedReason({ phase: 'expired', hasSession: true, handoff: 'here' }),
    );
  });

  it('chưa có phiên vẫn khoá dù đã giao đi', () => {
    expect(checkBlockedReason({ phase: 'connecting', hasSession: false, handoff: 'elsewhere' })).not.toBeNull();
  });
});

describe('nút chạy lệnh cần pha ready, terminal gắn ở TRANG này, và chưa giao ra cửa sổ riêng', () => {
  const ok = { phase: 'ready' as const, hasSession: true, terminalAttached: true, handoff: 'here' as const };

  it('đủ ba điều ⇒ mở', () => {
    expect(execBlockedReason(ok)).toBeNull();
  });

  it('terminal đang ở cửa sổ riêng ⇒ khoá dù pha vẫn là ready', () => {
    expect(execBlockedReason({ ...ok, handoff: 'elsewhere' })).not.toBeNull();
    expect(execBlockedReason({ ...ok, handoff: 'reclaiming' })).not.toBeNull();
  });

  it('pha ready nhưng chưa có handle ⇒ khoá', () => {
    expect(execBlockedReason({ ...ok, terminalAttached: false })).not.toBeNull();
  });
});

describe('H2: lớp phủ theo pha, đúng MỘT việc làm được', () => {
  const base = { message: null, handoff: 'here' as const, canReconnect: true };

  it('ready và idle ⇒ không phủ', () => {
    expect(resolveTerminalOverlay({ ...base, phase: 'ready' })).toBeNull();
    expect(resolveTerminalOverlay({ ...base, phase: 'idle' })).toBeNull();
  });

  it('exited / error ⇒ Nối lại; expired ⇒ Mở phiên mới (pod đã bị thu hồi)', () => {
    expect(resolveTerminalOverlay({ ...base, phase: 'exited' })?.action).toBe('reconnect');
    expect(resolveTerminalOverlay({ ...base, phase: 'error' })?.action).toBe('reconnect');
    expect(resolveTerminalOverlay({ ...base, phase: 'expired' })?.action).toBe('new-session');
  });

  it('không có pod để nối (lỗi tạo phiên) ⇒ Mở phiên mới, KHÔNG phải một nút Nối lại chết', () => {
    const noPod = { ...base, canReconnect: false };
    expect(resolveTerminalOverlay({ ...noPod, phase: 'error' })?.action).toBe('new-session');
    expect(resolveTerminalOverlay({ ...noPod, phase: 'exited' })?.action).toBe('new-session');
    expect(resolveTerminalOverlay({ ...noPod, phase: 'reconnecting' })?.action).toBeNull();
  });

  it('đang tạo / đang nối ⇒ phủ chờ, không có nút', () => {
    expect(resolveTerminalOverlay({ ...base, phase: 'creating' })?.action).toBeNull();
    expect(resolveTerminalOverlay({ ...base, phase: 'connecting' })?.tone).toBe('wait');
  });

  it('terminal ở cửa sổ riêng THẮNG mọi pha, kể cả ready', () => {
    const overlay = resolveTerminalOverlay({ ...base, phase: 'ready', handoff: 'elsewhere' });
    expect(overlay?.tone).toBe('elsewhere');
    expect(overlay?.action).toBe('reclaim');
  });

  it('mã đóng 4429 đổi câu lý do sang ca dán quá lớn', () => {
    const generic = resolveTerminalOverlay({ ...base, phase: 'error', message: 'Vượt giới hạn tốc độ.' });
    const rate = resolveTerminalOverlay({
      ...base,
      phase: 'error',
      message: 'Vượt giới hạn tốc độ.',
      closeCode: CLOSE_RATE_LIMITED,
    });
    expect(generic?.detail).toBe('Vượt giới hạn tốc độ.');
    expect(rate?.detail).not.toBe(generic?.detail);
  });
});

describe('H3: bàn giao với cửa sổ riêng', () => {
  it('cửa sổ claim ⇒ trang nhường; cửa sổ release ⇒ trang lấy lại', () => {
    expect(pageStateAfter('here', { v: 1, type: 'claim', from: 'window' })).toBe('elsewhere');
    expect(pageStateAfter('elsewhere', { v: 1, type: 'release', from: 'window' })).toBe('here');
    expect(pageStateAfter('reclaiming', { v: 1, type: 'release', from: 'window' })).toBe('here');
  });

  it('tin từ một TRANG khác bị bỏ qua', () => {
    expect(pageStateAfter('here', { v: 1, type: 'claim', from: 'page' })).toBe('here');
  });

  it('tin lạ hoặc sai phiên bản bị từ chối, không làm hỏng trạng thái', () => {
    expect(parseHandoffMessage(null)).toBeNull();
    expect(parseHandoffMessage({ v: 2, type: 'claim', from: 'window' })).toBeNull();
    expect(parseHandoffMessage({ v: 1, type: 'steal', from: 'window' })).toBeNull();
    expect(parseHandoffMessage({ v: 1, type: 'claim', from: 'window' })).toEqual({ v: 1, type: 'claim', from: 'window' });
  });

  it('URL cửa sổ mã hoá id phiên', () => {
    expect(terminalWindowUrl('a/b')).toBe('/session/a%2Fb/terminal');
  });
});

describe('H4: xếp chồng theo bề rộng khung chứa, có độ trễ', () => {
  it('chưa đo ⇒ theo ngưỡng dưới', () => {
    expect(nextWideEnough(null, STACK_BELOW_PX)).toBe(true);
    expect(nextWideEnough(null, STACK_BELOW_PX - 1)).toBe(false);
  });

  it('đã xếp chồng thì phải rộng tới ngưỡng trên mới chia đôi lại', () => {
    expect(nextWideEnough(false, STACK_BELOW_PX + 10)).toBe(false);
    expect(nextWideEnough(false, UNSTACK_FROM_PX)).toBe(true);
  });

  it('đang chia đôi thì giữ nguyên trong khoảng trễ', () => {
    expect(nextWideEnough(true, STACK_BELOW_PX + 10)).toBe(true);
    expect(nextWideEnough(true, STACK_BELOW_PX - 1)).toBe(false);
  });
});
