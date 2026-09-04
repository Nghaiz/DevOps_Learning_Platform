'use client';

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import {
  backoffDelayMsJittered,
  buildSessionWsUrl,
  initialState,
  reduce,
  type CreatedSession,
  type ServerControl,
  type SessionState,
  type TerminalHandle,
} from '@devops-platform/terminal';
import { describeTrpcError } from './trpc';
import { useSessionReasonLookup, type SessionStatusFetcher } from './use-session-reason-lookup';

/**
 * Lõi vòng đời phiên sandbox — TÁCH RA từ `apps/web/src/app/lessons/[id]/use-lesson-session.ts`
 * (P8, khi `/labs/[id]` và `/playgrounds/[id]` cần đúng máy trạng thái đó mà
 * không thể gọi `lessons.startSession`/`endSession`/`extendSession`: hai router
 * kia không có ba procedure đó — `labs.startAttempt` chỉ trả `{attemptId,
 * sessionId}`, `playgrounds.start` chỉ trả `{sessionId, ttlSeconds}`, và cả hai
 * dùng `session.extend`/`session.get`/`session.reap` (router chung) để gia hạn/
 * kết thúc/hỏi trạng thái — xem `apps/web/src/server/trpc/routers/session.ts`).
 *
 * Ba trang (`/lessons/[id]`, `/labs/[id]`, `/playgrounds/[id]`) chia sẻ ĐÚNG một
 * máy trạng thái (`reduce`/`initialState` của `@devops-platform/terminal`) và
 * đúng một chuỗi hiệu ứng (đồng hồ đếm ngược, backoff nối lại có jitter, tra lý
 * do thật khi 1006 mà chưa từng ready). Khác nhau DUY NHẤT là BỐN thao tác gọi
 * mạng — `start`/`end`/`extend`/`fetchStatus` — nên bốn thao tác đó được TIÊM
 * VÀO qua `SandboxSessionActions` thay vì viết lại cả hook cho mỗi router.
 *
 * `use-lesson-session.ts` giờ chỉ còn phần khai báo bốn hàm đó cho `lessons.*`
 * rồi gọi `useSandboxSession` — không đổi export/hình dạng `LessonSession`, nên
 * `lesson-client.tsx` không phải sửa gì.
 */
export interface SandboxSessionActions {
  /** Tạo phiên mới. Ném lỗi khi thất bại — hook tự dịch sang `CREATE_FAILED`. */
  readonly start: () => Promise<CreatedSession>;
  /** Kết thúc phiên sớm; chỉ gọi khi máy trạng thái đã có `sessionId`. */
  readonly end: (sessionId: string) => Promise<void>;
  /** Xin gia hạn — PHẢI trả `expiresAt` của SERVER, không phải giá trị tự cộng. */
  readonly extend: (
    sessionId: string,
  ) => Promise<{ expiresAt: string | null; hardCapReached: boolean }>;
  /** Contract §7 — hỏi trạng thái thật khi thấy `1006` mà chưa từng `ready`. */
  readonly fetchStatus: SessionStatusFetcher;
}

export interface SandboxSession {
  readonly state: SessionState;
  readonly wsUrl: string;
  readonly connectionKey: number | null;
  /** `null` = terminal chưa nối được; nút chạy lệnh phải disable theo giá trị này. */
  readonly terminal: TerminalHandle | null;
  readonly starting: boolean;
  readonly startError: string | null;
  /** `true` trong lúc `actions.end` đang chạy. */
  readonly ending: boolean;
  /** `true` trong lúc `actions.extend` đang chạy. */
  readonly extending: boolean;
  /** Mili-giây còn lại tới `expiresAt`; `null` khi chưa biết hạn. Đã kẹp ở 0. */
  readonly remainingMs: number | null;
  start: () => void;
  end: () => void;
  extend: () => void;
  onControl: (message: ServerControl) => void;
  onClose: (code: number) => void;
  onTerminalReady: (handle: TerminalHandle | null) => void;
}

