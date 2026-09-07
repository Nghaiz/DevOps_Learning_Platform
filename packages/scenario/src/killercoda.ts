import { z } from 'zod';

import { sanitizeToolset } from './toolset.ts';

/**
 * Schema của `index.json` UPSTREAM (Katacoda/Killercoda) — không phải DTO của ta.
 *
 * Nguồn: trang docs Killercoda creator + kho `killercoda/scenario-examples`, đọc
 * 2026-08-13. Chi tiết từng field + bằng chứng: `docs/scenario-format.md`.
 *
 * ⛔ MỌI object đều `.strict()` (luật 3). Đây không phải sự cẩn thận thừa: một
 * field lạ trong `index.json` gần như luôn là một script setup hoặc một bước
 * verify mà ta sẽ KHÔNG chạy, và bỏ qua nó trong im lặng biến "bài học hỏng" thành
 * một triệu chứng không có nguyên nhân đọc được. Trường hợp thật gặp ngay ở
 * scenario đầu tiên vendor về: `details.intro.courseData` — di sản Katacoda,
 * KHÔNG có trong docs Killercoda. Đường thoát duy nhất là sidecar khai tường minh
 * qua `acknowledgedUnknownFields`, xem `parseKillercodaIndex`.
 */

const killercodaPhaseSchema = z
  .object({
    /** Killercoda cho phép vắng (upstream `use-images` có step không title). */
    title: z.string().optional(),
    /**
     * Đường dẫn TƯƠNG ĐỐI tới file markdown, so với thư mục scenario. Bắt buộc:
     * một phase không có nội dung là một trang trắng trong bài học.
     */
    text: z.string().min(1),
    /** Script chạy HIỆN trong terminal người học nhìn thấy. */
    foreground: z.string().min(1).optional(),
    /** Script chạy ẨN. */
    background: z.string().min(1).optional(),
    /** Script chấm. Pass khi exit code = 0 (docs Killercoda, § Verification Scripts). */
    verify: z.string().min(1).optional(),
  })
  .strict();

const killercodaAssetSchema = z
  .object({
    /** Có thể là glob (`*`, `**`, `app-star/star.json`) — xem upstream `upload-assets`. */
    file: z.string().min(1),
    target: z.string().min(1),
    chmod: z.string().min(1).optional(),
  })
  .strict();

const killercodaDetailsSchema = z
  .object({
    intro: killercodaPhaseSchema.optional(),
    steps: z.array(killercodaPhaseSchema).optional(),
    finish: killercodaPhaseSchema.optional(),
    /** Khoá là tên host (`host01`, `host02`…). */
    assets: z.record(z.string().min(1), z.array(killercodaAssetSchema)).optional(),
  })
  .strict();

export const killercodaIndexSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    /**
     * Vắng hẳn là HỢP LỆ với Killercoda (upstream `ubuntu-simple` chỉ có `title`
     * + `backend` — với họ đó là một playground). Loader của ta từ chối nó sau
     * đó vì một bài học không có step nào thì không phải bài học; phép từ chối
     * nằm ở loader chứ không ở đây để thông báo lỗi nói đúng *lý do của ta*.
     */
    details: killercodaDetailsSchema.optional(),
    backend: z
      .object({
        imageid: z.string().min(1),
      })
      .strict(),
    /** `{"layout":"ide"}` chọn Theia IDE thay cho terminal thường. */
    interface: z
      .object({
        layout: z.string().min(1),
      })
      .strict()
      .optional(),
    /**
     * MỞ RỘNG CỦA TA (hợp đồng §C4) — công cụ bật thêm trong sandbox cho bài
     * này. KHÔNG có trong `index.json` upstream của Killercoda.
     *
     * `z.string()` chứ không phải `z.enum(SANDBOX_TOOLS)`, và đó là một khẳng
     * định: enum ở đây sẽ NÉM khi gặp một tên đã bị gỡ khỏi danh mục, tức biến
     * việc dọn danh mục thành sự cố "cả catalog không parse được". Phép thu hẹp
     * về danh mục nằm ở `sanitizeToolset` — lọc bỏ kèm cảnh báo (xem docstring
     * của nó để biết vì sao ở đây lọc còn `toAction` thì ném).
     *
     * `.default([])` cho "vắng mặt ⇒ `[]`" của §C4 — mảng rỗng, KHÔNG null.
     */
    toolset: z.array(z.string()).default([]),
  })
  .strict();

export type KillercodaIndex = z.infer<typeof killercodaIndexSchema>;
export type KillercodaPhase = z.infer<typeof killercodaPhaseSchema>;

export interface KillercodaParseResult {
  index: KillercodaIndex;
  /** Đường dẫn chấm của field lạ đã được sidecar khai và ta cố ý bỏ qua. */
  ignoredFields: string[];
  /**
   * Chuyện KHÔNG làm hỏng bài nhưng cần đọc được — hiện chỉ có tên công cụ
   * ngoài danh mục bị lọc bỏ. Rỗng là trường hợp thường.
   *
   * Là GIÁ TRỊ TRẢ VỀ chứ không phải `console.warn` chôn trong hàm: hàm này
   * thuần và loader/CI phải khẳng định được nội dung cảnh báo trong test —
   * cùng lý do `dbContentSource` nhận `ContentSourceLogger` qua field.
   */
  warnings: string[];
}

