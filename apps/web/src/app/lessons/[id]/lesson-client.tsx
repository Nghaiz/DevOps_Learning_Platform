'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { parseContentBlocks } from '@devops-platform/scenario/content-blocks';
import { errText, t } from '@devops-platform/copy';
import { Button, ContentView, Meter, StepNav, TopicBadge } from '@devops-platform/ui';
import {
  DEFAULT_PROFILE,
  IdePane,
  NoticeStrip,
  SessionControls,
  SessionStatusPill,
  TerminalPane,
  WorkspaceBar,
  WorkspacePanel,
  WorkspaceSplit,
  checkBlockedReason,
  contentViewLabels,
  execBlockedReason,
  resolveShellFallbackNotice,
  shouldShowIdePane,
  stepNavLabels,
  useResolvedTerminalTheme,
  useTerminalHandoff,
  type PracticeNotice,
} from '../../../components/session';
import { useWorkspaceTabs } from '../../../components/session/use-workspace-tabs';
import { lineForTopic } from '../../../lib/topic-line';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { buildPhases, canCheck, phaseKeyForStepIndex } from './phases';
import { summarizeProgress } from './progress';
import { useLessonSession } from './use-lesson-session';
import { CheckResultPanel, type CheckOutcome } from './check-result-panel';

/**
 * Kết quả chấm GẮN VỚI BƯỚC đã chấm (M5).
 *
 * Bản trước giữ MỘT `check` cho cả trang và xoá nó khi đổi bước. Một lượt chấm
 * đang bay mà người học bấm sang bước khác thì kết quả về sau rơi vào bước MỚI:
 * "Đạt" hiện dưới một bước chưa ai làm. Nay khoá theo `phase.key`, và `seq` của
 * từng lượt chặn một lượt cũ về muộn đè lên lượt mới của CÙNG bước.
 */
interface StepCheck {
  readonly seq: number;
  readonly outcome: CheckOutcome;
}

