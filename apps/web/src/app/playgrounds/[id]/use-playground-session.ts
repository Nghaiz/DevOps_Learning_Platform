'use client';

import { useMemo } from 'react';
import type { CreatedSession } from '@devops-platform/terminal';
import { api } from '../../../lib/trpc-react';
import { trpc } from '../../../lib/trpc';
import { useSandboxSession, type SandboxSession } from '../../../lib/use-sandbox-session';

/**
 * Vòng đời phiên sandbox cho một playground.
 *
 * `playgrounds.start` không ghi dòng nào (contract §4 — playground không có
 * tiến độ để mất) và chỉ trả `{sessionId, ttlSeconds}`, không trả session đầy
 * đủ. Cùng mẫu với `use-lab-session.ts`: gọi `session.get` NGAY SAU để có đủ
 * field cho sự kiện `CREATED`, rồi dùng router `session.*` chung cho gia hạn/
 * kết thúc/hỏi trạng thái (playground router không có các procedure đó riêng).
 */
export function usePlaygroundSession(playgroundId: string, userId: string): SandboxSession {
  const start = api.playgrounds.start.useMutation();

  const actions = useMemo(
    () => ({
      start: async (): Promise<CreatedSession> => {
        const result = await start.mutateAsync({
          playgroundId,
          idempotencyKey: globalThis.crypto.randomUUID(),
        });

        const statusResult = await trpc.session.get.query({
          sessionId: result.sessionId,
          userId,
        });
        const session = statusResult.session;
        if (session === null) {
          throw new Error('Máy chủ không trả về phiên nào.');
        }
        return session;
      },
      end: async (sessionId: string): Promise<void> => {
        await trpc.session.reap.mutate({ sessionId, userId, reason: 'user_ended' });
      },
      extend: async (sessionId: string) => {
        const result = await trpc.session.extend.mutate({ sessionId, userId, extendSeconds: 0 });
        return {
          expiresAt: result.session?.expiresAt ?? null,
          hardCapReached: result.hardCapReached,
        };
      },
      fetchStatus: async (sessionId: string) =>
        (await trpc.session.get.query({ sessionId, userId })).session?.status ?? null,
    }),
    [playgroundId, userId, start],
  );

  return useSandboxSession(actions);
}
