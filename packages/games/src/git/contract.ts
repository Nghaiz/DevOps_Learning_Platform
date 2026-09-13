/**
 * Hợp đồng của game **Phòng thí nghiệm Git** (`gameId: 'git'`).
 *
 * ⛔ LEAD SỞ HỮU FILE NÀY. Sáu lane chạy song song code ĐỐI KHÁNG với nó: engine
 * object store, engine thao tác lịch sử, merge/diff3, kho từ xa, bộ phân tích
 * lệnh, và ba lane nội dung level. Sửa lén một field = một lane biên dịch xanh
 * trong khi lane kia hiểu khác — đúng thứ `rules/contract-first-integration.md`
 * sinh ra để chặn. Thấy hợp đồng thiếu gì thì BÁO LEAD.
 *
 * SSOT thiết kế: `plans/reports/2026-09-11-brainstorm-git-cicd-games.md` §3.
 * Kế hoạch thi công: `plans/devops-learning-platform/phase-17.md`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BA RÀNG BUỘC CHI PHỐI MỌI KIỂU DƯỚI ĐÂY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **1. Tất định tuyệt đối.** Cùng `seed` + cùng chuỗi lệnh ⇒ cùng trạng thái,
 *    ở cả trình duyệt lẫn Node. Đây là điều kiện sống còn của P18 (chấm lại
 *    phía máy chủ): nếu nó hỏng thì chế độ thi chỉ là danh dự. Hệ quả cứng lên
 *    hình dạng dữ liệu:
 *
 *    - **Không `Map`, không `Set` ở bất cứ đâu trong trạng thái.** Thứ tự lặp
 *      của chúng là thứ tự CHÈN, nên hai đường dựng cùng một repo cho ra hai
 *      chuỗi serialize khác nhau, tức hai Oid khác nhau. Lỗi này thầm lặng nhất
 *      trong cả hệ: nó chỉ lộ khi ai đó đổi thứ tự chèn ở một tính năng không
 *      liên quan, rất lâu sau. Dùng `Readonly<Record<K, V>>` và **luôn** lặp qua
 *      `sortedKeys()` của `git/deterministic.ts`.
 *    - **Không `Date.now()`, không `Math.random()`.** Thời gian là `logicalTime`
 *      tăng theo số lệnh. Ngẫu nhiên đi qua `core/rng.ts` có hạt giống. Cổng
 *      grep §17.J.2 gác việc này và nó có đối chứng dương.
 *    - **Không `import` `node:*`, không DOM, không React.** `tsconfig` của
 *      package cố ý bỏ `types: ["node"]` nên một lần lạc tay là đỏ ngay ở
 *      typecheck. Ràng buộc này GIÚP §17.J.5 chứ không cản: mã thuần chạy được
 *      ở cả trình duyệt và Node, nên cùng bộ test chạy được hai env.
 *
 * **2. Bất biến.** Mọi kiểu trạng thái là `readonly` xuyên suốt. Thao tác trả
 *    về trạng thái MỚI. Đây không phải sở thích: `undo` từng bước (17.I.3) và
 *    sandbox (17.Q) chỉ cần giữ một mảng trạng thái cũ, và phát lại không bao
 *    giờ phải lo một tham chiếu bị sửa sau lưng.
 *
 * **3. 0 lời gọi backend trong lúc chơi.** Không có kiểu nào ở đây mô tả một
 *    request. Toàn bộ "kho từ xa" là một `Repo` thứ hai trong cùng bộ nhớ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CỐ TÌNH BỎ — đọc trước khi tưởng là thiếu sót
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Định dạng object nhị phân của git · zlib · packfile/delta · SHA-1 thật ·
 * submodule · sparse-checkout · hook · filter · chmod/mode bit · symlink ·
 * file nhị phân.
 *
 * Không cái nào phục vụ ba chương của game. `isomorphic-git@1.42.0` được cân
 * nhắc và bị loại vì đo được: nó KHÔNG có `rebase`, KHÔNG có `reflog`, và
 * `commit()` băm `Math.floor(Date.now()/1000)` vào SHA — tức cùng một chuỗi
 * lệnh ra SHA khác nhau mỗi lần chạy, hỏng thẳng khả năng phát lại. `wasm-git`
 * là 805KB–1.5MB wasm và pthreads đòi header COOP/COEP, siết cả trang.
 */

import type { Difficulty } from '../core/types.ts';
import type { RngState } from '../core/rng.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. OBJECT STORE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Băm nội dung của một object. **16 chữ số hex thường** (FNV-1a 64 bit).
 *
 * Hiển thị cho người chơi là 7 ký tự đầu, đúng thói quen git thật — xem
 * `shortOid()`. Vì sao 64 bit chứ không 32: một level đông có thể dựng vài nghìn
 * object, và ở 32 bit thì xác suất đụng độ sinh nhật đã đủ lớn để một lượt chơi
 * xui xẻo thấy hai commit khác nhau mang cùng một Oid. Ở 64 bit thì không.
 *
 * Vì sao không SHA-1 thật: không có `crypto.subtle` đồng bộ trong trình duyệt
 * (API của nó trả Promise), và một SHA-1 tự viết bằng JS thuần chậm hơn FNV-1a
 * hai bậc mà không mua được gì — game không trao đổi object với git thật.
 */
