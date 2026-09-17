import { z } from 'zod';
import {
  ALL_KINDS,
  CD_PREDICATE_NEEDS,
  GAME_IDS,
  PROBLEM_DIFFICULTIES,
  PROBLEM_PLUGINS,
  type GameId,
  type ResourceKind,
  type Testcase,
} from '@devops-platform/games';
import type { StoredProblem } from './dto';
import { ANY_PROBLEM_CODE_PATTERN, PROBLEM_CODE_PREFIXES } from './problem-code';

/**
 * Biên GHI của hệ bài tập. Mọi thứ đi vào `problems` đều qua đây.
 *
 * Vì sao validate ở tầng ứng dụng chứ không bằng ràng buộc Postgres: tập chủ đề
 * và tập độ khó là SSOT trong `packages/games`, và một `CHECK` hay một `pgEnum`
 * thứ hai cho `topics` sẽ là bản sao thứ hai của cùng danh sách — hai bản sao
 * thì sẽ trôi. Cột `difficulty`/`state` vẫn là `pgEnum` vì chúng sinh TỰ ĐỘNG
 * từ chính hằng đó, không phải gõ lại.
 *
 * ## §18.D.1 nửa sau — biên này nay nhận MỌI game, không riêng K8s
 *
 * Trước đợt này ba trường khoá cứng cả file vào Kubernetes: `topics` là
 * `z.enum(PROBLEM_TOPICS)` (chín chủ đề của riêng K8s), `initialState` là
 * `clusterSpecSchema`, và mục tiêu còn mang `required`. Hệ quả đo được ghi ở
 * `plans/devops-learning-platform/phase-18.md` §0.4: kho lưu đã đa-game từ
 * migration 0015 và đường ĐỌC đã đi theo, nhưng một bài Git soạn xong qua giao
 * diện **không có đường ghi nào** — nó trượt Zod trước khi tới được cột.
 *
 * ⛔ Tập đóng KHÔNG biến mất, nó ĐỔI CHỖ. `topics` dưới đây khai `z.string()`
 * và **một mình nó không gác gì** — phép gác thật nằm ở `refineByGame`, đối
 * chiếu với `PROBLEM_PLUGINS[gameId].topics`. Đọc hai chỗ đó cùng nhau; đọc
 * riêng dòng `z.string()` sẽ kết luận sai rằng chủ đề đã thành trường tự do.
 * `core/problem.ts` § `ProblemTopicId` giải thích vì sao tập đóng phải theo
 * plugin chứ không theo một danh sách dùng chung.
 */

/*
 * ⚠ Mọi `z.array(...)` dưới đây đóng bằng `.readonly()`, và đó là một quyết định
 * về HỢP ĐỒNG DÂY chứ không phải phong cách.
 *
 * Kiểu mà client tRPC phải truyền vào là `z.input` của schema này. Không có
 * `.readonly()` thì nó là mảng GHI ĐƯỢC, trong khi payload mà lane E/F dựng lên
 * tới từ `Problem`/`ProblemFilter` của hợp đồng — nơi mọi mảng là `readonly`. Mà
 * `readonly T[]` KHÔNG gán được vào `T[]`, nên mỗi call-site phải `as` một lần.
 * Đo được: hai lane cùng vấp, một lane đang đỏ vì chưa lách (2026-09-08).
 *
 * Trong Zod 4, `.readonly()` làm `readonly` CẢ HAI chiều (`$ZodReadonlyInternals`
 * khai `MakeReadonly<output>` và `MakeReadonly<input>`), nên nó vá đúng chỗ đau
 * chứ không chỉ đổi kiểu trả về. Sửa ở nguồn thì không lane nào phải `as`.
 */

/** Trần của `integer` Postgres. Vượt là `22003` — một 500 cho một input hỏng. */
const PG_INT4_MAX = 2_147_483_647;

