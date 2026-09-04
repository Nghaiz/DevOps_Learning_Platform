import { z } from 'zod';

/**
 * DTO chung của một scenario học (P2 — trụ cột Lessons).
 *
 * Đây là hình dạng SAU khi `packages/scenario` đã chuẩn hoá; nó KHÔNG phải hình
 * dạng của `index.json` upstream. Schema của upstream sống trong
 * `packages/scenario/src/killercoda.ts` và cố ý không rò ra đây: DTO này là thứ
 * tRPC (2.B) và FE (2.D) phụ thuộc vào, nên nó phải đứng yên khi Killercoda đổi
 * format — đó là toàn bộ lý do có một tầng chuẩn hoá ở giữa.
 *
 * SSOT của format upstream + quyết định thiết kế: `docs/scenario-format.md`.
 */

/**
 * Độ khó — **KHÔNG parse được từ upstream.** Killercoda `index.json` không có
 * field nào tương đương (đã kiểm: code search `"difficulty" path:index.json` trả
 * 0 kết quả, và trang docs của creator không liệt kê nó).
 *
 * Nên nó tới từ sidecar `dlp.json` do CHÍNH TA viết. Ghi lại ở đây vì plan P2
 * viết `Scenario{id, title, difficulty, ...}` như thể đọc được từ Katacoda — một
 * default ngầm ('beginner') sẽ làm mọi bài trông dễ như nhau mà không ai biết vì
 * sao, nên nó là field BẮT BUỘC của sidecar chứ không phải optional có default.
 */
export const SCENARIO_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export type ScenarioDifficulty = (typeof SCENARIO_DIFFICULTIES)[number];

/**
 * Thứ sandbox PHẢI có thì bài mới chạy được. Suy ra từ `backend.imageid` của
 * upstream và được sidecar khẳng định lại (xem `packages/scenario/src/backend.ts`).
 *
 * Tồn tại để một bài `kubernetes-kubeadm-2nodes` không lặng lẽ được xếp vào một
 * sandbox chỉ có shell: người học sẽ thấy `kubectl: command not found` ở step 1
 * và không có gì trong hệ thống nói rằng bài đó chưa bao giờ chạy được.
 */
export const SCENARIO_CAPABILITIES = ['docker', 'kubernetes', 'multi-node'] as const;
export type ScenarioCapability = (typeof SCENARIO_CAPABILITIES)[number];

/** Khớp `sandbox_tier` pgEnum (apps/web db/schema.ts) và `SandboxTier` của proto. */
export const SANDBOX_TIER_NAMES = ['sysbox', 'gvisor', 'kata'] as const;
export type SandboxTierName = (typeof SANDBOX_TIER_NAMES)[number];

/**
 * `id` đi thẳng vào `progress.lesson_id` (cột text, unique cùng `user_id`). Vì
 * vậy nó là một ĐỊNH DANH BỀN, không phải tên thư mục: đổi tên thư mục mà id
 * suy ra từ đó thì mọi dòng progress cũ trở thành mồ côi trong im lặng — không
 * lỗi, không cảnh báo, chỉ là mọi người mất tiến độ. Sidecar khai id tường minh
 * và loader BẮT BUỘC nó phải khớp thư mục ở thời điểm import (xem loader).
 */
export const scenarioIdSchema = z
  .string()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/,
    'scenario id chỉ nhận [a-z0-9-], bắt đầu/kết thúc bằng chữ-số, dài 3–63 ký tự',
  );

