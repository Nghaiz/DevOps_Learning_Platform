/**
 * Test cho `conflict-markers.ts`.
 *
 * Chiều SINH marker dễ kiểm: so với một mảng chép tay. Chiều ĐỌC LẠI mới là
 * chiều mang rủi ro, nên nó chiếm phần lớn file này — và test vòng tròn
 * `stripResolved(renderConflict(…))` là ô quan trọng nhất: nó khẳng định thứ ta
 * ghi vào worktree đúng là thứ bộ chấm đọc lại được.
 *
 * Hai chiều sai có giá KHÁC HẲN nhau:
 * - bỏ sót marker ⇒ chấm ĐỖ một lời giải còn dở dang (hỏng bộ chấm);
 * - bắt nhầm một dòng thường ⇒ level không bao giờ giải được (hỏng level).
 * Cả hai đều có test ghim ở dưới.
 */

import { describe, expect, it } from 'vitest';
import {
  BASE_LABEL,
  MARKER_BASE,
  MARKER_OURS,
  MARKER_SPLIT,
  MARKER_THEIRS,
  hasConflictMarkers,
  isConflictMarkerLine,
  renderConflict,
  stripResolved,
} from './conflict-markers.ts';
import { merge3 } from './diff3.ts';

describe('renderConflict', () => {
  it('sinh dạng diff3 ĐẦY ĐỦ, có khối tổ tiên chung', () => {
    const result = merge3(
      ['alpha', 'beta', 'gamma'],
      ['alpha', 'OURS', 'gamma'],
      ['alpha', 'THEIRS', 'gamma'],
    );
    expect(renderConflict(result.hunks, 'main', 'feature')).toEqual([
      'alpha',
      '<<<<<<< main',
      'OURS',
      '||||||| base',
      'beta',
      '=======',
      'THEIRS',
      '>>>>>>> feature',
      'gamma',
    ]);
  });

  it('khối base RỖNG khi cả hai phía cùng thêm vào cuối', () => {
    const result = merge3(['a'], ['a', 'X'], ['a', 'Y']);
    expect(renderConflict(result.hunks, 'main', 'feature')).toEqual([
      'a',
      '<<<<<<< main',
      'X',
      '||||||| base',
      '=======',
      'Y',
      '>>>>>>> feature',
    ]);
  });

  it('nhãn rỗng ra marker trần, không để dấu cách thừa', () => {
    const result = merge3(['b'], ['O'], ['T']);
    expect(renderConflict(result.hunks, '', '   ')).toEqual([
      '<<<<<<<',
      'O',
      '||||||| base',
      'b',
      '=======',
      'T',
      '>>>>>>>',
    ]);
  });

  it('merge sạch ⇒ kết quả ĐÚNG BẰNG merged, không marker nào', () => {
    const triples: readonly (readonly [string[], string[], string[]])[] = [
      [
        ['l1', 'l2', 'l3', 'l4', 'l5'],
        ['O1', 'l2', 'l3', 'l4', 'l5'],
        ['l1', 'l2', 'l3', 'l4', 'T5'],
      ],
      [
        ['a', 'b'],
        ['a', 'b', 'NEW'],
        ['a', 'b'],
      ],
      [
        ['a', 'b', 'c'],
        ['a', 'c'],
        ['a', 'b', 'c'],
      ],
      [
        ['a', 'b'],
        ['a', 'b'],
        ['a', 'b'],
      ],
      [[], [], []],
    ];
    for (const [base, ours, theirs] of triples) {
      const result = merge3(base, ours, theirs);
      expect(result.conflicted).toBe(false);
      const rendered = renderConflict(result.hunks, 'main', 'feature');
      expect(rendered).toEqual([...result.merged]);
      expect(hasConflictMarkers(rendered)).toBe(false);
    }
  });

  it('nhiều hunk xung đột ra nhiều khối marker', () => {
    const base = ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
    const ours = ['O0', 'b1', 'b2', 'b3', 'b4', 'b5', 'O6'];
    const theirs = ['T0', 'b1', 'b2', 'b3', 'b4', 'b5', 'T6'];
    const rendered = renderConflict(merge3(base, ours, theirs).hunks, 'main', 'feature');
    expect(rendered.filter((line) => line === MARKER_SPLIT)).toHaveLength(2);
    expect(rendered.filter((line) => line.startsWith(MARKER_OURS))).toHaveLength(2);
    expect(rendered.filter((line) => line.startsWith(MARKER_THEIRS))).toHaveLength(2);
  });
});