/**
 * `slug` chuẩn URL. `tag` dùng CÙNG dạng — hợp đồng nói tag "đã chuẩn hoá thường
 * + gạch nối", và hai dạng khác nhau cho hai thứ trông giống nhau là chỗ để
 * `Init-Container` và `init-container` cùng tồn tại.
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * Mã bài của MỌI game có plugin, không riêng K8s.
 *
 * ⛔ Khoá này gác nhiều hơn nó trông: `codeInput` (list-input.ts) dựng trên nó,
 * và `codeInput` là input của `byCode`, `publish`, `archive`, `delete`, `forEdit`,
 * `revealHint`, `submit`. Giữ nó ở khuôn chỉ-K8s nghĩa là một bài Git lưu xuống
 * được rồi KHÔNG mở được, KHÔNG xuất bản được, KHÔNG sửa được — và câu lỗi
 * người soạn nhận là một 400 nói về định dạng mã, thứ không chỉ được vào đâu cả.
 * Đo 2026-09-15 khi mở đường lưu bản nháp Builder (§18.E.5).
 *
 * Câu lỗi nêu một tiền tố THẬT thay vì liệt kê hết: danh sách đầy đủ làm câu
 * dài ra theo số game, còn người đọc chỉ cần thấy KHUÔN. `?? ` chỉ để kiểu
 * không rỗng — mảng rỗng là bất khả thi vì `PROBLEM_PLUGINS` luôn có hai mục.
 */
export const problemCodeSchema = z
  .string()
  .regex(
    ANY_PROBLEM_CODE_PATTERN,
    `Mã bài phải dạng ${PROBLEM_CODE_PREFIXES[0] ?? 'K8S'}-0042`,
  );
export const problemSlugSchema = z.string().min(1).max(120).regex(SLUG_PATTERN, 'Slug chỉ gồm chữ thường, số và gạch nối');
export const tagSchema = z.string().min(1).max(40).regex(SLUG_PATTERN, 'Tag chỉ gồm chữ thường, số và gạch nối');

const nodeSpecSchema = z
  .object({
    name: z.string().min(1),
    /** milli-core; 1 core = 1000. */
    cpu: z.number().int().positive().max(PG_INT4_MAX),
    /** MiB. */
    memory: z.number().int().positive().max(PG_INT4_MAX),
    ready: z.boolean(),
    labels: z.record(z.string(), z.string()).optional(),
    taints: z.array(z.string()).readonly().optional(),
  })
  .strict();

const resourceSpecSchema = z
  .object({
    // `z.enum` dựng từ `ALL_KINDS` (sinh từ `Object.keys(KINDS)` trong
    // `resources.ts`), nên một `Deploymnet` gõ nhầm bị chặn ngay ở cổng ghi thay
    // vì lọt vào DB rồi lộ ra lúc có người làm bài.
    kind: z.enum(ALL_KINDS as unknown as [ResourceKind, ...ResourceKind[]]),
    name: z.string().min(1),
    namespace: z.string().min(1),
    /**
     * Cố ý LỎNG, và hợp đồng nói rõ vì sao: 26 loại × mọi field thật của K8s là
     * một cây kiểu khổng lồ mà bài tập chỉ chạm vào một góc. `resources.ts` giữ
     * bộ field mỗi loại THẬT SỰ đọc; ở đây chỉ đòi nó là một object.
     */
    spec: z.record(z.string(), z.unknown()),
    seededIncident: z.string().min(1).optional(),
  })
  .strict();

export const clusterSpecSchema = z
  .object({
    nodes: z.array(nodeSpecSchema).min(1, 'Cụm phải có ít nhất một node').readonly(),
    namespaces: z.array(z.string().min(1)).readonly(),
    resources: z.array(resourceSpecSchema).readonly(),
  })
  .strict();

