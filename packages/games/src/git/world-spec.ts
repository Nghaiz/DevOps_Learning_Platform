/**
 * Dựng một `GitWorld` từ một `WorldSpec` khai báo.
 *
 * VÌ SAO KHAI BÁO CHỨ KHÔNG PHẢI MỖI LEVEL MỘT HÀM DỰNG
 * ------------------------------------------------------
 * 32 level nhân một hàm dựng mỗi level là 32 chỗ có thể sai theo 32 cách khác
 * nhau, và mỗi cách chỉ lộ khi có người chơi tới đúng level đó. Một spec thuần
 * dữ liệu thì chỉ có MỘT bộ dựng, và test của bộ dựng này gác cho cả 32.
 *
 * Hệ quả thứ hai, quan trọng hơn: người soạn level **không được phép biết Oid
 * trước**. Oid sinh ra từ nội dung, nên viết `parents: ['a3f1c9']` vào một file
 * level là viết một con số sẽ đổi ngay lần đầu ai đó sửa một dấu phẩy trong
 * commit message. Spec dùng id NỘI BỘ (`'c1'`, `'feat-a'`) và bộ dựng ánh xạ
 * sang Oid — đó là thứ làm level viết được bằng tay.
 *
 * TẤT ĐỊNH
 * --------
 * Cùng `WorldSpec` ⇒ cùng `GitWorld`, cùng mọi Oid, mọi lúc. Điều đó đòi
 * `logicalTime` của mỗi commit là **vị trí của nó trong mảng `commits`**, không
 * phải một bộ đếm chạy theo thứ tự duyệt. Hai thứ đó trùng nhau hôm nay vì ta
 * duyệt theo mảng, nhưng gắn nó vào chỉ số làm bất biến này đúng-theo-cấu-trúc
 * thay vì đúng-theo-tình-cờ.
 */

import type {
  BotAction,
  CommitSpec,
  FilePath,
  GitWorld,
  Lines,
  Oid,
  Repo,
  WorldSpec,
} from './contract.ts';
import { seedRng } from '../core/rng.ts';
import { sortedEntries } from './deterministic.ts';
import { blobOid, branchRef, emptyRepo, headOid, tagRef } from './repo.ts';
import { commitContents, makeBlob, putObject, writeCommit, writeContents } from './objects.ts';

/** Lỗi dựng spec. Ném, không trả — một level sai spec là lỗi của người soạn, không phải của người chơi. */
export class WorldSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorldSpecError';
  }
}

