/**
 * Bộ phân tích dòng lệnh git (§17.I.1).
 *
 * ## Hàm thuần, và vì sao điều đó quan trọng
 *
 * File này biến một CHUỖI thành một CẤU TRÚC. Nó không đọc repo, không ghi repo,
 * không biết ref nào tồn tại, không biết index có gì. Việc thực thi là của lane
 * engine.
 *
 * Ranh giới đó không phải để cho đẹp. Nó là thứ làm bộ phân tích chạy được ở cả
 * trình duyệt lẫn Node mà không cần dựng thế giới (điều kiện §17.J.5), làm test
 * của nó không cần fixture, và làm một lỗi cú pháp KHÔNG BAO GIỜ để lại nửa tác
 * dụng lên trạng thái — thứ mà `CommandResult` của hợp đồng đòi bằng chữ.
 *
 * ## Hai lượt, và vì sao không thể một lượt
 *
 * Tách cụm cờ gộp cần biết cờ nào NHẬN GIÁ TRỊ: `-am` là `-a -m` và `-m` nuốt
 * token kế, còn `-ab` thì không nuốt gì. Câu trả lời đó nằm trong bảng lệnh, mà
 * bảng lệnh lại phụ thuộc lệnh con, mà lệnh con lại là tham số vị trí ĐẦU TIÊN —
 * tức là thứ chỉ biết được sau khi đã tách xong cờ. Vòng tròn.
 *
 * Cắt vòng bằng hai lượt:
 *
 * - **Lượt 1** phân loại token bằng tập cờ TỐI ĐA của động từ (cờ chung cộng cờ
 *   của mọi lệnh con). Tập tối đa đủ để trả lời đúng câu "cờ này có nuốt token
 *   kế không", vì trong phạm vi một động từ không có hai cờ trùng tên — và đó
 *   không phải một giả định, `command-table.test.ts` khẳng định nó.
 * - **Lượt 2** đã biết lệnh con nên kiểm được cờ nào THỰC SỰ hợp lệ. `git stash
 *   pop -m x` qua được lượt 1 (vì `-m` có thật ở `stash push`) và đỏ ở lượt 2,
 *   với thông báo nêu đúng `git stash pop`.
 *
 * `kubectl.ts` của game K8s đọc cờ trong một lượt duy nhất được, vì `kubectl`
 * không có cụm cờ gộp nào nuốt giá trị. Git thì có, và `-am` là ví dụ người học
 * gặp sớm nhất.
 */

import type { GitError } from './contract.ts';
import type { ArgShape, CommandSpec, FlagSpec, GitVerb, SubSpec } from './command-table.ts';
import {
  GIT_COMMANDS,
  GIT_VERBS,
  commandSpec,
  findAlias,
  findFlag,
  findShortFlag,
  findSub,
  flagUniverse,
  flagsFor,
  isGitVerb,
} from './command-table.ts';
import type { NameCandidate } from './errors.ts';
import {
  badArityError,
  gitError,
  missingFlagValueError,
  missingGitPrefixError,
  missingSubcommandError,
  nearestNames,
  notGitCommandError,
  unknownCommandError,
  unknownFlagError,
  unknownShortFlagError,
  unknownSubcommandError,
} from './errors.ts';
import { normalized } from './deterministic.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. KẾT QUẢ
// ═══════════════════════════════════════════════════════════════════════════

/** `true` cho cờ luận lý; chuỗi cho cờ có giá trị. Chuỗi RỖNG là giá trị hợp lệ. */
export type FlagValue = string | true;

