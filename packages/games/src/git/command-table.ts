/**
 * Bảng lệnh **khai báo** của game Git (§17.I.2).
 *
 * ## Vì sao là dữ liệu chứ không phải một `switch`
 *
 * Bốn bên đọc cùng một mặt lệnh: bộ phân tích (`parser.ts`), bộ gợi ý Tab
 * (`suggest.ts`), thông báo lỗi (`errors.ts`), và HUD ở tầng giao diện. Mỗi bên
 * tự giữ một bản chép là bốn bản chép, và chúng lệch nhau **trong im lặng** —
 * đúng hình dạng lỗi mà `terminal-suggest.ts` của game K8s đã trả giá: bộ gợi ý
 * giữ bản chép chín động từ, engine thêm động từ, gợi ý cứ lặng lẽ thiếu đi còn
 * lệnh vẫn chạy đúng vì bên phân tích mới là bên quyết định.
 *
 * Nên ở đây mặt lệnh là DỮ LIỆU: thêm một cờ là sửa một dòng trong bảng này, và
 * cả bốn bên nhận được ngay. `rules/code-conventions.md` § "Data-Driven Over
 * Hardcoded": xoá bảng tĩnh thì mọi thứ phải hỏng, vì không còn nguồn nào khác.
 *
 * ## Ranh giới: bảng này nói CÚ PHÁP, không nói NGỮ NGHĨA
 *
 * Bảng biết `git reset` nhận 0–1 tham số và biết `--soft` là cờ hợp lệ. Bảng
 * KHÔNG biết `--soft` và `--hard` xung khắc, không biết ref có tồn tại không,
 * không biết index có gì. Những câu đó cần trạng thái repo và thuộc lane engine.
 * Giữ đúng ranh giới này là thứ làm bộ phân tích **thuần**.
 *
 * ## Cố tình bỏ
 *
 * `git config`, `git blame`, `git worktree`, `git submodule`, `git gc`,
 * `git rev-parse`, cờ `-C`/`--git-dir` đứng TRƯỚC động từ, và cú pháp
 * `git log -3` (viết tắt số). Không cái nào phục vụ 32 level của ba chương.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. ĐỘNG TỪ — union viết tay và mảng dữ liệu, kiểm lệch hai chiều
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Toàn bộ động từ git mà game hiểu.
 *
 * ⛔ Viết TAY, **không** suy ra từ `GIT_VERBS` bằng `(typeof GIT_VERBS)[number]`.
 *
 * Suy ra thì cặp kiểm dưới đây trở thành một phép kiểm không bao giờ đỏ được:
 * hai vế không thể lệch nhau khi một vế sinh ra từ vế kia, nên phép kiểm chỉ
 * còn là trang trí. Đây đúng là thứ `rules/green-that-proves-nothing.md` gọi
 * tên — một ô xanh không gác được gì. Khai độc lập hai vế thì chúng lệch được
 * THẬT, và vì lệch được nên phép kiểm mới có giá trị.
 */
export type GitVerb =
  | 'init'
  | 'add'
  | 'commit'
  | 'status'
  | 'diff'
  | 'log'
  | 'show'
  | 'branch'
  | 'switch'
  | 'checkout'
  | 'tag'
  | 'merge'
  | 'rebase'
  | 'cherry-pick'
  | 'revert'
  | 'reset'
  | 'stash'
  | 'reflog'
  | 'fsck'
  | 'bisect'
  | 'clone'
  | 'fetch'
  | 'push'
  | 'pull'
  | 'remote'
  | 'pr';

/**
 * Cùng danh sách, ở dạng **giá trị chạy được**.
 *
 * `GitVerb` biến mất lúc biên dịch, nên bộ gợi ý Tab không có cách nào duyệt
 * qua nó. Thứ tự mảng là thứ tự hiện trong danh sách gợi ý — nhóm theo chương
 * học (nền tảng → nhánh → nắn lịch sử → cứu hộ → kho từ xa), không theo bảng
 * chữ cái, vì người mới gõ `git ` cần thấy `add`/`commit` trước `bisect`.
 */
export const GIT_VERBS = [
  'init',
  'add',
  'commit',
  'status',
  'diff',
  'log',
  'show',
  'branch',
  'switch',
  'checkout',
  'tag',
  'merge',
  'rebase',
  'cherry-pick',
  'revert',
  'reset',
  'stash',
  'reflog',
  'fsck',
  'bisect',
  'clone',
  'fetch',
  'push',
  'pull',
  'remote',
  'pr',
] as const;

/* Chiều 1 — mọi phần tử của mảng phải là một động từ có thật trong union. */
const _verbsAreReal: readonly GitVerb[] = GIT_VERBS;
/* Chiều 2 — mọi động từ trong union phải có mặt trong mảng. */
const _verbsAreComplete: Exclude<GitVerb, (typeof GIT_VERBS)[number]> extends never
  ? true
  : false = true;
