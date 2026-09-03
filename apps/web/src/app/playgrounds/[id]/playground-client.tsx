'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { DEFAULT_THEME } from '@devops-platform/terminal';
import { Button } from '@devops-platform/ui';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { usePlaygroundSession } from './use-playground-session';

const TerminalPane = dynamic(() => import('./terminal-pane'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-slate-900/40" />,
});

const SESSION_PHASE_LABEL: Record<string, string> = {
  idle: 'Chưa có phiên',
  creating: 'Đang tạo phiên…',
  connecting: 'Đang kết nối…',
  ready: 'Sandbox sẵn sàng',
  reconnecting: 'Mất kết nối — đang thử lại…',
  exited: 'Shell đã thoát',
  expired: 'Phiên đã kết thúc',
  error: 'Lỗi',
};

export function PlaygroundClient({
  playgroundId,
  userId,
}: {
  playgroundId: string;
  userId: string;
}): React.ReactElement {
  const query = api.playgrounds.get.useQuery({ playgroundId });
  const session = usePlaygroundSession(playgroundId, userId);

  if (query.isPending) {
    return <Centered>Đang tải sân chơi…</Centered>;
  }
  if (query.isError) {
    return <Centered tone="error">{describeTrpcError(query.error)}</Centered>;
  }

  const { playground, unsupportedCapabilities } = query.data;
  const ttlMinutes = Math.round(playground.ttlSeconds / 60);

  return (
    <main className="flex h-screen flex-col bg-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2">
        <Link href="/playgrounds" className="text-sm text-slate-500 hover:text-slate-900">
          ← Sân chơi
        </Link>
        <h1 className="text-sm font-semibold">{playground.title}</h1>

        {/*
          AC 8.E — người học phải biết con số này TRƯỚC KHI bấm "Bắt đầu", không
          phải sau. Hiện LUÔN ở đây (không gói trong nhánh "chưa có phiên") để nó
          không biến mất giữa chừng và vẫn là lời nhắc đúng sau khi phiên đã mở.
        */}
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
          Tự đóng sau {ttlMinutes} phút
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {SESSION_PHASE_LABEL[session.state.phase] ?? session.state.phase}
          </span>
          {session.state.message !== null && (
            <span
              role="status"
              className={
                session.state.phase === 'error' || session.state.phase === 'expired'
                  ? 'text-xs text-red-700'
                  : 'text-xs text-slate-500'
              }
            >
              {session.state.message}
            </span>
          )}
          {session.state.sessionId === null && (
            <Button onClick={session.start} disabled={session.starting}>
              {session.starting ? 'Đang tạo phiên…' : 'Bắt đầu'}
            </Button>
          )}
          {session.state.sessionId !== null &&
            session.remainingMs !== null &&
            session.remainingMs < 10 * 60_000 && (
              <>
                <span
                  className={
                    session.remainingMs < 2 * 60_000
                      ? 'text-xs font-semibold text-red-700'
                      : 'text-xs text-amber-700'
                  }
                >
                  Còn {Math.ceil(session.remainingMs / 60_000)} phút
                </span>
                <Button
                  variant="secondary"
                  onClick={session.extend}
                  disabled={session.extending || session.state.hardCapReached}
                  title={
                    session.state.hardCapReached
                      ? 'Đã dùng hết thời lượng tối đa cho phiên này — hãy kết thúc và mở phiên mới.'
                      : undefined
                  }
                >
                  {session.extending ? 'Đang thêm giờ…' : 'Thêm giờ'}
                </Button>
              </>
            )}
          {session.state.sessionId !== null && (
            <Button variant="secondary" onClick={session.end} disabled={session.ending}>
              {session.ending ? 'Đang kết thúc…' : 'Kết thúc phiên'}
            </Button>
          )}
        </div>
      </header>

      {unsupportedCapabilities.length > 0 && (
        <div
          role="alert"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
        >
          Sân chơi này cần <strong>{unsupportedCapabilities.join(', ')}</strong> — nền tảng chưa
          chạy được những năng lực đó, nên một số lệnh sẽ báo lỗi.
        </div>
      )}

      {session.startError !== null && (
        <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {session.startError}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {session.state.sessionId === null ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center">
            {playground.description !== null && (
              <p className="max-w-md text-sm text-slate-400">{playground.description}</p>
            )}
            <p className="text-sm text-slate-400">
              Bấm <span className="mx-1 font-semibold text-slate-200">Bắt đầu</span> để dựng
              sandbox và mở terminal — phiên tự đóng sau <strong>{ttlMinutes} phút</strong>.
            </p>
          </div>
        ) : (
          <TerminalPane
            wsUrl={session.wsUrl}
            connectionKey={session.connectionKey}
            theme={DEFAULT_THEME}
            onControl={session.onControl}
            onClose={session.onClose}
            onReady={session.onTerminalReady}
          />
        )}
      </div>
    </main>
  );
}

function Centered({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'error';
}): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <p className={tone === 'error' ? 'text-sm text-red-700' : 'text-sm text-slate-500'}>
        {children}
      </p>
    </main>
  );
}
