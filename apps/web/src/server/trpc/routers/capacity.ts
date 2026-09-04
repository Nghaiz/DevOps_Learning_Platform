import { z } from 'zod';
import { fetchCapacity } from '../../capacity/get-capacity';
import { createTRPCRouter, protectedProcedure } from '../init';

/**
 * `capacity.*` — D5/C3 (phase-13). Sức chứa cluster, cho MỌI user đã đăng nhập
 * (không cần `adminProcedure` — cả `SessionControls` của C5 lẫn trang chủ B
 * cần "còn N chỗ" TRƯỚC khi người học bấm Bắt đầu).
 */
export const capacityRouter = createTRPCRouter({
  get: protectedProcedure.input(z.object({}).strict()).query(async ({ ctx }) => {
    return fetchCapacity(ctx);
  }),
});