/** Lỗi thuần về FORMAT — loader bọc lại thành `ScenarioError` kèm thư mục. */
export class KillercodaFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KillercodaFormatError';
  }
}

function dottedPath(path: readonly PropertyKey[], key: string): string {
  return [...path.map(String), key].join('.');
}

/** Xoá một field theo đường dẫn chấm. Trả `false` khi đường dẫn không tồn tại. */
function deleteAtPath(root: unknown, path: string): boolean {
  const segments = path.split('.');
  const last = segments.pop();
  if (last === undefined) {
    return false;
  }
  let cursor: unknown = root;
  for (const segment of segments) {
    if (typeof cursor !== 'object' || cursor === null) {
      return false;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  if (typeof cursor !== 'object' || cursor === null) {
    return false;
  }
  const holder = cursor as Record<string, unknown>;
  if (!Object.hasOwn(holder, last)) {
    return false;
  }
  delete holder[last];
  return true;
}

function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const where = issue.path.length === 0 ? '(gốc)' : issue.path.map(String).join('.');
      return `  - ${where}: ${issue.message}`;
    })
    .join('\n');
}

/**
 * Parse `index.json` upstream.
 *
 * @param raw JSON đã `JSON.parse`.
 * @param acknowledgedUnknownFields đường dẫn chấm của field lạ mà sidecar
 *   `dlp.json` đã khai là "biết và cố ý bỏ qua". Mọi field lạ KHÔNG nằm trong
 *   danh sách này đều là lỗi.
 *
 * Danh sách khai THỪA (khai một field mà upstream không còn) cũng là lỗi: một
 * lời khai không còn đúng là drift, và drift trong một file bảo "tôi đã xem xét
 * cái này rồi" thì tệ hơn không có file nào.
 */
export function parseKillercodaIndex(
  raw: unknown,
  acknowledgedUnknownFields: readonly string[] = [],
): KillercodaParseResult {
  const acknowledged = new Set(acknowledgedUnknownFields);
  const first = killercodaIndexSchema.safeParse(raw);

  if (first.success) {
    if (acknowledged.size > 0) {
      throw new KillercodaFormatError(
        `dlp.json khai acknowledgedUnknownFields = [${[...acknowledged].join(', ')}] ` +
          `nhưng index.json không còn field lạ nào — upstream đã dọn, hãy xoá lời khai đã cũ.`,
      );
    }
    return { ...withSanitizedToolset(first.data), ignoredFields: [] };
  }

  const unknownPaths: string[] = [];
  const otherIssues: z.core.$ZodIssue[] = [];
  for (const issue of first.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        unknownPaths.push(dottedPath(issue.path, key));
      }
    } else {
      otherIssues.push(issue);
    }
  }

  if (otherIssues.length > 0) {
    throw new KillercodaFormatError(`index.json sai cấu trúc:\n${formatIssues(otherIssues)}`);
  }

  const unacknowledged = unknownPaths.filter((path) => !acknowledged.has(path));
  if (unacknowledged.length > 0) {
    throw new KillercodaFormatError(
      `index.json có field lạ chưa được khai: ${unacknowledged.join(', ')}.\n` +
        `Nếu ĐÃ xem xét và cố ý bỏ qua, thêm chúng vào "acknowledgedUnknownFields" trong dlp.json ` +
        `kèm lý do ở "notes" — parser sẽ ghi lại chúng ở Scenario.ignoredUpstreamFields thay vì nuốt im lặng.`,
    );
  }

  const stale = [...acknowledged].filter((path) => !unknownPaths.includes(path));
  if (stale.length > 0) {
    throw new KillercodaFormatError(
      `dlp.json khai acknowledgedUnknownFields không còn tồn tại trong index.json: ${stale.join(', ')} — xoá lời khai đã cũ.`,
    );
  }

  // Clone rồi xoá: `raw` là của caller, và một parser làm biến đổi input của
  // người gọi là loại tác dụng phụ chỉ lộ ra khi ai đó parse lại cùng object.
  const stripped: unknown = structuredClone(raw);
  for (const path of unknownPaths) {
    deleteAtPath(stripped, path);
  }

  const second = killercodaIndexSchema.safeParse(stripped);
  if (!second.success) {
    throw new KillercodaFormatError(
      `index.json vẫn sai sau khi bỏ field đã khai:\n${formatIssues(second.error.issues)}`,
    );
  }

  return { ...withSanitizedToolset(second.data), ignoredFields: unknownPaths.sort() };
}

/**
 * Thu hẹp `toolset` về danh mục sandbox, giữ nguyên phần còn lại của index.
 *
 * Trả về một object MỚI thay vì gán đè `index.toolset`: `second.data` là dữ
 * liệu zod vừa dựng, nhưng thói quen "parser sửa tại chỗ" là đúng thứ đoạn
 * `structuredClone` phía trên đã phải dựng lên để tránh.
 */
function withSanitizedToolset(index: KillercodaIndex): {
  index: KillercodaIndex;
  warnings: string[];
} {
  const { toolset, warnings } = sanitizeToolset(index.toolset);
  return { index: { ...index, toolset: [...toolset] }, warnings: [...warnings] };
}
