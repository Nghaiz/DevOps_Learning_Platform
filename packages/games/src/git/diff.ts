/**
 * Diff **hai ngả theo dòng** — nền của `diff3.ts` và của `git diff` in ra màn hình.
 *
 * Đây là lane 17.G phần diff3. Lý do nó tồn tại riêng: design doc §3.1 đo trực
 * tiếp trên mã nguồn Learn Git Branching và đếm được **0 file** nhắc merge
 * conflict — LGB *không thể* có, vì mô hình của nó là `workingChanges: {path →
 * status}`, không có nội dung file. Nội dung file theo DÒNG (`Lines`) là quyết
 * định mô hình #1 của design §3.2, và diff theo dòng là thứ đầu tiên nó mở ra.
 *
 * ⛔ RÀNG BUỘC (giống mọi file dưới `git/`):
 * - Không `import` `node:*`, không DOM, không React. `tsconfig` của package cố ý
 *   bỏ `types: ["node"]`.
 * - Không `Date.now()`, không `Math.random()`. Cổng grep §17.J.2 gác việc này và
 *   nó có đối chứng dương.
 * - Mọi hàm ở đây **thuần**: cùng đầu vào ⇒ cùng đầu ra, không trạng thái ngoài.
 *
 * ℹ️ Không file nào ở đây lặp trên một `Record`, nên không có `import` nào từ
 * `deterministic.ts`. Đó là chủ ý, không phải bỏ sót: dữ liệu của module này là
 * MẢNG dòng, mà mảng đã có thứ tự sẵn. Ngày nào có một `Record` lọt vào đây thì
 * `sortedEntries()` là đường bắt buộc.
 */

import type { Lines } from './contract.ts';

/**
 * Một thao tác trong kịch bản biến `a` thành `b`.
 *
 * Ghép theo thứ tự: `equal` + `delete` lấy lại đúng `a`; `equal` + `insert` lấy
 * lại đúng `b`. Test `diff.test.ts` khẳng định cả hai chiều — đó là bất biến
 * mạnh nhất mà một diff có thể tự chứng minh.
 *
 * Các thao tác **cùng loại liền nhau luôn được gộp**: không bao giờ có hai
 * `equal` đứng cạnh nhau. `diff3.ts` dựa vào tính chất này để gom vùng thay đổi.
 */
export type DiffOp =
  | { readonly kind: 'equal'; readonly lines: Lines }
  | { readonly kind: 'insert'; readonly lines: Lines }
  | { readonly kind: 'delete'; readonly lines: Lines };

/**
 * Trần cứng cho phần LÕI (đã cắt tiền tố/hậu tố chung) của mỗi phía.
 *
 * VÌ SAO CÓ TRẦN. LCS bằng quy hoạch động tốn O(n·m) **bộ nhớ**, không chỉ thời
 * gian. Ở mức 2000×2000 bảng là 2001² ô `Uint32Array` ≈ **16 MB** — chấp nhận
 * được cho một tab trình duyệt, và chỉ cấp phát khi thật sự chạm ngưỡng đó.
 * Không có trần thì một file dán nhầm 50k dòng làm tab treo im lặng: không lỗi,
 * không thông báo, chỉ là đứng hình. File trong game là nội dung bài học, vài
 * chục dòng, nên trần này không bao giờ chạm tới trong lúc chơi bình thường.
 *
 * KHI VƯỢT TRẦN, hàm trả về "thay cả phần lõi": `delete` toàn bộ lõi `a` rồi
 * `insert` toàn bộ lõi `b`. Vẫn đúng (ghép lại vẫn ra `b`), chỉ là thô. Lưu ý
 * trần đo trên **lõi** chứ không trên độ dài thô: một file 50k dòng sửa đúng một
 * dòng có lõi bằng 1 và vẫn được diff tử tế.
 */
export const DIFF_MAX_CORE_LINES = 2000;

/** Số dòng ngữ cảnh mặc định quanh mỗi hunk, giống `git diff` thật. */
export const DIFF_DEFAULT_CONTEXT = 3;

/**
 * Hai mảng dòng bằng nhau từng phần tử.
 *
 * Để ở đây (chứ không trong `diff3.ts`) vì nó là phép so sánh chung trên `Lines`
 * và các lane khác cũng cần — `worktreeFileEquals` của bộ chấm là cùng một phép.
 * SSOT: đừng viết lại vòng lặp này ở chỗ khác.
 */
export function linesEqual(a: Lines, b: Lines): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Diff hai ngả theo dòng, dùng LCS quy hoạch động.
 *
 * THUẬT TOÁN: cắt tiền tố chung và hậu tố chung trước (rẻ, và làm bảng DP nhỏ đi
 * rất nhiều trong ca phổ biến nhất — sửa vài dòng giữa một file dài), rồi chạy
 * LCS trên phần lõi còn lại.
 *
 * TẤT ĐỊNH: bảng DP dựng theo công thức **hậu tố** và lần ngược đi tới với quy
 * tắc phá hoà cố định (`delete` trước `insert` khi hai hướng bằng điểm). Cùng
 * đầu vào luôn ra cùng một kịch bản, ở mọi trình duyệt và ở Node. Thứ tự
 * `delete` trước `insert` cũng chính là thứ tự `git diff` in ra (`-` rồi `+`).
 */
