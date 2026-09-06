'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { parseContentBlocks } from '@devops-platform/scenario/content-blocks';
import { DEFAULT_THEME } from '@devops-platform/terminal';
import { Button, Card, CardDescription, CardTitle, ContentView, SplitPane } from '@devops-platform/ui';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { useLabSession } from './use-lab-session';
import { CheckResultPanel, type CheckOutcome } from '../../lessons/[id]/check-result-panel';
import { buildTaskDisplays, uncheckedTaskCount, type TaskCheckState } from './task-status';

/**
 * ⛔ `ssr: false` phải nằm trong một CLIENT component — cùng lý lẽ đã ghi ở
 * `lessons/[id]/lesson-client.tsx` và `(session)/session/session-client.tsx`.
 */
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

const TASK_STATE_LABEL: Record<TaskCheckState, string> = {
  'not-attempted': 'Chưa làm',
  passed: 'Đạt',
  failed: 'Chưa đạt',
};

const TASK_STATE_CLASS: Record<TaskCheckState, string> = {
  'not-attempted': 'bg-slate-100 text-slate-600',
  passed: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-amber-100 text-amber-800',
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m)} phút ${String(s)} giây`;
}

export function LabClient({ labId, userId }: { labId: string; userId: string }): React.ReactElement {
  const utils = api.useUtils();
  const labQuery = api.labs.get.useQuery({ labId });
  const session = useLabSession(labId, userId);
  const attemptId = session.attemptId;

  const [tab, setTab] = useState<'tasks' | 'leaderboard'>('tasks');
  const [checkOutcomes, setCheckOutcomes] = useState<Record<string, CheckOutcome>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const attemptQuery = api.labs.getAttempt.useQuery(
    { attemptId: attemptId ?? '' },
    { enabled: attemptId !== null },
  );

  const checkTask = api.labs.checkTask.useMutation();
  const submit = api.labs.submit.useMutation();
  const setDisplayPreference = api.labs.setDisplayPreference.useMutation();

  const onCheckTask = useCallback(
    (taskId: string) => {
      if (attemptId === null) {
        return;
      }
      setCheckOutcomes((prev) => ({ ...prev, [taskId]: { kind: 'running' } }));
      checkTask.mutate(
        { labId, attemptId, taskId },
        {
          onSuccess: (result) => {
            setCheckOutcomes((prev) => ({
              ...prev,
              [taskId]: {
                kind: 'result',
                passed: result.passed,
                exitCode: result.exitCode,
                output: result.output,
              },
            }));
            void utils.labs.getAttempt.invalidate({ attemptId });
          },
          // ⛔ Lỗi hạ tầng (phiên hết hạn, pod bị thu hồi, apiserver trục trặc)
          // KHÔNG được hiện thành "bài sai" — cùng kỷ luật `lesson-client.tsx`.
          onError: (error) => {
            setCheckOutcomes((prev) => ({
              ...prev,
              [taskId]: { kind: 'error', message: describeTrpcError(error) },
            }));
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
        onSuccess: () => void utils.labs.invalidate(),
        onError: (error) => setSubmitError(describeTrpcError(error)),
      },
    );
  }, [attemptId, labId, submit, utils]);

  const onExec = useCallback(
    (command: string, interrupt: boolean) => {
      const terminal = session.terminal;
      if (terminal === null) {
        return;
      }
      if (interrupt) {
        terminal.sendInput('\x03');
      }
      terminal.sendInput(`${command}\r`);
      terminal.focus();
    },
    [session.terminal],
  );

  if (labQuery.isPending) {
    return <Centered>Đang tải lab…</Centered>;
  }
  if (labQuery.isError) {
    return <Centered tone="error">{describeTrpcError(labQuery.error)}</Centered>;
  }

  const { lab, unsupportedCapabilities } = labQuery.data;
  const attemptData = attemptQuery.data;
  const results = attemptData?.attempt.results ?? [];
  const taskDisplays = buildTaskDisplays(lab, results);
  const unchecked = uncheckedTaskCount(taskDisplays);
  const submitted = attemptData?.attempt.submittedAt !== null && attemptData !== undefined;

  // Gốc trang KHÔNG mang `h-screen`/`min-h-screen`: vỏ ứng dụng đã dựng
  // `<main class="flex min-h-0 flex-1 flex-col">` BÊN DƯỚI một thanh đầu trang,
  // nên 100vh ở đây cao hơn phần còn lại đúng bằng chiều cao thanh đó và đẻ ra
  // một thanh cuộn thừa trên mọi trang có terminal. `flex-1 min-h-0` lấy đúng
  // phần còn lại — không con số nào phải khớp tay với chiều cao thanh đầu trang.
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2">
        <Link href="/labs" className="text-sm text-slate-500 hover:text-slate-900">
          ← Lab
        </Link>
        <h1 className="text-sm font-semibold">{lab.title}</h1>

        {attemptData !== undefined && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              attemptData.status === 'passed'
                ? 'bg-emerald-100 text-emerald-800'
                : attemptData.status === 'failed'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            {attemptData.score.percent}% —{' '}
            {attemptData.status === 'passed'
              ? 'Đạt'
              : attemptData.status === 'failed'
                ? 'Chưa đạt'
                : 'Đang làm'}
          </span>
        )}

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
                      ? 'Đã dùng hết thời lượng tối đa cho phiên này — hãy kết thúc và mở lần thử mới.'
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
          Lab này cần <strong>{unsupportedCapabilities.join(', ')}</strong> — nền tảng chưa chạy
          được những năng lực đó, nên một số lệnh trong lab sẽ báo lỗi. Bạn vẫn mở được để đọc
          nội dung.
        </div>
      )}

      {session.startError !== null && (
        <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {session.startError}
        </div>
      )}

      <div className="border-b border-slate-200 px-4 py-2">
        <div className="flex gap-2">
          <TabButton active={tab === 'tasks'} onClick={() => setTab('tasks')}>
            Nhiệm vụ ({lab.tasks.length})
          </TabButton>
          {lab.leaderboard && (
            <TabButton active={tab === 'leaderboard'} onClick={() => setTab('leaderboard')}>
              Bảng xếp hạng
            </TabButton>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <SplitPane
          storageKey="dlp-lab-split"
          left={
            tab === 'leaderboard' ? (
              <LeaderboardPanel labId={labId} />
            ) : (
              <div className="flex h-full flex-col overflow-y-auto px-4 py-4">
                {lab.description !== null && (
                  <p className="mb-4 text-sm text-slate-600">{lab.description}</p>
                )}

                <ul className="flex flex-col gap-3">
                  {taskDisplays.map(({ task, state, lastExitCode }) => (
                    <li key={task.id}>
                      <details className="rounded-lg border border-slate-200 bg-white" open>
                        <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                          <span>{task.title}</span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${TASK_STATE_CLASS[state]}`}
                          >
                            {TASK_STATE_LABEL[state]}
                          </span>
                        </summary>
                        <div className="border-t border-slate-200 px-4 py-3">
                          <ContentView
                            blocks={parseContentBlocks(task.markdown)}
                            resolveAssetUrl={() => null}
                            onExec={onExec}
                            execEnabled={session.terminal !== null}
                          />
                          {task.hint !== null && (
                            <details className="mt-3 text-xs text-slate-500">
                              <summary className="cursor-pointer font-medium">Gợi ý</summary>
                              <p className="mt-1">{task.hint}</p>
                            </details>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <Button
                              variant="secondary"
                              onClick={() => onCheckTask(task.id)}
                              disabled={
                                attemptId === null ||
                                submitted ||
                                checkOutcomes[task.id]?.kind === 'running'
                              }
                              title={
                                attemptId === null
                                  ? 'Hãy bắt đầu phiên trước'
                                  : submitted
                                    ? 'Lần thử này đã nộp — không chấm lại được'
                                    : undefined
                              }
                            >
                              {checkOutcomes[task.id]?.kind === 'running' ? 'Đang chấm…' : 'Chấm'}
                            </Button>
                            {lastExitCode !== null && checkOutcomes[task.id] === undefined && (
                              <span className="text-xs text-slate-500">
                                Lần chấm gần nhất: exit {lastExitCode}
                              </span>
                            )}
                          </div>
                          <CheckResultPanel outcome={checkOutcomes[task.id] ?? null} />
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>

                {attemptId !== null && !submitted && (
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    {unchecked > 0 && (
                      <p role="status" className="mb-2 text-xs text-amber-700">
                        Còn {unchecked} nhiệm vụ chưa được chấm lần nào — nếu nộp bây giờ, các
                        nhiệm vụ đó tính là chưa đạt.
                      </p>
                    )}
                    {submitError !== null && (
                      <p role="alert" className="mb-2 text-xs text-red-700">
                        {submitError}
                      </p>
                    )}
                    <Button onClick={onSubmit} disabled={submit.isPending}>
                      {submit.isPending ? 'Đang nộp…' : 'Nộp bài'}
                    </Button>
                  </div>
                )}

                {submitted && attemptData !== undefined && (
                  <Card className="mt-4">
                    <CardTitle>
                      {attemptData.status === 'passed' ? 'Đạt' : 'Chưa đạt'} —{' '}
                      {attemptData.score.percent}% (mốc {lab.passThresholdPercent}%)
                    </CardTitle>
                    <CardDescription>
                      {attemptData.durationSeconds !== null &&
                        `Thời gian làm bài: ${formatDuration(attemptData.durationSeconds)}.`}
                    </CardDescription>
                    {lab.leaderboard && (
                      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={attemptData.attempt.displayNamePublic}
                          disabled={setDisplayPreference.isPending}
                          onChange={(event) => {
                            const attempt = attemptId;
                            if (attempt === null) {
                              return;
                            }
                            setDisplayPreference.mutate(
                              { attemptId: attempt, displayNamePublic: event.target.checked },
                              { onSuccess: () => void utils.labs.getAttempt.invalidate({ attemptId: attempt }) },
                            );
                          }}
                        />
                        Hiện tên tôi trên bảng xếp hạng (mặc định ẨN DANH)
                      </label>
                    )}
                  </Card>
                )}
              </div>
            )
          }
          right={
            session.state.sessionId === null ? (
              <div className="flex h-full items-center justify-center bg-slate-950 px-6 text-center text-sm text-slate-400">
                Bấm <span className="mx-1 font-semibold text-slate-200">Bắt đầu</span> để dựng
                sandbox và mở terminal.
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
            )
          }
        />
      </div>
    </div>
  );
}