/**
 * Một TESTCASE — hình dạng `core/problem.ts` § `Testcase`, không còn `Objective`.
 *
 * Hai trường đổi, và cả hai đều đổi NGHĨA chứ không đổi tên:
 *
 * - `required` **biến mất**. Quyết định #20 bỏ hẳn khái niệm mục tiêu thưởng:
 *   *"một testcase thì luôn chặn — đó là nghĩa của `AC`"*. Giữ lại một cờ không
 *   ai đọc là mời người soạn bật nó rồi tưởng nó có tác dụng.
 * - `visible` **xuất hiện**, và nó KHÔNG phải `required` đổi tên.
 *   `server/problems/testcases.ts` đầu file có bảng so sánh: `required` hỏi
 *   *không đạt thì có chặn không*, `visible` hỏi *người làm có được XEM trước
 *   khi nộp không*. Ánh xạ cái này sang cái kia là đổi nghĩa dữ liệu đang có.
 *
 * ⚠ Bắt buộc, KHÔNG `.default(true)`. Mặc định ở đây sẽ là luật thứ hai cạnh
 * luật của biên ĐỌC (`problemTestcases`: *"chỉ một `false` TƯỜNG MINH mới làm
 * testcase ẩn"*), và hai mặc định cho cùng một cột là chỗ dữ liệu bắt đầu lệch.
 * Biên đọc dựng giá trị cho dòng CŨ; biên ghi thì đòi người gửi nói rõ ý mình.
 */
const testcaseSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    /**
     * Tên vị từ trong bảng vị từ của engine.
     *
     * ⚠ KHOẢNG TRỐNG ĐÃ BIẾT — và nó vừa ĐỔI TÍNH CHẤT, nên đừng chép lại câu
     * cũ. Bản trước nói *"biên ghi này không với tới `packages/games`"*; điều đó
     * nay SAI: file này đã nhập `PROBLEM_PLUGINS`, và mỗi plugin khai
     * `predicateNames` — tức phép kiểm "tên vị từ có thật không" đã **với tới
     * được**, chỉ là chưa làm.
     *
     * Chưa làm trong lượt này vì nó là một cổng MỚI trên đường lưu nháp, không
     * phải một phần của việc mở đa-game: một bài CŨ mang vị từ đã bị gỡ khỏi
     * bảng sẽ thành bài "mở ra sửa được nhưng bấm Lưu thì 400", và
     * `app/author/problems/problem-validate.ts` đã cố ý chọn hướng ngược lại
     * (*"chặn ngay ở khâu nạp thì bài hỏng thành bài không mở nổi"*). Đóng nó là
     * một quyết định về hành vi, cần người ra lệnh.
     *
     * ⚠ HỆ QUẢ MỚI của việc mở đa-game, phải nói thẳng: trước đợt này chỉ bài
     * K8s ghi được, nên "vị từ K8s trên bài Git" không có đường tồn tại. Giờ thì
     * có. Cho tới khi cổng trên được dựng, một bài Git mang `check` của K8s lưu
     * xuống được và chỉ lộ ra lúc chấm.
     *
     * Hai phép kiểm còn lại — "vị từ này đòi những tham số nào" và ràng buộc
     * "một trong hai" — vẫn chỉ sống ở giao diện soạn bài
     * (`app/author/problems/publish-check.tsx`), nên gọi thẳng `problems.publish`
     * qua tRPC là đi vòng qua chúng.
     */
    check: z.string().min(1),
    args: z.record(z.string(), z.unknown()).optional(),
    visible: z.boolean(),
  })
  .strict();

const hintSchema = z
  .object({
    id: z.string().min(1).max(64),
    text: z.string().min(1),
    /** 0 = miễn phí. Âm sẽ là một gợi ý CỘNG điểm — không phải thứ hợp đồng nói. */
    penaltyPoints: z.number().int().min(0).max(1000),
  })
  .strict();

/**
 * Phần soạn được của một bài.
 *
 * ⛔ KHÔNG có `authorId`, và đó là luật 1 ở dạng mạnh, chép từ `authoring.ts`:
 * một field `authorId` trong input là một field kẻ tấn công điền được, và mọi
 * kiểm tra sau đó so sánh giá trị họ cung cấp với chính nó. Chủ sở hữu chỉ tới
 * từ `ctx.user.id` khi TẠO và từ cột `author_id` ĐỌC TỪ DB khi SỬA.
 *
 * Cũng KHÔNG có `code` (máy chủ cấp, xem `next-code.ts`), `state` (đổi qua
 * `publish`/`archive`), `createdAt`/`updatedAt`.
 */
