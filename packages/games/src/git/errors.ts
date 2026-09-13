/**
 * Lỗi **giải thích trạng thái** (§17.I.4) và phép tìm tên gần đúng.
 *
 * ## Đây là một hạng mục sản phẩm, không phải một chỗ để lịch sự
 *
 * Khảo sát ICTERI §5.7 đo được cái gọi là "blind-testing effect": sinh viên thử
 * đại lệnh vì không đọc nổi thông báo lỗi của git thật. Một người học nhận
 * `error: pathspec 'mian' did not match any file(s) known to git` sẽ không suy
 * ra được rằng họ gõ sai tên branch — họ gõ lại một lệnh khác, rồi một lệnh
 * khác nữa, và cái vòng đó chính là thứ làm họ tin git là thứ không hiểu được.
 *
 * Nên mọi `GitError` ở game này có ba phần, và cả ba đều bắt buộc có nghĩa:
 *
 * - `message` — CÁI GÌ sai. Một câu, nêu đích danh token gây lỗi.
 * - `explain` — repo hoặc mặt lệnh ĐANG ở trạng thái nào khiến nó sai. Đây là
 *   phần git thật không có, và là phần đắt nhất.
 * - `suggest` — bước tiếp theo hợp lý. Với lỗi gõ nhầm thì đây là lệnh gần đúng.
 *
 * ## Ranh giới với lane engine
 *
 * File này dựng lỗi cho những gì bộ phân tích tự thấy: tên lệnh, tên cờ, số
 * tham số. Những mã lỗi cần TRẠNG THÁI REPO (`nothing-to-commit`,
 * `non-fast-forward`, `merge-conflict`…) do lane engine dựng — nhưng dựng qua
 * `gitError()` ở đây, để hình dạng ba phần chỉ có một chỗ hiện thực.
 *
 * `notARefError` là ngoại lệ có chủ ý: nó cần danh sách ref nhưng nhận danh sách
 * đó qua THAM SỐ, nên vẫn thuần và vẫn thuộc về file này. Nó là chỗ phép tìm
 * tên gần đúng có giá trị nhất — `git switch mian` phải chỉ ra `main`.
 */

import type { GitError, GitErrorCode } from './contract.ts';
import { compareKeys } from './deterministic.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. KHOẢNG CÁCH CHỈNH SỬA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Khoảng cách Damerau-Levenshtein, biến thể OSA (optimal string alignment).
 *
 * Tự viết, hai chục dòng, và cố ý không thêm dependency cho chừng này mã — một
 * package npm cho việc này kéo theo cả một cây phụ thuộc vào bundle trình duyệt
 * của game, trong khi mã dưới đây không bao giờ phải sửa nữa.
 *
 * Vì sao Damerau chứ không Levenshtein trần: lỗi gõ phổ biến nhất của lập trình
 * viên là ĐẢO hai ký tự liền nhau. `gti` → `git` và `comimt` → `commit` là
 * khoảng cách 1 theo Damerau nhưng khoảng cách 2 theo Levenshtein, và ngưỡng đề
 * xuất đặt ở 1 cho từ ngắn nghĩa là Levenshtein sẽ bỏ sót đúng nhóm lỗi đó.
 *
 * "OSA" nghĩa là chỉ đảo hai ký tự LIỀN NHAU và mỗi vị trí chỉ được sửa một
 * lần. Biến thể đầy đủ đắt hơn và khác kết quả ở những cặp chuỗi mà không ai gõ
 * nhầm ra được trong thực tế.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a === '') return b.length;
  if (b === '') return a.length;

  // Hai hàng trước đó là đủ cho OSA; ma trận đầy đủ chỉ tốn bộ nhớ.
  let twoBack: number[] = [];
  let oneBack: number[] = [];
  for (let j = 0; j <= b.length; j += 1) oneBack.push(j);

  for (let i = 1; i <= a.length; i += 1) {
    // Khai TRONG vòng lặp: kết quả đọc ra từ `oneBack` sau vòng, nên `current`
    // không sống qua được một lượt. Khai ngoài kèm `= []` là một giá trị không
    // ai đọc — đúng thứ `no-useless-assignment` gác.
    const current: number[] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        (current[j - 1] ?? 0) + 1, // chèn
        (oneBack[j] ?? 0) + 1, // xoá
        (oneBack[j - 1] ?? 0) + cost, // thay
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (twoBack[j - 2] ?? 0) + 1); // đảo hai ký tự liền nhau
      }
      current.push(best);
    }
    twoBack = oneBack;
    oneBack = current;
  }
  return oneBack[b.length] ?? 0;
}

