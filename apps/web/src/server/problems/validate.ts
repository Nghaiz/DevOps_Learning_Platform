import { z } from 'zod';
import {
  ALL_KINDS,
  PROBLEM_CODE_PATTERN,
  PROBLEM_DIFFICULTIES,
  PROBLEM_TOPICS,
  type Problem,
  type ResourceKind,
} from '@devops-platform/games';

/**
 * Biên GHI của hệ bài tập. Mọi thứ đi vào `problems` đều qua đây.
 *
 * Vì sao validate ở tầng ứng dụng chứ không bằng ràng buộc Postgres: tập chủ đề
 * và tập độ khó là SSOT trong `packages/games/src/k8s/problem.ts`, và một `CHECK`
 * hay một `pgEnum` thứ hai cho `topics` sẽ là bản sao thứ hai của cùng danh sách
 * — hai bản sao thì sẽ trôi. Cột `difficulty`/`state` vẫn là `pgEnum` vì chúng
 * sinh TỰ ĐỘNG từ chính hằng đó, không phải gõ lại.
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

export const problemCodeSchema = z.string().regex(PROBLEM_CODE_PATTERN, 'Mã bài phải dạng K8S-0042');
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

const objectiveSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    /**
     * Tên vị từ trong bảng `PREDICATES` của engine.
     *
     * ⚠ KHOẢNG TRỐNG ĐÃ BIẾT, ghi ở đây chứ không chỉ trong báo cáo. Máy chủ chỉ
     * kiểm được rằng đây là một chuỗi khác rỗng: bảng `PREDICATES` và bảng tra
     * tham số của từng vị từ sống trong engine (`packages/games`), và biên ghi
     * này không với tới chúng.
     *
     * Hai phép kiểm THẬT SỰ hữu ích — "vị từ này đòi những tham số nào" và ràng
     * buộc "một trong hai" của `pod-running`/`secret-mounted`/`volume-mounted` —
     * vì vậy chỉ sống ở giao diện soạn bài (`app/author/problems/publish-check.tsx`).
     * Hệ quả phải nói thẳng: gọi thẳng `problems.publish` qua tRPC là ĐI VÒNG QUA
     * chúng, và một mục tiêu thiếu tham số sẽ chỉ lộ ra khi có người vào làm bài.
     * Đừng đọc file này như thể nó đã gác chuyện đó.
     */
    check: z.string().min(1),
    args: z.record(z.string(), z.unknown()).optional(),
    required: z.boolean(),
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
    slug: problemSlugSchema,
    title: z.string().min(1).max(200),
    statement: z.string().min(1),
    difficulty: z.enum(PROBLEM_DIFFICULTIES),
    /** Hợp đồng: ít nhất một, tối đa ba. Nhiều hơn ba thì bài đang làm quá nhiều việc. */
    topics: z.array(z.enum(PROBLEM_TOPICS)).min(1).max(3).readonly(),
    tags: z.array(tagSchema).max(20).readonly(),
    timeLimitSec: z.number().int().positive().max(PG_INT4_MAX).nullable(),
    initialState: clusterSpecSchema,
    objectives: z.array(objectiveSchema).min(1).readonly(),
    /** `null` = mọi loại. Một mảng rỗng KHÔNG tương đương — nó nghĩa là cấm hết. */
    allowedResources: z
      .array(z.enum(ALL_KINDS as unknown as [ResourceKind, ...ResourceKind[]]))
      .readonly()
      .nullable(),
    hints: z.array(hintSchema).max(10).readonly(),
    parMoves: z.number().int().positive().max(PG_INT4_MAX).nullable(),
  })
  .strict();

/**
 * Hình dạng ĐI VÀO KHO — chính là `Problem` trừ những field máy chủ cấp.
 *
 * Viết bằng `Omit` chứ không gõ lại 12 field: gõ lại là một bản sao thứ hai của
 * hợp đồng, và nó sẽ trôi ở đúng cái field mà ai đó thêm vào `Problem` mà quên
 * ở đây.
 */
export type ProblemBody = Omit<Problem, 'code' | 'state' | 'authorId' | 'createdAt' | 'updatedAt'>;

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
export const problemBodySchema = problemBodyShape.transform((parsed) =>
  toContractShape<ProblemBody>(parsed),
);

/** `update` mang thêm `code` — tách ra để `crud.ts` nhận đúng hai mảnh. */
export const problemUpdateSchema = problemBodyShape
  .extend({ code: problemCodeSchema })
  .strict()
  .transform((parsed) => {
    const { code, ...body } = parsed;
    return { code, body: toContractShape<ProblemBody>(body) };
  });