export function useSandboxSession(actions: SandboxSessionActions): SandboxSession {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [connectionKey, setConnectionKey] = useState(0);
  const [terminal, setTerminal] = useState<TerminalHandle | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [extending, setExtending] = useState(false);

  const start = useCallback(() => {
    dispatch({ type: 'START' });
    setStartError(null);
    setStarting(true);
    void (async () => {
      try {
        const session = await actions.start();
        dispatch({ type: 'CREATED', session });
        setConnectionKey((key) => key + 1);
      } catch (error) {
        const message = describeTrpcError(error);
        setStartError(message);
        dispatch({ type: 'CREATE_FAILED', message });
      } finally {
        setStarting(false);
      }
    })();
  }, [actions]);

  // Dispatch ENDED chỉ SAU khi kết thúc xong ở máy chủ — về idle trước rồi lỗi
  // hạ tầng là người dùng thấy "đã kết thúc" trong khi pod vẫn giữ một khe
  // quota, đúng thứ nút này sinh ra để chấm dứt (cùng lý lẽ `use-lesson-session`).
  const end = useCallback(() => {
    const sessionId = state.sessionId;
    if (sessionId === null) {
      return;
    }
    setStartError(null);
    setEnding(true);
    void (async () => {
      try {
        await actions.end(sessionId);
        dispatch({ type: 'ENDED' });
      } catch (error) {
        setStartError(describeTrpcError(error));
      } finally {
        setEnding(false);
      }
    })();
  }, [state.sessionId, actions]);

  const extend = useCallback(() => {
    const sessionId = state.sessionId;
    if (sessionId === null) {
      return;
    }
    setStartError(null);
    setExtending(true);
    void (async () => {
      try {
        const result = await actions.extend(sessionId);
        dispatch({ type: 'EXTENDED', expiresAt: result.expiresAt, hardCapReached: result.hardCapReached });
      } catch (error) {
        setStartError(describeTrpcError(error));
      } finally {
        setExtending(false);
      }
    })();
  }, [state.sessionId, actions]);

  // Đồng hồ đếm ngược. 15s một nhịp: thứ nó điều khiển là một cái nhãn phút và
  // một nút hiện/ẩn, không phải một thanh giây.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (state.expiresAtMs === null) {
      return;
    }
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 15_000);
    return () => {
      clearInterval(timer);
    };
  }, [state.expiresAtMs]);

  const remainingMs = useMemo(
    () => (state.expiresAtMs === null ? null : Math.max(0, state.expiresAtMs - nowMs)),
    [state.expiresAtMs, nowMs],
  );

  // Hẹn giờ nối lại theo backoff mà máy trạng thái tính, jitter áp ở tầng React
  // (xem lý lẽ đầy đủ ở `session-machine.ts` — reducer phải thuần).
  useEffect(() => {
    if (state.retryDelayMs === null) {
      return;
    }
    const delay = backoffDelayMsJittered(state.attempt);
    const timer = setTimeout(() => {
      dispatch({ type: 'RETRY_NOW' });
      setConnectionKey((key) => key + 1);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [state.retryDelayMs, state.attempt]);

  useSessionReasonLookup(state, dispatch, actions.fetchStatus);

  const wsUrl = useMemo(
    () =>
      state.sessionId === null
        ? ''
        : buildSessionWsUrl(globalThis.location.origin, state.sessionId),
    [state.sessionId],
  );

  const connected = state.phase === 'connecting' || state.phase === 'ready';

  const onControl = useCallback((message: ServerControl) => {
    dispatch({ type: 'CONTROL', message });
  }, []);

  const onClose = useCallback((code: number) => {
    dispatch({ type: 'CLOSED', code, nowMs: Date.now() });
  }, []);

  return {
    state,
    wsUrl,
    connectionKey: connected ? connectionKey : null,
    terminal,
    starting,
    startError,
    ending,
    extending,
    remainingMs,
    start,
    end,
    extend,
    onControl,
    onClose,
    onTerminalReady: setTerminal,
  };
}