/**
 * Bao xa thì vẫn còn coi là "gõ nhầm" chứ không phải "một từ khác hẳn".
 *
 * Theo độ dài của thứ NGƯỜI CHƠI gõ, không theo độ dài ứng viên: `ls` không nên
 * gợi ra `log` (khoảng cách 2 trên một từ hai ký tự là gõ lại từ đầu), trong khi
 * `--force-with-lease` sai hai ký tự thì vẫn rõ ràng là cùng một cờ.
 */
function threshold(input: string): number {
  if (input.length <= 3) return 1;
  if (input.length <= 7) return 2;
  return 3;
}

/**
 * Những ứng viên gần `input` nhất, gần trước xa sau, nhiều nhất `limit` cái.
 *
 * Tiền tố thắng khoảng cách: `git st` phải ra `status` dù khoảng cách là 4. Người
 * gõ dở một từ không phải người gõ sai từ đó, và đối xử với hai ca này như nhau
 * sẽ làm mất đúng nhóm gợi ý hữu ích nhất lúc người chơi đang mò.
 *
 * Thứ tự trả về TẤT ĐỊNH: hoà khoảng cách thì phân giải bằng `compareKeys`, tức
 * so theo mã điểm Unicode chứ không theo locale. Một danh sách gợi ý đổi thứ tự
 * theo máy sẽ làm test dom của lane giao diện đỏ ngẫu nhiên.
 */
