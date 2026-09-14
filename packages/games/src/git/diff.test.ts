/**
 * Test cho `diff.ts`.
 *
 * Bất biến mạnh nhất mà một diff tự chứng minh được là **dựng lại hai đầu**:
 * `equal + delete` phải ra đúng `a`, `equal + insert` phải ra đúng `b`. Một test
 * chỉ so kịch bản với một mảng chép tay thì chứng minh được rất ít — nó xanh với
 * mọi cách phá hoà, kể cả cách sai. Nên ở đây có cả hai tầng: bất biến dựng lại
 * chạy trên một bảng ca, và vài ca ghim kịch bản CHÍNH XÁC ở chỗ thứ tự thao tác
 * là hợp đồng (diff3 đọc nó).
 */

import { describe, expect, it } from 'vitest';
import type { Lines } from './contract.ts';
import {
  DIFF_MAX_CORE_LINES,
  diffHunks,
  diffLines,
  formatHunkHeader,
  formatUnifiedDiff,
  linesEqual,
  type DiffOp,
} from './diff.ts';

/** Ghép lại phía cũ (`equal` + `delete`) hoặc phía mới (`equal` + `insert`). */
function applyOps(ops: readonly DiffOp[], side: 'old' | 'new'): Lines {
  const out: string[] = [];
  for (const op of ops) {
    const take =
      op.kind === 'equal' ||
      (op.kind === 'delete' && side === 'old') ||
      (op.kind === 'insert' && side === 'new');
    if (!take) continue;
    for (const line of op.lines) out.push(line);
  }
  return out;
}

const CASES: readonly (readonly [string, Lines, Lines])[] = [
  ['hai file rỗng', [], []],
  ['giống hệt nhau', ['a', 'b', 'c'], ['a', 'b', 'c']],
  ['thêm vào file rỗng', [], ['x', 'y']],
  ['xoá sạch', ['x', 'y'], []],
  ['sửa một dòng giữa', ['a', 'b', 'c'], ['a', 'x', 'c']],
  ['chèn một dòng giữa', ['a', 'b', 'c'], ['a', 'x', 'b', 'c']],
  ['xoá một dòng giữa', ['a', 'b', 'c'], ['a', 'c']],
  ['thêm vào cuối', ['a'], ['a', 'b', 'c']],
  ['thêm vào đầu', ['a'], ['x', 'a']],
  ['đảo thứ tự', ['a', 'b'], ['b', 'a']],
  ['không có dòng nào chung', ['a', 'b', 'c'], ['x', 'y', 'z']],
  ['file một dòng đổi nội dung', ['a'], ['b']],
  ['dòng trống khác file rỗng', [''], []],
  ['dòng lặp lại', ['x', 'x', 'x'], ['x', 'x']],
  ['tiếng Việt có dấu', ['một', 'hai', 'ba'], ['một', 'HAI', 'ba']],
];

describe('diffLines — bất biến dựng lại', () => {
  for (const [name, a, b] of CASES) {
    it(`dựng lại được cả hai phía: ${name}`, () => {
      const ops = diffLines(a, b);
      expect(applyOps(ops, 'old')).toEqual([...a]);
      expect(applyOps(ops, 'new')).toEqual([...b]);
    });
  }

  it('không bao giờ có hai thao tác cùng loại đứng cạnh nhau', () => {
    for (const [, a, b] of CASES) {
      const kinds = diffLines(a, b).map((op) => op.kind);
      for (let i = 1; i < kinds.length; i++) {
        expect(kinds[i]).not.toBe(kinds[i - 1]);
      }
    }
  });

  it('không bao giờ phát ra thao tác rỗng', () => {
    for (const [, a, b] of CASES) {
      for (const op of diffLines(a, b)) expect(op.lines.length).toBeGreaterThan(0);
    }
  });

  it('tất định: gọi lại cho cùng kết quả', () => {
    for (const [, a, b] of CASES) {
      expect(diffLines(a, b)).toEqual(diffLines(a, b));
    }
  });
});

