/**
 * Bản nháp level → một dòng `problems` — §18.E.5, đường xuất THỨ HAI của Builder.
 *
 * Chủ dự án chốt 2026-09-15 (`phase-18-exec.md` §1.1) rằng Builder xuất cả hai:
 * một tệp `GitLevel` JSON để dán vào `levels/*.ts`, **và** một bài OJ trong DB.
 * File này là nửa sau, và nó là một hàm THUẦN: nó không gọi mạng, không đọc
 * state, không dựng world. Chỗ gọi cầm kết quả rồi gửi qua `problems.create`.
 *
 * ## ⛔ Ba trường chỉ-Problem KHÔNG được nhét vào `LevelDraft`
 *
 * `LevelDraft` là bản nháp của một *level*, và `phase-18-exec.md` §0.1 đã đo ra
 * rằng `GitLevel` và `Problem` là hai hình dạng khác nhau chứ không phải hai tên
 * của một thứ. Ba trường dưới đây chỉ có nghĩa với một bài OJ, nên chúng được
 * thu ở PANEL LƯU và đi vào đây qua `ProblemExtras` — không đi vào bản nháp:
 *
 * | Trường | Vì sao level không có nó |
 * |---|---|
 * | `topics` | Một level không có chủ đề. Chủ đề để LỌC một kho bài, mà level thì nằm trong một chuỗi chương cố định |
 * | `hints[].penaltyPoints` | `GitLevel.hints` là chuỗi trần và MIỄN PHÍ, vì level DẠY. Gợi ý của bài OJ có giá, vì OJ THỬ |
 * | `testcases[].visible` | Level không giấu mục tiêu nào |
 *
 * ## ⛔ `required` và `visible` NGƯỢC NGHĨA NHAU — cấm ánh xạ cái này sang cái kia
 *
 * `docs/oj-format.md` §5 có bảng, và `core/problem.ts` § `Testcase` nói cùng
 * điều đó: `required` hỏi *"không đạt thì có chặn không"*, `visible` hỏi *"người
 * làm có được XEM trước khi nộp không"*. Một mục tiêu `required: false` (mục
 * tiêu thưởng của level) mà thành `visible: false` là biến một phần thưởng thành
 * một testcase ẩn CHẶN — đổi nghĩa dữ liệu, và không cổng nào đỏ vì cả hai đều
 * là `boolean`. Nên `required` bị BỎ HẲN ở đây, và `visible` tới từ panel.
 *
 * ## Vì sao file này ở `builder/` chứ không ở `server/problems/`
 *
 * Panel lưu chạy trong trình duyệt và phải dựng payload TRƯỚC khi gửi, nên phép
 * ánh xạ phải nhập được từ mã client. `server/problems/validate.ts` thì nhập
 * `PROBLEM_PLUGINS`, thứ kéo cả engine k8s lẫn engine git vào bundle của route
 * — xem `git/problem-topics.ts` về đúng cái chunk 369 KB mà PR #124 đo được.
 *
 * `ProblemBody` vẫn nhập từ đó, nhưng bằng `import type`: kiểu bị xoá lúc biên
 * dịch nên nó KHÔNG kéo gì vào bundle, mà vẫn giữ được thứ đắt nhất — `tsc` đỏ
 * ngay tại đây nếu hợp đồng mọc thêm một trường mà ánh xạ này quên.
 */

import {
  levelDraftIssues,
  problemTopicLabels,
  type GitObjective,
  type LevelDraft,
  type Testcase,
} from '@devops-platform/games';

import { toSlug } from '../../../../app/author/problems/text-tools';
import type { ProblemBody } from '../../../../server/problems/validate';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Phần panel thu, ngoài bản nháp
// ═══════════════════════════════════════════════════════════════════════════

/** Trần của `hintSchema.penaltyPoints` ở biên ghi. Chép số là chép một cổng. */
const MAX_HINT_PENALTY = 1000;

/** `problemBodyShape.topics` là `.min(1).max(3)`. */
const MIN_TOPICS = 1;
const MAX_TOPICS = 3;

/** `problemSlugSchema` — `.min(1).max(120)` cộng khuôn `a-z0-9-`. */
const MAX_SLUG_LENGTH = 120;

