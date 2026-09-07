/**
 * Bộ công cụ bật thêm trong sandbox theo TỪNG bài (`toolset`).
 *
 * SSOT của danh mục: hợp đồng `plans/devops-learning-platform/contracts/killercoda-workspace.md`
 * §C4. Lane B sở hữu ĐỊNH NGHĨA ở đây; bản cài đặt trong image
 * (`dlp-tools enable <tool>...`) do Lane A cung cấp.
 *
 * ## Vì sao là danh mục ĐÓNG chứ không phải chuỗi tự do
 *
 * Mỗi tên ở đây tương ứng một gói ĐÃ nướng sẵn vào image sandbox. Sandbox
 * KHÔNG có internet (xem `docs/` + memory "sandbox không có internet lẫn image
 * nạp sẵn"), nên một tên ngoài danh mục không phải "công cụ chưa cài" mà là
 * "công cụ không có đường nào cài được" — `dlp-tools enable` sẽ hỏng, và nó
 * hỏng lúc SETUP PHIÊN, tức trước mặt người học.
 *
 * ## Vì sao LỌC BỎ chứ không NÉM
 *
 * Khác `toAction` của `content-blocks.ts` (verb lạ ⇒ ném), ở đây một tên lạ
 * KHÔNG được phép làm sập cả catalog. Ca thật đã lường trước: một bài cũ khai
 * một công cụ mà sau đó ta GỠ khỏi danh mục. Ném ở đây biến việc dọn danh mục
 * thành một sự cố "mọi bài học biến mất"; lọc bỏ kèm cảnh báo giữ bài chạy
 * được (thiếu đúng một công cụ phụ) và vẫn để lại dấu vết đọc được.
 *
 * Cân nhắc ngược lại đã cân: một nút bấm sai chức năng (`{{open}}`) đứng giữa
 * bài là thứ người học TƯƠNG TÁC, nên nó đáng bị chặn ở biên nhập. Một công cụ
 * không bật được thì chỉ là một tiện ích vắng mặt.
 *
 * ## ĐƯỜNG ĐI TỚI DTO (đã nối) — đọc trước khi sửa
 *
 * Chuỗi đầy đủ, từ nguồn tới pod:
 *
 * 1. BIÊN ĐỌC — `killercodaIndexSchema` / `labFileSchema` / `playgroundFileSchema`
 *    nhận khoá `toolset`; `ContentItemRow.toolset` mang cột DB (đã parse).
 * 2. DTO — `contentBaseSchema.toolset` ở `shared-types` (`labSchema` kế thừa,
 *    `playgroundSchema` lấy qua `.pick()`).
 * 3. BIÊN DỰNG DTO — `loader.ts` / `lab-loader.ts` / `playground-loader.ts` và ba
 *    `candidate` của `db-source.ts` đều gọi `sanitizeToolset` TẠI CHỖ.
 * 4. `lessons.runSetup` → `dlp-tools enable <tool>...` trong pod.
 *
 * ⚠ Vì sao lọc ở bước 3 chứ không tin bước 1: `sanitizeToolset` thuần và
 * idempotent, nên một lượt gọi thừa không tốn gì, còn một biên THIẾU lượt gọi thì
 * đẩy tên lạ thẳng tới `dlp-tools enable` và hỏng lúc setup phiên, trước mặt
 * người học. Biên tự bảo đảm bất biến của mình rẻ hơn nhiều so với việc mỗi biên
 * mới phải nhớ ai đã lọc hộ nó.
 *
 * ⚠ `contentBaseSchema.toolset` cố ý là `z.array(z.string())`, KHÔNG `z.enum(...)`:
 * ở `db-source.ts` một giá trị bị từ chối làm TRƯỢT CẢ HÀNG, tức bài biến mất
 * khỏi `/lessons` trong im lặng chỉ vì một tiện ích phụ đã bị gỡ khỏi danh mục.
 *
 * Vế DB thì KHÔNG còn thiếu: cột `content_items.toolset text not null default '[]'`
 * (`apps/web/src/server/db/schema.ts`) và `toItemRow`/`toolsetOf`
 * (`.../content/repository.ts`) đã có, và `ContentItemRow.toolset` ở
 * `db-source.ts` đã khớp hình dạng ĐÃ PARSE mà chúng cung cấp.
 *
 * ## NHÀ CỦA `SANDBOX_TOOLS`: shared-types (lead đã chốt) — đây chỉ re-export
 *
 * Danh mục ở dưới cũng được `apps/web` dùng, nhưng ba call-site đó import nó từ
 * `@devops-platform/shared-types/scenario` (`tools-enable.ts`,
 * `draft-from-preview.ts`, `draft-meta-fields.tsx`) — cạnh `SANDBOX_TIER_NAMES`
 * và `SCENARIO_CAPABILITIES`, tức nhà quen của mọi từ vựng đóng trong repo này.
 *
 * Hướng phụ thuộc nói cùng một điều: `packages/scenario` import shared-types
 * chứ không ngược lại, nên nếu `contentBaseSchema.toolset` có ngày muốn siết
 * thành `z.enum(SANDBOX_TOOLS)` thì hằng số BẮT BUỘC phải nằm ở shared-types.
 *
 * Nên hằng số đã CHUYỂN sang `shared-types/src/scenario.ts`, và file này chỉ
 * re-export. ⛔ KHÔNG khai một bản thứ hai ở đây: hai danh mục cho cùng một thứ
 * sẽ lệch nhau ở lần thêm công cụ đầu tiên, và cái lệch đó hiện ra dưới dạng "ô
 * chọn trên UI soạn bài có tool mà sandbox không bật được".
 */

