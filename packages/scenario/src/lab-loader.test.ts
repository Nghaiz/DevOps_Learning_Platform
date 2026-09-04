import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LabError, loadLab, loadLabs } from './lab-loader.ts';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'dlp-lab-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

interface Fixture {
  id?: string;
  lab?: Record<string, unknown>;
  files?: Record<string, string>;
}

async function makeLab(fixture: Fixture = {}): Promise<string> {
  const id = fixture.id ?? 'demo-lab';
  const dir = path.join(root, id);
  await mkdir(dir, { recursive: true });

  const lab = {
    id,
    title: 'Demo',
    difficulty: 'beginner',
    estimatedMinutes: 10,
    source: null,
    backend: { imageid: 'ubuntu' },
    tasks: [{ id: 'task-a', title: 'Task A' }],
    ...fixture.lab,
  };
  await writeFile(path.join(dir, 'lab.json'), JSON.stringify(lab));

  const files = fixture.files ?? {
    'task-task-a.md': '# Task A\n\n`ls`{{exec}}\n',
    'task-task-a/verify.sh': '#!/bin/bash\nexit 0\n',
  };
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(dir, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return dir;
}

describe('loadLab — đường xanh', () => {
  it('dựng DTO đầy đủ từ thư mục hợp lệ, áp default weight/hint/passThreshold/leaderboard', async () => {
    const lab = await loadLab(await makeLab());
    expect(lab.id).toBe('demo-lab');
    expect(lab.title).toBe('Demo');
    expect(lab.difficulty).toBe('beginner');
    expect(lab.tier).toBe('sysbox');
    expect(lab.capabilities).toEqual([]);
    expect(lab.assets).toEqual([]);
    expect(lab.tasks).toHaveLength(1);
    expect(lab.tasks[0]?.id).toBe('task-a');
    expect(lab.tasks[0]?.markdown).toContain('{{exec}}');
    expect(lab.tasks[0]?.verifyScript).toContain('exit 0');
    expect(lab.tasks[0]?.weight).toBe(1);
    expect(lab.tasks[0]?.hint).toBeNull();
    expect(lab.passThresholdPercent).toBe(100);
    expect(lab.leaderboard).toBe(false);
    expect(lab.setup).toEqual({ foreground: null, background: null });
  });

  it('weight/hint tường minh trong lab.json được giữ nguyên, không bị default đè', async () => {
    const dir = await makeLab({
      lab: {
        tasks: [{ id: 'task-a', title: 'Task A', weight: 5, hint: 'gợi ý' }],
        passThresholdPercent: 60,
        leaderboard: true,
      },
    });
    const lab = await loadLab(dir);
    expect(lab.tasks[0]?.weight).toBe(5);
    expect(lab.tasks[0]?.hint).toBe('gợi ý');
    expect(lab.passThresholdPercent).toBe(60);
    expect(lab.leaderboard).toBe(true);
  });

  it('đọc setup foreground/background theo đường dẫn tường minh', async () => {
    const dir = await makeLab({
      lab: { setup: { foreground: 'setup/foreground.sh', background: 'setup/background.sh' } },
      files: {
        'task-task-a.md': 'x',
        'task-task-a/verify.sh': 'exit 0',
        'setup/foreground.sh': 'echo fg',
        'setup/background.sh': 'echo bg',
      },
    });
    const lab = await loadLab(dir);
    expect(lab.setup.foreground).toContain('echo fg');
    expect(lab.setup.background).toContain('echo bg');
  });

  it('nhiều task, mỗi task đọc đúng markdown/verify theo quy ước tên file của CHÍNH id nó', async () => {
    const dir = await makeLab({
      lab: {
        tasks: [
          { id: 'first', title: 'First' },
          { id: 'second', title: 'Second' },
        ],
      },
      files: {
        'task-first.md': 'nội dung 1',
        'task-first/verify.sh': 'exit 0 # first',
        'task-second.md': 'nội dung 2',
        'task-second/verify.sh': 'exit 1 # second',
      },
    });
    const lab = await loadLab(dir);
    expect(lab.tasks.map((t) => t.id)).toEqual(['first', 'second']);
    expect(lab.tasks[0]?.markdown).toBe('nội dung 1');
    expect(lab.tasks[1]?.markdown).toBe('nội dung 2');
    expect(lab.tasks[0]?.verifyScript).toContain('first');
    expect(lab.tasks[1]?.verifyScript).toContain('second');
  });
});

describe('loadLab — errors-over-fallback', () => {
  it('id trong lab.json khác tên thư mục ⇒ NÉM (id là khoá lab_attempts.lab_id)', async () => {
    const dir = await makeLab({ id: 'thu-muc', lab: { id: 'khac-hoan-toan' } });
    await expect(loadLab(dir)).rejects.toThrow(/lab_attempts\.lab_id/);
  });

  it('lab.json có field lạ ⇒ NÉM, nêu đúng đường dẫn chấm của field đó', async () => {
    const dir = await makeLab({ lab: { somethingNew: true } });
    await expect(loadLab(dir)).rejects.toThrow(/somethingNew/);
  });

  it('task có field lạ ⇒ NÉM, nêu đường dẫn chấm bên trong tasks[]', async () => {
    const dir = await makeLab({
      lab: { tasks: [{ id: 'task-a', title: 'Task A', markdown: 'không được phép ở đây' }] },
    });
    await expect(loadLab(dir)).rejects.toThrow(/tasks\.0\.markdown/);
  });

  it('không có task nào ⇒ NÉM (một lab rỗng là trang trắng có nút Chấm)', async () => {
    const dir = await makeLab({ lab: { tasks: [] } });
    await expect(loadLab(dir)).rejects.toThrow(/tasks/);
  });

  it('hai task cùng id ⇒ NÉM (id đi thẳng vào lab_task_results.task_id)', async () => {
    const dir = await makeLab({
      lab: {
        tasks: [
          { id: 'task-a', title: 'Task A' },
          { id: 'task-a', title: 'Task A trùng' },
        ],
      },
      files: {
        'task-task-a.md': 'x',
        'task-task-a/verify.sh': 'exit 0',
      },
    });
    await expect(loadLab(dir)).rejects.toThrow(/cùng id="task-a"/);
  });

  it('backend.imageid lạ ⇒ NÉM và liệt kê imageid đã biết', async () => {
    const dir = await makeLab({ lab: { backend: { imageid: 'windows-2030' } } });
    await expect(loadLab(dir)).rejects.toThrow(/BACKEND_IMAGE_MAPPING/);
  });

  it('task-<id>.md vắng mặt ⇒ NÉM, nêu rõ task nào', async () => {
    const dir = await makeLab({ files: { 'task-task-a/verify.sh': 'exit 0' } });
    await expect(loadLab(dir)).rejects.toThrow(/task-a.*markdown/);
  });

  it('task-<id>/verify.sh vắng mặt ⇒ NÉM (verifyScript KHÔNG nullable)', async () => {
    const dir = await makeLab({ files: { 'task-task-a.md': 'x' } });
    await expect(loadLab(dir)).rejects.toThrow(/task-a.*verify/);
  });

  it('task-<id>/verify.sh RỖNG (chỉ khoảng trắng) ⇒ NÉM — nó sẽ LUÔN "đạt"', async () => {
    const dir = await makeLab({
      files: { 'task-task-a.md': 'x', 'task-task-a/verify.sh': '   \n\n  ' },
    });
    await expect(loadLab(dir)).rejects.toThrow(/rỗng/);
  });

  it('đường dẫn setup trỏ ra ngoài thư mục lab ⇒ NÉM', async () => {
    const dir = await makeLab({ lab: { setup: { foreground: '../../etc/passwd' } } });
    await expect(loadLab(dir)).rejects.toThrow(/ra ngoài thư mục lab/);
  });

  it('JSON hỏng ⇒ NÉM kèm tên file', async () => {
    const dir = await makeLab();
    await writeFile(path.join(dir, 'lab.json'), '{ khong phai json');
    await expect(loadLab(dir)).rejects.toThrow(/lab\.json không phải JSON hợp lệ/);
  });

  it('lỗi luôn mang tên thư mục để định vị được', async () => {
    const dir = await makeLab({ id: 'bai-hong', files: {} });
    await expect(loadLab(dir)).rejects.toThrow(LabError);
    await expect(loadLab(dir)).rejects.toThrow(/bai-hong/);
  });
});

describe('loadLabs', () => {
  it('nạp nhiều thư mục, sắp xếp theo id', async () => {
    await makeLab({ id: 'bai-b' });
    await makeLab({ id: 'bai-a' });
    const labs = await loadLabs(root);
    expect(labs.map((l) => l.id)).toEqual(['bai-a', 'bai-b']);
  });

  it('MỘT lab hỏng làm hỏng cả mẻ — không bỏ qua trong im lặng', async () => {
    await makeLab({ id: 'bai-tot' });
    await makeLab({ id: 'bai-hong', files: {} });
    await expect(loadLabs(root)).rejects.toThrow(/bai-hong/);
  });
});
