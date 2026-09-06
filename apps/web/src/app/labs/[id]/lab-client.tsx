'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { parseContentBlocks } from '@devops-platform/scenario/content-blocks';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  Checkbox,
  ContentView,
  ErrorState,
  Label,
  Skeleton,
  SplitPane,
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
  type BadgeVariant,
} from '@devops-platform/ui';
import {
  SessionControls,
  ShellFallbackNotice,
  TerminalPane,
  useResolvedTerminalTheme,
} from '../../../components/session';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { useLabSession } from './use-lab-session';
import { CheckResultPanel, type CheckOutcome } from '../../lessons/[id]/check-result-panel';
import { summarizeLabScore } from './score-summary';
import type { TaskCheckState, TaskDisplay } from './task-status';

/**
 * Trình học LAB (13.D task 13) — bảng nhiệm vụ cạnh terminal, chấm từng nhiệm
 * vụ, trạng thái từng nhiệm vụ, điểm tổng **tính lúc hiển thị**.
 *
 * Ba thứ ở file này là hợp đồng, không phải lựa chọn giao diện:
 *
 * 1. **Khung phiên là của C5** (`components/session`, item 16). Bắt đầu / Kết
 *    thúc / Thêm giờ, đồng hồ TTL, cảnh báo `hardCap`, câu lý do phiên chết,
 *    "còn N chỗ" — tất cả sống ở `SessionControls`. Trước đây trang này chép
 *    tay cả khối đó và bản chép đã lệch: nó thiếu tooltip giải thích vì sao nút
 *    "Thêm giờ" bị khoá, nên người học chỉ thấy một nút chết.
 * 2. **Không có máy trạng thái thứ hai quanh WebSocket.** Vòng đời phiên sống ở
 *    `session-machine.ts` (`packages/terminal`) đi qua `useSandboxSession` →
 *    `useLabSession`. Đây là hàng rủi ro số 2 của bảng Risk P13.
 * 3. **Mọi nhãn điểm ra từ `summarizeLabScore`** — hàm thuần có test. Xem
 *    `score-summary.ts` để biết bẫy P2 lặp lại ở lab dưới hình dạng nào.
 */

const TASK_STATE_LABEL: Record<TaskCheckState, string> = {
  'not-attempted': 'Chưa chấm',
  passed: 'Đạt',
  failed: 'Chưa đạt',
};

/**
 * `failed` dùng `warning` chứ KHÔNG dùng `destructive` — cùng lý lẽ đã ghi ở
 * `CheckResultPanel`: một nhiệm vụ chưa đạt là kết quả bình thường của một lượt
 * chấm, không phải lỗi hệ thống. Tô nó đỏ như lỗi làm người học đọc một bài
 * đang làm dở thành một trang hỏng.
 */
const TASK_STATE_VARIANT: Record<TaskCheckState, BadgeVariant> = {
  'not-attempted': 'secondary',
  passed: 'success',
  failed: 'warning',
};