/** Chuỗi nhiều dòng hoặc mảng dòng → `Lines`. */
export function toLines(value: string | Lines): Lines {
  if (typeof value !== 'string') return value;
  // Tách theo `\n` sau khi bỏ `\r` — repo này có tiền sử CRLF làm parser nuốt
  // nội dung trong im lặng, và một file level viết trên Windows không được ra
  // một cây khác file cùng nội dung viết trên Linux.
  const normalized = value.replace(/\r\n?/g, '\n');
  // Template literal trong file level hầu như luôn mở bằng một xuống dòng ngay
  // sau dấu backtick. Bỏ đúng MỘT dòng trống đầu, và đúng một dòng trống cuối.
  const lines = normalized.split('\n');
  if (lines[0] === '') lines.shift();
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

interface BuildState {
  repo: Repo;
  /** id spec → Oid thật. */
  readonly oidOf: Map<string, Oid>;
  /** id spec → nội dung file mà commit đó nhìn thấy. */
  readonly contentsOf: Map<string, Readonly<Record<FilePath, Lines>>>;
}

/**
 * Áp một `CommitSpec` lên nội dung của cha thứ nhất.
 *
 * `changes` là **delta so với cha thứ nhất**, không phải toàn bộ cây. Đó là cách
 * người ta nghĩ khi viết một level ("commit này sửa `config.yml`"), và nó làm
 * lịch sử 8 commit viết được trong 20 dòng thay vì 80.
 */
function applyCommitSpec(state: BuildState, spec: CommitSpec, index: number): void {
  const parentIds = spec.parents ?? [];
  for (const pid of parentIds) {
    if (!state.oidOf.has(pid)) {
      throw new WorldSpecError(
        `commit '${spec.id}' khai cha '${pid}' chưa được định nghĩa. ` +
          `Mảng commits phải theo thứ tự tô-pô: cha đứng trước con.`,
      );
    }
  }

  const firstParent = parentIds[0];
  const base: Readonly<Record<FilePath, Lines>> =
    firstParent === undefined ? {} : (state.contentsOf.get(firstParent) ?? {});

  const next: Record<FilePath, Lines> = { ...base };
  for (const [path, value] of sortedEntries(spec.changes ?? {})) {
    if (value === null) {
      delete next[path];
      continue;
    }
    next[path] = toLines(value);
  }

  const [storeAfterTree, treeOid] = writeContents(state.repo.objects, next);
  const [storeAfterCommit, commitOid] = writeCommit(storeAfterTree, {
    tree: treeOid,
    parents: parentIds.map((pid) => {
      const oid = state.oidOf.get(pid);
      if (oid === undefined) throw new WorldSpecError(`cha '${pid}' không có Oid`);
      return oid;
    }),
    message: spec.message,
    author: spec.author ?? 'Bạn',
    // Vị trí trong mảng, KHÔNG phải bộ đếm duyệt. Xem chú thích đầu file.
    //
    // `spec.logicalTime` tường minh thắng, và nó có đúng MỘT chỗ dùng: phép
    // chiếu ngược của sandbox (§17.Q). Không có nó thì vòng xuất-nhập đổi mọi
    // Oid, vì `logicalTime` đi vào phép băm.
    logicalTime: spec.logicalTime ?? index + 1,
  });

  state.repo = { ...state.repo, objects: storeAfterCommit };
  state.oidOf.set(spec.id, commitOid);
  state.contentsOf.set(spec.id, next);
}

function buildRepo(
  spec: {
    readonly commits?: readonly CommitSpec[];
    readonly branches?: Readonly<Record<string, string>>;
    readonly tags?: Readonly<Record<string, string>>;
  },
  defaultBranch: string,
): BuildState {
  const state: BuildState = {
    repo: emptyRepo(defaultBranch),
    oidOf: new Map(),
    contentsOf: new Map(),
  };

  const commits = spec.commits ?? [];
  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    if (c === undefined) continue;
    if (state.oidOf.has(c.id)) {
      throw new WorldSpecError(`commit id '${c.id}' bị khai hai lần trong cùng một spec.`);
    }
    applyCommitSpec(state, c, i);
  }

  // Ref đặt TRỰC TIẾP, không qua `setRef` — và đây là ngoại lệ DUY NHẤT của luật
  // "mọi lần đổi ref đi qua setRef".
  //
  // Lý do: `setRef` ghi reflog, mà một repo vừa được dựng làm trạng thái đầu của
  // level thì KHÔNG được có reflog. Reflog là nhật ký những gì NGƯỜI CHƠI đã
  // làm; một level mở ra mà `git reflog` đã có sẵn 8 dòng "commit: ..." sẽ dạy
  // sai, và tệ hơn, nó cho người chơi chương 3 một đường cứu mà đề bài không
  // định cho. Bài G26 ("cứu sau reset --hard nhầm") chỉ có nghĩa nếu dòng reflog
  // duy nhất là dòng do chính người chơi vừa tạo ra.
  const refs: Record<string, Oid> = {};
  for (const [name, id] of sortedEntries(spec.branches ?? {})) {
    const oid = state.oidOf.get(id);
    if (oid === undefined) {
      throw new WorldSpecError(`nhánh '${name}' trỏ tới commit '${id}' không tồn tại.`);
    }
    refs[branchRef(name)] = oid;
  }
  for (const [name, id] of sortedEntries(spec.tags ?? {})) {
    const oid = state.oidOf.get(id);
    if (oid === undefined) {
      throw new WorldSpecError(`tag '${name}' trỏ tới commit '${id}' không tồn tại.`);
    }
    refs[tagRef(name)] = oid;
  }
  state.repo = { ...state.repo, refs };
  return state;
}

/**
 * Dựng thế giới từ spec.
 *
 * @param seed hạt giống PRNG của level. Cùng seed + cùng chuỗi lệnh ⇒ cùng
 *   trạng thái, ở cả trình duyệt lẫn Node (§2.2 của design doc).
 */
