/**
 * Test cho `diff3.ts`.
 *
 * AC-D..H của plan đòi đúng ba nhánh: **không xung đột** / **xung đột một hunk**
 * / **xung đột nhiều hunk chồng nhau**. Ba nhánh đó nằm ở khối đầu tiên bên
 * dưới, đặt tên thẳng theo AC để sau này ai đối chiếu cũng thấy ngay.
 *
 * Phần còn lại là những ca mà một cài đặt diff3 "trông có vẻ đúng" hay làm sai,
 * và mỗi ca sai đều đắt theo một kiểu khác nhau:
 * - cả hai phía đổi GIỐNG HỆT nhau ⇒ xung đột GIẢ (người chơi bị chặn vô cớ);
 * - một phía xoá / phía kia sửa ⇒ nuốt mất bản sửa nếu coi "xoá" là "không đổi";
 * - chèn ở cuối file ⇒ vùng base rộng 0, dễ tính sai chỉ số;
 * - base rỗng ⇒ mọi vòng lặp chạy 0 lần, dễ trả về rỗng ở cả ca hợp lệ.
 */

import { describe, expect, it } from 'vitest';
import type { MergeHunk } from './contract.ts';
import { linesEqual } from './diff.ts';
import { changeRegions, merge3, resolveHunk } from './diff3.ts';

/** Số hunk xung đột. */
function conflictCount(hunks: readonly MergeHunk[]): number {
  return hunks.filter((h) => h.conflicted).length;
}

/**
 * `hunks` phải phủ TOÀN BỘ file và `start` phải khớp độ dài cộng dồn.
 *
 * Đây là bất biến khiến `renderConflict(hunks, …)` dựng lại được nội dung
 * worktree mà không cần `merged`. Vỡ nó là vỡ cả `conflict-markers.ts`.
 */
function expectHunksCoverResult(result: ReturnType<typeof merge3>): void {
  let position = 0;
  const rebuilt: string[] = [];
  for (const hunk of result.hunks) {
    expect(hunk.start).toBe(position);
    const resolved = resolveHunk(hunk.base, hunk.ours, hunk.theirs);
    expect(resolved.conflicted).toBe(hunk.conflicted);
    for (const line of resolved.lines) rebuilt.push(line);
    position += resolved.lines.length;
  }
  expect(rebuilt).toEqual([...result.merged]);
}

describe('merge3 — ba nhánh của AC-D..H', () => {
  it('AC nhánh 1: hai phía sửa hai vùng cách xa nhau ⇒ KHÔNG xung đột', () => {
    const base = ['line1', 'line2', 'line3', 'line4', 'line5', 'line6', 'line7'];
    const ours = ['OURS1', 'line2', 'line3', 'line4', 'line5', 'line6', 'line7'];
    const theirs = ['line1', 'line2', 'line3', 'line4', 'line5', 'line6', 'THEIRS7'];

    const result = merge3(base, ours, theirs);
    expect(result.conflicted).toBe(false);
    expect(result.merged).toEqual([
      'OURS1',
      'line2',
      'line3',
      'line4',
      'line5',
      'line6',
      'THEIRS7',
    ]);
    expect(conflictCount(result.hunks)).toBe(0);
    expectHunksCoverResult(result);
  });

  it('AC nhánh 2: hai phía sửa cùng một dòng ⇒ xung đột ĐÚNG MỘT hunk', () => {
    const base = ['alpha', 'beta', 'gamma'];
    const ours = ['alpha', 'OURS', 'gamma'];
    const theirs = ['alpha', 'THEIRS', 'gamma'];

    const result = merge3(base, ours, theirs);
    expect(result.conflicted).toBe(true);
    expect(conflictCount(result.hunks)).toBe(1);

    const conflict = result.hunks.find((h) => h.conflicted);
    if (conflict === undefined) throw new Error('thiếu hunk xung đột');
    expect(conflict.base).toEqual(['beta']);
    expect(conflict.ours).toEqual(['OURS']);
    expect(conflict.theirs).toEqual(['THEIRS']);
    expect(conflict.start).toBe(1);
    expectHunksCoverResult(result);
  });

  it('AC nhánh 3: nhiều vùng, có vùng trùng có vùng không ⇒ xung đột nhiều hunk', () => {
    const base = ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'b10'];
    // ours đổi 1, 5, 9 — theirs đổi 1, 7, 9. Trùng ở 1 và 9, riêng ở 5 và 7.
    const ours = ['b0', 'o1', 'b2', 'b3', 'b4', 'o5', 'b6', 'b7', 'b8', 'o9', 'b10'];
    const theirs = ['b0', 't1', 'b2', 'b3', 'b4', 'b5', 'b6', 't7', 'b8', 't9', 'b10'];

    const result = merge3(base, ours, theirs);
    expect(result.conflicted).toBe(true);
    expect(conflictCount(result.hunks)).toBe(2);

    const conflicts = result.hunks.filter((h) => h.conflicted);
    expect(conflicts.map((h) => h.base)).toEqual([['b1'], ['b9']]);
    expect(conflicts.map((h) => h.ours)).toEqual([['o1'], ['o9']]);
    expect(conflicts.map((h) => h.theirs)).toEqual([['t1'], ['t9']]);

    // Hai vùng riêng phải tự merge sạch — đây là chỗ "chỉ một phía đổi".
    const clean = result.hunks.filter((h) => !h.conflicted);
    const cleanLines = clean.flatMap((h) => [...resolveHunk(h.base, h.ours, h.theirs).lines]);
    expect(cleanLines).toContain('o5');
    expect(cleanLines).toContain('t7');
    expectHunksCoverResult(result);
  });

  it('AC nhánh 3b: hai vùng CHỒNG LẤN thật sự gộp thành một hunk xung đột', () => {
    const base = ['a', 'b', 'c', 'd', 'e', 'f'];
    const ours = ['a', 'b', 'O1', 'O2', 'e', 'f']; // thay base[2..4)
    const theirs = ['a', 'b', 'c', 'T1', 'T2', 'f']; // thay base[3..5)

    const result = merge3(base, ours, theirs);
    expect(conflictCount(result.hunks)).toBe(1);

    const conflict = result.hunks.find((h) => h.conflicted);
    if (conflict === undefined) throw new Error('thiếu hunk xung đột');
    expect(conflict.base).toEqual(['c', 'd', 'e']);
    expect(conflict.ours).toEqual(['O1', 'O2', 'e']);
    expect(conflict.theirs).toEqual(['c', 'T1', 'T2']);
    expectHunksCoverResult(result);
  });
});