export const problemBodyShape = z
  .object({
    /**
     * Game của bài — quyết định plugin nào chấm, tập chủ đề nào hợp lệ, và
     * `initialState` được kiểm tới đâu. Đứng đầu vì mọi phép kiểm phụ thuộc
     * game ở `refineByGame` đọc nó trước tiên.
     */
    gameId: z.enum(GAME_IDS),
    slug: problemSlugSchema,
    title: z.string().min(1).max(200),
    statement: z.string().min(1),
    difficulty: z.enum(PROBLEM_DIFFICULTIES),
    /**
     * Ít nhất một, tối đa ba. Nhiều hơn ba thì bài đang làm quá nhiều việc.
     *
     * ⛔ `z.string()` ở đây KHÔNG phải "nới thành trường tự do" — xem khối đầu
     * file. Tập đóng do `refineByGame` gác theo plugin của `gameId`.
     */
    topics: z.array(z.string().min(1)).min(1).max(3).readonly(),
    tags: z.array(tagSchema).max(20).readonly(),
    timeLimitSec: z.number().int().positive().max(PG_INT4_MAX).nullable(),
    /**
     * Trạng thái ban đầu. Kiểu đúng phụ thuộc `gameId`, nên hình dạng được gác ở
     * `refineByGame` — chỗ duy nhất biết cả hai trường cùng lúc.
     *
     * `z.unknown()` một mình cho qua cả một khoá VẮNG MẶT (Zod coi `unknown` là
     * gồm `undefined`), và một `initial_state` vắng mặt là một cột `notNull` bị
     * ghi rác. `refineByGame` vì thế đòi nó là object cho MỌI game, kể cả game
     * chưa có schema riêng.
     */
    initialState: z.unknown(),
    /** Trạng thái ĐÍCH, chỉ với bài chấm bằng so hình dạng. Xem `ProblemBase.targetState`. */
    targetState: z.unknown().optional(),
    objectives: z.array(testcaseSchema).min(1).readonly(),
    /**
     * `null` = mọi loại. Một mảng rỗng KHÔNG tương đương — nó nghĩa là cấm hết.
     *
     * ⚠ NỢ ĐÃ GHI TÊN ở `dto.ts` § `StoredProblem`: trường này là cột của thời
     * K8s-một-game và không có nghĩa nào với bài Git (`null` vĩnh viễn). Biên
     * này KHÔNG chặn một bài Git gửi `allowedResources` khác `null` — chặn nó
     * cần biết `allowedResources` thuộc về plugin nào, mà hợp đồng plugin chưa
     * có ô cho "trường riêng của game". Chuyển nó vào `authorFields` là §18.A.3.
     */
    allowedResources: z
      .array(z.enum(ALL_KINDS as unknown as [ResourceKind, ...ResourceKind[]]))
      .readonly()
      .nullable(),
    hints: z.array(hintSchema).max(10).readonly(),
    parMoves: z.number().int().positive().max(PG_INT4_MAX).nullable(),
    /**
     * §18.D.6 — bài có sinh được đề theo seed không. Gác ở `refineByGame`: bật
     * cờ này trên một game không có `seedSpec` là một lời hứa không ai thực hiện.
     */
    seedable: z.boolean(),
  })
  .strict();

/** `true` khi giá trị là một object JSON thường — không phải `null`, không phải mảng. */
function isPlainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Cùng phép kiểm `isPlainObject`, nhưng ĐỌC ĐƯỢC: trả chính object đó, hoặc `{}`.
 *
 * Tách ra chứ không đổi `isPlainObject` thành một type predicate: hàm kia đang
 * được dùng như một `boolean` thuần ở bốn nhánh `addIssue`, và đổi chữ ký của nó
 * là sửa mã ngoài phạm vi lượt này. Ở đây ta cần *giá trị đã thu hẹp*, không cần
 * một câu trả lời đúng/sai.
 *
 * `{}` cho mọi thứ không phải object là câu trả lời ĐÚNG chứ không phải một
 * fallback im lặng: một `cd: 42` không chở khối kịch bản nào, y như `cd` vắng
 * mặt, và bộ chấm cũng đọc nó đúng như vậy.
 */
