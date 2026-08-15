'use client';

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import {
  backoffDelayMsJittered,
  buildSessionWsUrl,
  initialState,
  reduce,
  type ServerControl,
  type SessionState,
  type TerminalHandle,
} from '@devops-platform/terminal';
import { api } from '../../../lib/trpc-react';
import { trpc, describeTrpcError } from '../../../lib/trpc';
import { useSessionReasonLookup } from '../../../lib/use-session-reason-lookup';

/**
 * Vòng đời phiên sandbox cho trang bài học.
 *
 * ⚠ Dùng LẠI `session-machine.ts` của `packages/terminal` chứ không viết máy
 * trạng thái thứ hai. Máy đó đã mang backoff, phân biệt "rớt mạng" với "phiên
 * chết", và ca `1006 khi chưa từng ready` — ba thứ đã trả giá để tìm ra ở 1.F.
 * Một bản chép tay cho trang bài học sẽ bắt đầu bằng việc thiếu cả ba.
 *
 * Khác biệt DUY NHẤT so với `/session`: phiên được tạo bằng
 * `lessons.startSession` (tier suy từ nội dung bài, KHÔNG nhận từ client) thay vì
 * `session.create`.
 */
export interface LessonSession {
  readonly state: SessionState;
  readonly wsUrl: string;
  readonly connectionKey: number | null;
  /** `null` = terminal chưa nối được; nút chạy lệnh phải disable theo giá trị này. */
  readonly terminal: TerminalHandle | null;
  readonly starting: boolean;
  readonly startError: string | null;
  start: () => void;
  onControl: (message: ServerControl) => void;
  onClose: (code: number) => void;
  onTerminalReady: (handle: TerminalHandle | null) => void;
}

export function useLessonSession(scenarioId: string): LessonSession {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [connectionKey, setConnectionKey] = useState(0);
  const [terminal, setTerminal] = useState<TerminalHandle | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const startSession = api.lessons.startSession.useMutation();

  const start = useCallback(() => {
    dispatch({ type: 'START' });
    setStartError(null);
    startSession.mutate(
      // Key mới mỗi lần bấm = "cho tôi một phiên MỚI". Dùng lại key cũ sẽ trả về
      // phiên cũ (guard SET NX EX của B3) và nút trông như hỏng trong 10 phút.
      { scenarioId, idempotencyKey: globalThis.crypto.randomUUID() },
      {
        onSuccess: (result) => {
          const session = result.session;
          if (session === null || session === undefined) {
            dispatch({ type: 'CREATE_FAILED', message: 'Máy chủ không trả về phiên nào.' });
            return;
          }
          dispatch({
            type: 'CREATED',
            session: {
              id: session.id,
              podName: session.podName,
              status: session.status,
              expiresAt: session.expiresAt,
            },
          });
          setConnectionKey((key) => key + 1);
        },
        onError: (error) => {
          const message = describeTrpcError(error);
          setStartError(message);
          dispatch({ type: 'CREATE_FAILED', message });
        },
      },
    );
  }, [scenarioId, startSession]);

  // Hẹn giờ nối lại theo backoff mà máy trạng thái tính. `attempt` PHẢI nằm trong
  // deps: hai lần rớt liên tiếp có thể cho cùng `retryDelayMs` (cả hai đều ở
  // trần), và nếu chỉ phụ thuộc delay thì effect không chạy lại — vòng nối lại
  // đứng im vĩnh viễn ở lần thứ hai. (Bẫy đã gặp ở 1.F.)
  useEffect(() => {
    if (state.retryDelayMs === null) {
      return;
    }
    // AC-H6 (P3/3.H) — jitter áp Ở ĐÂY, không trong máy trạng thái: `reduce`
    // phải thuần (nó còn chạy qua `events.reduce(reduce, from)`, nên một tham số
    // thứ ba sẽ nhận nhầm CHỈ SỐ mảng làm nguồn ngẫu nhiên). Rollout gateway đóng
    // mọi phiên trong cùng một khoảnh khắc; không rải ra thì cả lớp cùng đâm vào
    // trần `/ws` của biên — đo được 19 lượt 429 trên 14 phiên.
    const delay = backoffDelayMsJittered(state.attempt);
    const timer = setTimeout(() => {
      dispatch({ type: 'RETRY_NOW' });
      setConnectionKey((key) => key + 1);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [state.retryDelayMs, state.attempt]);

  // Contract §7 — cái phanh cho ca `1006 khi chưa từng ready`.
  //
  // Máy trạng thái ĐÃ đặt cờ `needsReasonLookup` cho ca này từ 1.F, nhưng trước
  // lượt này trang bài học không đọc cờ đó: một handshake bị từ chối vĩnh viễn
  // (401/403/404 — trình duyệt gộp hết thành 1006) quay vòng backoff 15s mãi mãi
  // dưới nhãn "Đang kết nối…", không lỗi UI, không dòng console. Đo được bằng
  // cách bỏ luật `/ws` khỏi Ingress: 37s im lặng tuyệt đối.
  const fetchStatus = useCallback(
    async (sessionId: string) => (await trpc.lessons.sessionStatus.query({ sessionId })).status,
    [],
  );
  useSessionReasonLookup(state, dispatch, fetchStatus);

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
    starting: startSession.isPending,
    startError,
    start,
    onControl,
    onClose,
    onTerminalReady: setTerminal,
  };
}