describe('isConflictMarkerLine — chiều BẮT ĐƯỢC', () => {
  it('bắt cả bốn marker, có nhãn lẫn không nhãn', () => {
    for (const line of [
      `${MARKER_OURS} main`,
      MARKER_OURS,
      `${MARKER_BASE} ${BASE_LABEL}`,
      MARKER_BASE,
      MARKER_SPLIT,
      `${MARKER_THEIRS} feature`,
      MARKER_THEIRS,
    ]) {
      expect(isConflictMarkerLine(line)).toBe(true);
    }
  });

  it('bắt được dạng RÚT GỌN, thiếu khối tổ tiên chung', () => {
    expect(
      hasConflictMarkers(['a', '<<<<<<< main', 'O', '=======', 'T', '>>>>>>> feature', 'b']),
    ).toBe(true);
  });

  it('bắt được marker LẺ khi người chơi xoá nửa vời', () => {
    expect(hasConflictMarkers(['a', '=======', 'b'])).toBe(true);
    expect(hasConflictMarkers(['a', '>>>>>>> feature'])).toBe(true);
    expect(hasConflictMarkers(['<<<<<<< main', 'a'])).toBe(true);
    expect(hasConflictMarkers(['a', '||||||| base', 'b'])).toBe(true);
  });
});

describe('isConflictMarkerLine — chiều KHÔNG bắt nhầm', () => {
  it('nội dung thường không bị coi là marker', () => {
    for (const line of [
      '',
      'const a = 1;',
      'a < b && c > d',
      'if (x === y) {',
      '# Tiêu đề',
      '<<<<<< sáu dấu',
      '>>>> bốn dấu',
      '=== ba dấu',
    ]) {
      expect(isConflictMarkerLine(line)).toBe(false);
    }
  });

  it('marker phải nằm ở CỘT 0 — thụt lề thì không tính', () => {
    expect(isConflictMarkerLine('  <<<<<<< main')).toBe(false);
    expect(isConflictMarkerLine('\t=======')).toBe(false);
  });

  it('gạch ngang markdown dài không bị coi là marker (đánh đổi đã ghi trong mã)', () => {
    expect(isConflictMarkerLine('========================')).toBe(false);
    expect(isConflictMarkerLine('<<<<<<<<')).toBe(false);
  });

  it('nhưng ĐÚNG bảy dấu bằng THÌ bị coi là marker — dương tính giả đã chấp nhận', () => {
    // Ghim để lựa chọn này hiện ra chứ không nằm ngầm: git thật cũng lẫn y vậy.
    expect(isConflictMarkerLine('=======')).toBe(true);
  });
});

describe('stripResolved', () => {
  it('còn marker ⇒ null', () => {
    const result = merge3(['b'], ['O'], ['T']);
    expect(stripResolved(renderConflict(result.hunks, 'main', 'feature'))).toBeNull();
  });

  it('sạch marker ⇒ trả về CHÍNH mảng đầu vào, không chuẩn hoá gì', () => {
    const lines = ['a', '  b có khoảng trắng đầu  ', ''];
    expect(stripResolved(lines)).toBe(lines);
  });

  it('file rỗng là hợp lệ', () => {
    expect(stripResolved([])).toEqual([]);
  });

  it('chưa giải hết: xoá được hai marker, còn một ⇒ vẫn null', () => {
    expect(stripResolved(['<<<<<<< main', 'O', 'T'])).toBeNull();
  });
});

describe('vòng tròn render ⇄ strip', () => {
  const base = ['mở đầu', 'thân bài', 'kết'];
  const ours = ['mở đầu', 'thân bài của ours', 'kết'];
  const theirs = ['mở đầu', 'thân bài của theirs', 'kết'];

  it('vừa render xong thì CHƯA giải', () => {
    const marked = renderConflict(merge3(base, ours, theirs).hunks, 'main', 'feature');
    expect(hasConflictMarkers(marked)).toBe(true);
    expect(stripResolved(marked)).toBeNull();
  });

  it('người chơi chọn một phía ⇒ trả về đúng nội dung đã chọn', () => {
    const marked = renderConflict(merge3(base, ours, theirs).hunks, 'main', 'feature');
    // Mô phỏng thao tác tay: giữ khối ours, bỏ mọi dòng marker và khối base/theirs.
    const edited = marked.filter(
      (line) =>
        !isConflictMarkerLine(line) && line !== 'thân bài' && line !== 'thân bài của theirs',
    );
    expect(stripResolved(edited)).toEqual(['mở đầu', 'thân bài của ours', 'kết']);
  });

  it('người chơi VIẾT TAY thứ không khớp hunk nào ⇒ vẫn hợp lệ', () => {
    // Đây là lý do `stripResolved` không được đoán ý người chơi: lời giải dưới
    // đây không trùng ours, không trùng theirs, không trùng base — và vẫn đúng.
    const handWritten = ['mở đầu', 'thân bài gộp tay của cả hai phía', 'kết'];
    expect(stripResolved(handWritten)).toEqual(handWritten);
  });

  it('người chơi xoá sạch file ⇒ hợp lệ (không marker nghĩa là đã giải)', () => {
    expect(stripResolved([])).not.toBeNull();
  });

  it('người chơi chỉ xoá dòng =======, để lại phần còn lại ⇒ chưa giải', () => {
    const marked = renderConflict(merge3(base, ours, theirs).hunks, 'main', 'feature');
    const edited = marked.filter((line) => line !== MARKER_SPLIT);
    expect(stripResolved(edited)).toBeNull();
  });
});
