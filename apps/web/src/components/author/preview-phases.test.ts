import { describe, expect, it } from 'vitest';
import type { Lab } from '@devops-platform/shared-types/lab';
import type { Scenario } from '@devops-platform/shared-types/scenario';
import { previewPhases, resolveContentAssetUrl } from './preview-phases';

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
  intro: { title: null, markdown: 'chào', setup: { foreground: null, background: null }, verifyScript: null },
  finish: { title: 'Xong', markdown: 'hết', setup: { foreground: null, background: null }, verifyScript: null },
  steps: [
    { index: 0, title: null, markdown: 'một', setup: { foreground: null, background: null }, verifyScript: null },
    {
      index: 1,
      title: 'Bước có tên',
      markdown: 'hai',
      setup: { foreground: null, background: null },
      verifyScript: null,
    },
  ],
  ignoredUpstreamFields: [],
};

describe('previewPhases — bài học', () => {
  const phases = previewPhases({ kind: 'lesson', lesson });

  it('đủ mở đầu + các bước + kết thúc, đúng thứ tự người học gặp', () => {
    expect(phases.map((p) => p.key)).toEqual(['intro', 'step-0', 'step-1', 'finish']);
  });

  it('mở đầu/kết thúc mang nhãn chữ — KHÔNG bị đánh số chung với bước', () => {
    expect(phases[0]?.label).toBe('Mở đầu');
    expect(phases[3]?.label).toBe('Xong');
    // Bước không tên đánh số từ 1 cho người đọc, nhưng khoá vẫn 0-based.
    expect(phases[1]?.label).toBe('Bước 1');
    expect(phases[1]?.key).toBe('step-0');
  });

  it('bước có tiêu đề thì dùng tiêu đề', () => {
    expect(phases[2]?.label).toBe('Bước có tên');
  });

  it('bài không có mở đầu/kết thúc chỉ ra đúng các bước', () => {
    const only = previewPhases({ kind: 'lesson', lesson: { ...lesson, intro: null, finish: null } });
    expect(only.map((p) => p.key)).toEqual(['step-0', 'step-1']);
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
  setup: { foreground: null, background: null },
  passThresholdPercent: 50,
  leaderboard: false,
  tasks: [
    { id: 'a', title: 'Việc A', markdown: 'ma', verifyScript: 'true', weight: 1, hint: null },
    { id: 'b', title: 'Việc B', markdown: 'mb', verifyScript: 'true', weight: 1, hint: null },
  ],
};

describe('previewPhases — lab', () => {
  it('khoá theo id BỀN của task, không theo vị trí', () => {
    expect(previewPhases({ kind: 'lab', lab }).map((p) => p.key)).toEqual(['task-a', 'task-b']);
  });

  it('đổi thứ tự task thì khoá đi theo task, không đứng yên tại chỗ', () => {
    const swapped = previewPhases({ kind: 'lab', lab: { ...lab, tasks: [lab.tasks[1]!, lab.tasks[0]!] } });
    expect(swapped.map((p) => p.key)).toEqual(['task-b', 'task-a']);
  });
});

describe('previewPhases — không có gì để xem', () => {
  it('playground trả rỗng (nó không có thân)', () => {
    expect(previewPhases({ kind: 'playground', playground: null })).toEqual([]);
  });

  it('nguồn từ chối bản nháp cũng trả rỗng, không ném', () => {
    expect(previewPhases({ kind: 'lesson', lesson: null })).toEqual([]);
    expect(previewPhases({ kind: 'lab', lab: null })).toEqual([]);
  });
});

describe('resolveContentAssetUrl — phải khớp trình học từng bước', () => {
  it('cắt tiền tố ./ rồi ghép vào route asset của scenario', () => {
    expect(resolveContentAssetUrl('dlp-bai', './assets/so-do.png')).toBe(
      '/api/scenarios/dlp-bai/assets/so-do.png',
    );
    expect(resolveContentAssetUrl('dlp-bai', 'assets/so-do.png')).toBe(
      '/api/scenarios/dlp-bai/assets/so-do.png',
    );
  });

  it('khoá lưu trữ 32 hex của nguồn DB đi qua cùng một đường', () => {
    const key = 'a'.repeat(32);
    expect(resolveContentAssetUrl('dlp-bai', `./assets/${key}`)).toBe(`/api/scenarios/dlp-bai/assets/${key}`);
  });

  it('đường dẫn ngoài assets/ bị từ chối — thư mục đó còn chứa script đẩy vào sandbox', () => {
    expect(resolveContentAssetUrl('dlp-bai', './setup/start.sh')).toBeNull();
    expect(resolveContentAssetUrl('dlp-bai', '/etc/passwd')).toBeNull();
  });

  it('id được mã hoá vào URL', () => {
    expect(resolveContentAssetUrl('a b', './assets/x.png')).toBe('/api/scenarios/a%20b/assets/x.png');
  });
});
