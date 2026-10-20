'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { parseContentBlocks } from '@devops-platform/scenario/content-blocks';
import { errText, t } from '@devops-platform/copy';
import { Button, ProgressLine, StepStrip, TopicGlyph, type StepItem } from '@devops-platform/ds';
import { ContentView } from '@devops-platform/ds/content';
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
  describeCapacity,
  execBlockedReason,
  ideAvailable,
  resolveShellFallbackNotice,
  useResolvedTerminalTheme,
  useTerminalHandoff,
  type PracticeNotice,
  type SplitFocus,
} from '../../../components/session';
import { PracticeError, PracticeFrame, PracticeSkeleton } from '../../../components/session/practice-frame';
import { PracticeLaunch } from '../../../components/session/practice-launch';
import { contentLabels } from '../../../components/session/practice-labels';
import { useResumeMachine } from '../../../components/session/use-resume-machine';
import { useWorkspaceTabs } from '../../../components/session/use-workspace-tabs';
import { useCapacity } from '../../../components/shell/use-capacity';
import { tierLabel } from '../../../components/catalog/catalog-labels';
import { topicLook } from '../../../lib/topic-look';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { canReconnect } from '../../../lib/use-sandbox-session';
import { buildPhases, canCheck, phaseKeyForStepIndex, type LessonPhase } from './phases';
import { summarizeProgress } from './progress';
import { useLessonSession } from './use-lesson-session';
import { CheckResultPanel, type CheckOutcome } from './check-result-panel';

/**
 * Kết quả chấm GẮN VỚI BƯỚC đã chấm. Một lượt chấm đang bay mà người học bấm sang bước
 * khác thì kết quả về sau KHÔNG được rơi vào bước mới: khoá theo `phase.key`, và `seq`
 * của từng lượt chặn một lượt cũ về muộn đè lên lượt mới của CÙNG bước.
 */
interface StepCheck {
  readonly seq: number;
  readonly outcome: CheckOutcome;
}

/** Trạng thái chuẩn bị môi trường của MỘT bước trong MỘT phiên. */
type SetupState = 'running' | 'done' | 'failed';

const LABELS = contentLabels();

