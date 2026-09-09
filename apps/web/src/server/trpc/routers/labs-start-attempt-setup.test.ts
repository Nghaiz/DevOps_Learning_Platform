import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import type * as LabsCatalog from '../../labs/catalog';
import type * as LabsSession from '../../labs/session';
import type * as LessonsValidate from '../../lessons/validate';
import type * as MePreferences from '../../me/preferences';
import type * as SessionPreferences from '../../sessions/preferences';
import type { Database } from '../../db/client';
import type { TRPCContext } from '../init';
import { appRouter } from './app-router';

/**
 * `labs.startAttempt` có THẬT SỰ chạy `lab.setup` không?
 *
 * ⚠ `setup-plan.test.ts` đã gác kỹ THỨ TỰ các bước setup — nhưng nó gọi hàm
 * thuần `setupScriptPlan` trực tiếp. Một `startAttempt` không gọi hàm đó dòng
 * nào vẫn để bộ kia xanh nguyên, và đó chính là lỗi đã xảy ra thật: loader nạp
 * đủ `setup.foreground` + `setup.background`, không ai chạy chúng, nên mọi
 * `verify.sh` chấm trên sandbox TRẮNG — `find-kill-runaway` đỗ khi người học
 * chưa gõ lệnh nào. Bộ này gác đúng mắt xích còn thiếu: CALL-SITE.
 *
 * Cùng lớp với `labs-list-source-error.test.ts` ("router thật quên gọi helper").
 *
 * Không chạm Postgres và không có I/O thật: mọi biên ngoài đều mock, `ctx.db`
 * chỉ cần đủ cho một lượt `insert().values()`.
 */

const holder = vi.hoisted(() => ({
  /** Thứ tự các việc có tác dụng phụ, để khẳng định setup đi TRƯỚC lượt ghi DB. */
  nhatKy: [] as string[],
  /** Mã thoát mà `runScriptInSession` trả về; 0 = setup thành công. */
  exitCode: 0,
  background: null as string | null,
}));

vi.mock('../../labs/catalog', async (importOriginal) => {
  const real = await importOriginal<typeof LabsCatalog>();
  return {
    ...real,
    requireLab: async () => ({
      id: 'lab-test',
      title: 'Lab kiểm call-site',
      description: 'x',
      difficulty: 'intermediate',
      estimatedMinutes: 10,
      source: null,
      backend: { imageid: 'ubuntu' },
      interface: null,
      tier: 'standard',
      toolset: [],
      tasks: [{ id: 't1', title: 'T1', weight: 1, hint: null, verifyScript: 'true', body: '' }],
      setup: { foreground: null, background: holder.background },
      passThresholdPercent: 100,
      leaderboard: false,
    }),
  } as unknown as typeof LabsCatalog;
});

vi.mock('../../labs/session', async (importOriginal) => {
  const real = await importOriginal<typeof LabsSession>();
  return {
    ...real,
    createSandboxSession: async () => {
      holder.nhatKy.push('createSandboxSession');
      return { session: { id: 'sess-1' } };
    },
    sessionExpiry: async () => 1_900_000_000,
  } as unknown as typeof LabsSession;
});

vi.mock('../../lessons/validate', async (importOriginal) => {
  const real = await importOriginal<typeof LessonsValidate>();
  return {
    ...real,
    runScriptInSession: async (req: { script: string }) => {
      holder.nhatKy.push(`runScript:${req.script.trim()}`);
      return { passed: holder.exitCode === 0, exitCode: holder.exitCode, stdout: '', stderr: '' };
    },
  } as unknown as typeof LessonsValidate;
});

vi.mock('../../me/preferences', async (importOriginal) => {
  const real = await importOriginal<typeof MePreferences>();
  return { ...real, readUserPreferences: async () => ({ leaderboardNamePublic: false }) } as unknown as typeof MePreferences;
});

vi.mock('../../sessions/preferences', async (importOriginal) => {
  const real = await importOriginal<typeof SessionPreferences>();
  return { ...real, applySessionPreferences: async () => ({ preferencesApplied: [] }) } as unknown as typeof SessionPreferences;
});

const db = {
  insert: () => ({
    values: async () => {
      holder.nhatKy.push('insertAttempt');
    },
  }),
} as unknown as Database;

const ctx: TRPCContext = {
  db,
  user: { id: 'u-start-attempt', role: 'user' },
  reqHeaders: new Headers(),
  resHeaders: new Headers(),
};

async function goiStartAttempt(): Promise<unknown> {
  return appRouter
    .createCaller(ctx)
    .labs.startAttempt({ labId: 'lab-test', idempotencyKey: crypto.randomUUID() });
}

beforeEach(() => {
  holder.nhatKy = [];
  holder.exitCode = 0;
  holder.background = null;
});

describe('labs.startAttempt chạy setup của lab', () => {
  it('CHẠY script background — không để verify chấm trên sandbox trắng', async () => {
    holder.background = 'echo dung-canh\n';

    await goiStartAttempt();

    expect(holder.nhatKy).toContain('runScript:echo dung-canh');
  });

  it('chạy setup TRƯỚC khi ghi labAttempts — setup hỏng không để lại lần thử dở', async () => {
    holder.background = 'echo dung-canh\n';

    await goiStartAttempt();

    const iSetup = holder.nhatKy.indexOf('runScript:echo dung-canh');
    const iGhi = holder.nhatKy.indexOf('insertAttempt');
    expect(iSetup).toBeGreaterThanOrEqual(0);
    expect(iGhi).toBeGreaterThanOrEqual(0);
    expect(iSetup).toBeLessThan(iGhi);
  });

  it('setup thoát non-zero ⇒ NÉM và KHÔNG ghi lần thử nào', async () => {
    holder.background = 'exit 3\n';
    holder.exitCode = 3;

    await expect(goiStartAttempt()).rejects.toBeInstanceOf(TRPCError);
    expect(holder.nhatKy).not.toContain('insertAttempt');
  });

  it('lab không khai setup ⇒ KHÔNG tốn lượt exec nào', async () => {
    holder.background = null;

    await goiStartAttempt();

    expect(holder.nhatKy.filter((v) => v.startsWith('runScript:'))).toHaveLength(0);
    expect(holder.nhatKy).toContain('insertAttempt');
  });
});