/**
 * Xuất xứ upstream. AC 2.E đòi "đã verify license", và cách duy nhất để câu đó
 * còn đúng sáu tháng nữa là license phải là DỮ LIỆU máy kiểm được chứ không phải
 * một dòng trong commit message.
 *
 * `null` = bài do CHÍNH NỀN TẢNG NÀY soạn, không nhập từ đâu cả. Khi đó không có
 * commit upstream để ghim và `vendor-scenarios.mjs` bỏ qua bài đó — license của
 * nó là license của repo này.
 *
 * ⚠ Nullable là mô hình ĐÚNG chứ không phải nới lỏng để lách: bản `ScenarioSource`
 * chạy trên DB (soạn bài trực tiếp trên UI — §Yêu cầu nền tảng #3) sẽ sinh ra
 * toàn bài không có upstream. Bắt chúng khai một `source` giả để qua schema là
 * cách biến một field kiểm-license-được thành một field chứa dữ liệu bịa.
 */
export const scenarioSourceSchema = z
  .object({
    /** URL repo upstream. */
    repo: z.string().url(),
    /** Commit SHA đầy đủ — ghim để `vendor-scenarios.mjs --check` phát hiện lệch. */
    commit: z.string().regex(/^[0-9a-f]{40}$/, 'commit phải là SHA-1 đầy đủ 40 ký tự hex'),
    /** Đường dẫn thư mục scenario TRONG repo upstream. */
    path: z.string().min(1),
    /** SPDX id, ví dụ `MIT`, `Apache-2.0`. */
    license: z.string().min(1),
    /** URL tới file LICENSE ở đúng commit đã ghim. */
    licenseUrl: z.string().url(),
    /** Tiêu đề gốc của upstream — giữ để đối chiếu khi upstream đổi tên bài. */
    upstreamTitle: z.string().min(1),
  })
  .strict();
export type ScenarioSource = z.infer<typeof scenarioSourceSchema>;

/**
 * Hai loại script setup của Killercoda, GIỮ TÁCH NHAU.
 *
 * Docs của Killercoda phân biệt rõ: `foreground` hiện mọi lệnh trong terminal
 * người học nhìn thấy, `background` chạy ẩn. Gộp chúng thành một `setupScript`
 * (như plan P2 phác) là mất đúng thông tin quyết định UX: một `apt-get update`
 * dài 40 giây chạy foreground là "màn hình đang chạy gì đó", chạy background là
 * "terminal treo câm". 2.C phải chạy chúng khác nhau.
 */
export const phaseScriptsSchema = z
  .object({
    foreground: z.string().nullable(),
    background: z.string().nullable(),
  })
  .strict();
export type PhaseScripts = z.infer<typeof phaseScriptsSchema>;

/**
 * Nội dung markdown THÔ, nguyên văn upstream.
 *
 * ⛔ KHÔNG có `markdownHtml` dù plan P2 đặt tên field như vậy — hai lý do, cả hai
 * đều là chặn cứng chứ không phải sở thích:
 *
 * 1. **Nó là derived field** (`rules/code-conventions.md` § No Derived Fields):
 *    HTML tính được 100% từ markdown. Lưu cả hai là dựng hai nguồn sự thật cho
 *    cùng một nội dung, và chúng sẽ lệch ở lần đầu tiên ai đó sửa markdown mà
 *    quên chạy lại bước render.
 * 2. **HTML KHÔNG chở nổi phần tương tác.** Markdown Killercoda mang hậu tố
 *    `{{exec}}`/`{{copy}}` — chúng phải thành NÚT nối vào terminal, không phải
 *    thẻ `<code>`. Một chuỗi HTML không có chỗ nào gắn handler. AC "code copy
 *    button hoạt động" vì thế không đóng được bằng `markdownHtml`.
 *
 * Đường đúng: giữ markdown nguyên văn ở đây, và gọi hàm THUẦN
 * `parseContentBlocks(markdown)` của `packages/scenario` ở nơi cần render. Một
 * nguồn, một hàm, hai phía (server 2.C và FE 2.D) dùng chung.
 */
export const scenarioPhaseSchema = z
  .object({
    /** Killercoda cho phép vắng `title` (ví dụ upstream `use-images`). */
    title: z.string().nullable(),
    markdown: z.string(),
    setup: phaseScriptsSchema,
    /** Nội dung script chấm (không phải đường dẫn). `null` = phase này không chấm. */
    verifyScript: z.string().nullable(),
  })
  .strict();
