/**
 * Kho object: tạo, tra, và các phép đi trên đồ thị commit.
 *
 * ⛔ **KHO KHÔNG BAO GIỜ XOÁ PHẦN TỬ.** Không có hàm `remove` trong file này, và
 * sự vắng mặt đó là một quyết định thiết kế, không phải thiếu sót.
 *
 * Đây là điều kiện để chương 3 (cứu hộ) tồn tại: "mất commit rồi cứu" chỉ có
 * nghĩa nếu commit VẪN nằm trong store sau khi không ref nào trỏ tới. Nói cách
 * khác, phải tách *lưu trữ* khỏi *reachability*. Learn Git Branching không thể
 * có `reflog` chính vì mô hình cây thuần của nó không có sự tách đó (đo được:
 * 0/71 file `src/js` nhắc `reflog`).
 *
 * Hệ quả phải biết và chấp nhận: bộ nhớ chỉ tăng trong một phiên chơi. Vài
 * nghìn object, mỗi object vài dòng, là vài trăm KB. `git gc` là thứ game cố
 * tình KHÔNG có.
 */

import type {
  BlobObject,
  CommitObject,
  FilePath,
  GitObject,
  Lines,
  ObjectStore,
  Oid,
  TreeEntry,
  TreeObject,
} from './contract.ts';
import { compareKeys, sortedEntries } from './deterministic.ts';
import { hashObject } from './hash.ts';

/** Kho rỗng. */
export const EMPTY_STORE: ObjectStore = Object.freeze({});

/**
 * Ghi một object vào kho và trả `[kho mới, oid]`.
 *
 * Ghi lại một object đã có là **vô hại và không tạo bản sao** — đó là toàn bộ ý
 * nghĩa của việc địa chỉ hoá theo nội dung, và nó là bài G01: sửa một ký tự ra
 * một Oid khác, sửa lại về như cũ thì Oid quay về đúng cái ban đầu.
 */
export function putObject(store: ObjectStore, object: GitObject): readonly [ObjectStore, Oid] {
  const oid = hashObject(object);
  if (Object.hasOwn(store, oid)) return [store, oid];
  return [{ ...store, [oid]: object }, oid];
}

export function getObject(store: ObjectStore, oid: Oid): GitObject | null {
  return store[oid] ?? null;
}

export function getBlob(store: ObjectStore, oid: Oid): BlobObject | null {
  const o = store[oid];
  return o !== undefined && o.kind === 'blob' ? o : null;
}

export function getTree(store: ObjectStore, oid: Oid): TreeObject | null {
  const o = store[oid];
  return o !== undefined && o.kind === 'tree' ? o : null;
}

export function getCommit(store: ObjectStore, oid: Oid): CommitObject | null {
  const o = store[oid];
  return o !== undefined && o.kind === 'commit' ? o : null;
}

/** Có object nào mang Oid này không — kể cả object không ai trỏ tới. */
export function hasObject(store: ObjectStore, oid: Oid): boolean {
  return Object.hasOwn(store, oid);
}

// ── Dựng object ─────────────────────────────────────────────────────────────

export function makeBlob(lines: Lines): BlobObject {
  return { kind: 'blob', lines };
}

/**
 * Dựng tree từ một bản ghi `path → oid`.
 *
 * ⚠ Sắp `entries` **tại đây**, không để chỗ gọi lo. Đây là bất biến mà
 * `serializeObject` dựa vào để chuẩn tắc, và một tree chưa sắp sẽ băm ra Oid
 * khác cho cùng nội dung — lỗi thầm lặng nhất trong cả hệ.
 */
export function makeTree(paths: Readonly<Record<FilePath, Oid>>): TreeObject {
  const entries: TreeEntry[] = [];
  for (const [path, oid] of sortedEntries(paths)) entries.push({ path, oid });
  return { kind: 'tree', entries };
}

/** `path → oid` từ một tree. Nghịch đảo của `makeTree`. */
export function treeToRecord(tree: TreeObject): Readonly<Record<FilePath, Oid>> {
  const out: Record<FilePath, Oid> = {};
  for (const entry of tree.entries) out[entry.path] = entry.oid;
  return out;
}