function nhuObject(value: unknown): Readonly<Record<string, unknown>> {
  return isPlainObject(value) ? (value as Readonly<Record<string, unknown>>) : {};
}

/**
 * 19.J.2.2 — vị từ chương CD chỉ khai được khi đề CÓ khối kịch bản nó đọc.
 *
 * ## Vì sao cổng này phải ở BIÊN GHI, không chỉ ở form
 *
 * Thiếu khối kịch bản, vị từ CD trả `false` ở MỌI lượt nộp — kể cả lượt nộp
 * đúng — và trả `false` một cách im lặng. Người soạn xuất bản một bài không ai
 * giải được; người làm nhận đúng hai chữ "chưa đạt" và không có đường nào đọc ra
 * vì sao. Cái giá của một phép kiểm chỉ-ở-giao-diện đã ghi ngay đầu file này:
 * *"một lời gọi API viết tay không đi qua file đó"*.
 *
 * Bộ chấm (`gradeCicdProblem`) cũng chặn ca này và trả `CE`. Hai chỗ chặn KHÔNG
 * thừa: bộ chấm chỉ nói sau khi bài đã xuất bản và đã có người nộp, còn cổng này
 * nói lúc người soạn còn đang sửa. Cả hai đọc CÙNG bảng `CD_PREDICATE_NEEDS` —
 * một bản chép tay ở tầng web sẽ trôi, và chỗ trôi đúng là "bài lưu được nhưng
 * không chấm được".
 *
 * ⚠ Cổng này KHÔNG kiểm hình dạng bên trong `cd` (một `ReleaseScenario` có đủ
 * mười ba trường không). Đó là khoảng trống CÓ CHỦ Ý, cùng lý do đã ghi cho
 * `initialState` của game không phải K8s: một schema Zod thứ hai cho hợp đồng
 * đang sống ở `packages/games` sẽ trôi khỏi bản gốc. Chỗ đúng của phép kiểm đó
 * là một `parseSpec` trong `GameProblemPlugin`, và hợp đồng plugin chưa có ô cho
 * nó. Cho tới lúc đó, một kịch bản thiếu trường sẽ ném ở `runLevelCd` và bộ chấm
 * bắt thành `CE` — đọc được, chỉ là muộn hơn.
 */
function refineCicdCd(
  body: {
    readonly initialState: unknown;
    readonly objectives: readonly { readonly id: string; readonly check: string }[];
  },
  ctx: z.RefinementCtx,
): void {
  /*
   * `initialState` ở đây là `unknown` (biên này cố ý không dựng lại `CicdProblemSpec`),
   * nên đọc `cd` bằng tay và coi mọi thứ không-phải-object là "không có khối nào".
   * Một `cd: 42` vì thế bị xử như vắng mặt và người soạn nhận đúng câu "thiếu
   * khối cd.release" — trung thực, vì với bộ chấm nó cũng vắng mặt như vậy.
   */
  const cd = nhuObject(nhuObject(body.initialState)['cd']);
  const initial = nhuObject(cd['initial']);

  body.objectives.forEach((objective, index) => {
    const can = CD_PREDICATE_NEEDS[objective.check as keyof typeof CD_PREDICATE_NEEDS];
    if (can === undefined) return;

    /*
     * ⛔ HAI KHỐI, không phải một — và vế thứ hai là một lỗi ĐÃ ĐO (review PR
     * #146). Bản đầu chỉ hỏi `cd[can] !== undefined`, tức chỉ hỏi về KỊCH BẢN.
     *
     * Chấm một vị từ CD cần thêm CHÍNH SÁCH khởi điểm: `mergeCdPolicies`
     * (`cd-run.ts`) bỏ hẳn một bộ mô phỏng khi `cd.initial` thiếu khối tương
     * ứng, và `runLevelCd` chỉ ghi bản ghi khi CẢ HAI có mặt. Không bản ghi thì
     * mọi vị từ CD trả `false` — im lặng, vĩnh viễn, kể cả với lời giải đúng.
     * Đó đúng là hình dạng "bài không ai giải được" mà cổng này sinh ra để chặn,
     * chỉ khác chỗ thiếu.
     *
     * `isPlainObject` chứ không `!== undefined`: `null` thoả phép so với
     * `undefined` nhưng KHÔNG phải một khối kịch bản, và nó đi tiếp tới
     * `cd-run.ts` rồi ném ở một phép destructure nằm NGOÀI khối `try` — lượt
     * chấm thành `CE` kèm một câu lỗi JS thô. Một mảng cũng vậy.
     */
    const thieu: string | null = !isPlainObject(cd[can])
      ? `cd.${can}`
      : !isPlainObject(initial[can])
        ? `cd.initial.${can}`
        : null;
    if (thieu === null) return;

    ctx.addIssue({
      code: 'custom',
      path: ['objectives', index, 'check'],
      message:
        `Vị từ "${objective.check}" đọc bản ghi của bộ mô phỏng "${can}", nhưng đề chưa khai ` +
        `khối "${thieu}". Thiếu kịch bản thì không có gì để mô phỏng; thiếu chính sách khởi ` +
        `điểm thì bộ mô phỏng không chạy, và vị từ sẽ trượt ở MỌI lượt nộp.`,
    });
  });
}