describe('merge3 — luật "chỉ một phía đổi"', () => {
  it('chỉ ours đổi ⇒ lấy ours', () => {
    const result = merge3(['a', 'b'], ['a', 'OURS'], ['a', 'b']);
    expect(result.conflicted).toBe(false);
    expect(result.merged).toEqual(['a', 'OURS']);
  });

  it('chỉ theirs đổi ⇒ lấy theirs', () => {
    const result = merge3(['a', 'b'], ['a', 'b'], ['a', 'THEIRS']);
    expect(result.conflicted).toBe(false);
    expect(result.merged).toEqual(['a', 'THEIRS']);
  });

  it('một phía thêm vào CUỐI file ⇒ merge sạch', () => {
    const result = merge3(['a', 'b'], ['a', 'b', 'NEW'], ['a', 'b']);
    expect(result.conflicted).toBe(false);
    expect(result.merged).toEqual(['a', 'b', 'NEW']);
    expectHunksCoverResult(result);
  });

  it('một phía xoá, phía kia không đụng ⇒ merge sạch', () => {
    const result = merge3(['a', 'b', 'c'], ['a', 'c'], ['a', 'b', 'c']);
    expect(result.conflicted).toBe(false);
    expect(result.merged).toEqual(['a', 'c']);
  });
});

describe('merge3 — luật "hai phía đổi GIỐNG HỆT nhau"', () => {
  it('cùng sửa một dòng thành cùng một thứ ⇒ KHÔNG xung đột', () => {
    const result = merge3(['a', 'sai', 'c'], ['a', 'đúng', 'c'], ['a', 'đúng', 'c']);
    expect(result.conflicted).toBe(false);
    expect(result.merged).toEqual(['a', 'đúng', 'c']);
    expect(conflictCount(result.hunks)).toBe(0);
  });

  it('cùng xoá một dòng ⇒ KHÔNG xung đột', () => {
    const result = merge3(['a', 'b', 'c'], ['a', 'c'], ['a', 'c']);
    expect(result.conflicted).toBe(false);
    expect(result.merged).toEqual(['a', 'c']);
  });

  it('cùng thêm một dòng giống nhau vào cuối ⇒ KHÔNG xung đột', () => {
    const result = merge3(['a'], ['a', 'X'], ['a', 'X']);
    expect(result.conflicted).toBe(false);
    expect(result.merged).toEqual(['a', 'X']);
  });

  it('cả ba phía giống hệt nhau ⇒ một hunk ổn định, không xung đột', () => {
    const result = merge3(['a', 'b'], ['a', 'b'], ['a', 'b']);
    expect(result.conflicted).toBe(false);
    expect(result.merged).toEqual(['a', 'b']);
    expect(result.hunks).toHaveLength(1);
    expect(result.hunks[0]?.conflicted).toBe(false);
  });
});

