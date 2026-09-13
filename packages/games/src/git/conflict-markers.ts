/**
 * Sinh và ĐỌC LẠI marker conflict.
 *
 * Hai chiều, và chiều đọc lại mới là chiều khó: người chơi được phép sửa tay nội
 * dung file thành **bất cứ thứ gì**, kể cả thứ không khớp hunk nào. Mọi hàm ở
 * đây vì thế không giả định người chơi chỉ bấm "chọn một phía".
 *
 * ⛔ Ràng buộc chung của `git/`: không `node:*`, không DOM, không React, không
 * `Date.now()`, không `Math.random()`. Hàm thuần, không đụng `GitWorld`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO DÙNG DẠNG diff3 ĐẦY ĐỦ (có khối `|||||||`)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Git mặc định in dạng RÚT GỌN (chỉ `<<<<<<<` / `=======` / `>>>>>>>`), giấu
 * mất tổ tiên chung. Game này in dạng đầy đủ vì đó là thứ **dạy được**: nhìn
 * thấy `base` thì người học mới hiểu vì sao git không đoán được — nó có ba bản
 * và hai bản sau mâu thuẫn nhau so với bản đầu. Giấu `base` đi thì conflict chỉ
 * còn là "hai đoạn chữ lạ", và bài học biến mất.
 *
 * Nhưng `hasConflictMarkers` vẫn phải nhận ra dạng rút gọn: người chơi hoàn toàn
 * có thể xoá nửa vời, để lại đúng một dòng `=======` hay một `>>>>>>>` lạc.
 */

import type { Lines, MergeHunk } from './contract.ts';
import { resolveHunk } from './diff3.ts';

/** Mở khối `ours`. Bảy ký tự, giống git. */
export const MARKER_OURS = '<<<<<<<';
/** Mở khối tổ tiên chung — chỉ có ở dạng diff3 đầy đủ. */
export const MARKER_BASE = '|||||||';
/** Ngăn giữa `base` (hoặc `ours`) và `theirs`. */
export const MARKER_SPLIT = '=======';
/** Đóng khối `theirs`. */
export const MARKER_THEIRS = '>>>>>>>';

/** Nhãn đứng sau `|||||||`. Cố định vì hợp đồng chỉ mang nhãn của hai phía. */
export const BASE_LABEL = 'base';

/**
 * Dựng nội dung worktree cho một file đang merge.
 *
 * `hunks` phải phủ TOÀN BỘ file — `merge3` phát ra cả vùng ổn định đúng vì lý do
 * này. Hunk không xung đột được giải lại bằng `resolveHunk`, tức cùng một luật
 * với `merge3`: không có bản sao thứ hai của logic merge ở đây.
 *
 * Nhãn rỗng (hoặc chỉ có khoảng trắng) thì in marker trần, không để lại dấu cách
 * thừa ở cuối dòng.
 */
export function renderConflict(
  hunks: readonly MergeHunk[],
  oursLabel: string,
  theirsLabel: string,
): Lines {
  const out: string[] = [];
  for (const hunk of hunks) {
    if (!hunk.conflicted) {
      for (const line of resolveHunk(hunk.base, hunk.ours, hunk.theirs).lines) out.push(line);
      continue;
    }
    out.push(withLabel(MARKER_OURS, oursLabel));
    for (const line of hunk.ours) out.push(line);
    out.push(withLabel(MARKER_BASE, BASE_LABEL));
    for (const line of hunk.base) out.push(line);
    out.push(MARKER_SPLIT);
    for (const line of hunk.theirs) out.push(line);
    out.push(withLabel(MARKER_THEIRS, theirsLabel));
  }
  return out;
}

function withLabel(marker: string, label: string): string {
  const trimmed = label.trim();
  return trimmed === '' ? marker : `${marker} ${trimmed}`;
}

/**
 * Một dòng có phải marker conflict không.
 *
 * LUẬT: đúng bảy ký tự marker, rồi hết dòng hoặc một dấu cách — đúng thứ git
 * dựng và đúng thứ git dò lại. Cả bốn marker đều tính, nên dạng rút gọn (thiếu
 * khối `|||||||`) vẫn bị bắt.
 *
 * ⚠ ĐÁNH ĐỔI ĐÃ CÂN NHẮC. Luật chặt này cho một dương tính giả: một dòng
 * markdown đúng bảy dấu `=` (gạch chân tiêu đề setext) bị đọc là marker. Chấp
 * nhận, vì git thật cũng lẫn y như vậy. Chiều ngược lại thì KHÔNG chấp nhận
 * được: nới luật để bắt cả `========================` sẽ làm một level có gạch
 * ngang markdown trong file đích **không bao giờ giải được** — vị từ
 * `noConflictMarkers` đỏ vĩnh viễn mà không ai hiểu vì sao.
 */
export function isConflictMarkerLine(line: string): boolean {
  return (
    startsWithMarker(line, MARKER_OURS) ||
    startsWithMarker(line, MARKER_BASE) ||
    startsWithMarker(line, MARKER_SPLIT) ||
    startsWithMarker(line, MARKER_THEIRS)
  );
}

function startsWithMarker(line: string, marker: string): boolean {
  if (!line.startsWith(marker)) return false;
  // `charAt` trả chuỗi rỗng khi vượt độ dài, không `undefined` — nên không cần
  // guard `noUncheckedIndexedAccess` ở đây.
  return line.length === marker.length || line.charAt(marker.length) === ' ';
}

/**
 * File còn marker conflict nào không.
 *
 * Vị từ chấm bài `noConflictMarkers` gọi thẳng hàm này.
 */
export function hasConflictMarkers(lines: Lines): boolean {
  return lines.some(isConflictMarkerLine);
}

/**
 * Nội dung file sau khi người chơi giải conflict, hoặc `null` nếu chưa giải.
 *
 * ⚠ CỐ Ý KHÔNG tự giải hộ. Người chơi được sửa tay thành bất cứ thứ gì — gộp
 * tay hai phía, viết lại cả đoạn, xoá sạch — và mọi kết quả không còn marker đều
 * hợp lệ. Hàm này chỉ trả lời một câu: *"đã sạch marker chưa?"*. Cố đoán ý người
 * chơi (kiểu "chắc bạn ấy chọn ours") là đúng loại fallback im lặng mà
 * `development-principles.md` cấm — và nó sẽ chấm đỗ một lời giải dở dang.
 *
 * Trả về chính mảng đầu vào khi sạch: không sao chép, không chuẩn hoá, không cắt
 * khoảng trắng.
 */
export function stripResolved(lines: Lines): Lines | null {
  return hasConflictMarkers(lines) ? null : lines;
}