export function nearestNames(
  input: string,
  candidates: readonly string[],
  limit = 3,
): readonly string[] {
  if (input === '') return [];
  const max = threshold(input);
  const scored = candidates
    .map((name) => ({
      name,
      isPrefix: name.startsWith(input) && name !== input,
      distance: editDistance(input, name),
    }))
    .filter((item) => item.isPrefix || item.distance <= max);
  scored.sort((left, right) => {
    if (left.isPrefix !== right.isPrefix) return left.isPrefix ? -1 : 1;
    if (left.distance !== right.distance) return left.distance - right.distance;
    return compareKeys(left.name, right.name);
  });
  return scored.slice(0, limit).map((item) => item.name);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. DỰNG LỖI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ứng viên kèm phần mô tả — dùng cho gợi ý cờ, nơi câu gợi ý cần nói cả cờ đó
 * LÀM GÌ và cảnh báo gì (`--force` phải kéo theo `--force-with-lease`).
 */
export interface NameCandidate {
  readonly name: string;
  readonly summary: string;
  readonly caution: string | null;
}

/**
 * Cửa DUY NHẤT dựng `GitError`. Lane engine cũng đi qua đây.
 *
 * `exactOptionalPropertyTypes` đang bật, nên `suggest: undefined` KHÔNG gán được
 * vào `suggest?: string` — phải bỏ hẳn khoá đi. Đó là lý do có nhánh rẽ dưới
 * đây thay vì một object literal.
 */
export function gitError(
  code: GitErrorCode,
  message: string,
  explain: string,
  suggest: string | null = null,
): GitError {
  return suggest === null
    ? { code, message, explain }
    : { code, message, explain, suggest };
}

function quoteList(names: readonly string[]): string {
  return names.map((name) => `\`${name}\``).join(', ');
}

/** "`commit`, `status` hoặc `switch`" — cho câu gợi ý đọc được thành tiếng. */
function orList(names: readonly string[]): string {
  if (names.length <= 1) return quoteList(names);
  const head = names.slice(0, -1);
  const tail = names[names.length - 1] ?? '';
  return `${quoteList(head)} hoặc \`${tail}\``;
}

/**
 * Ô nghiệm thu AC-I nằm ở đây: **gõ một lệnh không tồn tại phải ra lệnh gần
 * đúng**, không phải "command not found".
 *
 * `summaries` cho phép câu gợi ý nói luôn lệnh đó làm gì — người gõ nhầm
 * `commmit` thì đã biết `commit` là gì, nhưng người gõ `swich` có khi đang mò và
 * một dòng mô tả tiết kiệm cho họ một vòng thử-sai.
 */
export function unknownCommandError(
  token: string,
  verbs: readonly string[],
  summaries: Readonly<Record<string, string>>,
): GitError {
  const near = nearestNames(token, verbs);
  const explain =
    `Game hiểu ${verbs.length} động từ git. \`${token}\` không nằm trong số đó, nên chưa có gì được chạy ` +
    'và repo vẫn y nguyên.';
  if (near.length === 0) {
    return gitError(
      'unknown-command',
      `\`${token}\` không phải lệnh git nào cả.`,
      explain,
      `Những lệnh hay dùng nhất: ${quoteList(['status', 'add', 'commit', 'log', 'switch'])}.`,
    );
  }
  const first = near[0] ?? '';
  const summary = summaries[first];
  const detail = summary === undefined ? '' : ` — ${summary}.`;
  const alsoRan =
    near.length > 1 ? ` Cũng gần: ${orList(near.slice(1))}.` : '';
  return gitError(
    'unknown-command',
    `\`${token}\` không phải lệnh git nào cả.`,
    explain,
    `Ý bạn là \`git ${first}\`?${detail}${alsoRan}`,
  );
}

/**
 * Người chơi gõ đúng động từ nhưng quên chữ `git` ở đầu.
 *
 * Lỗi này phổ biến đến mức đáng có thông báo riêng: gộp nó vào
 * `unknownCommandError` sẽ cho ra "commit không phải lệnh git nào cả" ngay khi
 * người chơi vừa gõ đúng tên lệnh — vô lý theo đúng nghĩa đen, và đúng loại
 * thông báo đẩy người ta vào vòng thử đại.
 */
export function missingGitPrefixError(token: string, rest: readonly string[]): GitError {
  const full = ['git', token, ...rest].join(' ');
  return gitError(
    'unknown-command',
    `Thiếu chữ \`git\` ở đầu dòng.`,
    `\`${token}\` là một lệnh git có thật, nhưng terminal cần biết bạn đang gọi git — mọi lệnh trong game đều bắt đầu bằng \`git\`.`,
    `Gõ lại: \`${full}\``,
  );
}

/** Dòng lệnh không bắt đầu bằng `git` và cũng không phải động từ git nào. */
export function notGitCommandError(token: string): GitError {
  return gitError(
    'unknown-command',
    `\`${token}\` không chạy được ở đây.`,
    'Terminal của game chỉ nhận lệnh `git`. Không có shell, không có filesystem thật — mọi thứ bạn thấy là một repo trong bộ nhớ.',
    'Mọi lệnh đều bắt đầu bằng `git`, ví dụ `git status`.',
  );
}

/**
 * Cờ lạ. Ô nghiệm thu AC-I thứ hai nằm ở đây: `git push --forse` phải nêu
 * `--force` **và** nói `--force-with-lease` tồn tại.
 *
 * Vế thứ hai đến từ trường `caution` của chính cờ được đề xuất, không từ một
 * `if` theo tên cờ — nên thêm một cảnh báo cho `reset --hard` là sửa bảng lệnh,
 * không phải sửa file này.
 */
export function unknownFlagError(
  commandLabel: string,
  token: string,
  candidates: readonly NameCandidate[],
  usage: string,
): GitError {
  const names = candidates.map((item) => item.name);
  const near = nearestNames(token, names, 2);
  const explain =
    names.length === 0
      ? `\`${commandLabel}\` không nhận cờ nào cả.`
      : `Cờ hợp lệ của \`${commandLabel}\`: ${quoteList(names)}.`;
  const first = near[0];
  if (first === undefined) {
    return gitError(
      'unknown-flag',
      `\`${commandLabel}\` không có cờ \`${token}\`.`,
      explain,
      `Cách dùng: \`${usage}\``,
    );
  }
  const match = candidates.find((item) => item.name === first);
  const summary = match === undefined ? '' : ` — ${match.summary}.`;
  const caution =
    match?.caution === undefined || match.caution === null ? '' : ` ⚠ ${match.caution}`;
  return gitError(
    'unknown-flag',
    `\`${commandLabel}\` không có cờ \`${token}\`.`,
    explain,
    `Ý bạn là \`${first}\`?${summary}${caution}`,
  );
}

/** Một ký tự trong cụm cờ gộp (`-amx`) không ứng với cờ nào. */
export function unknownShortFlagError(
  commandLabel: string,
  char: string,
  cluster: string,
  candidates: readonly NameCandidate[],
  usage: string,
): GitError {
  const shorts = candidates.map((item) => item.name).filter((name) => !name.startsWith('--'));
  const explain =
    `\`${cluster}\` là cụm cờ gộp, tức là từng ký tự sau dấu gạch được đọc như một cờ ngắn riêng — ` +
    `\`-am\` chính là \`-a -m\`. Ký tự \`${char}\` không ứng với cờ nào của \`${commandLabel}\`.` +
    (shorts.length === 0 ? '' : ` Cờ ngắn có sẵn: ${quoteList(shorts)}.`);
  return gitError(
    'unknown-flag',
    `\`${commandLabel}\` không có cờ \`-${char}\`.`,
    explain,
    `Cách dùng: \`${usage}\``,
  );
}

/** Cờ nhận giá trị nhưng không còn token nào phía sau để lấy. */
export function missingFlagValueError(
  commandLabel: string,
  flagToken: string,
  summary: string,
  usage: string,
): GitError {
  return gitError(
    'bad-usage',
    `Cờ \`${flagToken}\` của \`${commandLabel}\` cần một giá trị đi kèm.`,
    `${summary}. Dòng lệnh kết thúc ngay sau \`${flagToken}\` nên không có gì để lấy làm giá trị.`,
    `Cách dùng: \`${usage}\``,
  );
}

/** Sai số tham số vị trí. `explain` lấy thẳng từ `usageError` của bảng lệnh. */
export function badArityError(
  commandLabel: string,
  received: number,
  minArgs: number,
  maxArgs: number,
  usageError: string,
  usage: string,
): GitError {
  const want =
    minArgs === maxArgs
      ? `đúng ${minArgs}`
      : maxArgs === Number.POSITIVE_INFINITY
        ? `ít nhất ${minArgs}`
        : `từ ${minArgs} đến ${maxArgs}`;
  return gitError(
    'bad-usage',
    `\`${commandLabel}\` cần ${want} tham số, nhận được ${received}.`,
    usageError,
    `Cách dùng: \`${usage}\``,
  );
}

/** Động từ có lệnh con, nhưng token đầu không phải lệnh con nào. */
export function unknownSubcommandError(
  verb: string,
  token: string,
  subs: readonly NameCandidate[],
  usage: string,
): GitError {
  const names = subs.map((item) => item.name);
  const near = nearestNames(token, names, 2);
  const first = near[0];
  const suggest =
    first === undefined
      ? `Cách dùng: \`${usage}\``
      : `Ý bạn là \`git ${verb} ${first}\`? — ${subs.find((item) => item.name === first)?.summary ?? ''}.`;
  return gitError(
    'unknown-command',
    `\`git ${verb}\` không có lệnh con \`${token}\`.`,
    `\`git ${verb}\` là một nhóm lệnh, không phải một lệnh đơn. Các lệnh con: ${quoteList(names)}.`,
    suggest,
  );
}

/** Động từ bắt buộc có lệnh con nhưng người chơi không nêu. */
export function missingSubcommandError(
  verb: string,
  subs: readonly NameCandidate[],
  usageError: string,
  usage: string,
): GitError {
  return gitError(
    'bad-usage',
    `\`git ${verb}\` thiếu lệnh con.`,
    usageError,
    `Chọn một trong: ${orList(subs.map((item) => item.name))}. Cách dùng: \`${usage}\``,
  );
}

/**
 * Ref không tồn tại — dựng ở đây dù nó là lỗi TRẠNG THÁI.
 *
 * Lý do: nó nhận danh sách ref qua tham số nên vẫn là một hàm thuần, và nó là
 * chỗ phép tìm tên gần đúng trả lại nhiều giá trị nhất trong cả game. Lane
 * engine gọi nó với `sortedKeys(repo.refs)`.
 */
export function notARefError(
  name: string,
  knownRefs: readonly string[],
  context: string,
): GitError {
  const near = nearestNames(name, knownRefs);
  const listed =
    knownRefs.length === 0
      ? 'Repo này chưa có ref nào — chưa commit lần nào thì cũng chưa có branch nào.'
      : `Ref đang có: ${quoteList(knownRefs)}.`;
  const first = near[0];
  return gitError(
    'not-a-ref',
    `Không có ref nào tên \`${name}\`.`,
    `${context} ${listed}`,
    first === undefined ? null : `Ý bạn là \`${first}\`?`,
  );
}
