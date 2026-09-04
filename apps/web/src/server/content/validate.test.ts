import { describe, expect, it } from 'vitest';
import type { ContentBodyRow, ContentItemRow } from '@devops-platform/scenario';
import { validateContentBody, validateForPublish } from './validate';

/**
 * Luật 12 — *"Dùng lại ĐÚNG Zod schema của `packages/shared-types`"*. Test này
 * kiểm rằng biên GHI từ chối đúng những gì biên ĐỌC từ chối, kèm TÊN FIELD.
 *
 * > *"Một bài lưu được nhưng chạy hỏng là format thứ hai đang hình thành."*
 */

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
    steps: [
      {
        ordinal: 0,
        taskId: null,
        title: 'Bước 1',
        markdown: '# nội dung',
        setupForeground: null,
        setupBackground: null,
        verifyScript: null,
        weight: null,
        hint: null,
      },
    ],
    intro: null,
    finish: null,
    setup: null,
    assets: [],
    ...over,
  };
}

describe('validateContentBody — lesson', () => {
  it('bài hợp lệ ⇒ không có vấn đề nào', () => {
    expect(validateContentBody('lesson', body())).toEqual([]);
  });

  it('lesson 0 bước bị TỪ CHỐI, kèm tên field', () => {
    // `scenarioSchema.steps` đòi `min(1)`: một bài không có bước nào là một
    // trang trắng. Nháp thì được phép 0 bước — nhưng nháp không đi qua hàm này.
    const issues = validateContentBody('lesson', body({ steps: [] }));
    expect(issues.map((i) => i.path)).toContain('steps');
  });

  it('difficulty lạ bị TỪ CHỐI kèm tên field (ô AC "từ chối kèm tên field")', () => {
    const issues = validateContentBody('lesson', body({ item: item({ difficulty: 'siêu-khó' }) }));
    expect(issues.some((i) => i.path === 'difficulty')).toBe(true);
  });

  it('capability lạ bị TỪ CHỐI, và đường dẫn trỏ đúng phần tử', () => {
    const issues = validateContentBody(
      'lesson',
      body({ item: item({ capabilities: ['docker', 'quantum'] }) }),
    );
    expect(issues.some((i) => i.path.startsWith('capabilities'))).toBe(true);
  });

  it('tier lạ bị TỪ CHỐI', () => {
    const issues = validateContentBody('lesson', body({ item: item({ tier: 'firecracker' }) }));
    expect(issues.some((i) => i.path === 'tier')).toBe(true);
  });
});

describe('validateContentBody — lab', () => {
  function labBody(over: Partial<ContentBodyRow> = {}): ContentBodyRow {
    return body({
      item: item({ kind: 'lab', passThresholdPercent: 80, leaderboard: false }),
      setup: { foreground: null, background: null },
      steps: [
        {
          ordinal: 0,
          taskId: 'tao-pod',
          title: 'Tạo Pod',
          markdown: '# việc',
          setupForeground: null,
          setupBackground: null,
          verifyScript: 'kubectl get pod x',
          weight: 1,
          hint: null,
        },
      ],
      ...over,
    });
  }

  it('lab hợp lệ ⇒ không có vấn đề nào', () => {
    expect(validateContentBody('lab', labBody())).toEqual([]);
  });

  it('task KHÔNG có verifyScript bị TỪ CHỐI — khác lesson', () => {
    // `labTaskSchema.verifyScript` đòi `min(1)`: một task không chấm được luôn
    // ở "chưa đạt" mà không có cách nào đạt.
    const issues = validateContentBody(
      'lab',
      labBody({
        steps: [
          {
            ordinal: 0,
            taskId: 'tao-pod',
            title: 'Tạo Pod',
            markdown: '#',
            setupForeground: null,
            setupBackground: null,
            verifyScript: null,
            weight: 1,
            hint: null,
          },
        ],
      }),
    );
    expect(issues.some((i) => i.path.includes('verifyScript'))).toBe(true);
  });

  it('task thiếu taskId bị TỪ CHỐI — id là ĐỊNH DANH BỀN, không suy từ vị trí', () => {
    const issues = validateContentBody(
      'lab',
      labBody({
        steps: [
          {
            ordinal: 0,
            taskId: null,
            title: 'Tạo Pod',
            markdown: '#',
            setupForeground: null,
            setupBackground: null,
            verifyScript: 'true',
            weight: 1,
            hint: null,
          },
        ],
      }),
    );
    expect(issues.some((i) => i.path.includes('id'))).toBe(true);
  });

  it('thiếu passThresholdPercent bị TỪ CHỐI — không có mốc thì không tính được đạt/trượt', () => {
    const issues = validateContentBody(
      'lab',
      labBody({ item: item({ kind: 'lab', passThresholdPercent: null, leaderboard: false }) }),
    );
    expect(issues.some((i) => i.path === 'passThresholdPercent')).toBe(true);
  });
});

