/**
 * Bản nháp của một level đang dựng trong Level Builder — §18.E.
 *
 * ## Vì sao có một kiểu RIÊNG thay vì dùng thẳng `GitLevel`
 *
 * `GitLevel` mô tả một level **đã xong**: mọi trường có mặt và hợp lệ. Một bản
 * nháp thì theo định nghĩa là chưa xong — người soạn vừa bấm "đặt làm trạng thái
 * đầu" và chưa gõ tiêu đề. Ép trạng thái đó vào `GitLevel` buộc phải điền chuỗi
 * rỗng và mảng rỗng khắp nơi, và khi ấy **không còn phân biệt được "chưa điền"
 * với "cố ý để trống"** — mà đó chính là thứ `levelDraftIssues` phải nói ra.
 *
 * Khác biệt so với `GitLevel` đúng một chỗ có ý nghĩa: `target` là
 * `WorldSpec | null` chứ không phải optional. `undefined` trong `GitLevel` mang
 * nghĩa "level này không cần cây đích"; `null` ở đây mang nghĩa "ô này trên form
 * đang trống". Chúng trùng nhau về giá trị và khác nhau về ý định, nên
 * `draftToLevel` dịch một chiều và ghi rõ.
 *
 * ## ⛔ Id level tự dựng KHÔNG được trùng dãy `git-NN-`
 *
 * `level-ids.ts` là hợp đồng đóng băng, và lý do nó đóng băng vẫn áp ở đây:
 * `RunResult.levelId` nằm trong `localStorage` và **không có bảng tra nào dịch
 * ngược**. Một level tự dựng mang id `git-07-...` sẽ ghi đè tiến độ của level
 * G07 thật trên máy người chơi — không lỗi, không cảnh báo, chỉ là lịch sử của
 * họ biến mất.
 *
 * Nên mọi id do Builder sinh ra mang tiền tố `git-tu-dung-`, và
 * `levelDraftIssues` từ chối mọi id không mang nó. Tiền tố cũng làm một việc
 * thứ hai: `theoryIdForLevel` bóc `git-` rồi tra file ở
 * `content/games/git/theory/<id>.md`, nên một level tự dựng sẽ tra vào
 * `tu-dung-...` — một đường không tồn tại, và `theoryId: null` là đúng mặc định.
 *
 * ## Những gì Builder KHÔNG diễn đạt được
 *
 * `phase-18.md` §18.E dặn phải ghi giới hạn này **trên chính giao diện, không
 * giấu trong tài liệu**. Danh sách ở `BUILDER_CANNOT_EXPRESS` là một nguồn duy
 * nhất cho cả giao diện lẫn test, để câu trên màn không trôi khỏi sự thật.
 */

import { DIFFICULTIES, type Difficulty } from '../core/types.ts';
import type { GitObjective, GitTeaching, GitLevel, WorldSpec } from './contract.ts';
import { GIT_PREDICATE_NAMES } from './predicates.ts';
import { isGitVerb } from './command-table.ts';
import { buildWorld } from './world-spec.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Định danh
// ═══════════════════════════════════════════════════════════════════════════

/** Xem khối chú thích đầu file — đây là thứ chặn việc mồ côi tiến độ đã lưu. */
export const CUSTOM_LEVEL_ID_PREFIX = 'git-tu-dung-';

/** `git-tu-dung-` + slug thường, không dấu, ngăn bằng gạch nối. */
const CUSTOM_LEVEL_ID_RE = /^git-tu-dung-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isCustomLevelId(id: string): boolean {
  return CUSTOM_LEVEL_ID_RE.test(id);
}

/**
 * Hai loại level mà giao diện trực quan không diễn đạt được, theo
 * `phase-18.md` §18.E. Khoá để giao diện tra qua `packages/copy`.
 */
export const BUILDER_CANNOT_EXPRESS = ['bot-dong-doi', 'nhieu-luot-chay-co-seed'] as const;
export type BuilderLimit = (typeof BUILDER_CANNOT_EXPRESS)[number];

// ═══════════════════════════════════════════════════════════════════════════
// 2. Bản nháp
// ═══════════════════════════════════════════════════════════════════════════