// Lead đã chốt nhà: `SANDBOX_TOOLS` sống ở shared-types (xem docstring tại đó).
// Ở đây RE-EXPORT để đường import quen của package này không đổi — một định
// nghĩa duy nhất, hai lối vào.
// Phải import RỒI export, không dùng dạng `export { X } from "..."`: dạng đó
// không tạo binding cục bộ, nên chính file này mất tên nó đang dùng ở dưới
// (`KNOWN`, `isSandboxTool`, thông báo lỗi). Vẫn đúng MỘT định nghĩa.
import { SANDBOX_TOOLS, type SandboxTool } from '@devops-platform/shared-types/scenario';

export { SANDBOX_TOOLS, type SandboxTool };

const KNOWN: ReadonlySet<string> = new Set<string>(SANDBOX_TOOLS);

export function isSandboxTool(value: string): value is SandboxTool {
  return KNOWN.has(value);
}

export interface ToolsetParseResult {
  /** Đã lọc theo `SANDBOX_TOOLS`, giữ nguyên THỨ TỰ khai trong nội dung. */
  readonly toolset: readonly SandboxTool[];
  /** Rỗng = không có gì bất thường. Mỗi mục là một câu đọc được cho log/CI. */
  readonly warnings: readonly string[];
}

/**
 * Lọc một mảng tên công cụ về đúng danh mục.
 *
 * `undefined`/`null` (khoá vắng mặt) ⇒ `[]` KHÔNG kèm cảnh báo: không khai gì
 * là trạng thái THƯỜNG của gần như mọi bài, và cảnh báo cho trạng thái thường
 * là cách nhanh nhất làm người ta ngừng đọc cảnh báo.
 *
 * ⚠ KHÔNG khử trùng lặp và KHÔNG sắp xếp lại: `dlp-tools enable btop btop` vô
 * hại, còn một hàm lặng lẽ đổi nội dung người soạn viết là thứ khó truy hơn
 * nhiều so với một dòng thừa.
 */
export function sanitizeToolset(raw: readonly unknown[] | undefined | null): ToolsetParseResult {
  if (raw === undefined || raw === null) {
    return { toolset: [], warnings: [] };
  }

  const toolset: SandboxTool[] = [];
  const warnings: string[] = [];
  for (const [i, entry] of raw.entries()) {
    if (typeof entry !== 'string') {
      warnings.push(
        `toolset[${i}] không phải chuỗi (${typeof entry}) — đã bỏ qua. ` +
          `Chỉ nhận: ${SANDBOX_TOOLS.join(', ')}.`,
      );
      continue;
    }
    if (!isSandboxTool(entry)) {
      warnings.push(
        `toolset[${i}]="${entry}" không có trong danh mục sandbox — đã bỏ qua. ` +
          `Chỉ nhận: ${SANDBOX_TOOLS.join(', ')}.`,
      );
      continue;
    }
    toolset.push(entry);
  }
  return { toolset, warnings };
}

/**
 * Đọc cột DB `content_items.toolset` — kiểu `text`, chứa **chuỗi JSON của một
 * mảng**, mặc định `'[]'` (§C4).
 *
 * ⚠ Vì sao không ném khi JSON hỏng: cùng kỷ luật `dbContentSource` đã chọn cho
 * cả hàng nội dung ("hàng hỏng bị BỎ QUA kèm WARN, không ném") — một ô dữ liệu
 * xấu không được phép thành sự cố toàn nền tảng. Nhưng khác "vắng mặt", một
 * chuỗi hỏng LUÔN kèm cảnh báo: nó nghĩa là có ai đó đã ghi vào đó một thứ sai,
 * và đó là tin cần đọc được.
 */
export function parseToolsetColumn(raw: string | null | undefined): ToolsetParseResult {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return { toolset: [], warnings: [] };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (error) {
    return {
      toolset: [],
      warnings: [
        `cột toolset không phải JSON hợp lệ (${(error as Error).message}) — coi như rỗng.`,
      ],
    };
  }

  if (!Array.isArray(decoded)) {
    return {
      toolset: [],
      warnings: [`cột toolset phải là mảng JSON, nhận được ${typeof decoded} — coi như rỗng.`],
    };
  }
  return sanitizeToolset(decoded);
}