const SCORE_TONE_CLASS = {
  neutral: 'border-border bg-card',
  success: 'border-success/30 bg-success/10',
  warning: 'border-warning/30 bg-warning/10',
} as const;

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

  // Theme terminal: tuỳ chọn hồ sơ thắng, không có thì đi theo theme ứng dụng
  // (C1/D2) — cùng khuôn `lessons/[id]`.
  const me = api.me.get.useQuery({});
  const terminalTheme = useResolvedTerminalTheme(me.data?.preferences.terminalTheme ?? null);

  /*
    "Còn N chỗ" (C5). CHỈ hỏi khi chưa có phiên: sau khi phiên mở, con số không
    quyết định gì nữa và một nhịp poll 15s trên mọi tab lab đang mở là tải thừa.
    KHÔNG lưu vào state — `SessionControls` đọc thẳng `data`, vì "chưa biết"
    (`undefined`) khác "biết là 0" (xem `describeCapacity`).
  */
  const capacity = api.capacity.get.useQuery(
    {},
    { refetchInterval: 15_000, enabled: session.state.sessionId === null },
  );

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
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
            // Nạp lại lần thử: bảng trạng thái VÀ điểm tổng đều suy từ mảng
            // `results` này, nên một lượt invalidate cập nhật cả hai cùng nhịp.
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
      // `exec-interrupt` = Ctrl+C rồi mới tới lệnh (contract Killercoda). Gửi
      // `\x03` riêng chứ không nối vào chuỗi: chúng là hai sự kiện bàn phím.
      if (interrupt) {
        terminal.sendInput('\x03');
      }
      terminal.sendInput(`${command}\r`);
      terminal.focus();
    },
    [session.terminal],
  );

  if (labQuery.isPending) {
    return <LabSkeleton />;
  }
  if (labQuery.isError) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <ErrorState
          title="Không mở được lab này"
          message={describeTrpcError(labQuery.error)}
          onRetry={() => void labQuery.refetch()}
          retrying={labQuery.isFetching}
          className="max-w-lg"
        />
      </div>
    );
  }

  const { lab, unsupportedCapabilities } = labQuery.data;
  const attemptData = attemptQuery.data;

  /*
    Điểm + mọi nhãn ra từ MỘT lượt suy trên MỘT mảng (`score-summary.ts`).
    `attemptData === undefined` (chưa bắt đầu lần thử nào) vẫn suy được: mảng
    rỗng cho "0/N nhiệm vụ", đúng thứ ta biết — chứ không phải một ô trống.
  */
  const summary = summarizeLabScore({
    lab,
    results: attemptData?.attempt.results ?? [],
    submittedAt: attemptData?.attempt.submittedAt ?? null,
  });
  const submitted = summary.submitted;

  const selected =
    summary.displays.find((display) => display.task.id === selectedTaskId) ?? summary.displays[0];

  const taskPane = (
    <div className="flex h-full flex-col overflow-y-auto bg-background px-4 py-4">
      {lab.description !== null && (
        <p className="mb-4 text-sm text-muted-foreground">{lab.description}</p>
      )}

      {/*
        Bảng điểm — MỘT chỗ duy nhất khẳng định điểm trong cả trang. Hai chỗ
        (một ở thanh đầu trang, một ở đây) là hai chỗ để lệch nhau giữa lúc
        `getAttempt` đang được nạp lại.
      */}
      <div
        role="status"
        className={`mb-4 rounded-lg border px-4 py-3 ${SCORE_TONE_CLASS[summary.tone]}`}
      >
        <p className="text-sm font-medium text-foreground">{summary.headline}</p>
        {summary.caveat !== null && (
          <p className="mt-1 text-xs text-muted-foreground">{summary.caveat}</p>
        )}
      </div>

      <TaskTable
        displays={summary.displays}
        weighted={summary.weighted}
        selectedTaskId={selected?.task.id ?? null}
        onSelect={setSelectedTaskId}
      />

      {selected !== undefined && (
        <TaskDetail
          display={selected}
          outcome={checkOutcomes[selected.task.id] ?? null}
          canCheck={attemptId !== null && !submitted}
          disabledReason={
            attemptId === null
              ? 'Hãy bấm Bắt đầu ở trên để dựng sandbox trước khi chấm.'
              : submitted
                ? 'Lần thử này đã nộp — không chấm lại được. Bấm Bắt đầu để mở lần thử mới.'
                : null
          }
          onCheck={() => {
            onCheckTask(selected.task.id);
          }}
          onExec={onExec}
          execEnabled={session.terminal !== null}
        />
      )}

      {attemptId !== null && !submitted && (
        <div className="mt-6 border-t border-border pt-4">
          {submitError !== null && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription className="text-foreground">{submitError}</AlertDescription>
            </Alert>
          )}
          <Button onClick={onSubmit} loading={submit.isPending}>
            Nộp bài
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Nộp bài chốt điểm từ các lượt chấm đã có — nó KHÔNG chạy lại lượt chấm nào.
          </p>
        </div>
      )}

      {submitted && attemptData !== undefined && (
        <Card className="mt-6">
          <CardTitle>{summary.headline}</CardTitle>
          <CardDescription>
            {attemptData.durationSeconds !== null
              ? `Thời gian làm bài: ${formatDuration(attemptData.durationSeconds)}.`
              : 'Chưa tính được thời gian làm bài cho lần thử này.'}
          </CardDescription>
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
                    {
                      onSuccess: () =>
                        void utils.labs.getAttempt.invalidate({ attemptId: attempt }),
                    },
                  );
                }}
              />
              <Label htmlFor="dlp-lab-leaderboard-optin" className="font-normal">
                Hiện tên tôi trên bảng xếp hạng (mặc định ẨN DANH)
              </Label>
            </div>
          )}
        </Card>
      )}
    </div>
  );

  // Gốc trang KHÔNG mang `h-screen`/`min-h-screen`: vỏ ứng dụng đã dựng
  // `<main class="flex min-h-0 flex-1 flex-col">` BÊN DƯỚI một thanh đầu trang,
  // nên 100vh ở đây cao hơn phần còn lại đúng bằng chiều cao thanh đó và đẻ ra
  // một thanh cuộn thừa trên mọi trang có terminal. Và KHÔNG có `<main>` ở đây:
  // vỏ sở hữu landmark đó (C6bis) — hai `<main>` lồng nhau làm axe của 13.H đỏ.
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
        <Link href="/labs" className="text-sm text-muted-foreground hover:text-foreground">
          ← Lab
        </Link>
        <h1 className="text-sm font-semibold">{lab.title}</h1>

        <div className="ml-auto">
          <SessionControls
            session={session}
            actions={{ start: session.start, end: session.end, extend: session.extend }}
            capacity={capacity.data ?? null}
            startLabel={attemptId === null ? 'Bắt đầu' : 'Làm lại'}
          />
        </div>
      </header>

      {/*
        Cảnh báo năng lực — BẮT BUỘC hiện (2.B §2.2). Bỏ nó đi thì người học mở
        một lab CKAD và gặp `kubectl: command not found` mà không có lời giải
        thích nào, và một đánh đổi đã cân nhắc trở thành một lỗi im lặng.
      */}
      {unsupportedCapabilities.length > 0 && (
        <Alert variant="warning" className="rounded-none border-x-0 border-t-0">
          <AlertDescription className="text-foreground">
            Lab này cần <strong>{unsupportedCapabilities.join(', ')}</strong> — nền tảng chưa chạy
            được những năng lực đó, nên một số lệnh trong lab sẽ báo lỗi. Bạn vẫn mở được để đọc
            nội dung và làm các nhiệm vụ còn lại.
          </AlertDescription>
        </Alert>
      )}

      {session.startError !== null && (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
          <AlertDescription className="text-foreground">{session.startError}</AlertDescription>
        </Alert>
      )}

      {/*
        D7 — `preferencesApplied` là thứ DUY NHẤT nói cho người học biết phiên
        này bỏ qua shell họ đã chọn. Không có băng này, đường "cold" (pool cạn,
        pod chưa cấp lúc start trả lời) im lặng đưa họ về shell mặc định của máy.
      */}
      <ShellFallbackNotice
        sessionId={session.state.sessionId}
        preferencesApplied={session.preferencesApplied}
        shell={me.data?.preferences.defaultShell ?? null}
      />

      {attemptQuery.isError && (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
          <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
            <span>
              Không đọc được kết quả lần thử này: {describeTrpcError(attemptQuery.error)} — bảng
              nhiệm vụ bên dưới đang hiện trạng thái cũ.
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void attemptQuery.refetch()}
              loading={attemptQuery.isFetching}
            >
              Tải lại
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="min-h-0 flex-1">
        <SplitPane
          storageKey="dlp-lab-split"
          left={
            lab.leaderboard ? (
              <Tabs defaultValue="tasks" className="flex h-full flex-col">
                <div className="border-b border-border bg-card px-4 py-2">
                  <TabsList>
                    <TabsTrigger value="tasks">Nhiệm vụ ({lab.tasks.length})</TabsTrigger>
                    <TabsTrigger value="leaderboard">Bảng xếp hạng</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="tasks" className="mt-0 min-h-0 flex-1">
                  {taskPane}
                </TabsContent>
                <TabsContent value="leaderboard" className="mt-0 min-h-0 flex-1 overflow-y-auto">
                  <LeaderboardPanel labId={labId} />
                </TabsContent>
              </Tabs>
            ) : (
              taskPane
            )
          }
          right={
            <TerminalPane
              session={session}
              theme={terminalTheme}
              placeholder={
                <span>
                  Bấm <span className="font-semibold text-foreground">Bắt đầu</span> để dựng sandbox
                  và mở terminal.
                </span>
              }
            />
          }
        />
      </div>
    </div>
  );
}

