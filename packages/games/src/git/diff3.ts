/**
 * Merge **ba ngả diff3** theo dòng.
 *
 * Đây là hạng mục đắt nhất của cả game Git và là chỗ đáng giá nhất: design §3.1
 * đo được **0 file** nhắc merge conflict trong Learn Git Branching, và plan §7
 * ghi thẳng rằng nếu trượt tiến độ thì cắt SỐ LƯỢNG LEVEL, **cơ chế conflict ở
 * 17.G không cắt**.
 *
 * ⛔ Ràng buộc chung của `git/`: không `node:*`, không DOM, không React, không
 * `Date.now()`, không `Math.random()`. Mọi hàm ở đây thuần và không đụng
 * `GitWorld` hay `ObjectStore` — tầng engine mới nối chúng lại.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THUẬT TOÁN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. Diff `base → ours` và `base → theirs` (hai lần `diffLines`), quy mỗi diff
 *    về một danh sách **vùng thay đổi** trên toạ độ của `base`.
 * 2. Gộp hai danh sách thành các **vùng hợp nhất**: hai vùng thuộc cùng một khối
 *    khi chúng chồng nhau HOẶC chạm nhau.
 * 3. Quét xuôi. Phần giữa hai vùng hợp nhất là vùng **ổn định** — cả ba phía
 *    giống hệt nhau ở đó, chép thẳng. Mỗi vùng hợp nhất giải theo bốn luật của
 *    diff3 (xem `resolveHunk`).
 *
 * **VÌ SAO "CHẠM NHAU" CŨNG GỘP.** Đây là luật của chính git (`xdl_merge` coi
 * hai vùng là tách rời chỉ khi giữa chúng còn **ít nhất một dòng base không
 * đổi**), và nó là lý do hai người cùng thêm một dòng vào CUỐI file thì xung
 * đột — ca xung đột quen thuộc nhất của đời thực, và là ca `merge3` phải tái
 * hiện đúng. Hệ quả đi kèm: hai phía sửa hai dòng LIỀN KỀ cũng xung đột. Đó là
 * lựa chọn có chủ ý và được ghim bằng test (`diff3.test.ts`, "hai dòng liền
 * kề"); nới nó ra là đổi hành vi của mọi level chương 2, nên đừng đổi lặng lẽ.
 *
 * ⚠ Vùng ổn định CŨNG được phát ra thành `MergeHunk` (với `base === ours ===
 * theirs`, `conflicted: false`). Không phải để cho vui: `renderConflict` chỉ
 * nhận `hunks`, nên `hunks` phải phủ **toàn bộ** file thì mới dựng lại được nội
 * dung worktree. Giao diện 17.O lọc `h.conflicted` khi cần danh sách hunk để
 * người chơi chọn.
 */

import type { Lines, MergeHunk } from './contract.ts';
import { diffLines, linesEqual } from './diff.ts';

/**
 * Kết quả merge ba ngả.
 *
 * ⚠ `merged` CHỈ CÓ NGHĨA khi `conflicted === false`. Khi có xung đột, nó mang
 * lời giải "ours thắng" (đúng thứ `git merge -X ours` cho ra) để `MergeHunk.start`
 * có một hệ quy chiếu xác định — **không phải** nội dung để ghi vào worktree.
 * Nội dung worktree lúc xung đột là `renderConflict(hunks, …)` của
 * `conflict-markers.ts`.
 *
 * Đường dùng đúng, và là đường duy nhất:
 *
 * ```ts
 * const r = merge3(base, ours, theirs);
 * worktree[path] = r.conflicted ? renderConflict(r.hunks, oursLabel, theirsLabel) : r.merged;
 * ```
 */
export interface Diff3Result {
  /** Kết quả khi KHÔNG xung đột. Xem cảnh báo ở trên cho ca xung đột. */
  readonly merged: Lines;
  /** Phủ toàn bộ file, cả vùng ổn định lẫn vùng thay đổi, theo đúng thứ tự. */
  readonly hunks: readonly MergeHunk[];
  readonly conflicted: boolean;
}

/**
 * Một vùng `base[baseStart..baseEnd)` được một phía thay bằng
 * `side[sideStart..sideEnd)`. Nửa mở hai đầu; độ rộng 0 nghĩa là chèn thuần.
 */