/** Nội dung đầy đủ của một tree, đã giải blob. Rỗng nếu tree không tồn tại. */
export function readTreeContents(
  store: ObjectStore,
  treeOid: Oid | null,
): Readonly<Record<FilePath, Lines>> {
  if (treeOid === null) return {};
  const tree = getTree(store, treeOid);
  if (tree === null) return {};
  const out: Record<FilePath, Lines> = {};
  for (const entry of tree.entries) {
    const blob = getBlob(store, entry.oid);
    if (blob !== null) out[entry.path] = blob.lines;
  }
  return out;
}

/** Tree của một commit; `null` nếu commit không tồn tại. */
export function commitTree(store: ObjectStore, oid: Oid | null): Oid | null {
  if (oid === null) return null;
  return getCommit(store, oid)?.tree ?? null;
}

/** Nội dung file mà một commit nhìn thấy. */
export function commitContents(
  store: ObjectStore,
  oid: Oid | null,
): Readonly<Record<FilePath, Lines>> {
  return readTreeContents(store, commitTree(store, oid));
}

/**
 * Ghi một bản ghi nội dung file thành blob + tree, trả `[kho mới, oid tree]`.
 *
 * Đây là đường DUY NHẤT một commit sinh ra tree của nó. Gom lại một chỗ vì thứ
 * tự ghi blob không được ảnh hưởng tới Oid tree — và `sortedEntries` bảo đảm
 * điều đó bất kể `contents` được dựng theo thứ tự nào.
 */
export function writeContents(
  store: ObjectStore,
  contents: Readonly<Record<FilePath, Lines>>,
): readonly [ObjectStore, Oid] {
  let next = store;
  const paths: Record<FilePath, Oid> = {};
  for (const [path, lines] of sortedEntries(contents)) {
    const [s, oid] = putObject(next, makeBlob(lines));
    next = s;
    paths[path] = oid;
  }
  return putObject(next, makeTree(paths));
}

/** Dựng và ghi một commit. */
export function writeCommit(
  store: ObjectStore,
  input: {
    readonly tree: Oid;
    readonly parents: readonly Oid[];
    readonly message: string;
    readonly author: string;
    readonly logicalTime: number;
  },
): readonly [ObjectStore, Oid] {
  return putObject(store, { kind: 'commit', ...input });
}

// ── Đi trên đồ thị ──────────────────────────────────────────────────────────

/**
 * Mọi commit với tới được từ một tập gốc, theo MỌI cha.
 *
 * Trả về một `Set` — cố ý, và đây là ngoại lệ có tên của luật "không `Set` trong
 * trạng thái": cái `Set` này là kết quả TRUNG GIAN của một phép tính, nó không
 * được lưu vào `GitWorld`, không được băm, không được serialize. Thứ tự lặp của
 * nó không bao giờ ảnh hưởng tới đầu ra vì mọi chỗ dùng chỉ hỏi `.has()`. Cần
 * một danh sách có thứ tự thì dùng `reachableSorted` bên dưới.
 */
export function reachableFrom(store: ObjectStore, roots: readonly Oid[]): ReadonlySet<Oid> {
  const seen = new Set<Oid>();
  const stack = [...roots];
  while (stack.length > 0) {
    const oid = stack.pop();
    if (oid === undefined || seen.has(oid)) continue;
    const commit = getCommit(store, oid);
    if (commit === null) continue;
    seen.add(oid);
    for (const parent of commit.parents) stack.push(parent);
  }
  return seen;
}

/** Như trên nhưng trả mảng đã sắp — dùng ở chỗ kết quả đi vào trạng thái hoặc test. */
export function reachableSorted(store: ObjectStore, roots: readonly Oid[]): readonly Oid[] {
  return [...reachableFrom(store, roots)].sort(compareKeys);
}

