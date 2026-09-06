import { describe, expect, it } from 'vitest';
import type { Lab } from '@devops-platform/shared-types/lab';
import type { Playground } from '@devops-platform/shared-types/playground';
import type { Scenario } from '@devops-platform/shared-types/scenario';
import { emptyDraft, emptyStep, toDraftInput, type DraftFormState } from './draft-form';
import { draftFromLab, draftFromPlayground, draftFromPreview, draftFromScenario } from './draft-from-preview';

function lessonForm(over: Partial<DraftFormState> = {}): DraftFormState {
  return { ...emptyDraft(), title: 'Bài một', ...over };
}

describe('toDraftInput — ô số', () => {
  it('ô trống ra null, không ra 0', () => {
    const result = toDraftInput('lesson', lessonForm({ estimatedMinutes: '' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.estimatedMinutes).toBeNull();
  });

  it('chuỗi không phải số bị TỪ CHỐI, không lặng lẽ thành null', () => {
    const result = toDraftInput('lesson', lessonForm({ estimatedMinutes: 'ba mươi' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.path).toBe('estimatedMinutes');
  });

  it('ký hiệu mũ và khoảng trắng KHÔNG được nhận (Number sẽ nhận, nên phép kiểm phải chặt hơn Number)', () => {
    expect(toDraftInput('lesson', lessonForm({ estimatedMinutes: '1e3' })).ok).toBe(false);
    expect(toDraftInput('lesson', lessonForm({ estimatedMinutes: '-5' })).ok).toBe(false);
  });

  it('ttlSeconds ngoài khoảng 300–7200 bị chặn ngay ở client', () => {
    const tooLong = toDraftInput('playground', lessonForm({ ttlSeconds: '99999' }));
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.issues[0]?.message).toContain('300');
  });
});

describe('toDraftInput — ô bắt buộc', () => {
  it('tiêu đề trống và image id trống được nêu TÊN, không gộp thành một câu chung', () => {
    const result = toDraftInput('lesson', lessonForm({ title: '   ', backendImageId: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.path)).toEqual(['title', 'backendImageId']);
    }
  });
});

describe('toDraftInput — payload theo loại nội dung', () => {
  it('lab gửi passThresholdPercent + leaderboard + setup, KHÔNG gửi intro/finish', () => {
    const form = lessonForm({
      passThresholdPercent: '70',
      leaderboard: true,
      setupForeground: 'echo setup',
      hasIntro: true,
      steps: [{ ...emptyStep('k1'), taskId: 'tim-tien-trinh', title: 'T', verifyScript: 'true', weight: '2' }],
    });
    const result = toDraftInput('lab', form);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passThresholdPercent).toBe(70);
    expect(result.value.leaderboard).toBe(true);
    expect(result.value.setup).toEqual({ foreground: 'echo setup', background: null });
    expect(result.value.intro).toBeNull();
    expect(result.value.finish).toBeNull();
  });

  it('lesson KHÔNG gửi passThresholdPercent/leaderboard/ttlSeconds dù form có giá trị mặc định', () => {
    const result = toDraftInput('lesson', lessonForm());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passThresholdPercent).toBeNull();
    expect(result.value.leaderboard).toBeNull();
    expect(result.value.ttlSeconds).toBeNull();
  });

  it('playground không có bước nào và không có độ khó', () => {
    const form = lessonForm({ steps: [emptyStep('k1')], difficulty: 'advanced' });
    const result = toDraftInput('playground', form);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.steps).toEqual([]);
    expect(result.value.difficulty).toBeNull();
  });
});

describe('toDraftInput — id task của lab', () => {
  it('id task rỗng bị từ chối ở client kèm chỉ số task', () => {
    const form = lessonForm({ steps: [{ ...emptyStep('k1'), taskId: '', verifyScript: 'true' }] });
    const result = toDraftInput('lab', form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.path).toBe('task[0].taskId');
  });

  it('id task chữ hoa / dấu gạch dưới bị từ chối bằng chính schema của shared-types', () => {
    const form = lessonForm({ steps: [{ ...emptyStep('k1'), taskId: 'Tim_Tien_Trinh' }] });
    expect(toDraftInput('lab', form).ok).toBe(false);
  });

  it('bài học KHÔNG bị đòi id task — vị trí là định danh', () => {
    const form = lessonForm({ steps: [{ ...emptyStep('k1'), markdown: 'nội dung' }] });
    const result = toDraftInput('lesson', form);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value.steps as { taskId: unknown }[])[0]?.taskId).toBeNull();
    }
  });
});

// ── Vòng tròn nạp → gửi ──────────────────────────────────────────────────────

const scenario: Scenario = {
  id: 'dlp-bai-mot',
  title: 'Bài một',
  description: 'mô tả',
  difficulty: 'intermediate',
  estimatedMinutes: 25,
  tier: 'sysbox',
  capabilities: ['docker'],
  requiresCapabilities: null,
  backendImageId: 'ubuntu',
  interfaceLayout: 'ide',
  assets: [{ host: 'host01', file: 'a.sh', target: '/tmp', chmod: '0755' }],
  source: null,
  intro: {
    title: 'Mở đầu',
    markdown: 'chào',
    setup: { foreground: 'echo fg', background: null },
    verifyScript: null,
  },
  finish: null,
  steps: [
    {
      index: 0,
      title: 'Bước một',
      markdown: 'làm gì đó',
      setup: { foreground: null, background: 'echo bg' },
      verifyScript: 'test -f /tmp/a',
    },
  ],
  ignoredUpstreamFields: [],
};

