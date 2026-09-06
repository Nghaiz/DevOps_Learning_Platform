import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applySessionPreferences, type SessionForPreferences } from './preferences';
import type { ScriptOutcome, ScriptRequest } from '../lessons/validate';
import type { PreferencesView } from '../me/preferences';

/**
 * `applySessionPreferences` (D7, phase-13) — unit test THUẦN, mock cả hai phụ
 * thuộc I/O (`readUserPreferences`, `runScriptInSession`) để cô lập đúng logic
 * quyết định "có gọi runner hay không" và "script chứa gì".
 *
 * ⚠ ĐÃ ĐỌC IMPLEMENTATION TRƯỚC KHI VIẾT: chú thích đầu file `preferences.ts`
 * nói rõ pod THẬT chạy zsh mặc định (không phải bash), nên hàm ghi lại CẢ BA
 * giá trị enum — kể cả `bash` — để loại bỏ giả định "shell nào là mặc định của
 * pod" khỏi tầng BFF. Vì vậy khẳng định đúng ở đây là "runner được gọi cho cả
 * ba shell, luôn với ĐÚNG một đường dẫn cố định từ `SHELL_PATHS`", KHÔNG PHẢI
 * "bash bỏ qua runner" như một bản đọc hời hợt câu chữ hợp đồng D7 có thể ngộ
 * nhận (task brief của phase này cũng lưu ý điều này tường minh).
 */

const { runScriptSpy, readPrefsSpy } = vi.hoisted(() => ({
  runScriptSpy: vi.fn(
    (_req: ScriptRequest): Promise<ScriptOutcome> =>
      Promise.resolve({ passed: true, exitCode: 0, output: '', truncated: false }),
  ),
  readPrefsSpy: vi.fn(
    (_db: unknown, _userId: string): Promise<PreferencesView> =>
      Promise.resolve({ defaultShell: 'bash', terminalTheme: null, leaderboardNamePublic: false }),
  ),
}));

vi.mock('../lessons/validate', () => ({
  runScriptInSession: runScriptSpy,
}));
vi.mock('../me/preferences', () => ({
  readUserPreferences: readPrefsSpy,
}));

function fixtureSession(overrides: Partial<SessionForPreferences> = {}) {
  return {
    id: 'sess-fixture',
    podName: 'pod-fixture',
    expiresAt: { seconds: BigInt(Math.floor(Date.now() / 1000) + 3600) },
    ...overrides,
  };
}

function fakeLogger() {
  return { warn: vi.fn() };
}

function lastRunScriptRequest(): ScriptRequest {
  const req = runScriptSpy.mock.calls.at(-1)?.[0];
  if (req === undefined) {
    throw new Error('runScriptInSession chưa được gọi lần nào — assertion phía trên đã sai');
  }
  return req;
}

const ctx = { db: {} as never, user: { id: 'user-fixture', role: 'user' } };

beforeEach(() => {
  runScriptSpy.mockReset();
  readPrefsSpy.mockReset();
  runScriptSpy.mockResolvedValue({ passed: true, exitCode: 0, output: '', truncated: false });
});

