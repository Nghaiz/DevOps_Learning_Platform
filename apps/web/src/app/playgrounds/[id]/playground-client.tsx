'use client';

import { useCallback, useState, type ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { TopicBadge } from '@devops-platform/ui';
import {
  NoticeStrip,
  SessionControls,
  SessionStatusPill,
  TerminalPane,
  WorkspaceBar,
  WorkspacePanel,
  resolveShellFallbackNotice,
  useResolvedTerminalTheme,
  useTerminalHandoff,
  type PracticeNotice,
} from '../../../components/session';
import { useWorkspaceTabs } from '../../../components/session/use-workspace-tabs';
import { lineForTopic } from '../../../lib/topic-line';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { usePlaygroundSession } from './use-playground-session';

/**
 * Sân chơi: một sandbox trống, terminal chiếm TRỌN phần còn lại của màn hình.
 *
 * M4: trang là immersive (không header ứng dụng), nên gốc tự lấy `h-dvh` rồi chia
 * cho thanh trên + khoang terminal. Bản trước dựa vào `<main>` là một cột flex
 * `flex-1`, mà ở route immersive `<main>` không còn là cột flex nữa, nên terminal
 * co về chiều cao nội dung.
 */
export function PlaygroundClient({ playgroundId, userId }: { playgroundId: string; userId: string }): ReactElement {
  const query = api.playgrounds.get.useQuery({ playgroundId });
  const session = usePlaygroundSession(playgroundId, userId);
  const handoff = useTerminalHandoff(session.state.sessionId);
  const [popupBlocked, setPopupBlocked] = useState(false);

  const me = api.me.get.useQuery({});
  const terminalTheme = useResolvedTerminalTheme(me.data?.preferences.terminalTheme ?? null);

  const capacity = api.capacity.get.useQuery(
    {},
    { refetchInterval: 15_000, enabled: session.state.sessionId === null },
  );

  // TRÊN mọi `return` sớm. Sân chơi không có tab Editor và không có khối `{{exec}}`.
  const tabs = useWorkspaceTabs({ terminal: session.terminal, hasEditor: false, sessionId: session.state.sessionId });

  const onPopOut = useCallback(() => {
    setPopupBlocked(!handoff.popOut());
  }, [handoff]);

  if (query.isPending) {
    return <Centered>{t('session.playground.loading')}</Centered>;
  }
  if (query.isError) {
    return <Centered tone="error">{describeTrpcError(query.error)}</Centered>;
  }

  const { playground, profile, unsupportedCapabilities } = query.data;
  const ttlMinutes = Math.round(playground.ttlSeconds / 60);
  const sessionId = session.state.sessionId;
  const line = lineForTopic({ topic: playground.topic ?? null, id: playground.id });

  const shellNotice = resolveShellFallbackNotice({
    sessionId,
    preferencesApplied: session.preferencesApplied,
    shell: me.data?.preferences.defaultShell ?? null,
  });
  const notices: PracticeNotice[] = [
    ...(session.startError === null ? [] : [{ id: `start:${session.startError}`, tone: 'destructive' as const, text: session.startError }]),
    ...(unsupportedCapabilities.length > 0
      ? [{ id: 'unsupported', tone: 'warning' as const, text: t('session.playground.unsupported', { capabilities: unsupportedCapabilities.join(', ') }) }]
      : []),
    ...(shellNotice === null ? [] : [{ id: `shell:${sessionId ?? ''}`, tone: 'warning' as const, text: shellNotice.lines.join(' ') }]),
    ...(popupBlocked ? [{ id: 'popup', tone: 'warning' as const, text: t('session.overlay.popup-blocked') }] : []),
  ];

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <WorkspaceBar
        backHref="/playgrounds"
        backLabel={t('session.playground.back')}
        title={playground.title}
        {...(line === 'ink' ? {} : { badge: <TopicBadge line={line} size="sm" /> })}
        controls={
          /* TTL hiện TRƯỚC khi bắt đầu (AC 8.E); `profile` từ `playgrounds.get`. */
          <SessionControls
            session={session}
            actions={{ start: session.start, end: session.end, extend: session.extend }}
            ttlSeconds={playground.ttlSeconds}
            capacity={capacity.data ?? null}
            profile={profile}
          />
        }
      />
      <NoticeStrip notices={notices} />
      <div className="min-h-0 flex-1">
        <WorkspacePanel
          terminal={
            <TerminalPane
              session={session}
              theme={terminalTheme}
              handoff={handoff}
              placeholder={
                <span className="flex max-w-md flex-col gap-3">
                  {playground.description !== null && <span>{playground.description}</span>}
                  <span>{t('session.playground.empty', { minutes: ttlMinutes })}</span>
                </span>
              }
            />
          }
          activeTab={tabs.activeTab}
          onActivate={tabs.onActivate}
          onPopOut={sessionId === null ? null : onPopOut}
          status={<SessionStatusPill phase={session.state.phase} />}
          storageKey="dlp-playground-workspace"
        />
      </div>
    </div>
  );
}

function Centered({ children, tone }: { children: React.ReactNode; tone?: 'error' }): ReactElement {
  return (
    <div className="flex h-dvh items-center justify-center bg-background px-6">
      <p className={tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{children}</p>
    </div>
  );
}
