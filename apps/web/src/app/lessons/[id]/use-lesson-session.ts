'use client';

import { errText } from '@devops-platform/copy';
import { useMemo, useState } from 'react';
import type { CreatedSession } from '@devops-platform/terminal';
import { api } from '../../../lib/trpc-react';
import { trpc } from '../../../lib/trpc';
import { useSandboxSession, type SandboxSession } from '../../../lib/use-sandbox-session';

/**
 * Vòng đời phiên sandbox cho trang bài học.
 *
 * ⚠ Dùng LẠI `session-machine.ts` của `packages/terminal` chứ không viết máy
 * trạng thái thứ hai. Máy đó đã mang backoff, phân biệt "rớt mạng" với "phiên
 * chết", và ca `1006 khi chưa từng ready` — ba thứ đã trả giá để tìm ra ở 1.F.
 *
 * P8: lõi vòng đời (reducer, đồng hồ, backoff nối lại, tra lý do 1006) đã tách
 * sang `useSandboxSession` (`apps/web/src/lib/use-sandbox-session.ts`) để
 * `/labs/[id]` và `/playgrounds/[id]` dùng chung mà không viết lại — hai router
 * đó không có `startSession`/`endSession`/`extendSession` (chỉ có
 * `startAttempt`/`start` + router `session.*` chung). File này giờ chỉ còn
 * phần THUỘC VỀ RIÊNG lessons: khai báo bốn thao tác mạng cho `lessons.*` rồi
 * gọi hook chung — export/hình dạng `LessonSession` giữ NGUYÊN nên
 * `lesson-client.tsx` không phải sửa gì.
 *
 * Khác biệt DUY NHẤT so với `/session`: phiên được tạo bằng
 * `lessons.startSession` (tier suy từ nội dung bài, KHÔNG nhận từ client) thay vì
 * `session.create`.
 */
export interface LessonSession extends SandboxSession {
  /**
   * Server có áp được tuỳ chọn shell của hồ sơ vào máy không.
   *
   * `null` = CHƯA mở phiên nào trong lượt xem này, không phải "áp được". Xem
   * `components/session/shell-fallback-notice.tsx`: một lượt "chưa biết" không
   * được đọc thành một lượt hỏng, cũng không được đọc thành một lượt thành công.
   */
  readonly preferencesApplied: boolean | null;
}

export function useLessonSession(scenarioId: string): LessonSession {
  const startSession = api.lessons.startSession.useMutation();
  const [preferencesApplied, setPreferencesApplied] = useState<boolean | null>(null);
  const endSession = api.lessons.endSession.useMutation();
  const extendSession = api.lessons.extendSession.useMutation();

  const fetchStatus = useMemo(
    () => async (sessionId: string) =>
      (await trpc.lessons.sessionStatus.query({ sessionId })).status,
    [],
  );

  const actions = useMemo(
    () => ({
      // Key mới mỗi lần bấm = "cho tôi một phiên MỚI". Dùng lại key cũ sẽ trả về
      // phiên cũ (guard SET NX EX của B3) và nút trông như hỏng trong 10 phút.
      start: async (): Promise<CreatedSession> => {
        // Về `null` TRƯỚC mỗi lượt: cờ của lượt mở trước không nói gì về lượt này.
        setPreferencesApplied(null);
        const result = await startSession.mutateAsync({
          scenarioId,
          idempotencyKey: globalThis.crypto.randomUUID(),
        });
        const session = result.session;
        if (session === null || session === undefined) {
          throw new Error(errText('session.error.no-session'));
        }
        setPreferencesApplied(result.preferencesApplied);
        return session;
      },
      end: async (sessionId: string): Promise<void> => {
        await endSession.mutateAsync({ sessionId });
      },
      // Tự cộng thêm ở client là bịa ra một derived field — luôn trả giá trị
      // SERVER xác nhận.
      extend: async (sessionId: string) => {
        const result = await extendSession.mutateAsync({ sessionId, extendSeconds: 0 });
        return { expiresAt: result.expiresAt, hardCapReached: result.hardCapReached };
      },
      fetchStatus,
    }),
    [scenarioId, startSession, endSession, extendSession, fetchStatus, setPreferencesApplied],
  );

  return { ...useSandboxSession(actions), preferencesApplied };
}
