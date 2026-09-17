import { describe, expect, it } from 'vitest';

import type { CicdCdPolicies, CicdLevelCd, ReleasePolicy, ReleaseScenario } from './cd-contract.ts';
import { mergeCdPolicies, runLevelCd } from './cd-run.ts';
import { simulateRelease } from './release.ts';

const XAU: ReleaseScenario = {
  instances: 4,
  requestsPerSecond: 100,
  baselineErrorRate: 0.01,
  candidateErrorRate: 0.2,
  replaceSeconds: 30,
  switchSeconds: 3,
  routeSeconds: 20,
  alertSeconds: 60,
  migration: 'none',
  fixForwardSeconds: 600,
};
const TOT: ReleaseScenario = { ...XAU, candidateErrorRate: 0.01 };

const CANARY: ReleasePolicy = {
  strategy: 'canary',
  canary: { weightPercent: 10, intervalSeconds: 60, intervals: 3, maxErrorRateDelta: 0.02 },
  onBadRelease: 'rollback',
};

const INITIAL: CicdCdPolicies = {
  release: CANARY,
  gitops: { reconcileEverySeconds: 180, selfHeal: false, ignoreFields: [] },
  masking: { masked: [] },
};

function cd(editable: CicdLevelCd['editable']): CicdLevelCd {
  return {
    release: { scenarios: [XAU, TOT], evaluation: { baseSeed: 7, passes: 5 } },
    gitops: {
      scenario: {
        horizonSeconds: 300,
        initial: [{ field: 'image', value: 'v1' }],
        changes: [{ atSecond: 40, actor: 'human', field: 'image', value: 'v1-tay' }],
      },
    },
    masking: { scenario: { secrets: [{ id: 'token', value: 'abcd1234' }], lines: [{ text: 'x {{token}}' }] } },
    editable,
    initial: INITIAL,
    solution: INITIAL,
    altSolution: INITIAL,
  };
}

describe('mergeCdPolicies — khoá theo từng núm (§5.3)', () => {
  const doiHet: CicdCdPolicies = {
    release: {
      strategy: 'blue-green',
      rolling: { batchSize: 2 },
      canary: { weightPercent: 40, intervalSeconds: 30, intervals: 6, maxErrorRateDelta: 0.05 },
      onBadRelease: 'roll-forward',
    },
    gitops: { reconcileEverySeconds: 30, selfHeal: true, ignoreFields: ['replicas'] },
    masking: { masked: [{ secret: 'token', form: 'raw' }] },
  };

  it('không mở núm nào ⇒ trả đúng `initial`, bất kể bảng gửi gì', () => {
    expect(mergeCdPolicies(INITIAL, doiHet, [])).toEqual(INITIAL);
  });

  it('mở một núm ⇒ CHỈ phần đó đổi', () => {
    const ra = mergeCdPolicies(INITIAL, doiHet, ['release.canary', 'gitops.selfHeal']);
    expect(ra.release).toEqual({ ...CANARY, canary: doiHet.release?.canary });
    expect(ra.gitops).toEqual({ ...INITIAL.gitops, selfHeal: true });
    expect(ra.masking).toEqual(INITIAL.masking);
  });

  it('chiến lược mở, tham số canary khoá ⇒ đổi sang rolling mà KHÔNG lén lấy `rolling` người chơi gửi', () => {
    const ra = mergeCdPolicies(INITIAL, doiHet, ['release.strategy']);
    expect(ra.release).toEqual({ strategy: 'blue-green', canary: CANARY.canary, onBadRelease: 'rollback' });
  });

  it('khoá lạ từ bảng điều khiển không lọt qua', () => {
    const coKhoaLa = { release: { ...CANARY, laMat: 1 } } as unknown as CicdCdPolicies;
    expect(Object.keys(mergeCdPolicies(INITIAL, coKhoaLa, ['release.canary']).release ?? {})).not.toContain('laMat');
  });

  it('khối `initial` không có ⇒ người chơi không thêm được', () => {
    expect(mergeCdPolicies({ masking: { masked: [] } }, doiHet, ['release.strategy'])).toEqual({
      masking: { masked: [] },
    });
  });
});

describe('runLevelCd', () => {
  it('chạy đủ ba bộ mô phỏng, và kịch bản thứ i dùng baseSeed + i', () => {
    const run = runLevelCd(cd([]), {});
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.records.release?.map((r) => r.scenario)).toEqual([XAU, TOT]);
    expect(run.records.release?.[1]?.record).toEqual(simulateRelease(CANARY, TOT, { baseSeed: 8, passes: 5 }));
    expect(run.records.gitops).toBeDefined();
    expect(run.records.masking?.record.leaks.length).toBeGreaterThan(0);
  });

  it('tự khoá trước khi mô phỏng — chính sách đem chấm là bản đã ghép', () => {
    const run = runLevelCd(cd([]), { release: { strategy: 'blue-green', onBadRelease: 'rollback' } });
    expect(run.policies.release).toEqual(CANARY);
  });

  it('giá trị người chơi ngoài miền ⇒ nhánh `ok: false` nói ra bộ mô phỏng và lý do, không ném', () => {
    const run = runLevelCd(cd(['release.canary']), {
      release: { ...CANARY, canary: { ...CANARY.canary!, weightPercent: 0 } },
    });
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.simulator).toBe('release');
    expect(run.message).toMatch(/weightPercent/u);
  });

  it('chiến lược mở mà thiếu tham số ⇒ bản ghi mang `missing-strategy-params`, không bị điền lén', () => {
    const run = runLevelCd(cd(['release.strategy']), { release: { strategy: 'rolling', onBadRelease: 'rollback' } });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.records.release?.[0]?.record.error).toEqual({ kind: 'missing-strategy-params', strategy: 'rolling' });
  });
});
