'use client';

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  DEFAULT_THEME,
  THEME_NAMES,
  backoffDelayMsJittered,
  buildSessionWsUrl,
  initialState,
  loadThemeName,
  reduce,
  saveThemeName,
  type ThemeName,
} from '@devops-platform/terminal';
import { SandboxTier } from '@devops-platform/shared-types';
import { Button } from '@devops-platform/ui';
import { trpc, describeTrpcError } from '../../../lib/trpc';
import { useSessionReasonLookup } from '../../../lib/use-session-reason-lookup';

/**
 * ⛔ `ssr: false` phải nằm trong một CLIENT component — Next 16 NÉM khi thấy nó
 * trong Server Component ("`ssr: false` is not allowed with `next/dynamic` in
 * Server Components"). Plan F7 viết là "`page.tsx` (Server Component) … nạp
 * `session-terminal.tsx` bằng `next/dynamic` với `ssr: false`", tức đặt lời gọi
 * ở page — bản đó KHÔNG BUILD ĐƯỢC trên Next 16. Nên tầng là ba lớp:
 * `page.tsx` (server, auth) → file này (client, máy trạng thái) → `terminal-pane`
 * (client, đụng `document`, nạp động).
 *
 * Vẫn cần `ssr: false` dù đây đã là client component: Client Component mặc định
 * VẪN được render trước trên server, và `@xterm/xterm` chạm `document` ngay lúc
 * import module — tức là nổ lúc SSR, không phải lúc mount.
 */
const TerminalPane = dynamic(() => import('./terminal-pane'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-slate-900/40" />,
});

