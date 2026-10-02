import { describe, expect, it } from 'vitest';

import {
  labForLearnerSchema,
  toLabForLearner,
  type Lab,
  type LabForLearner,
  type LabTask,
  type LabTaskForLearner,
} from './lab.ts';
import {
  scenarioForLearnerSchema,
  toScenarioForLearner,
  type Scenario,
  type ScenarioForLearner,
  type ScenarioStep,
  type StepForLearner,
} from './scenario.ts';

/**
 * Cùng hai lớp với `quiz-dto-leak.test.ts`:
 *
 * - **Compile** — `@ts-expect-error` là khẳng định NGƯỢC. Gỡ `?: never` khỏi kiểu
 *   người học thì phép gán dưới đây hợp lệ, chỉ thị thành thừa, và typecheck gãy:
 *   cổng tự báo khi chính nó bị tháo.
 * - **Runtime** — chuỗi đánh dấu đặt trong mọi script/hint của DTO đầy đủ; nếu
 *   nó xuất hiện ở BẤT KỲ đâu trong JSON gửi đi thì có rò, bất kể field tên gì.
 *   Một phép kiểm "không có key verifyScript" sẽ lặng lẽ xanh khi ai đó đổi tên
 *   field thành `checkScript`.
 */

const SECRET = 'DAP-AN-BI-MAT';

const step: ScenarioStep = {
  index: 0,
  title: 'Bước một',
  markdown: 'Chạy lệnh.',
  setup: { foreground: `echo ${SECRET}-fg`, background: `echo ${SECRET}-bg` },
  verifyScript: `test -f /root/${SECRET}`,
};

const scenario: Scenario = {
  id: 'bai-thu',
  title: 'Bài thử',
  description: null,
  difficulty: 'beginner',
  estimatedMinutes: 10,
  topic: 'linux',
  tier: 'sysbox',
  capabilities: [],
  requiresCapabilities: null,
  backendImageId: 'ubuntu',
  interfaceLayout: null,
  toolset: [],
  assets: [],
  source: null,
  intro: { title: null, markdown: 'Giới thiệu', setup: { foreground: null, background: null }, verifyScript: null },
  finish: null,
  steps: [step, { ...step, index: 1, verifyScript: null, setup: { foreground: null, background: null } }],
  ignoredUpstreamFields: [],
  diagrams: { 'diagrams/a.svg': { svg: '<svg/>', width: 10, height: 5 } },
};

const task: LabTask = {
  id: 'sua-quyen',
  title: 'Sửa quyền',
  markdown: 'File phải thực thi được.',
  verifyScript: `test -x /opt/${SECRET}`,
  weight: 2,
  hint: `chmod +x ${SECRET}`,
};

const lab: Lab = {
  id: 'lab-thu',
  title: 'Lab thử',
  description: null,
  difficulty: 'intermediate',
  estimatedMinutes: 20,
  tier: 'sysbox',
  capabilities: [],
  requiresCapabilities: null,
  backendImageId: 'ubuntu',
  interfaceLayout: null,
  toolset: [],
  assets: [],
  source: null,
  tasks: [task],
  setup: { foreground: `echo ${SECRET}`, background: `touch /opt/${SECRET}` },
  passThresholdPercent: 80,
  leaderboard: false,
};

describe('rào COMPILE', () => {
  it('không gán được bước đầy đủ vào StepForLearner', () => {
    // @ts-expect-error `verifyScript: string | null` không gán được vào `never` — đây LÀ cái rào.
    const leaked: StepForLearner = { ...step, hasVerify: true, hasSetup: true };
    expect(leaked.index).toBe(0);
  });

  it('không gán được task đầy đủ vào LabTaskForLearner', () => {
    // @ts-expect-error `verifyScript`/`hint` không gán được vào `never`.
    const leaked: LabTaskForLearner = task;
    expect(leaked.id).toBe('sua-quyen');
  });

  it('không gán được Lab đầy đủ vào LabForLearner', () => {
    // @ts-expect-error `setup` và `tasks[].verifyScript` bị chặn.
    const leaked: LabForLearner = { ...lab, diagrams: {} };
    expect(leaked.id).toBe('lab-thu');
  });

  it('không gán được Scenario đầy đủ vào ScenarioForLearner', () => {
    // @ts-expect-error `steps[].verifyScript` bị chặn qua kiểu phần tử của mảng.
    const leaked: ScenarioForLearner = { ...scenario, diagrams: {} };
    expect(leaked.id).toBe('bai-thu');
  });
});

describe('rào RUNTIME — chuỗi đánh dấu không đi ra', () => {
  it('toScenarioForLearner không mang script nào, giữ boolean đúng', () => {
    const out = toScenarioForLearner(scenario);
    expect(JSON.stringify(out)).not.toContain(SECRET);
    expect(out.steps.map((s) => [s.hasVerify, s.hasSetup])).toEqual([
      [true, true],
      [false, false],
    ]);
    expect(out.intro).toEqual({ title: null, markdown: 'Giới thiệu', hasVerify: false, hasSetup: false });
    expect(out.topic).toBe('linux');
    expect(out.diagrams).toEqual(scenario.diagrams);
    expect(() => scenarioForLearnerSchema.parse(out)).not.toThrow();
  });

  it('toLabForLearner không mang verify, hint, setup', () => {
    const out = toLabForLearner(lab);
    expect(JSON.stringify(out)).not.toContain(SECRET);
    expect(out.tasks).toEqual([{ id: 'sua-quyen', title: 'Sửa quyền', markdown: 'File phải thực thi được.', weight: 2 }]);
    expect(out.diagrams).toEqual({});
    expect('topic' in out).toBe(false);
    expect(() => labForLearnerSchema.parse(out)).not.toThrow();
  });

  it('schema người học từ chối một field script lọt vào từ ngoài (JSON đã parse)', () => {
    const out = toLabForLearner(lab);
    const tampered = { ...out, tasks: [{ ...out.tasks[0], verifyScript: 'x' }] };
    expect(() => labForLearnerSchema.parse(tampered)).toThrow();
  });
});
