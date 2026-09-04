import { z } from 'zod';
import { scenarioIdSchema, scenarioSourceSchema, SCENARIO_DIFFICULTIES } from '@devops-platform/shared-types/scenario';
import { labTaskIdSchema } from '@devops-platform/shared-types/lab';

/**
 * Schema của `lab.json` TRÊN ĐĨA — không phải DTO `Lab` của
 * `packages/shared-types/src/lab.ts`.
 *
 * Khác scenario (tách `index.json` upstream + `dlp.json` sidecar do ta viết) —
 * lab KHÔNG có upstream, nên chỉ có MỘT file. Nó gộp đúng những gì `index.json`
 * và `dlp.json` gộp lại: `backend`/`interface` (định tuyến sandbox, kiểu
 * `index.json`) cộng `difficulty`/`estimatedMinutes`/`source` (siêu dữ liệu do ta
 * khai, kiểu `dlp.json`).
 *
 * SSOT của format + quyết định thiết kế: `docs/lab-format.md`.
 */

/** `{ "imageid": "ubuntu" }` — cùng hình dạng `backend` của `index.json` upstream. */
export const contentBackendRefSchema = z
  .object({
    imageid: z.string().min(1),
  })
  .strict();
export type ContentBackendRef = z.infer<typeof contentBackendRefSchema>;

/** `{ "layout": "ide" }` — cùng hình dạng `interface` của `index.json` upstream. */
export const contentInterfaceRefSchema = z
  .object({
    layout: z.string().min(1),
  })
  .strict();
export type ContentInterfaceRef = z.infer<typeof contentInterfaceRefSchema>;

/**
 * Một task trong file. CHỈ ba field editorial — KHÔNG có `markdown`/`verify`:
 * nội dung nằm ở `task-<id>.md` / `task-<id>/verify.sh`, suy từ `id` theo quy
 * ước tên file (`docs/lab-format.md` §1), không phải đường dẫn khai tường minh
 * như `index.json` của scenario. Ít một field khai báo nghĩa là ít một chỗ hai
 * nguồn có thể lệch nhau (id trong `tasks[]` và tên file vật lý).
 *
 * `weight`/`hint` là OPTIONAL ở đây — loader áp default (`weight` → 1, `hint` →
 * `null`). DTO (`labTaskSchema`) đòi cả hai là field BẮT BUỘC: một default ngầm
 * ở tầng DTO sẽ làm mọi task trông nặng như nhau mà không ai biết vì sao, đúng
 * lý do `difficulty` của scenario không có default (`docs/scenario-format.md`
 * §2.2).
 */
export const labTaskFileSchema = z
  .object({
    id: labTaskIdSchema,
    title: z.string().min(1),
    weight: z.number().int().positive().optional(),
    hint: z.string().min(1).optional(),
  })
  .strict();
export type LabTaskFile = z.infer<typeof labTaskFileSchema>;

/**
 * Đường dẫn (không phải nội dung) tới hai script setup — cùng vai trò
 * `intro.foreground`/`intro.background` của scenario, nhưng lab chỉ có ĐÚNG MỘT
 * lượt setup (không phải một lượt cho mỗi step) — xem lý do ở `labSchema.setup`
 * trong `packages/shared-types/src/lab.ts`.
 */
export const labSetupFileSchema = z
  .object({
    foreground: z.string().min(1).optional(),
    background: z.string().min(1).optional(),
  })
  .strict();
export type LabSetupFile = z.infer<typeof labSetupFileSchema>;

/**
 * `lab.json`.
 *
 * `id` BẮT BUỘC và loader ép nó TRÙNG tên thư mục — cùng lý do
 * `scenarioSidecarSchema.id` bị ép trùng thư mục scenario: `id` đi thẳng vào
 * `lab_attempts.lab_id`, và đổi tên thư mục mà không có ràng buộc này sẽ lặng lẽ
 * làm mồ côi mọi lần thử đã lưu.
 *
 * `difficulty`/`estimatedMinutes`/`source` là field BẮT BUỘC, không default —
 * cùng lý do `dlp.json` của scenario không cho `difficulty` một default ngầm.
 *
 * ⛔ KHÔNG có field `assets`: chưa lab first-party nào trong repo này cần đẩy
 * file ngoài `content/labs/<id>` vào sandbox (khác `dlp-docker-basics`, cần
 * `app.py`). Thêm field mà không có ai dùng là lời hứa suông — DTO `Lab.assets`
 * luôn được loader gán `[]`. Ngày một lab thật sự cần asset, thêm field này vào
 * ĐÂY (mirror `killercodaDetailsSchema.assets`) chứ không phải lúc này.
 */
export const labFileSchema = z
  .object({
    id: scenarioIdSchema,
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    difficulty: z.enum(SCENARIO_DIFFICULTIES),
    estimatedMinutes: z.number().int().positive().nullable(),
    source: scenarioSourceSchema.nullable(),
    backend: contentBackendRefSchema,
    interface: contentInterfaceRefSchema.optional(),
    tasks: z.array(labTaskFileSchema).min(1),
    setup: labSetupFileSchema.optional(),
    /** Optional — loader áp default 100 (mốc đạt = 100%, khắt khe nhất). */
    passThresholdPercent: z.number().int().min(1).max(100).optional(),
    /** Optional — loader áp default `false` (TẮT, xem `labSchema.leaderboard`). */
    leaderboard: z.boolean().optional(),
  })
  .strict();
export type LabFile = z.infer<typeof labFileSchema>;
