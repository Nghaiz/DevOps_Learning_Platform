import type { Session } from '@devops-platform/shared-types';

/**
 * ⛔ **`Session` của proto KHÔNG serialize được ra JSON** — và đây là lỗi CÓ SẴN
 * từ P0, chỉ lộ ra ở 1.G-12 vì đó là thứ đầu tiên gọi `session.*` qua HTTP thật.
 *
 * Ba field là `bigint` (`expiresAt.seconds`, `createdAt.seconds`, `revision: int64`),
 * và `JSON.stringify` **NÉM** trên bigint chứ không bỏ qua. Triệu chứng đo được
 * trên cluster 2026-08-11: `POST /api/trpc/session.create` → **HTTP 500**
 * `"Do not know how to serialize a BigInt"`, sau khi pod ĐÃ được claim — tức
 * người dùng mất một pod khỏi trần quota 4 và nhận về một lỗi 500 vô nghĩa.
 *
 * **Vì sao không test nào bắt được:** `rule-01-authz` và bạn bè gọi qua
 * `appRouter.createCaller`, trả thẳng object JS — không có bước serialize nào.
 * Bằng chứng 1.C-2 thì gọi `CreateSession` bằng gRPC, cũng không qua tRPC. Đường
 * HTTP của `session.*` **chưa từng chạy** cho tới lúc đó. Cùng họ với "job chỉ
 * chạy trên `main` nên file đó không có cổng review" ở 1.E-1: một đường không ai
 * đi thì không ai gác.
 *
 * Vì thế BFF trả một shape của RIÊNG mình thay vì chuyển tiếp message proto:
 * `Timestamp` → chuỗi ISO-8601 (thứ `new Date()` phía FE đọc thẳng được, và F9
 * cần cho đồng hồ đếm ngược), `revision` → number. Kèm lợi ích thứ hai: `$typeName`
 * và các field nội bộ của connect-es không còn rò ra trình duyệt.
 *
 * Tách khỏi `trpc/routers/session.ts` ở P2 vì `lessons.startSession` cũng tạo
 * session và cũng phải trả đúng shape này. Hai bản chuyển đổi song song sẽ trôi
 * khỏi nhau, và cái trôi sẽ lộ ra dưới dạng lại một HTTP 500 vì bigint.
 */
export interface JsonSession {
  id: string;
  userId: string;
  status: number;
  podName: string;
  namespace: string;
  tier: number;
  createdAt: string | null;
  expiresAt: string | null;
  revision: number;
}

function tsToIso(ts: { seconds: bigint; nanos: number } | undefined): string | null {
  if (ts === undefined) {
    return null;
  }
  return new Date(Number(ts.seconds) * 1000 + Math.floor(ts.nanos / 1_000_000)).toISOString();
}

export function toJsonSession(session: Session | undefined): JsonSession | null {
  if (session === undefined) {
    return null;
  }
  return {
    id: session.id,
    userId: session.userId,
    status: session.status,
    podName: session.podName,
    namespace: session.namespace,
    tier: session.tier,
    createdAt: tsToIso(session.createdAt),
    expiresAt: tsToIso(session.expiresAt),
    // int64 → number: revision là bộ đếm INCR trên một session, thực tế đếm hàng
    // chục. Vượt 2^53 nghĩa là đã có 9e15 lần ghi trên MỘT session — không phải
    // chế độ hỏng đáng phòng, và `string` sẽ bắt FE tự parse mà không được gì.
    revision: Number(session.revision),
  };
}
