import { TRPCError } from '@trpc/server';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { Database } from '../db/client';
import { adminAudit, type AdminAuditRow } from '../db/schema';
import { assertUuidCursor } from '../trpc/init';

/**
 * Ghi MỘT dòng vào `admin_audit` — SSOT của mọi lời gọi ghi audit (P13 C4).
 *
 * `detail` là `unknown`, không phải một type cụ thể theo `action`: hành động
 * quản trị khác nhau mang chi tiết khác nhau (`setRole` ghi `{ from, to }`,
 * `terminate` ghi `{ reason }`), và ép chúng vào MỘT union đóng ở tầng Drizzle
 * chỉ để rồi validate lại ở tầng đọc là công trùng — jsonb tự do, người đọc
 * (`admin.audit.list`) không giả định hình dạng.
 */
export async function writeAdminAudit(
  db: Database,
  entry: {
    readonly actorId: string;
    readonly action: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly detail?: Record<string, unknown> | undefined;
  },
): Promise<void> {
  await db.insert(adminAudit).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    detail: entry.detail ?? null,
  });
}

export interface AdminAuditView {
  readonly id: string;
  readonly actorId: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly detail: unknown;
  readonly occurredAt: string;
}

function toView(row: AdminAuditRow): AdminAuditView {
  return {
    id: row.id,
    actorId: row.actorId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    detail: row.detail,
    occurredAt: row.occurredAt.toISOString(),
  };
}

/**
 * Trang `admin.audit.list` — mới nhất trước, cursor keyset trên `(occurredAt, id)`,
 * CÙNG KHUÔN `labs.listAttempts` (tránh nhảy/lặp mục khi hai dòng trùng
 * mili-giây — `occurredAt` một mình không đủ để làm khoá thứ tự duy nhất).
 */
export async function listAdminAuditPage(
  db: Database,
  limit: number,
  cursor: string | undefined,
): Promise<{ items: readonly AdminAuditView[]; nextCursor: string | null }> {
  let cursorRow: { occurredAt: Date; id: string } | undefined;
  if (cursor !== undefined) {
    const rows = await db
      .select({ occurredAt: adminAudit.occurredAt, id: adminAudit.id })
      .from(adminAudit)
      // `admin_audit.id` là `uuid` — cùng bẫy 22P02 với `me.listProgress`.
      .where(eq(adminAudit.id, assertUuidCursor(cursor)))
      .limit(1);
    cursorRow = rows[0];
    if (cursorRow === undefined) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cursor không còn hợp lệ' });
    }
  }

  const rows = await db
    .select()
    .from(adminAudit)
    .where(
      cursorRow === undefined
        ? undefined
        : or(
            lt(adminAudit.occurredAt, cursorRow.occurredAt),
            and(eq(adminAudit.occurredAt, cursorRow.occurredAt), lt(adminAudit.id, cursorRow.id)),
          ),
    )
    .orderBy(desc(adminAudit.occurredAt), desc(adminAudit.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = page[page.length - 1];
  return {
    items: page.map(toView),
    nextCursor: hasMore && lastRow !== undefined ? lastRow.id : null,
  };
}