export function LessonClient({ scenarioId }: { readonly scenarioId: string }): ReactElement {
  const utils = api.useUtils();
  const query = api.lessons.get.useQuery({ scenarioId });
  const session = useLessonSession(scenarioId);
  const handoff = useTerminalHandoff(session.state.sessionId);
  const capacity = useCapacity();
  const resume = useResumeMachine({
    session,
    belongs: (machine) => machine.content?.kind === 'lesson' && machine.content.id === scenarioId,
    handoff: handoff.state,
  });

  const me = api.me.get.useQuery({});
  const terminalTheme = useResolvedTerminalTheme(me.data?.preferences.terminalTheme ?? null);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [checks, setChecks] = useState<Readonly<Record<string, StepCheck>>>({});
  const checkSeq = useRef(0);
  const [setup, setSetup] = useState<Readonly<Record<string, SetupState>>>({});
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupAttempt, setSetupAttempt] = useState(0);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [focus, setFocus] = useState<SplitFocus>('both');
  /**
   * Bước ĐÃ CHẤM ĐẠT trong lượt xem này. ⛔ Không suy dấu xong từ `progress.stepIndex`:
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

  const setupStarted = useRef(new Set<string>());
  const terminal = session.terminal;
  const sessionId = session.state.sessionId;

  // Hook gọi TRÊN mọi `return` sớm: số hook không được đổi giữa hai lượt render.
  // ⛔ Có IDE hay không đọc từ `profile` của MÁY CHỦ, không từ `interfaceLayout`: profile
  // là thứ quyết định pod có chạy Theia không. Lệch nhau là một iframe trắng mãi mãi.
  const profile = query.data?.profile ?? DEFAULT_PROFILE;
  const showIde = ideAvailable(profile);
  const tabs = useWorkspaceTabs({ terminal, hasEditor: showIde, sessionId });

  /*
    Terminal đã giao sang cửa sổ riêng thì trang thả kết nối, nên `terminal` ở đây là
    `null` cho tới khi người học lấy về. Chờ nó như ca thường là setup của phase đầu
    không bao giờ chạy. `background` chạy ở máy chủ nên không cần terminal của trang;
    chỉ cần phiên còn pod.
  */
  const setupWithoutTerminal = handoff.state !== 'here' && canReconnect(session.state);

  // Bước cần chuẩn bị cho bước đang mở: bước ĐẦU (đẩy asset) và chính bước đang mở.
  const neededSetup = useMemo((): readonly LessonPhase[] => {
    if (active === null) return [];
    const first = phases[0];
    const needed = first === undefined || first.key === active.key ? [active] : [first, active];
    return needed.filter((target) => target.key === first?.key || target.phase.hasSetup);
  }, [active, phases]);

  // ── Setup: đúng MỘT lần cho mỗi phase của mỗi phiên, khi terminal đã nối (hoặc đã giao đi) ──
  useEffect(() => {
    // ⛔ Ca thường vẫn CHỜ terminal: chạy setup trước khi chunk xterm kịp gắn là
    // `foreground` của intro rơi mất, vì lúc lượt gọi về thì chưa có gì để gõ vào.
    if (active === null || sessionId === null || (terminal === null && !setupWithoutTerminal)) return;

    for (const target of neededSetup) {
      // Khoá gồm cả `sessionId`: cờ của phiên cũ không được sống sót sang pod mới.
      const runKey = `${sessionId}:${target.key}`;
      if (setupStarted.current.has(runKey)) continue;
      setupStarted.current.add(runKey);
      setSetup((prev) => ({ ...prev, [runKey]: 'running' }));

      runSetup.mutate(
        { scenarioId, sessionId, phase: target.ref },
        {
          onSuccess: (result) => {
            setSetupError(null);
            setSetup((prev) => ({ ...prev, [runKey]: 'done' }));
            // `foreground` của phase ĐANG MỞ mới gõ vào terminal người học đang nhìn. Terminal
            // ở cửa sổ riêng ⇒ không gõ: gõ lúc lấy terminal về là gõ một lệnh cũ vào giữa việc đang làm.
            if (result.foreground !== null && target.key === active.key && terminal !== null) {
              terminal.sendInput(`${result.foreground}\r`);
            }
          },
          onError: (error) => {
            // ⛔ Setup hỏng PHẢI hiện ra, kèm nút Thử lại, và khoá nút Kiểm tra.
            setupStarted.current.delete(runKey);
            setSetup((prev) => ({ ...prev, [runKey]: 'failed' }));
            setSetupError(describeTrpcError(error));
          },
        },
      );
    }
    // `runSetup` ngoài deps có chủ ý: danh tính mutation đổi mỗi lượt render.
  }, [active, neededSetup, sessionId, terminal, setupWithoutTerminal, scenarioId, setupAttempt]);

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
    if (active === null || sessionId === null) return;
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
          if (result.passed && stepIndex !== null) setPassedSteps((prev) => new Set(prev).add(stepIndex));
          void utils.lessons.invalidate();
        },
        // ⛔ Lỗi hệ thống KHÔNG được hiện thành "bài sai".
        onError: (error) => land({ kind: 'error', message: describeTrpcError(error) }),
      },
    );
  }, [active, checkStep, scenarioId, sessionId, utils]);

  const resolveAssetUrl = useCallback(
    (relative: string): string | null => {
      const cleaned = relative.replace(/^\.?\//, '');
      if (!cleaned.startsWith('assets/')) return null;
      return `/api/scenarios/${encodeURIComponent(scenarioId)}/${cleaned}`;
    },
    [scenarioId],
  );

  const onPopOut = useCallback(() => {
    setPopupBlocked(!handoff.popOut());
  }, [handoff]);

  // Bấm Chạy khi đang phóng to khoang bài (màn hẹp) thì mở lại cả hai: lệnh chạy ở
  // terminal, người học cần thấy nó chạy mà không mất chỗ đang đọc.
  const onExec = useCallback(
    (command: string, interrupt: boolean) => {
      setFocus((current) => (current === 'read' ? 'both' : current));
      tabs.exec(command, interrupt);
    },
    [tabs],
  );

  if (query.isPending) return <PracticeSkeleton label={t('session.lesson.loading')} />;
  if (query.isError) {
    return (
      <PracticeError
        title={t('session.lesson.not-found')}
        message={describeTrpcError(query.error)}
        backHref="/lessons"
        backLabel={t('session.lesson.back')}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  if (scenario === null || active === null) {
    return (
      <PracticeError
        title={t('session.lesson.not-found')}
        message={t('session.lesson.not-found')}
        backHref="/lessons"
        backLabel={t('session.lesson.back')}
      />
    );
  }

  const look = topicLook({ topic: scenario.topic ?? null, id: scenario.id });
  const blocks = parseContentBlocks(active.phase.markdown);
  const completed = query.data.progress.status === 'completed';
  const unsupported = query.data.unsupportedCapabilities;
  const phase = session.state.phase;
  const activeIndex = phases.findIndex((p) => p.key === active.key);
  const prev = activeIndex > 0 ? phases[activeIndex - 1] : undefined;
  const next = activeIndex >= 0 && activeIndex < phases.length - 1 ? phases[activeIndex + 1] : undefined;

  // `done` = ĐÃ CHẤM ĐẠT, không phải "đã đi qua".
  const steps: StepItem[] = phases.map((p) => ({
    key: p.key,
    label: p.label,
    state: p.stepIndex !== null && (completed || passedSteps.has(p.stepIndex)) ? 'done' : p.key === active.key ? 'current' : 'todo',
  }));
  const progress = summarizeProgress({ stepCount: scenario.steps.length, passedInSession: passedSteps.size, completed });

  const setupFor = (key: string): SetupState | undefined => (sessionId === null ? undefined : setup[`${sessionId}:${key}`]);
  const setupStates = neededSetup.map((target) => setupFor(target.key));
  const setupReason = setupStates.includes('failed')
    ? t('session.check.blocked-setup-failed')
    : setupStates.includes('running')
      ? t('session.check.blocked-setup')
      : null;
  const phaseReason = checkBlockedReason({ phase, hasSession: sessionId !== null, handoff: handoff.state });
  const checkReason = phaseReason ?? setupReason;
  const execReason = execBlockedReason({ phase, hasSession: sessionId !== null, terminalAttached: terminal !== null, handoff: handoff.state });
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
                icon="refresh"
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
    ...(shellNotice === null ? [] : [{ id: `shell:${sessionId ?? ''}`, tone: 'warning' as const, text: shellNotice.lines.join(' ') }]),
    ...(popupBlocked ? [{ id: 'popup', tone: 'warning' as const, text: t('session.overlay.popup-blocked') }] : []),
    ...(resume.resumed && sessionId !== null ? [{ id: `resumed:${sessionId}`, tone: 'info' as const, text: t('session.launch.resumed') }] : []),
  ];

  const instructions = (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <div className="shrink-0 border-b border-rule px-3 py-2">
        <StepStrip steps={steps} activeKey={active.key} onSelect={onSelect} label={t('session.steps.list')} />
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto focus-visible:-outline-offset-2">
        <article className="mx-auto max-w-[70ch] px-5 py-6 md:px-8">
          <h2 className="mb-4 font-display text-2xl font-semibold tracking-[-0.01em] text-ink">{active.label}</h2>
          <ContentView
            blocks={blocks}
            leadingTitle={active.phase.title ?? active.label}
            diagrams={scenario.diagrams}
            resolveAssetUrl={resolveAssetUrl}
            onExec={onExec}
            execEnabled={execReason === null}
            execDisabledReason={execReason}
            labels={LABELS}
            linksInNewTab
          />
          {canCheck(active) ? (
            <div className="mt-8 border-t border-rule pt-5">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" icon="target" onClick={onCheck} disabled={checkReason !== null || checking} loading={checking}>
                  {t('session.lesson.check')}
                </Button>
                {/* Lý do khoá là CHỮ: nút disabled không nhận focus nên `title` của nó không ai đọc được. */}
                {checkReason === null ? null : <span className="text-sm text-ink-3">{checkReason}</span>}
              </div>
              <CheckResultPanel outcome={activeCheck} />
            </div>
          ) : active.stepIndex !== null ? (
            <p className="mt-8 border-t border-rule pt-5 text-sm text-ink-3">{t('session.lesson.no-check')}</p>
          ) : null}
        </article>
      </div>
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-t border-rule px-4">
        <Button variant="ghost" icon="arrow-left" disabled={prev === undefined} onClick={() => prev !== undefined && onSelect(prev.key)}>
          {t('session.steps.prev')}
        </Button>
        <span className="hidden text-sm tabular-nums text-ink-3 sm:inline">
          {activeIndex + 1}/{phases.length}
        </span>
        <Button variant="secondary" iconRight="arrow-right" disabled={next === undefined} onClick={() => next !== undefined && onSelect(next.key)}>
          {t('session.steps.next')}
        </Button>
      </div>
    </div>
  );

  const launch = (
    <PracticeLaunch
      kind="lesson"
      startLabel={t('session.controls.start')}
      onStart={session.start}
      starting={session.starting}
      tierLabel={tierLabel(scenario.tier)}
      profile={profile}
      capacity={describeCapacity(capacity.data, profile)}
      otherMachines={resume.others}
    />
  );

  return (
    <PracticeFrame
      bar={
        <WorkspaceBar
          backHref="/lessons"
          backLabel={t('session.lesson.back')}
          title={scenario.title}
          badge={<TopicGlyph topic={look.topic} icon={look.icon} size={22} />}
          progress={
            <ProgressLine
              role="meter"
              value={progress.max === 0 ? 0 : progress.value / progress.max}
              label={t('session.lesson.progress-label')}
              caption={progress.label}
              tone={progress.value >= progress.max && progress.max > 0 ? 'ok' : 'acc'}
              size="xs"
            />
          }
          controls={
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
        storageKey={showIde ? 'dlp-lesson-split-ide' : 'dlp-lesson-split'}
        defaultRatio={showIde ? 0.34 : 0.42}
        focus={focus}
        onFocusChange={setFocus}
        content={instructions}
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
            terminal={<TerminalPane session={session} theme={terminalTheme} handoff={handoff} placeholder={launch} />}
            activeTab={tabs.activeTab}
            onActivate={tabs.onActivate}
            onPopOut={sessionId === null ? null : onPopOut}
            status={<SessionStatusPill phase={phase} />}
            storageKey="dlp-lesson-workspace"
          />
        }
      />
    </PracticeFrame>
  );
}
