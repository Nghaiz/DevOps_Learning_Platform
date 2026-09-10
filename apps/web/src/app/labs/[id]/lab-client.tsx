'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { parseContentBlocks } from '@devops-platform/scenario/content-blocks';
import { err, errText, t } from '@devops-platform/copy';
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
  TaskChecklist,
  TerminalPane,
  WorkspacePanel,
  WorkspaceSplit,
  outcomeKind,
  resolveTaskVisualState,
  useResolvedTerminalTheme,
} from '../../../components/session';
import { useWorkspaceTabs } from '../../../components/session/use-workspace-tabs';
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

/**
 * Nhãn + biến thể badge cho viên trạng thái ở KHUNG CHI TIẾT của nhiệm vụ đang
 * chọn. Danh SÁCH thì không dùng bảng này nữa: nó đã chuyển sang `TaskChecklist`
 * với NĂM trạng thái, trong đó `infra` là trạng thái mà bảng ba giá trị dưới
 * đây không diễn đạt được (16.D.4).
 *
 * Bảng này vẫn còn vì khung chi tiết chỉ nói về trạng thái ĐÃ LƯU của một
 * nhiệm vụ; kết quả lượt chấm hiện thời đã có `CheckResultPanel` ngay bên dưới
 * nó vẽ đủ ba nhánh.
 */
const TASK_STATE_LABEL: Record<TaskCheckState, string> = {
  'not-attempted': t('session.task.state.not-attempted'),
  passed: t('session.task.state.passed'),
  failed: t('session.task.state.failed'),
};

const TASK_STATE_VARIANT: Record<TaskCheckState, BadgeVariant> = {
  'not-attempted': 'secondary',
  passed: 'success',
  failed: 'destructive',
};

const SCORE_TONE_CLASS = {
  neutral: 'border-border bg-card',
  success: 'border-success/30 bg-success/10',
  warning: 'border-warning/30 bg-warning/10',
} as const;

