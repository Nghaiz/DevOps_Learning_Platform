'use client';

import { useMemo, useState } from 'react';
import type { CreatedSession } from '@devops-platform/terminal';
import { api } from '../../../lib/trpc-react';
import { trpc } from '../../../lib/trpc';
import { useSandboxSession, type SandboxSession } from '../../../lib/use-sandbox-session';

/**
 * Vòng đời phiên sandbox cho một LẦN THỬ lab.
 *
 * `labs.startAttempt` ghi cả một dòng `lab_attempts` LẪN mở sandbox trong một
 * lời gọi (contract §3), nhưng nó chỉ trả `{attemptId, sessionId}` — KHÔNG trả
 * `podName`/`status`/`expiresAt` như `lessons.startSession` trả thẳng. Router
 * `labs` cũng không có `endSession`/`extendSession`/`sessionStatus` riêng: gia
 * hạn/kết thúc/hỏi trạng thái đều đi qua router `session.*` DÙNG CHUNG (nhận
 * `sessionId` + `userId`, cùng procedure `/session` dùng — xem
 * `apps/web/src/server/trpc/routers/session.ts`). Nên `start()` ở đây làm HAI
 * lời gọi: `labs.startAttempt` rồi `session.get` để lấy đủ field cho sự kiện
 * `CREATED` của máy trạng thái.
 */
export interface LabSession extends SandboxSession {
  /** `null` cho tới khi `start()` xong `labs.startAttempt`. */
  readonly attemptId: string | null;
  /**
   * Server có áp được tuỳ chọn shell của hồ sơ vào máy không.
   *
   * `null` = CHƯA mở lần thử nào trong lượt xem này, không phải "áp được". Xem
   * `components/session/shell-fallback-notice.tsx`: một lượt "chưa biết" không
   * được đọc thành một lượt hỏng, cũng không được đọc thành một lượt thành công.
   */
  readonly preferencesApplied: boolean | null;
}

export function useLabSession(labId: string, userId: string): LabSession {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [preferencesApplied, setPreferencesApplied] = useState<boolean | null>(null);
  const startAttempt = api.labs.startAttempt.useMutation();

  const actions = useMemo(
    () => ({
      // Key mới mỗi lần bấm = "cho tôi một lần thử MỚI" — cùng lý lẽ
      // `lessons.startSession`.
      start: async (): Promise<CreatedSession> => {
        // Về `null` TRƯỚC mỗi lượt: cờ của lần thử trước không nói gì về lượt này.
        setPreferencesApplied(null);
        const result = await startAttempt.mutateAsync({
          labId,
          idempotencyKey: globalThis.crypto.randomUUID(),
        });
        setAttemptId(result.attemptId);
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
    [labId, userId, startAttempt, setPreferencesApplied],
  );

  const session = useSandboxSession(actions);
  return { ...session, attemptId, preferencesApplied };
}