export type Oid = string;

/**
 * Đường dẫn file trong worktree. POSIX, **không** có tiền tố `./`, không có
 * dấu `/` đầu, không có `..`.
 *
 * Chuẩn hoá ở biên (bộ phân tích lệnh), không ở tầng dưới — engine giả định
 * đường dẫn đã sạch.
 */
export type FilePath = string;

/**
 * Nội dung file, **theo DÒNG** — không phải byte, không phải một chuỗi.
 *
 * Đây là một trong ba quyết định mô hình đáng giải thích (design §3.2):
 * conflict trong git là chuyện *hunk theo dòng*. Mảng dòng là đúng đơn vị cho
 * merge 3 ngả diff3, và nó làm animation "ô file bay lên" ở tầng 3D dễ hơn hẳn.
 *
 * Dòng KHÔNG mang ký tự xuống dòng ở cuối. Một file rỗng là `[]`, khác với một
 * file có đúng một dòng trống `['']`.
 */
export type Lines = readonly string[];

export interface BlobObject {
  readonly kind: 'blob';
  readonly lines: Lines;
}

/**
 * Một mục trong tree. Mảng các mục **luôn sắp theo `path` tăng dần** — đó là
 * điều kiện để serialize chuẩn tắc, tức để cùng nội dung ra cùng Oid.
 *
 * Tree ở đây là **phẳng**: nó giữ đường dẫn đầy đủ (`src/app/main.ts`), không
 * lồng tree con theo thư mục như git thật. Cố ý — game không dạy định dạng
 * object, và tree lồng nhau đẻ ra một tầng Oid trung gian mà người chơi không
 * bao giờ nhìn thấy nhưng lập trình viên phải nuôi.
 */
export interface TreeEntry {
  readonly path: FilePath;
  readonly oid: Oid;
}

export interface TreeObject {
  readonly kind: 'tree';
  /** ⚠ BẤT BIẾN: sắp tăng dần theo `path`. `objects.ts` tự sắp khi tạo. */
  readonly entries: readonly TreeEntry[];
}

export interface CommitObject {
  readonly kind: 'commit';
  readonly tree: Oid;
  /** Rỗng = commit gốc. 2 phần tử = commit merge. 3+ = octopus (không dùng). */
  readonly parents: readonly Oid[];
  readonly message: string;
  readonly author: string;
  /**
   * Đồng hồ LOGIC, không phải epoch. Tăng đúng 1 mỗi lệnh có tác dụng.
   *
   * Nó đi vào phép băm, nên hai commit cùng tree cùng cha cùng message mà tạo ở
   * hai thời điểm logic khác nhau vẫn là hai object khác nhau — đúng như git
   * thật, và đó là thứ làm `git commit --amend` hay `rebase` sinh Oid mới.
   */
  readonly logicalTime: number;
}

export type GitObject = BlobObject | TreeObject | CommitObject;

/**
 * Kho object. **KHÔNG BAO GIỜ xoá phần tử trong một phiên chơi.**
 *
 * Đây là điều kiện để chương 3 (cứu hộ) tồn tại: "mất commit rồi cứu" chỉ có
 * nghĩa nếu commit VẪN nằm trong store sau khi không ref nào trỏ tới. Nói cách
 * khác: *lưu trữ* tách khỏi *reachability*. Learn Git Branching không thể có
 * `reflog` chính vì mô hình của nó không có sự tách đó.
 *
 * Hệ quả phải biết: bộ nhớ chỉ tăng trong một phiên. Với vài nghìn object mỗi
 * object vài dòng thì đó là vài trăm KB — không phải vấn đề, và `git gc` là
 * thứ game cố tình KHÔNG có.
 */
export type ObjectStore = Readonly<Record<Oid, GitObject>>;

// ═══════════════════════════════════════════════════════════════════════════
// 2. REF, HEAD, INDEX, WORKTREE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tên ref đầy đủ: `refs/heads/main`, `refs/remotes/origin/main`, `refs/tags/v1`.
 *
 * Luôn dùng dạng ĐẦY ĐỦ trong trạng thái. Dạng rút gọn người chơi gõ (`main`,
 * `origin/main`) được bộ phân giải ở `git/refs.ts` nở ra — và chính chỗ nở đó
 * là nơi dạy được nhầm lẫn kinh niên §5.4 của khảo sát ICTERI: `origin/main`
 * (một ref theo dõi) khác `origin main` (một remote và một nhánh).
 */
export type RefName = string;

export type Refs = Readonly<Record<RefName, Oid>>;

/**
 * HEAD trỏ vào một ref, hoặc trỏ THẲNG vào một commit (detached).
 *
 * Hai nhánh này là bài G05 và là một nửa đất trống đo được ở §3.1:
 * gitmastery.me có **0 file** nhắc detached HEAD.
 */
export type Head =
  | { readonly type: 'ref'; readonly ref: RefName }
  | { readonly type: 'detached'; readonly oid: Oid };