function formatDuration(seconds: number): string {
  return t('session.lab.duration', {
    minutes: Math.floor(seconds / 60),
    seconds: seconds % 60,
  });
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

  /*
    P15 / 15.C (hướng B) — setup của bài chạy NỀN, nên `startAttempt` trả về
    TRƯỚC khi cảnh của bài dựng xong. Không có nhịp hỏi này thì người học nhìn
    một terminal trông như đã sẵn sàng, bấm Chấm, và nhận một lỗi họ không hiểu.

    Dạng HÀM cho `refetchInterval` — cùng lý lẽ `author-edit-client.tsx`: nó phá
    vòng phụ thuộc (options cần trạng thái, trạng thái cần dữ liệu) và không kẹt
    được ở nhịp sai. `'running'` là trạng thái DUY NHẤT còn đổi được, nên ba
    trạng thái kia dừng poll — một lab không khai `setup.background` trả `'ready'`
    ngay lượt đầu và không tốn lượt hỏi nào nữa.
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
        onError: (error) =>
          setSubmitError(errText('session.lab.error.submit', { reason: describeTrpcError(error) })),
      },
    );
  }, [attemptId, labId, submit, utils]);

  /*
    C5 — lab vẫn KHÔNG có tab Editor, nhưng LÝ DO đã đổi ở P16.

    Rào cản kiến trúc đã gỡ: `IdePane` nay sống ở `components/session/` (16.D.3),
    nên lab với tới được nó. Rào cản còn lại là NỘI DUNG, và nó có thật: kiểu
    `Lab` (`packages/shared-types/src/lab.ts`) KHÔNG có trường `interfaceLayout`,
    nên không bài lab nào khai được rằng nó muốn IDE.

    ⛔ Đừng thay bằng `shouldShowIdePane(profile)`. `profile` là profile TÀI
    NGUYÊN (`''` · `ide` · `k8s`), do `profileForCapabilities` tính từ năng lực;
    `interfaceLayout` là một trường nội dung khác hẳn. `ide-layout.ts` đã ghi vì
    sao phép so đó phải trùng byte với phép so ở server: nới tay ⇒ iframe trỏ
    vào một pod không chạy Theia và trắng vĩnh viễn.

    Mở IDE cho lab vì vậy cần một trường trong lược đồ lab cộng một lượt sửa
    server, tức là ngoài phạm vi "chỉ frontend" của P16.
  */
  const tabs = useWorkspaceTabs({
    terminal: session.terminal,
    hasEditor: false,
    sessionId: session.state.sessionId,
  });

  /*
    §Y3 — `onExec(command, interrupt)`, HAI tham số. `ExecOptions`/`ExecTarget`
    bị gỡ cùng terminal thứ hai; exec KHÔNG chuyển tab nữa vì terminal hiện ở cả
    hai tab. Việc giữ `\x03` là một sự kiện bàn phím riêng nằm trong
    `useWorkspaceTabs` — cùng một bản với trang bài học, để `{{exec}}` không
    chạy khác nhau ở hai chỗ.
  */
  const onExec = tabs.exec;

  if (labQuery.isPending) {
    return <LabSkeleton />;
  }
  if (labQuery.isError) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
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

  /*
    P15 / 15.C — "chưa biết" KHÁC "chưa xong".

    `setupQuery.data === undefined` là lượt hỏi đầu chưa về. Đọc nó thành "chưa
    xong" sẽ nháy một banner "đang chuẩn bị" cho MỌI lab, kể cả lab không có
    setup nào; đọc nó thành "xong" sẽ mở nút Chấm trong đúng cửa sổ mà 15.C tồn
    tại để đóng. Nên cả hai vế dưới đây đều hỏi TƯỜNG MINH một trạng thái đã
    biết, và `undefined` không khớp vế nào: không banner, và nút Chấm đợi —
    server vẫn là chốt cuối cùng (`checkTask` tự từ chối).
  */
  const setupData = setupQuery.data ?? null;
  const setupPending = attemptId !== null && setupData?.state !== 'ready';
  const setupNotice = setupData !== null && setupData.state !== 'ready' ? setupData : null;

  const terminalPane = (
    <TerminalPane
      session={session}
      theme={terminalTheme}
      placeholder={
        <span>
          {t('session.terminal.empty')}
        </span>
      }
    />
  );

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

      {/*
        Trạng thái setup chạy nền (P15 / 15.C). `role="status"` cho nhánh đang
        chờ — một cập nhật nhã nhặn; `Alert variant="destructive"` cho nhánh hỏng,
        vì đó là thứ người học phải đọc và phải làm gì đó.
      */}
      {setupNotice !== null && setupNotice.message !== null && (
        setupNotice.state === 'running' ? (
          <div role="status" className="mb-4 rounded-lg border border-border bg-muted px-4 py-3">
            <p className="text-sm text-foreground">{setupNotice.message}</p>
          </div>
        ) : (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription className="text-foreground">{setupNotice.message}</AlertDescription>
          </Alert>
        )
      )}

      {/*
        16.D.4 — danh sách kiểm, không còn `<table>`. Trạng thái nhìn được TÍNH
        tại đây từ hai nguồn đã có (kết quả server đã ghi + lượt chấm của phiên
        này), chứ không lưu thành một trường thứ ba.
      */}
      <TaskChecklist
        items={summary.displays.map((display) => ({
          id: display.task.id,
          title: display.task.title,
          state: resolveTaskVisualState(
            display.state,
            outcomeKind(checkOutcomes[display.task.id] ?? null),
          ),
          weight: summary.weighted ? display.task.weight : null,
        }))}
        selectedId={selected?.task.id ?? null}
        onSelect={setSelectedTaskId}
      />

      {selected !== undefined && (
        <TaskDetail
          display={selected}
          outcome={checkOutcomes[selected.task.id] ?? null}
          canCheck={attemptId !== null && !submitted && !setupPending}
          disabledReason={
            attemptId === null
              ? t('session.lab.blocked-no-session')
              : submitted
                ? t('session.lab.blocked-submitted')
                : // P15 / 15.C — khoá nút là để người học KHÔNG nhận một lượt
                  // chấm sai trên cảnh dựng dở. Câu ở đây nói cùng một điều với
                  // banner ở trên, nhưng nó phải có mặt ở CẢ HAI chỗ: banner
                  // giải thích trạng thái, câu này giải thích vì sao nút xám.
                  //
                  // Nhánh cuối là cửa sổ "CHƯA BIẾT" — lượt `setupStatus` đầu
                  // tiên chưa về. Nút đã xám (`setupPending` đọc `undefined`
                  // theo hướng an toàn), nên thiếu câu này là một nút xám KHÔNG
                  // lời giải thích: trạng thái tệ nhất trong ba, vì người học
                  // không biết là phải chờ hay là đã hỏng.
                  setupPending
                  ? (setupNotice?.message ?? t('session.lab.setup-checking'))
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
            {t('session.lab.submit')}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">{t('session.lab.submit-note')}</p>
        </div>
      )}

      {submitted && attemptData !== undefined && (
        <Card className="mt-6">
          <CardTitle>{summary.headline}</CardTitle>
          <CardDescription>
            {attemptData.durationSeconds !== null
              ? t('session.lab.duration-line', {
                  duration: formatDuration(attemptData.durationSeconds),
                })
              : t('session.lab.duration-unknown')}
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
                {t('session.lab.leaderboard-optin')}
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
          {t('session.lab.back')}
        </Link>
        <h1 className="text-sm font-semibold">{lab.title}</h1>

        <div className="ml-auto">
          {/*
            `profile` tới từ `labs.get` — cùng năng lực mà `startAttempt` đưa cho
            `createSandboxSession`, tức cùng cái pod sắp được tạo. Thiếu nó,
            trang lab Kubernetes (1024Mi, trần 5) in con số của bài thường
            (256Mi, trần 23): prop này TUỲ CHỌN nên chỗ thiếu biên dịch sạch
            trong khi màn hình nói sai — đúng hạng lỗi đã cắn hai PR liên tiếp.
          */}
          <SessionControls
            session={session}
            actions={{ start: session.start, end: session.end, extend: session.extend }}
            capacity={capacity.data ?? null}
            profile={profile}
            startLabel={
            attemptId === null ? t('session.controls.start') : t('session.controls.restart')
          }
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
            {t('session.lab.unsupported', { capabilities: unsupportedCapabilities.join(', ') })}
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
              {errText('session.lab.error.attempt', {
                reason: describeTrpcError(attemptQuery.error),
              })}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void attemptQuery.refetch()}
              loading={attemptQuery.isFetching}
            >
              {t('session.lab.reload')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="min-h-0 flex-1">
        <WorkspaceSplit
          storageKey="dlp-lab-split"
          content={
            lab.leaderboard ? (
              <Tabs defaultValue="tasks" className="flex h-full flex-col">
                <div className="border-b border-border bg-card px-4 py-2">
                  <TabsList>
                    <TabsTrigger value="tasks">
                      {t('session.lab.tasks-tab', { count: lab.tasks.length })}
                    </TabsTrigger>
                    <TabsTrigger value="leaderboard">
                      {t('session.lab.leaderboard-tab')}
                    </TabsTrigger>
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
          side={
            <WorkspacePanel
              /*
                Không truyền `editor`: lab chưa có khoang IDE nào (xem chú thích
                ở `useWorkspaceTabs` phía trên). Vắng prop = panel không vẽ tab
                Editor, và vì khi đó chỉ còn MỘT mục thì nó bỏ luôn thanh
                tablist — một tablist một mục là nhiễu thị giác chứ không phải
                chức năng (§Y4). Nút mở-ra-cửa-sổ-riêng vẫn còn trên thanh.

                ⛔ MỘT node terminal, truyền THẲNG. `terminals` (Map),
                `onAddTerminal`, `onCloseTerminal`, `split` đã biến mất cùng
                terminal thứ hai (§Y4).
              */
              terminal={terminalPane}
              activeTab={tabs.activeTab}
              onActivate={tabs.onActivate}
              popOutUrl={tabs.popOutUrl}
              storageKey="dlp-lab-workspace"
            />
          }
          /* Hẹp: chỉ nội dung + terminal, không thanh tab — cùng quyết định với
             trang bài học, và cùng lý do `TerminalPane` tự đổi thành
             `NarrowScreenNotice` dưới 768px. */
          narrowSide={terminalPane}
        />
      </div>
    </div>
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
  /*
    §Y3 — chữ ký HAI tham số, khớp `ContentViewProps['onExec']`.

    ⚠ Phải sửa ở CẢ HAI chỗ: `useCallback` phía trên VÀ kiểu prop này. Lượt
    trước chỉ sửa một chỗ và nửa còn lại lọt qua im lặng, vì `TaskDetail` chỉ
    chuyển tiếp hàm xuống `ContentView` — không call-site nào trong file gọi nó
    với đủ tham số để TypeScript có chỗ mà kêu.
  */
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
          <summary className="cursor-pointer font-medium">{t('session.lab.hint')}</summary>
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
          {t('session.lab.check-one')}
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
            {t('session.lab.last-exit', { code: display.lastExitCode })}
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
        <span className="sr-only">{t('session.lab.leaderboard-loading')}</span>
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
          title={err('session.lab.error.leaderboard').what}
          message={describeTrpcError(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </div>
    );
  }
  if (query.data.items.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">{t('session.lab.leaderboard-empty')}</p>
    );
  }

  return (
    <div className="p-4">
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
            <TableRow key={row.rank} className={row.isSelf ? 'bg-muted font-medium' : undefined}>
              <TableCell>{row.rank}</TableCell>
              <TableCell>
                {row.displayName ?? (
                  <span className="text-muted-foreground italic">
                    {t('session.lab.leaderboard-anonymous')}
                  </span>
                )}
                {row.isSelf && t('session.lab.leaderboard-self')}
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
      <span className="sr-only">{t('session.lab.loading')}</span>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="min-h-0 flex-1 w-full" />
    </div>
  );
}
