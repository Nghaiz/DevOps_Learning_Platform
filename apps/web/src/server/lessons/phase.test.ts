import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import type { Scenario, ScenarioPhase } from '@devops-platform/shared-types/scenario';
import { phaseRefSchema, resolvePhase } from './phase';

/**
 * Unit test cho `resolvePhase` — bổ khuyết cho `security/lessons-authz.test.ts`.
 *
 * ⚠ VÌ SAO CẦN MỘT FILE RIÊNG VỚI SCENARIO DỰNG TAY. Cả bốn bài trong
 * `content/scenarios/` đều có ĐỦ `intro` và `finish`, nên nhánh "phase vắng mặt"
 * KHÔNG có cách nào chạm tới từ test tích hợp — nó sẽ là mã mà không phép kiểm
 * nào giết được, và một `return scenario.steps[0]` lọt vào đó sẽ không làm ô nào
 * đỏ. DTO thì cho phép vắng (`scenarioSchema` khai chúng nullable, đúng theo
 * Killercoda: `use-images` upstream không có finish).
 *
 * Đây đúng là ranh giới giữa hai loại test: nội dung thật chứng minh ta đọc được
 * thứ đang có; scenario dựng tay chứng minh ta xử đúng thứ CHƯA có nhưng hợp lệ.
 */

const PHASE: ScenarioPhase = {
  title: 'x',
  markdown: '# x',
  setup: { foreground: null, background: null },
  verifyScript: null,
};

function scenarioWith(overrides: Partial<Scenario>): Scenario {
  return {
    id: 'test-scenario',
    title: 'T',
    description: null,
    difficulty: 'beginner',
    estimatedMinutes: null,
    tier: 'sysbox',
    requiresCapabilities: null,
    capabilities: [],
    backendImageId: 'ubuntu',
    interfaceLayout: null,
    intro: null,
    finish: null,
    steps: [{ ...PHASE, index: 0 }],
    assets: [],
    source: {
      repo: 'https://example.test/repo',
      commit: '0'.repeat(40),
      path: 'p',
      license: 'MIT',
      licenseUrl: 'https://example.test/LICENSE',
      upstreamTitle: 'T',
    },
    ignoredUpstreamFields: [],
    ...overrides,
  };
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof TRPCError ? error.code : 'NOT_A_TRPC_ERROR';
  }
  return 'KHONG_NEM';
}

describe('resolvePhase', () => {
  it('bài KHÔNG có intro → NOT_FOUND (không rơi về step 0)', () => {
    const scenario = scenarioWith({ intro: null });
    expect(codeOf(() => resolvePhase(scenario, { kind: 'intro' }))).toBe('NOT_FOUND');
  });

  it('bài KHÔNG có finish → NOT_FOUND', () => {
    const scenario = scenarioWith({ finish: null });
    expect(codeOf(() => resolvePhase(scenario, { kind: 'finish' }))).toBe('NOT_FOUND');
  });

  it('intro và finish là HAI phase khác nhau, không lẫn vào nhau', () => {
    // Một `ref.kind === 'intro' ? intro : intro` (lỗi sao chép) vẫn cho hai ca
    // trên xanh; ca này thì không.
    const intro: ScenarioPhase = { ...PHASE, markdown: 'INTRO' };
    const finish: ScenarioPhase = { ...PHASE, markdown: 'FINISH' };
    const scenario = scenarioWith({ intro, finish });

    expect(resolvePhase(scenario, { kind: 'intro' }).markdown).toBe('INTRO');
    expect(resolvePhase(scenario, { kind: 'finish' }).markdown).toBe('FINISH');
  });

  it('step ngoài khoảng → NOT_FOUND, thông điệp nói rõ bài có bao nhiêu step', () => {
    const scenario = scenarioWith({});
    let message = '';
    try {
      resolvePhase(scenario, { kind: 'step', index: 5 });
    } catch (error) {
      message = error instanceof TRPCError ? error.message : '';
    }
    expect(message).toContain('1 step');
    expect(message).toContain('index 5');
  });

  it('step trong khoảng → trả đúng step đó', () => {
    const scenario = scenarioWith({
      steps: [
        { ...PHASE, index: 0, markdown: 'A' },
        { ...PHASE, index: 1, markdown: 'B' },
      ],
    });
    expect(resolvePhase(scenario, { kind: 'step', index: 1 }).markdown).toBe('B');
  });
});

describe('phaseRefSchema', () => {
  it('chấp nhận ba dạng hợp lệ', () => {
    expect(phaseRefSchema.parse({ kind: 'intro' })).toEqual({ kind: 'intro' });
    expect(phaseRefSchema.parse({ kind: 'finish' })).toEqual({ kind: 'finish' });
    expect(phaseRefSchema.parse({ kind: 'step', index: 0 })).toEqual({ kind: 'step', index: 0 });
  });

  it('từ chối field lạ (luật 3) — kể cả trên nhánh không có index', () => {
    expect(phaseRefSchema.safeParse({ kind: 'intro', index: 0 }).success).toBe(false);
    expect(phaseRefSchema.safeParse({ kind: 'step', index: 0, extra: 1 }).success).toBe(false);
  });

  it('từ chối index âm và index không nguyên', () => {
    expect(phaseRefSchema.safeParse({ kind: 'step', index: -1 }).success).toBe(false);
    expect(phaseRefSchema.safeParse({ kind: 'step', index: 1.5 }).success).toBe(false);
  });

  it('từ chối step thiếu index — không mặc định về 0', () => {
    // Mặc định 0 nghĩa là một FE gửi thiếu field sẽ luôn chấm step đầu, và
    // người học thấy "Check" báo sai ở step 3 mà không hiểu vì sao.
    expect(phaseRefSchema.safeParse({ kind: 'step' }).success).toBe(false);
  });
});