describe('diffLines — kịch bản chính xác', () => {
  it('hai file giống hệt nhau ra đúng một thao tác equal', () => {
    expect(diffLines(['a', 'b'], ['a', 'b'])).toEqual([{ kind: 'equal', lines: ['a', 'b'] }]);
  });

  it('hai file rỗng ra kịch bản rỗng', () => {
    expect(diffLines([], [])).toEqual([]);
  });

  it('sửa một dòng ra delete TRƯỚC insert — diff3 dựa vào thứ tự này', () => {
    expect(diffLines(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([
      { kind: 'equal', lines: ['a'] },
      { kind: 'delete', lines: ['b'] },
      { kind: 'insert', lines: ['x'] },
      { kind: 'equal', lines: ['c'] },
    ]);
  });

  it('chèn thuần không sinh delete', () => {
    expect(diffLines(['a', 'c'], ['a', 'b', 'c'])).toEqual([
      { kind: 'equal', lines: ['a'] },
      { kind: 'insert', lines: ['b'] },
      { kind: 'equal', lines: ['c'] },
    ]);
  });

  it('giữ được dòng chung ở giữa hai vùng đổi', () => {
    const ops = diffLines(['a', 'keep', 'b'], ['x', 'keep', 'y']);
    const equalLines = ops.filter((op) => op.kind === 'equal').flatMap((op) => [...op.lines]);
    expect(equalLines).toEqual(['keep']);
  });
});

describe('diffLines — trần cứng', () => {
  /** Hai mảng `size` dòng khác nhau hoàn toàn, trừ đúng một dòng chung ở giữa. */
  function pair(size: number): readonly [Lines, Lines] {
    const a: string[] = [];
    const b: string[] = [];
    const shared = Math.floor(size / 2);
    for (let i = 0; i < size; i++) {
      a.push(i === shared ? 'chung' : `a-${i}`);
      b.push(i === shared ? 'chung' : `b-${i}`);
    }
    return [a, b];
  }

  it(`ngay tại trần (${DIFF_MAX_CORE_LINES} dòng) vẫn chạy LCS thật — đối chứng dương`, () => {
    const [a, b] = pair(DIFF_MAX_CORE_LINES);
    const ops = diffLines(a, b);
    expect(ops.some((op) => op.kind === 'equal')).toBe(true);
    expect(applyOps(ops, 'old')).toEqual([...a]);
    expect(applyOps(ops, 'new')).toEqual([...b]);
  });

  it('vượt trần thì thay cả phần lõi, không treo', () => {
    const [a, b] = pair(DIFF_MAX_CORE_LINES + 1);
    const ops = diffLines(a, b);
    expect(ops.map((op) => op.kind)).toEqual(['delete', 'insert']);
    // Vẫn phải dựng lại đúng hai đầu — thô nhưng không được sai.
    expect(applyOps(ops, 'old')).toEqual([...a]);
    expect(applyOps(ops, 'new')).toEqual([...b]);
  });

  it('trần đo trên LÕI: file rất dài sửa một dòng vẫn được diff tử tế', () => {
    const a: string[] = [];
    for (let i = 0; i < DIFF_MAX_CORE_LINES * 3; i++) a.push(`dòng ${i}`);
    const b = [...a];
    b[1000] = 'đã sửa';
    const ops = diffLines(a, b);
    expect(ops.map((op) => op.kind)).toEqual(['equal', 'delete', 'insert', 'equal']);
  });
});

describe('linesEqual', () => {
  it('so từng phần tử', () => {
    expect(linesEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(linesEqual(['a', 'b'], ['a', 'c'])).toBe(false);
    expect(linesEqual(['a'], ['a', 'b'])).toBe(false);
    expect(linesEqual([], [])).toBe(true);
  });

  it('file rỗng khác file có đúng một dòng trống', () => {
    expect(linesEqual([], [''])).toBe(false);
  });
});

describe('diffHunks + formatHunkHeader', () => {
  it('file không đổi ra mảng hunk rỗng', () => {
    expect(diffHunks(['a', 'b'], ['a', 'b'])).toEqual([]);
    expect(formatUnifiedDiff(['a', 'b'], ['a', 'b'])).toEqual([]);
  });

  it('đầu hunk đúng cú pháp git: @@ -1,3 +1,4 @@', () => {
    const hunks = diffHunks(['a', 'b', 'c'], ['a', 'x', 'b', 'c']);
    expect(hunks).toHaveLength(1);
    const hunk = hunks[0];
    if (hunk === undefined) throw new Error('thiếu hunk');
    expect(formatHunkHeader(hunk)).toBe('@@ -1,3 +1,4 @@');
  });

  it('số lượng bằng 1 thì bỏ hẳn phần ,1', () => {
    const hunks = diffHunks(['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'X', 'd', 'e'], 0);
    expect(hunks).toHaveLength(1);
    const hunk = hunks[0];
    if (hunk === undefined) throw new Error('thiếu hunk');
    expect(formatHunkHeader(hunk)).toBe('@@ -3 +3 @@');
  });

  it('số lượng bằng 0 in vị trí 0-based, không cộng một', () => {
    const hunks = diffHunks([], ['x', 'y']);
    expect(hunks).toHaveLength(1);
    const hunk = hunks[0];
    if (hunk === undefined) throw new Error('thiếu hunk');
    expect(formatHunkHeader(hunk)).toBe('@@ -0,0 +1,2 @@');
  });

  it('vị trí trong cấu trúc dữ liệu đếm từ 0, chỉ lúc IN mới thành 1-based', () => {
    const hunks = diffHunks(['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'X', 'd', 'e'], 0);
    const hunk = hunks[0];
    if (hunk === undefined) throw new Error('thiếu hunk');
    expect(hunk.oldStart).toBe(2);
    expect(hunk.newStart).toBe(2);
    expect(hunk.oldCount).toBe(1);
    expect(hunk.newCount).toBe(1);
  });

  it('hai vùng đổi cách xa nhau ra hai hunk', () => {
    const a: string[] = [];
    for (let i = 0; i < 20; i++) a.push(`L${i}`);
    const b = [...a];
    b[0] = 'X0';
    b[19] = 'X19';
    expect(diffHunks(a, b, 3)).toHaveLength(2);
  });

  it('hai vùng đổi gần nhau gộp thành một hunk', () => {
    const a: string[] = [];
    for (let i = 0; i < 10; i++) a.push(`L${i}`);
    const b = [...a];
    b[0] = 'X0';
    b[4] = 'X4';
    expect(diffHunks(a, b, 3)).toHaveLength(1);
  });

  it('thân diff in ra đúng dấu từng dòng', () => {
    expect(formatUnifiedDiff(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([
      '@@ -1,3 +1,3 @@',
      ' a',
      '-b',
      '+x',
      ' c',
    ]);
  });
});