export function LessonClient({ scenarioId }: { readonly scenarioId: string }): ReactElement {
  const utils = api.useUtils();
  const query = api.lessons.get.useQuery({ scenarioId });
  const session = useLessonSession(scenarioId);
  const handoff = useTerminalHandoff(session.state.sessionId);

  const me = api.me.get.useQuery({});
  const terminalTheme = useResolvedTerminalTheme(me.data?.preferences.terminalTheme ?? null);

  // "Còn N chỗ": CHỈ hỏi khi chưa có phiên. Đọc thẳng `data`: chưa biết khác biết là 0.
  const capacity = api.capacity.get.useQuery(
    {},
    { refetchInterval: 15_000, enabled: session.state.sessionId === null },
  );

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [checks, setChecks] = useState<Readonly<Record<string, StepCheck>>>({});
  const checkSeq = useRef(0);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupAttempt, setSetupAttempt] = useState(0);
  const [popupBlocked, setPopupBlocked] = useState(false);
  /**
   * Bước ĐÃ CHẤM ĐẠT trong lượt xem này. ⛔ Không suy dấu ✓ từ `progress.stepIndex`:
   * đó là vị trí hiện tại, không phải bước đã đạt.
   */
  const [passedSteps, setPassedSteps] = useState<ReadonlySet<number>>(new Set());

  const scenario = query.data?.scenario ?? null;
  const phases = useMemo(() => (scenario === null ? [] : buildPhases(scenario)), [scenario]);

  // Mở lại đúng chỗ đang dở, MỘT lần (đặt lại mỗi khi `progress` đổi sẽ kéo người học nhảy bước).
  useEffect(() => {
    if (activeKey === null && phases.length > 0 && query.data !== undefined) {
      setActiveKey(phaseKeyForStepIndex(phases, query.data.progress.stepIndex));
    }
  }, [activeKey, phases, query.data]);

  const active = phases.find((p) => p.key === activeKey) ?? phases[0] ?? null;

  const saveProgress = api.lessons.saveProgress.useMutation({
    onSuccess: () => void utils.lessons.invalidate(),
  });
  const runSetup = api.lessons.runSetup.useMutation();
  const checkStep = api.lessons.checkStep.useMutation();

  const setupDone = useRef(new Set<string>());
  const terminal = session.terminal;
  const sessionId = session.state.sessionId;

  // Hook gọi TRÊN mọi `return` sớm: số hook không được đổi giữa hai lượt render.
  const showIde = shouldShowIdePane(scenario?.interfaceLayout ?? null);
  const tabs = useWorkspaceTabs({ terminal, hasEditor: showIde, sessionId });

  // ── Setup: đúng MỘT lần cho mỗi phase của mỗi phiên, chỉ khi terminal đã nối ──
  useEffect(() => {
    if (active === null || sessionId === null || terminal === null || phases.length === 0) {
      return;
    }
    // ⛔ Phải chuẩn bị phase ĐẦU TIÊN, không chỉ phase đang mở: asset chỉ được
    // đẩy ở phase đầu, và người học quay lại được thả thẳng vào bước đang dở.
    const first = phases[0];
    const needed = first === undefined || first.key === active.key ? [active] : [first, active];

    for (const target of needed) {
      const isFirst = target.key === first?.key;
      if (!isFirst && !target.phase.hasSetup) {
        continue;
      }
      // Khoá gồm cả `sessionId`: cờ của phiên cũ không được sống sót sang pod mới.
      const runKey = `${sessionId}:${target.key}`;
      if (setupDone.current.has(runKey)) {
        continue;
      }
      setupDone.current.add(runKey);

      runSetup.mutate(
        { scenarioId, sessionId, phase: target.ref },
        {
          onSuccess: (result) => {
            setSetupError(null);
            // `foreground` của phase ĐANG MỞ mới gõ vào terminal người học đang nhìn.
            if (result.foreground !== null && target.key === active.key) {
              terminal.sendInput(`${result.foreground}\r`);
            }
          },
          onError: (error) => {
            // ⛔ Setup hỏng PHẢI hiện ra, kèm nút Thử lại.
            setupDone.current.delete(runKey);
            setSetupError(describeTrpcError(error));
          },
        },
      );
    }
    // `runSetup` ngoài deps có chủ ý: danh tính mutation đổi mỗi lượt render.
  }, [active, phases, sessionId, terminal, scenarioId, setupAttempt]);

  const onSelect = useCallback(
    (key: string) => {
      setActiveKey(key);
      const target = phases.find((p) => p.key === key);
      // `saveProgress` chỉ có nghĩa với STEP: intro/finish không nằm trong hệ đếm `stepIndex`.
      if (target?.stepIndex !== null && target?.stepIndex !== undefined) {
        saveProgress.mutate({ scenarioId, stepIndex: target.stepIndex });
      }
    },
    [phases, saveProgress, scenarioId],
  );

  const onCheck = useCallback(() => {
    if (active === null || sessionId === null) {
      return;
    }
    const key = active.key;
    const stepIndex = active.stepIndex;
    checkSeq.current += 1;
    const seq = checkSeq.current;
    const land = (outcome: CheckOutcome): void => {
      // Chỉ lượt MỚI NHẤT của CHÍNH bước này được ghi.
      setChecks((prev) => (prev[key]?.seq === seq ? { ...prev, [key]: { seq, outcome } } : prev));
    };
    setChecks((prev) => ({ ...prev, [key]: { seq, outcome: { kind: 'running' } } }));
    checkStep.mutate(
      { scenarioId, sessionId, phase: active.ref },
      {
        onSuccess: (result) => {
          land({ kind: 'result', passed: result.passed, exitCode: result.exitCode, output: result.output });
          if (result.passed && stepIndex !== null) {
            setPassedSteps((prev) => new Set(prev).add(stepIndex));
          }
          void utils.lessons.invalidate();
        },
        // ⛔ Lỗi hệ thống KHÔNG được hiện thành "bài sai".
        onError: (error) => {
          land({ kind: 'error', message: describeTrpcError(error) });
        },
      },
    );
  }, [active, checkStep, scenarioId, sessionId, utils]);

  const resolveAssetUrl = useCallback(
    (relative: string): string | null => {
      const cleaned = relative.replace(/^\.?\//, '');
      if (!cleaned.startsWith('assets/')) {
        return null;
      }
      return `/api/scenarios/${encodeURIComponent(scenarioId)}/${cleaned}`;
    },
    [scenarioId],
  );

  const onPopOut = useCallback(() => {
    setPopupBlocked(!handoff.popOut());
  }, [handoff]);

  if (query.isPending) {
    return <Centered>{t('session.lesson.loading')}</Centered>;
  }
  if (query.isError) {
    return <Centered tone="error">{describeTrpcError(query.error)}</Centered>;
  }
  if (scenario === null || active === null) {
    return <Centered tone="error">{t('session.lesson.not-found')}</Centered>;
  }

  const line = lineForTopic({ topic: scenario.topic ?? null, id: scenario.id });
  const topicLine = line === 'ink' ? undefined : line;
  const blocks = parseContentBlocks(active.phase.markdown);
  const completed = query.data.progress.status === 'completed';
  const unsupported = query.data.unsupportedCapabilities;
  const phase = session.state.phase;

  // `done` = ĐÃ CHẤM ĐẠT, không phải "đã đi qua".
  const navItems = phases.map((p) => ({
    key: p.key,
    label: p.label,
    done: p.stepIndex === null ? false : completed || passedSteps.has(p.stepIndex),
  }));
  const progress = summarizeProgress({
    stepCount: scenario.steps.length,
    passedInSession: passedSteps.size,
    completed,
  });

  const checkReason = checkBlockedReason({ phase, hasSession: sessionId !== null });
  const execReason = execBlockedReason({
    phase,
    hasSession: sessionId !== null,
    terminalAttached: terminal !== null,
    handoff: handoff.state,
  });
  const activeCheck = checks[active.key]?.outcome ?? null;
  const checking = activeCheck?.kind === 'running';

  const shellNotice = resolveShellFallbackNotice({
    sessionId,
    preferencesApplied: session.preferencesApplied,
    shell: me.data?.preferences.defaultShell ?? null,
  });
  const notices: PracticeNotice[] = [
    ...(session.startError === null ? [] : [{ id: `start:${session.startError}`, tone: 'destructive' as const, text: session.startError }]),
    ...(setupError === null
      ? []
      : [
          {
            id: `setup:${setupError}`,
            tone: 'destructive' as const,
            text: errText('session.lesson.error.setup', { reason: setupError }),
            action: (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSetupError(null);
                  setSetupAttempt((n) => n + 1);
                }}
              >
                {t('session.lesson.retry')}
              </Button>
            ),
          },
        ]),
    // Cảnh báo năng lực BẮT BUỘC hiện: thiếu nó, người học gặp `kubectl: command not found` không lời giải thích.
    ...(unsupported.length > 0
      ? [{ id: 'unsupported', tone: 'warning' as const, text: t('session.lesson.unsupported', { capabilities: unsupported.join(', ') }) }]
      : []),
    ...(shellNotice === null
      ? []
      : [{ id: `shell:${sessionId ?? ''}`, tone: 'warning' as const, text: shellNotice.lines.join(' ') }]),
    ...(popupBlocked ? [{ id: 'popup', tone: 'warning' as const, text: t('session.overlay.popup-blocked') }] : []),
  ];

  const instructions = (
    <div className="h-full overflow-y-auto bg-card text-card-foreground">
      <div className="mx-auto max-w-[68ch] px-5 py-6 md:px-8">
        <StepNav
          items={navItems}
          activeKey={active.key}
          onSelect={onSelect}
          labels={stepNavLabels()}
          {...(topicLine === undefined ? {} : { line: topicLine })}
        >
          <ContentView
            blocks={blocks}
            diagrams={scenario.diagrams}
            resolveAssetUrl={resolveAssetUrl}
            onExec={tabs.exec}
            execEnabled={execReason === null}
            execDisabledReason={execReason}
            labels={contentViewLabels()}
          />
          {canCheck(active) ? (
            <div className="mt-6 border-t-2 border-foreground pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={onCheck} disabled={checkReason !== null || checking} loading={checking}>
                  {t('session.lesson.check')}
                </Button>
                {/* Lý do khoá là CHỮ: nút disabled không nhận focus nên `title` của nó không ai đọc được. */}
                {checkReason !== null && <span className="text-sm text-muted-foreground">{checkReason}</span>}
              </div>
              <CheckResultPanel outcome={activeCheck} />
            </div>
          ) : (
            active.stepIndex !== null && <p className="mt-6 text-sm text-muted-foreground">{t('session.lesson.no-check')}</p>
          )}
        </StepNav>
      </div>
    </div>
  );

  const terminalPane = <TerminalPane session={session} theme={terminalTheme} handoff={handoff} />;

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <WorkspaceBar
        backHref="/lessons"
        backLabel={t('session.lesson.back')}
        title={scenario.title}
        {...(topicLine === undefined ? {} : { badge: <TopicBadge line={topicLine} size="sm" /> })}
        progress={
          <div className="flex flex-col gap-1">
            <span className="truncate font-mono text-[11px] text-chrome-muted">{progress.label}</span>
            <Meter
              value={progress.value}
              max={progress.max}
              segments={Math.max(progress.max, 1)}
              tone={progress.value >= progress.max ? 'success' : (topicLine ?? 'primary')}
              label={t('session.lesson.progress-label')}
            />
          </div>
        }
        controls={
          <SessionControls
            session={session}
            actions={{ start: session.start, end: session.end, extend: session.extend }}
            capacity={capacity.data ?? null}
            profile={query.data?.profile ?? DEFAULT_PROFILE}
          />
        }
      />
      <NoticeStrip notices={notices} />
      <div className="min-h-0 flex-1">
        <WorkspaceSplit
          storageKey={showIde ? 'dlp-lesson-split-ide' : 'dlp-lesson-split'}
          {...(showIde ? { defaultRatio: 0.34 } : {})}
          content={instructions}
          side={
            <WorkspacePanel
              {...(showIde ? { editor: <IdePane sessionId={sessionId} phase={phase} /> } : {})}
              terminal={terminalPane}
              activeTab={tabs.activeTab}
              onActivate={tabs.onActivate}
              onPopOut={sessionId === null ? null : onPopOut}
              status={<SessionStatusPill phase={phase} />}
              storageKey="dlp-lesson-workspace"
            />
          }
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
