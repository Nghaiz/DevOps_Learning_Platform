// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreatedSession } from '@devops-platform/terminal';
import { useSandboxSession, type SandboxSessionActions } from './use-sandbox-session';

/**
 * C1 — `reconnect()` mở lại WebSocket vào ĐÚNG pod đang có, không tạo pod mới.
 *
 * Trước `reconnect`, hai pha cụt đường là `exited` (người học gõ `exit`) và
 * `error` không-retry (vd. 1009/4403): máy trạng thái không tự nối lại, và đường
 * duy nhất còn lại là "Bắt đầu" — tức xin một pod mới, tốn thêm một khe quota,
 * trong khi pod cũ vẫn sống và tmux trong đó vẫn giữ nguyên công việc.
 *
 * Bằng chứng ở đây là `connectionKey`: `TerminalSurface` mở lại socket KHI VÀ
 * CHỈ KHI giá trị này đổi sang một số khác `null`. `actions.start` đếm số lần xin
 * pod — `reconnect` phải giữ nó ở 1.
 */

const PHIEN: CreatedSession = {
  id: 'sess-1',
  podName: 'sandbox-abc',
  status: 3, // SESSION_STATUS_CLAIMED
  expiresAt: '2099-01-01T00:00:00Z',
};

function makeActions(): SandboxSessionActions & { start: ReturnType<typeof vi.fn> } {
  return {
    start: vi.fn(async () => PHIEN),
    end: vi.fn(async () => undefined),
    extend: vi.fn(async () => ({ expiresAt: null, hardCapReached: false })),
    fetchStatus: vi.fn(async () => null) as unknown as SandboxSessionActions['fetchStatus'],
  };
}

async function startedHook() {
  const actions = makeActions();
  const hook = renderHook(() => useSandboxSession(actions));
  await act(async () => {
    hook.result.current.start();
  });
  expect(hook.result.current.state.phase).toBe('connecting');
  expect(hook.result.current.connectionKey).not.toBeNull();
  return { hook, actions };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSandboxSession.reconnect — C1', () => {
  it('`exited` ⇒ reconnect ⇒ `connecting` với connectionKey MỚI, không xin pod mới', async () => {
    const { hook, actions } = await startedHook();
    const firstKey = hook.result.current.connectionKey;

    act(() => {
      hook.result.current.onControl({ type: 'exit', exitCode: 0 });
    });
    expect(hook.result.current.state.phase).toBe('exited');
    expect(hook.result.current.connectionKey).toBeNull();

    act(() => {
      hook.result.current.reconnect();
    });
    expect(hook.result.current.state.phase).toBe('connecting');
    expect(hook.result.current.connectionKey).not.toBeNull();
    expect(hook.result.current.connectionKey).not.toBe(firstKey);
    // Câu "Shell đã thoát…" thuộc về pha cũ — để nó lại trong lúc đang nối là
    // nói sai trạng thái hiện tại.
    expect(hook.result.current.state.message).toBeNull();
    expect(actions.start).toHaveBeenCalledTimes(1);
  });

  it('`error` không-retry (4403) ⇒ reconnect mở lại kết nối', async () => {
    const { hook } = await startedHook();
    act(() => {
      hook.result.current.onClose(4403);
    });
    expect(hook.result.current.state.phase).toBe('error');
    expect(hook.result.current.connectionKey).toBeNull();

    act(() => {
      hook.result.current.reconnect();
    });
    expect(hook.result.current.state.phase).toBe('connecting');
    expect(hook.result.current.connectionKey).not.toBeNull();
  });

  it('ĐANG `ready` ⇒ reconnect vẫn đổi connectionKey (ép mở lại một kết nối treo)', async () => {
    const { hook } = await startedHook();
    act(() => {
      hook.result.current.onControl({
        type: 'ready',
        sessionId: PHIEN.id,
        podName: PHIEN.podName,
        expiresAt: '2099-01-01T00:00:00Z',
        hardCapAt: null,
        maxFrameBytes: 32768,
      });
    });
    expect(hook.result.current.state.phase).toBe('ready');
    const before = hook.result.current.connectionKey;
    act(() => {
      hook.result.current.reconnect();
    });
    expect(hook.result.current.connectionKey).not.toBe(before);
  });

  it('ĐỐI CHỨNG ÂM: `expired` (pod đã thu hồi) ⇒ reconnect KHÔNG làm gì', async () => {
    const { hook } = await startedHook();
    act(() => {
      hook.result.current.onClose(4404);
    });
    expect(hook.result.current.state.phase).toBe('expired');

    act(() => {
      hook.result.current.reconnect();
    });
    expect(hook.result.current.state.phase).toBe('expired');
    expect(hook.result.current.connectionKey).toBeNull();
  });

  it('ĐỐI CHỨNG ÂM: chưa có phiên (`idle`) ⇒ reconnect KHÔNG làm gì', () => {
    const actions = makeActions();
    const hook = renderHook(() => useSandboxSession(actions));
    act(() => {
      hook.result.current.reconnect();
    });
    expect(hook.result.current.state.phase).toBe('idle');
    expect(hook.result.current.connectionKey).toBeNull();
  });
});
