import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseContentBlocks } from './content-blocks.ts';
import { loadLabs } from './lab-loader.ts';
import { loadPlaygrounds } from './playground-loader.ts';

/**
 * Ô AC 8.A/8.E: nội dung THẬT dưới `content/labs/` và `content/playgrounds/`
 * nạp được, không lỗi, và verify script của mỗi task THẬT SỰ kiểm được gì đó —
 * cùng tinh thần `content-scenarios.test.ts`, đặc biệt là bài học đã rút ra ở
 * đó: `prolug` từng có ba `verify.sh` đều `/bin/true` (luôn "đạt", không kiểm
 * gì) — bộ test dưới đây tồn tại để một khiếm khuyết y hệt không lọt qua ở lab.
 */
const LABS_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', 'content', 'labs');
const PLAYGROUNDS_ROOT = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'content',
  'playgrounds',
);

const labs = await loadLabs(LABS_ROOT);
const playgrounds = await loadPlaygrounds(PLAYGROUNDS_ROOT);

describe('content/labs — parse kho thật', () => {
  it('nạp được ≥1 lab, không lỗi', () => {
    expect(labs.length).toBeGreaterThanOrEqual(1);
  });

  it('mọi lab có ≥1 task, id task duy nhất, markdown và verifyScript không rỗng', () => {
    for (const lab of labs) {
      expect(lab.tasks.length, lab.id).toBeGreaterThan(0);
      expect(new Set(lab.tasks.map((t) => t.id)).size, lab.id).toBe(lab.tasks.length);
      for (const task of lab.tasks) {
        expect(task.markdown.trim(), `${lab.id} task ${task.id}`).not.toBe('');
        expect(task.verifyScript.trim(), `${lab.id} task ${task.id}`).not.toBe('');
      }
    }
  });

  it('lab first-party (source: null) không cần khai gì thêm — assets luôn rỗng (§ lab.ts)', () => {
    for (const lab of labs.filter((l) => l.source === null)) {
      expect(lab.assets, lab.id).toEqual([]);
    }
  });

  it('markdown của mọi task parse được thành block, không có verb lạ', () => {
    for (const lab of labs) {
      for (const task of lab.tasks) {
        expect(
          () => parseContentBlocks(task.markdown),
          `${lab.id} task ${task.id}`,
        ).not.toThrow();
      }
    }
  });

  it('ít nhất một lab mang nút bấm-để-chạy ({{exec}})', () => {
    const execCounts = labs.map((lab) => ({
      id: lab.id,
      count: lab.tasks
        .flatMap((task) => parseContentBlocks(task.markdown))
        .filter((block) => block.kind === 'code' && block.action !== 'none').length,
    }));
    expect(
      execCounts.some((entry) => entry.count > 0),
      JSON.stringify(execCounts),
    ).toBe(true);
  });
});

/**
 * Chất lượng của chính verify script — KHÔNG phải phép kiểm về parser. Đây là
 * cổng chặn đúng khiếm khuyết `prolug` đã mắc: một script luôn thoát mã 0 thì
 * "đạt" vô điều kiện, và không AC "pass/fail đúng" nào đóng được trên nội dung
 * như vậy.
 */
describe('content/labs — verify script có thật sự kiểm gì không', () => {
  const isNoOp = (script: string): boolean =>
    script
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
      .every((line) => line === '/bin/true' || line === 'true' || line === 'exit 0');

  it('KHÔNG task nào trong bộ nội dung thật dùng verify no-op', () => {
    for (const lab of labs) {
      for (const task of lab.tasks) {
        expect(isNoOp(task.verifyScript), `${lab.id} task ${task.id}`).toBe(false);
      }
    }
  });

  it('mọi verify.sh dùng `set -uo pipefail`, KHÔNG `set -e`', () => {
    // `set -e` làm một script THĂM DÒ (kiểm rồi in thông báo) thoát ngay ở lệnh
    // kiểm đầu tiên thất bại, trước khi kịp in lý do cho người học — xem
    // `docs/lab-format.md` § "verify.sh không dùng set -e".
    for (const lab of labs) {
      for (const task of lab.tasks) {
        expect(task.verifyScript, `${lab.id} task ${task.id}`).toContain('set -uo pipefail');
        expect(task.verifyScript, `${lab.id} task ${task.id}`).not.toMatch(/^set -e\b/m);
      }
    }
  });
});

describe('content/playgrounds — parse kho thật', () => {
  it('nạp được ≥1 playground, không lỗi', () => {
    expect(playgrounds.length).toBeGreaterThanOrEqual(1);
  });

  it('mọi playground có ttlSeconds trong [300, 7200] và imageid đã biết', () => {
    for (const playground of playgrounds) {
      expect(playground.ttlSeconds, playground.id).toBeGreaterThanOrEqual(300);
      expect(playground.ttlSeconds, playground.id).toBeLessThanOrEqual(7200);
      expect(playground.backendImageId, playground.id).toBeTruthy();
    }
  });

  it('id duy nhất trên toàn bộ kho', () => {
    const ids = playgrounds.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