/**
 * Một dòng lệnh đã phân tích xong.
 *
 * ⚠ `flags` khoá bằng dạng DÀI chuẩn tắc, luôn luôn. `-m` và `--message` và
 * `--message=x` đều vào ô `--message`. Lane engine chỉ phải nhớ một tên cho mỗi
 * cờ, và một cờ đổi dạng ngắn sau này không kéo theo sửa gì ở engine.
 *
 * ⚠ `args` và `paths` TÁCH RIÊNG, và đó là toàn bộ ý nghĩa của `--`. Trong
 * `git log -- src/a.ts` thì `src/a.ts` nằm ở `paths`, nên engine không bao giờ
 * lỡ đem nó đi phân giải thành ref. Với lệnh vốn nhận path (`add`, `stash
 * push`), toán hạng thật là `[...args, ...paths]` — dùng `pathOperands()` thay
 * vì tự ghép, để không ai quên vế thứ hai.
 */
export interface ParsedCommand {
  readonly verb: GitVerb;
  /** Tên lệnh con đã phân giải, kể cả khi người chơi không gõ (`git stash` → `push`). */
  readonly sub: string | null;
  readonly flags: Readonly<Record<string, FlagValue>>;
  /** Tham số vị trí TRƯỚC `--`, đã bỏ tên lệnh con. */
  readonly args: readonly string[];
  /** Mọi thứ SAU `--`. Luôn là đường dẫn, không bao giờ là ref. */
  readonly paths: readonly string[];
  readonly hasPathSeparator: boolean;
  /** Đúng dòng người chơi đã gõ, đã cắt khoảng trắng hai đầu. Dùng cho nhật ký. */
  readonly raw: string;
}

export type ParseResult =
  | { readonly ok: true; readonly command: ParsedCommand }
  | { readonly ok: false; readonly error: GitError };

// ═══════════════════════════════════════════════════════════════════════════
// 2. TÁCH TOKEN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tách dòng lệnh thành token, tôn trọng nháy đơn và nháy kép.
 *
 * `hasContent` là thứ làm `git commit -m ""` giữ được một token RỖNG thay vì
 * biến mất. Bỏ nó đi thì `-m ""` trở thành `-m` không giá trị, và người chơi
 * nhận một lỗi nói về cú pháp trong khi họ đang cố ý thử một thông điệp rỗng.
 *
 * Nháy chỉ có tác dụng gom token — nó KHÔNG được nhớ lại. Hệ quả có chủ ý:
 * `git log "--" x` hành xử y như `git log -- x`, đúng như shell thật vì shell
 * bóc nháy trước khi git nhìn thấy dòng lệnh.
 */
export function tokenize(input: string): readonly string[] {
  const out: string[] = [];
  let current = '';
  let quote: string | null = null;
  let hasContent = false;
  for (const char of input.trim()) {
    if (quote !== null) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      hasContent = true;
      continue;
    }
    if (char === ' ' || char === '\t') {
      if (current !== '' || hasContent) out.push(current);
      current = '';
      hasContent = false;
      continue;
    }
    current += char;
  }
  if (current !== '' || hasContent) out.push(current);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LƯỢT 1 — phân loại token
// ═══════════════════════════════════════════════════════════════════════════

interface FlagHit {
  /** Dạng người chơi thật sự gõ — thông báo lỗi phải nhắc lại đúng thứ đó. */
  readonly token: string;
  readonly spec: FlagSpec;
  readonly value: FlagValue;
}

interface Scan {
  readonly flags: readonly FlagHit[];
  readonly args: readonly string[];
  readonly paths: readonly string[];
  readonly hasPathSeparator: boolean;
}

function candidatesOf(flags: readonly FlagSpec[]): readonly NameCandidate[] {
  const out: NameCandidate[] = [];
  for (const flag of flags) {
    out.push({ name: flag.long, summary: flag.summary, caution: flag.caution });
    if (flag.short !== null) {
      out.push({ name: flag.short, summary: flag.summary, caution: flag.caution });
    }
  }
  return out;
}

/**
 * Lượt 1. Trả `GitError` khi token hỏng không cứu được (cờ không tồn tại ở bất
 * kỳ lệnh con nào, hoặc cờ thiếu giá trị) — những lỗi đó không cần biết lệnh con
 * nên báo ngay là đúng chỗ.
 */
