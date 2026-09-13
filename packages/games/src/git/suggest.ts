/**
 * Gợi ý Tab cho thanh lệnh git (§17.I.3).
 *
 * ## Hàm thuần, và chỉ có thế
 *
 * `suggest()` nhận một chuỗi và một ảnh chụp trạng thái, trả về một mảng chuỗi.
 * Lịch sử ↑↓ và `Ctrl+Z` hoàn tác là việc của tầng giao diện: cái trước là một
 * mảng trong state của component, cái sau đi qua `GitSession.undo()` của hợp
 * đồng. Cả hai đều cần DOM hoặc engine, nên cả hai đều không thuộc file này.
 *
 * ## Đây là bộ GỢI Ý, không phải bộ phân tích
 *
 * Bên phân tích thật là `parseGitCommand`, chạy lúc bấm Enter. Hệ quả cần nhớ:
 * một gợi ý sai chỉ làm mất một gợi ý — nó KHÔNG bao giờ làm chạy sai một lệnh.
 * Vì thế file này cố ý dễ dãi: dòng lệnh đang gõ dở gần như luôn sai cú pháp,
 * và một bộ gợi ý từ chối làm việc với dòng chưa hợp lệ thì vô dụng đúng vào lúc
 * người chơi cần nó nhất.
 *
 * ## Không có bảng thứ hai
 *
 * Động từ, cờ, lệnh con và loại của từng tham số đọc THẲNG từ `command-table.ts`.
 * Bộ gợi ý của game K8s giữ một bản chép chín động từ và bản chép đó lệch dần
 * trong im lặng — gợi ý cứ thiếu đi trong khi lệnh vẫn chạy đúng, vì bên phân
 * tích mới là bên quyết định. Ở đây không có bản chép nào để lệch.
 */

import type { ArgKind, ArgShape, CommandSpec, SubSpec } from './command-table.ts';
import {
  GIT_VERBS,
  argKindAt,
  commandSpec,
  findAlias,
  findShortFlag,
  findSub,
  flagUniverse,
  flagsFor,
  isGitVerb,
} from './command-table.ts';

/**
 * Ảnh chụp những gì repo đang có, đủ để gợi ý tên thật.
 *
 * ⛔ KHÔNG có trường `refs`. Nó tính được từ `branches` + `tags`, và
 * `rules/code-conventions.md` § "No Derived Fields" cấm lưu thứ tính được: một
 * `refs` lưu sẵn sẽ lệch khỏi hai mảng kia đúng vào lần ai đó thêm branch mà
 * quên cập nhật nó, và không có gì đỏ ở đâu cả.
 */
export interface SuggestContext {
  readonly branches: readonly string[];
  readonly tags: readonly string[];
  readonly remotes: readonly string[];
  /** Đường dẫn trong worktree và index — gộp sẵn, vì Tab không phân biệt hai nơi. */
  readonly files: readonly string[];
  /**
   * Giới hạn lệnh của level (`GitLevel.allowedCommands`).
   *
   * ⚠ `null` = CHO DÙNG MỌI LỆNH. Mảng rỗng `[]` mang nghĩa NGƯỢC LẠI — cấm mọi
   * lệnh — và đó là cái bẫy đã cắn một lần ở `k8s/problem.ts`, nên hai ca này
   * được viết tách hẳn ở `verbPool()` thay vì gộp bằng một phép `||`.
   */
  readonly allowedCommands: readonly string[] | null;
}

/** Bao nhiêu gợi ý hiện cùng lúc. Nhiều hơn thì danh sách che mất kết quả lệnh trước. */
const MAX_SUGGESTIONS = 12;

// ═══════════════════════════════════════════════════════════════════════════
// 1. ĐỌC DÒNG ĐANG GÕ DỞ
// ═══════════════════════════════════════════════════════════════════════════

interface Shape {
  /** Tham số vị trí đã gõ xong, đã bỏ cờ và giá trị đi kèm cờ. */
  readonly args: readonly string[];
  readonly afterSeparator: boolean;
  /** Token cuối là một cờ đang chờ giá trị — lúc đó không gợi ý gì cả. */
  readonly awaitingValue: boolean;
}

/**
 * Phân loại phần ĐÃ GÕ XONG của dòng lệnh.
 *
 * Đếm trên DANH SÁCH THAM SỐ chứ không trên mảng token thô. `git commit -m "x"
 * ` có bốn token nhưng KHÔNG có tham số vị trí nào, và nhầm hai thứ này chính là
 * chỗ bộ gợi ý của game K8s đã mất sạch nhóm gợi ý hữu ích nhất: nó đọc
 * `tokens[1]` làm động từ, gặp `-n` của `kubectl -n prod get pods`, rồi gợi ý cờ
 * cho một động từ không tồn tại.
 */
function readShape(spec: CommandSpec, tokens: readonly string[]): Shape {
  const universe = flagUniverse(spec);
  const args: string[] = [];
  let afterSeparator = false;
  let awaitingValue = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';
    awaitingValue = false;

    if (afterSeparator) continue;
    if (token === '--') {
      afterSeparator = true;
      continue;
    }

    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      const name = eq > 0 ? token.slice(0, eq) : token;
      const flag = universe.find((item) => item.long === name) ?? null;
      if (flag !== null && flag.takesValue && eq < 0) {
        if (i + 1 < tokens.length) i += 1;
        else awaitingValue = true;
      }
      continue;
    }

    if (token.startsWith('-') && token !== '-') {
      if (findAlias(spec, token) !== null) continue;
      const cluster = token.slice(1);
      for (let k = 0; k < cluster.length; k += 1) {
        const flag = findShortFlag(universe, cluster[k] ?? '');
        if (flag === null || !flag.takesValue) continue;
        if (cluster.slice(k + 1) === '') {
          if (i + 1 < tokens.length) i += 1;
          else awaitingValue = true;
        }
        break;
      }
      continue;
    }

    args.push(token);
  }

  return { args, afterSeparator, awaitingValue };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. CÁC BỂ GỢI Ý
