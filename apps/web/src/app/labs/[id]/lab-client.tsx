'use client';

import { useCallback, useRef, useState, type ReactElement } from 'react';
import { parseContentBlocks } from '@devops-platform/scenario/content-blocks';
import { err, errText, t } from '@devops-platform/copy';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  ErrorBlock,
  Pill,
  ProgressLine,
  RowsSkeleton,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TopicGlyph,
} from '@devops-platform/ds';
import { ContentView } from '@devops-platform/ds/content';
import {
  IdePane,
  NoticeStrip,
  SessionControls,
  SessionStatusPill,
  TaskChecklist,
  TerminalPane,
  WorkspaceBar,
  WorkspacePanel,
  WorkspaceSplit,
  checkBlockedReason,
  describeCapacity,
  execBlockedReason,
  ideAvailable,
  outcomeKind,
  resolveShellFallbackNotice,
  resolveTaskVisualState,
  useResolvedTerminalTheme,
  useTerminalHandoff,
  type PracticeNotice,
  type SplitFocus,
} from '../../../components/session';
import { PracticeError, PracticeFrame, PracticeSkeleton } from '../../../components/session/practice-frame';
import { PracticeLaunch } from '../../../components/session/practice-launch';
import { contentLabels } from '../../../components/session/practice-labels';
import { useResumeMachine, type ActiveMachine } from '../../../components/session/use-resume-machine';
import { useWorkspaceTabs } from '../../../components/session/use-workspace-tabs';
import { useCapacity } from '../../../components/shell/use-capacity';
import { tierLabel } from '../../../components/catalog/catalog-labels';
import { topicLook } from '../../../lib/topic-look';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { canReconnect } from '../../../lib/use-sandbox-session';
import { useLabSession } from './use-lab-session';
import { CheckResultPanel, type CheckOutcome } from '../../lessons/[id]/check-result-panel';
import { summarizeLabScore } from './score-summary';

/**
 * Trình học LAB: danh sách nhiệm vụ cạnh khoang làm việc, nhiệm vụ đang chọn bung đề +
 * nút chấm + kết quả, điểm tổng ở đầu danh sách.
 *
 * Ba hợp đồng giữ nguyên: khung phiên là `SessionControls` (dùng chung), không có máy
 * trạng thái thứ hai quanh WebSocket (`useLabSession`), mọi nhãn điểm ra từ
 * `summarizeLabScore`.
 *
 * Kết quả chấm khoá theo `lần thử + nhiệm vụ` và mỗi lượt mang `seq`: một lượt đang bay
 * không thể rơi vào nhiệm vụ khác, cũng không rơi vào lần thử mới.
 */
interface TaskCheck {
  readonly seq: number;
  readonly outcome: CheckOutcome;
}

const LABELS = contentLabels();

function formatDuration(seconds: number): string {
  return t('session.lab.duration', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 });
}