/**
 * Phép kiểm PHỤ THUỘC GAME — chỗ duy nhất đọc `gameId` cùng lúc với phần còn lại.
 *
 * Viết thành một hàm dùng chung cho cả `create` lẫn `update` chứ không gọi
 * `.superRefine` hai lần với hai thân hàm: hai bản sao sẽ trôi ở đúng phép kiểm
 * mà ai đó thêm vào một bên. Đó cũng là lý do `problemBodyShape` giữ nguyên dạng
 * `ZodObject` thuần — `.superRefine()` trả về một bọc không còn `.extend()`, nên
 * `problemUpdateSchema` phải `.extend({ code })` TRƯỚC rồi mới refine.
 */
function refineByGame(
  body: {
    readonly gameId: GameId;
    readonly topics: readonly string[];
    readonly initialState: unknown;
    readonly targetState?: unknown;
    readonly seedable: boolean;
    readonly objectives: readonly { readonly id: string; readonly check: string }[];
  },
  ctx: z.RefinementCtx,
): void {
  const plugin = PROBLEM_PLUGINS[body.gameId];
  if (plugin === undefined) {
    // `GAME_IDS` có sáu giá trị, `PROBLEM_PLUGINS` mới có hai. Bốn game còn lại
    // là `gameId` HỢP LỆ mà chưa có engine chấm — lưu một bài cho chúng là lưu
    // một bài không ai chấm được, nên chặn ở đây thay vì để nó nằm chờ.
    ctx.addIssue({
      code: 'custom',
      path: ['gameId'],
      message: `Game "${body.gameId}" chưa có engine chấm bài, nên chưa soạn bài cho nó được`,
    });
    return;
  }

  const allowedTopics = new Set(plugin.topics.map((topic) => topic.id));
  body.topics.forEach((topic, index) => {
    if (!allowedTopics.has(topic)) {
      ctx.addIssue({
        code: 'custom',
        path: ['topics', index],
        message: `Chủ đề "${topic}" không thuộc tập chủ đề của game ${body.gameId}`,
      });
    }
  });

  if (body.gameId === 'k8s') {
    /*
     * K8s giữ NGUYÊN độ chặt cũ, từng phép kiểm một: `clusterSpecSchema` vẫn là
     * thứ chạy, chỉ đổi chỗ đứng. Nới nó ra "một object bất kỳ" như các game
     * khác sẽ là một phép nới lặng lẽ trên đúng dữ liệu đang có — một
     * `Deploymnet` gõ nhầm lại lọt vào DB như trước khi cổng này tồn tại.
     *
     * Issue được nối tiền tố `initialState` vào `path` để `errorFormatter` của
     * repo vẫn đưa ra client đúng ô sai; mất tiền tố thì người soạn nhận một lỗi
     * trỏ vào `nodes.0.cpu` mà không biết `nodes` nằm trong trường nào.
     */
    const parsed = clusterSpecSchema.safeParse(body.initialState);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ['initialState', ...issue.path] });
      }
    }
  } else if (!isPlainObject(body.initialState)) {
    /*
     * ⚠ KHOẢNG TRỐNG CÓ CHỦ Ý, đừng đọc nhầm thành một phép kiểm.
     *
     * Với game không phải K8s, biên này chỉ khẳng định `initialState` là một
     * object — KHÔNG khẳng định nó là một `WorldSpec` hợp lệ. Viết một schema
     * Zod thứ hai cho `WorldSpec` ở đây là dựng bản sao thứ hai của một hợp đồng
     * đang sống trong `packages/games`, và bản sao sẽ trôi. Chỗ đúng của phép
     * kiểm đó là plugin (một `parseSpec` trong `GameProblemPlugin`), và hợp đồng
     * plugin chưa có ô cho nó — đã báo lead, `packages/games` ngoài lane này.
     *
     * Đòi object chứ không đòi gì cả vì cột `initial_state` là `notNull`: một
     * khoá vắng mặt hay một `null` lọt qua đây sẽ thành một lỗi Postgres 500,
     * tức đổi một lỗi đọc được lấy một lỗi không đọc được.
     */
    ctx.addIssue({
      code: 'custom',
      path: ['initialState'],
      message: 'Trạng thái ban đầu phải là một object',
    });
  }

  if (body.gameId === 'cicd') {
    refineCicdCd(body, ctx);
  }

  if (body.targetState !== undefined && !isPlainObject(body.targetState)) {
    ctx.addIssue({
      code: 'custom',
      path: ['targetState'],
      message: 'Trạng thái đích phải là một object',
    });
  }

  if (body.seedable && plugin.seedSpec === undefined) {
    /*
     * Nửa CÒN LẠI của cổng §18.G.3, và là nửa có hiệu lực.
     *
     * `core/problem-plugin.ts` § `seedSpec` nói thẳng: *"Cổng kiểm phải đo CẢ
     * HAI vế"* — một bài khai `seedable: true` trong khi plugin không sinh được
     * đề theo seed sẽ phát CÙNG MỘT đề cho mọi sinh viên trong một kỳ thi
     * `per-student`, im lặng, vì nó không lỗi ở đâu cả.
     *
     * Giao diện cũng vô hiệu hoá ô đánh dấu, nhưng giao diện không phải cổng:
     * `problem-validate.ts` đầu file đã ghi rõ *"một lời gọi API viết tay không
     * đi qua file này"*. Hôm nay KHÔNG plugin nào khai `seedSpec`, nên nhánh này
     * chặn mọi `seedable: true` — đó là câu trả lời đúng cho tình trạng thật,
     * không phải một cổng chặt quá tay.
     */
    ctx.addIssue({
      code: 'custom',
      path: ['seedable'],
      message: `Game ${body.gameId} chưa sinh được đề theo seed, nên bài của nó không thể bật "sinh đề theo seed"`,
    });
  }
}