describe('merge3 — ca xung đột hay bị bỏ sót', () => {
  it('một phía XOÁ, phía kia SỬA cùng dòng ⇒ xung đột', () => {
    const result = merge3(['a', 'b', 'c'], ['a', 'c'], ['a', 'B', 'c']);
    expect(result.conflicted).toBe(true);

    const conflict = result.hunks.find((h) => h.conflicted);
    if (conflict === undefined) throw new Error('thiếu hunk xung đột');
    expect(conflict.base).toEqual(['b']);
    expect(conflict.ours).toEqual([]);
    expect(conflict.theirs).toEqual(['B']);
    expectHunksCoverResult(result);
  });

  it('hai phía cùng thêm dòng KHÁC NHAU vào cuối ⇒ xung đột', () => {
    const result = merge3(['a'], ['a', 'X'], ['a', 'Y']);
    expect(result.conflicted).toBe(true);

    const conflict = result.hunks.find((h) => h.conflicted);
    if (conflict === undefined) throw new Error('thiếu hunk xung đột');
    expect(conflict.base).toEqual([]);
    expect(conflict.ours).toEqual(['X']);
    expect(conflict.theirs).toEqual(['Y']);
  });

  it('hai dòng LIỀN KỀ ⇒ xung đột (luật gộp "chạm cũng gộp", giống git)', () => {
    const result = merge3(['a', 'b', 'c'], ['A', 'b', 'c'], ['a', 'B', 'c']);
    expect(result.conflicted).toBe(true);

    const conflict = result.hunks.find((h) => h.conflicted);
    if (conflict === undefined) throw new Error('thiếu hunk xung đột');
    expect(conflict.base).toEqual(['a', 'b']);
    expect(conflict.ours).toEqual(['A', 'b']);
    expect(conflict.theirs).toEqual(['a', 'B']);
  });

  it('cách nhau đúng MỘT dòng không đổi ⇒ merge sạch (đối chứng của ca trên)', () => {
    const result = merge3(['a', 'b', 'c', 'd'], ['A', 'b', 'c', 'd'], ['a', 'b', 'C', 'd']);
    expect(result.conflicted).toBe(false);
    expect(result.merged).toEqual(['A', 'b', 'C', 'd']);
  });
});

describe('merge3 — biên', () => {
  it('base rỗng, một phía thêm ⇒ lấy phía đó', () => {
    const result = merge3([], ['x'], []);
    expect(result.conflicted).toBe(false);
    expect(result.merged).toEqual(['x']);
  });

  it('base rỗng, hai phía thêm khác nhau ⇒ xung đột', () => {
    const result = merge3([], ['x'], ['y']);
    expect(result.conflicted).toBe(true);
    const conflict = result.hunks.find((h) => h.conflicted);
    if (conflict === undefined) throw new Error('thiếu hunk xung đột');
    expect(conflict.base).toEqual([]);
  });

  it('cả ba rỗng ⇒ kết quả rỗng, không hunk nào', () => {
    const result = merge3([], [], []);
    expect(result.conflicted).toBe(false);
    expect(result.merged).toEqual([]);
    expect(result.hunks).toEqual([]);
  });

  it('file một dòng, hai phía đổi khác nhau ⇒ xung đột', () => {
    const result = merge3(['x'], ['ours'], ['theirs']);
    expect(result.conflicted).toBe(true);
    expect(result.hunks).toHaveLength(1);
    expect(result.hunks[0]?.base).toEqual(['x']);
  });

  it('file một dòng, chỉ một phía đổi ⇒ merge sạch', () => {
    const result = merge3(['x'], ['X'], ['x']);
    expect(result.conflicted).toBe(false);
    expect(result.merged).toEqual(['X']);
  });

  it('xoá sạch một phía, phía kia không đụng ⇒ file rỗng', () => {
    const result = merge3(['a', 'b'], [], ['a', 'b']);
    expect(result.conflicted).toBe(false);
    expect(result.merged).toEqual([]);
  });

  it('dòng trống KHÔNG bị coi là file rỗng', () => {
    const result = merge3([''], ['', 'x'], ['']);
    expect(result.conflicted).toBe(false);
    expect(result.merged).toEqual(['', 'x']);
  });
});

