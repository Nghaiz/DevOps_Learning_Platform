'use client';

import { useCallback, useRef, useState, type ReactElement } from 'react';
import { parseContentBlocks } from '@devops-platform/scenario/content-blocks';
import { err, errText, t } from '@devops-platform/copy';
import {
  Button,
  Checkbox,
  ContentView,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  ErrorState,
  Label,
  Meter,
  Skeleton,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TopicBadge,
  cn,
} from '@devops-platform/ui';
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
  contentViewLabels,
  execBlockedReason,
  outcomeKind,
  resolveShellFallbackNotice,
  resolveTaskVisualState,
  shouldShowIdePane,
  useResolvedTerminalTheme,
  useTerminalHandoff,
  type PracticeNotice,
} from '../../../components/session';
import { useWorkspaceTabs } from '../../../components/session/use-workspace-tabs';
import { lineForTopic } from '../../../lib/topic-line';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { useLabSession } from './use-lab-session';
import { CheckResultPanel, type CheckOutcome } from '../../lessons/[id]/check-result-panel';
import { summarizeLabScore } from './score-summary';

/**
 * Trình học LAB, kiểu KodeKloud: tuyến dọc các nhiệm vụ cạnh khoang làm việc,
 * nhiệm vụ đang chọn bung đề + nút chấm + kết quả, điểm tổng trên thanh trên.
 *
 * Ba hợp đồng giữ nguyên: khung phiên là `SessionControls` (dùng chung), không
 * có máy trạng thái thứ hai quanh WebSocket (`useLabSession`), mọi nhãn điểm ra
 * từ `summarizeLabScore`.
 *
 * Kết quả chấm khoá theo `lần thử + nhiệm vụ` và mỗi lượt mang `seq` (M6): một
 * lượt đang bay không thể rơi vào nhiệm vụ khác, cũng không rơi vào lần thử mới.
 */
interface TaskCheck {
  readonly seq: number;
  readonly outcome: CheckOutcome;
}

function formatDuration(seconds: number): string {
  return t('session.lab.duration', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 });
}