/**
 * Hình dạng ĐI VÀO KHO — chính là `StoredProblem` trừ những field máy chủ cấp.
 *
 * Viết bằng `Omit` chứ không gõ lại 15 field: gõ lại là một bản sao thứ hai của
 * hợp đồng, và nó sẽ trôi ở đúng cái field mà ai đó thêm vào `StoredProblem` mà
 * quên ở đây.
 *
 * Neo vào `StoredProblem` (DTO game-neutral) chứ không vào `Problem` của K8s:
 * `Problem` khai `initialState: ClusterSpec` và `objectives` mang `required`,
 * nên nó mô tả đúng một game và một mô hình testcase đã bị #20 bỏ.
 *
 * ## ⚠ `testcases` bị loại ra rồi khai lại dưới tên `objectives`
 *
 * Không phải để né lỗi kiểu. Ba tên cho cùng một thứ đang tồn tại và chỉ MỘT
 * trong ba đổi được:
 *
 * | Nơi | Tên | Đổi được không |
 * |---|---|---|
 * | Hợp đồng miền (`ProblemBase`) | `testcases` | — đã là tên mới |
 * | Cột DB | `objectives` | KHÔNG (xem chú thích cột ở `schema.ts`) |
 * | Payload lên dây + file JSON xuất ra | `objectives` | KHÔNG |
 *
 * Định dạng file (`ProblemExport`) đã nằm trong máy người khác, và
 * `problem-json.ts` nói rõ hệ quả của việc đổi khoá: file cũ nhập vào thành bài
 * RỖNG, im lặng, vì nhánh `Array.isArray` chỉ rơi sang mặc định. Nên payload giữ
 * tên lịch sử, KIỂU thì là `Testcase` của hôm nay.
 *
 * ⛔ Không sửa cái này bằng cách để `Omit` giữ lại `testcases`: `toContractShape`
 * là một `as` nên TypeScript sẽ im, còn lúc chạy `toRowValues` đọc
 * `body.testcases` ra `undefined` và ghi một cột `objectives` rỗng. Mất dữ liệu
 * trong im lặng, không ô test nào ở đường ghi đỏ.
 */