describe('nạp bài học rồi gửi lại — không rơi field nào', () => {
  it('mọi field soạn được đi hết một vòng', () => {
    const result = toDraftInput('lesson', draftFromScenario(scenario));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('Bài một');
    expect(result.value.description).toBe('mô tả');
    expect(result.value.difficulty).toBe('intermediate');
    expect(result.value.estimatedMinutes).toBe(25);
    expect(result.value.tier).toBe('sysbox');
    expect(result.value.capabilities).toEqual(['docker']);
    expect(result.value.backendImageId).toBe('ubuntu');
    expect(result.value.interfaceLayout).toBe('ide');
    expect(result.value.assets).toEqual([{ host: 'host01', file: 'a.sh', target: '/tmp', chmod: '0755' }]);
    expect(result.value.intro).toEqual({
      title: 'Mở đầu',
      markdown: 'chào',
      setup: { foreground: 'echo fg', background: null },
      verifyScript: null,
    });
    expect(result.value.finish).toBeNull();
    expect(result.value.steps).toEqual([
      {
        taskId: null,
        title: 'Bước một',
        markdown: 'làm gì đó',
        setupForeground: null,
        setupBackground: 'echo bg',
        verifyScript: 'test -f /tmp/a',
        weight: null,
        hint: null,
      },
    ]);
  });

  it('phase vắng mặt vẫn vắng mặt sau vòng tròn — không tự sinh ra một intro rỗng', () => {
    const form = draftFromScenario({ ...scenario, intro: null });
    expect(form.hasIntro).toBe(false);
    const result = toDraftInput('lesson', form);
    if (result.ok) expect(result.value.intro).toBeNull();
  });
});

const lab: Lab = {
  id: 'dlp-lab-mot',
  title: 'Lab một',
  description: null,
  difficulty: 'beginner',
  estimatedMinutes: null,
  tier: 'sysbox',
  capabilities: [],
  requiresCapabilities: null,
  backendImageId: 'ubuntu',
  interfaceLayout: null,
  assets: [],
  source: null,
  setup: { foreground: null, background: 'echo chuan-bi' },
  passThresholdPercent: 80,
  leaderboard: true,
  tasks: [
    { id: 'task-mot', title: 'Việc một', markdown: 'mô tả', verifyScript: 'true', weight: 3, hint: 'gợi ý' },
  ],
};

describe('nạp lab rồi gửi lại', () => {
  it('task giữ id bền, trọng số và gợi ý', () => {
    const result = toDraftInput('lab', draftFromLab(lab));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passThresholdPercent).toBe(80);
    expect(result.value.leaderboard).toBe(true);
    expect(result.value.setup).toEqual({ foreground: null, background: 'echo chuan-bi' });
    expect(result.value.steps).toEqual([
      {
        taskId: 'task-mot',
        title: 'Việc một',
        markdown: 'mô tả',
        setupForeground: null,
        setupBackground: null,
        verifyScript: 'true',
        weight: 3,
        hint: 'gợi ý',
      },
    ]);
  });

  it('leaderboard false đi qua nguyên vẹn — KHÔNG bị đọc thành "chưa khai" rồi bật lên', () => {
    const result = toDraftInput('lab', draftFromLab({ ...lab, leaderboard: false }));
    if (result.ok) expect(result.value.leaderboard).toBe(false);
  });
});

const playground: Playground = {
  id: 'dlp-san-mot',
  title: 'Sân một',
  description: null,
  tier: 'sysbox',
  capabilities: ['kubernetes'],
  backendImageId: 'kubernetes-kubeadm-2nodes',
  interfaceLayout: null,
  ttlSeconds: 3600,
};

describe('nạp playground rồi gửi lại', () => {
  it('giữ ttlSeconds đã khai thay vì mặc định của form', () => {
    const form = draftFromPlayground(playground);
    expect(form.ttlSeconds).toBe('3600');
    const result = toDraftInput('playground', form);
    if (result.ok) expect(result.value.ttlSeconds).toBe(3600);
  });
});

describe('draftFromPreview khi nguồn từ chối bản nháp', () => {
  it('trả null thay vì một form trống — form trống sẽ bị Lưu đè lên bản nháp thật', () => {
    expect(draftFromPreview({ kind: 'lesson', lesson: null })).toBeNull();
    expect(draftFromPreview({ kind: 'lab', lab: null })).toBeNull();
    expect(draftFromPreview({ kind: 'playground', playground: null })).toBeNull();
  });

  it('nạp được thì trả đúng form của loại đó', () => {
    expect(draftFromPreview({ kind: 'lab', lab })?.passThresholdPercent).toBe('80');
  });
});