/**
 * Vùng staging. **TÁCH khỏi worktree** — đây là quyết định mô hình thứ ba đáng
 * giải thích (design §3.2).
 *
 * Perez De Rosso & Jackson (Onward! 2013, MIT) đo được rằng staged và working
 * version *không trực giao*: "có xảy ra hay không thì tuỳ tham số truyền vào".
 * Ba vùng phải nhìn thấy được cùng lúc thì mới dạy được `reset --soft/--mixed/--hard`.
 * Gộp index vào worktree là xoá mất chính bài học đó.
 */
export type Index = Readonly<Record<FilePath, Oid>>;

/** Cây làm việc: nội dung file NGƯỜI CHƠI đang thấy, chưa chắc đã `add`. */
export type Worktree = Readonly<Record<FilePath, Lines>>;

/**
 * Một dòng nhật ký dịch chuyển của MỘT ref.
 *
 * `reflog` là đất trống đo được: Learn Git Branching **0 file**, gitmastery.me
 * 11 file. Nó là toàn bộ chương 3.
 */
export interface ReflogEntry {
  /** `null` = ref vừa được tạo ra. */
  readonly from: Oid | null;
  readonly to: Oid;
  /** `commit` · `reset` · `merge` · `rebase` · `checkout` · `branch` · … */
  readonly op: string;
  /** Tiếng Việt, một dòng, đúng thứ `git reflog` in ra bên phải. */
  readonly message: string;
  readonly logicalTime: number;
}

/** Nhật ký theo từng ref. `HEAD` là một khoá hợp lệ ở đây, và là khoá hay dùng nhất. */
export type Reflog = Readonly<Record<RefName, readonly ReflogEntry[]>>;