export type ScenarioPhase = z.infer<typeof scenarioPhaseSchema>;

export const scenarioStepSchema = scenarioPhaseSchema
  .extend({
    /** 0-based, liên tục. Khớp `progress.step_index`. */
    index: z.number().int().min(0),
  })
  .strict();
export type ScenarioStep = z.infer<typeof scenarioStepSchema>;

/** File được đẩy vào sandbox lúc start (`details.assets` của upstream). */
export const scenarioAssetSchema = z
  .object({
    /** `host01`, `host02`… theo cách Killercoda đặt tên. */
    host: z.string().min(1),
    /** Có thể là glob (`**`, hoặc dạng `app-star/star.json`) — xem docs upstream. */
    file: z.string().min(1),
    target: z.string().min(1),
    chmod: z.string().nullable(),
  })
  .strict();
export type ScenarioAsset = z.infer<typeof scenarioAssetSchema>;

/**
 * Phần CHUNG của mọi loại nội dung chạy được trên nền tảng (lesson / lab /
 * playground). Tồn tại vì P8 thêm hai loại nội dung nữa, và cách sai là chép
 * mười field này ra ba nơi: chúng sẽ lệch ở lần đầu tiên ai đó thêm một tier
 * hoặc một capability, và không có gì báo.
 *
 * ⛔ Đây KHÔNG phải "base class cho tương lai". Nó được tách ra đúng lúc có
 * người dùng thứ hai và thứ ba (`labSchema`, `playgroundSchema`), không sớm hơn.
 *
 * Cố ý là object THƯỜNG (không `.strict()`): mỗi schema cụ thể `.extend(...)`
 * rồi tự `.strict()` ở cuối, nên "từ chối field lạ" vẫn đúng ở mọi nhánh.
 */
export const contentBaseSchema = z.object({
  id: scenarioIdSchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  difficulty: z.enum(SCENARIO_DIFFICULTIES),
  estimatedMinutes: z.number().int().positive().nullable(),

  tier: z.enum(SANDBOX_TIER_NAMES),
  /**
   * Thứ sandbox CUNG CẤP, suy từ `backend.imageid` upstream.
   *
   * ⚠ Đây KHÔNG phải thứ bài học đòi — xem `requiresCapabilities`.
   */
  capabilities: z.array(z.enum(SCENARIO_CAPABILITIES)),
  /**
   * Thứ bài học THẬT SỰ ĐÒI. `null` = chưa khai ⇒ dùng `capabilities`.
   *
   * ⛔ ĐÂY KHÔNG PHẢI DERIVED FIELD, dù trông giống. `capabilities` trả lời
   * "image upstream cung cấp gì"; field này trả lời "bài học cần gì". P7-bis
   * (2026-09-04) chứng minh hai câu đó khác nhau và việc gộp chúng có giá:
   * `ckad-configmap-as-files` mang `multi-node` CHỈ vì imageid upstream của nó
   * là `kubernetes-kubeadm-2nodes`, trong khi `verify.sh` của bài dùng đúng MỘT
   * pod + MỘT ConfigMap. Hệ quả đo được: bài đó nhận profile `k8s-multinode`
   * (1536Mi) cho một việc cần 1Gi — tức mỗi phiên chiếm chỗ của 1.5 phiên, và
   * trần đồng thời tụt tương ứng.
   *
   * Loader ép nó là TẬP CON của `capabilities`: đòi thứ image không cung cấp là
   * một bài không chạy được, và chỗ để phát hiện điều đó là lúc nhập, không
   * phải giữa step 3 trong terminal của người học.
   *
   * `.default(null)` chứ không phải bắt buộc: "chưa khai" là trạng thái THƯỜNG
   * và đúng nghĩa của mọi nội dung có trước 2026-09-04. Bắt buộc khai sẽ ép mọi
   * sidecar và mọi hàng DB đã tồn tại phải nhắc lại một câu trả lời mặc định —
   * tức là bắt cả kho nội dung trả giá cho một field mà đúng MỘT bài cần.
   */
  requiresCapabilities: z.array(z.enum(SCENARIO_CAPABILITIES)).nullable().default(null),
  /** Nguyên văn `backend.imageid` upstream — giữ để truy nguyên, KHÔNG để chạy. */
  backendImageId: z.string().min(1),
  /** `interface.layout` upstream (`ide`). `null` = terminal thường. */
  interfaceLayout: z.string().nullable(),

  assets: z.array(scenarioAssetSchema),
  source: scenarioSourceSchema.nullable(),
});
export type ContentBase = z.infer<typeof contentBaseSchema>;