function LeaderboardPanel({ labId }: { labId: string }): React.ReactElement {
  const query = api.labs.leaderboard.useQuery({ labId });

  if (query.isPending) {
    return <p className="p-4 text-sm text-slate-500">Đang tải bảng xếp hạng…</p>;
  }
  if (query.isError) {
    return (
      <p role="alert" className="p-4 text-sm text-red-700">
        {describeTrpcError(query.error)}
      </p>
    );
  }
  if (query.data.items.length === 0) {
    return <p className="p-4 text-sm text-slate-500">Chưa có ai nộp bài lab này.</p>;
  }

  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs text-slate-500">
            <th className="py-1 pr-3">#</th>
            <th className="py-1 pr-3">Người học</th>
            <th className="py-1 pr-3">Điểm</th>
            <th className="py-1 pr-3">Thời gian</th>
          </tr>
        </thead>
        <tbody>
          {query.data.items.map((row) => (
            <tr
              key={row.rank}
              className={row.isSelf ? 'bg-slate-100 font-medium' : undefined}
            >
              <td className="py-1 pr-3">{row.rank}</td>
              <td className="py-1 pr-3">
                {row.displayName ?? <span className="italic text-slate-400">Ẩn danh</span>}
                {row.isSelf && ' (bạn)'}
              </td>
              <td className="py-1 pr-3">{row.percent}%</td>
              <td className="py-1 pr-3">{formatDuration(row.durationSeconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
        active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function Centered({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'error';
}): React.ReactElement {
  // `flex-1 min-h-0` chứ không `min-h-screen`: căn giữa theo phần vỏ chừa lại,
  // không theo cả màn hình (xem chú thích ở gốc trang).
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6">
      <p className={tone === 'error' ? 'text-sm text-red-700' : 'text-sm text-slate-500'}>
        {children}
      </p>
    </div>
  );
}
