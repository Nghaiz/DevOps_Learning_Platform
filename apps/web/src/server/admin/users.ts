import { TRPCError } from '@trpc/server';
import { and, asc, eq, gt, ilike, or } from 'drizzle-orm';
import type { Database } from '../db/client';
import { users, type User } from '../db/schema';

export interface AdminUserView {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: User['role'];
  readonly createdAt: string;
}

function toView(row: User): AdminUserView {
  return { id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.createdAt.toISOString() };
}

/**
 * `admin.users.list` — keyset trên `id` (cùng khuôn D9: `id > cursor`, sắp
 * tăng dần), `q` là `ILIKE` trên `email` HOẶC `name` (khớp một phần, không
 * phân biệt hoa/thường — đúng thứ ô tìm kiếm quản trị cần, không phải một
 * full-text search).
 *
 * Cursor không tồn tại: KHÔNG ném (khác `content_items`/`admin_audit`) — bảng
 * `users` không có khái niệm "trạng thái tạm thời sẽ biến mất giữa hai lượt
 * gọi" mà cursor không hợp lệ cần cảnh báo riêng; `id > cursor` (keyset thuần)
 * đã đủ đúng cho một id không còn tồn tại (tài khoản vừa bị xoá).
 */
export async function listAdminUsersPage(
  db: Database,
  options: { readonly limit: number; readonly cursor?: string | undefined; readonly q?: string | undefined },
): Promise<{ items: readonly AdminUserView[]; nextCursor: string | null }> {
  const conditions = [];
  if (options.cursor !== undefined) {
    conditions.push(gt(users.id, options.cursor));
  }
  if (options.q !== undefined && options.q.length > 0) {
    const pattern = `%${options.q}%`;
    conditions.push(or(ilike(users.email, pattern), ilike(users.name, pattern)));
  }

  const rows = await db
    .select()
    .from(users)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(users.id))
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  const last = page[page.length - 1];
  return { items: page.map(toView), nextCursor: hasMore && last !== undefined ? last.id : null };
}

/**
 * Đổi vai trò — CẤM tự hạ vai admin của chính mình (P13 C4).
 *
 * Ràng buộc kiểm ở ĐÂY, không phải ở router: hai chỗ gọi hàm này (nếu về sau
 * có thêm) không được phép quên luật — một admin cuối cùng tự hạ vai mình
 * xuống `user` sẽ khoá luôn trang `/admin` mà không còn ai mở lại được (không
 * có đường "cấp lại quyền admin" nào khác ngoài SQL tay).
 */
export async function setUserRole(
  db: Database,
  actor: { readonly id: string },
  targetUserId: string,
  role: User['role'],
): Promise<AdminUserView> {
  if (actor.id === targetUserId && role !== 'admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Không thể tự hạ quyền admin của chính mình',
    });
  }

  const [before] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
  if (before === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có người dùng đó' });
  }

  const [updated] = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, targetUserId))
    .returning();
  if (updated === undefined) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Không cập nhật được vai trò' });
  }
  return toView(updated);
}