export function buildWorld(spec: WorldSpec, seed: number): GitWorld {
  const author = spec.author ?? 'Bạn';
  const local = buildRepo(spec, 'main');

  // ── HEAD ──
  let repo = local.repo;
  const headSpec = spec.head ?? 'main';
  if (typeof headSpec === 'string') {
    repo = { ...repo, head: { type: 'ref', ref: branchRef(headSpec) } };
  } else {
    const oid = local.oidOf.get(headSpec.detached);
    if (oid === undefined) {
      throw new WorldSpecError(
        `head.detached trỏ tới commit '${headSpec.detached}' không tồn tại.`,
      );
    }
    repo = { ...repo, head: { type: 'detached', oid } };
  }

  // ── Worktree: nội dung HEAD, rồi đè các file khai thêm ──
  //
  // Thứ tự này có nghĩa: `spec.worktree` là "người chơi đang sửa dở", nên nó
  // phải đè lên bản đã commit, không phải ngược lại. Một file chỉ có ở
  // `spec.worktree` mà không có trong lịch sử là file CHƯA TRACK, và đó là
  // nguyên liệu của bài G03.
  const headContents: Record<FilePath, Lines> = { ...commitContents(repo.objects, headOid(repo)) };
  let objects = repo.objects;
  for (const [path, value] of sortedEntries(spec.worktree ?? {})) {
    const lines = toLines(value);
    headContents[path] = lines;
    // Ghi blob vào kho ngay: `status` băm nội dung worktree để so, và một blob
    // chưa có trong kho vẫn so được (phép băm thuần), nhưng `add` sẽ cần nó.
    const [next] = putObject(objects, makeBlob(lines));
    objects = next;
  }
  repo = { ...repo, objects, worktree: headContents };

  // ── Index: mặc định khớp HEAD, rồi stage thêm những gì spec bảo ──
  //
  // Mặc định khớp HEAD chứ không rỗng: một index rỗng nghĩa là MỌI file đã
  // track đều đang ở trạng thái "đã xoá khỏi staging", tức `git status` của một
  // level vừa mở ra sẽ đỏ rực. Đó không phải trạng thái nghỉ của một repo.
  const index: Record<FilePath, Oid> = {};
  for (const [path, lines] of sortedEntries(commitContents(repo.objects, headOid(repo)))) {
    index[path] = blobOid(lines);
  }
  for (const path of spec.staged ?? []) {
    const lines = repo.worktree[path];
    if (lines === undefined) {
      throw new WorldSpecError(`staged khai '${path}' nhưng file đó không có trong worktree.`);
    }
    const [next, oid] = putObject(repo.objects, makeBlob(lines));
    repo = { ...repo, objects: next };
    index[path] = oid;
  }
  repo = { ...repo, index };

  // ── origin ──
  let origin: Repo | null = null;
  if (spec.origin !== undefined) {
    // `exactOptionalPropertyTypes` bật: truyền `commits: undefined` tường minh
    // KHÁC với bỏ khoá đi. Dựng mảng rỗng thay vì để `undefined` lọt vào.
    const originState = buildRepo(
      { commits: spec.commits ?? [], branches: spec.origin.branches },
      'main',
    );
    origin = originState.repo;

    // Ref theo dõi nằm ở kho LOCAL, không ở origin. Đây là cả bài G14: `origin/main`
    // là thứ local NHỚ về origin lần cuối fetch, không phải thứ origin ĐANG có.
    // Hai cái lệch nhau chính là tình huống dạy được, nên `tracking` khai riêng
    // và MẶC ĐỊNH bằng `branches` của origin chỉ khi người soạn không nói gì.
    const tracking = spec.origin.tracking ?? spec.origin.branches;
    const withTracking: Record<string, Oid> = { ...repo.refs };
    for (const [name, id] of sortedEntries(tracking)) {
      const oid = local.oidOf.get(id);
      if (oid === undefined) {
        throw new WorldSpecError(
          `origin.tracking['${name}'] trỏ tới commit '${id}' không tồn tại.`,
        );
      }
      withTracking[`refs/remotes/origin/${name}`] = oid;
    }
    repo = { ...repo, refs: withTracking };

    // Kho origin phải CHỨA mọi object mà ref theo dõi của local trỏ tới, và
    // ngược lại — hai kho dựng từ CÙNG mảng `commits` nên kho object của chúng
    // giống nhau. Gộp một lần cho chắc: một object thiếu bên origin sẽ làm
    // `fetch` trả về một Oid không giải được, và triệu chứng là một commit rỗng
    // hiện ra trong đồ thị.
    origin = { ...origin, objects: { ...repo.objects, ...origin.objects } };
    repo = { ...repo, objects: { ...origin.objects, ...repo.objects } };
  }

  return {
    local: repo,
    origin,
    logicalTime: (spec.commits ?? []).length,
    rng: seedRng(seed),
    bots: sortBots(spec.bots ?? []),
    pullRequests: [],
    author,
  };
}

/**
 * Bot đã sắp theo `atLogicalTime` tăng dần, tie-break bằng `author`.
 *
 * Hai bot hành động ở cùng một thời điểm logic là chuyện có thật (bài G20 có hai
 * đồng đội cùng push). Thứ tự giữa chúng phải là hàm của dữ liệu, không phải của
 * thứ tự người soạn gõ — nếu không, đảo hai dòng trong file level sẽ đổi kết quả
 * lượt chơi, và không ai ngờ tới điều đó.
 */
function sortBots(bots: readonly BotAction[]): readonly BotAction[] {
  return [...bots].sort((a, b) => {
    if (a.atLogicalTime !== b.atLogicalTime) return a.atLogicalTime - b.atLogicalTime;
    return a.author < b.author ? -1 : a.author > b.author ? 1 : 0;
  });
}

/** Bản sao cục bộ của `headOid` để `world-spec.ts` không phải import vòng qua `repo.ts`. */
function headOidOf(repo: Repo): Oid | null {
  if (repo.head.type === 'detached') return repo.head.oid;
  return repo.refs[repo.head.ref] ?? null;
}
