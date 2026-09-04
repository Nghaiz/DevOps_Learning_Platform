import { describe, expect, it } from 'vitest';
import type { ContentBodyRow, ContentItemRow } from '@devops-platform/scenario';
import { PUBLISH_TRIAL_STALE_MS, isPublishTrialStale, trialPlan } from './publish';
import { basePublishedIdFor, draftIdFor } from '../trpc/routers/authoring';

function item(over: Partial<ContentItemRow> = {}): ContentItemRow {
  return {
    id: 'bai-mau',
    kind: 'lesson',
    state: 'draft',
    authorId: 'author-1',
    title: 'Bài mẫu',
    description: null,
    difficulty: 'beginner',
    estimatedMinutes: null,
    tier: 'sysbox',
    capabilities: [],
    backendImageId: 'ubuntu',
    interfaceLayout: null,
    passThresholdPercent: null,
    leaderboard: null,
    ttlSeconds: null,
    stepCount: 1,
    ...over,
  };
}

function body(over: Partial<ContentBodyRow> = {}): ContentBodyRow {
  return {
    item: item(),
    steps: [],
    intro: null,
    finish: null,
    setup: null,
    assets: [],
    ...over,
  };
}

describe('trialPlan — lượt chạy thử chạy CÁI GÌ (task 18)', () => {
  it('lesson: verify PHẢI pass; setup thì không', () => {
    const plan = trialPlan(
      'lesson',
      body({
        steps: [
          {
            ordinal: 0,
            taskId: null,
            title: null,
            markdown: '#',
            setupForeground: 'echo hi',
            setupBackground: 'apt-get update',
            verifyScript: 'test -f /tmp/x',
            weight: null,
            hint: null,
          },
        ],
      }),
    );

    expect(plan.map((s) => s.label)).toEqual([
      'steps[0].setup.background',
      'steps[0].setup.foreground',
      'steps[0].verifyScript',
    ]);
    // Đây là toàn bộ điểm của lượt chạy thử: một bài mà bước chấm không bao giờ
    // trả 0 là bài người học không thể hoàn thành, và không gì nói ra điều đó
    // cho tới khi họ mắc kẹt.
    expect(plan.find((s) => s.label === 'steps[0].verifyScript')?.mustPass).toBe(true);
    expect(plan.filter((s) => s.label.includes('setup')).every((s) => !s.mustPass)).toBe(true);
  });

  it('lesson: background chạy TRƯỚC foreground trong cùng một bước', () => {
    const plan = trialPlan(
      'lesson',
      body({
        steps: [
          {
            ordinal: 0,
            taskId: null,
            title: null,
            markdown: '#',
            setupForeground: 'echo hi',
            setupBackground: 'apt-get update',
            verifyScript: null,
            weight: null,
            hint: null,
          },
        ],
      }),
    );
    expect(plan[0]?.label).toContain('background');
    expect(plan[1]?.label).toContain('foreground');
  });

  it('lesson: intro trước các bước, finish sau', () => {
    const plan = trialPlan(
      'lesson',
      body({
        intro: { setup: { foreground: null, background: 'echo intro' } },
        finish: { setup: { foreground: null, background: 'echo finish' } },
        steps: [
          {
            ordinal: 0,
            taskId: null,
            title: null,
            markdown: '#',
            setupForeground: null,
            setupBackground: null,
            verifyScript: 'true',
            weight: null,
            hint: null,
          },
        ],
      }),
    );
    expect(plan.map((s) => s.label)).toEqual([
      'intro.setup.background',
      'steps[0].verifyScript',
      'finish.setup.background',
    ]);
  });

  it('lab: verify của task KHÔNG bắt buộc pass — môi trường chưa làm gì', () => {
    // Khác lesson một cách bản chất: một verify ĐÚNG sẽ TRƯỢT ở đây, vì người
    // học chưa làm task. Lượt thử chỉ đòi script CHẠY ĐƯỢC.
    const plan = trialPlan(
      'lab',
      body({
        item: item({ kind: 'lab' }),
        steps: [
          {
            ordinal: 0,
            taskId: 'tao-pod',
            title: 'Tạo Pod',
            markdown: '#',
            setupForeground: null,
            setupBackground: null,
            verifyScript: 'kubectl get pod x',
            weight: 1,
            hint: null,
          },
        ],
      }),
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]?.mustPass).toBe(false);
    expect(plan[0]?.label).toBe('task[tao-pod].verifyScript');
  });

  it('playground: không script nào — lượt thử là chính việc sandbox dựng lên được', () => {
    expect(trialPlan('playground', body({ item: item({ kind: 'playground' }) }))).toEqual([]);
  });

  it('script rỗng KHÔNG vào kế hoạch — một lượt exec cho chuỗi rỗng là công thừa', () => {
    const plan = trialPlan(
      'lesson',
      body({
        steps: [
          {
            ordinal: 0,
            taskId: null,
            title: null,
            markdown: '#',
            setupForeground: '',
            setupBackground: null,
            verifyScript: '',
            weight: null,
            hint: null,
          },
        ],
      }),
    );
    expect(plan).toEqual([]);
  });
});

describe('isPublishTrialStale — lưới an toàn cho pod chết giữa chừng', () => {
  const t0 = new Date('2026-09-04T00:00:00Z');

  it('vừa bắt đầu ⇒ chưa treo', () => {
    expect(isPublishTrialStale(t0, new Date(t0.getTime() + 1000))).toBe(false);
  });

  it('quá hạn ⇒ treo', () => {
    expect(isPublishTrialStale(t0, new Date(t0.getTime() + PUBLISH_TRIAL_STALE_MS + 1))).toBe(true);
  });

  it('ĐÚNG mốc ⇒ CHƯA treo — biên là "quá", không phải "tới"', () => {
    expect(isPublishTrialStale(t0, new Date(t0.getTime() + PUBLISH_TRIAL_STALE_MS))).toBe(false);
  });

  it('không có mốc bắt đầu ⇒ ĐỌC là treo', () => {
    // Một dòng `publishing` không có `publish_started_at` là dòng code này không
    // sinh ra được. Không có cơ sở nào để tin nó đang chạy.
    expect(isPublishTrialStale(null, t0)).toBe(true);
  });
});

describe('id bản nháp kế nhiệm (task 20)', () => {
  it('draftIdFor / basePublishedIdFor là nghịch đảo của nhau', () => {
    expect(draftIdFor('bai-mau')).toBe('bai-mau__draft');
    expect(basePublishedIdFor('bai-mau__draft')).toBe('bai-mau');
  });

  it('bài thường ⇒ null, tức xuất bản TẠI CHỖ', () => {
    expect(basePublishedIdFor('bai-mau')).toBeNull();
  });

  it('hậu tố không va được với id người soạn tự đặt', async () => {
    // `scenarioIdSchema` không cho ký tự `_`, nên `bai-mau__draft` là một id
    // KHÔNG ai tạo được qua `authoring.create`. Đó là điều làm hậu tố này an
    // toàn thay vì chỉ "khó trùng".
    const { scenarioIdSchema } = await import('@devops-platform/shared-types/scenario');
    expect(scenarioIdSchema.safeParse('bai-mau__draft').success).toBe(false);
    expect(scenarioIdSchema.safeParse('bai-mau').success).toBe(true);
  });
});
