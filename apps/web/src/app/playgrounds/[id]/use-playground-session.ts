'use client';

import { useMemo, useState } from 'react';
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
export interface PlaygroundSession extends SandboxSession {
  /**
   * Server có áp được tuỳ chọn shell của hồ sơ vào máy không.
   *
   * `null` = CHƯA mở phiên nào trong lượt xem này, không phải "áp được". Xem
   * `components/session/shell-fallback-notice.tsx`: một lượt "chưa biết" không
   * được đọc thành một lượt hỏng, cũng không được đọc thành một lượt thành công.
   */
  readonly preferencesApplied: boolean | null;
}

export function usePlaygroundSession(playgroundId: string, userId: string): PlaygroundSession {
  const start = api.playgrounds.start.useMutation();
  const [preferencesApplied, setPreferencesApplied] = useState<boolean | null>(null);

  const actions = useMemo(
    () => ({
      start: async (): Promise<CreatedSession> => {
        // Về `null` TRƯỚC mỗi lượt: cờ của lượt mở trước không nói gì về lượt này.
        setPreferencesApplied(null);
        const result = await start.mutateAsync({
          playgroundId,
          idempotencyKey: globalThis.crypto.randomUUID(),
        });
        setPreferencesApplied(result.preferencesApplied);

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
    [playgroundId, userId, start, setPreferencesApplied],
  );

  return { ...useSandboxSession(actions), preferencesApplied };
}