void _verbsAreReal;
void _verbsAreComplete;

// ═══════════════════════════════════════════════════════════════════════════
// 2. HÌNH DẠNG MỘT MỤC TRONG BẢNG
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tham số vị trí này là **thứ gì**.
 *
 * Chỉ có một bên đọc: bộ gợi ý Tab. `git switch <Tab>` phải ra tên nhánh thật
 * chứ không ra tên lệnh, và đó là toàn bộ lý do trường này tồn tại. Bộ phân tích
 * KHÔNG dùng nó — nó không kiểm tra ref có thật hay không, vì nó không thấy repo.
 */
export type ArgKind =
  | 'ref'
  | 'branch'
  | 'tag'
  | 'commit'
  | 'path'
  | 'remote'
  | 'number'
  | 'text';

export interface FlagSpec {
  /** Dạng chuẩn tắc, luôn có. Bộ phân tích ghi cờ vào kết quả dưới TÊN NÀY. */
  readonly long: string;
  /** `null` khi cờ không có dạng ngắn. */
  readonly short: string | null;
  readonly takesValue: boolean;
  /** Một dòng tiếng Việt — HUD hiện làm gợi ý, `errors.ts` nhét vào `explain`. */
  readonly summary: string;
  /**
   * Cảnh báo kèm theo khi cờ này được ĐỀ XUẤT trong một thông báo lỗi.
   *
   * Có mặt vì ô nghiệm thu AC-I đòi `git push --forse` phải vừa nêu `--force`
   * vừa nói `--force-with-lease` tồn tại. Viết thẳng câu đó vào `errors.ts` sẽ
   * là một `if` theo tên cờ — đúng thứ bảng này sinh ra để không phải có.
   */
  readonly caution: string | null;
}

/** `-D` của `git branch` là bí danh của `--delete --force`, không phải một cờ. */
export interface FlagAlias {
  readonly token: string;
  readonly expandsTo: readonly string[];
  readonly summary: string;
}

/** Phần nói về THAM SỐ VỊ TRÍ. Dùng chung cho động từ và cho lệnh con. */
export interface ArgShape {
  readonly minArgs: number;
  /** `Number.POSITIVE_INFINITY` = không giới hạn (ví dụ `git add a b c`). */
  readonly maxArgs: number;
  /**
   * Loại của từng vị trí. Phần tử CUỐI lặp lại cho mọi vị trí sau nó — nên
   * `['path']` nghĩa là "mọi tham số đều là path", còn `['remote','branch']`
   * nghĩa là vị trí 0 là remote, mọi vị trí từ 1 trở đi là branch.
   */
  readonly argKinds: readonly ArgKind[];
  /** Dòng cú pháp hiện trong lỗi sai số tham số. Tiếng Việt trong ngoặc nhọn. */
  readonly usage: string;
}

export interface SubSpec extends ArgShape {
  readonly name: string;
  readonly summary: string;
  /** Cờ CHỈ hợp lệ với lệnh con này. Cờ chung khai ở `CommandSpec.flags`. */
  readonly flags: readonly FlagSpec[];
}

