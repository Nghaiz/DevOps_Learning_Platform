import { z } from 'zod';
import { scenarioIdSchema } from '@devops-platform/shared-types/scenario';
import { contentBackendRefSchema, contentInterfaceRefSchema } from './lab.ts';

/**
 * Schema của MỘT file `content/playgrounds/<id>.json` TRÊN ĐĨA — không phải
 * DTO `Playground` của `packages/shared-types/src/playground.ts`.
 *
 * Playground là file PHẲNG (không thư mục con, không file markdown/verify đi
 * kèm) — nó không có bài, nên không có gì để dẫn giải hay để chấm. `backend`/
 * `interface` dùng LẠI đúng hai schema `lab.ts` định nghĩa
 * (`contentBackendRefSchema`/`contentInterfaceRefSchema`): cùng một hình dạng
 * `index.json` upstream của Killercoda, một nguồn, không phải hai bản chép.
 *
 * SSOT của format + quyết định thiết kế: `docs/lab-format.md`.
 */
export const playgroundFileSchema = z
  .object({
    /**
     * BẮT BUỘC, và loader ép TRÙNG tên file (không phần mở rộng) — cùng lý do
     * `labFileSchema.id`/`scenarioSidecarSchema.id`: đây là định danh mà FE/BFF
     * dùng để mở phiên (`playgrounds.start`), không phải chỉ một nhãn hiển thị.
     */
    id: scenarioIdSchema,
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    backend: contentBackendRefSchema,
    interface: contentInterfaceRefSchema.optional(),
    ttlSeconds: z.number().int().min(300).max(7200),
  })
  .strict();
export type PlaygroundFile = z.infer<typeof playgroundFileSchema>;
