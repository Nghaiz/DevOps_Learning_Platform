import { describe, expect, it } from 'vitest';

import type { CicdCheatSheetEntry, CicdLevel } from '../contract.ts';
import { readWorkflowYaml } from '../yaml-read.ts';
import { CI_LEVELS } from './index.ts';

/**
 * Ô gác `teaching.cheatsheet`: mỗi mục phải DÙNG ĐƯỢC ở đúng chỗ nó chỉ tới.
 *
 * Tồn tại vì lần lệch trước im lặng trọn vẹn: cả 14 level dạy `dependsOn:` /
 * `runnerClass:` — tên trường của hợp đồng — trong khi bộ đọc chỉ nhận `needs:` /
 * `runs-on:`. Người chơi chép vào ô soạn sẽ nhận lỗi quét và tin là mình gõ sai.
 * Không test nào đỏ, vì không test nào CHẠY bộ đọc trên cheatsheet (19.E.bis mục 2).
 *
 * Ô này chạy chính `readWorkflowYaml`, không so chuỗi.
 */

/** `null` = mục dùng được; chuỗi = vì sao không. */
function loiCua(entry: CicdCheatSheetEntry, level: CicdLevel): string | null {
  if (entry.where === 'panel') {
    return level.editable.includes(entry.control)
      ? null
      : `chỉ tới núm "${entry.control}" nhưng level không cho sửa phần đó`;
  }
  const doc = readWorkflowYaml(entry.snippet);
  if (!doc.ok) {
    return `bộ đọc từ chối: ${doc.errors.map((e) => `dòng ${e.line}: ${e.message}`).join(' | ')}`;
  }
  if (doc.ignored.length > 0) {
    // Dạy một khoá mà game bỏ qua là dạy người chơi chờ một hiệu ứng không tới.
    return `bộ đọc BỎ QUA: ${doc.ignored.map((k) => k.path).join(', ')}`;
  }
  return null;
}

describe('cheatsheet — mọi mục dùng được ở đúng chỗ nó chỉ tới', () => {
  it.each(CI_LEVELS.map((level) => ({ level })))('$level.id', ({ level }) => {
    expect(level.teaching.cheatsheet.length).toBeGreaterThan(0);
    const loi = level.teaching.cheatsheet.flatMap((entry, i) => {
      const ly = loiCua(entry, level);
      return ly === null ? [] : [`mục ${i}: ${ly}`];
    });
    expect(loi).toEqual([]);
  });
});

describe('cheatsheet — đối chứng: ô gác ĐỎ đúng ở hai dạng hỏng đã gặp', () => {
  const level = CI_LEVELS[0]!;

  it('từ vựng hợp đồng (`dependsOn`) bị bắt', () => {
    const cu: CicdCheatSheetEntry = {
      where: 'yaml',
      snippet: 'jobs:\n  build:\n    dependsOn:\n      - clone\n    steps: []\n',
      explain: 'x',
    };
    expect(loiCua(cu, level)).toMatch(/BỎ QUA|từ chối/u);
  });

  it('mẩu trơ trọi không có khoá cha bị bắt', () => {
    expect(loiCua({ where: 'yaml', snippet: 'needs: [clone]', explain: 'x' }, level)).not.toBeNull();
  });

  it('núm mà level không hiện bị bắt', () => {
    const khongCo = level.editable.includes('retries') ? 'cache' : 'retries';
    expect(
      loiCua({ where: 'panel', control: khongCo, label: 'x', explain: 'x' }, { ...level, editable: [] }),
    ).not.toBeNull();
  });

  it('một tài liệu đúng từ vựng thì qua — ô gác không đỏ với mọi thứ', () => {
    const dung: CicdCheatSheetEntry = {
      where: 'yaml',
      snippet: 'jobs:\n  clone:\n    steps: []\n  build:\n    needs:\n      - clone\n    steps: []\n',
      explain: 'x',
    };
    expect(loiCua(dung, level)).toBeNull();
  });
});
