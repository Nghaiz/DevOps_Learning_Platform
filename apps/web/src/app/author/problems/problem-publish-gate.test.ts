import { describe, expect, it } from 'vitest';
import { toProblemDraft } from './problem-draft';
import { publishIssues } from './problem-validate';
import { exportProblemJson, importProblemJson } from './problem-json';
import { nextKey, validForm } from './problem-test-fixture';

describe('cổng xuất bản', () => {
  it('ĐỐI CHỨNG DƯƠNG — bài hợp lệ không có lỗi nào', () => {
    expect(publishIssues(validForm())).toEqual([]);
  });

  it('chặn khi không có mục tiêu bắt buộc nào', () => {
    const form = validForm();
    const issues = publishIssues({
      ...form,
      objectives: form.objectives.map((objective) => ({ ...objective, required: false })),
    });
    expect(issues.some((issue) => issue.path === 'objectives')).toBe(true);
  });

  it('chặn khi vị từ không có trong bảng tra', () => {
    const form = validForm();
    const issues = publishIssues({
      ...form,
      // Chỉ tới được trạng thái này qua đường NHẬP JSON — ô chọn không cho gõ tay.
      objectives: form.objectives.map((objective) => ({
        ...objective,
        check: 'khong-co-vi-tu-nay' as never,
      })),
    });
    expect(issues.some((issue) => issue.message.includes('không có trong bảng tra'))).toBe(true);
  });

  it('chặn khi đề bài vượt trần 150 từ, và nói phải cắt bao nhiêu', () => {
    const issues = publishIssues({ ...validForm(), statement: 'từ '.repeat(160) });
    const found = issues.find((issue) => issue.path === 'statement');
    expect(found?.message).toContain('Cắt 10 từ');
  });

  it('chặn khi thiếu chủ đề, và khi quá ba chủ đề', () => {
    expect(publishIssues({ ...validForm(), topics: [] }).some((i) => i.path === 'topics')).toBe(true);
    expect(
      publishIssues({
        ...validForm(),
        topics: ['workload', 'networking', 'storage', 'config'],
      }).some((i) => i.path === 'topics'),
    ).toBe(true);
  });

  it('chặn khi tài nguyên trỏ vào namespace chưa khai', () => {
    const form = validForm();
    const issues = publishIssues({
      ...form,
      cluster: {
        ...form.cluster,
        resources: [
          { key: nextKey(), kind: 'Pod', name: 'web', namespace: 'khong-ton-tai', specJson: '{}', seededIncident: '' },
        ],
      },
    });
    expect(issues.some((issue) => issue.message.includes('chưa được khai'))).toBe(true);
  });

  it('chặn khi phần thân tài nguyên không phải JSON đọc được', () => {
    const form = validForm();
    const issues = publishIssues({
      ...form,
      cluster: {
        ...form.cluster,
        resources: [
          { key: nextKey(), kind: 'Pod', name: 'web', namespace: 'default', specJson: '{ hong', seededIncident: '' },
        ],
      },
    });
    expect(issues.some((issue) => issue.path.endsWith('.spec'))).toBe(true);
  });

  it('chặn khi vị từ thiếu tham số bắt buộc', () => {
    const form = validForm();
    const issues = publishIssues({
      ...form,
      objectives: form.objectives.map((objective) => ({ ...objective, args: { name: 'thanh-toan' } })),
    });
    expect(issues.some((issue) => issue.path.endsWith('.args.namespace'))).toBe(true);
  });

  it('chặn khi vị từ "một trong hai" bỏ trống cả hai cách chỉ pod', () => {
    const form = validForm();
    const issues = publishIssues({
      ...form,
      objectives: [
        {
          ...(form.objectives[0] ?? { key: 't', id: 'x', label: 'y', required: true }),
          key: nextKey(),
          check: 'pod-running',
          args: { namespace: 'default' },
        },
      ],
    });
    expect(issues.some((issue) => issue.message.includes('thiếu cả hai'))).toBe(true);
  });
});

describe('chuyển sang payload', () => {
  it('bỏ tham số thừa của vị từ CŨ khi người soạn đổi ô chọn', () => {
    const form = validForm();
    const draft = toProblemDraft({
      ...form,
      objectives: form.objectives.map((objective) => ({
        ...objective,
        args: { ...objective.args, nodeName: 'node-1' },
      })),
    });
    expect(draft.ok).toBe(true);
    if (draft.ok) {
      expect(Object.keys(draft.value.objectives[0]?.args ?? {})).toEqual(['name', 'namespace', 'replicas']);
      expect(draft.value.objectives[0]?.args?.['replicas']).toBe(3);
    }
  });

  it('allowedResources là null khi không bật giới hạn — khác hẳn mảng rỗng', () => {
    const draft = toProblemDraft(validForm());
    expect(draft.ok && draft.value.allowedResources).toBeNull();
  });
});

describe('xuất và nhập JSON', () => {
  it('đi một vòng thì nội dung không đổi', () => {
    const json = exportProblemJson(validForm(), 'K8S-0042');
    const back = importProblemJson(json, nextKey);
    expect(back.ok).toBe(true);
    if (back.ok) {
      const a = toProblemDraft(validForm());
      const b = toProblemDraft(back.form);
      expect(a.ok && b.ok && JSON.stringify(b.value)).toBe(a.ok ? JSON.stringify(a.value) : '');
      expect(back.dropped).toEqual([]);
    }
  });

  it('NÓI RA những giá trị bị bỏ thay vì im lặng đánh rơi', () => {
    const json = JSON.stringify({
      ...JSON.parse(exportProblemJson(validForm(), null)),
      problem: { ...JSON.parse(exportProblemJson(validForm(), null)).problem, topics: ['workload', 'khong-co-that'] },
    });
    const back = importProblemJson(json, nextKey);
    expect(back.ok && back.dropped.length).toBe(1);
  });
});