/**
 * Lịch sử theo **cha thứ nhất**, từ `oid` lùi về gốc.
 *
 * Cha thứ nhất là nhánh ta đang đứng lúc merge; cha thứ hai là nhánh trộn vào.
 * `HEAD~1` đi theo cha thứ nhất, `HEAD^2` đi theo cha thứ hai — đó là bài G06,
 * và là lý do `CommitObject.parents` **không được sắp**.
 */
export function firstParentChain(store: ObjectStore, oid: Oid | null): readonly Oid[] {
  const out: Oid[] = [];
  const guard = new Set<Oid>();
  let cursor = oid;
  while (cursor !== null && !guard.has(cursor)) {
    const commit = getCommit(store, cursor);
    if (commit === null) break;
    out.push(cursor);
    guard.add(cursor);
    cursor = commit.parents[0] ?? null;
  }
  return out;
}

/**
 * Tổ tiên chung GẦN NHẤT của hai commit — nền của merge ba ngả.
 *
 * Thuật toán: lấy tập với-tới-được của `a`, rồi duyệt `b` theo chiều rộng và
 * trả commit đầu tiên nằm trong tập đó.
 *
 * ⚠ Duyệt theo chiều RỘNG chứ không chiều sâu, và hàng đợi được **sắp theo
 * `logicalTime` giảm dần** ở mỗi bước. Không có phép sắp đó thì ở một đồ thị có
 * nhiều tổ tiên chung, kết quả phụ thuộc thứ tự phần tử trong `parents` của các
 * commit trung gian — tức phụ thuộc lịch sử được dựng thế nào, không phải nó là
 * gì. Đó đúng là hạng bất định mà §2.2 mục 3 của design doc cảnh báo, và nó chỉ
 * lộ ở một level cụ thể rất lâu sau.
 *
 * `null` = hai commit không có tổ tiên chung (hai lịch sử rời nhau — xảy ra
 * thật ở bài clone một kho có lịch sử độc lập).
 */
export function mergeBase(store: ObjectStore, a: Oid, b: Oid): Oid | null {
  const fromA = reachableFrom(store, [a]);
  if (fromA.has(b)) return b;

  const seen = new Set<Oid>();
  let frontier: Oid[] = [b];
  while (frontier.length > 0) {
    const sorted = [...frontier].sort((x, y) => {
      const tx = getCommit(store, x)?.logicalTime ?? -1;
      const ty = getCommit(store, y)?.logicalTime ?? -1;
      if (tx !== ty) return ty - tx;
      return compareKeys(x, y);
    });
    for (const oid of sorted) {
      if (fromA.has(oid)) return oid;
    }
    const next: Oid[] = [];
    for (const oid of sorted) {
      if (seen.has(oid)) continue;
      seen.add(oid);
      const commit = getCommit(store, oid);
      if (commit === null) continue;
      for (const parent of commit.parents) {
        if (!seen.has(parent)) next.push(parent);
      }
    }
    frontier = next;
  }
  return null;
}

/** `ancestor` có phải tổ tiên của `descendant` không (kể cả bằng chính nó). */
export function isAncestor(store: ObjectStore, ancestor: Oid, descendant: Oid): boolean {
  return reachableFrom(store, [descendant]).has(ancestor);
}

/**
 * Các commit chỉ có ở `head`, không có ở `base` — tức "cái gì sẽ được áp".
 *
 * Trả theo thứ tự **cũ trước, mới sau** để `rebase`/`cherry-pick` áp lần lượt.
 * Sắp theo `logicalTime` rồi tie-break bằng Oid: lại là chống bất định, không
 * phải thẩm mỹ.
 */
export function commitsBetween(store: ObjectStore, base: Oid | null, head: Oid): readonly Oid[] {
  const exclude = base === null ? new Set<Oid>() : reachableFrom(store, [base]);
  const include = reachableFrom(store, [head]);
  const out: Oid[] = [];
  for (const oid of include) {
    if (!exclude.has(oid)) out.push(oid);
  }
  return out.sort((x, y) => {
    const tx = getCommit(store, x)?.logicalTime ?? 0;
    const ty = getCommit(store, y)?.logicalTime ?? 0;
    if (tx !== ty) return tx - ty;
    return compareKeys(x, y);
  });
}
