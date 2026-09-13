/**
 * Thao tác nguyên thuỷ trên một `Repo`: ref, HEAD, index, worktree, reflog.
 *
 * Tầng này KHÔNG biết gì về lệnh git. Nó không phân tích cú pháp, không sinh
 * thông báo, không quyết định chính sách. Nó chỉ cung cấp những phép biến đổi
 * nhỏ mà mọi lệnh đều dùng, và giữ cho ba bất biến sau không bao giờ vỡ:
 *
 *  1. Trạng thái **bất biến** — mọi hàm trả `Repo` mới, không sửa tại chỗ.
 *  2. `ObjectStore` **chỉ thêm, không bớt**.
 *  3. Mọi phép lặp trên `Record` đi qua `deterministic.ts`.
 */

import type {
  FilePath,
  Head,
  Index,
  Lines,
  Oid,
  RefName,
  Reflog,
  ReflogEntry,
  Refs,
  Repo,
  Worktree,
} from './contract.ts';
import { EMPTY_STORE, commitContents, getCommit, makeBlob } from './objects.ts';
import { hashObject } from './hash.ts';
import { sortedKeys, withKey, withoutKey } from './deterministic.ts';

// ── Tiền tố ref ─────────────────────────────────────────────────────────────

export const HEADS_PREFIX = 'refs/heads/';
export const REMOTES_PREFIX = 'refs/remotes/';
export const TAGS_PREFIX = 'refs/tags/';

export function branchRef(shortName: string): RefName {
  return `${HEADS_PREFIX}${shortName}`;
}

export function remoteRef(shortName: string): RefName {
  // `shortName` ở đây là dạng `origin/main`, nên nối thẳng.
  return `${REMOTES_PREFIX}${shortName}`;
}

export function tagRef(shortName: string): RefName {
  return `${TAGS_PREFIX}${shortName}`;
}

/**
 * Dạng đầy đủ → dạng người chơi đọc. `refs/heads/main` → `main`,
 * `refs/remotes/origin/main` → `origin/main`.
 */
export function shortRefName(ref: RefName): string {
  for (const prefix of [HEADS_PREFIX, REMOTES_PREFIX, TAGS_PREFIX]) {
    if (ref.startsWith(prefix)) return ref.slice(prefix.length);
  }
  return ref;
}

export function isBranch(ref: RefName): boolean {
  return ref.startsWith(HEADS_PREFIX);
}

export function isRemoteRef(ref: RefName): boolean {
  return ref.startsWith(REMOTES_PREFIX);
}

export function isTag(ref: RefName): boolean {
  return ref.startsWith(TAGS_PREFIX);
}

/** Tên nhánh local, dạng ngắn, đã sắp. */
export function branchNames(refs: Refs): readonly string[] {
  return sortedKeys(refs)
    .filter(isBranch)
    .map(shortRefName);
}

/** Ref theo dõi, dạng ngắn (`origin/main`), đã sắp. */
export function remoteRefNames(refs: Refs): readonly string[] {
  return sortedKeys(refs)
    .filter(isRemoteRef)
    .map(shortRefName);
}

export function tagNames(refs: Refs): readonly string[] {
  return sortedKeys(refs)
    .filter(isTag)
    .map(shortRefName);
}

// ── Repo rỗng ───────────────────────────────────────────────────────────────

/**
 * Kho vừa `git init`.
 *
 * HEAD trỏ vào `refs/heads/main` mà ref đó **chưa tồn tại** — đúng như git thật
 * sau `init`, và đó là trạng thái "nhánh chưa sinh ra" (unborn branch). Người
 * chơi gõ `git branch` lúc này thấy trống, và đó là đúng: nhánh chỉ ra đời khi
 * có commit đầu tiên trỏ vào. Bài G04 dựa vào chi tiết này.
 */
export function emptyRepo(defaultBranch = 'main'): Repo {
  return {
    objects: EMPTY_STORE,
    refs: {},
    head: { type: 'ref', ref: branchRef(defaultBranch) },
    index: {},
    worktree: {},
    reflog: {},
    stash: [],
    pending: null,
  };
}

// ── HEAD ────────────────────────────────────────────────────────────────────

/**
 * Commit mà HEAD đang trỏ tới. `null` khi nhánh chưa sinh ra (chưa có commit
 * nào) — KHÔNG phải lỗi, và mọi chỗ gọi phải xử được `null`.
 */
export function headOid(repo: Repo): Oid | null {
  if (repo.head.type === 'detached') return repo.head.oid;
  return repo.refs[repo.head.ref] ?? null;
}

/** Ref mà HEAD bám vào, hoặc `null` khi detached. */
export function headRef(repo: Repo): RefName | null {
  return repo.head.type === 'ref' ? repo.head.ref : null;
}

export function isDetached(repo: Repo): boolean {
  return repo.head.type === 'detached';
}

// ── Ghi ref, kèm reflog ─────────────────────────────────────────────────────