describe('validateContentBody — playground', () => {
  it('ttlSeconds ngoài [300, 7200] bị TỪ CHỐI', () => {
    // Trần 7200 khớp HARD_CAP của orchestrator: một TTL vượt nó là lời hứa mà
    // hạ tầng sẽ phá trong im lặng.
    for (const ttl of [60, 7201]) {
      const issues = validateContentBody(
        'playground',
        body({ item: item({ kind: 'playground', difficulty: null, ttlSeconds: ttl }) }),
      );
      expect(issues.some((i) => i.path === 'ttlSeconds')).toBe(true);
    }
  });

  it('playground hợp lệ KHÔNG cần difficulty', () => {
    const issues = validateContentBody(
      'playground',
      body({ item: item({ kind: 'playground', difficulty: null, ttlSeconds: 1800 }) }),
    );
    expect(issues).toEqual([]);
  });
});

describe('validateForPublish — shellcheck CẢNH BÁO, không chặn', () => {
  it('script bẩn KHÔNG tạo ra issue (chỉ cảnh báo)', async () => {
    const dirty = body({
      steps: [
        {
          ordinal: 0,
          taskId: null,
          title: null,
          // `$foo` chưa quote — `shellcheck` SC2086. Nếu nó CHẶN, ô AC "script
          // bẩn ⇒ cảnh báo, không chặn" đỏ.
          markdown: '#',
          setupForeground: null,
          setupBackground: 'rm -rf $foo',
          verifyScript: null,
          weight: null,
          hint: null,
        },
      ],
    });
    const { issues } = await validateForPublish('lesson', dirty);
    expect(issues).toEqual([]);
  });

  it('script bẩn xuất hiện trong scriptWarnings với ĐƯỜNG DẪN tới đúng ô', async () => {
    const dirty = body({
      steps: [
        {
          ordinal: 0,
          taskId: null,
          title: null,
          markdown: '#',
          setupForeground: null,
          setupBackground: 'rm -rf $foo',
          verifyScript: null,
          weight: null,
          hint: null,
        },
      ],
    });
    const { scriptWarnings } = await validateForPublish('lesson', dirty);

    // Image `apps/web` KHÔNG cài shellcheck, nên trên CI/cụm đường mặc định là
    // `available: false`. Cả hai kết quả đều hợp lệ — điều KHÔNG hợp lệ là im
    // lặng: một script có nội dung phải xuất hiện trong danh sách cảnh báo dù
    // shellcheck chạy được hay không.
    const warning = scriptWarnings.find((w) => w.path === 'steps[0].setup.background');
    expect(warning).toBeDefined();
    if (warning?.report.available === true) {
      expect(warning.report.findings.length).toBeGreaterThan(0);
    } else {
      // "không kiểm được" là một giá trị RIÊNG, không phải "0 cảnh báo".
      expect(warning?.report.unavailableReason).toBeTruthy();
    }
  });

  it('bài không có script nào ⇒ không cảnh báo nào', async () => {
    const { scriptWarnings } = await validateForPublish('lesson', body());
    expect(scriptWarnings).toEqual([]);
  });
});