export function diffLines(a: Lines, b: Lines): readonly DiffOp[] {
  const n = a.length;
  const m = b.length;

  let lo = 0;
  while (lo < n && lo < m && a[lo] === b[lo]) lo++;

  let hiA = n;
  let hiB = m;
  while (hiA > lo && hiB > lo && a[hiA - 1] === b[hiB - 1]) {
    hiA--;
    hiB--;
  }

  const ops: DiffOp[] = [];
  if (lo > 0) ops.push({ kind: 'equal', lines: a.slice(0, lo) });

  const coreA = a.slice(lo, hiA);
  const coreB = b.slice(lo, hiB);
  if (coreA.length > DIFF_MAX_CORE_LINES || coreB.length > DIFF_MAX_CORE_LINES) {
    if (coreA.length > 0) ops.push({ kind: 'delete', lines: coreA });
    if (coreB.length > 0) ops.push({ kind: 'insert', lines: coreB });
  } else {
    pushCoreOps(ops, coreA, coreB);
  }

  if (hiA < n) ops.push({ kind: 'equal', lines: a.slice(hiA) });
  return ops;
}

/**
 * LCS trên phần lõi, đẩy thẳng vào `out` dưới dạng các run đã gộp.
 *
 * Không bao giờ phát ra `equal` ở đầu hay cuối lõi — theo cách cắt ở
 * `diffLines`, `coreA[0] !== coreB[0]` và `coreA[cuối] !== coreB[cuối]` khi cả
 * hai không rỗng. Nhờ đó `ops` của `diffLines` chắc chắn không có hai `equal`
 * đứng cạnh nhau.
 */
function pushCoreOps(out: DiffOp[], a: Lines, b: Lines): void {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return;
  if (n === 0) {
    out.push({ kind: 'insert', lines: b });
    return;
  }
  if (m === 0) {
    out.push({ kind: 'delete', lines: a });
    return;
  }

  // dp[i][j] = độ dài LCS của a[i..] và b[j..]. Công thức HẬU TỐ để lần ngược
  // chạy xuôi từ (0,0), tức ra kịch bản đúng thứ tự file mà không phải đảo mảng.
  // Hàng/cột biên để nguyên 0 (Uint32Array khởi tạo bằng 0) nên `at()` luôn đọc
  // được ô hợp lệ.
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  // `?? 0` ở đây là nhiễu kiểu, không phải fallback che lỗi: `noUncheckedIndexedAccess`
  // coi mọi truy cập chỉ số là `number | undefined`, còn mọi lời gọi dưới đây
  // đều nằm trong bảng. Giá trị 0 cũng đúng về mặt toán học cho ô ngoài bảng
  // (LCS của hai hậu tố rỗng bằng 0), nên không có nhánh nào đọc ra số sai.
  const at = (i: number, j: number): number => dp[i * width + j] ?? 0;

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i * width + j] = at(i + 1, j + 1) + 1;
      } else {
        const down = at(i + 1, j);
        const right = at(i, j + 1);
        dp[i * width + j] = down >= right ? down : right;
      }
    }
  }

  let runKind: DiffOp['kind'] | null = null;
  let runLines: string[] = [];
  const flush = (): void => {
    if (runKind !== null && runLines.length > 0) out.push({ kind: runKind, lines: runLines });
    runLines = [];
  };
  const push = (kind: DiffOp['kind'], lines: Lines): void => {
    if (lines.length === 0) return;
    if (runKind !== kind) {
      flush();
      runKind = kind;
    }
    for (const line of lines) runLines.push(line);
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('equal', a.slice(i, i + 1));
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      // Phá hoà cố định: `>=` ưu tiên xoá trước chèn. Đổi dấu này là đổi kịch
      // bản của MỌI diff, tức đổi ranh giới hunk của diff3 — không phải chuyện
      // thẩm mỹ.
      push('delete', a.slice(i, i + 1));
      i++;
    } else {
      push('insert', b.slice(j, j + 1));
      j++;
    }
  }
  push('delete', a.slice(i));
  push('insert', b.slice(j));
  flush();
}

// ═══════════════════════════════════════════════════════════════════════════
// Dạng hiển thị cho `git diff`
// ═══════════════════════════════════════════════════════════════════════════

/** Một dòng trong hunk. `' '` ngữ cảnh, `'-'` phía cũ, `'+'` phía mới. */
export interface DiffHunkLine {
  readonly sign: ' ' | '-' | '+';
  readonly text: string;
}

/**
 * Một hunk hiển thị, đủ để in ra đầu `@@`.
 *
 * ⚠ `oldStart`/`newStart` đếm từ **0**, giống `MergeHunk.start` của hợp đồng.
 * Quy ước 1-based của git chỉ xuất hiện lúc IN RA, trong `formatHunkHeader`.
 * Trộn hai quy ước trong cùng một cấu trúc dữ liệu là cách chắc chắn nhất để
 * đẻ ra lỗi lệch một đơn vị ở lane khác.
 */
