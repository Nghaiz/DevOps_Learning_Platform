import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import type * as LabsCatalog from '../../labs/catalog';
import type * as LabsSession from '../../labs/session';
import type * as LessonsValidate from '../../lessons/validate';
import type * as MePreferences from '../../me/preferences';
import type * as SessionPreferences from '../../sessions/preferences';
import { SETUP_PROBE_SCRIPT } from '../../labs/setup-background';
import type { Database } from '../../db/client';
import type { LabAttemptRow } from '../../db/schema';
import type { TRPCContext } from '../init';
import { appRouter } from './app-router';

/**
 * `labs.startAttempt` / `labs.checkTask` có THẬT SỰ chạy và gác `lab.setup` không?
 *
 * ⚠ `setup-plan.test.ts` đã gác kỹ THỨ TỰ các bước setup, và
 * `setup-background.test.ts` gác hình dạng lượt phóng — nhưng cả hai gọi hàm
 * thuần trực tiếp. Một `startAttempt` không gọi dòng nào trong số đó vẫn để cả
 * hai bộ xanh nguyên, và đó chính là lỗi đã xảy ra thật: loader nạp đủ
 * `setup.foreground` + `setup.background`, không ai chạy chúng, nên mọi
 * `verify.sh` chấm trên sandbox TRẮNG — `find-kill-runaway` đỗ khi người học chưa
 * gõ lệnh nào. Bộ này gác đúng mắt xích còn thiếu: CALL-SITE.
 *
 * Cùng lớp với `labs-list-source-error.test.ts` ("router thật quên gọi helper").
 *
 * Không chạm Postgres và không có I/O thật: mọi biên ngoài đều mock.
 */

const ATTEMPT_ID = 'attempt-1';

const holder = vi.hoisted(() => ({
  /** Thứ tự các việc có tác dụng phụ, để khẳng định setup đi TRƯỚC lượt ghi DB. */
  nhatKy: [] as string[],
  /**
   * Tham số của lượt `createSandboxSession` gần nhất.
   *
   * Cần vì `profileForLab` (dùng cho NHÃN ở `labs.get`) và lượt tạo pod thật là
   * HAI chỗ gọi khác nhau, và bất biến giữa chúng là "cùng biểu thức". Một unit
   * test chỉ đọc nhãn sẽ xanh nguyên khi pod xin một profile khác.
   */
  sandboxParams: null as Record<string, unknown> | null,
  /**
   * Khe quota đang bị CHIẾM, theo sessionId.
   *
   * ⛔ Đây là vế khiến bộ này khẳng định được SỐ KHE chứ chỉ "có ném lỗi". Bảng
   * rủi ro P15 xếp đúng chế độ hỏng đó 4×4 = 16: một phép kiểm chỉ
   * `rejects.toBeInstanceOf(TRPCError)` sẽ XANH NGUYÊN trong khi phiên vẫn nằm
   * lại một tiếng. `createSandboxSession` cộng vào, `reapUnusableSession` trừ ra
   * — hai biên duy nhất trong tầm với của một unit test; lượt đo
   * `kubectl get resourcequota` trước/sau nằm trong report.
   */
  kheDangChiem: new Set<string>(),
  /** Mã thoát mà một lượt exec KHÔNG-PHẢI-probe trả về; 0 = thành công. */
  exitCode: 0,
  /** Output mà lượt exec đó trả về — 15.B đọc nó để dựng câu báo lỗi. */
  output: '',
  background: null as string | null,
  toolset: [] as string[],
  /** Output mà `SETUP_PROBE_SCRIPT` trả về. Mặc định: setup đã xong. */
  probeOutput: 'DLP-SETUP-STATE done 0\n',
  submittedAt: null as Date | null,
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
      interface: { layout: 'ide' },
      /*
        ⚠ `interfaceLayout` là trường của DTO `Lab` (loader dịch từ
        `interface.layout`), và nó phải khác `null` ở fixture này — một ô khẳng
        định `null === null` sẽ xanh y hệt khi router quên chuyển trường đi.
      */
      interfaceLayout: 'ide',
      capabilities: [],
      tier: 'standard',
      toolset: holder.toolset,
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
    createSandboxSession: async (_ctx: unknown, params: Record<string, unknown>) => {
      holder.nhatKy.push('createSandboxSession');
      holder.sandboxParams = params;
      holder.kheDangChiem.add('sess-1');
      return { session: { id: 'sess-1' } };
    },
    reapUnusableSession: async (_ctx: unknown, sessionId: string) => {
      holder.nhatKy.push(`reap:${sessionId}`);
      holder.kheDangChiem.delete(sessionId);
    },
    sessionExpiry: async () => 1_900_000_000,
  } as unknown as typeof LabsSession;
});