export function LabClient({ labId, userId }: { labId: string; userId: string }): ReactElement {
  const utils = api.useUtils();
  const labQuery = api.labs.get.useQuery({ labId });
  const session = useLabSession(labId, userId);
  const attemptId = session.attemptId;
  const handoff = useTerminalHandoff(session.state.sessionId);
  const capacity = useCapacity();

  /*
    Mở lại trang giữa chừng: tra lần thử CHƯA NỘP gắn với máy đang chạy rồi nhận cả hai.
    Lab không ghi `session_origins` (lần thử là sự thật của nó), nên phải đọc
    `labs.listAttempts` để có `attemptId` cho máy tìm thấy trong `me.activeSessions`.
  */
  const recentAttempts = api.labs.listAttempts.useQuery({ labId, limit: 5 });
  const resumable = useCallback(
    (machine: ActiveMachine) =>
      (recentAttempts.data?.items ?? []).find(
        (item) => item.attempt.sessionId === machine.id && item.attempt.submittedAt === null,
      ) ?? null,
    [recentAttempts.data],
  );
  const resume = useResumeMachine({
    session,
    belongs: (machine) => machine.content?.kind === 'lab' && machine.content.id === labId && resumable(machine) !== null,
    ready: !recentAttempts.isPending,
    onAdopt: (machine) => {
      const found = resumable(machine);
      if (found !== null) session.adoptAttempt(found.attempt.id, machine);
    },
    handoff: handoff.state,
  });

  const me = api.me.get.useQuery({});
  const terminalTheme = useResolvedTerminalTheme(me.data?.preferences.terminalTheme ?? null);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [checks, setChecks] = useState<Readonly<Record<string, TaskCheck>>>({});
  const checkSeq = useRef(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [focus, setFocus] = useState<SplitFocus>('both');

  const attemptQuery = api.labs.getAttempt.useQuery({ attemptId: attemptId ?? '' }, { enabled: attemptId !== null });

  /*
    Setup của lab chạy NỀN, nên `startAttempt` trả về TRƯỚC khi cảnh dựng xong.
    `'running'` là trạng thái DUY NHẤT còn đổi được, nên chỉ nó giữ nhịp hỏi.
  */
  const setupQuery = api.labs.setupStatus.useQuery(
    { attemptId: attemptId ?? '' },
    {
      enabled: attemptId !== null,
      refetchInterval: (query) => (query.state.data?.state === 'running' ? 2_000 : false),
    },
  );

  const checkTask = api.labs.checkTask.useMutation();
  const submit = api.labs.submit.useMutation();
  const setDisplayPreference = api.labs.setDisplayPreference.useMutation();

  const onCheckTask = useCallback(
    (taskId: string) => {
      if (attemptId === null) return;
      const key = `${attemptId}:${taskId}`;
      checkSeq.current += 1;
      const seq = checkSeq.current;
      const land = (outcome: CheckOutcome): void => {
        setChecks((prev) => (prev[key]?.seq === seq ? { ...prev, [key]: { seq, outcome } } : prev));
      };
      setChecks((prev) => ({ ...prev, [key]: { seq, outcome: { kind: 'running' } } }));
      checkTask.mutate(
        { labId, attemptId, taskId },
        {
          onSuccess: (result) => {
            land({ kind: 'result', passed: result.passed, exitCode: result.exitCode, output: result.output });
            // Bảng trạng thái VÀ điểm tổng đều suy từ `results` của lần thử.
            void utils.labs.getAttempt.invalidate({ attemptId });
          },
          // ⛔ Lỗi hạ tầng KHÔNG được hiện thành "bài sai".
          onError: (error) => land({ kind: 'error', message: describeTrpcError(error) }),
        },
      );
    },
    [attemptId, labId, checkTask, utils],
  );

  const onSubmit = useCallback(() => {
    if (attemptId === null) return;
    setSubmitError(null);
    submit.mutate(
      { labId, attemptId },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          void utils.labs.invalidate();
        },
        onError: (error) => {
          setConfirmOpen(false);
          setSubmitError(errText('session.lab.error.submit', { reason: describeTrpcError(error) }));
        },
      },
    );
  }, [attemptId, labId, submit, utils]);

  // ⛔ Có IDE hay không đọc từ `profile` của MÁY CHỦ (xem `ideAvailable`).
  const profile = labQuery.data?.profile ?? '';
  const showIde = ideAvailable(profile);
  const tabs = useWorkspaceTabs({ terminal: session.terminal, hasEditor: showIde, sessionId: session.state.sessionId });

  const onPopOut = useCallback(() => {
    setPopupBlocked(!handoff.popOut());
  }, [handoff]);

  const onExec = useCallback(
    (command: string, interrupt: boolean) => {
      setFocus((current) => (current === 'read' ? 'both' : current));
      tabs.exec(command, interrupt);
    },
    [tabs],
  );

  // Ảnh trong đề đi qua cùng route với bài học: bài soạn trên giao diện (kể cả lab) giữ
  // asset ở `content_assets` theo mã nội dung, và route đó phục vụ đúng nguồn ấy.
  const resolveAssetUrl = useCallback(
    (relative: string): string | null => {
      const cleaned = relative.replace(/^\.?\//, '');
      if (!cleaned.startsWith('assets/')) return null;
      return `/api/scenarios/${encodeURIComponent(labId)}/${cleaned}`;
    },
    [labId],
  );

  if (labQuery.isPending) return <PracticeSkeleton label={t('session.lab.loading')} />;
  if (labQuery.isError) {
    return (
      <PracticeError
        title={err('session.lab.error.open').what}
        message={describeTrpcError(labQuery.error)}
        backHref="/labs"
        backLabel={t('session.lab.back')}
        onRetry={() => void labQuery.refetch()}
        retrying={labQuery.isFetching}
      />
    );
  }

  const { lab, unsupportedCapabilities } = labQuery.data;
  const attemptData = attemptQuery.data;
  const sessionId = session.state.sessionId;
  const phase = session.state.phase;
  const look = topicLook({ topic: lab.topic ?? null, id: lab.id });

  const summary = summarizeLabScore({
    lab,
    results: attemptData?.attempt.results ?? [],
    submittedAt: attemptData?.attempt.submittedAt ?? null,
  });
  const submitted = summary.submitted;
  const selected = summary.displays.find((display) => display.task.id === selectedTaskId) ?? summary.displays[0];
  const checkFor = (taskId: string): CheckOutcome | null =>
    attemptId === null ? null : (checks[`${attemptId}:${taskId}`]?.outcome ?? null);

  // "Chưa biết" KHÁC "chưa xong": `undefined` không mở nút Chấm và cũng không nháy banner.
  const setupData = setupQuery.data ?? null;
  const setupPending = attemptId !== null && setupData?.state !== 'ready';
  const setupNotice = setupData !== null && setupData.state !== 'ready' ? setupData : null;

  const phaseReason = checkBlockedReason({ phase, hasSession: sessionId !== null, handoff: handoff.state });
  const checkReason =
    attemptId === null || sessionId === null
      ? t('session.lab.blocked-no-session')
      : submitted
        ? t('session.lab.blocked-submitted')
        : phaseReason !== null
          ? phaseReason
          : setupPending
            ? (setupNotice?.message ?? t('session.lab.setup-checking'))
            : null;
  const execReason = execBlockedReason({ phase, hasSession: sessionId !== null, terminalAttached: session.terminal !== null, handoff: handoff.state });

  const shellNotice = resolveShellFallbackNotice({
    sessionId,
    preferencesApplied: session.preferencesApplied,
    shell: me.data?.preferences.defaultShell ?? null,
  });
  const notices: PracticeNotice[] = [
    ...(session.startError === null ? [] : [{ id: `start:${session.startError}`, tone: 'destructive' as const, text: session.startError }]),
    ...(attemptQuery.isError
      ? [
          {
            id: 'attempt',
            tone: 'destructive' as const,
            text: errText('session.lab.error.attempt', { reason: describeTrpcError(attemptQuery.error) }),
            action: (
              <Button size="sm" variant="secondary" icon="refresh" onClick={() => void attemptQuery.refetch()} loading={attemptQuery.isFetching}>
                {t('session.lab.reload')}
              </Button>
            ),
          },
        ]
      : []),
    ...(setupNotice !== null && setupNotice.message !== null
      ? [
          {
            id: `setup:${setupNotice.state}`,
            tone: setupNotice.state === 'running' ? ('warning' as const) : ('destructive' as const),
            text: setupNotice.message,
          },
        ]
      : []),
    ...(unsupportedCapabilities.length > 0
      ? [{ id: 'unsupported', tone: 'warning' as const, text: t('session.lab.unsupported', { capabilities: unsupportedCapabilities.join(', ') }) }]
      : []),
    ...(shellNotice === null ? [] : [{ id: `shell:${sessionId ?? ''}`, tone: 'warning' as const, text: shellNotice.lines.join(' ') }]),
    ...(popupBlocked ? [{ id: 'popup', tone: 'warning' as const, text: t('session.overlay.popup-blocked') }] : []),
    ...(resume.resumed && sessionId !== null ? [{ id: `resumed:${sessionId}`, tone: 'info' as const, text: t('session.launch.resumed') }] : []),
  ];

  const selectedOutcome = selected === undefined ? null : checkFor(selected.task.id);
  const savedOutcome: CheckOutcome | null =
    selected === undefined || selected.lastExitCode === null || selected.lastOutput === null
      ? null
      : { kind: 'result', passed: selected.state === 'passed', exitCode: selected.lastExitCode, output: selected.lastOutput };

  const taskBody =
    selected === undefined ? null : (
      <div>
        <ContentView
          blocks={parseContentBlocks(selected.task.markdown)}
          leadingTitle={selected.task.title}
          diagrams={lab.diagrams}
          resolveAssetUrl={resolveAssetUrl}
          onExec={onExec}
          execEnabled={execReason === null}
          execDisabledReason={execReason}
          labels={LABELS}
          linksInNewTab
          density="compact"
        />
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
          <Button
            variant="primary"
            icon="target"
            onClick={() => onCheckTask(selected.task.id)}
            disabled={checkReason !== null || selectedOutcome?.kind === 'running'}
            loading={selectedOutcome?.kind === 'running'}
          >
            {t('session.lab.check-one')}
          </Button>
          {/* Lý do khoá là CHỮ: nút disabled không nhận focus. */}
          {checkReason === null ? null : <span className="text-sm text-ink-3">{checkReason}</span>}
        </div>
        {selectedOutcome !== null ? (
          <CheckResultPanel outcome={selectedOutcome} />
        ) : (
          <CheckResultPanel outcome={savedOutcome} caption={t('session.lab.last-check')} />
        )}
      </div>
    );

  const taskPane = (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6">
      {lab.description === null ? null : <p className="max-w-[68ch] text-sm text-ink-2">{lab.description}</p>}

      {/*
        Bảng điểm: MỘT chỗ khẳng định điểm trong cả trang. Một dòng phẳng giữa hai đường kẻ, không
        phải ô số liệu tô nền: màu đạt/chưa đạt nằm ở thước, chữ nói điều thước nói.
      */}
      <div role="status" className="flex flex-col gap-2 border-y border-rule py-3">
        <div className="flex items-baseline gap-3">
          <p className="font-display text-2xl font-semibold tabular-nums text-ink">{summary.score.percent}%</p>
          <p className="text-sm text-ink-2">{t('session.lab.score-label')}</p>
        </div>
        <ProgressLine
          role="meter"
          value={summary.score.percent / 100}
          label={t('session.lab.score-label')}
          tone={summary.tone === 'success' ? 'ok' : summary.tone === 'warning' ? 'warn' : 'acc'}
          size="sm"
        />
        <p className="text-sm font-medium text-ink">{summary.headline}</p>
        {summary.caveat === null ? null : <p className="text-xs text-ink-2">{summary.caveat}</p>}
      </div>

      <TaskChecklist
        items={summary.displays.map((display) => ({
          id: display.task.id,
          title: display.task.title,
          state: resolveTaskVisualState(display.state, outcomeKind(checkFor(display.task.id))),
          weight: summary.weighted ? display.task.weight : null,
        }))}
        selectedId={selected?.task.id ?? null}
        onSelect={setSelectedTaskId}
      >
        {taskBody}
      </TaskChecklist>

      {attemptId !== null && !submitted ? (
        <div className="flex flex-col gap-2 border-t border-rule pt-4">
          {submitError === null ? null : <p className="text-sm text-bad-ink">{submitError}</p>}
          <div>
            <Button variant="ink" icon="send" onClick={() => setConfirmOpen(true)} loading={submit.isPending}>
              {t('session.lab.submit')}
            </Button>
          </div>
          <p className="text-xs text-ink-3">{t('session.lab.submit-note')}</p>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={t('session.lab.submit-confirm-title')}
            body={`${t('session.lab.submit-confirm-body', { percent: summary.score.percent })}${
              summary.uncheckedCount > 0 ? ` ${t('session.lab.submit-confirm-unchecked', { count: summary.uncheckedCount })}` : ''
            }`}
            confirmLabel={t('session.lab.submit')}
            cancelLabel={t('session.lab.submit-cancel')}
            tone="primary"
            confirming={submit.isPending}
            onConfirm={onSubmit}
          />
        </div>
      ) : null}

      {submitted && attemptData !== undefined ? (
        <div className="flex flex-col gap-2 border-t border-rule pt-4">
          <p className="font-display text-lg font-semibold text-ink">{summary.headline}</p>
          <p className="text-sm text-ink-2">
            {attemptData.durationSeconds !== null
              ? t('session.lab.duration-line', { duration: formatDuration(attemptData.durationSeconds) })
              : t('session.lab.duration-unknown')}
          </p>
          {lab.leaderboard ? (
            <div className="pt-2">
              <Checkbox
                id="dlp-lab-leaderboard-optin"
                checked={attemptData.attempt.displayNamePublic}
                disabled={setDisplayPreference.isPending}
                label={t('session.lab.leaderboard-optin')}
                onCheckedChange={(next) => {
                  const attempt = attemptId;
                  if (attempt === null) return;
                  setDisplayPreference.mutate(
                    { attemptId: attempt, displayNamePublic: next === true },
                    { onSuccess: () => void utils.labs.getAttempt.invalidate({ attemptId: attempt }) },
                  );
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  /*
    Nút "Mở máy mới" của lớp phủ terminal, ở lab, là một LẦN THỬ mới: điểm về 0% và lần
    thử đang dở không nộp được từ trang nữa. Nên nó mang nhãn "Làm lại", và hỏi lại khi
    còn một lần thử chưa nộp. Đã nộp thì không mất gì, bấm là làm lại luôn.
  */
  const requestRestart = (): void => {
    if (attemptId === null || submitted) session.start();
    else setRestartConfirmOpen(true);
  };
  const restartAttempt = attemptId === null ? undefined : { label: t('session.controls.restart'), onSelect: requestRestart };

  const content = (
    <div className="relative h-full overflow-y-auto bg-paper focus-visible:-outline-offset-2">
      {lab.leaderboard ? (
        <Tabs defaultValue="tasks" className="flex flex-col">
          <div className="sticky top-0 z-10 border-b border-rule bg-paper px-4 md:px-6">
            <TabsList>
              <TabsTrigger value="tasks" icon="target">
                {t('session.lab.tasks-tab', { count: lab.tasks.length })}
              </TabsTrigger>
              <TabsTrigger value="leaderboard" icon="award">
                {t('session.lab.leaderboard-tab')}
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="tasks" className="mt-0">
            {taskPane}
          </TabsContent>
          <TabsContent value="leaderboard" className="mt-0">
            <LeaderboardPanel labId={labId} />
          </TabsContent>
        </Tabs>
      ) : (
        taskPane
      )}
    </div>
  );

  const launch = (
    <PracticeLaunch
      kind="lab"
      startLabel={attemptId === null ? t('session.controls.start') : t('session.controls.restart')}
      onStart={requestRestart}
      starting={session.starting || resume.pending}
      tierLabel={tierLabel(lab.tier)}
      profile={profile}
      capacity={describeCapacity(capacity.data, profile)}
      otherMachines={resume.others}
    />
  );

  return (
    <PracticeFrame
      bar={
        <WorkspaceBar
          backHref="/labs"
          backLabel={t('session.lab.back')}
          title={lab.title}
          badge={<TopicGlyph topic={look.topic} icon={look.icon} size={22} />}
          progress={
            <ProgressLine
              value={summary.taskCount === 0 ? 0 : summary.passedCount / summary.taskCount}
              label={t('session.lab.progress-label')}
              caption={t('session.lab.progress-caption', { passed: summary.passedCount, total: summary.taskCount })}
              size="xs"
            />
          }
          controls={
            /* `profile` từ `labs.get`: cùng năng lực mà `startAttempt` đưa cho pod sắp tạo. */
            <SessionControls
              session={session}
              actions={{ start: session.start, end: session.end, extend: session.extend }}
              capacity={capacity.data}
              profile={profile}
            />
          }
        />
      }
      notices={<NoticeStrip notices={notices} />}
    >
      <WorkspaceSplit
        storageKey={showIde ? 'dlp-lab-split-ide' : 'dlp-lab-split'}
        defaultRatio={showIde ? 0.36 : 0.42}
        focus={focus}
        onFocusChange={setFocus}
        content={content}
        side={
          <WorkspacePanel
            {...(showIde
              ? {
                  editor: (
                    <IdePane
                      sessionId={sessionId}
                      phase={phase}
                      sessionGone={phase === 'expired' || (phase === 'error' && !canReconnect(session.state))}
                    />
                  ),
                }
              : {})}
            terminal={
              <TerminalPane
                session={session}
                theme={terminalTheme}
                handoff={handoff}
                placeholder={launch}
                {...(restartAttempt === undefined ? {} : { newSession: restartAttempt })}
              />
            }
            activeTab={tabs.activeTab}
            onActivate={tabs.onActivate}
            onPopOut={sessionId === null ? null : onPopOut}
            status={<SessionStatusPill phase={phase} />}
            storageKey="dlp-lab-workspace"
          />
        }
      />
      <ConfirmDialog
        open={restartConfirmOpen}
        onOpenChange={setRestartConfirmOpen}
        title={t('session.lab.restart-confirm-title')}
        body={t('session.lab.restart-confirm-body', { percent: summary.score.percent })}
        confirmLabel={t('session.controls.restart')}
        cancelLabel={t('session.lab.restart-cancel')}
        tone="danger"
        onConfirm={() => {
          setRestartConfirmOpen(false);
          session.start();
        }}
      />
    </PracticeFrame>
  );
}

function LeaderboardPanel({ labId }: { labId: string }): ReactElement {
  const query = api.labs.leaderboard.useQuery({ labId });

  if (query.isPending) {
    return (
      <div className="p-6">
        <RowsSkeleton rows={3} label={t('session.lab.leaderboard-loading')} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="p-6">
        <ErrorBlock
          title={err('session.lab.error.leaderboard').what}
          retryLabel={t('common.action.retry')}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        >
          {describeTrpcError(query.error)}
        </ErrorBlock>
      </div>
    );
  }
  if (query.data.items.length === 0) {
    return <p className="p-6 text-sm text-ink-3">{t('session.lab.leaderboard-empty')}</p>;
  }

  return (
    <div className="p-4 md:p-6">
      <p className="pb-3 text-sm text-ink-3">{t('session.lab.leaderboard-caption')}</p>
      <Table label={t('session.lab.leaderboard-tab')}>
        <THead>
          <tr>
            <TH className="w-10">{t('session.lab.col-rank')}</TH>
            <TH>{t('session.lab.col-learner')}</TH>
            <TH numeric className="w-20">
              {t('session.lab.col-score')}
            </TH>
            <TH numeric className="w-32">
              {t('session.lab.col-time')}
            </TH>
          </tr>
        </THead>
        <TBody>
          {query.data.items.map((row) => (
            <TR key={row.rank} className={row.isSelf ? 'bg-acc-wash' : undefined}>
              <TD className="tabular-nums text-ink-2">{row.rank}</TD>
              <TD>
                {row.displayName ?? <span className="text-ink-3">{t('session.lab.leaderboard-anonymous')}</span>}
                {row.isSelf ? (
                  <Pill tone="acc" className="ml-2">
                    {t('session.lab.leaderboard-self')}
                  </Pill>
                ) : null}
              </TD>
              <TD numeric className="font-medium">
                {row.percent}%
              </TD>
              <TD numeric className="text-ink-2">
                {formatDuration(row.durationSeconds)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