const SESSION_TIER = SandboxTier.SYSBOX;

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) {
    return '00:00';
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${String(hours)}:${mm}:${ss}` : `${mm}:${ss}`;
}

const PHASE_LABEL: Record<string, string> = {
  idle: 'Chưa có phiên',
  creating: 'Đang tạo phiên…',
  connecting: 'Đang kết nối…',
  ready: 'Đang chạy',
  reconnecting: 'Mất kết nối — đang thử lại…',
  exited: 'Shell đã thoát',
  expired: 'Phiên đã kết thúc',
  error: 'Lỗi',
};

export function SessionClient({ userId }: { userId: string }): React.ReactElement {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);
  const [connectionKey, setConnectionKey] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [extending, setExtending] = useState(false);

  // `localStorage` chỉ đọc được sau khi hydrate — đọc lúc khởi tạo state sẽ làm
  // markup server (luôn DEFAULT_THEME) lệch markup client và React cảnh báo
  // hydration mismatch.
  useEffect(() => {
    setTheme(loadThemeName());
  }, []);

  const wsUrl = useMemo(() => {
    if (state.sessionId === null) {
      return '';
    }
    return buildSessionWsUrl(globalThis.location.origin, state.sessionId);
  }, [state.sessionId]);

  const startSession = useCallback(async () => {
    dispatch({ type: 'START' });
    try {
      const result = await trpc.session.create.mutate({
        userId,
        tier: SESSION_TIER,
        ttlSeconds: 0,
        // `idempotencyKey` mới mỗi lần bấm: đây là "tạo phiên MỚI" theo đúng ý
        // người dùng. Dùng lại key cũ sẽ trả về session cũ (guard `SET NX EX 600`
        // của B3) và nút Start im lặng không làm gì trong 10 phút.
        idempotencyKey: globalThis.crypto.randomUUID(),
      });
      const session = result.session;
      if (session === null) {
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
    } catch (error) {
      dispatch({ type: 'CREATE_FAILED', message: describeTrpcError(error) });
    }
  }, [userId]);

  // ── Đồng hồ đếm ngược ───────────────────────────────────────────────────────
  const clockRunning = state.phase === 'ready' || state.phase === 'reconnecting';
  useEffect(() => {
    if (!clockRunning) {
      return;
    }
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);
    return () => {
      clearInterval(timer);
    };
  }, [clockRunning]);

  // ── F10 — hẹn giờ nối lại theo backoff mà máy trạng thái tính ────────────────
  useEffect(() => {
    if (state.retryDelayMs === null) {
      return;
    }
    // AC-H6 (P3/3.H) — jitter áp Ở ĐÂY, không trong máy trạng thái (reducer phải
    // thuần). Rollout gateway đóng mọi phiên cùng lúc; không rải ra thì cả lớp
    // cùng đâm vào trần `/ws` của biên — đo được 19 lượt 429 trên 14 phiên.
    const delay = backoffDelayMsJittered(state.attempt);
    const timer = setTimeout(() => {
      dispatch({ type: 'RETRY_NOW' });
      setConnectionKey((key) => key + 1);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
    // `attempt` trong deps: hai lần rớt liên tiếp có thể cho cùng `retryDelayMs`
    // (vd cả hai đều 15s ở trần), và nếu chỉ phụ thuộc delay thì effect KHÔNG
    // chạy lại — vòng nối lại đứng im vĩnh viễn ở lần thứ hai.
  }, [state.retryDelayMs, state.attempt]);

  // ── Contract §7 — hỏi lý do thật khi thấy 1006 mà chưa từng `ready` ──────────
  //
  // Phần quyết định nằm ở `useSessionReasonLookup` + `session-reason.ts`, dùng
  // chung với trang bài học. Ở đây chỉ còn cách LẤY trạng thái, vì hai trang gọi
  // hai procedure khác nhau (xem `SessionStatusFetcher`).
  const fetchStatus = useCallback(
    async (sessionId: string) => (await trpc.session.get.query({ sessionId, userId })).session
        ?.status ?? null,
    [userId],
  );
  useSessionReasonLookup(state, dispatch, fetchStatus);

  const onExtend = useCallback(async () => {
    const sessionId = state.sessionId;
    if (sessionId === null) {
      return;
    }
    setExtending(true);
    try {
      const result = await trpc.session.extend.mutate({ sessionId, userId, extendSeconds: 0 });
      const expiresAt = result.session?.expiresAt;
      if (expiresAt !== null && expiresAt !== undefined) {
        // Cập nhật đồng hồ ngay từ phản hồi tRPC thay vì chờ `expiring` qua WS:
        // gateway chỉ phát `expiring` khi CHÍNH NÓ gia hạn, nên một lượt gia hạn
        // do người dùng bấm sẽ không sinh frame nào và nút bấm trông như hỏng.
        dispatch({
          type: 'CONTROL',
          message: { type: 'expiring', expiresAt, hardCapReached: result.hardCapReached },
        });
      }
    } catch (error) {
      dispatch({ type: 'CREATE_FAILED', message: describeTrpcError(error) });
    } finally {
      setExtending(false);
    }
  }, [state.sessionId, userId]);

  const connected = state.phase === 'connecting' || state.phase === 'ready';
  const remainingMs = state.expiresAtMs === null ? null : state.expiresAtMs - nowMs;
  const canStart = ['idle', 'expired', 'error', 'exited'].includes(state.phase);

  return (
    <main className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-2 text-sm">
        <span className="font-semibold">Lab sandbox</span>

        <span
          className="rounded bg-slate-800 px-2 py-0.5 text-xs"
          data-testid="phase"
        >
          {PHASE_LABEL[state.phase] ?? state.phase}
        </span>

        {state.podName !== null && (
          <span className="font-mono text-xs text-slate-400">{state.podName}</span>
        )}

        {remainingMs !== null && clockRunning && (
          <span
            className={
              state.hardCapReached ? 'text-amber-400 font-mono' : 'text-slate-300 font-mono'
            }
          >
            Còn {formatCountdown(remainingMs)}
          </span>
        )}

        {/*
          Contract §5 — CHỈ cảnh báo khi `hardCapReached`. Lúc `false` thì
          `expiring` chỉ là "hạn vừa dịch tới", và hiện cảnh báo ở đó là dạy người
          dùng bỏ qua cảnh báo.
        */}
        {state.hardCapReached && (
          <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
            Đã chạm trần thời lượng — không gia hạn thêm được nữa
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-slate-400" htmlFor="theme">
            Giao diện
          </label>
          <select
            id="theme"
            className="rounded bg-slate-800 px-2 py-1 text-xs"
            value={theme}
            onChange={(event) => {
              const next = event.target.value as ThemeName;
              setTheme(next);
              saveThemeName(next);
            }}
          >
            {THEME_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <Button
            variant="secondary"
            onClick={() => void onExtend()}
            disabled={state.phase !== 'ready' || state.hardCapReached || extending}
          >
            {extending ? 'Đang gia hạn…' : 'Gia hạn'}
          </Button>

          <Button onClick={() => void startSession()} disabled={!canStart}>
            {state.phase === 'idle' ? 'Bắt đầu' : 'Tạo phiên mới'}
          </Button>
        </div>
      </header>

      {state.message !== null && (
        <div
          className="border-b border-slate-800 bg-slate-900 px-4 py-2 text-sm text-amber-200"
          role="status"
        >
          {state.message}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {state.sessionId === null ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
            Bấm <span className="mx-1 font-semibold text-slate-200">Bắt đầu</span> để dựng một
            pod lab và mở terminal.
          </div>
        ) : (
          <TerminalPane
            wsUrl={wsUrl}
            connectionKey={connected ? connectionKey : null}
            theme={theme}
            onControl={(message) => {
              dispatch({ type: 'CONTROL', message });
            }}
            onClose={(code) => {
              dispatch({ type: 'CLOSED', code, nowMs: Date.now() });
            }}
          />
        )}
      </div>
    </main>
  );
}
