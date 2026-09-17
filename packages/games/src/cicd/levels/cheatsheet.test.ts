import { describe, expect, it } from 'vitest';

import { cheatsheetExample } from '../cheatsheet-example.ts';
import type { CicdCheatSheetEntry, CicdLevel, WorkflowSpec } from '../contract.ts';
import { readWorkflowYaml } from '../yaml-read.ts';
import { writeWorkflowYaml } from '../yaml-write.ts';
import { CI_LEVELS, CICD_LEVELS } from './index.ts';

/**
 * Ô gác `teaching.cheatsheet`: mỗi mục phải DÙNG ĐƯỢC ở đúng chỗ nó chỉ tới.
 *
 * Hai lần lệch đã xảy ra, cả hai im lặng:
 * 1. Cả 14 level dạy `dependsOn:` / `runnerClass:` — tên trường của hợp đồng —
 *    trong khi bộ đọc chỉ nhận từ vựng nhà cung cấp (19.E.bis mục 2).
 * 2. Bản sửa đầu viết chuỗi YAML vào file level, và cổng lõi-trung-lập đỏ 68 chỗ.
 *
 * Nên ví dụ là `WorkflowSpec`, và ô này cho nó đi qua ĐÚNG cặp ghi/đọc mà màn
 * chơi dùng — không so chuỗi, không chép từ vựng nhà cung cấp vào file này.
 */

/** `null` = mục dùng được; chuỗi = vì sao không. */
function loiCua(entry: CicdCheatSheetEntry, level: CicdLevel): string | null {
  if (entry.where === 'cd-panel') {
    return (level.cd?.editable ?? []).includes(entry.control)
      ? null
      : `chỉ tới núm CD "${entry.control}" nhưng level không cho sửa phần đó`;
  }
  if (entry.where === 'panel') {
    return level.editable.includes(entry.control)
      ? null
      : `chỉ tới núm "${entry.control}" nhưng level không cho sửa phần đó`;
  }
  const may = level.workload.runners.map((pool) => pool.id);
  const la = entry.example.stages.filter((stage) => !may.includes(stage.runnerClass));
  if (la.length > 0) {
    return `ví dụ dùng hạng máy level không có: ${la.map((s) => s.runnerClass).join(', ')}`;
  }
  const ghi = writeWorkflowYaml(entry.example);
  if (ghi.dropped.length > 0) {
    // Cheatsheet in ra một thứ khác thứ level khai.
    return `bộ ghi bỏ mất: ${ghi.dropped.map((d) => JSON.stringify(d)).join(', ')}`;
  }
  const doc = readWorkflowYaml(ghi.yaml);
  if (!doc.ok) {
    return `bộ đọc từ chối: ${doc.errors.map((e) => `dòng ${e.line}: ${e.message}`).join(' | ')}`;
  }
  if (doc.ignored.length > 0) {
    return `bộ đọc BỎ QUA: ${doc.ignored.map((k) => k.path).join(', ')}`;
  }
  return null;
}

describe('cheatsheet — mọi mục dùng được ở đúng chỗ nó chỉ tới', () => {
  it.each(CICD_LEVELS.map((level) => ({ level })))('$level.id', ({ level }) => {
    expect(level.teaching.cheatsheet.length).toBeGreaterThan(0);
    const loi = level.teaching.cheatsheet.flatMap((entry, i) => {
      const ly = loiCua(entry, level);
      return ly === null ? [] : [`mục ${i}: ${ly}`];
    });
    expect(loi).toEqual([]);
  });
});

describe('cheatsheet — đối chứng: ô gác ĐỎ đúng ở những dạng hỏng có thể gặp', () => {
  const level = CI_LEVELS[0]!;
  const may = level.workload.runners[0]!.id;
  const yaml = (example: WorkflowSpec): CicdCheatSheetEntry => ({ where: 'yaml', example, explain: 'x' });

  it('ví dụ mang trường YAML không chở được (retries) bị bắt', () => {
    const vd = cheatsheetExample(may, [{ id: 'a', steps: ['b'] }]);
    const coRetries: WorkflowSpec = { ...vd, stages: vd.stages.map((s) => ({ ...s, retries: 2 })) };
    expect(loiCua(yaml(coRetries), level)).toMatch(/bỏ mất/u);
  });

  it('cạnh trỏ vào job không có trong ví dụ bị bắt', () => {
    expect(loiCua(yaml(cheatsheetExample(may, [{ id: 'a', dependsOn: ['khong-co'], steps: ['b'] }])), level)).toMatch(/từ chối/u);
  });

  it('hạng máy level không có bị bắt', () => {
    expect(loiCua(yaml(cheatsheetExample('khong-co-hang-nay', [{ id: 'a', steps: ['b'] }])), level)).toMatch(/hạng máy/u);
  });

  it('núm CD mà level không mở bị bắt — kể cả level không có khối `cd`', () => {
    expect(loiCua({ where: 'cd-panel', control: 'release.canary', label: 'x', explain: 'x' }, level)).not.toBeNull();
  });

  it('núm mà level không hiện bị bắt', () => {
    expect(loiCua({ where: 'panel', control: 'cache', label: 'x', explain: 'x' }, { ...level, editable: [] })).not.toBeNull();
  });

  it('một ví dụ đúng thì qua — ô gác không đỏ với mọi thứ', () => {
    const vd = cheatsheetExample(may, [
      { id: 'clone', kind: 'clone', steps: ['tai-ma'] },
      { id: 'build', dependsOn: ['clone'], nonBlocking: true, steps: [{ id: 'bien-dich', nonBlocking: true }] },
    ]);
    expect(loiCua(yaml(vd), level)).toBeNull();
  });
});
