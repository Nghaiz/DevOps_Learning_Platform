import { Code, ConnectError, type UnaryRequest, type UnaryResponse } from '@connectrpc/connect';
import { SessionService } from '@devops-platform/shared-types';
import { describe, expect, it, vi } from 'vitest';

/**
 * D7.5 — `GetSession` hỏng ~5–10% với "Premature close" (kết nối h2 đứt giữa
 * chừng; plans/devops-learning-platform/phase-5.md §5.A). Thử lại ĐÚNG MỘT LẦN,
 * CHỈ cho RPC chỉ-đọc, CHỈ cho lớp lỗi đứt kết nối.
 *
 * Lý do phase-5 hoãn vá vẫn đúng và được giữ: retry trong `callOrchestrator` sẽ
 * bọc cả RPC không idempotent (CreateSession claim pod, ExtendSession, Reap). Nên
 * retry ở tầng TRANSPORT, theo danh sách method chỉ-đọc lấy từ descriptor.
 */

const captured: { interceptors?: unknown[] | undefined } = {};
vi.mock('@connectrpc/connect-node', () => ({
  createGrpcTransport: (opts: { interceptors?: unknown[] }) => {
    captured.interceptors = opts.interceptors;
    return {};
  },
}));
vi.mock('@connectrpc/connect', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, createClient: () => ({}) };
});

const { orchestratorClient, retryReadOnlyOnDisconnect } = await import('./orchestrator-client');

/** Đúng hình dạng connect-node dựng từ lỗi `stream.finished` của Node. */
function prematureClose(): ConnectError {
  const node = Object.assign(new Error('Premature close'), { code: 'ERR_STREAM_PREMATURE_CLOSE' });
  return ConnectError.from(node, Code.Internal);
}

function connReset(): ConnectError {
  const node = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET', syscall: 'read' });
  return ConnectError.from(node, Code.Aborted);
}

type Method = (typeof SessionService.method)[keyof typeof SessionService.method];

function unaryReq(method: Method): UnaryRequest {
  return { stream: false, method, service: SessionService } as unknown as UnaryRequest;
}

function nextFailing(...errors: ConnectError[]) {
  let calls = 0;
  const ok = { message: { ok: true } } as unknown as UnaryResponse;
  const next = vi.fn(() => {
    const err = errors[calls];
    calls++;
    return err === undefined ? Promise.resolve(ok) : Promise.reject(err);
  });
  return { next, ok };
}

const run = (method: Method, next: ReturnType<typeof nextFailing>['next']) =>
  (retryReadOnlyOnDisconnect(next as never) as (r: UnaryRequest) => Promise<UnaryResponse>)(unaryReq(method));

describe('retryReadOnlyOnDisconnect', () => {
  it('GetSession đứt kết nối một lần → thử lại và trả kết quả lượt hai', async () => {
    const { next, ok } = nextFailing(prematureClose());
    await expect(run(SessionService.method.getSession, next)).resolves.toBe(ok);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('ECONNRESET cùng lớp — cũng thử lại', async () => {
    const { next, ok } = nextFailing(connReset());
    await expect(run(SessionService.method.getCapacity, next)).resolves.toBe(ok);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('ĐÚNG MỘT lần: đứt hai lần liền thì ném lỗi lượt hai', async () => {
    const { next } = nextFailing(prematureClose(), prematureClose());
    await expect(run(SessionService.method.listSessions, next)).rejects.toThrow(/Premature close/);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['createSession', SessionService.method.createSession],
    ['claimSession', SessionService.method.claimSession],
    ['extendSession', SessionService.method.extendSession],
    ['reapSession', SessionService.method.reapSession],
  ])('%s KHÔNG BAO GIỜ được thử lại — không idempotent', async (_name, method) => {
    const { next } = nextFailing(prematureClose());
    await expect(run(method, next)).rejects.toThrow(/Premature close/);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('lỗi KHÔNG thuộc lớp đứt kết nối (NotFound, Unavailable) → không thử lại', async () => {
    for (const err of [new ConnectError('không có', Code.NotFound), new ConnectError('down', Code.Unavailable)]) {
      const { next } = nextFailing(err);
      await expect(run(SessionService.method.getSession, next)).rejects.toBe(err);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it('được NỐI vào transport thật của orchestratorClient(), không chỉ tồn tại', () => {
    orchestratorClient();
    expect(captured.interceptors).toContain(retryReadOnlyOnDisconnect);
  });
});
