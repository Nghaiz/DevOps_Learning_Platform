import { z } from 'zod';

import { contentBaseSchema } from './scenario.ts';

/**
 * DTO của một PLAYGROUND (P8 8.E) — môi trường KHÔNG có bài.
 *
 * Đây chính là thứ Killercoda gọi là scenario không có `details` — và loader
 * của ta **cố ý từ chối** hình dạng đó (`docs/scenario-format.md` §1.1), vì một
 * bài học không có bước nào là một trang trắng.
 *
 * Nên playground là một LOẠI NỘI DUNG RIÊNG, không phải một lesson rỗng hay một
 * lab không task. Cách sai là nới `steps.min(1)` thành `min(0)`: nó mở lại đúng
 * cái cửa mà §1.1 đóng, và từ đó một bài học hỏng (mất `details` khi import) sẽ
 * lặng lẽ hiện ra như một playground thay vì bị từ chối.
 *
 * ⛔ KHÔNG có `difficulty`/`estimatedMinutes`/`assets`/`source`: không có bài
 * thì không có độ khó, không có thời lượng, và không có gì để dẫn nguồn.
 */
export const playgroundSchema = contentBaseSchema
  .pick({
    id: true,
    title: true,
    description: true,
    tier: true,
    capabilities: true,
    backendImageId: true,
    interfaceLayout: true,
    toolset: true,
  })
  .extend({
    /**
     * TTL RIÊNG, ngắn hơn lesson/lab, vì playground không có tiến độ để mất.
     *
     * Trần trên 2h khớp `HARD_CAP` của orchestrator (D11) — một TTL vượt trần đó
     * là một lời hứa mà hạ tầng sẽ phá trong im lặng: session bị reap giữa chừng
     * và người học chỉ thấy terminal chết.
     *
     * AC 8.E đòi con số này **hiện trên UI trước khi người dùng bắt đầu**, nên
     * nó là dữ liệu của nội dung chứ không phải hằng số chôn trong server.
     */
    ttlSeconds: z.number().int().min(300).max(7200),
  })
  .strict();
export type Playground = z.infer<typeof playgroundSchema>;

/** Danh sách `/playgrounds` dùng đúng hình dạng đầy đủ — nó vốn đã bé. */
export const playgroundSummarySchema = playgroundSchema;
export type PlaygroundSummary = Playground;