function scanTokens(spec: CommandSpec, tokens: readonly string[]): Scan | GitError {
  const universe = flagUniverse(spec);
  const label = `git ${spec.verb}`;
  const hits: FlagHit[] = [];
  const args: string[] = [];
  let paths: readonly string[] = [];
  let hasPathSeparator = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';

    if (token === '--') {
      paths = tokens.slice(i + 1);
      hasPathSeparator = true;
      break;
    }

    // Cờ dài, có thể kèm `=giá-trị`.
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      const name = eq > 0 ? token.slice(0, eq) : token;
      const inline = eq > 0 ? token.slice(eq + 1) : null;
      const flag = findFlag(universe, name);
      if (flag === null) {
        return unknownFlagError(label, name, candidatesOf(universe), spec.usage);
      }
      if (!flag.takesValue) {
        if (inline !== null) {
          return gitError(
            'bad-usage',
            `Cờ \`${flag.long}\` không nhận giá trị.`,
            `${flag.summary}. Nó là cờ bật/tắt, nên \`${name}=${inline}\` không có nghĩa gì cả.`,
            `Bỏ phần \`=${inline}\` đi: \`${flag.long}\``,
          );
        }
        hits.push({ token: name, spec: flag, value: true });
        continue;
      }
      const value = inline ?? tokens[i + 1];
      if (value === undefined) {
        return missingFlagValueError(label, name, flag.summary, spec.usage);
      }
      if (inline === null) i += 1;
      hits.push({ token: name, spec: flag, value });
      continue;
    }

    // `-` một mình là tham số vị trí, không phải cờ. Git thật dùng nó cho "chỗ
    // vừa rời khỏi" (`git switch -`); phân giải nó là việc của engine vì nó cần
    // reflog, nên ở đây chỉ chuyển tiếp nguyên vẹn.
    if (token.startsWith('-') && token !== '-') {
      const alias = findAlias(spec, token);
      const cluster = alias === null ? token.slice(1) : '';
      if (alias !== null) {
        const expanded = expandAlias(universe, alias.expandsTo, alias.token);
        if (!Array.isArray(expanded)) return expanded;
        hits.push(...expanded);
        continue;
      }

      let consumedNext = false;
      let failed: GitError | null = null;
      for (let k = 0; k < cluster.length; k += 1) {
        const char = cluster[k] ?? '';
        const flag = findShortFlag(universe, char);
        if (flag === null) {
          // `-aD` — `D` không phải cờ ngắn nhưng có thể là một bí danh.
          const charAlias = findAlias(spec, `-${char}`);
          if (charAlias === null) {
            failed = unknownShortFlagError(
              label,
              char,
              token,
              candidatesOf(universe),
              spec.usage,
            );
            break;
          }
          const expanded = expandAlias(universe, charAlias.expandsTo, charAlias.token);
          if (!Array.isArray(expanded)) {
            failed = expanded;
            break;
          }
          hits.push(...expanded);
          continue;
        }
        if (!flag.takesValue) {
          hits.push({ token: `-${char}`, spec: flag, value: true });
          continue;
        }
        /*
         * Cờ nhận giá trị phải đứng CUỐI cụm — đúng quy ước của git thật, và
         * cũng là quy ước duy nhất giải nghĩa được: trong `-am` thì `m` nuốt gì
         * nếu không phải phần đuôi cụm hoặc token kế?
         *
         * `-mxin-chao` lấy `xin-chao` làm giá trị; `-am "xin chao"` lấy token
         * kế. Cả hai đều là cú pháp git thật.
         */
        const rest = cluster.slice(k + 1);
        const value = rest !== '' ? rest : tokens[i + 1];
        if (value === undefined) {
          failed = missingFlagValueError(label, `-${char}`, flag.summary, spec.usage);
          break;
        }
        if (rest === '') consumedNext = true;
        hits.push({ token: `-${char}`, spec: flag, value });
        break;
      }
      if (failed !== null) return failed;
      if (consumedNext) i += 1;
      continue;
    }

    args.push(token);
  }

  return { flags: hits, args, paths, hasPathSeparator };
}