describe('applySessionPreferences — ba shell, một đường dẫn cố định mỗi lượt', () => {
  it.each([
    ['bash', '/bin/bash'],
    ['zsh', '/usr/bin/zsh'],
    ['pwsh', '/usr/bin/pwsh'],
  ] as const)('defaultShell=%s → gọi runner MỘT LẦN với script chứa %s', async (shell, path) => {
    readPrefsSpy.mockResolvedValue({ defaultShell: shell, terminalTheme: null, leaderboardNamePublic: false });

    const out = await applySessionPreferences(ctx, fixtureSession(), fakeLogger());

    expect(out).toEqual({ preferencesApplied: true });
    expect(runScriptSpy).toHaveBeenCalledTimes(1);
    const req = lastRunScriptRequest();
    expect(req).toMatchObject({ sessionId: 'sess-fixture', userId: 'user-fixture' });
    expect(req.script).toContain(`set-option -g default-shell ${path}`);
    // Không có đường nào khác lọt vào script — KHÔNG chứa path của hai shell kia.
    for (const [, otherPath] of [
      ['bash', '/bin/bash'],
      ['zsh', '/usr/bin/zsh'],
      ['pwsh', '/usr/bin/pwsh'],
    ] as const) {
      if (otherPath !== path) {
        expect(req.script).not.toContain(otherPath);
      }
    }
  });

  it('script KHÔNG chứa gì ngoài đường dẫn tra bảng — không có input người dùng nào được nội suy vào', async () => {
    readPrefsSpy.mockResolvedValue({ defaultShell: 'zsh', terminalTheme: null, leaderboardNamePublic: false });
    await applySessionPreferences(
      { db: {} as never, user: { id: '"; rm -rf / #', role: 'user' } },
      fixtureSession(),
      fakeLogger(),
    );
    const req = lastRunScriptRequest();
    // userId chỉ đi vào ScriptRequest.userId (dùng để mint token, KHÔNG nội suy
    // vào script) — script vẫn chỉ chứa đường dẫn cố định.
    expect(req.script).not.toContain('rm -rf');
    expect(req.script).toContain('/usr/bin/zsh');
  });
});

describe('applySessionPreferences — pod chưa được cấp (cold path)', () => {
  it('podName rỗng → KHÔNG gọi runner, preferencesApplied:false, có log warn', async () => {
    readPrefsSpy.mockResolvedValue({ defaultShell: 'zsh', terminalTheme: null, leaderboardNamePublic: false });
    const logger = fakeLogger();

    const out = await applySessionPreferences(ctx, fixtureSession({ podName: '' }), logger);

    expect(out).toEqual({ preferencesApplied: false });
    expect(runScriptSpy).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('podName vắng mặt (undefined) → cùng hành vi', async () => {
    readPrefsSpy.mockResolvedValue({ defaultShell: 'zsh', terminalTheme: null, leaderboardNamePublic: false });
    const out = await applySessionPreferences(
      ctx,
      { id: 'sess-fixture', expiresAt: fixtureSession().expiresAt },
      fakeLogger(),
    );
    expect(out).toEqual({ preferencesApplied: false });
    expect(runScriptSpy).not.toHaveBeenCalled();
  });

  it('session vắng mặt hoàn toàn (undefined) → cùng hành vi, không ném', async () => {
    readPrefsSpy.mockResolvedValue({ defaultShell: 'zsh', terminalTheme: null, leaderboardNamePublic: false });
    const out = await applySessionPreferences(ctx, undefined, fakeLogger());
    expect(out).toEqual({ preferencesApplied: false });
    expect(runScriptSpy).not.toHaveBeenCalled();
  });

  it('thiếu expiresAt → KHÔNG gọi runner, preferencesApplied:false', async () => {
    readPrefsSpy.mockResolvedValue({ defaultShell: 'zsh', terminalTheme: null, leaderboardNamePublic: false });
    const out = await applySessionPreferences(
      ctx,
      { id: 'sess-fixture', podName: 'pod-fixture', expiresAt: undefined },
      fakeLogger(),
    );
    expect(out).toEqual({ preferencesApplied: false });
    expect(runScriptSpy).not.toHaveBeenCalled();
  });
});

describe('applySessionPreferences — runner thất bại', () => {
  it('script áp shell thất bại (passed:false) → preferencesApplied:false, KHÔNG NÉM, có log kèm exitCode', async () => {
    readPrefsSpy.mockResolvedValue({ defaultShell: 'zsh', terminalTheme: null, leaderboardNamePublic: false });
    runScriptSpy.mockResolvedValue({ passed: false, exitCode: 17, output: 'no such file', truncated: false });
    const logger = fakeLogger();

    const out = await applySessionPreferences(ctx, fixtureSession(), logger);

    expect(out).toEqual({ preferencesApplied: false });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [, detail] = logger.warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(detail).toMatchObject({ sessionId: 'sess-fixture', exitCode: 17 });
  });
});