// ═══════════════════════════════════════════════════════════════════════════

function verbPool(context: SuggestContext): readonly string[] {
  const allowed = context.allowedCommands;
  if (allowed === null) return GIT_VERBS;
  return GIT_VERBS.filter((verb) => allowed.includes(verb));
}

function flagPool(spec: CommandSpec, sub: SubSpec | null): readonly string[] {
  const out: string[] = [];
  for (const flag of flagsFor(spec, sub)) {
    out.push(flag.long);
    if (flag.short !== null) out.push(flag.short);
  }
  for (const alias of spec.aliases) out.push(alias.token);
  return out;
}

/** `ArgKind` → tên thật đang có trong repo. `number`/`text` cố ý không gợi ý gì. */
function poolForKind(kind: ArgKind, context: SuggestContext): readonly string[] {
  switch (kind) {
    case 'branch':
      return context.branches;
    case 'tag':
      return context.tags;
    case 'ref':
    case 'commit':
      return [...context.branches, ...context.tags];
    case 'remote':
      return context.remotes;
    case 'path':
      return context.files;
    case 'number':
    case 'text':
      return [];
  }
}

function positionalPool(
  shape: ArgShape,
  index: number,
  context: SuggestContext,
): readonly string[] {
  if (index >= shape.maxArgs) return [];
  const kind = argKindAt(shape, index);
  return kind === null ? [] : poolForKind(kind, context);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. BỂ GỢI Ý CHO ĐÚNG VỊ TRÍ ĐANG GÕ
// ═══════════════════════════════════════════════════════════════════════════

function poolFor(
  committed: readonly string[],
  prefix: string,
  context: SuggestContext,
): readonly string[] {
  const head = committed[0];
  if (head === undefined) return ['git'];
  if (head !== 'git') return [];

  const verbToken = committed[1];
  if (verbToken === undefined) return verbPool(context);
  if (!isGitVerb(verbToken)) return [];

  const spec = commandSpec(verbToken);
  const { args, afterSeparator, awaitingValue } = readShape(spec, committed.slice(2));

  // Token trước là một cờ đang chờ giá trị — giá trị đó là chuỗi tự do (thông
  // điệp commit, tên branch MỚI), nên mọi gợi ý ở đây đều là đoán mò.
  if (awaitingValue) return [];

  // Sau `--` thì mọi thứ là đường dẫn. Đây đúng là điều `--` sinh ra để nói.
  if (afterSeparator) return context.files;

  if (prefix.startsWith('-')) {
    const sub = spec.subs.length === 0 ? null : findSub(spec, args[0] ?? '');
    return flagPool(spec, sub ?? (spec.defaultSub === null ? null : findSub(spec, spec.defaultSub)));
  }

  if (spec.subs.length === 0) {
    return positionalPool(spec, args.length, context);
  }

  const named = args.length === 0 ? null : findSub(spec, args[0] ?? '');
  if (named === null) {
    // Chưa gõ lệnh con nào. Gợi ý lệnh con — và CHỈ khi đây là vị trí đầu, vì ở
    // vị trí sau thì lệnh con mặc định đã nhận vai và tham số thuộc về nó.
    if (args.length === 0) return spec.subs.map((sub) => sub.name);
    const fallback = spec.defaultSub === null ? null : findSub(spec, spec.defaultSub);
    return fallback === null ? [] : positionalPool(fallback, args.length, context);
  }
  return positionalPool(named, args.length - 1, context);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. CỬA VÀO
// ═══════════════════════════════════════════════════════════════════════════

/** Bỏ trùng mà GIỮ thứ tự khai — bể gợi ý nhỏ nên phép quét bậc hai là đủ. */
function distinct(values: readonly string[]): readonly string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

/**
 * Gợi ý cho phần đang gõ dở của `input`.
 *
 * Trả mảng rỗng khi không có gì đáng gợi — bảng gợi ý rỗng phải BIẾN MẤT, không
 * phải hiện ra một khung trống.
 *
 * Lọc theo tiền tố có PHÂN BIỆT HOA THƯỜNG, khác bộ gợi ý của game K8s. Lý do:
 * ở đây phần lớn bể gợi ý là tên branch và đường dẫn, mà git phân biệt hoa
 * thường ở cả hai — gợi ý `main` cho người đang gõ `Main` là gợi ý một cái tên
 * không tồn tại.
 */
export function suggest(input: string, context: SuggestContext): readonly string[] {
  const atNewToken = input === '' || /\s$/.test(input);
  const tokens = input.split(/\s+/).filter((token) => token !== '');
  const prefix = atNewToken ? '' : (tokens.at(-1) ?? '');
  const committed = atNewToken ? tokens : tokens.slice(0, -1);
  return distinct(poolFor(committed, prefix, context))
    .filter((value) => value.startsWith(prefix))
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * Thay token đang gõ dở bằng gợi ý, và chừa sẵn một dấu cách cho token kế.
 *
 * `search(/\S+$/)` trả vị trí BẮT ĐẦU của cụm không-trắng cuối cùng — cách duy
 * nhất cắt đúng khi token cuối trùng chữ với một token trước đó
 * (`git branch main main`), thứ mà `lastIndexOf` trên chuỗi con vẫn đúng nhưng
 * chỉ nhờ may.
 */
export function applySuggestion(input: string, value: string): string {
  if (input === '' || /\s$/.test(input)) return `${input}${value} `;
  return `${input.slice(0, input.search(/\S+$/))}${value} `;
}
