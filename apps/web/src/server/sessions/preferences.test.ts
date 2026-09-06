import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/**
 * Idempotency — CHẠY THẬT script sinh ra, không đọc chuỗi rồi tin.
 *
 * ⛔ Vì sao phải chạy: tính idempotent KHÔNG nằm trong TypeScript, nó nằm trong
 * NỘI DUNG script (`grep -qxF` thoát sớm + `sed -i` xoá dòng cũ trước khi ghi).
 * Một assertion kiểu `expect(script).toContain('grep -qxF')` chỉ chứng minh
 * chuỗi có mặt — nó xanh y hệt khi mẫu `sed` sai một ký tự và file phình thêm
 * một dòng mỗi lần mở bài.
 *
 * `bash` chứ không `sh`: gateway chạy script bằng `GATEWAY_EXEC_SHELL` (mặc
 * định `bash`, và Helm `gateway.env.execShell: 'bash'`), truyền qua **stdin**
 * (`podexec/oneshot.go` đặt `Stdin: true`, `Command: shell`) — script KHÔNG bao
 * giờ nằm trên argv. `set -euo pipefail` ở đầu script hợp lệ ĐÚNG VÌ vậy; chạy
 * nó bằng `sh`/dash sẽ chết ngay dòng đầu.
 */
describe('script áp shell — idempotent khi CHẠY THẬT bằng bash', () => {
  let home = '';

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'dlp-prefs-'));
    // Trạng thái BAN ĐẦU thật của pod: dòng skel `set -g default-shell
    // /usr/bin/zsh` (images/sandbox-base/skel/.tmux.conf), KHÔNG phải file rỗng.
    writeFileSync(join(home, '.tmux.conf'), 'set -g status off\nset -g default-shell /usr/bin/zsh\n');
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  function runScript(script: string): void {
    const result = spawnSync('bash', ['-s'], { input: script, env: { ...process.env, HOME: home }, encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(`script thoát ${String(result.status)}: ${result.stderr}`);
    }
  }

  function confLines(): string[] {
    return readFileSync(join(home, '.tmux.conf'), 'utf8').split('\n').filter((line) => line !== '');
  }

  async function scriptFor(shell: 'bash' | 'zsh' | 'pwsh'): Promise<string> {
    readPrefsSpy.mockResolvedValue({ defaultShell: shell, terminalTheme: null, leaderboardNamePublic: false });
    await applySessionPreferences(ctx, fixtureSession(), fakeLogger());
    return lastRunScriptRequest().script;
  }

  it('chạy HAI LẦN cùng giá trị ⇒ ĐÚNG MỘT dòng set-option (không nối thêm)', async () => {
    const script = await scriptFor('pwsh');
    runScript(script);
    const afterFirst = confLines();
    runScript(script);
    const afterSecond = confLines();

    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond.filter((line) => line.startsWith('set-option -g default-shell'))).toEqual([
      'set-option -g default-shell /usr/bin/pwsh',
    ]);
  });

  it('ĐỔI giá trị ⇒ dòng cũ bị XOÁ, không tích luỹ theo số lần mở bài', async () => {
    runScript(await scriptFor('pwsh'));
    runScript(await scriptFor('bash'));
    runScript(await scriptFor('zsh'));

    expect(confLines().filter((line) => line.startsWith('set-option -g default-shell'))).toEqual([
      'set-option -g default-shell /usr/bin/zsh',
    ]);
  });

  it('dòng skel gốc và các dòng khác KHÔNG bị đụng tới', async () => {
    runScript(await scriptFor('bash'));
    const lines = confLines();
    expect(lines).toContain('set -g status off');
    // Dòng skel `set -g default-shell` vẫn còn — script ghi ĐÈ bằng cách nối
    // SAU nó (tmux áp dòng cuối), không sửa file gốc của image.
    expect(lines).toContain('set -g default-shell /usr/bin/zsh');
    // …và dòng của ta phải nằm SAU dòng skel, nếu không tmux sẽ dùng skel.
    expect(lines.indexOf('set-option -g default-shell /bin/bash')).toBeGreaterThan(
      lines.indexOf('set -g default-shell /usr/bin/zsh'),
    );
  });
});