export type ProblemBody = Omit<
  StoredProblem,
  'code' | 'state' | 'authorId' | 'createdAt' | 'updatedAt' | 'testcases'
> & { readonly objectives: readonly Testcase[] };

/**
 * Kiểu Zod suy ra → kiểu hợp đồng.
 *
 * ⚠ Đây là chỗ DUY NHẤT trong lane có `as`, và nó có lý do đo được, không phải
 * để dập một lỗi kiểu. `.optional()` của Zod sinh ra `labels?: X | undefined` —
 * tức khoá được phép CÓ MẶT với giá trị `undefined`. Hợp đồng thì chạy dưới
 * `exactOptionalPropertyTypes: true`, nơi `labels?: X` nghĩa là "vắng mặt, hoặc
 * là X, KHÔNG được là undefined". Hai hình dạng ấy khác nhau thật ở tầng kiểu và
 * TypeScript đúng khi từ chối.
 *
 * `JSON.parse(JSON.stringify(…))` làm cho phép ép trở nên ĐÚNG chứ không chỉ
 * được cho qua: `JSON.stringify` XOÁ HẲN mọi khoá có giá trị `undefined`, nên
 * object trả về không còn khoá nào ở trạng thái mà kiểu đích cấm. Nói cách khác
 * phép ép mô tả đúng giá trị lúc chạy, thay vì khẳng định một điều chưa chắc.
 *
 * Không dùng `structuredClone`: nó GIỮ khoá `undefined`, nên nó sẽ để lại đúng
 * hình dạng mà phép ép đang nói là không có.
 */
export function toContractShape<T>(parsed: unknown): T {
  return JSON.parse(JSON.stringify(parsed)) as T;
}

/** Body đã chuẩn hoá về hình dạng hợp đồng. Dùng cho `create`. */
export const problemBodySchema = problemBodyShape
  .superRefine(refineByGame)
  .transform((parsed) => toContractShape<ProblemBody>(parsed));

/**
 * `update` mang thêm `code` — tách ra để `crud.ts` nhận đúng hai mảnh.
 *
 * ⚠ Thứ tự `.extend().strict().superRefine().transform()` là bắt buộc, không
 * phải phong cách: `.superRefine()` trả về một bọc không còn `.extend()`, nên
 * refine trước là một lỗi biên dịch. Và `refineByGame` phải chạy TRƯỚC
 * `.transform()` — sau phép biến hình thì `code` đã tách khỏi `body` và
 * `path` của issue sẽ trỏ vào `body.topics.0` thay vì `topics.0`, tức client
 * không tìm thấy ô nào để tô đỏ.
 */
export const problemUpdateSchema = problemBodyShape
  .extend({ code: problemCodeSchema })
  .strict()
  .superRefine(refineByGame)
  .transform((parsed) => {
    const { code, ...body } = parsed;
    return { code, body: toContractShape<ProblemBody>(body) };
  });
