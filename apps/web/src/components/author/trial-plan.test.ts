import { describe, expect, it } from 'vitest';
import type { Lab } from '@devops-platform/shared-types/lab';
import type { Scenario } from '@devops-platform/shared-types/scenario';
import { mergeTrialOutcome, parsePublishFailure, trialPlanFor } from './trial-plan';

const lesson: Scenario = {
  id: 'dlp-bai',
  title: 'Bài',
  description: null,
  difficulty: 'beginner',
  estimatedMinutes: null,
  tier: 'sysbox',
  capabilities: [],
  requiresCapabilities: null,
  backendImageId: 'ubuntu',
  interfaceLayout: null,
  toolset: [],
  assets: [],
  source: null,
  intro: {
    title: null,
    markdown: 'chào',
    setup: { foreground: 'echo fg', background: 'echo bg' },
    verifyScript: null,
  },
  finish: null,
  steps: [
    {
      index: 0,
      title: null,
      markdown: 'một',
      setup: { foreground: null, background: 'echo prep' },
      verifyScript: 'test -f /tmp/a',
    },
    {
      index: 1,
      title: null,
      markdown: 'hai',
      setup: { foreground: null, background: null },
      verifyScript: 'test -f /tmp/b',
    },
  ],
  ignoredUpstreamFields: [],
};

describe('trialPlanFor — bài học', () => {
  const plan = trialPlanFor({ kind: 'lesson', lesson });

  it('nhãn khớp TỪNG KÝ TỰ với trialPlan của server, và background đứng trước foreground', () => {
    expect(plan.map((s) => s.label)).toEqual([
      'intro.setup.background',
      'intro.setup.foreground',
      'steps[0].setup.background',
      'steps[0].verifyScript',
      'steps[1].verifyScript',
    ]);
  });

  it('CHỈ script chấm của bài học là bắt buộc đạt; setup thì không', () => {
    expect(plan.filter((s) => s.mustPass).map((s) => s.label)).toEqual([
      'steps[0].verifyScript',
      'steps[1].verifyScript',
    ]);
  });

  it('script rỗng không sinh ra bước nào — server cũng bỏ qua chuỗi rỗng', () => {
    const empty = trialPlanFor({
      kind: 'lesson',
      lesson: {
        ...lesson,
        intro: { ...lesson.intro!, setup: { foreground: '', background: '' } },
        steps: [{ ...lesson.steps[0]!, setup: { foreground: null, background: null }, verifyScript: '' }],
      },
    });
    expect(empty).toEqual([]);
  });
});

const lab: Lab = {
  id: 'dlp-lab',
  title: 'Lab',
  description: null,
  difficulty: 'beginner',
  estimatedMinutes: null,
  tier: 'sysbox',
  capabilities: [],
  requiresCapabilities: null,
  backendImageId: 'ubuntu',
  interfaceLayout: null,
  toolset: [],
  assets: [],
  source: null,
  setup: { foreground: null, background: 'echo chuan-bi' },
  passThresholdPercent: 50,
  leaderboard: false,
  tasks: [
    { id: 'viec-a', title: 'Việc A', markdown: 'm', verifyScript: 'true', weight: 1, hint: null },
    { id: 'viec-b', title: 'Việc B', markdown: 'm', verifyScript: 'true', weight: 1, hint: null },
  ],
};

describe('trialPlanFor — lab', () => {
  const plan = trialPlanFor({ kind: 'lab', lab });

  it('nhãn setup của lab là "setup.setup.<kênh>" — trông thừa nhưng đó là chuỗi THẬT server ghi', () => {
    expect(plan[0]?.label).toBe('setup.setup.background');
  });

  it('task đánh nhãn theo id BỀN, không theo vị trí', () => {
    expect(plan.map((s) => s.label)).toEqual([
      'setup.setup.background',
      'task[viec-a].verifyScript',
      'task[viec-b].verifyScript',
    ]);
  });

  it('KHÔNG task nào của lab bắt buộc đạt — môi trường lúc thử chưa ai làm gì', () => {
    expect(plan.some((s) => s.mustPass)).toBe(false);
  });
});

describe('trialPlanFor — playground', () => {
  it('không có script nào; lượt thử của nó là chính việc dựng được sandbox', () => {
    expect(trialPlanFor({ kind: 'playground', playground: null })).toEqual([]);
  });
});

describe('parsePublishFailure', () => {
  it('tách nhãn, exit code và output của bước trượt', () => {
    const failure = parsePublishFailure('steps[1].verifyScript trượt (exit 1):\nkhông thấy /tmp/b');
    expect(failure).toEqual({
      kind: 'step',
      label: 'steps[1].verifyScript',
      exitCode: '1',
      output: 'không thấy /tmp/b',
    });
  });

  it('output nhiều dòng giữ nguyên xuống dòng', () => {
    const failure = parsePublishFailure('task[a].verifyScript trượt (exit 2):\ndòng 1\ndòng 2');
    expect(failure.kind === 'step' && failure.output).toBe('dòng 1\ndòng 2');
  });

  it('lỗi định dạng nội dung tách riêng khỏi lỗi bước', () => {
    expect(parsePublishFailure('Nội dung không hợp lệ: steps — quá ít phần tử').kind).toBe('invalid');
  });

  it('lỗi hạ tầng rơi vào nhánh other, không bị ép thành một bước giả', () => {
    expect(parsePublishFailure('Không dựng được sandbox để chạy thử')).toEqual({
      kind: 'other',
      message: 'Không dựng được sandbox để chạy thử',
    });
  });
});

describe('mergeTrialOutcome', () => {
  const plan = trialPlanFor({ kind: 'lesson', lesson });

  it('đạt: bước chấm là "Đạt", setup là "Đã chạy" — hai chuyện khác nhau', () => {
    const merged = mergeTrialOutcome(plan, null);
    expect(merged?.map((r) => r.status)).toEqual(['ran', 'ran', 'ran', 'passed', 'passed']);
  });

  it('trượt giữa chừng: trước là đã chạy, đúng chỗ là trượt, SAU là chưa chạy', () => {
    const failure = parsePublishFailure('steps[0].verifyScript trượt (exit 1):\nboom');
    const merged = mergeTrialOutcome(plan, failure);
    expect(merged?.map((r) => r.status)).toEqual(['ran', 'ran', 'ran', 'failed', 'skipped']);
  });

  it('bước cuối trượt thì không có bước nào bị đánh dấu chưa chạy', () => {
    const merged = mergeTrialOutcome(plan, parsePublishFailure('steps[1].verifyScript trượt (exit 3):\nx'));
    expect(merged?.map((r) => r.status)).toEqual(['ran', 'ran', 'ran', 'passed', 'failed']);
  });

  it('trượt trước khi vào sandbox: KHÔNG bước nào được đánh là đã chạy', () => {
    const merged = mergeTrialOutcome(plan, parsePublishFailure('Không dựng được sandbox để chạy thử'));
    expect(merged?.every((r) => r.status === 'skipped')).toBe(true);
  });

  it('nhãn lạ (bản sao đã trôi khỏi server) trả null — không vẽ bảng sai', () => {
    const drifted = parsePublishFailure('steps[99].mot-kenh-moi trượt (exit 1):\nboom');
    expect(mergeTrialOutcome(plan, drifted)).toBeNull();
  });
});