export interface LevelDraft {
  readonly id: string;
  readonly chapter: 1 | 2 | 3;
  readonly title: string;
  readonly mission: string;
  readonly brief: string;
  readonly difficulty: Difficulty;
  readonly setup: WorldSpec;
  /** `null` = ô đích trên form đang trống. Xem khối chú thích đầu file. */
  readonly target: WorldSpec | null;
  /**
   * ⚠ `null` = CHO DÙNG MỌI LỆNH. `[]` mang nghĩa NGƯỢC LẠI — cấm mọi lệnh — và
   * đó là cái bẫy đã cắn một lần ở `k8s/problem.ts`. `levelDraftIssues` từ chối
   * mảng rỗng vì trong một form trực quan nó gần như chắc chắn là nhầm lẫn.
   */
  readonly allowedCommands: readonly string[] | null;
  readonly objectives: readonly GitObjective[];
  readonly hints: readonly string[];
  readonly teaching: GitTeaching;
  readonly theoryId: string | null;
  readonly solutionCommands: readonly string[];
  readonly altSolutionCommands: readonly string[];
  readonly par: number;
}

/**
 * Nháp rỗng quanh một trạng thái đầu vừa chụp từ sandbox.
 *
 * `teaching` để rỗng và đó là đúng nghĩa, không phải chỗ giữ chỗ: tiền lệ đã có
 * ở `problemAsLevel` (`apps/web/src/server/problems/replay.ts`), nơi một bài OJ
 * dựng `teaching: { primer: '', cheatsheet: [], takeaways: [] }` vì **level DẠY,
 * bài OJ THỬ** — và một level tự dựng bắt đầu ở phía "thử".
 */
