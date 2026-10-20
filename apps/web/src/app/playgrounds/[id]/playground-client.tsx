'use client';

import { useCallback, useState, type ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { TopicGlyph } from '@devops-platform/ds';
import {
  NoticeStrip,
  SessionControls,
  SessionStatusPill,
  TerminalPane,
  WorkspaceBar,
  WorkspacePanel,
  describeCapacity,
  resolveShellFallbackNotice,
  useResolvedTerminalTheme,
  useTerminalHandoff,
  type PracticeNotice,
} from '../../../components/session';
import { PracticeError, PracticeFrame, PracticeSkeleton } from '../../../components/session/practice-frame';
import { PracticeLaunch } from '../../../components/session/practice-launch';
import { useResumeMachine } from '../../../components/session/use-resume-machine';
import { useWorkspaceTabs } from '../../../components/session/use-workspace-tabs';
import { useCapacity } from '../../../components/shell/use-capacity';
import { tierLabel } from '../../../components/catalog/catalog-labels';
import { topicLook } from '../../../lib/topic-look';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { usePlaygroundSession } from './use-playground-session';

/**
 * Sân chơi: một máy trống, terminal chiếm TRỌN phần còn lại của màn hình.
 *
 * Trang là immersive (không có vỏ ứng dụng), nên `PracticeFrame` tự lấy `h-dvh` rồi chia
 * cho thanh trên + khoang terminal.
 */
export function PlaygroundClient({ playgroundId, userId }: { playgroundId: string; userId: string }): ReactElement {
  const query = api.playgrounds.get.useQuery({ playgroundId });
  const session = usePlaygroundSession(playgroundId, userId);
  const handoff = useTerminalHandoff(session.state.sessionId);
  const capacity = useCapacity();
  const resume = useResumeMachine({
    session,
    belongs: (machine) => machine.content?.kind === 'playground' && machine.content.id === playgroundId,
    handoff: handoff.state,
  });
  const [popupBlocked, setPopupBlocked] = useState(false);

  const me = api.me.get.useQuery({});
  const terminalTheme = useResolvedTerminalTheme(me.data?.preferences.terminalTheme ?? null);

  // TRÊN mọi `return` sớm. Sân chơi không có tab Editor và không có khối `{{exec}}`.
  const tabs = useWorkspaceTabs({ terminal: session.terminal, hasEditor: false, sessionId: session.state.sessionId });

  const onPopOut = useCallback(() => {
    setPopupBlocked(!handoff.popOut());
  }, [handoff]);

  if (query.isPending) return <PracticeSkeleton label={t('session.playground.loading')} />;
  if (query.isError) {
    return (
      <PracticeError
        title={t('session.playground.error-title')}
        message={describeTrpcError(query.error)}
        backHref="/playgrounds"
        backLabel={t('session.playground.back')}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const { playground, profile, unsupportedCapabilities } = query.data;
  const ttlMinutes = Math.round(playground.ttlSeconds / 60);
  const sessionId = session.state.sessionId;
  const look = topicLook({ topic: playground.topic ?? null, id: playground.id });

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
    ...(resume.resumed && sessionId !== null ? [{ id: `resumed:${sessionId}`, tone: 'info' as const, text: t('session.launch.resumed') }] : []),
  ];

  return (
    <PracticeFrame
      bar={
        <WorkspaceBar
          backHref="/playgrounds"
          backLabel={t('session.playground.back')}
          title={playground.title}
          badge={<TopicGlyph topic={look.topic} icon={look.icon} size={22} />}
          controls={
            /* Thời lượng hiện TRƯỚC khi bắt đầu; `profile` từ `playgrounds.get`. */
            <SessionControls
              session={session}
              actions={{ start: session.start, end: session.end, extend: session.extend }}
              ttlSeconds={playground.ttlSeconds}
              capacity={capacity.data}
              profile={profile}
            />
          }
        />
      }
      notices={<NoticeStrip notices={notices} />}
    >
      <WorkspacePanel
        terminal={
          <TerminalPane
            session={session}
            theme={terminalTheme}
            handoff={handoff}
            placeholder={
              <PracticeLaunch
                kind="playground"
                startLabel={t('session.controls.start')}
                onStart={session.start}
                starting={session.starting || resume.pending}
                tierLabel={tierLabel(playground.tier)}
                ttlMinutes={ttlMinutes}
                profile={profile}
                capacity={describeCapacity(capacity.data, profile)}
                otherMachines={resume.others}
                {...(playground.description === null ? {} : { description: playground.description })}
              />
            }
          />
        }
        activeTab={tabs.activeTab}
        onActivate={tabs.onActivate}
        onPopOut={sessionId === null ? null : onPopOut}
        status={<SessionStatusPill phase={session.state.phase} />}
        storageKey="dlp-playground-workspace"
      />
    </PracticeFrame>
  );
}