export interface ChangeRegion {
  readonly baseStart: number;
  readonly baseEnd: number;
  readonly sideStart: number;
  readonly sideEnd: number;
}

/**
 * Quy diff `base → side` về danh sách vùng thay đổi trên toạ độ `base`.
 *
 * Các thao tác không-`equal` liền nhau được gộp thành MỘT vùng: một dòng bị
 * "sửa" hiện ra trong `diffLines` dưới dạng `delete` rồi `insert`, và coi chúng
 * là hai vùng riêng sẽ đẻ ra ranh giới hunk giả.
 *
 * Xuất ra ngoài vì nó là bước trung gian đáng kiểm riêng — và vì tầng engine
 * cần cùng khái niệm này cho `git rebase` (áp từng vùng lên một base khác).
 */
export function changeRegions(base: Lines, side: Lines): readonly ChangeRegion[] {
  const out: ChangeRegion[] = [];
  let baseIndex = 0;
  let sideIndex = 0;
  let draft: { baseStart: number; baseEnd: number; sideStart: number; sideEnd: number } | null =
    null;

  for (const op of diffLines(base, side)) {
    const count = op.lines.length;
    if (op.kind === 'equal') {
      if (draft !== null) {
        out.push(draft);
        draft = null;
      }
      baseIndex += count;
      sideIndex += count;
      continue;
    }
    draft ??= {
      baseStart: baseIndex,
      baseEnd: baseIndex,
      sideStart: sideIndex,
      sideEnd: sideIndex,
    };
    if (op.kind === 'delete') {
      baseIndex += count;
      draft.baseEnd = baseIndex;
    } else {
      sideIndex += count;
      draft.sideEnd = sideIndex;
    }
  }
  if (draft !== null) out.push(draft);
  return out;
}

/** Vùng hợp nhất trên toạ độ `base`, kèm độ lệch độ dài mà mỗi phía gây ra. */
interface CombinedRegion {
  baseStart: number;
  baseEnd: number;
  /** `(số dòng ours) - (số dòng base)` cộng dồn trong vùng này. */
  oursDelta: number;
  theirsDelta: number;
}

function combineRegions(
  oursRegions: readonly ChangeRegion[],
  theirsRegions: readonly ChangeRegion[],
): readonly CombinedRegion[] {
  const tagged: { region: ChangeRegion; isOurs: boolean }[] = [];
  for (const region of oursRegions) tagged.push({ region, isOurs: true });
  for (const region of theirsRegions) tagged.push({ region, isOurs: false });

  // Thứ tự sắp xếp là TOÀN PHẦN (không có hai phần tử nào "bằng nhau" theo
  // comparator này), nên kết quả không phụ thuộc vào tính ổn định của
  // `Array.sort` ở từng máy ảo JS. Đó là điều kiện tất định — xem
  // `deterministic.ts` để hiểu vì sao chỗ này không được đoán.
  tagged.sort((x, y) => {
    if (x.region.baseStart !== y.region.baseStart) return x.region.baseStart - y.region.baseStart;
    if (x.region.baseEnd !== y.region.baseEnd) return x.region.baseEnd - y.region.baseEnd;
    if (x.isOurs === y.isOurs) return 0;
    return x.isOurs ? -1 : 1;
  });

  const out: CombinedRegion[] = [];
  for (const { region, isOurs } of tagged) {
    const delta = region.sideEnd - region.sideStart - (region.baseEnd - region.baseStart);
    const current = out[out.length - 1];
    // `<=` chứ không `<`: chạm nhau cũng gộp. Xem giải thích ở đầu file — đây
    // là chỗ quyết định "hai người cùng append vào cuối file" có xung đột không.
    if (current !== undefined && region.baseStart <= current.baseEnd) {
      if (region.baseEnd > current.baseEnd) current.baseEnd = region.baseEnd;
      if (isOurs) current.oursDelta += delta;
      else current.theirsDelta += delta;
    } else {
      out.push({
        baseStart: region.baseStart,
        baseEnd: region.baseEnd,
        oursDelta: isOurs ? delta : 0,
        theirsDelta: isOurs ? 0 : delta,
      });
    }
  }
  return out;
}

/** Lời giải cho một vùng ba ngả. */
export interface HunkResolution {
  readonly lines: Lines;
  readonly conflicted: boolean;
}