export function emptyDraft(setup: WorldSpec): LevelDraft {
  return {
    id: '',
    chapter: 1,
    title: '',
    mission: '',
    brief: '',
    difficulty: 'basic',
    setup,
    target: null,
    allowedCommands: null,
    objectives: [],
    hints: [],
    teaching: { primer: '', cheatsheet: [], takeaways: [] },
    theoryId: null,
    solutionCommands: [],
    altSolutionCommands: [],
    par: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Phép kiểm
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mã lỗi, KHÔNG phải câu tiếng Việt.
 *
 * Giao diện dựng câu qua `packages/copy`; `packages/games` không giữ chữ hiển
 * thị. Một mã cộng một `detail` không dịch (id, tên lệnh) là đủ cho mọi câu.
 */
export type DraftIssueCode =
  | 'id-trong'
  | 'id-sai-dinh-dang'
  | 'tieu-de-trong'
  | 'nhiem-vu-trong'
  | 'de-bai-trong'
  | 'khong-co-muc-tieu'
  | 'khong-co-muc-tieu-bat-buoc'
  | 'muc-tieu-trung-id'
  | 'vi-tu-khong-ton-tai'
  | 'thieu-cay-dich'
  | 'khong-co-loi-giai'
  | 'tap-lenh-rong'
  | 'loi-giai-dung-lenh-ngoai-tap'
  | 'par-am'
  | 'trang-thai-dau-hong'
  | 'cay-dich-hong';

export interface DraftIssue {
  /** Tên trường trên form, để giao diện tô đỏ đúng ô. */
  readonly field: keyof LevelDraft;
  readonly code: DraftIssueCode;
  /** Id/tên cụ thể. Không dịch — nó là dữ liệu của người soạn. */
  readonly detail?: string;
}

const PREDICATE_NAMES: ReadonlySet<string> = new Set(GIT_PREDICATE_NAMES);

/** Vị từ duy nhất cần cây đích. Xem `git/problem-plugin.ts` sai lệch #2. */
const NEEDS_TARGET = 'graphShapeMatches';

/**
 * Động từ git của một dòng lệnh, hoặc `null` khi dòng đó không nhận ra được.
 *
 * Không dùng `parseGitCommand`: nó phân tích đầy đủ tham số và **ném/trả lỗi**
 * cho cú pháp sai, mà ở đây ta chỉ cần biết dòng này định gọi động từ nào để đối
 * chiếu với `allowedCommands`. Một dòng sai cú pháp là việc của `checkSolvable`
 * (nó chạy thật và engine sẽ từ chối), không phải việc của phép kiểm tĩnh này.
 */
function verbOf(command: string): string | null {
  const words = command.trim().split(/\s+/);
  const verb = words[0] === 'git' ? words[1] : words[0];
  if (verb === undefined || verb === '') return null;
  return isGitVerb(verb) ? verb : null;
}

/**
 * Mọi thứ chặn bản nháp trở thành một `GitLevel`. Rỗng ⇒ `draftToLevel` chạy.
 *
 * ⛔ Phép này là TĨNH. Nó không chạy engine, nên nó **không** trả lời được "lời
 * giải có tới đích không" — đó là việc của `checkSolvable` (§18.E.7), và hai
 * phép bổ sung cho nhau chứ không thay nhau: một bản nháp sạch mọi issue ở đây
 * vẫn có thể có lời giải không tới đích.
 */
export function levelDraftIssues(draft: LevelDraft): readonly DraftIssue[] {
  const issues: DraftIssue[] = [];

  if (draft.id.trim() === '') issues.push({ field: 'id', code: 'id-trong' });
  else if (!isCustomLevelId(draft.id))
    issues.push({ field: 'id', code: 'id-sai-dinh-dang', detail: draft.id });

  if (draft.title.trim() === '') issues.push({ field: 'title', code: 'tieu-de-trong' });
  if (draft.mission.trim() === '') issues.push({ field: 'mission', code: 'nhiem-vu-trong' });
  if (draft.brief.trim() === '') issues.push({ field: 'brief', code: 'de-bai-trong' });

  // ── Mục tiêu ──
  if (draft.objectives.length === 0) {
    issues.push({ field: 'objectives', code: 'khong-co-muc-tieu' });
  } else if (!draft.objectives.some((o) => o.required)) {
    // `verdictOf` trả `accepted: false` khi `required.length === 0`, nên một
    // level toàn mục tiêu thưởng là một level KHÔNG BAO GIỜ qua được.
    issues.push({ field: 'objectives', code: 'khong-co-muc-tieu-bat-buoc' });
  }

  const seen = new Set<string>();
  for (const objective of draft.objectives) {
    if (seen.has(objective.id))
      issues.push({ field: 'objectives', code: 'muc-tieu-trung-id', detail: objective.id });
    seen.add(objective.id);

    if (!PREDICATE_NAMES.has(objective.check))
      issues.push({ field: 'objectives', code: 'vi-tu-khong-ton-tai', detail: objective.check });

    if (objective.check === NEEDS_TARGET && draft.target === null)
      issues.push({ field: 'target', code: 'thieu-cay-dich', detail: objective.id });
  }

  // ── Tập lệnh cho phép ──
  if (draft.allowedCommands !== null && draft.allowedCommands.length === 0)
    issues.push({ field: 'allowedCommands', code: 'tap-lenh-rong' });

  // ── Lời giải ──
  if (draft.solutionCommands.length === 0)
    issues.push({ field: 'solutionCommands', code: 'khong-co-loi-giai' });

  /*
   * Lời giải dùng động từ ngoài `allowedCommands` là một level TỰ CHẶN lời giải
   * của chính nó. Bắt ở đây rẻ hơn nhiều so với để `checkSolvable` chạy rồi báo
   * "mục tiêu chưa đạt" — triệu chứng đó không chỉ được vào đúng nguyên nhân.
   */
  const allowed = draft.allowedCommands;
  if (allowed !== null && allowed.length > 0) {
    const allowedSet = new Set(allowed);
    for (const command of [...draft.solutionCommands, ...draft.altSolutionCommands]) {
      const verb = verbOf(command);
      if (verb !== null && !allowedSet.has(verb))
        issues.push({
          field: 'solutionCommands',
          code: 'loi-giai-dung-lenh-ngoai-tap',
          detail: verb,
        });
    }
  }

  if (draft.par < 0) issues.push({ field: 'par', code: 'par-am' });

  // ── Spec dựng được không ──
  // `buildWorld` NÉM khi spec sai (cha chưa định nghĩa, nhánh trỏ vào commit
  // không tồn tại). Bắt ở đây để form nói được một câu, thay vì để một trang
  // trắng xuất hiện lúc bấm "chơi thử".
  try {
    buildWorld(draft.setup, 1);
  } catch {
    issues.push({ field: 'setup', code: 'trang-thai-dau-hong' });
  }
  if (draft.target !== null) {
    try {
      buildWorld(draft.target, 1);
    } catch {
      issues.push({ field: 'target', code: 'cay-dich-hong' });
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Nháp ↔ level
// ═══════════════════════════════════════════════════════════════════════════

/** `null` khi bản nháp còn issue. Chỗ gọi hiện `levelDraftIssues` cho người soạn. */
export function draftToLevel(draft: LevelDraft): GitLevel | null {
  if (levelDraftIssues(draft).length > 0) return null;
  return {
    id: draft.id,
    chapter: draft.chapter,
    title: draft.title,
    mission: draft.mission,
    brief: draft.brief,
    difficulty: draft.difficulty,
    setup: draft.setup,
    // `null` (ô trống) → bỏ hẳn khoá, vì `GitLevel.target` là optional và
    // `createGitSession` phân biệt `undefined` chứ không phân biệt `null`.
    ...(draft.target === null ? {} : { target: draft.target }),
    allowedCommands: draft.allowedCommands,
    objectives: draft.objectives,
    hints: draft.hints,
    teaching: draft.teaching,
    theoryId: draft.theoryId,
    solutionCommands: draft.solutionCommands,
    altSolutionCommands: draft.altSolutionCommands,
    par: draft.par,
  };
}

/** Chiều ngược: mở một level đã xuất ra để sửa tiếp. */
export function draftFromLevel(level: GitLevel): LevelDraft {
  return {
    id: level.id,
    chapter: level.chapter,
    title: level.title,
    mission: level.mission,
    brief: level.brief,
    difficulty: level.difficulty,
    setup: level.setup,
    target: level.target ?? null,
    allowedCommands: level.allowedCommands,
    objectives: level.objectives,
    hints: level.hints,
    teaching: level.teaching,
    theoryId: level.theoryId,
    solutionCommands: level.solutionCommands,
    altSolutionCommands: level.altSolutionCommands,
    par: level.par,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Xuất / nhập JSON
// ═══════════════════════════════════════════════════════════════════════════

export interface LevelExport {
  readonly version: 1;
  readonly gameId: 'git';
  /**
   * Phân biệt với `SandboxExport`, thứ cũng mang `version: 1, gameId: 'git'`
   * nhưng chở một `spec` chứ không chở cả level. Không có khoá này thì dán nhầm
   * một bản xuất sandbox vào ô nhập level sẽ đi qua hai phép kiểm đầu rồi hỏng ở
   * một chỗ sâu hơn, với một câu lỗi không chỉ được vào đâu.
   */
  readonly kind: 'level';
  readonly level: GitLevel;
}

export function levelToJson(level: GitLevel): string {
  const payload: LevelExport = { version: 1, gameId: 'git', kind: 'level', level };
  // Thụt lề 2: file này để dán vào `levels/*.ts` và để `diff` bằng mắt.
  return JSON.stringify(payload, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isObjectiveArray(value: unknown): value is readonly GitObjective[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        isRecord(v) &&
        typeof v['id'] === 'string' &&
        typeof v['label'] === 'string' &&
        typeof v['check'] === 'string' &&
        typeof v['required'] === 'boolean' &&
        (v['args'] === undefined || isRecord(v['args'])),
    )
  );
}

function isTeaching(value: unknown): value is GitTeaching {
  return (
    isRecord(value) &&
    typeof value['primer'] === 'string' &&
    Array.isArray(value['cheatsheet']) &&
    isStringArray(value['takeaways'])
  );
}

/**
 * Hình dạng THÔ, trước khi `levelDraftIssues` nói về nội dung.
 *
 * ⛔ Cần một tầng riêng ở đây chứ không gộp vào `levelDraftIssues`: hàm đó đọc
 * `draft.id.trim()` và `draft.objectives.length`, nên một JSON thiếu trường sẽ
 * làm nó ném `TypeError` thay vì trả về một danh sách issue. Một lần dán nhầm
 * phải ra một câu tử tế, không ra một trang lỗi — đó là cả lý do
 * `levelFromJson` trả `null` thay vì ném.
 */
function looksLikeLevel(value: Record<string, unknown>): boolean {
  return (
    typeof value['id'] === 'string' &&
    (value['chapter'] === 1 || value['chapter'] === 2 || value['chapter'] === 3) &&
    typeof value['title'] === 'string' &&
    typeof value['mission'] === 'string' &&
    typeof value['brief'] === 'string' &&
    (DIFFICULTIES as readonly string[]).includes(value['difficulty'] as string) &&
    isRecord(value['setup']) &&
    (value['target'] === undefined || isRecord(value['target'])) &&
    (value['allowedCommands'] === null || isStringArray(value['allowedCommands'])) &&
    isObjectiveArray(value['objectives']) &&
    isStringArray(value['hints']) &&
    isTeaching(value['teaching']) &&
    (value['theoryId'] === null || typeof value['theoryId'] === 'string') &&
    isStringArray(value['solutionCommands']) &&
    isStringArray(value['altSolutionCommands']) &&
    typeof value['par'] === 'number'
  );
}

/**
 * Trả `null` khi dữ liệu sai hình dạng — **không ném**.
 *
 * Cùng lý lẽ với `importSandboxJson`: chuỗi đến từ NGOÀI hệ thống (dán từ file
 * người khác gửi), nên nó không tin được. Ném ở đây biến một lần dán nhầm thành
 * một trang lỗi.
 *
 * Phép kiểm NỘI DUNG đi qua `draftFromLevel` → `levelDraftIssues` chứ không tự
 * viết lại, nên một level nhập vào đạt đúng chuẩn mà Builder đòi ở level nó tự
 * dựng — kể cả luật id `git-tu-dung-`.
 */
export function levelFromJson(json: string): GitLevel | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed['version'] !== 1 || parsed['gameId'] !== 'git' || parsed['kind'] !== 'level')
    return null;

  const level = parsed['level'];
  if (!isRecord(level) || !looksLikeLevel(level)) return null;

  return draftToLevel(draftFromLevel(level as unknown as GitLevel));
}