/**
 * Năng lực THẬT SỰ cần để chạy nội dung này.
 *
 * Là một HÀM, không phải một cột: `requiresCapabilities ?? capabilities` suy
 * được trọn vẹn từ hai field đã lưu, nên lưu thêm kết quả là dựng derived field
 * (`rules/code-conventions.md` § No Derived Fields). Mọi chỗ quyết định profile
 * hoặc cảnh báo năng lực PHẢI đi qua đây — hai chỗ tự `??` lấy là hai chỗ để
 * lệch nhau.
 */
export function effectiveCapabilities(
  content: Pick<ContentBase, 'capabilities' | 'requiresCapabilities'>,
): readonly ScenarioCapability[] {
  return content.requiresCapabilities ?? content.capabilities;
}

export const scenarioSchema = contentBaseSchema
  .extend({
    intro: scenarioPhaseSchema.nullable(),
    finish: scenarioPhaseSchema.nullable(),
    /**
     * >=1. Killercoda chấp nhận scenario KHÔNG có step nào (upstream
     * `ubuntu-simple` chỉ có `title` + `backend`) — với họ đó là một playground.
     * Với nền tảng học của ta thì một bài không có bước nào là một trang trắng,
     * nên loader từ chối nó ở biên nhập thay vì để nó hiện ra ở FE dưới dạng
     * "danh sách step rỗng". Playground THẬT là một loại nội dung riêng
     * (`playgroundSchema`), không phải một scenario rỗng.
     */
    steps: z.array(scenarioStepSchema).min(1),
    /**
     * Field upstream mà ta KHÔNG hiểu và đã cố ý bỏ qua, dạng đường dẫn chấm
     * (`details.intro.courseData`). Rỗng là trường hợp thường.
     *
     * Tồn tại vì "bỏ qua trong im lặng" là chế độ hỏng tệ nhất ở đây: một script
     * setup không chạy làm mọi step sau đó sai, và triệu chứng ("lệnh trong bài
     * không có tác dụng") không trỏ về một field JSON bị nuốt. Mỗi mục ở đây phải
     * được sidecar khai báo tường minh — xem `acknowledgedUnknownFields`.
     */
    ignoredUpstreamFields: z.array(z.string()),
  })
  .strict();
export type Scenario = z.infer<typeof scenarioSchema>;

/** Bản rút gọn cho trang danh sách `/lessons` (2.B/2.D) — không kèm nội dung step. */
export const scenarioSummarySchema = scenarioSchema
  .pick({
    id: true,
    title: true,
    description: true,
    difficulty: true,
    estimatedMinutes: true,
    tier: true,
    capabilities: true,
  })
  .extend({ stepCount: z.number().int().positive() })
  .strict();
export type ScenarioSummary = z.infer<typeof scenarioSummarySchema>;

export function toScenarioSummary(scenario: Scenario): ScenarioSummary {
  return {
    id: scenario.id,
    title: scenario.title,
    description: scenario.description,
    difficulty: scenario.difficulty,
    estimatedMinutes: scenario.estimatedMinutes,
    tier: scenario.tier,
    capabilities: scenario.capabilities,
    stepCount: scenario.steps.length,
  };
}
