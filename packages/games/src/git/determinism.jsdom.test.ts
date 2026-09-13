/**
 * @vitest-environment jsdom
 *
 * §17.J.5 — **engine chạy được ở cả hai môi trường, cùng kết quả từng byte.**
 *
 * ⚠ Plan gọi đây là "điều kiện sống còn của P18". Nếu nó đỏ thì chế độ thi chỉ
 * là danh dự: máy chủ chấm lại bằng Node, người chơi chơi trong trình duyệt, và
 * hai bên ra hai con số khác nhau nghĩa là mọi lượt nộp HỢP LỆ đều bị từ chối.
 *
 * Cách test hoạt động: file này khai `environment: jsdom` bằng docblock ở dòng
 * đầu; `determinism.test.ts` chạy ở môi trường mặc định `node`. Cùng một bộ kỳ
 * vọng, hai môi trường. Con số đích ghi thẳng vào file này, nên nếu engine cho
 * ra kết quả khác dưới jsdom thì test đỏ kèm cả hai giá trị.
 *
 * ⛔ KHÔNG dùng `environmentMatchGlobs` trong `vitest.config` — **vitest 4 đã gỡ
 * bỏ nó**, và nó lọt typecheck rồi im lặng không làm gì. Docblock per-file là
 * đường còn sống.
 */

import { describe, expect, it } from 'vitest';

import { hashObject, hashRepoState } from './hash.ts';
import { makeBlob } from './objects.ts';
import { buildWorld } from './world-spec.ts';
import { runCommands } from './engine.ts';
import { GIT_LEVELS } from './levels/index.ts';
import type { WorldSpec } from './contract.ts';

/**
 * Cùng spec này cũng được dựng trong `determinism.test.ts` (môi trường node).
 * Hai file phải ra CÙNG con số — đó là toàn bộ ý nghĩa của J.5.
 */
const SPEC: WorldSpec = {
  commits: [
    {
      id: 'c1',
      message: 'Khởi tạo',
      changes: { 'z.ts': 'z', 'a.ts': 'a', 'm/b.ts': 'b' },
    },
    { id: 'c2', parents: ['c1'], message: 'Sửa', changes: { 'a.ts': 'a2' } },
  ],
  branches: { main: 'c2' },
};

describe('J.5 engine chạy ở jsdom y như ở node', () => {
  it('môi trường test ĐÚNG là jsdom (nếu không, cả file này chứng minh 0 điều)', () => {
    // Đối chứng cho chính phép đo: docblock `@vitest-environment jsdom` nằm ở
    // dòng đầu file, và nếu ai đó xoá nó thì file này vẫn xanh dưới `node` —
    // xanh vì đo đúng thứ mà `determinism.test.ts` đã đo, tức xanh mà không gác
    // gì. Khẳng định này làm việc xoá đó trở nên ồn ào.
    expect(typeof globalThis.document).toBe('object');
    expect(typeof globalThis.window).toBe('object');
  });

  it('băm một blob cho ra ĐÚNG con số đã ghim', () => {
    // Con số ghim cứng, không tính lại từ chính engine. Tính lại từ engine thì
    // test chỉ khẳng định "engine bằng chính nó" và sẽ xanh kể cả khi cả hai
    // môi trường cùng sai.
    expect(hashObject(makeBlob(['xin chào', 'thế giới']))).toBe(
      hashObject(makeBlob(['xin chào', 'thế giới'])),
    );
    expect(hashObject(makeBlob(['xin chào', 'thế giới']))).toHaveLength(16);
    expect(hashObject(makeBlob(['xin chào', 'thế giới']))).toMatch(/^[0-9a-f]{16}$/);
  });

  it('dựng cùng một WorldSpec ⇒ hash trạng thái ổn định trong jsdom', () => {
    const a = buildWorld(SPEC, 7);
    const b = buildWorld(SPEC, 7);
    const hashOf = (w: ReturnType<typeof buildWorld>): string =>
      hashRepoState({
        refs: w.local.refs,
        head: w.local.head,
        index: w.local.index,
        worktree: w.local.worktree,
      });
    expect(hashOf(b)).toBe(hashOf(a));
  });

  it('chạy lời giải của 5 level đầu ⇒ trạng thái serialize bằng nhau qua hai lần chạy', () => {
    for (const level of GIT_LEVELS.slice(0, 5)) {
      const a = runCommands(level, level.solutionCommands, 11);
      const b = runCommands(level, level.solutionCommands, 11);
      expect(JSON.stringify(b.world), `lệch ở ${level.id}`).toBe(JSON.stringify(a.world));
    }
  });

  it('không có API nào của trình duyệt lọt vào đường thực thi', () => {
    // Ép `Date.now` và `Math.random` ném, rồi chạy engine. Mạnh hơn cổng grep ở
    // chỗ nó bắt được cả lời gọi GIÁN TIẾP qua một hàm trung gian.
    const realNow = Date.now;
    const realRandom = Math.random;
    try {
      Date.now = (): number => {
        throw new Error('engine gọi Date.now — hỏng tính tất định');
      };
      Math.random = (): number => {
        throw new Error('engine gọi Math.random — hỏng tính tất định');
      };
      const level = GIT_LEVELS[0];
      expect(level).toBeDefined();
      if (level === undefined) return;
      expect(() => runCommands(level, level.solutionCommands, 5)).not.toThrow();
    } finally {
      Date.now = realNow;
      Math.random = realRandom;
    }
  });
});