export interface ProblemExtras {
  /** Id chủ đề, 1..3, lấy từ `GIT_PROBLEM_TOPICS`. */
  readonly topics: readonly string[];
  /** Phân loại tự do, đã chuẩn hoá. Rỗng là hợp lệ. */
  readonly tags: readonly string[];
  /**
   * Điểm trừ của từng gợi ý, SONG SONG theo chỉ số với `draft.hints`.
   *
   * Song song theo chỉ số chứ không theo id, vì `GitLevel.hints` là mảng chuỗi
   * TRẦN — không có id nào để khớp. Id của `ProblemHint` được sinh ra ở đây từ
   * chính chỉ số đó (xem `hintIdAt`), nên hai bên dùng cùng một khoá.
   *
   * ⚠ Lệch độ dài là một LỖI, không phải một chỗ để điền mặc định. Điền `0` cho
   * mục thiếu nghĩa là lặng lẽ biến một gợi ý có giá thành gợi ý miễn phí, và
   * người soạn không có cách nào biết.
   */
  readonly hintPenalties: readonly number[];
  /**
   * Từng mục tiêu có hiện trước khi nộp không, SONG SONG theo chỉ số với
   * `draft.objectives`.
   *
   * ⚠ KHÔNG suy từ `objective.required`. Xem khối đầu file.
   */
  readonly objectiveVisible: readonly boolean[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Phép kiểm
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mã lỗi, KHÔNG phải câu tiếng Việt — cùng quy ước với `DraftIssueCode`.
 *
 * Khác một chỗ có ý nghĩa: `DraftIssueCode` sống ở `packages/games` vì bản nháp
 * là khái niệm của lõi; những mã này sống ở `apps/web` vì chúng nói về hình dạng
 * KHO LƯU, thứ mà `packages/games` cố ý không biết.
 */
export type ProblemSaveIssueCode =
  | 'nhap-con-loi'
  | 'chua-chon-chu-de'
  | 'qua-nhieu-chu-de'
  | 'chu-de-la'
  | 'gia-goi-y-lech-so-luong'
  | 'gia-goi-y-ngoai-khoang'
  | 'co-hien-lech-so-luong'
  | 'slug-rong'
  | 'slug-qua-dai';

export interface ProblemSaveIssue {
  readonly code: ProblemSaveIssueCode;
  /** Giá trị cụ thể của người soạn. Không dịch. */
  readonly detail?: string;
}

/**
 * MẤT MÁT, không phải lỗi — thứ người soạn gõ vào mà bài lưu ra không chở nổi.
 *
 * ## Vì sao một tập thứ hai chứ không thêm một `ProblemSaveIssueCode`
 *
 * `problemSaveIssues` là tập CHẶN: rỗng ⇒ `draftToProblemBody` trả một body, và
 * nút Lưu đọc thẳng `issues.length > 0` để tự khoá. Nhét mất mát vào đó sẽ biến
 * "bài này lưu được, chỉ khác tệp level một chỗ" thành "không lưu được" — tức
 * đóng luôn đường xuất thứ hai của Builder vì một thứ hoàn toàn hợp lệ.
 *
 * Hai tập trả lời hai câu khác nhau: *"đã đủ để lưu chưa"* và *"lưu xong thì
 * mất gì"*. Chỉ câu thứ hai cần người soạn ĐỌC; không câu nào cần họ sửa.
 *
 * ## `allowedCommands` — mất mát THẬT, và trước đợt này nó im lặng
 *
 * `git-builder.tsx` có một ô cho người soạn gõ tập lệnh cho phép. `ProblemBase`
 * không có ô nào chứa nó, nên `draftToProblemBody` bỏ qua — và `gitOjLevel` khi
 * mở lại bài đặt `allowedCommands: null` (= cho dùng MỌI lệnh). Người soạn gõ
 * một tập hạn chế, bấm Lưu, nhận về một bài không hạn chế gì, và không một dòng
 * nào trên màn nói điều đó.
 *
 * ⚠ **Đừng "sửa" bằng cách chở nó sang `ProblemBase`.** Đó là đổi THIẾT KẾ, không
 * phải vá lỗi: `problem-level.ts` § (4) đã ghi rằng `null` và `[]` mang nghĩa
 * ngược nhau và một `[]` lọt vào sẽ làm bài không bao giờ giải được mà không log
 * gì; và ô gác `problem-level.test.ts:109` khẳng định `null` đúng là giá trị
 * mong muốn cho bài OJ. Chở thêm một trường vào hợp đồng `core/` cho một khái
 * niệm chỉ game Git có cũng đi ngược AC-A. Việc đúng ở đây là NÓI RA.
 */
export type ProblemSaveLossCode = 'allowed-commands-mat';

export interface ProblemSaveLoss {
  readonly code: ProblemSaveLossCode;
  /** Giá trị cụ thể của người soạn. Không dịch. */
  readonly detail?: string;
}

/**
 * Những gì bản nháp có mà bài lưu ra không chở được. KHÔNG chặn lưu.
 *
 * Tách khỏi `problemSaveIssues` chứ không gộp — lý do đầy đủ ở khối trên
 * `ProblemSaveLossCode`.
 */
export function problemSaveLosses(draft: LevelDraft): readonly ProblemSaveLoss[] {
  const losses: ProblemSaveLoss[] = [];

  /*
   * `!== null` chứ không `.length > 0`. `null` = không giới hạn, và đó đúng là
   * thứ bài OJ nhận được, nên `null` KHÔNG mất gì. Một mảng RỖNG thì có mất —
   * nó nghĩa là "cấm mọi lệnh" — dù `levelDraftIssues` đã chặn nó bằng
   * `tap-lenh-rong` ở đường level. Đọc `.length > 0` sẽ im lặng đúng ca đó.
   */
  if (draft.allowedCommands !== null) {
    losses.push({
      code: 'allowed-commands-mat',
      detail: draft.allowedCommands.length === 0 ? '(rỗng)' : draft.allowedCommands.join(', '),
    });
  }

  return losses;
}

/**
 * Mọi thứ chặn bản nháp trở thành một dòng `problems`. Rỗng ⇒ `draftToProblemBody`
 * trả về một body.
 *
 * ⛔ KHÔNG viết lại `levelDraftIssues`. Bài OJ lấy `statement` từ `draft.brief`,
 * `objectives` từ `draft.objectives`, `initialState` từ `draft.setup` — nên một
 * bản nháp còn lỗi thì bài lưu ra cũng hỏng ở đúng chỗ đó. Dựng một bộ kiểm thứ
 * hai ở đây là dựng hai định nghĩa của "đã xong", và chúng sẽ lệch nhau; file
 * này chỉ kiểm PHẦN THÊM.
 *
 * ⚠ Phép này KHÔNG thay `problemBodySchema`. Biên ghi ở máy chủ mới là cổng có
 * hiệu lực — `problem-validate.ts` đã ghi thẳng rằng *"một lời gọi API viết tay
 * không đi qua file này"*. Phép ở đây tồn tại để người soạn biết trước, không
 * phải để máy chủ tin.
 */
export function problemSaveIssues(
  draft: LevelDraft,
  extras: ProblemExtras,
): readonly ProblemSaveIssue[] {
  const issues: ProblemSaveIssue[] = [];

  if (levelDraftIssues(draft).length > 0) {
    issues.push({ code: 'nhap-con-loi' });
  }

  if (extras.topics.length < MIN_TOPICS) {
    issues.push({ code: 'chua-chon-chu-de' });
  } else if (extras.topics.length > MAX_TOPICS) {
    issues.push({ code: 'qua-nhieu-chu-de', detail: String(extras.topics.length) });
  }
  /*
   * `problemTopicLabels('git')` chứ KHÔNG `PROBLEM_PLUGINS.git.topics`, dù cái sau
   * là phép tra đúng hơn. Lý do là bundle, ghi đủ ở `problem-topic-labels.ts`:
   * `PROBLEM_PLUGINS` nhập cả hai plugin, mà hai plugin nhập cả hai engine. PR
   * #124 đo được một chunk 369.938 B đi theo đường đó vào 7/38 route.
   *
   * ⚠ Phép kiểm này dùng BẢNG NHÃN làm tập hợp lệ, tức nó tin rằng hai thứ đó
   * trùng nhau. Chúng trùng vì bảng nhãn được dựng từ chính `GIT_PROBLEM_TOPICS`
   * mà plugin dùng. Cổng CÓ HIỆU LỰC vẫn là `refineByGame` ở máy chủ, nơi tra
   * thẳng plugin — nên một ngày hai bên lệch nhau thì chỗ này nới tay hơn, không
   * phải chặt tay hơn, và máy chủ vẫn từ chối.
   */
  const known = new Set(Object.keys(problemTopicLabels('git')));
  for (const topic of extras.topics) {
    if (!known.has(topic)) {
      issues.push({ code: 'chu-de-la', detail: topic });
    }
  }

  if (extras.hintPenalties.length !== draft.hints.length) {
    issues.push({
      code: 'gia-goi-y-lech-so-luong',
      detail: `${String(extras.hintPenalties.length)}/${String(draft.hints.length)}`,
    });
  }
  for (const penalty of extras.hintPenalties) {
    if (!Number.isInteger(penalty) || penalty < 0 || penalty > MAX_HINT_PENALTY) {
      issues.push({ code: 'gia-goi-y-ngoai-khoang', detail: String(penalty) });
    }
  }

  if (extras.objectiveVisible.length !== draft.objectives.length) {
    issues.push({
      code: 'co-hien-lech-so-luong',
      detail: `${String(extras.objectiveVisible.length)}/${String(draft.objectives.length)}`,
    });
  }

  /*
   * Slug SINH RA từ tiêu đề, không phải một ô người soạn gõ. Nên hai lỗi dưới
   * đây không phải "gõ sai" mà là "tiêu đề không sinh ra slug nào" — một tiêu đề
   * toàn ký tự bị `toSlug` lọc sạch (dấu câu, emoji) cho chuỗi rỗng, và một tiêu
   * đề rất dài cho slug vượt 120 ký tự mà biên ghi từ chối.
   */
  const slug = slugFromTitle(draft.title);
  if (slug === '') {
    issues.push({ code: 'slug-rong', detail: draft.title });
  } else if (slug.length > MAX_SLUG_LENGTH) {
    issues.push({ code: 'slug-qua-dai', detail: String(slug.length) });
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Ánh xạ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Thang ba bậc của level → thang bốn bậc của bài OJ, TƯỜNG MINH và một chiều.
 *
 * ⛔ `expert` KHÔNG với tới được từ Builder, và đó là chủ ý chứ không phải một
 * nhánh bị bỏ quên (`phase-18-exec.md` §1.3). Builder giữ thang ba bậc vì nó là
 * một *level* builder; bịa ra bậc thứ tư ở đây chính là "ánh xạ ngầm" mà
 * `phase-18.md` §18.A cấm. Một bài `expert` được soạn tay ở `/author/problems`.
 *
 * `satisfies Record<Difficulty, …>` để một bậc thứ tư thêm vào `DIFFICULTIES`
 * làm `tsc` đỏ tại dòng này, thay vì làm `DIFFICULTY_TO_PROBLEM[x]` trả
 * `undefined` rồi ghi một `difficulty` rỗng xuống cột `pgEnum`.
 */
const DIFFICULTY_TO_PROBLEM = {
  basic: 'easy',
  intermediate: 'medium',
  advanced: 'hard',
} as const satisfies Record<LevelDraft['difficulty'], ProblemBody['difficulty']>;

/**
 * Id của gợi ý thứ `index`.
 *
 * `GitLevel.hints` là mảng chuỗi trần, còn `ProblemHint.id` là bắt buộc — nên id
 * phải được SINH RA, và chỉ số là khoá duy nhất có sẵn. Một chữ đứng đầu chứ
 * không phải số trần: `hintSchema.id` là `.min(1)`, và một id `"0"` đọc ra như
 * một giá trị giả trong mọi log sau này.
 */
function hintIdAt(index: number): string {
  return `goi-y-${String(index + 1)}`;
}

export function slugFromTitle(title: string): string {
  return toSlug(title);
}

/**
 * Bản nháp + phần panel thu → body gửi lên `problems.create`.
 *
 * `null` khi `problemSaveIssues` còn nói gì đó — cùng khuôn với `draftToLevel`,
 * nên chỗ gọi không phải nhớ hai quy ước khác nhau cho hai đường xuất.
 */
export function draftToProblemBody(
  draft: LevelDraft,
  extras: ProblemExtras,
): ProblemBody | null {
  if (problemSaveIssues(draft, extras).length > 0) {
    return null;
  }

  return {
    gameId: 'git',
    slug: slugFromTitle(draft.title),
    title: draft.title,
    /*
     * `brief`, KHÔNG phải `mission`. `mission` là một câu thường trực trên màn
     * chơi (xem ô "Nhiệm vụ" của Builder); `statement` là đề bài đầy đủ, và
     * `brief` là thứ giữ đúng vai đó.
     */
    statement: draft.brief,
    difficulty: DIFFICULTY_TO_PROBLEM[draft.difficulty],
    topics: [...extras.topics],
    tags: [...extras.tags],
    /*
     * `null` = không giới hạn giờ. Builder không có ô cho nó, và thêm một ô chỉ
     * để điền `null` là thêm một câu hỏi không ai trả lời khác đi. Bài cần giờ
     * thì đặt ở trang soạn bài sau khi lưu.
     */
    timeLimitSec: null,
    initialState: draft.setup,
    /*
     * `target === null` (ô đích trên form đang trống) ⇒ BỎ HẲN KHOÁ, không gửi
     * `null`. `ProblemBase.targetState?` chạy dưới `exactOptionalPropertyTypes`,
     * nơi "vắng mặt" và "có mặt với giá trị undefined" là hai hình dạng khác
     * nhau — và `toRowValues` ở máy chủ mới là chỗ đổi "vắng mặt" thành `null`
     * của cột. Hai quy ước, một chỗ đổi; đừng đổi ở hai chỗ.
     */
    ...(draft.target === null ? {} : { targetState: draft.target }),
    objectives: draft.objectives.map((objective, index) =>
      objectiveToTestcase(objective, extras.objectiveVisible[index] === true),
    ),
    /*
     * `null` — cột của thời K8s-một-game, không có nghĩa nào với bài Git.
     * `validate.ts` § `allowedResources` đã ghi tên món nợ này và nói rõ rằng
     * biên ghi KHÔNG chặn một bài Git gửi giá trị khác `null`. Nên chỗ này là
     * chỗ duy nhất quyết định, và nó quyết định `null`.
     *
     * ⚠ Đừng đọc nhầm thành `draft.allowedCommands`. Hai thứ nghe giống nhau và
     * không liên quan: `allowedCommands` là tập LỆNH GIT của một level (và `[]`
     * ở đó nghĩa là cấm hết, xem `level-draft.ts`), còn `allowedResources` là
     * tập LOẠI TÀI NGUYÊN K8s. Bài OJ Git không chở được `allowedCommands` —
     * `ProblemBase` không có ô cho nó, và đó là một mất mát THẬT so với tệp
     * level xuất ra. Đã ghi vào báo cáo lane.
     */
    allowedResources: null,
    hints: draft.hints.map((text, index) => ({
      id: hintIdAt(index),
      text,
      /*
       * `?? 0` ở đây KHÔNG phải một mặc định lặng lẽ: `problemSaveIssues` đã từ
       * chối mọi trường hợp lệch độ dài, nên nhánh này không với tới được. Nó
       * tồn tại vì `noUncheckedIndexedAccess` khai kiểu phần tử kèm `undefined`,
       * và một `!` ở đây sẽ là chỗ duy nhất trong file nói dối về điều đã kiểm.
       */
      penaltyPoints: extras.hintPenalties[index] ?? 0,
    })),
    /*
     * `par === 0` ⇒ `null`, KHÔNG phải `0`.
     *
     * `problemBodyShape.parMoves` là `.positive().nullable()`, nên một `0` bị Zod
     * từ chối và người soạn nhận một 400 nói về `parMoves` — trong khi trên màn
     * Builder ô "số lệnh chuẩn" của họ đang để trống. `emptyDraft` khởi tạo `par`
     * bằng `0` và `levelDraftIssues` chỉ chặn số ÂM, nên `0` chính là giá trị
     * thường gặp nhất, không phải một ca hiếm.
     *
     * Hai giá trị mang cùng một nghĩa ở hai hợp đồng: `0` ở level = "không chấm
     * theo số nước", `null` ở bài = đúng điều đó.
     */
    parMoves: draft.par === 0 ? null : draft.par,
    /*
     * `false`, và hôm nay KHÔNG có giá trị nào khác đi qua được biên ghi: không
     * plugin nào khai `seedSpec`, nên `refineByGame` từ chối mọi `seedable: true`
     * (`validate.ts`). Một ô đánh dấu trên panel sẽ là một ô luôn phải tắt.
     */
    seedable: false,
  };
}

/**
 * `GitObjective` → `Testcase`: giữ `id`/`label`/`check`/`args`, BỎ `required`,
 * THÊM `visible` từ panel.
 *
 * `args` phải BỎ KHOÁ khi vắng mặt chứ không gán `undefined` — cùng lý do với
 * `targetState` ở trên (`exactOptionalPropertyTypes`), và ở đây nó còn có hậu
 * quả lúc chạy: `testcaseSchema` là `.strict()`, và `JSON.stringify` xoá khoá
 * `undefined` nên payload lên dây trông đúng — nhưng kiểu thì không, và một
 * `as` để dập lỗi đó là chỗ một field sai thật sẽ lọt vào lần sau.
 */
function objectiveToTestcase(objective: GitObjective, visible: boolean): Testcase {
  return {
    id: objective.id,
    label: objective.label,
    check: objective.check,
    ...(objective.args === undefined ? {} : { args: objective.args }),
    visible,
  };
}