/**
 * Đặt một ref và **ghi reflog cùng lúc**.
 *
 * ⛔ Đây là đường DUY NHẤT được phép đổi một ref. Không hàm nào ngoài file này
 * được viết `{ ...repo, refs: { ...repo.refs, [x]: y } }` trần.
 *
 * Lý do là cả chương 3: `reflog` chỉ cứu được thứ nó đã ghi. Một chỗ đổi ref mà
 * quên ghi reflog sẽ tạo ra một commit "mất tăm không dấu vết" — và triệu chứng
 * là bài G26 (cứu sau `reset --hard`) đôi khi không giải được, tuỳ người chơi đi
 * đường nào. Loại lỗi đó không lộ ở test đơn vị của lệnh, chỉ lộ ở một lượt chơi
 * cụ thể.
 *
 * Reflog ghi vào CẢ ref bị đổi lẫn `HEAD` khi ref đó là ref HEAD đang bám —
 * đúng như git thật, và đó là thứ làm `git reflog` (không tham số, tức đọc
 * reflog của HEAD) hiện được mọi lần dịch chuyển.
 */
export function setRef(
  repo: Repo,
  ref: RefName,
  oid: Oid,
  entry: { readonly op: string; readonly message: string; readonly logicalTime: number },
): Repo {
  const from = repo.refs[ref] ?? null;
  const log: ReflogEntry = { from, to: oid, ...entry };

  let reflog: Reflog = appendReflog(repo.reflog, ref, log);
  if (repo.head.type === 'ref' && repo.head.ref === ref) {
    reflog = appendReflog(reflog, 'HEAD', log);
  }

  return { ...repo, refs: withKey(repo.refs, ref, oid), reflog };
}

/**
 * Xoá một ref. Reflog của nó **Ở LẠI** — đó chính là cách cứu một nhánh đã xoá
 * (bài G27): `git branch -D feature` xoá con trỏ, không xoá lịch sử dịch chuyển
 * của nó, nên `git reflog feature` vẫn nói commit cuối nằm ở đâu.
 */
export function deleteRef(repo: Repo, ref: RefName): Repo {
  return { ...repo, refs: withoutKey(repo.refs, ref) };
}

function appendReflog(reflog: Reflog, ref: RefName, entry: ReflogEntry): Reflog {
  const existing = reflog[ref] ?? [];
  // Mục mới nhất ở ĐẦU mảng, đúng thứ tự `git reflog` in ra.
  return withKey(reflog, ref, [entry, ...existing]);
}

/** Reflog của một ref, mới nhất trước. Rỗng nếu chưa có. */
export function readReflog(repo: Repo, ref: RefName): readonly ReflogEntry[] {
  return repo.reflog[ref] ?? [];
}

/**
 * Chuyển HEAD, có ghi reflog.
 *
 * `checkout`/`switch` không đổi ref nào cả — chúng đổi chỗ HEAD bám. Nhưng
 * reflog của HEAD vẫn phải ghi, vì "tôi đã từng ở commit nào" là câu hỏi mà bài
 * G28 (thoát detached HEAD có commit) cần trả lời.
 */
export function moveHead(
  repo: Repo,
  head: Head,
  entry: { readonly op: string; readonly message: string; readonly logicalTime: number },
): Repo {
  const from = headOid(repo);
  const next: Repo = { ...repo, head };
  const to = headOid(next);
  if (to === null) return next;
  return { ...next, reflog: appendReflog(repo.reflog, 'HEAD', { from, to, ...entry }) };
}

// ── Index và worktree ───────────────────────────────────────────────────────

export function stagePath(repo: Repo, path: FilePath, oid: Oid): Repo {
  return { ...repo, index: withKey(repo.index, path, oid) };
}

export function unstagePath(repo: Repo, path: FilePath): Repo {
  return { ...repo, index: withoutKey(repo.index, path) };
}

export function setIndex(repo: Repo, index: Index): Repo {
  return { ...repo, index };
}

export function writeFile(repo: Repo, path: FilePath, lines: Lines): Repo {
  return { ...repo, worktree: withKey(repo.worktree, path, lines) };
}

export function removeFile(repo: Repo, path: FilePath): Repo {
  return { ...repo, worktree: withoutKey(repo.worktree, path) };
}

export function setWorktree(repo: Repo, worktree: Worktree): Repo {
  return { ...repo, worktree };
}

/** Nội dung file mà commit HEAD nhìn thấy. Rỗng khi nhánh chưa sinh ra. */
export function headContents(repo: Repo): Readonly<Record<FilePath, Lines>> {
  return commitContents(repo.objects, headOid(repo));
}

/** Mọi đường dẫn xuất hiện ở bất kỳ vùng nào trong ba vùng, đã sắp, không lặp. */
export function allPaths(repo: Repo): readonly FilePath[] {
  const seen: Record<FilePath, true> = {};
  for (const p of sortedKeys(headContents(repo))) seen[p] = true;
  for (const p of sortedKeys(repo.index)) seen[p] = true;
  for (const p of sortedKeys(repo.worktree)) seen[p] = true;
  return sortedKeys(seen);
}