describe('merge3 — tính chất', () => {
  const TRIPLES: readonly (readonly [string, string[], string[], string[]])[] = [
    ['xa nhau', ['a', 'b', 'c', 'd', 'e'], ['A', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'E']],
    ['cùng dòng', ['a', 'b', 'c'], ['a', 'O', 'c'], ['a', 'T', 'c']],
    ['xoá vs sửa', ['a', 'b', 'c'], ['a', 'c'], ['a', 'B', 'c']],
    ['thêm cuối', ['a'], ['a', 'X'], ['a', 'Y']],
    ['base rỗng', [], ['x'], ['y']],
    ['giống hệt', ['a', 'b'], ['a', 'b'], ['a', 'b']],
  ];

  it('xung đột ĐỐI XỨNG: đổi chỗ ours/theirs không đổi verdict', () => {
    for (const [, base, ours, theirs] of TRIPLES) {
      expect(merge3(base, ours, theirs).conflicted).toBe(merge3(base, theirs, ours).conflicted);
    }
  });

  it('hunk phủ toàn bộ kết quả và start khớp độ dài cộng dồn', () => {
    for (const [, base, ours, theirs] of TRIPLES) {
      expectHunksCoverResult(merge3(base, ours, theirs));
    }
  });

  it('không phía nào đổi ⇒ kết quả đúng bằng base', () => {
    for (const [, base] of TRIPLES) {
      const result = merge3(base, base, base);
      expect(result.conflicted).toBe(false);
      expect(result.merged).toEqual(base);
    }
  });

  it('tất định: gọi lại cho cùng kết quả', () => {
    for (const [, base, ours, theirs] of TRIPLES) {
      expect(merge3(base, ours, theirs)).toEqual(merge3(base, ours, theirs));
    }
  });
});

describe('resolveHunk — bốn luật, tách riêng', () => {
  it('ours giống base ⇒ theirs', () => {
    expect(resolveHunk(['b'], ['b'], ['T'])).toEqual({ lines: ['T'], conflicted: false });
  });

  it('theirs giống base ⇒ ours', () => {
    expect(resolveHunk(['b'], ['O'], ['b'])).toEqual({ lines: ['O'], conflicted: false });
  });

  it('hai phía giống hệt nhau ⇒ một bản, không xung đột', () => {
    expect(resolveHunk(['b'], ['X'], ['X'])).toEqual({ lines: ['X'], conflicted: false });
  });

  it('khác nhau cả ba ⇒ xung đột', () => {
    expect(resolveHunk(['b'], ['O'], ['T']).conflicted).toBe(true);
  });

  it('cả ba giống nhau ⇒ chính nó, không xung đột', () => {
    expect(resolveHunk(['b'], ['b'], ['b'])).toEqual({ lines: ['b'], conflicted: false });
  });
});

describe('changeRegions', () => {
  it('không đổi ⇒ không vùng nào', () => {
    expect(changeRegions(['a', 'b'], ['a', 'b'])).toEqual([]);
  });

  it('gộp delete + insert liền nhau thành MỘT vùng', () => {
    expect(changeRegions(['a', 'b', 'c'], ['a', 'X', 'c'])).toEqual([
      { baseStart: 1, baseEnd: 2, sideStart: 1, sideEnd: 2 },
    ]);
  });

  it('chèn thuần ra vùng base rộng 0', () => {
    expect(changeRegions(['a', 'b'], ['a', 'X', 'b'])).toEqual([
      { baseStart: 1, baseEnd: 1, sideStart: 1, sideEnd: 2 },
    ]);
  });

  it('xoá thuần ra vùng side rộng 0', () => {
    expect(changeRegions(['a', 'b', 'c'], ['a', 'c'])).toEqual([
      { baseStart: 1, baseEnd: 2, sideStart: 1, sideEnd: 1 },
    ]);
  });

  it('khoảng GIỮA hai vùng khớp nhau từng dòng — bất biến merge3 dựa vào', () => {
    const base = ['a', 'b', 'c', 'd', 'e'];
    const side = ['a', 'X', 'c', 'd', 'Y', 'Z'];
    let baseCursor = 0;
    let sideCursor = 0;
    for (const region of changeRegions(base, side)) {
      expect(
        linesEqual(
          base.slice(baseCursor, region.baseStart),
          side.slice(sideCursor, region.sideStart),
        ),
      ).toBe(true);
      baseCursor = region.baseEnd;
      sideCursor = region.sideEnd;
    }
    expect(linesEqual(base.slice(baseCursor), side.slice(sideCursor))).toBe(true);
  });

  it('áp các vùng lên base dựng lại đúng side', () => {
    const pairs: readonly (readonly [string[], string[]])[] = [
      [
        ['a', 'b', 'c', 'd', 'e'],
        ['a', 'X', 'c', 'd', 'Y', 'Z'],
      ],
      [
        ['a', 'b'],
        ['a', 'b'],
      ],
      [[], ['x']],
      [['x'], []],
      [
        ['a', 'b', 'c'],
        ['c', 'b', 'a'],
      ],
    ];
    for (const [base, side] of pairs) {
      const out: string[] = [];
      let cursor = 0;
      for (const region of changeRegions(base, side)) {
        for (const line of base.slice(cursor, region.baseStart)) out.push(line);
        for (const line of side.slice(region.sideStart, region.sideEnd)) out.push(line);
        cursor = region.baseEnd;
      }
      for (const line of base.slice(cursor)) out.push(line);
      expect(out).toEqual(side);
    }
  });
});
