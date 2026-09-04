import { z } from 'zod';
import {
  SCENARIO_CAPABILITIES,
  SCENARIO_DIFFICULTIES,
  scenarioIdSchema,
  scenarioSourceSchema,
} from '@devops-platform/shared-types/scenario';

/**
 * `dlp.json` — sidecar do CHÍNH NỀN TẢNG NÀY sở hữu, nằm cạnh `index.json` trong
 * mỗi thư mục scenario.
 *
 * Vì sao cần một file thứ hai thay vì nhét thêm field vào `index.json`:
 *
 * 1. **File upstream phải giữ NGUYÊN VĂN.** Đó là điều kiện để
 *    `scripts/vendor-scenarios.mjs --check` so được byte-với-byte với commit đã
 *    ghim, và cũng là điều kiện tối thiểu của việc tuân thủ license (MIT/Apache
 *    đòi giữ nguyên bản quyền, không đòi ta phải sửa file của họ).
 * 2. **Có thứ upstream KHÔNG mang.** `difficulty` không phải field của Killercoda
 *    (đã kiểm), và xuất xứ/license thì đương nhiên chỉ bên nhập mới biết.
 *
 * Sidecar KHÔNG khai `tier`/`capabilities`: chúng suy trọn vẹn từ
 * `backend.imageid` qua `BACKEND_IMAGE_MAPPING` — xem `backend.ts`.
 *
 * Sidecar CÓ khai `requiresCapabilities`, và điều đó không mâu thuẫn với câu
 * trên: `capabilities` là thứ image CUNG CẤP (suy được), `requiresCapabilities`
 * là thứ bài ĐÒI (không suy được từ bất cứ đâu — chỉ người soạn biết).
 */
export const scenarioSidecarSchema = z
  .object({
    /**
     * Định danh bền, dùng làm `progress.lesson_id`. Loader ép nó TRÙNG tên thư
     * mục — hai nguồn, nhưng đây là ràng buộc chứ không phải bản sao: nó tồn tại
     * để đổi tên thư mục không thể lặng lẽ làm mồ côi tiến độ của người học.
     */
    id: scenarioIdSchema,
    difficulty: z.enum(SCENARIO_DIFFICULTIES),
    /** Ước lượng của ta, không phải của upstream. `null` = chưa ước lượng. */
    estimatedMinutes: z.number().int().positive().nullable(),
    /** `null` = bài first-party (soạn tại repo này), không có upstream để ghim. */
    source: scenarioSourceSchema.nullable(),
    /**
     * Field lạ trong `index.json` mà ta ĐÃ xem xét và cố ý bỏ qua, dạng đường
     * dẫn chấm (`details.intro.courseData`). Mặc định rỗng.
     */
    acknowledgedUnknownFields: z.array(z.string().min(1)).default([]),
    /**
     * Năng lực bài này THẬT SỰ đòi. Bỏ trống (mặc định `null`) = "giống thứ
     * image cung cấp", tức hành vi trước 2026-09-04 — nên mọi sidecar cũ giữ
     * nguyên nghĩa, không phải sửa file nào.
     *
     * Khai nó khi imageid upstream cung cấp NHIỀU HƠN thứ bài cần, để bài không
     * phải trả tiền tài nguyên cho một năng lực nó không dùng. Loader ép TẬP
     * CON của `capabilities`.
     */
    requiresCapabilities: z.array(z.enum(SCENARIO_CAPABILITIES)).nullable().default(null),
    /** Ghi chú cho người đọc — bắt buộc khi có field bỏ qua (loader kiểm). */
    notes: z.string().nullable().default(null),
  })
  .strict();

export type ScenarioSidecar = z.infer<typeof scenarioSidecarSchema>;