// ── status ──────────────────────────────────────────────────────────────────

/**
 * Trạng thái ba vùng của một đường dẫn.
 *
 * Hai trục **độc lập** — và sự độc lập đó chính là bài học:
 *
 *   `staged`   = index so với HEAD  → "cái gì sẽ vào commit tới"
 *   `unstaged` = worktree so với index → "cái gì sẽ KHÔNG vào commit tới"
 *
 * Perez De Rosso & Jackson (MIT, Onward! 2013) đo được rằng người dùng gộp hai
 * trục này lại trong đầu, rồi mất phần sửa sau bug fix mà không hiểu vì sao.
 * Hai trường riêng ở đây tồn tại để giao diện vẽ được hai cột riêng, không phải
 * một cột "đã sửa".
 */
export interface PathStatus {
  readonly path: FilePath;
  readonly staged: 'added' | 'modified' | 'deleted' | 'unchanged';
  readonly unstaged: 'modified' | 'deleted' | 'untracked' | 'unchanged';
}

export function pathStatus(repo: Repo, path: FilePath): PathStatus {
  const head = headContents(repo);
  const inHead = Object.hasOwn(head, path);
  const inIndex = Object.hasOwn(repo.index, path);
  const inWork = Object.hasOwn(repo.worktree, path);

  const headOidForPath = inHead ? blobOid(head[path] ?? []) : null;
  const indexOid = inIndex ? (repo.index[path] ?? null) : null;
  const workOid = inWork ? blobOid(repo.worktree[path] ?? []) : null;

  let staged: PathStatus['staged'] = 'unchanged';
  if (!inHead && inIndex) staged = 'added';
  else if (inHead && !inIndex) staged = 'deleted';
  else if (inHead && inIndex && headOidForPath !== indexOid) staged = 'modified';

  let unstaged: PathStatus['unstaged'] = 'unchanged';
  if (!inIndex && inWork && !inHead) unstaged = 'untracked';
  else if (inIndex && !inWork) unstaged = 'deleted';
  else if (inIndex && inWork && indexOid !== workOid) unstaged = 'modified';
  else if (!inIndex && inHead && inWork && headOidForPath !== workOid) unstaged = 'modified';
  else if (!inIndex && inHead && !inWork) unstaged = 'deleted';

  return { path, staged, unstaged };
}

/**
 * Băm nội dung mà KHÔNG ghi vào kho.
 *
 * Cố ý không ghi: `git status` là lệnh chỉ đọc, và một lệnh chỉ đọc làm kho
 * phình ra là một lệnh nói dối. Người chơi gõ `status` mười lần không được tạo
 * ra mười object.
 *
 * Dùng ĐÚNG phép băm mà `putObject(makeBlob(...))` dùng, nên hai bên không thể
 * lệch: nếu chúng lệch thì `status` sẽ báo một file là 'modified' ngay sau khi
 * `add` nó.
 */
export function blobOid(lines: Lines): Oid {
  return hashObject(makeBlob(lines));
}

/** Toàn bộ trạng thái, đã sắp theo đường dẫn. Bỏ file không đổi ở cả hai trục. */
export function statusEntries(repo: Repo): readonly PathStatus[] {
  const out: PathStatus[] = [];
  for (const path of allPaths(repo)) {
    const s = pathStatus(repo, path);
    if (s.staged === 'unchanged' && s.unstaged === 'unchanged') continue;
    out.push(s);
  }
  return out;
}

/** Không có gì đang staged. */
export function isIndexClean(repo: Repo): boolean {
  return statusEntries(repo).every((s) => s.staged === 'unchanged');
}

/** Worktree khớp index ở mọi đường dẫn đã track. File chưa track KHÔNG tính bẩn. */
export function isWorktreeClean(repo: Repo): boolean {
  return statusEntries(repo).every(
    (s) => s.unstaged === 'unchanged' || s.unstaged === 'untracked',
  );
}

/** Không staged, không unstaged, không file lạ. Điều kiện của `switch` an toàn. */
export function isFullyClean(repo: Repo): boolean {
  return statusEntries(repo).length === 0;
}

// ── Tiện ích commit ─────────────────────────────────────────────────────────

/** Message của một commit, hoặc `null`. Dùng nhiều ở bộ chấm. */
export function messageOf(repo: Repo, oid: Oid | null): string | null {
  if (oid === null) return null;
  return getCommit(repo.objects, oid)?.message ?? null;
}

/**
 * Mọi ref đang trỏ vào commit này, dạng ngắn, đã sắp. Dùng vẽ nhãn.
 *
 * Trả mảng chứ không trả một cái: hai nhánh trỏ cùng một commit là chuyện bình
 * thường và là bài G04 ("tạo nhánh không sao chép gì cả").
 */
export function refsAt(repo: Repo, oid: Oid): readonly string[] {
  return sortedKeys(repo.refs)
    .filter((ref) => repo.refs[ref] === oid)
    .map(shortRefName);
}