export interface CommandSpec extends ArgShape {
  readonly verb: GitVerb;
  readonly summary: string;
  readonly flags: readonly FlagSpec[];
  readonly aliases: readonly FlagAlias[];
  /** `[]` = động từ không có lệnh con. */
  readonly subs: readonly SubSpec[];
  /**
   * Lệnh con dùng khi người chơi không nêu (`git stash` = `git stash push`).
   *
   * `null` KÈM `subs` không rỗng nghĩa là bắt buộc phải nêu lệnh con —
   * `git bisect` một mình vô nghĩa. Cố ý KHÔNG có thêm một cờ `subRequired`
   * riêng: nó sẽ luôn bằng `subs.length > 0 && defaultSub === null`, tức một
   * trường suy ra được, và `rules/code-conventions.md` § "No Derived Fields" cấm
   * lưu thứ tính được — hai trường nói cùng một điều thì sớm muộn cũng có một
   * trường nói sai.
   */
  readonly defaultSub: string | null;
  /**
   * Câu GIẢI THÍCH khi số tham số sai — không phải câu báo sai.
   *
   * §17.I.4: nói người chơi đang thiếu/thừa cái gì và vì sao lệnh cần nó, chứ
   * không chỉ nói "sai cú pháp". Đây là chỗ chống "blind-testing effect".
   */
  readonly usageError: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. HÀM DỰNG NGẮN — bảng dưới dài, và dài vì nội dung chứ không vì cú pháp
// ═══════════════════════════════════════════════════════════════════════════

function boolFlag(long: string, short: string | null, summary: string): FlagSpec {
  return { long, short, takesValue: false, summary, caution: null };
}

function valueFlag(long: string, short: string | null, summary: string): FlagSpec {
  return { long, short, takesValue: true, summary, caution: null };
}

function withCaution(flag: FlagSpec, caution: string): FlagSpec {
  return { ...flag, caution };
}

const NO_ALIASES: readonly FlagAlias[] = [];
const NO_SUBS: readonly SubSpec[] = [];
const NO_FLAGS: readonly FlagSpec[] = [];

/** Cờ `--continue`/`--abort`/`--skip` của một thao tác dở dang (`PendingOp`). */
function pendingFlags(op: string): readonly FlagSpec[] {
  return [
    boolFlag('--continue', null, `Chạy tiếp ${op} sau khi đã giải hết xung đột`),
    boolFlag('--abort', null, `Huỷ ${op}, đưa repo về đúng trạng thái trước khi bắt đầu`),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. BẢNG
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠ Với động từ có lệnh con, phần `ArgShape` **của chính động từ** không được
 * dùng: bộ phân tích luôn phân giải ra một `SubSpec` (nhờ `defaultSub`, hoặc
 * dừng lại bằng lỗi khi `defaultSub` là `null`) và đọc arity từ đó. Giữ `usage`
 * ở tầng động từ vì thông báo
 * "không có lệnh con X" cần in ra dòng cú pháp TỔNG.
 *
 * Kiểu `Readonly<Record<GitVerb, CommandSpec>>` là phép kiểm thứ ba, độc lập
 * với cặp kiểm ở §1: thiếu một động từ thì đỏ, thừa một khoá lạ cũng đỏ.
 */
export const GIT_COMMANDS: Readonly<Record<GitVerb, CommandSpec>> = {
  init: {
    verb: 'init',
    summary: 'Tạo một repo rỗng trong thư mục hiện tại',
    flags: NO_FLAGS,
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 1,
    argKinds: ['path'],
    usage: 'git init [<thư-mục>]',
    usageError: '`git init` nhận nhiều nhất một thư mục. Không nêu gì thì nó dùng thư mục hiện tại.',
  },
  add: {
    verb: 'add',
    summary: 'Đưa thay đổi từ worktree vào index',
    flags: [boolFlag('--all', '-A', 'Đưa MỌI thay đổi vào index, kể cả file đã xoá')],
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 1,
    maxArgs: Number.POSITIVE_INFINITY,
    argKinds: ['path'],
    usage: 'git add <đường-dẫn>… | git add . | git add -A',
    usageError:
      '`git add` cần biết đưa CÁI GÌ vào index. Nêu tên file, hoặc `.` cho thư mục hiện tại, hoặc `-A` cho mọi thay đổi.',
  },
  commit: {
    verb: 'commit',
    summary: 'Đóng nội dung đang có trong index thành một commit',
    flags: [
      valueFlag('--message', '-m', 'Thông điệp commit, viết thẳng trên dòng lệnh'),
      boolFlag('--all', '-a', 'Tự `add` mọi file ĐÃ THEO DÕI trước khi commit (file mới thì không)'),
      withCaution(
        boolFlag('--amend', null, 'Thay commit cuối bằng một commit mới thay vì tạo thêm'),
        'commit cũ không bị sửa mà bị THAY: Oid đổi, nên nếu commit đó đã push thì lần push sau sẽ bị từ chối non-fast-forward.',
      ),
      boolFlag('--allow-empty', null, 'Cho phép commit khi index không khác commit trước'),
    ],
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 0,
    argKinds: [],
    usage: 'git commit -m "<thông-điệp>"',
    usageError:
      '`git commit` không nhận tham số vị trí. Thông điệp đi qua cờ `-m`, ví dụ `git commit -m "sửa lỗi đăng nhập"`.',
  },
  status: {
    verb: 'status',
    summary: 'Xem worktree và index đang lệch nhau ở đâu',
    flags: NO_FLAGS,
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 0,
    argKinds: [],
    usage: 'git status',
    usageError: '`git status` không nhận tham số — nó luôn báo cáo toàn bộ repo.',
  },
  diff: {
    verb: 'diff',
    summary: 'So nội dung giữa worktree, index và commit',
    flags: [
      boolFlag('--staged', null, 'So index với commit cuối, tức "thứ sắp được commit"'),
      boolFlag('--cached', null, 'Tên cũ của `--staged`, y hệt nhau'),
    ],
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 2,
    argKinds: ['ref', 'ref'],
    usage: 'git diff [--staged] [<ref> [<ref>]] [-- <đường-dẫn>…]',
    usageError: '`git diff` so nhiều nhất hai ref. Muốn giới hạn theo file thì dùng `--` rồi liệt kê đường dẫn.',
  },
  log: {
    verb: 'log',
    summary: 'Đi ngược lịch sử từ một ref',
    flags: [
      boolFlag('--oneline', null, 'Mỗi commit một dòng: Oid rút gọn + thông điệp'),
      boolFlag('--graph', null, 'Vẽ khung nhánh bằng ký tự bên trái'),
      boolFlag('--all', null, 'Đi từ MỌI ref, không chỉ từ HEAD'),
      valueFlag('--max-count', '-n', 'Dừng sau N commit'),
    ],
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 2,
    argKinds: ['ref', 'ref'],
    usage: 'git log [--oneline] [--graph] [--all] [-n <số>] [<ref>] [-- <đường-dẫn>…]',
    usageError: '`git log` nhận nhiều nhất hai ref. Lọc theo file thì đặt `--` trước đường dẫn.',
  },
  show: {
    verb: 'show',
    summary: 'Xem trọn nội dung một commit',
    flags: NO_FLAGS,
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 1,
    argKinds: ['ref'],
    usage: 'git show [<ref>]',
    usageError: '`git show` xem MỘT ref. Không nêu gì thì nó xem commit HEAD đang trỏ tới.',
  },
  branch: {
    verb: 'branch',
    summary: 'Liệt kê, tạo, đổi tên hoặc xoá branch',
    flags: [
      boolFlag('--delete', '-d', 'Xoá branch, nhưng từ chối nếu branch chưa được merge'),
      boolFlag('--all', '-a', 'Liệt kê cả branch theo dõi remote'),
      boolFlag('--move', '-m', 'Đổi tên branch'),
      withCaution(
        boolFlag('--force', '-f', 'Bỏ qua phép kiểm an toàn'),
        'kèm `-d` thì branch bị xoá KỂ CẢ khi chưa merge — commit trên đó thành mồ côi và chỉ còn tìm lại được qua reflog.',
      ),
    ],
    aliases: [
      {
        token: '-D',
        expandsTo: ['-d', '-f'],
        summary: 'Xoá branch bất chấp đã merge hay chưa (viết tắt của `-d -f`)',
      },
    ],
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 2,
    argKinds: ['branch', 'branch'],
    usage: 'git branch [-a] | git branch <tên> | git branch -d <tên> | git branch -m <cũ> <mới>',
    usageError:
      '`git branch` nhận nhiều nhất hai tên: một tên để tạo hoặc xoá, hai tên khi đổi tên bằng `-m`.',
  },
  switch: {
    verb: 'switch',
    summary: 'Chuyển HEAD sang branch khác (bản thay thế rõ nghĩa của `checkout`)',
    flags: [
      valueFlag('--create', '-c', 'Tạo branch mới tại vị trí hiện tại rồi chuyển sang'),
      withCaution(
        boolFlag('--detach', null, 'Trỏ HEAD thẳng vào một commit, không qua branch'),
        'ở trạng thái detached HEAD, commit mới KHÔNG thuộc branch nào — chuyển đi chỗ khác là chúng thành mồ côi.',
      ),
    ],
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 1,
    argKinds: ['branch'],
    usage: 'git switch <branch> | git switch -c <branch-mới>',
    usageError:
      '`git switch` chuyển tới ĐÚNG MỘT branch. Tạo branch mới thì dùng `-c <tên>`, và khi đó không cần thêm tham số nào nữa.',
  },
  checkout: {
    verb: 'checkout',
    summary: 'Chuyển branch, hoặc lấy lại nội dung file từ một ref',
    flags: [valueFlag('--branch', '-b', 'Tạo branch mới tại vị trí hiện tại rồi chuyển sang')],
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 2,
    argKinds: ['ref', 'ref'],
    usage: 'git checkout <ref> | git checkout -b <branch-mới> | git checkout [<ref>] -- <đường-dẫn>…',
    usageError:
      '`git checkout` làm hai việc khác hẳn nhau: không có `--` thì nó chuyển HEAD, có `--` thì nó ghi đè file trong worktree. Nhiều nhất hai ref trước `--`.',
  },
  tag: {
    verb: 'tag',
    summary: 'Đặt một cái tên cố định lên một commit',
    flags: [
      boolFlag('--delete', '-d', 'Xoá tag — bỏ cái tên đi, commit nó trỏ vào thì vẫn nguyên'),
      boolFlag('--annotate', '-a', 'Tag có chú thích, tức một object riêng chứ không chỉ một con trỏ'),
      valueFlag('--message', '-m', 'Chú thích cho tag, đi cùng `-a`'),
      boolFlag('--list', '-l', 'Liệt kê tag đang có trong repo'),
    ],
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 2,
    argKinds: ['tag', 'ref'],
    usage: 'git tag [<tên> [<ref>]] | git tag -d <tên>',
    usageError:
      '`git tag` nhận nhiều nhất hai tham số: tên tag, rồi ref muốn gắn. Không nêu ref thì nó gắn vào HEAD.',
  },
  merge: {
    verb: 'merge',
    summary: 'Trộn lịch sử của một branch khác vào branch hiện tại',
    flags: [
      boolFlag('--abort', null, 'Huỷ merge đang dở, đưa repo về đúng trạng thái trước khi merge'),
      boolFlag('--no-ff', null, 'Luôn tạo commit merge, kể cả khi fast-forward được'),
      boolFlag('--squash', null, 'Gom mọi thay đổi vào index nhưng KHÔNG tạo commit merge'),
    ],
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 1,
    argKinds: ['branch'],
    usage: 'git merge <branch> | git merge --abort',
    usageError:
      '`git merge` trộn ĐÚNG MỘT branch vào branch hiện tại. Không nêu branch thì chỉ hợp lệ khi đi cùng `--abort`.',
  },
  rebase: {
    verb: 'rebase',
    summary: 'Áp lại các commit của branch hiện tại lên một điểm gốc khác',
    flags: [
      boolFlag('--interactive', '-i', 'Mở kịch bản để sửa, gom, bỏ hoặc đổi lời từng commit'),
      valueFlag('--onto', null, 'Chọn điểm gốc mới, tách khỏi phép chọn tự động'),
      ...pendingFlags('rebase'),
      boolFlag('--skip', null, 'Bỏ qua commit đang kẹt rồi chạy tiếp'),
    ],
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 2,
    argKinds: ['branch', 'branch'],
    usage: 'git rebase <branch> | git rebase -i <ref> | git rebase --onto <mới> <cũ> [<branch>]',
    usageError:
      '`git rebase` nhận nhiều nhất hai ref. Không nêu ref nào thì chỉ hợp lệ khi đi cùng `--continue`, `--abort` hoặc `--skip`.',
  },
  'cherry-pick': {
    verb: 'cherry-pick',
    summary: 'Chép nội dung thay đổi của một commit sang branch hiện tại',
    flags: [
      ...pendingFlags('cherry-pick'),
      boolFlag('--skip', null, 'Bỏ qua commit đang kẹt rồi chạy tiếp'),
    ],
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: Number.POSITIVE_INFINITY,
    argKinds: ['commit'],
    usage: 'git cherry-pick <commit>… | git cherry-pick --abort',
    usageError:
      '`git cherry-pick` cần ít nhất một commit để chép. Không nêu commit nào thì chỉ hợp lệ khi đi cùng `--continue`, `--abort` hoặc `--skip`.',
  },
  revert: {
    verb: 'revert',
    summary: 'Tạo commit MỚI đảo ngược nội dung một commit cũ',
    flags: pendingFlags('revert'),
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: Number.POSITIVE_INFINITY,
    argKinds: ['commit'],
    usage: 'git revert <commit>… | git revert --abort',
    usageError:
      '`git revert` cần ít nhất một commit để đảo. Không nêu commit nào thì chỉ hợp lệ khi đi cùng `--continue` hoặc `--abort`.',
  },
  reset: {
    verb: 'reset',
    summary: 'Kéo branch hiện tại về một commit khác, và tuỳ chọn kéo theo index/worktree',
    flags: [
      boolFlag('--soft', null, 'Chỉ chuyển branch. Index và worktree giữ nguyên'),
      boolFlag('--mixed', null, 'Chuyển branch và đặt lại index. Worktree giữ nguyên (mặc định)'),
      withCaution(
        boolFlag('--hard', null, 'Chuyển branch, đặt lại cả index lẫn worktree'),
        'thay đổi chưa commit trong worktree bị GHI ĐÈ và không có reflog nào tìm lại được — reflog chỉ nhớ commit, không nhớ worktree.',
      ),
    ],
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 1,
    argKinds: ['ref'],
    usage: 'git reset [--soft|--mixed|--hard] [<ref>] [-- <đường-dẫn>…]',
    usageError:
      '`git reset` kéo về ĐÚNG MỘT ref. Không nêu ref thì nó dùng HEAD, tức chỉ đụng tới index.',
  },
  stash: {
    verb: 'stash',
    summary: 'Cất thay đổi đang dở sang một chỗ riêng để worktree sạch trở lại',
    flags: NO_FLAGS,
    aliases: NO_ALIASES,
    subs: [
      {
        name: 'push',
        summary: 'Cất thay đổi hiện tại vào stash',
        flags: [valueFlag('--message', '-m', 'Đặt tên cho mục stash để sau còn nhận ra')],
        minArgs: 0,
        maxArgs: Number.POSITIVE_INFINITY,
        argKinds: ['path'],
        usage: 'git stash push [-m "<tên>"] [<đường-dẫn>…]',
      },
      {
        name: 'pop',
        summary: 'Lấy một mục stash ra và XOÁ nó khỏi stash',
        flags: NO_FLAGS,
        minArgs: 0,
        maxArgs: 1,
        argKinds: ['text'],
        usage: 'git stash pop [<mục>]',
      },
      {
        name: 'list',
        summary: 'Xem các mục đang cất',
        flags: NO_FLAGS,
        minArgs: 0,
        maxArgs: 0,
        argKinds: [],
        usage: 'git stash list',
      },
      {
        name: 'apply',
        summary: 'Lấy một mục stash ra nhưng GIỮ nó lại trong stash',
        flags: NO_FLAGS,
        minArgs: 0,
        maxArgs: 1,
        argKinds: ['text'],
        usage: 'git stash apply [<mục>]',
      },
      {
        name: 'drop',
        summary: 'Bỏ hẳn một mục stash',
        flags: NO_FLAGS,
        minArgs: 0,
        maxArgs: 1,
        argKinds: ['text'],
        usage: 'git stash drop [<mục>]',
      },
    ],
    defaultSub: 'push',
    minArgs: 0,
    maxArgs: 0,
    argKinds: [],
    usage: 'git stash [push|pop|list|apply|drop]',
    usageError: '`git stash` không nêu lệnh con thì được hiểu là `git stash push`.',
  },
  reflog: {
    verb: 'reflog',
    summary: 'Xem mọi vị trí mà một ref ĐÃ TỪNG trỏ tới — đường cứu hộ chính',
    flags: NO_FLAGS,
    aliases: NO_ALIASES,
    subs: [
      {
        name: 'show',
        summary: 'Liệt kê lịch sử di chuyển của một ref',
        flags: NO_FLAGS,
        minArgs: 0,
        maxArgs: 1,
        argKinds: ['ref'],
        usage: 'git reflog show [<ref>]',
      },
    ],
    defaultSub: 'show',
    minArgs: 0,
    maxArgs: 0,
    argKinds: [],
    usage: 'git reflog [show] [<ref>]',
    usageError: '`git reflog` xem lịch sử của MỘT ref. Không nêu ref thì nó xem HEAD.',
  },
  fsck: {
    verb: 'fsck',
    summary: 'Rà object store tìm commit không còn ref nào trỏ tới',
    flags: [
      boolFlag('--lost-found', null, 'Liệt kê object mồ côi, tức thứ chỉ còn tìm lại được bằng Oid'),
    ],
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 0,
    argKinds: [],
    usage: 'git fsck [--lost-found]',
    usageError: '`git fsck` rà toàn bộ object store nên không nhận tham số vị trí.',
  },
  bisect: {
    verb: 'bisect',
    summary: 'Chia đôi lịch sử để tìm commit đầu tiên làm hỏng',
    flags: NO_FLAGS,
    aliases: NO_ALIASES,
    subs: [
      {
        name: 'start',
        summary: 'Bắt đầu một phiên bisect',
        flags: NO_FLAGS,
        minArgs: 0,
        maxArgs: 2,
        argKinds: ['commit', 'commit'],
        usage: 'git bisect start [<xấu> <tốt>]',
      },
      {
        name: 'good',
        summary: 'Đánh dấu commit đang xét là CÒN TỐT',
        flags: NO_FLAGS,
        minArgs: 0,
        maxArgs: 1,
        argKinds: ['commit'],
        usage: 'git bisect good [<commit>]',
      },
      {
        name: 'bad',
        summary: 'Đánh dấu commit đang xét là ĐÃ HỎNG',
        flags: NO_FLAGS,
        minArgs: 0,
        maxArgs: 1,
        argKinds: ['commit'],
        usage: 'git bisect bad [<commit>]',
      },
      {
        name: 'reset',
        summary: 'Kết thúc phiên bisect và quay về chỗ cũ',
        flags: NO_FLAGS,
        minArgs: 0,
        maxArgs: 0,
        argKinds: [],
        usage: 'git bisect reset',
      },
    ],
    defaultSub: null,
    minArgs: 0,
    maxArgs: 0,
    argKinds: [],
    usage: 'git bisect <start|good|bad|reset>',
    usageError:
      '`git bisect` một mình không làm gì cả — nó là một phiên nhiều bước, nên phải nói bước nào: `start`, `good`, `bad` hay `reset`.',
  },
  clone: {
    verb: 'clone',
    summary: 'Chép một kho từ xa về thành kho cục bộ',
    flags: NO_FLAGS,
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 2,
    argKinds: ['text', 'path'],
    usage: 'git clone [<nguồn> [<thư-mục>]]',
    usageError: '`git clone` nhận nhiều nhất hai tham số: nguồn muốn chép, rồi thư mục đích.',
  },
  fetch: {
    verb: 'fetch',
    summary: 'Kéo commit mới từ remote về, KHÔNG đụng tới branch hiện tại',
    flags: NO_FLAGS,
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 2,
    argKinds: ['remote', 'branch'],
    usage: 'git fetch [<remote> [<branch>]]',
    usageError: '`git fetch` nhận nhiều nhất một remote và một branch. Không nêu gì thì nó dùng remote mặc định.',
  },
  push: {
    verb: 'push',
    summary: 'Đẩy commit của branch cục bộ lên remote',
    flags: [
      withCaution(
        boolFlag('--force', null, 'Ghi đè branch trên remote bất chấp lịch sử bên đó'),
        '`--force-with-lease` tồn tại và làm đúng việc bạn muốn: nó từ chối ghi đè khi remote đã có commit mà bạn CHƯA nhìn thấy. `--force` thì không kiểm gì cả, nên nó xoá được commit của đồng đội mà bạn không hề biết.',
      ),
      boolFlag(
        '--force-with-lease',
        null,
        'Ghi đè, nhưng từ chối nếu remote đã đổi kể từ lần fetch gần nhất',
      ),
      boolFlag('--set-upstream', '-u', 'Ghi nhớ remote và branch này làm mặc định cho lần sau'),
      withCaution(
        boolFlag('--delete', null, 'Xoá một branch TRÊN remote'),
        'branch bị xoá ở phía remote, nên mọi người khác cũng mất nó ở lần fetch kế tiếp.',
      ),
    ],
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 2,
    argKinds: ['remote', 'branch'],
    usage: 'git push [<remote> [<branch>]] | git push -u <remote> <branch>',
    usageError:
      '`git push` nhận nhiều nhất một remote và một branch. Không nêu gì thì nó dùng upstream đã ghi nhớ — và nếu chưa có upstream thì đó chính là lỗi bạn đang gặp.',
  },
  pull: {
    verb: 'pull',
    summary: 'Fetch rồi trộn ngay vào branch hiện tại',
    flags: [
      boolFlag('--rebase', null, 'Trộn bằng rebase thay vì merge, nên lịch sử không rẽ nhánh'),
    ],
    aliases: NO_ALIASES,
    subs: NO_SUBS,
    defaultSub: null,
    minArgs: 0,
    maxArgs: 2,
    argKinds: ['remote', 'branch'],
    usage: 'git pull [--rebase] [<remote> [<branch>]]',
    usageError: '`git pull` nhận nhiều nhất một remote và một branch.',
  },
  remote: {
    verb: 'remote',
    summary: 'Quản lý danh sách kho từ xa',
    flags: NO_FLAGS,
    aliases: NO_ALIASES,
    subs: [
      {
        name: 'list',
        summary: 'Liệt kê remote đang có',
        flags: [boolFlag('--verbose', '-v', 'Hiện kèm địa chỉ của từng remote')],
        minArgs: 0,
        maxArgs: 0,
        argKinds: [],
        usage: 'git remote [-v]',
      },
      {
        name: 'add',
        summary: 'Thêm một remote mới',
        flags: NO_FLAGS,
        minArgs: 2,
        maxArgs: 2,
        argKinds: ['remote', 'text'],
        usage: 'git remote add <tên> <địa-chỉ>',
      },
      {
        name: 'remove',
        summary: 'Bỏ một remote',
        flags: NO_FLAGS,
        minArgs: 1,
        maxArgs: 1,
        argKinds: ['remote'],
        usage: 'git remote remove <tên>',
      },
      {
        name: 'rename',
        summary: 'Đổi tên một remote',
        flags: NO_FLAGS,
        minArgs: 2,
        maxArgs: 2,
        argKinds: ['remote', 'remote'],
        usage: 'git remote rename <cũ> <mới>',
      },
      {
        name: 'show',
        summary: 'Xem chi tiết một remote',
        flags: NO_FLAGS,
        minArgs: 1,
        maxArgs: 1,
        argKinds: ['remote'],
        usage: 'git remote show <tên>',
      },
    ],
    defaultSub: 'list',
    minArgs: 0,
    maxArgs: 0,
    argKinds: [],
    usage: 'git remote [-v] | git remote <add|remove|rename|show> …',
    usageError: '`git remote` không nêu lệnh con thì chỉ liệt kê remote đang có.',
  },
  pr: {
    verb: 'pr',
    summary: 'Pull request mô phỏng — không gọi mạng, toàn bộ nằm trong bộ nhớ',
    flags: NO_FLAGS,
    aliases: NO_ALIASES,
    subs: [
      {
        name: 'open',
        summary: 'Mở một pull request từ branch hiện tại',
        flags: [
          valueFlag('--title', null, 'Tiêu đề pull request, dòng đồng đội nhìn thấy đầu tiên'),
          valueFlag('--base', null, 'Branch đích muốn trộn vào'),
        ],
        minArgs: 0,
        maxArgs: 0,
        argKinds: [],
        usage: 'git pr open --title "<tiêu-đề>" [--base <branch>]',
      },
      {
        name: 'list',
        summary: 'Xem các pull request đang mở',
        flags: NO_FLAGS,
        minArgs: 0,
        maxArgs: 0,
        argKinds: [],
        usage: 'git pr list',
      },
      {
        name: 'review',
        summary: 'Ghi một lượt review lên pull request',
        flags: [
          boolFlag('--approve', null, 'Chấp thuận: đồng ý cho trộn pull request này vào branch đích'),
          boolFlag('--request-changes', null, 'Yêu cầu sửa: chặn việc trộn cho tới khi tác giả đẩy thêm commit'),
          boolFlag('--comment', null, 'Chỉ bình luận, không ra phán quyết'),
          valueFlag('--message', '-m', 'Nội dung review, hiện kèm phán quyết trên pull request'),
        ],
        minArgs: 1,
        maxArgs: 1,
        argKinds: ['number'],
        usage: 'git pr review <số> --approve|--request-changes|--comment [-m "<nội-dung>"]',
      },
      {
        name: 'merge',
        summary: 'Trộn pull request vào branch đích',
        flags: [
          boolFlag('--squash', null, 'Gom mọi commit của PR thành MỘT commit trên branch đích'),
          boolFlag('--rebase', null, 'Áp từng commit của PR lên branch đích, không tạo commit merge'),
        ],
        minArgs: 1,
        maxArgs: 1,
        argKinds: ['number'],
        usage: 'git pr merge <số> [--squash|--rebase]',
      },
    ],
    defaultSub: null,
    minArgs: 0,
    maxArgs: 0,
    argKinds: [],
    usage: 'git pr <open|list|review|merge> …',
    usageError:
      '`git pr` một mình không làm gì cả. Nói rõ việc cần làm: `open`, `list`, `review` hay `merge`.',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 5. TRA CỨU — bên duy nhất được phép biết bảng có hình dạng gì
// ═══════════════════════════════════════════════════════════════════════════

/** `true` khi `token` là một động từ game hiểu. Thu hẹp kiểu cho bên gọi. */
export function isGitVerb(token: string): token is GitVerb {
  return Object.hasOwn(GIT_COMMANDS, token);
}

export function commandSpec(verb: GitVerb): CommandSpec {
  return GIT_COMMANDS[verb];
}

export function findSub(spec: CommandSpec, name: string): SubSpec | null {
  return spec.subs.find((sub) => sub.name === name) ?? null;
}

/**
 * Mọi cờ hợp lệ cho một lệnh: cờ chung của động từ, cộng cờ riêng của lệnh con.
 *
 * Trả mảng chứ không trả `Record` — thứ tự khai trong bảng là thứ tự hiện trong
 * gợi ý Tab, và một `Record` sẽ bắt bên gọi phải sắp lại qua
 * `deterministic.ts` chỉ để lấy lại đúng thứ tự đã có sẵn ở đây.
 */
export function flagsFor(spec: CommandSpec, sub: SubSpec | null): readonly FlagSpec[] {
  return sub === null ? spec.flags : [...spec.flags, ...sub.flags];
}

/**
 * Tập cờ **TỐI ĐA** của một động từ: cờ chung cộng cờ của MỌI lệnh con.
 *
 * Bộ phân tích cần nó vì phải trả lời "cờ này có nuốt token kế không" TRƯỚC khi
 * biết lệnh con là gì — xem chú thích hai-lượt ở đầu `parser.ts`. Tập tối đa chỉ
 * dùng đúng cho việc đó; phép kiểm cờ nào THỰC SỰ hợp lệ đi qua `flagsFor()`.
 *
 * An toàn vì trong phạm vi một động từ không có hai cờ trùng tên, và đó không
 * phải giả định: `command-table.test.ts` khẳng định nó cho cả 26 động từ.
 */
export function flagUniverse(spec: CommandSpec): readonly FlagSpec[] {
  return [...spec.flags, ...spec.subs.flatMap((sub) => sub.flags)];
}

/** Tìm cờ theo dạng dài HOẶC dạng ngắn. `null` khi lệnh này không có cờ đó. */
export function findFlag(
  flags: readonly FlagSpec[],
  token: string,
): FlagSpec | null {
  return flags.find((flag) => flag.long === token || flag.short === token) ?? null;
}

/** Tìm cờ theo MỘT ký tự trong cụm cờ gộp (`-am` hỏi lần lượt `a` rồi `m`). */
export function findShortFlag(
  flags: readonly FlagSpec[],
  char: string,
): FlagSpec | null {
  return flags.find((flag) => flag.short === `-${char}`) ?? null;
}

export function findAlias(spec: CommandSpec, token: string): FlagAlias | null {
  return spec.aliases.find((alias) => alias.token === token) ?? null;
}

/**
 * `ArgKind` của tham số vị trí thứ `index`.
 *
 * Phần tử cuối của `argKinds` lặp lại mãi — nên `git add a b c d` cho ra `path`
 * ở mọi vị trí mà bảng chỉ phải khai một lần. `null` khi lệnh không nhận tham
 * số vị trí nào, và bộ gợi ý đọc `null` là "đừng gợi ý gì ở đây".
 */
export function argKindAt(shape: ArgShape, index: number): ArgKind | null {
  if (shape.argKinds.length === 0) return null;
  const clamped = Math.min(index, shape.argKinds.length - 1);
  return shape.argKinds[clamped] ?? null;
}