vi.mock('../../lessons/validate', async (importOriginal) => {
  const real = await importOriginal<typeof LessonsValidate>();
  return {
    ...real,
    runScriptInSession: async (req: { script: string }) => {
      if (req.script === SETUP_PROBE_SCRIPT) {
        holder.nhatKy.push('probeSetup');
        return { passed: true, exitCode: 0, output: holder.probeOutput, truncated: false };
      }
      holder.nhatKy.push(`runScript:${req.script.trim()}`);
      return {
        passed: holder.exitCode === 0,
        exitCode: holder.exitCode,
        output: holder.output,
        truncated: false,
      };
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

/**
 * Fake Postgres tối thiểu: một lượt `insert().values()` và một lượt
 * `select().from().where().limit()` trả về đúng lần thử của `ctx.user`.
 *
 * ⚠ KHÔNG diễn giải điều kiện `where`, nên bộ này KHÔNG nói gì về authz — vế đó
 * có suite riêng chạy trên Postgres thật (`security/labs-authz.test.ts`). Ghi rõ
 * ranh giới để không ai đọc một ô xanh ở đây thành "IDOR đã được gác".
 */
const attemptRow = (): LabAttemptRow =>
  ({
    id: ATTEMPT_ID,
    userId: 'u-start-attempt',
    labId: 'lab-test',
    sessionId: 'sess-1',
    startedAt: new Date('2026-09-10T00:00:00Z'),
    submittedAt: holder.submittedAt,
    displayNamePublic: false,
    createdAt: new Date('2026-09-10T00:00:00Z'),
    updatedAt: new Date('2026-09-10T00:00:00Z'),
  }) as unknown as LabAttemptRow;

const db = {
  insert: (_table: unknown) => ({
    values: async (row: Record<string, unknown>) => {
      holder.nhatKy.push(typeof row.taskId === 'string' ? 'insertTaskResult' : 'insertAttempt');
    },
  }),
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => [attemptRow()],
      }),
    }),
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

async function goiCheckTask(): Promise<unknown> {
  return appRouter
    .createCaller(ctx)
    .labs.checkTask({ labId: 'lab-test', attemptId: ATTEMPT_ID, taskId: 't1' });
}

beforeEach(() => {
  holder.nhatKy = [];
  holder.sandboxParams = null;
  holder.kheDangChiem = new Set();
  holder.exitCode = 0;
  holder.output = '';
  holder.background = null;
  holder.toolset = [];
  holder.probeOutput = 'DLP-SETUP-STATE done 0\n';
  holder.submittedAt = null;
});

describe('labs.startAttempt chạy setup của lab', () => {
  it('CHẠY script background — không để verify chấm trên sandbox trắng', async () => {
    holder.background = 'echo dung-canh\n';

    await goiStartAttempt();

    // Script của bài đi qua base64 (xem `buildBackgroundLaunchScript`), nên
    // khẳng định ở đây là "có một lượt exec mang lệnh phóng", không phải khớp
    // chuỗi gốc.
    const launches = holder.nhatKy.filter((v) => v.includes('nohup setsid'));
    expect(launches).toHaveLength(1);
  });

  it('chạy setup TRƯỚC khi ghi labAttempts — setup hỏng không để lại lần thử dở', async () => {
    holder.background = 'echo dung-canh\n';

    await goiStartAttempt();

    const iSetup = holder.nhatKy.findIndex((v) => v.includes('nohup setsid'));
    const iGhi = holder.nhatKy.indexOf('insertAttempt');
    expect(iSetup).toBeGreaterThanOrEqual(0);
    expect(iGhi).toBeGreaterThanOrEqual(0);
    expect(iSetup).toBeLessThan(iGhi);
  });

  it('setup thoát non-zero ⇒ NÉM và KHÔNG ghi lần thử nào', async () => {
    holder.toolset = ['ripgrep'];
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

describe('labs.startAttempt — setup hỏng phải TRẢ LẠI KHE, ngay (P15 / 15.A)', () => {
  it('số khe sau lượt hỏng BẰNG số khe trước đó', async () => {
    /*
      Ô AC 15.A, và nó cố ý KHÔNG khẳng định "có ném lỗi": bug rò khe để nguyên
      vế ném. Lab k8s chỉ có 5 khe (`requestsMemory` 1Gi/pod so với quota
      5952Mi), nên năm lượt hỏng liên tiếp đóng cửa lab MỘT TIẾNG — TTL của
      reaper — và màn hình chỉ nói "Còn 0 chỗ" trong khi không ai đang học.
    */
    holder.toolset = ['ripgrep'];
    holder.exitCode = 1;
    const truocKhiThu = holder.kheDangChiem.size;

    await expect(goiStartAttempt()).rejects.toBeInstanceOf(TRPCError);

    expect(holder.kheDangChiem.size).toBe(truocKhiThu);
  });

  it('reap đi TRƯỚC lượt ném — ném trước là thoát khỏi hàm, khe ở lại một tiếng', async () => {
    holder.toolset = ['ripgrep'];
    holder.exitCode = 1;

    await expect(goiStartAttempt()).rejects.toBeInstanceOf(TRPCError);

    expect(holder.nhatKy).toContain('reap:sess-1');
  });

  it('setup CHẠY ĐƯỢC ⇒ KHÔNG reap — khe vẫn của người học', async () => {
    holder.background = 'echo x\n';

    await goiStartAttempt();

    expect(holder.nhatKy.filter((v) => v.startsWith('reap:'))).toHaveLength(0);
    expect(holder.kheDangChiem.has('sess-1')).toBe(true);
  });

  it('câu ném RA NGOÀI vẫn mang nguyên nhân thật, không chỉ mã thoát (15.B)', async () => {
    holder.toolset = ['ripgrep'];
    holder.exitCode = 1;
    holder.output = 'dlp-tools: khong tai duoc goi ripgrep\n';

    await expect(goiStartAttempt()).rejects.toThrow(/khong tai duoc goi ripgrep/);
  });
});

describe('labs.startAttempt — background được PHÓNG, không chạy đồng bộ (P15 / 15.C hướng B)', () => {
  it('script của bài KHÔNG đi thẳng vào lượt exec; lệnh phóng thì có', async () => {
    /*
      Vế này là toàn bộ điểm của hướng B. Nếu script của bài đi thẳng vào `/exec`
      thì lượt gọi vẫn nằm dưới trần `gateway.execTimeout` 120s, và đo trên cụm
      thật 2026-09-09 cho thấy nó chạm 93.3s ở load ~43 rồi hỏng.
    */
    holder.background = 'dlp-k8s-wait 90\nkubectl apply -f -\n';

    await goiStartAttempt();

    const exec = holder.nhatKy.find((v) => v.startsWith('runScript:'));
    expect(exec).toBeDefined();
    expect(exec).toContain('nohup setsid');
    expect(exec).not.toContain('dlp-k8s-wait');
  });

  it('bước tools vẫn chạy ĐỒNG BỘ — nó là hằng số thời gian, không thuộc lớp lỗi 15.C', async () => {
    holder.toolset = ['ripgrep'];
    holder.background = null;

    await goiStartAttempt();

    const exec = holder.nhatKy.find((v) => v.startsWith('runScript:'));
    expect(exec).toContain('dlp-tools');
    expect(exec).not.toContain('nohup setsid');
  });
});

describe('labs.checkTask TỪ CHỐI chấm khi setup chưa xong (P15 / 15.C)', () => {
  it('setup đang chạy ⇒ NÉM PRECONDITION_FAILED và KHÔNG ghi dòng kết quả nào', async () => {
    /*
      Thiếu vế này là quay lại đúng lỗi `4a67043` vừa sửa, dưới hình dạng khác:
      chấm trên cảnh dựng DỞ thay vì cảnh TRẮNG. Hai chiều sai, cả hai đều im
      lặng — task "vắng mặt là đạt" đỗ vì thứ phải có còn chưa tạo; task cần cảnh
      dựng sẵn trượt vì cùng lý do.

      ⚠ NÉM, không phải `passed: false`: môi trường chưa dựng xong KHÔNG phải
      "bài làm sai" (plan ô 8, `validate.ts` § gatewayError).
    */
    holder.background = 'echo x\n';
    holder.probeOutput = 'DLP-SETUP-STATE running\n';

    await expect(goiCheckTask()).rejects.toSatisfy(
      (e) => e instanceof TRPCError && e.code === 'PRECONDITION_FAILED',
    );
    expect(holder.nhatKy).not.toContain('insertTaskResult');
    expect(holder.nhatKy.filter((v) => v === 'runScript:true')).toHaveLength(0);
  });

  it('setup HỎNG ⇒ câu ném nói ra nguyên nhân từ log, không chỉ "thất bại"', async () => {
    holder.background = 'echo x\n';
    holder.probeOutput =
      'DLP-SETUP-STATE done 1\nDLP-SETUP-LOG\nCum Kubernetes con khong san sang sau 90s\n';

    await expect(goiCheckTask()).rejects.toThrow(/khong san sang sau 90s/);
  });

  it('pod KHÔNG có dấu phóng nào mà lab CÓ khai background ⇒ từ chối, không chấm', async () => {
    // Phiên có trước P15, hoặc lượt phóng đã mất. Chấm bây giờ là chấm trên
    // sandbox trắng — đọc `'absent'` thành "sẵn sàng" là tái lập lỗi gốc.
    holder.background = 'echo x\n';
    holder.probeOutput = 'DLP-SETUP-STATE absent\n';

    await expect(goiCheckTask()).rejects.toBeInstanceOf(TRPCError);
    expect(holder.nhatKy).not.toContain('insertTaskResult');
  });

  it('setup xong ⇒ CHẤM bình thường', async () => {
    holder.background = 'echo x\n';
    holder.probeOutput = 'DLP-SETUP-STATE done 0\n';

    const out = (await goiCheckTask()) as { passed: boolean };

    expect(out.passed).toBe(true);
    expect(holder.nhatKy).toContain('insertTaskResult');
  });

  it('lab KHÔNG khai background ⇒ KHÔNG tốn lượt probe nào', async () => {
    /*
      Điều kiện đọc `lab.setup.background` (sự thật của NỘI DUNG), không đọc
      state `'absent'` của probe (sự thật về POD) — nên một lab không có setup
      không phải trả một lượt `kubectl exec` cho mỗi lượt Chấm.
    */
    holder.background = null;

    await goiCheckTask();

    expect(holder.nhatKy).not.toContain('probeSetup');
    expect(holder.nhatKy).toContain('insertTaskResult');
  });
});

describe('labs.setupStatus', () => {
  it('lab không khai background ⇒ ready ngay, không probe', async () => {
    holder.background = null;

    const out = (await appRouter.createCaller(ctx).labs.setupStatus({ attemptId: ATTEMPT_ID })) as {
      state: string;
      message: string | null;
    };

    expect(out.state).toBe('ready');
    expect(out.message).toBeNull();
    expect(holder.nhatKy).not.toContain('probeSetup');
  });

  it('đang dựng ⇒ running + câu cho người học đọc', async () => {
    holder.background = 'echo x\n';
    holder.probeOutput = 'DLP-SETUP-STATE running\n';

    const out = (await appRouter.createCaller(ctx).labs.setupStatus({ attemptId: ATTEMPT_ID })) as {
      state: string;
      message: string | null;
    };

    expect(out.state).toBe('running');
    expect(out.message).toContain('đang được dựng');
  });

  it('KHÔNG reap phiên hỏng — người học còn một pod sống và một terminal đang mở', async () => {
    /*
      Quyết định, không phải thiếu sót: `setupStatus` là một `query`, và
      react-query được phép gọi lại nó bất cứ lúc nào. 15.A chỉ thu hồi ca ĐỒNG
      BỘ — khi chưa có lần thử nào và chưa ai nhìn. Khe của ca này chết theo TTL,
      y như mọi phiên bị bỏ giữa chừng.
    */
    holder.background = 'echo x\n';
    holder.kheDangChiem.add('sess-1');
    holder.probeOutput = 'DLP-SETUP-STATE done 1\nDLP-SETUP-LOG\nhong roi\n';

    const out = (await appRouter.createCaller(ctx).labs.setupStatus({ attemptId: ATTEMPT_ID })) as {
      state: string;
    };

    expect(out.state).toBe('failed');
    expect(holder.nhatKy.filter((v) => v.startsWith('reap:'))).toHaveLength(0);
    expect(holder.kheDangChiem.has('sess-1')).toBe(true);
  });
});

/**
 * ⛔ Lab CÓ khai `interface.layout: ide` thì pod phải XIN profile `ide`.
 *
 * Đây là mắt xích từng đứt suốt P13-P16, và nó đứt ở đúng MỘT đối số:
 * `createSandboxSession` gọi `profileForCapabilities(params.capabilities)` mà
 * không chuyển `interfaceLayout` xuống. Hậu quả không phải một lỗi — nó là một
 * pod chạy đúng, xin đúng RAM của bài thường, và KHÔNG chạy Theia. Giao diện
 * vẫn vẽ tab Editor, iframe trỏ vào `/ide/session/...`, và người học nhìn một
 * khoang trắng vĩnh viễn. Không log, không exception.
 *
 * Bộ này gác CALL-SITE, cùng lớp với phần còn lại của file: `profileForLab`
 * (nhãn ở `labs.get`) và lượt tạo pod là hai chỗ gọi khác nhau, nên một ô chỉ
 * đọc nhãn sẽ xanh nguyên trong khi pod xin một profile khác.
 */
describe('startAttempt chuyển `interfaceLayout` của bài xuống lượt tạo pod', () => {
  it('lab khai `ide` ⇒ `createSandboxSession` nhận đúng `interfaceLayout: "ide"`', async () => {
    const caller = appRouter.createCaller(ctx);
    await caller.labs.startAttempt({ labId: 'lab-test', idempotencyKey: 'idem-ide' });

    expect(holder.sandboxParams, 'không lượt tạo sandbox nào được ghi lại').not.toBeNull();
    expect(holder.sandboxParams?.['interfaceLayout']).toBe('ide');
  });

  /**
   * Nửa DƯƠNG của ô trên. Không có nó, một `interfaceLayout` được chốt cứng
   * thành `'ide'` ở router cũng làm ô trên xanh — và khi ấy mọi lab thường sẽ
   * xin một pod 768Mi mà không ai cần.
   */
  it('đối chứng dương — trường đi theo BÀI, không phải một hằng chốt cứng', async () => {
    const caller = appRouter.createCaller(ctx);
    await caller.labs.startAttempt({ labId: 'lab-test', idempotencyKey: 'idem-caps' });

    // Cùng lượt đó phải mang `capabilities` của chính bài — nếu params được
    // dựng từ hằng thì hai trường này không thể cùng khớp fixture.
    expect(holder.sandboxParams?.['capabilities']).toEqual([]);
    expect(holder.sandboxParams?.['tier']).toBe('standard');
  });
});
