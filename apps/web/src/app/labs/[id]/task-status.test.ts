import { describe, expect, it } from 'vitest';
import type { Lab, LabTask, LabTaskResult } from '@devops-platform/shared-types/lab';
import { buildTaskDisplays, uncheckedTaskCount } from './task-status';

function task(over: Partial<LabTask> = {}): LabTask {
  return {
    id: 't1',
    title: 'Task 1',
    markdown: '',
    verifyScript: 'verify.sh',
    weight: 1,
    hint: null,
    ...over,
  };
}

function result(over: Partial<LabTaskResult> = {}): LabTaskResult {
  return {
    taskId: 't1',
    exitCode: 0,
    output: '',
    checkedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('buildTaskDisplays', () => {
  it('task chưa có kết quả nào ⇒ not-attempted', () => {
    const lab: Pick<Lab, 'tasks'> = { tasks: [task({ id: 'a' })] };
    const displays = buildTaskDisplays(lab, []);
    expect(displays).toEqual([
      { task: lab.tasks[0], state: 'not-attempted', lastExitCode: null, lastOutput: null },
    ]);
  });

  it('exitCode 0 ⇒ passed, khác 0 ⇒ failed', () => {
    const lab: Pick<Lab, 'tasks'> = { tasks: [task({ id: 'a' }), task({ id: 'b' })] };
    const displays = buildTaskDisplays(lab, [
      result({ taskId: 'a', exitCode: 0, output: 'ok' }),
      result({ taskId: 'b', exitCode: 1, output: 'boom' }),
    ]);
    expect(displays[0]).toMatchObject({ state: 'passed', lastExitCode: 0, lastOutput: 'ok' });
    expect(displays[1]).toMatchObject({ state: 'failed', lastExitCode: 1, lastOutput: 'boom' });
  });

  it('checkedAt tới dưới dạng chuỗi ISO (tRPC không có transformer) vẫn so sánh đúng, không ném', () => {
    // Router `labs.ts` trả thẳng `row.checkedAt` (Date của drizzle) qua tRPC
    // KHÔNG transformer — giá trị THẬT trình duyệt nhận được là chuỗi ISO, đúng
    // thứ `@trpc/react-query` suy ra ở `useQuery().data` (xem `WireLabTaskResult`
    // trong `task-status.ts`).
    const lab: Pick<Lab, 'tasks'> = { tasks: [task({ id: 'a' })] };
    const wireResult = { ...result({ taskId: 'a', exitCode: 0 }), checkedAt: '2026-01-01T00:00:00.000Z' };
    expect(() => buildTaskDisplays(lab, [wireResult])).not.toThrow();
    expect(buildTaskDisplays(lab, [wireResult])[0]?.state).toBe('passed');
  });

  it('chỉ dòng MỚI NHẤT (checkedAt lớn nhất) quyết định trạng thái — chấm lại đạt sau khi trượt phải thành passed', () => {
    const lab: Pick<Lab, 'tasks'> = { tasks: [task({ id: 'a' })] };
    const displays = buildTaskDisplays(lab, [
      result({ taskId: 'a', exitCode: 1, checkedAt: '2026-01-01T00:00:00.000Z' }),
      result({ taskId: 'a', exitCode: 0, checkedAt: '2026-01-01T00:05:00.000Z' }),
    ]);
    expect(displays[0]?.state).toBe('passed');
  });
});

describe('uncheckedTaskCount', () => {
  it('đếm đúng số task not-attempted', () => {
    const lab: Pick<Lab, 'tasks'> = {
      tasks: [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })],
    };
    const displays = buildTaskDisplays(lab, [result({ taskId: 'a', exitCode: 0 })]);
    expect(uncheckedTaskCount(displays)).toBe(2);
  });

  it('0 khi mọi task đã có ít nhất một lượt chấm', () => {
    const lab: Pick<Lab, 'tasks'> = { tasks: [task({ id: 'a' })] };
    const displays = buildTaskDisplays(lab, [result({ taskId: 'a', exitCode: 1 })]);
    expect(uncheckedTaskCount(displays)).toBe(0);
  });
});