export function LabClient({ labId, userId }: { labId: string; userId: string }): ReactElement {
  const utils = api.useUtils();
  const labQuery = api.labs.get.useQuery({ labId });
  const session = useLabSession(labId, userId);
  const attemptId = session.attemptId;
  const handoff = useTerminalHandoff(session.state.sessionId);

  const me = api.me.get.useQuery({});
  const terminalTheme = useResolvedTerminalTheme(me.data?.preferences.terminalTheme ?? null);

  const capacity = api.capacity.get.useQuery(
    {},
    { refetchInterval: 15_000, enabled: session.state.sessionId === null },
  );

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [checks, setChecks] = useState<Readonly<Record<string, TaskCheck>>>({});
  const checkSeq = useRef(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);

  const attemptQuery = api.labs.getAttempt.useQuery(
    { attemptId: attemptId ?? '' },
    { enabled: attemptId !== null },
  );

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
      if (attemptId === null) {
        return;
      }
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
          onError: (error) => {
            land({ kind: 'error', message: describeTrpcError(error) });
          },
        },
      );
    },
    [attemptId, labId, checkTask, utils],
  );

  const onSubmit = useCallback(() => {
    if (attemptId === null) {
      return;
    }
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

  // ⛔ `interfaceLayout` (trường nội dung), KHÔNG `profile` (profile tài nguyên).
  const showIde = shouldShowIdePane(labQuery.data?.lab.interfaceLayout ?? null);
  const tabs = useWorkspaceTabs({
    terminal: session.terminal,
    hasEditor: showIde,
    sessionId: session.state.sessionId,
  });

  const onPopOut = useCallback(() => {
    setPopupBlocked(!handoff.popOut());
  }, [handoff]);

  if (labQuery.isPending) {
    return <LabSkeleton />;
  }
  if (labQuery.isError) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background p-6">
        <ErrorState
          title={err('session.lab.error.open').what}
          message={describeTrpcError(labQuery.error)}
          onRetry={() => void labQuery.refetch()}
          retrying={labQuery.isFetching}
          className="max-w-lg"
        />
      </div>
    );
  }

  const { lab, profile, unsupportedCapabilities } = labQuery.data;
  const attemptData = attemptQuery.data;
  const sessionId = session.state.sessionId;
  const phase = session.state.phase;
  const line = lineForTopic({ topic: lab.topic ?? null, id: lab.id });
  const topicLine = line === 'ink' ? undefined : line;

  const summary = summarizeLabScore({
    lab,
    results: attemptData?.attempt.results ?? [],
    submittedAt: attemptData?.attempt.submittedAt ?? null,
  });
  const submitted = summary.submitted;
  const selected =
    summary.displays.find((display) => display.task.id === selectedTaskId) ?? summary.displays[0];
  const checkFor = (taskId: string): CheckOutcome | null =>
    attemptId === null ? null : (checks[`${attemptId}:${taskId}`]?.outcome ?? null);

  // "Chưa biết" KHÁC "chưa xong": `undefined` không mở nút Chấm và cũng không nháy banner.
  const setupData = setupQuery.data ?? null;
  const setupPending = attemptId !== null && setupData?.state !== 'ready';
  const setupNotice = setupData !== null && setupData.state !== 'ready' ? setupData : null;

  const phaseReason = checkBlockedReason({ phase, hasSession: sessionId !== null });
  const checkReason =
    attemptId === null
      ? t('session.lab.blocked-no-session')
      : submitted
        ? t('session.lab.blocked-submitted')
        : phaseReason !== null
          ? phaseReason
          : setupPending
            ? (setupNotice?.message ?? t('session.lab.setup-checking'))
            : null;
  const execReason = execBlockedReason({
    phase,
    hasSession: sessionId !== null,
    terminalAttached: session.terminal !== null,
    handoff: handoff.state,
  });

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
              <Button size="sm" variant="secondary" onClick={() => void attemptQuery.refetch()} loading={attemptQuery.isFetching}>
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
  ];

  const selectedOutcome = selected === undefined ? null : checkFor(selected.task.id);
  const savedOutcome: CheckOutcome | null =
    selected === undefined || selected.lastExitCode === null || selected.lastOutput === null
      ? null
      : { kind: 'result', passed: selected.state === 'passed', exitCode: selected.lastExitCode, output: selected.lastOutput };

  const taskBody =
    selected === undefined ? null : (
      <div className="px-2">
        <ContentView
          blocks={parseContentBlocks(selected.task.markdown)}
          leadingTitle={selected.task.title}
          diagrams={lab.diagrams}
          resolveAssetUrl={() => null}
          onExec={tabs.exec}
          execEnabled={execReason === null}
          execDisabledReason={execReason}
          labels={contentViewLabels()}
        />
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t-2 border-foreground pt-4">
          <Button
            onClick={() => onCheckTask(selected.task.id)}
            disabled={checkReason !== null || selectedOutcome?.kind === 'running'}
            loading={selectedOutcome?.kind === 'running'}
          >
            {t('session.lab.check-one')}
          </Button>
          {/* Lý do khoá là CHỮ: nút disabled không nhận focus. */}
          {checkReason !== null && <span className="text-sm text-muted-foreground">{checkReason}</span>}
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
      {lab.description !== null && <p className="max-w-[68ch] text-sm text-muted-foreground">{lab.description}</p>}

      {/* Bảng điểm: MỘT chỗ khẳng định điểm trong cả trang. */}
      <div role="status" className={cn('border-2 border-foreground p-4', summary.tone === 'success' && 'bg-success/10')}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-3xl font-extrabold tabular-nums">{summary.score.percent}%</p>
          <p className="font-mono text-xs text-muted-foreground">{t('session.lab.score-label')}</p>
        </div>
        <Meter
          className="mt-2"
          value={summary.score.percent}
          max={100}
          tone={summary.tone === 'success' ? 'success' : summary.tone === 'warning' ? 'warning' : (topicLine ?? 'primary')}
          label={t('session.lab.score-label')}
        />
        <p className="mt-3 text-sm font-medium text-foreground">{summary.headline}</p>
        {summary.caveat !== null && <p className="mt-1 text-xs text-muted-foreground">{summary.caveat}</p>}
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
        {...(topicLine === undefined ? {} : { line: topicLine })}
      >
        {taskBody}
      </TaskChecklist>

      {attemptId !== null && !submitted && (
        <div className="border-t border-border pt-4">
          {submitError !== null && <p className="mb-3 text-sm text-destructive">{submitError}</p>}
          <Button variant="ink" onClick={() => setConfirmOpen(true)} loading={submit.isPending}>
            {t('session.lab.submit')}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">{t('session.lab.submit-note')}</p>
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent>
              <DialogTitle>{t('session.lab.submit-confirm-title')}</DialogTitle>
              <DialogDescription>
                {t('session.lab.submit-confirm-body', { percent: summary.score.percent })}
                {summary.uncheckedCount > 0 && ` ${t('session.lab.submit-confirm-unchecked', { count: summary.uncheckedCount })}`}
              </DialogDescription>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t('session.lab.submit-cancel')}</Button>
                </DialogClose>
                <Button onClick={onSubmit} loading={submit.isPending}>
                  {t('session.lab.submit')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {submitted && attemptData !== undefined && (
        <div className="border-t-4 border-foreground pt-4">
          <p className="type-title">{summary.headline}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {attemptData.durationSeconds !== null
              ? t('session.lab.duration-line', { duration: formatDuration(attemptData.durationSeconds) })
              : t('session.lab.duration-unknown')}
          </p>
          {lab.leaderboard && (
            <div className="mt-4 flex items-center gap-2">
              <Checkbox
                id="dlp-lab-leaderboard-optin"
                checked={attemptData.attempt.displayNamePublic}
                disabled={setDisplayPreference.isPending}
                onCheckedChange={(next) => {
                  const attempt = attemptId;
                  if (attempt === null) {
                    return;
                  }
                  setDisplayPreference.mutate(
                    { attemptId: attempt, displayNamePublic: next === true },
                    { onSuccess: () => void utils.labs.getAttempt.invalidate({ attemptId: attempt }) },
                  );
                }}
              />
              <Label htmlFor="dlp-lab-leaderboard-optin" className="font-normal">
                {t('session.lab.leaderboard-optin')}
              </Label>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const content = (
    <div className="h-full overflow-y-auto bg-card text-card-foreground">
      {lab.leaderboard ? (
        <Tabs defaultValue="tasks" className="flex flex-col">
          <div className="sticky top-0 z-10 border-b border-border bg-card px-4 py-2 md:px-6">
            <TabsList>
              <TabsTrigger value="tasks">{t('session.lab.tasks-tab', { count: lab.tasks.length })}</TabsTrigger>
              <TabsTrigger value="leaderboard">{t('session.lab.leaderboard-tab')}</TabsTrigger>
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

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <WorkspaceBar
        backHref="/labs"
        backLabel={t('session.lab.back')}
        title={lab.title}
        {...(topicLine === undefined ? {} : { badge: <TopicBadge line={topicLine} size="sm" /> })}
        progress={
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] text-chrome-muted tabular-nums">
              {summary.passedCount}/{summary.taskCount} · {summary.score.percent}%
            </span>
            <Meter
              value={summary.passedCount}
              max={summary.taskCount}
              segments={summary.taskCount}
              tone={topicLine ?? 'primary'}
              label={t('session.lab.score-label')}
            />
          </div>
        }
        controls={
          /* `profile` từ `labs.get`: cùng năng lực mà `startAttempt` đưa cho pod sắp tạo. */
          <SessionControls
            session={session}
            actions={{ start: session.start, end: session.end, extend: session.extend }}
            capacity={capacity.data ?? null}
            profile={profile}
            startLabel={attemptId === null ? t('session.controls.start') : t('session.controls.restart')}
          />
        }
      />
      <NoticeStrip notices={notices} />
      <div className="min-h-0 flex-1">
        <WorkspaceSplit
          storageKey={showIde ? 'dlp-lab-split-ide' : 'dlp-lab-split'}
          {...(showIde ? { defaultRatio: 0.36 } : {})}
          content={content}
          side={
            <WorkspacePanel
              {...(showIde ? { editor: <IdePane sessionId={sessionId} phase={phase} /> } : {})}
              terminal={<TerminalPane session={session} theme={terminalTheme} handoff={handoff} />}
              activeTab={tabs.activeTab}
              onActivate={tabs.onActivate}
              onPopOut={sessionId === null ? null : onPopOut}
              status={<SessionStatusPill phase={phase} />}
              storageKey="dlp-lab-workspace"
            />
          }
        />
      </div>
    </div>
  );
}

function LeaderboardPanel({ labId }: { labId: string }): ReactElement {
  const query = api.labs.leaderboard.useQuery({ labId });

  if (query.isPending) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-2 p-6">
        <span className="sr-only">{t('session.lab.leaderboard-loading')}</span>
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="p-6">
        <ErrorState
          title={err('session.lab.error.leaderboard').what}
          message={describeTrpcError(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </div>
    );
  }
  if (query.data.items.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">{t('session.lab.leaderboard-empty')}</p>;
  }

  return (
    <div className="overflow-x-auto p-4 md:p-6">
      <Table>
        <TableCaption>{t('session.lab.leaderboard-caption')}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">{t('session.lab.col-rank')}</TableHead>
            <TableHead>{t('session.lab.col-learner')}</TableHead>
            <TableHead className="w-20 text-right">{t('session.lab.col-score')}</TableHead>
            <TableHead className="w-32 text-right">{t('session.lab.col-time')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.data.items.map((row) => (
            <TableRow key={row.rank} className={row.isSelf ? 'bg-signal text-signal-foreground' : undefined}>
              <TableCell className="font-mono tabular-nums">{row.rank}</TableCell>
              <TableCell>
                {row.displayName ?? <span className="text-muted-foreground">{t('session.lab.leaderboard-anonymous')}</span>}
                {row.isSelf && t('session.lab.leaderboard-self')}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{row.percent}%</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatDuration(row.durationSeconds)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LabSkeleton(): ReactElement {
  return (
    <div role="status" aria-busy="true" className="flex h-dvh flex-col bg-background">
      <span className="sr-only">{t('session.lab.loading')}</span>
      <div className="h-12 shrink-0 bg-chrome" />
      <div className="flex min-h-0 flex-1 gap-4 p-6">
        <div className="flex w-2/5 flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
        <Skeleton className="min-h-0 flex-1" />
      </div>
    </div>
  );
}