/**
 * Bảng nhiệm vụ (task 13: *"bảng task bên cạnh terminal"*).
 *
 * Ô tiêu đề là một `<button>` thật chứ không phải `onClick` trên `<tr>`: một
 * hàng bấm được mà không focus được là một hàng người dùng bàn phím không mở
 * được, và đó là một ô AC của 13.H chứ không phải một chi tiết đẹp-xấu.
 */
function TaskTable({
  displays,
  weighted,
  selectedTaskId,
  onSelect,
}: {
  displays: readonly TaskDisplay[];
  weighted: boolean;
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
}): React.ReactElement {
  return (
    <Table>
      <TableCaption>Bấm một nhiệm vụ để đọc đề và chấm riêng nhiệm vụ đó.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Nhiệm vụ</TableHead>
          {/* Cột trọng số chỉ hiện khi nó THÊM thông tin — xem `score-summary.ts`. */}
          {weighted && <TableHead className="w-24 text-right">Trọng số</TableHead>}
          <TableHead className="w-28">Trạng thái</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {displays.map((display, index) => {
          const isSelected = display.task.id === selectedTaskId;
          return (
            <TableRow key={display.task.id} className={isSelected ? 'bg-muted' : undefined}>
              <TableCell className="text-muted-foreground">{index + 1}</TableCell>
              <TableCell>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(display.task.id);
                  }}
                  aria-current={isSelected ? 'true' : undefined}
                  className="w-full rounded text-left text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {display.task.title}
                </button>
              </TableCell>
              {weighted && (
                <TableCell className="text-right text-muted-foreground">
                  {display.task.weight}
                </TableCell>
              )}
              <TableCell>
                <Badge variant={TASK_STATE_VARIANT[display.state]}>
                  {TASK_STATE_LABEL[display.state]}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Đề bài + gợi ý + nút chấm của MỘT nhiệm vụ đang chọn. */
function TaskDetail({
  display,
  outcome,
  canCheck,
  disabledReason,
  onCheck,
  onExec,
  execEnabled,
}: {
  display: TaskDisplay;
  outcome: CheckOutcome | null;
  canCheck: boolean;
  disabledReason: string | null;
  onCheck: () => void;
  onExec: (command: string, interrupt: boolean) => void;
  execEnabled: boolean;
}): React.ReactElement {
  return (
    <section className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">{display.task.title}</h2>
        <Badge variant={TASK_STATE_VARIANT[display.state]}>
          {TASK_STATE_LABEL[display.state]}
        </Badge>
      </div>

      <ContentView
        blocks={parseContentBlocks(display.task.markdown)}
        resolveAssetUrl={() => null}
        onExec={onExec}
        execEnabled={execEnabled}
      />

      {display.task.hint !== null && (
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium">Gợi ý</summary>
          <p className="mt-1">{display.task.hint}</p>
        </details>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={onCheck}
          disabled={!canCheck}
          loading={outcome?.kind === 'running'}
        >
          Chấm nhiệm vụ này
        </Button>
        {/*
          Lý do bị khoá hiện thành CHỮ, không chỉ `title`: một nút disabled không
          nhận focus nên tooltip/`title` của nó là thứ người dùng bàn phím không
          đọc được bằng cách nào cả.
        */}
        {disabledReason !== null && (
          <span className="text-xs text-muted-foreground">{disabledReason}</span>
        )}
        {/*
          `outcome === null` (KHÔNG phải `undefined`): nơi gọi truyền
          `checkOutcomes[id] ?? null`, nên `undefined` không bao giờ tới đây và
          điều kiện cũ làm dòng này chết hẳn — nhắc "lần chấm gần nhất" của một
          phiên trước sẽ không bao giờ hiện. `tsc` không bắt được vì cả hai đều
          là phép so sánh hợp lệ trên `CheckOutcome | null`.
        */}
        {display.lastExitCode !== null && outcome === null && (
          <span className="text-xs text-muted-foreground">
            Lần chấm gần nhất kết thúc với exit {display.lastExitCode}.
          </span>
        )}
      </div>

      <CheckResultPanel outcome={outcome} />
    </section>
  );
}

function LeaderboardPanel({ labId }: { labId: string }): React.ReactElement {
  const query = api.labs.leaderboard.useQuery({ labId });

  if (query.isPending) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-2 p-4">
        <span className="sr-only">Đang tải bảng xếp hạng…</span>
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="p-4">
        <ErrorState
          title="Không tải được bảng xếp hạng"
          message={describeTrpcError(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </div>
    );
  }
  if (query.data.items.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Chưa có ai nộp bài lab này. Nộp bài xong, bạn sẽ là người đầu tiên trên bảng.
      </p>
    );
  }

  return (
    <div className="p-4">
      <Table>
        <TableCaption>
          Chỉ hiện tên của người đã tự bật — mặc định là ẩn danh.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Người học</TableHead>
            <TableHead className="w-20 text-right">Điểm</TableHead>
            <TableHead className="w-32 text-right">Thời gian</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.data.items.map((row) => (
            <TableRow key={row.rank} className={row.isSelf ? 'bg-muted font-medium' : undefined}>
              <TableCell>{row.rank}</TableCell>
              <TableCell>
                {row.displayName ?? <span className="text-muted-foreground italic">Ẩn danh</span>}
                {row.isSelf && ' (bạn)'}
              </TableCell>
              <TableCell className="text-right">{row.percent}%</TableCell>
              <TableCell className="text-right">{formatDuration(row.durationSeconds)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LabSkeleton(): React.ReactElement {
  return (
    <div role="status" aria-busy="true" className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <span className="sr-only">Đang tải lab…</span>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="min-h-0 flex-1 w-full" />
    </div>
  );
}