export interface DiffHunk {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly lines: readonly DiffHunkLine[];
}

interface FlatLine {
  readonly sign: ' ' | '-' | '+';
  readonly text: string;
  readonly oldPos: number;
  readonly newPos: number;
}

/**
 * Gom diff thành các hunk có ngữ cảnh, giống `git diff -U<context>`.
 *
 * Hai vùng thay đổi được gộp vào MỘT hunk khi số dòng không đổi giữa chúng
 * `<= 2 * context` — đúng luật của git, vì khi đó hai vùng ngữ cảnh chạm nhau
 * và tách ra sẽ in lặp dòng.
 *
 * Không có thay đổi nào ⇒ mảng rỗng (`git diff` im lặng khi file không đổi).
 */
export function diffHunks(
  a: Lines,
  b: Lines,
  context: number = DIFF_DEFAULT_CONTEXT,
): readonly DiffHunk[] {
  const flat = flatten(diffLines(a, b));
  const changed: number[] = [];
  for (let i = 0; i < flat.length; i++) {
    const entry = flat[i];
    if (entry !== undefined && entry.sign !== ' ') changed.push(i);
  }
  if (changed.length === 0) return [];

  const ctx = context < 0 ? 0 : context;
  const groups: { first: number; last: number }[] = [];
  for (const idx of changed) {
    const current = groups[groups.length - 1];
    if (current !== undefined && idx - current.last - 1 <= 2 * ctx) {
      current.last = idx;
    } else {
      groups.push({ first: idx, last: idx });
    }
  }

  const hunks: DiffHunk[] = [];
  for (const group of groups) {
    const start = Math.max(0, group.first - ctx);
    const end = Math.min(flat.length - 1, group.last + ctx);
    const head = flat[start];
    if (head === undefined) continue; // không thể xảy ra: start < flat.length
    const lines: DiffHunkLine[] = [];
    let oldCount = 0;
    let newCount = 0;
    for (let i = start; i <= end; i++) {
      const entry = flat[i];
      if (entry === undefined) continue; // không thể xảy ra: i <= end < flat.length
      lines.push({ sign: entry.sign, text: entry.text });
      if (entry.sign !== '+') oldCount++;
      if (entry.sign !== '-') newCount++;
    }
    hunks.push({
      oldStart: head.oldPos,
      oldCount,
      newStart: head.newPos,
      newCount,
      lines,
    });
  }
  return hunks;
}

/** Trải kịch bản diff ra từng dòng, kèm vị trí ở cả hai phía. */
function flatten(ops: readonly DiffOp[]): readonly FlatLine[] {
  const flat: FlatLine[] = [];
  let oldPos = 0;
  let newPos = 0;
  for (const op of ops) {
    for (const text of op.lines) {
      if (op.kind === 'equal') {
        flat.push({ sign: ' ', text, oldPos, newPos });
        oldPos++;
        newPos++;
      } else if (op.kind === 'delete') {
        flat.push({ sign: '-', text, oldPos, newPos });
        oldPos++;
      } else {
        flat.push({ sign: '+', text, oldPos, newPos });
        newPos++;
      }
    }
  }
  return flat;
}

/**
 * Đầu hunk đúng cú pháp git: `@@ -1,3 +1,4 @@`.
 *
 * Hai chi tiết của git mà người ta hay làm sai, và cả hai đều nhìn thấy được
 * trên màn hình nên làm sai là lộ:
 * - **Số lượng bằng 0** in vị trí 0-based chứ không +1. Thêm nội dung vào một
 *   file rỗng ra `@@ -0,0 +1,2 @@`, không phải `-1,0`.
 * - **Số lượng bằng 1** bỏ hẳn phần `,1`: `@@ -5 +5,2 @@`.
 */
export function formatHunkHeader(hunk: DiffHunk): string {
  const old = formatRange(hunk.oldStart, hunk.oldCount);
  const fresh = formatRange(hunk.newStart, hunk.newCount);
  return `@@ -${old} +${fresh} @@`;
}

function formatRange(start: number, count: number): string {
  const printed = count === 0 ? start : start + 1;
  return count === 1 ? `${printed}` : `${printed},${count}`;
}

/**
 * Toàn bộ phần thân của `git diff` cho một file: các đầu `@@` và dòng có dấu.
 *
 * KHÔNG kèm dòng `--- a/<path>` / `+++ b/<path>`: chỉ tầng engine mới biết
 * đường dẫn, và mới phân biệt được "file mới" với "file bị xoá" để in
 * `/dev/null`. Dán tiêu đề là việc của nơi biết đủ dữ kiện.
 */
export function formatUnifiedDiff(
  a: Lines,
  b: Lines,
  context: number = DIFF_DEFAULT_CONTEXT,
): Lines {
  const out: string[] = [];
  for (const hunk of diffHunks(a, b, context)) {
    out.push(formatHunkHeader(hunk));
    for (const line of hunk.lines) out.push(`${line.sign}${line.text}`);
  }
  return out;
}