/**
 * Bốn luật của diff3, theo đúng thứ tự này.
 *
 * 1. `ours` giống `base` ⇒ chỉ `theirs` đổi ⇒ lấy `theirs`.
 *    (Trường hợp cả ba giống nhau cũng rơi vào đây và trả về đúng `base`.)
 * 2. `theirs` giống `base` ⇒ chỉ `ours` đổi ⇒ lấy `ours`.
 *    Luật 1 và 2 là chỗ merge "tự động thành công", tức phần lớn merge đời thực.
 * 3. Hai phía đổi **giống hệt nhau** ⇒ lấy một bản, **KHÔNG xung đột**. Luật này
 *    hay bị bỏ sót và bỏ nó là đẻ ra xung đột GIẢ — hai người cùng sửa một dòng
 *    thành cùng một thứ (ví dụ cùng sửa một lỗi chính tả) phải merge sạch.
 * 4. Còn lại ⇒ xung đột.
 *
 * ⚠ Ca xung đột trả `lines: ours` — xem cảnh báo ở `Diff3Result.merged`. Đó là
 * hệ quy chiếu của `MergeHunk.start`, không phải một lời giải được ngầm chọn.
 */
export function resolveHunk(base: Lines, ours: Lines, theirs: Lines): HunkResolution {
  if (linesEqual(ours, base)) return { lines: theirs, conflicted: false };
  if (linesEqual(theirs, base)) return { lines: ours, conflicted: false };
  if (linesEqual(ours, theirs)) return { lines: ours, conflicted: false };
  return { lines: ours, conflicted: true };
}

/**
 * Merge ba ngả `base` / `ours` / `theirs`.
 *
 * `ours` là phía HEAD, `theirs` là phía đang được trộn vào — đúng quy ước của
 * hợp đồng (`MergeHunk`) và của git.
 */
export function merge3(base: Lines, ours: Lines, theirs: Lines): Diff3Result {
  const groups = combineRegions(changeRegions(base, ours), changeRegions(base, theirs));

  const hunks: MergeHunk[] = [];
  const merged: string[] = [];
  let conflicted = false;

  // Bất biến của vòng quét: tại mọi ranh giới vùng, dòng base thứ `baseIndex`
  // ứng đúng với dòng ours thứ `oursIndex` và dòng theirs thứ `theirsIndex`.
  // Giữ được là nhờ luật gộp "chạm cũng gộp" ở trên: sau khi gộp tới điểm bất
  // động, hai đầu của mỗi vùng hợp nhất chắc chắn là dòng KHÔNG đổi ở cả hai
  // phía (hoặc là biên file), nên ba con trỏ cùng tiến một lượng bằng nhau qua
  // mỗi vùng ổn định.
  let baseIndex = 0;
  let oursIndex = 0;
  let theirsIndex = 0;
  let resultPos = 0;

  const emitStable = (upTo: number): void => {
    const length = upTo - baseIndex;
    if (length <= 0) return;
    const segment = base.slice(baseIndex, upTo);
    hunks.push({
      start: resultPos,
      base: segment,
      ours: segment,
      theirs: segment,
      conflicted: false,
    });
    for (const line of segment) merged.push(line);
    resultPos += length;
    baseIndex = upTo;
    oursIndex += length;
    theirsIndex += length;
  };

  for (const group of groups) {
    emitStable(group.baseStart);

    const baseLength = group.baseEnd - group.baseStart;
    const oursEnd = oursIndex + baseLength + group.oursDelta;
    const theirsEnd = theirsIndex + baseLength + group.theirsDelta;

    const baseSegment = base.slice(group.baseStart, group.baseEnd);
    const oursSegment = ours.slice(oursIndex, oursEnd);
    const theirsSegment = theirs.slice(theirsIndex, theirsEnd);

    const resolution = resolveHunk(baseSegment, oursSegment, theirsSegment);
    hunks.push({
      start: resultPos,
      base: baseSegment,
      ours: oursSegment,
      theirs: theirsSegment,
      conflicted: resolution.conflicted,
    });
    for (const line of resolution.lines) merged.push(line);
    resultPos += resolution.lines.length;
    if (resolution.conflicted) conflicted = true;

    baseIndex = group.baseEnd;
    oursIndex = oursEnd;
    theirsIndex = theirsEnd;
  }
  emitStable(base.length);

  return { merged, hunks, conflicted };
}