export interface StashEntry {
  /**
   * Commit ẩn giữ trạng thái đã cất. Giống git thật: stash LÀ một commit, và đó
   * là lý do `git fsck --lost-found` cứu được stash thất lạc (bài G30).
   */
  readonly oid: Oid;
  readonly message: string;
  /** Nhánh lúc cất. Hiện trong `git stash list`. */
  readonly branch: string;
  readonly logicalTime: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. THAO TÁC DỞ DANG (merge / rebase / cherry-pick đang xung đột)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ba ngả của một hunk trong merge diff3.
 *
 * `base` là tổ tiên chung, `ours` là phía HEAD, `theirs` là phía đang trộn vào.
 * Một hunk XUNG ĐỘT khi cả `ours` lẫn `theirs` khác `base` và khác nhau.
 */
export interface MergeHunk {
  /** Vị trí bắt đầu trong file KẾT QUẢ, đếm từ 0. */
  readonly start: number;
  readonly base: Lines;
  readonly ours: Lines;
  readonly theirs: Lines;
  readonly conflicted: boolean;
}

/**
 * Một file đang xung đột, đủ dữ liệu cho giao diện giải conflict (17.O).
 *
 * ⚠ `markedLines` là nội dung ĐÃ chèn marker `<<<<<<<` / `=======` / `>>>>>>>`,
 * tức là đúng thứ nằm trong worktree lúc này. Giữ cả hai — `hunks` cho giao
 * diện chọn-hunk, `markedLines` cho người chơi sửa tay bằng editor — và đó
 * KHÔNG phải dữ liệu lặp: người chơi được phép sửa `markedLines` thành bất cứ
 * thứ gì, kể cả thứ không khớp hunk nào.
 */
export interface ConflictFile {
  readonly path: FilePath;
  readonly hunks: readonly MergeHunk[];
  readonly oursLabel: string;
  readonly theirsLabel: string;
}

/**
 * Thao tác đang dở dang. `null` khi repo sạch.
 *
 * Sự tồn tại của kiểu này là điều kiện cho `--continue` / `--abort` / `--skip`
 * (bài G29), và cho `git merge --abort` (bài G18).
 */
export type PendingOp =
  | {
      readonly kind: 'merge';
      /** Commit đang được trộn VÀO HEAD. */
      readonly theirs: Oid;
      readonly theirsLabel: string;
      /** Oid HEAD lúc bắt đầu — `--abort` quay về đây. */
      readonly originalHead: Oid;
      readonly conflicts: readonly ConflictFile[];
    }
  | {
      readonly kind: 'rebase';
      readonly onto: Oid;
      readonly originalHead: Oid;
      readonly originalRef: RefName | null;
      /** Các commit CÒN LẠI phải áp, theo thứ tự. Phần tử [0] là cái đang kẹt. */
      readonly remaining: readonly RebaseStep[];
      readonly conflicts: readonly ConflictFile[];
    }
  | {
      readonly kind: 'cherry-pick';
      readonly picks: readonly Oid[];
      readonly originalHead: Oid;
      readonly conflicts: readonly ConflictFile[];
    }
  | {
      readonly kind: 'revert';
      readonly target: Oid;
      readonly originalHead: Oid;
      readonly conflicts: readonly ConflictFile[];
    };

/** Một dòng trong kịch bản `git rebase -i` (bài G12). */
export interface RebaseStep {
  readonly action: 'pick' | 'squash' | 'fixup' | 'drop' | 'reword' | 'edit';
  readonly oid: Oid;
  /** Chỉ có nghĩa với `reword`/`squash`. */
  readonly message?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. KHO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Một kho git.
 *
 * ⚠ Kho `origin` dùng CÙNG kiểu này, và `index`/`worktree`/`stash`/`pending`
 * của nó luôn rỗng. Cố ý: một kiểu `BareRepo` riêng sẽ bắt mọi hàm nhận kho
 * phải nhận union, và điều đó không mua được gì — game không bao giờ để người
 * chơi `add`/`commit` thẳng vào `origin`. Bot đồng đội thì có, nhưng bot thao
 * tác qua một `Repo` tạm rồi push, đúng như một đồng nghiệp thật.
 */
export interface Repo {
  readonly objects: ObjectStore;
  readonly refs: Refs;
  readonly head: Head;
  readonly index: Index;
  readonly worktree: Worktree;
  readonly reflog: Reflog;
  readonly stash: readonly StashEntry[];
  readonly pending: PendingOp | null;
}

/** Trạng thái một pull request mô phỏng (bài G23–G24). */
export interface PullRequest {
  readonly number: number;
  readonly title: string;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly state: 'open' | 'merged' | 'closed';
  readonly reviews: readonly PullRequestReview[];
  /** Đã merge bằng cách nào — ba nút merge cho ra ba hình dạng lịch sử (G24). */
  readonly mergedWith: 'merge' | 'squash' | 'rebase' | null;
}

export interface PullRequestReview {
  readonly author: string;
  readonly verdict: 'approve' | 'request-changes' | 'comment';
  readonly body: string;
  readonly logicalTime: number;
}

/**
 * Một hành động của bot đồng đội, đã LÊN LỊCH theo đồng hồ logic.
 *
 * Bot là tất định: nó không "quyết định" gì cả, nó chạy một kịch bản khai sẵn
 * trong level. `RngState` ở `GitWorld` chỉ dùng cho những chỗ level cố ý muốn
 * biến thiên theo seed (ví dụ bài OJ sinh đề ngẫu nhiên ở P18), KHÔNG dùng cho
 * bot — một đồng đội hành động khác nhau giữa hai lần phát lại là hỏng thẳng
 * việc chấm lại.
 */
export interface BotAction {
  /** Chạy khi `world.logicalTime` chạm đúng giá trị này. */
  readonly atLogicalTime: number;
  readonly author: string;
  readonly script: readonly string[];
  /** Hiện trên HUD để người chơi biết chuyện gì vừa xảy ra. Tiếng Việt. */
  readonly announce: string;
}

/**
 * Toàn bộ thế giới của một lượt chơi. Đây là thứ được băm để so trạng thái, và
 * là thứ `undo` giữ bản sao.
 */
export interface GitWorld {
  readonly local: Repo;
  /** `null` = level một kho (toàn bộ chương 1). */
  readonly origin: Repo | null;
  /**
   * Tăng đúng 1 mỗi lệnh CÓ TÁC DỤNG. Một lệnh chỉ đọc (`git log`, `git status`)
   * KHÔNG tăng nó — nếu tăng thì bot sẽ hành động chỉ vì người chơi nhìn quanh,
   * và một người chơi cẩn thận bị phạt vì cẩn thận.
   */
  readonly logicalTime: number;
  readonly rng: RngState;
  /** Kịch bản bot còn CHƯA chạy. Chạy xong thì bị lấy ra khỏi mảng. */
  readonly bots: readonly BotAction[];
  readonly pullRequests: readonly PullRequest[];
  /** Tên người chơi, đi vào `Commit.author`. Mặc định `'Bạn'`. */
  readonly author: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. KẾT QUẢ CHẠY LỆNH
// ═══════════════════════════════════════════════════════════════════════════

export type OutputTone = 'plain' | 'success' | 'warn' | 'error' | 'hint';

export interface OutputLine {
  readonly text: string;
  readonly tone: OutputTone;
}

/**
 * Mã lỗi. Đóng, và có chủ ý: mỗi mã ứng với MỘT bài học, nên thêm mã là một
 * quyết định nội dung chứ không phải một tiện ích.
 */
export type GitErrorCode =
  | 'unknown-command'
  | 'unknown-flag'
  | 'bad-usage'
  | 'not-a-ref'
  | 'not-a-commit'
  | 'path-not-found'
  | 'nothing-to-commit'
  | 'branch-exists'
  | 'branch-missing'
  | 'branch-checked-out'
  | 'detached-head-warning'
  | 'non-fast-forward'
  | 'stale-lease'
  | 'merge-conflict'
  | 'operation-in-progress'
  | 'no-operation-in-progress'
  | 'no-remote'
  | 'no-upstream'
  | 'stash-empty'
  | 'unmerged-paths'
  | 'not-allowed-here';

/**
 * Lỗi **GIẢI THÍCH TRẠNG THÁI**, không chỉ báo sai. Đây là §17.I.4 và nó là một
 * yêu cầu sản phẩm, không phải một chỗ để lịch sự.
 *
 * Khảo sát ICTERI §5.7 đo được "blind-testing effect": sinh viên thử đại lệnh
 * vì không đọc nổi thông báo lỗi của git thật. `message` nói CÁI GÌ sai;
 * `explain` nói repo ĐANG ở trạng thái nào khiến nó sai; `suggest` nói bước tiếp
 * theo hợp lý — kể cả "lệnh gần đúng" khi người chơi gõ nhầm tên lệnh.
 *
 * Cả ba bằng tiếng Việt. Thuật ngữ hạ tầng giữ tiếng Anh theo quy ước repo:
 * commit, branch, merge, rebase, index, worktree, HEAD, stash, remote.
 */
export interface GitError {
  readonly code: GitErrorCode;
  readonly message: string;
  readonly explain: string;
  readonly suggest?: string;
}

/**
 * Kết quả chạy một dòng lệnh.
 *
 * ⚠ Khi `error !== null` thì `world` là trạng thái **CŨ, không đổi**. Một lệnh
 * hỏng không được để lại nửa tác dụng — đó là thứ làm người học mất niềm tin
 * vào công cụ nhanh nhất, và nó phá luôn `undo`.
 *
 * Ngoại lệ DUY NHẤT, có tên: `merge-conflict` và `unmerged-paths` trả `error`
 * kèm `world` ĐÃ ĐỔI (pending op được đặt vào). Xung đột không phải lỗi của
 * người chơi — đó chính là bài G18 — nhưng nó phải hiện bằng giọng lỗi để người
 * chơi dừng lại và đọc.
 */
export interface CommandResult {
  readonly world: GitWorld;
  readonly output: readonly OutputLine[];
  readonly error: GitError | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. VIEW — ranh giới engine ↔ renderer (2D SVG và 3D dùng CÙNG một view)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Một commit như renderer nhìn thấy.
 *
 * ⚠ `x`/`lane` do `core/layout/` tính, KHÔNG do engine tính. Engine không biết
 * gì về toạ độ. Hai renderer nhận cùng `GitView` và phải ra **cùng tập node và
 * cạnh** — đó là ô nghiệm thu AC-B, và nó so TẬP chứ không so pixel.
 */
export interface CommitNodeView {
  readonly oid: Oid;
  readonly shortOid: string;
  readonly message: string;
  readonly author: string;
  readonly parents: readonly Oid[];
  readonly logicalTime: number;
  /**
   * Còn ref nào với tới được không. `false` = commit "đã mất" — vẫn vẽ, nhưng
   * mờ. Toàn bộ chương 3 sống trên trường này.
   */
  readonly reachable: boolean;
  /** Nằm ở kho nào. Hai kho là hai khối không gian tách rời (design §3.5). */
  readonly repo: 'local' | 'origin';
  /** Trạng thái nhấn mạnh cho tầng trình bày. */
  readonly accent: CommitAccent;
}

/**
 * Mã hoá **BA KÊNH** cho mỗi trạng thái: màu + hình học + chuyển động
 * (design §4.6, và §17.C.4 biến nó thành hạng mục có tên).
 *
 * Một trạng thái chỉ phân biệt bằng màu là một trạng thái người mù màu không
 * đọc được, và ô nghiệm thu a11y của nền tảng không cho qua.
 */
export type CommitAccent =
  | 'normal'
  /** Đang được HEAD trỏ tới. */
  | 'head'
  /** Vừa được tạo bởi lệnh vừa chạy. */
  | 'fresh'
  /** Bản CŨ sau rebase/amend — còn trong store, không ai trỏ tới. */
  | 'orphaned'
  /** Là bản sao của một commit khác (cherry-pick). */
  | 'duplicate'
  /** Đang xung đột. */
  | 'conflicted';

export type EdgeKind =
  /** Cạnh cha-con của DAG commit. */
  | 'parent'
  /** Cha thứ hai của một commit merge — vẽ khác để thấy được chỗ hai nhánh gặp. */
  | 'merge-parent'
  /** Sợi chỉ mờ từ bản sao về nguồn (cherry-pick). */
  | 'cherry-source'
  /** Nối một commit local với bản tương ứng ở origin (sau push/fetch). */
  | 'remote-mirror';

/**
 * ⚠ KHÔNG dùng lại `EdgeView` của `k8s/contract.ts`, và đó là quyết định có
 * chủ ý (plan §17.A.4). Cạnh `owns`/`selects`/`mounts`/`routes` của Kubernetes
 * và cạnh cha-con của một DAG commit không phải cùng một thứ dù cùng gọi là
 * "cạnh": cái trước là quan hệ SỞ HỮU giữa hai object cùng tồn tại, cái sau là
 * quan hệ THỜI GIAN bất biến. Gộp chúng lại sẽ đẻ ra một union `kind` mà không
 * renderer nào xử hết được.
 */
export interface GitEdgeView {
  readonly from: Oid;
  readonly to: Oid;
  readonly kind: EdgeKind;
}

/** Nhãn ref bám vào một commit. */
export interface RefBadgeView {
  readonly name: RefName;
  /** Dạng người chơi đọc: `main`, `origin/main`, `v1.0`. */
  readonly shortName: string;
  readonly oid: Oid;
  readonly kind: 'branch' | 'remote' | 'tag' | 'head';
  readonly repo: 'local' | 'origin';
  /** HEAD đang trỏ vào ref này. */
  readonly isCurrent: boolean;
}

/** Một file trong một trong ba vùng, cho mini-map và cho tầng 3D ba mặt phẳng. */
export interface FileCellView {
  readonly path: FilePath;
  readonly zone: 'worktree' | 'index' | 'head';
  readonly status: FileStatus;
}

export type FileStatus =
  | 'unchanged'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'untracked'
  | 'conflicted';

/**
 * Toàn bộ thứ renderer cần. **Thuần dữ liệu** — không hàm, không tham chiếu
 * ngược về `GitWorld`, để serialize được (17.Q xuất/nhập JSON) và so được bằng
 * test.
 */
export interface GitView {
  readonly nodes: readonly CommitNodeView[];
  readonly edges: readonly GitEdgeView[];
  readonly refs: readonly RefBadgeView[];
  readonly files: readonly FileCellView[];
  readonly head: Head;
  readonly detached: boolean;
  readonly pending: PendingOp | null;
  readonly hasOrigin: boolean;
  readonly logicalTime: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. LEVEL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Khai báo một commit trong trạng thái ĐẦU của level.
 *
 * `id` là định danh NỘI BỘ của spec (`'c1'`, `'feat-a'`), KHÔNG phải Oid — Oid
 * chỉ sinh ra lúc dựng, và người soạn level không được phép biết trước nó. Đây
 * là điều làm level viết được bằng tay.
 */
export interface CommitSpec {
  readonly id: string;
  /** id của các spec khác. Rỗng/vắng = commit gốc. */
  readonly parents?: readonly string[];
  readonly message: string;
  /** Mặc định `'Bạn'`. Đặt tên khác để dựng lịch sử có nhiều người. */
  readonly author?: string;
  /**
   * Thay đổi file so với cha thứ nhất. `null` = xoá file.
   *
   * Chuỗi được tách theo `\n` thành `Lines`; mảng dùng nguyên. Cho phép chuỗi vì
   * template literal nhiều dòng đọc dễ hơn hẳn khi viết 32 level bằng tay.
   */
  readonly changes?: Readonly<Record<FilePath, string | readonly string[] | null>>;
}

/** Khai báo kho `origin` của level. */
export interface OriginSpec {
  /** Nhánh của origin → id commit spec. */
  readonly branches: Readonly<Record<string, string>>;
  /**
   * Ref theo dõi của LOCAL (`refs/remotes/origin/*`) → id commit spec.
   *
   * Tách khỏi `branches` là chủ ý và là cả bài G14–G15: `origin/main` là thứ
   * local NHỚ về origin lần cuối fetch, không phải thứ origin ĐANG có. Hai cái
   * lệch nhau chính là tình huống dạy được.
   */
  readonly tracking?: Readonly<Record<string, string>>;
}

/**
 * Trạng thái đầu của một level, khai báo — không phải mã dựng.
 *
 * Vì sao khai báo: 32 level nhân với một hàm dựng mỗi level là 32 chỗ có thể
 * sai khác nhau. Một spec thuần dữ liệu thì `git/world-spec.ts` dựng, và test
 * của `world-spec.ts` gác cho cả 32.
 */
export interface WorldSpec {
  /** Lịch sử dựng sẵn, theo thứ tự tô-pô (cha trước con). */
  readonly commits?: readonly CommitSpec[];
  /** Tên nhánh (ngắn) → id commit spec. */
  readonly branches?: Readonly<Record<string, string>>;
  readonly tags?: Readonly<Record<string, string>>;
  /** Tên nhánh ngắn, hoặc `{ detached: <id spec> }`. Mặc định `'main'`. */
  readonly head?: string | { readonly detached: string };
  /** File trong worktree NGOÀI phần lịch sử dựng ra. Dùng cho file chưa track. */
  readonly worktree?: Readonly<Record<FilePath, string | readonly string[]>>;
  /** File đã `add` sẵn. Dùng để dựng bài `reset` (G09). */
  readonly staged?: readonly FilePath[];
  readonly origin?: OriginSpec;
  readonly bots?: readonly BotAction[];
  readonly author?: string;
}

/**
 * Tên vị từ chấm bài. Đóng — `git/predicates.ts` hiện thực đúng danh sách này,
 * và có một test khẳng định hai bên khớp nhau cả hai chiều (không vị từ nào
 * khai mà không hiện thực, không hiện thực nào không khai).
 *
 * ⛔ CHẤM THEO **TRẠNG THÁI**, KHÔNG THEO LỆNH ĐÃ GÕ. Đây là mô hình của Learn
 * Git Branching và là mô hình phải theo. gitmastery.me chấm bằng khớp mẫu lệnh
 * (`LevelRequirement { command, requiresArgs[] }`), và hệ quả đo được là: gõ
 * đúng lệnh mà repo sai bét vẫn qua bài, và không thể có nhiều lời giải hợp lệ.
 * Ô nghiệm thu AC-9 (mỗi level ≥ 2 lời giải) tồn tại để chứng minh ta không
 * trượt vào mô hình đó.
 */
export type GitPredicateName =
  /** Hình dạng DAG khớp cây đích, bỏ qua Oid. Cho bài rebase/cherry-pick. */
  | 'graphShapeMatches'
  /** Ref (ngắn) tồn tại. args: `{ ref }` */
  | 'refExists'
  /** Ref KHÔNG tồn tại — bài dọn nhánh thừa. args: `{ ref }` */
  | 'refAbsent'
  /** Hai ref trỏ cùng một commit. args: `{ a, b }` */
  | 'refsEqual'
  /** Ref trỏ vào commit có message khớp. args: `{ ref, message }` */
  | 'refPointsAtMessage'
  /** HEAD đang detached (hoặc không). args: `{ detached }` */
  | 'headDetached'
  /** Số commit từ ref về gốc theo cha thứ nhất. args: `{ ref, count }` */
  | 'commitCount'
  /** Lịch sử của ref tuyến tính (không commit nào 2 cha). args: `{ ref }` */
  | 'historyLinear'
  /** Tồn tại commit merge trong lịch sử của ref. args: `{ ref }` */
  | 'hasMergeCommit'
  /** Nội dung file trong worktree khớp chính xác. args: `{ path, lines }` */
  | 'worktreeFileEquals'
  /** File trong worktree KHÔNG còn marker conflict. args: `{ path }` */
  | 'noConflictMarkers'
  /** File có mặt/vắng trong worktree. args: `{ path, present }` */
  | 'worktreeFileExists'
  /** Index sạch (không có gì staged). args: `{}` */
  | 'indexClean'
  /** Worktree sạch so với HEAD. args: `{}` */
  | 'worktreeClean'
  /** File đang được staged. args: `{ path }` */
  | 'pathStaged'
  /** Commit mang message này còn với tới được. args: `{ message }` */
  | 'commitReachable'
  /** Commit mang message này KHÔNG còn với tới được — bài chương 3. args: `{ message }` */
  | 'commitUnreachable'
  /** Commit mang message này còn TRONG STORE (kể cả mất ref). args: `{ message }` */
  | 'commitInStore'
  /** Ref của origin trỏ vào commit có message khớp. args: `{ ref, message }` */
  | 'originRefPointsAtMessage'
  /** Ref theo dõi khớp nhánh tương ứng ở origin. args: `{ ref }` */
  | 'trackingUpToDate'
  /** Stash có đúng N mục. args: `{ count }` */
  | 'stashCount'
  /** Reflog của một ref có mục với op này. args: `{ ref, op }` */
  | 'reflogHasOp'
  /** Không còn thao tác dở dang. args: `{}` */
  | 'noPendingOp'
  /** PR ở trạng thái này. args: `{ number, state }` */
  | 'pullRequestState'
  /** Tag tồn tại và trỏ đúng chỗ. args: `{ tag, message }` */
  | 'tagPointsAtMessage';

/**
 * Một mục tiêu = **một testcase** (quyết định #20 của design doc).
 *
 * Verdict `AC` khi và chỉ khi mọi testcase `required` qua. Không qua hết thì
 * hiện `4/5` kèm testcase nào đỏ. **Không có trọng số riêng cho từng objective**
 * — thứ đó đã bị loại bỏ tường minh.
 */
export interface GitObjective {
  readonly id: string;
  /** Tiếng Việt, một câu, nói người chơi phải làm ĐƯỢC gì (không phải làm THẾ NÀO). */
  readonly label: string;
  readonly check: GitPredicateName;
  readonly args?: Readonly<Record<string, unknown>>;
  /** `false` = mục tiêu thưởng: ăn điểm, không chặn. Mỗi level cần ≥ 1 mục bắt buộc. */
  readonly required: boolean;
}

export interface GitCheatSheetEntry {
  readonly command: string;
  readonly explain: string;
}

/**
 * Tầng dạy học. **Level DẠY, bài OJ THỬ** — quy ước đã có ở `k8s/contract.ts`
 * và giữ nguyên cho game này.
 *
 * Hệ quả cụ thể: một level KHÓ vì tình huống phức tạp thì được; một level khó vì
 * giấu thông tin thì SAI CHỖ.
 */
export interface GitTeaching {
  /** Hiện TRƯỚC khi chơi. Markdown tiếng Việt, ≤ 250 từ. KHÔNG phải lời giải. */
  readonly primer: string;
  /** 2–6 mục tra nhanh cho ĐÚNG level này. Người chơi không nên phải rời game. */
  readonly cheatsheet: readonly GitCheatSheetEntry[];
  /** Hiện SAU khi thắng. 2–4 ý đúc kết, mỗi ý một câu. */
  readonly takeaways: readonly string[];
  readonly proTips?: readonly string[];
  /** Sai lầm phổ biến KÈM vì sao nó hấp dẫn. "Đừng làm X" không kèm lý do là vô dụng. */
  readonly pitfalls?: readonly string[];
}

export interface GitLevel {
  /**
   * `git-01-commit-la-object` — số hai chữ số, rồi slug tiếng Việt không dấu.
   *
   * ⛔ Con số là ĐỊNH DANH, không phải VỊ TRÍ chơi. Thứ tự chơi là thứ tự mảng
   * `GIT_LEVELS`. Đánh số lại một level là **mồ côi toàn bộ tiến độ đã lưu** của
   * mọi người đang chơi (`RunResult.levelId` nằm trong `localStorage`) — không
   * lỗi, không cảnh báo, chỉ là lịch sử biến mất.
   */
  readonly id: string;
  /** 1 = nắn lịch sử · 2 = làm việc nhóm · 3 = cứu hộ. */
  readonly chapter: 1 | 2 | 3;
  readonly title: string;
  /** Một câu, ≤ 20 từ, nói phải làm ĐƯỢC gì. Dòng chữ thường trực duy nhất trên màn. */
  readonly mission: string;
  /** Markdown tiếng Việt, ≤ 400 từ. Bối cảnh + việc cần làm, KHÔNG nói cách làm. */
  readonly brief: string;
  readonly difficulty: Difficulty;
  readonly setup: WorldSpec;
  /**
   * Cây ĐÍCH, chỉ cần khi level dùng `graphShapeMatches`. Dựng bằng cùng bộ
   * `world-spec.ts`, nên người soạn viết nó y như `setup`.
   */
  readonly target?: WorldSpec;
  /**
   * Lệnh người chơi được dùng ở level này, dạng động từ git (`add`, `commit`).
   * `null` = không giới hạn.
   *
   * ⚠ `null` nghĩa là CHO DÙNG MỌI LỆNH. Một mảng rỗng `[]` mang nghĩa NGƯỢC
   * LẠI — cấm mọi lệnh — và đó là cái bẫy đã cắn một lần ở `k8s/problem.ts`.
   */
  readonly allowedCommands: readonly string[] | null;
  readonly objectives: readonly GitObjective[];
  /** Thứ tự = thứ tự mở. Gợi ý sau phải cụ thể hơn gợi ý trước. */
  readonly hints: readonly string[];
  readonly teaching: GitTeaching;
  /** id bài lý thuyết ở `content/games/git/theory/`. `null` = level không có bài đọc. */
  readonly theoryId: string | null;
  /**
   * Một chuỗi lệnh chạy được và đạt HẾT mục tiêu bắt buộc.
   *
   * Ô nghiệm thu AC-8 chạy cái này cho cả 32 level rồi khẳng định AC. Không có
   * nó thì "level qua được" là một lời khai, không phải một phép đo.
   */
  readonly solutionCommands: readonly string[];
  /**
   * Lời giải THỨ HAI, **khác đường đi**, cũng đạt hết mục tiêu bắt buộc.
   *
   * Ô nghiệm thu AC-9 chạy cái này và khẳng định nó cũng AC — đó là bằng chứng
   * chấm theo TRẠNG THÁI chứ không theo lệnh. Một level mà hai lời giải chỉ khác
   * nhau ở thứ tự hai lệnh độc lập thì chưa chứng minh được gì; phải khác THẬT
   * (ví dụ `reset --hard ORIG` vs `revert`, hay `merge` vs `rebase` khi mục tiêu
   * không đòi hình dạng).
   */
  readonly altSolutionCommands: readonly string[];
  /** Số lệnh "chuẩn". Dùng chấm điểm, không dùng giới hạn. */
  readonly par: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. PHIÊN CHƠI — ranh giới engine ↔ giao diện
// ═══════════════════════════════════════════════════════════════════════════

export interface GitDispatchOutcome {
  readonly result: CommandResult;
  /** Bot nào vừa hành động vì lệnh này đẩy đồng hồ logic tới lượt nó. */
  readonly botAnnouncements: readonly string[];
}

/**
 * ⚠ `getView()` và `getWorld()` phải trả về **CÙNG MỘT THAM CHIẾU** cho tới khi
 * trạng thái thật sự đổi.
 *
 * React `useSyncExternalStore` so snapshot bằng `Object.is`; trả một object mới
 * mỗi lần gọi sẽ làm React render vô hạn. Đây là cái bẫy kinh điển của API đó,
 * ghi ra đây để không ai phải gỡ nó lúc 2 giờ sáng.
 */
export interface GitSession {
  getWorld(): GitWorld;
  getView(): GitView;
  getStatus(): import('../core/session-status.ts').SessionStatus;
  subscribe(listener: () => void): () => void;
  /** Chạy một dòng lệnh thô. Đây là đường DUY NHẤT trạng thái đổi. */
  run(command: string): GitDispatchOutcome;
  /** Mở gợi ý thứ `index`. Ghi vào nhật ký, có giá về điểm. */
  revealHint(index: number): void;
  /** Hoàn tác một bước (17.I.3). Không ghi vào nhật ký — xem chú thích dưới. */
  undo(): boolean;
  redo(): boolean;
  getLog(): import('../core/run-log.ts').RunLog<
    import('../core/run-log.ts').GitGameAction
  >;
  getOutput(): readonly OutputLine[];
}

/**
 * ⛔ `undo` CỐ Ý không phải một `GameAction` và không đi vào `RunLog`.
 *
 * Cùng lý do `setSpeed` của game K8s không đi vào nhật ký: nhật ký ghi thứ người
 * chơi LÀM VỚI REPO, không ghi thứ họ làm với giao diện. Một `undo` ghi vào nhật
 * ký sẽ bắt bên phát lại phải hiện thực một ngăn xếp hoàn tác chỉ để tua tới
 * đúng chỗ — trong khi kết quả cuối cùng giống hệt việc **không ghi lệnh bị hoàn
 * tác** ngay từ đầu.
 *
 * Nên `undo()` gỡ luôn action cuối khỏi nhật ký. Hệ quả phải biết và chấp nhận:
 * một người chơi mò mẫm rồi hoàn tác sẽ có nhật ký sạch hơn thực tế, tức
 * `commandsUsed` thấp hơn và điểm cao hơn. Đó là đánh đổi có ý thức — phạt việc
 * thử-rồi-sửa là phạt đúng thứ game muốn khuyến khích.
 */
export type UndoContract = never;
