import { createTRPCRouter, publicProcedure } from '../init';

/**
 * Router `auth` P0 chỉ có 1 procedure đọc — đăng ký/đăng nhập/OAuth/refresh đã có
 * route riêng (`/api/auth/*` của Better Auth, `/api/auth/refresh`) vì chúng cần
 * set cookie Set-Cookie trực tiếp trên Response, thứ tRPC fetch adapter không tiện
 * expose. Router này tồn tại để FE có một điểm type-safe kiểm "ai đang đăng nhập".
 */
export const authRouter = createTRPCRouter({
  session: publicProcedure.query(({ ctx }) => {
    return { user: ctx.user };
  }),
});
