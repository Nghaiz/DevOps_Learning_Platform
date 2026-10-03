import { and, eq, inArray } from 'drizzle-orm';

import { contentSourceFor } from '../content/source';
import type { Database } from '../db/client';
import { labAttempts, sessionOrigins } from '../db/schema';

/**
 * Phiên sandbox ↔ nội dung đã mở nó — cho `me.activeSessions` ("Làm tiếp").
 *
 * Hai nguồn, mỗi loại nội dung đúng một nguồn:
 *
 * | Loại | Nguồn |
 * |---|---|
 * | `lab` | `lab_attempts.session_id` — có từ P8, là sự thật của lab |
 * | `lesson`, `playground` | `session_origins` — ghi lúc mở phiên (`recordSessionOrigin`) |
 *
 * ⛔ Mọi truy vấn lọc theo `userId` của NGƯỜI GỌI, không chỉ theo `session_id`.
 * Danh sách phiên tới từ orchestrator đã lọc theo người dùng, nhưng phép tra ở
 * đây không được dựa vào điều đó: một id phiên của người khác lọt vào đây phải ra
 * `null`, không phải tên bài người đó đang học.
 */

export type SessionContentKind = 'lesson' | 'lab' | 'playground';

export interface SessionContent {
  readonly kind: SessionContentKind;
  readonly id: string;
  readonly title: string;
}

/**
 * Ghi "phiên này mở từ bài học / sân chơi này". Gọi NGAY sau khi orchestrator
 * trả phiên.
 *
 * `onConflictDoNothing`: mở lại với cùng `idempotencyKey` trả về CÙNG phiên, và
 * lượt ghi thứ hai phải là một no-op chứ không phải một lỗi khoá chính.
 *
 * ⚠ KHÔNG nuốt lỗi. Lỗi ghi ở đây ném lên và lượt mở phiên báo lỗi; người dùng bấm
 * lại thì cùng `idempotencyKey` trả lại đúng phiên đó (không tạo pod thứ hai) và
 * lượt ghi chạy lại. Nuốt lỗi thì phiên chạy bình thường mà "Làm tiếp" mãi mãi
 * không dẫn được về đâu, và không ai biết vì sao.
 */
export async function recordSessionOrigin(
  db: Database,
  origin: {
    readonly sessionId: string;
    readonly userId: string;
    readonly kind: 'lesson' | 'playground';
    readonly contentId: string;
  },
): Promise<void> {
  await db.insert(sessionOrigins).values(origin).onConflictDoNothing({
    target: sessionOrigins.sessionId,
  });
}

/**
 * Nội dung của từng phiên, theo id phiên. Phiên không tra ra (mở trước migration
 * 0018, nội dung đã biến mất khỏi mọi nguồn, hoặc không phải của người gọi) VẮNG
 * khỏi map — chỗ gọi đọc thành `null`.
 *
 * Tên đọc qua tầm nhìn `admin` (mọi state, kể cả `archived`), cùng lý do lịch sử
 * lab của `me.*`: một phiên đang chạy không được mất tên chỉ vì tác giả vừa
 * archive bài. Đây là phép đọc TÊN, không cấp quyền mở nội dung — link "Làm tiếp"
 * vẫn đi qua `lessons.get` / `labs.get` / `playgrounds.get` với tầm nhìn thật.
 */
export async function resolveSessionContents(
  db: Database,
  userId: string,
  sessionIds: readonly string[],
): Promise<ReadonlyMap<string, SessionContent>> {
  const ids = [...new Set(sessionIds)];
  if (ids.length === 0) {
    return new Map();
  }

  const [origins, labs] = await Promise.all([
    db
      .select({
        sessionId: sessionOrigins.sessionId,
        kind: sessionOrigins.kind,
        contentId: sessionOrigins.contentId,
      })
      .from(sessionOrigins)
      .where(and(eq(sessionOrigins.userId, userId), inArray(sessionOrigins.sessionId, ids))),
    db
      .select({ sessionId: labAttempts.sessionId, contentId: labAttempts.labId })
      .from(labAttempts)
      .where(and(eq(labAttempts.userId, userId), inArray(labAttempts.sessionId, ids))),
  ]);

  const refs: { sessionId: string; kind: SessionContentKind; contentId: string }[] = [
    ...origins,
    ...labs.map((row) => ({ ...row, kind: 'lab' as const })),
  ];

  const source = contentSourceFor({ kind: 'admin' });
  const resolved = await Promise.all(
    refs.map(async (ref) => {
      const title = await titleOf(source, ref.kind, ref.contentId);
      return title === null
        ? null
        : ([ref.sessionId, { kind: ref.kind, id: ref.contentId, title }] as const);
    }),
  );

  const out = new Map<string, SessionContent>();
  for (const entry of resolved) {
    // Một phiên có cả hai nguồn là dữ liệu hỏng (lab không ghi vào
    // `session_origins`); giữ dòng ĐẦU (nguồn `session_origins`) thay vì để dòng
    // sau ghi đè trong im lặng theo thứ tự `Promise.all`.
    if (entry !== null && !out.has(entry[0])) {
      out.set(entry[0], entry[1]);
    }
  }
  return out;
}

async function titleOf(
  source: ReturnType<typeof contentSourceFor>,
  kind: SessionContentKind,
  id: string,
): Promise<string | null> {
  switch (kind) {
    case 'lesson':
      return (await source.get(id))?.title ?? null;
    case 'lab':
      return (await source.getLab(id))?.title ?? null;
    case 'playground':
      return (await source.getPlayground(id))?.title ?? null;
  }
}
