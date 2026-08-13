'use client';

import { useEffect, useRef } from 'react';
import type { SessionEvent, SessionState } from '@devops-platform/terminal';
import { describeTrpcError, trpcErrorCode } from './trpc';
import { reasonFromLookupError, reasonFromStatus } from './session-reason';

/**
 * Trả về trạng thái phiên phía máy chủ, hoặc `null` khi máy chủ không còn phiên.
 * Mỗi trang tự cấp hàm này vì hai trang gọi hai procedure khác nhau:
 * `/session` dùng `session.get` (nhận `userId` trong input, thiết kế P1), còn
 * trang bài học dùng `lessons.sessionStatus` (suy người dùng từ `ctx.user.id` —
 * kỷ luật của 2.B: input không có gì để giả mạo).
 *
 * PHẢI ổn định qua các lần render (`useCallback`): hook chạy lại khi hàm đổi.
 */
export type SessionStatusFetcher = (sessionId: string) => Promise<number | null>;

/**
 * Contract §7 — thấy `1006` mà CHƯA TỪNG `ready` thì đi hỏi lý do thật.
 *
 * Dùng chung cho `/session` và trang bài học. Trước đây phần này chỉ tồn tại
 * inline trong `session-client.tsx`; trang bài học của 2.D dùng lại
 * `session-machine` (nên cờ `needsReasonLookup` VẪN được đặt) nhưng không có ai
 * đọc cờ đó — cái phanh có mặt trong máy trạng thái mà không có mặt trên màn hình.
 * Chép tay sang trang thứ hai sẽ dựng hai nơi quyết định "khi nào thì bỏ cuộc",
 * và chúng sẽ lệch nhau ở lần đầu tiên có người sửa một bên.
 */
export function useSessionReasonLookup(
  state: Pick<SessionState, 'needsReasonLookup' | 'sessionId'>,
  dispatch: (event: SessionEvent) => void,
  fetchStatus: SessionStatusFetcher,
): void {
  // Một lượt hỏi tại một thời điểm. Không có chốt này thì mỗi lần render trong
  // lúc lượt hỏi đang bay lại bắn thêm một lượt nữa vào cùng một endpoint.
  const inFlight = useRef(false);

  useEffect(() => {
    const sessionId = state.sessionId;
    if (!state.needsReasonLookup || sessionId === null || inFlight.current) {
      return;
    }
    inFlight.current = true;
    void (async () => {
      try {
        const outcome = reasonFromStatus(await fetchStatus(sessionId));
        dispatch({ type: 'REASON_RESOLVED', message: outcome.message, gone: outcome.gone });
      } catch (error) {
        const outcome = reasonFromLookupError(trpcErrorCode(error), describeTrpcError(error));
        dispatch({ type: 'REASON_RESOLVED', message: outcome.message, gone: outcome.gone });
      } finally {
        inFlight.current = false;
      }
    })();
  }, [state.needsReasonLookup, state.sessionId, dispatch, fetchStatus]);
}
