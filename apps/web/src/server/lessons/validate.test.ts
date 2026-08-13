import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { runVerifyScript } from './validate';

/**
 * `runVerifyScript` — biên BFF ⇄ terminal-gateway (P2 / 2.C).
 *
 * Mức test: UNIT với `fetch` bị stub. Cái đang được chứng minh KHÔNG phải "script
 * chạy được" (đó là việc của bằng chứng trên cụm) mà là **phép dịch**: byte gateway
 * trả về → kết quả người học nhìn thấy. Chính chỗ dịch đó là nơi một lỗi hạ tầng
 * dễ bị biến thành "bài làm sai" nhất, và đó là chế độ hỏng tệ nhất của một bộ
 * chấm — nó bắt người ta đi sửa một bài vốn đã đúng.
 *
 * `mintSandboxTokenFor` bị mock để không cần Postgres (nó ký bằng khoá trong bảng
 * `jwks`). Nội dung token là việc của `security/sandbox-token-cookie.test.ts`.
 */

vi.mock('../auth/jwt', () => ({
  mintSandboxTokenFor: () => Promise.resolve('token-gia'),
}));

const REQ = {
  sessionId: 'sess-abc',
  userId: 'user-1',
  expiresAtSeconds: Math.floor(Date.now() / 1000) + 3600,
  script: 'stat /var/run/netns/loxilb',
};

function stubFetch(status: number, body: unknown) {
  const spy = vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function codeOf(error: unknown): string {
  return error instanceof TRPCError ? error.code : 'NOT_A_TRPC_ERROR';
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runVerifyScript — dịch exit code', () => {
  it('exit 0 → passed (contract Killercoda, không có ngưỡng nào khác)', async () => {
    stubFetch(200, { exitCode: 0, output: 'ok\n', truncated: false });
    await expect(runVerifyScript(REQ)).resolves.toEqual({
      passed: true,
      exitCode: 0,
      output: 'ok\n',
      truncated: false,
    });
  });

  it('exit khác 0 → KHÔNG passed, và KHÔNG ném', async () => {
    stubFetch(200, { exitCode: 1, output: 'chua tao\n', truncated: false });
    const out = await runVerifyScript(REQ);
    expect(out.passed).toBe(false);
    expect(out.exitCode).toBe(1);
  });

  it('cờ truncated đi qua nguyên vẹn', async () => {
    stubFetch(200, { exitCode: 0, output: 'abc', truncated: true });
    await expect(runVerifyScript(REQ)).resolves.toMatchObject({ truncated: true });
  });
});

describe('runVerifyScript — gọi gateway đúng cách', () => {
  it('gửi script trong body và token qua header Cookie, KHÔNG qua URL (luật 8)', async () => {
    const spy = stubFetch(200, { exitCode: 0, output: '', truncated: false });
    await runVerifyScript(REQ);

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];

    expect(url).toContain('/exec/session/sess-abc');
    // Token trong URL sẽ nằm lại trong access log của mọi proxy trên đường đi.
    expect(url).not.toContain('token-gia');

    const headers = init.headers as Record<string, string>;
    expect(headers['cookie']).toBe('dlp_sandbox=token-gia');
    expect(JSON.parse(String(init.body))).toEqual({ script: REQ.script });
  });
});

describe('runVerifyScript — lỗi KHÔNG được thành "fail"', () => {
  it('session đã kết thúc → NOT_FOUND, không phải passed:false', async () => {
    stubFetch(404, { code: 'SESSION_NOT_FOUND', message: 'phiên không còn tồn tại' });
    await expect(runVerifyScript(REQ)).rejects.toSatisfy(
      (e: unknown) => codeOf(e) === 'NOT_FOUND',
    );
  });

  it('session chưa sẵn sàng → CONFLICT', async () => {
    stubFetch(409, { code: 'SESSION_NOT_ACTIVE', message: 'chưa chạy được' });
    await expect(runVerifyScript(REQ)).rejects.toSatisfy(
      (e: unknown) => codeOf(e) === 'CONFLICT',
    );
  });

  it('gateway 502 (pod/apiserver hỏng, hoặc script quá hạn) → lỗi server, không phải fail', async () => {
    stubFetch(502, { code: 'EXEC_FAILED', message: 'không chạy được' });
    await expect(runVerifyScript(REQ)).rejects.toSatisfy(
      (e: unknown) => codeOf(e) === 'INTERNAL_SERVER_ERROR',
    );
  });

  it('gateway trả 403 → INTERNAL, KHÔNG phải FORBIDDEN', async () => {
    // BFF vừa tự mint token cho chính chủ session, nên 403 ở đây là lệch cấu
    // hình (JWKS/iss/đồng hồ), không phải "người dùng thiếu quyền". Trả FORBIDDEN
    // ra FE sẽ gửi người ta đi đăng nhập lại cho một sự cố họ không sửa được.
    stubFetch(403, { code: 'FORBIDDEN', message: 'token không cấp cho session này' });
    await expect(runVerifyScript(REQ)).rejects.toSatisfy(
      (e: unknown) => codeOf(e) === 'INTERNAL_SERVER_ERROR',
    );
  });

  it('200 nhưng sai shape → ném, KHÔNG đoán exitCode', async () => {
    // `exitCode ?? 1` sẽ báo "bài sai" cho một lỗi của chính chúng ta.
    stubFetch(200, { exit_code: 0, stdout: 'ok' });
    await expect(runVerifyScript(REQ)).rejects.toSatisfy(
      (e: unknown) => codeOf(e) === 'INTERNAL_SERVER_ERROR',
    );
  });

  it('mạng hỏng → ném, và message KHÔNG rò URL nội bộ của gateway', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('connect ECONNREFUSED 10.42.0.7:8082'))),
    );
    const error = await runVerifyScript(REQ).catch((e: unknown) => e);
    expect(codeOf(error)).toBe('INTERNAL_SERVER_ERROR');
    expect((error as TRPCError).message).not.toContain('10.42.0.7');
  });
});