/** Biến `-D` thành hai `FlagHit` thật. Bảng lệnh khai bí danh, không khai cờ ma. */
function expandAlias(
  universe: readonly FlagSpec[],
  expandsTo: readonly string[],
  aliasToken: string,
): FlagHit[] | GitError {
  const out: FlagHit[] = [];
  for (const short of expandsTo) {
    const flag = findFlag(universe, short);
    if (flag === null || flag.takesValue) {
      // Không tới được nếu bảng đúng; `command-table.test.ts` gác cả hai vế.
      return gitError(
        'bad-usage',
        `Bí danh \`${aliasToken}\` khai sai trong bảng lệnh.`,
        `Nó trỏ tới \`${short}\`, mà cờ đó hoặc không tồn tại hoặc cần một giá trị.`,
        null,
      );
    }
    out.push({ token: aliasToken, spec: flag, value: true });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LƯỢT 2 — lệnh con, arity, và cờ thật sự hợp lệ
// ═══════════════════════════════════════════════════════════════════════════

function subCandidates(spec: CommandSpec): readonly NameCandidate[] {
  return spec.subs.map((sub) => ({ name: sub.name, summary: sub.summary, caution: null }));
}

interface Resolved {
  readonly sub: SubSpec | null;
  readonly args: readonly string[];
}

/**
 * Phân giải lệnh con.
 *
 * ⚠ Phép đoán "gõ nhầm tên lệnh con" bị TẮT khi lệnh con mặc định nhận `path` ở
 * vị trí 0. Lý do đo được: `git stash apps/` có `apps/` cách `apply` đúng 2 ký
 * tự, tức là nằm trong ngưỡng đề xuất, nên bật phép đoán ở đó sẽ từ chối một
 * đường dẫn hoàn toàn hợp lệ và nói với người chơi rằng họ gõ sai — kiểu thông
 * báo tệ nhất có thể, vì nó vừa sai vừa nghe rất tự tin. Một vị trí nhận chuỗi
 * TỰ DO thì không kiêm được vai trò bắt lỗi chính tả.
 */
function resolveSub(spec: CommandSpec, positional: readonly string[]): Resolved | GitError {
  if (spec.subs.length === 0) return { sub: null, args: positional };

  const first = positional[0];
  if (first !== undefined) {
    const named = findSub(spec, first);
    if (named !== null) return { sub: named, args: positional.slice(1) };
  }

  if (spec.defaultSub === null) {
    if (first === undefined) {
      return missingSubcommandError(spec.verb, subCandidates(spec), spec.usageError, spec.usage);
    }
    return unknownSubcommandError(spec.verb, first, subCandidates(spec), spec.usage);
  }

  const fallback = findSub(spec, spec.defaultSub);
  if (fallback === null) {
    // Bảng khai `defaultSub` trỏ tới một lệnh con không tồn tại — lỗi bảng.
    return gitError(
      'bad-usage',
      `Bảng lệnh của \`git ${spec.verb}\` khai lệnh con mặc định không tồn tại.`,
      `\`defaultSub\` trỏ tới \`${spec.defaultSub}\`.`,
      null,
    );
  }
  if (first !== undefined) {
    const freeform = fallback.argKinds.at(-1) === 'path';
    const looksLikeTypo =
      !freeform &&
      (fallback.maxArgs === 0 ||
        nearestNames(first, spec.subs.map((sub) => sub.name), 1).length > 0);
    if (looksLikeTypo) {
      return unknownSubcommandError(spec.verb, first, subCandidates(spec), spec.usage);
    }
  }
  return { sub: fallback, args: positional };
}

/**
 * Path sau `--` có tính vào số tham số không.
 *
 * Tính khi lệnh vốn nhận path — `git add -- a.ts` phải thoả `minArgs: 1` của
 * `add` dù `args` rỗng. KHÔNG tính với `git log -- src/a.ts`, vì ở đó `--` phục
 * vụ việc ngược lại: tách path RA KHỎI vùng ref.
 */
function pathsCountAsArgs(shape: ArgShape): boolean {
  return shape.argKinds.at(-1) === 'path';
}

/**
 * Toán hạng đường dẫn của một lệnh nhận path.
 *
 * Gộp `args` và `paths` đúng một chỗ, vì `git add a.ts` và `git add -- a.ts`
 * phải cho cùng kết quả và không lane nào nên phải tự nhớ điều đó. Trả rỗng cho
 * lệnh không nhận path — gọi nhầm thì không âm thầm ra một danh sách sai.
 */
export function pathOperands(command: ParsedCommand): readonly string[] {
  const spec = commandSpec(command.verb);
  const sub = command.sub === null ? null : findSub(spec, command.sub);
  const shape: ArgShape = sub ?? spec;
  if (!pathsCountAsArgs(shape)) return [];
  return [...command.args, ...command.paths];
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. CỬA VÀO
// ═══════════════════════════════════════════════════════════════════════════

/** `{ commit: 'Đóng nội dung…' }` — cho câu "Ý bạn là `git commit`? — …". */
const VERB_SUMMARIES: Readonly<Record<string, string>> = Object.fromEntries(
  GIT_VERBS.map((verb) => [verb, GIT_COMMANDS[verb].summary]),
);

export function parseGitCommand(input: string): ParseResult {
  const raw = input.trim();
  const tokens = tokenize(raw);

  const head = tokens[0];
  if (head === undefined) {
    return {
      ok: false,
      error: gitError(
        'bad-usage',
        'Chưa gõ lệnh nào.',
        'Thanh lệnh đang rỗng, nên không có gì để chạy và repo không đổi.',
        'Thử `git status` để xem repo đang thế nào.',
      ),
    };
  }
  if (head !== 'git') {
    return {
      ok: false,
      error: isGitVerb(head)
        ? missingGitPrefixError(head, tokens.slice(1))
        : notGitCommandError(head),
    };
  }

  const verbToken = tokens[1];
  if (verbToken === undefined) {
    return {
      ok: false,
      error: gitError(
        'bad-usage',
        '`git` một mình chưa nói bạn muốn làm gì.',
        `Cần một động từ ngay sau \`git\`. Game hiểu ${GIT_VERBS.length} động từ.`,
        'Bắt đầu bằng `git status` — nó không đổi gì và nói cho bạn biết repo đang ở đâu.',
      ),
    };
  }
  if (!isGitVerb(verbToken)) {
    return {
      ok: false,
      error: unknownCommandError(verbToken, GIT_VERBS, VERB_SUMMARIES),
    };
  }

  const spec = commandSpec(verbToken);
  const scanned = scanTokens(spec, tokens.slice(2));
  if (!isScan(scanned)) return { ok: false, error: scanned };

  const resolved = resolveSub(spec, scanned.args);
  if (!isResolved(resolved)) return { ok: false, error: resolved };

  const { sub, args } = resolved;
  const shape: ArgShape = sub ?? spec;
  const label = sub === null ? `git ${spec.verb}` : `git ${spec.verb} ${sub.name}`;
  const usage = sub === null ? spec.usage : sub.usage;

  const counted = args.length + (pathsCountAsArgs(shape) ? scanned.paths.length : 0);
  // Một cờ trong `argsSatisfiedBy` thay được tham số vị trí — xem chú thích của
  // trường đó ở `command-table.ts`. Chỉ nới SÀN, không nới trần: `git add -A a b`
  // vẫn phải tuân `maxArgs`.
  // ⚠ Đọc `scanned.flags`, KHÔNG đọc `flags`. Biến `flags` được khai phía DƯỚI
  // và ở đây nó còn trong vùng chết tạm thời — bản đầu đọc nó, và hậu quả là
  // MỌI lệnh đều ném `ReferenceError` ngay ở lượt phân tích đầu tiên. Không có
  // ô nghiệm thu AC-8 thì lỗi đó chỉ lộ ra lúc có người chơi gõ lệnh.
  const satisfiedByFlag = (shape.argsSatisfiedBy ?? []).some((long) =>
    scanned.flags.some((hit) => hit.spec.long === long),
  );
  const floor = satisfiedByFlag ? 0 : shape.minArgs;
  if (counted < floor || counted > shape.maxArgs) {
    return {
      ok: false,
      error: badArityError(
        label,
        counted,
        shape.minArgs,
        shape.maxArgs,
        spec.usageError,
        usage,
      ),
    };
  }

  // Lượt 2 của phép kiểm cờ: giờ mới biết lệnh con, nên mới biết cờ nào hợp lệ.
  const allowed = flagsFor(spec, sub);
  for (const hit of scanned.flags) {
    if (findFlag(allowed, hit.spec.long) === null) {
      return {
        ok: false,
        error: unknownFlagError(label, hit.token, candidatesOf(allowed), usage),
      };
    }
  }

  /*
   * Khoá bằng dạng DÀI, rồi chuẩn hoá thứ tự khoá qua `deterministic.ts`.
   *
   * Chuẩn hoá không cần cho tính đúng — không ai băm `ParsedCommand`. Nó cần để
   * `git commit -a -m x` và `git commit -m x -a` cho ra hai object SO SÁNH BẰNG
   * NHAU, thứ mà test và phép so trong lane engine đều dựa vào. Trùng cờ thì
   * lần gõ sau thắng, y như git thật với `-m a -m b`.
   */
  const flags: Record<string, FlagValue> = {};
  for (const hit of scanned.flags) flags[hit.spec.long] = hit.value;

  return {
    ok: true,
    command: {
      verb: spec.verb,
      sub: sub === null ? null : sub.name,
      flags: normalized(flags),
      args,
      paths: scanned.paths,
      hasPathSeparator: scanned.hasPathSeparator,
      raw,
    },
  };
}

/*
 * Hai vệ tinh phân biệt nhánh lỗi khỏi nhánh thành công.
 *
 * ⚠ Phân biệt bằng SỰ CÓ MẶT của một khoá riêng, không bằng `'code' in x` trên
 * một union hai nhánh cùng kiểu nền. `kubectl.ts` đã trả giá đúng một lần cho
 * biến thể tệ hơn của lỗi này: nó phân biệt hai nhánh bằng `typeof kind ===
 * 'string'` trong khi cả hai nhánh đều là string, nên nhánh lỗi nuốt mọi kết
 * quả hợp lệ và cả file vẫn biên dịch xanh.
 */
function isScan(value: Scan | GitError): value is Scan {
  return !('code' in value);
}

function isResolved(value: Resolved | GitError): value is Resolved {
  return !('code' in value);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. ĐỌC KẾT QUẢ — lane engine chỉ cần hai hàm này
// ═══════════════════════════════════════════════════════════════════════════

/** `true` khi cờ có mặt, bất kể nó là cờ luận lý hay cờ có giá trị. */
export function hasFlag(command: ParsedCommand, long: string): boolean {
  return Object.hasOwn(command.flags, long);
}

/**
 * Giá trị của một cờ, hoặc `null` khi cờ vắng mặt.
 *
 * Cờ luận lý trả `null` chứ không trả `'true'` — hỏi giá trị của `--amend` là
 * một câu hỏi sai, và trả về một chuỗi trông hợp lệ sẽ giấu chỗ sai đó đi.
 * Dùng `hasFlag` cho cờ luận lý.
 */
export function flagValue(command: ParsedCommand, long: string): string | null {
  const value = command.flags[long];
  return typeof value === 'string' ? value : null;
}
