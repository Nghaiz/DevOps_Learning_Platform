'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { parseContentBlocks } from '@devops-platform/scenario/content-blocks';
import { DEFAULT_THEME } from '@devops-platform/terminal';
import { Button, ContentView, ProgressBar, SplitPane, StepNav } from '@devops-platform/ui';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { buildPhases, canCheck, phaseKeyForStepIndex } from './phases';
import { useLessonSession } from './use-lesson-session';
import { CheckResultPanel, type CheckOutcome } from './check-result-panel';

/**
 * ⛔ `ssr: false` phải nằm trong một CLIENT component — Next 16 ném khi thấy nó
 * trong Server Component. Ba lớp: `page.tsx` (server) → file này (client) →
 * `terminal-pane` (client, đụng `document`, nạp động). Cùng lý do và cùng hình
 * dạng với `/session`; xem chú thích ở `session-client.tsx`.
 */
const TerminalPane = dynamic(() => import('./terminal-pane'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-slate-900/40" />,
});

export function LessonClient({ scenarioId }: { scenarioId: string }): React.ReactElement {
  const utils = api.useUtils();
  const query = api.lessons.get.useQuery({ scenarioId });
  const session = useLessonSession(scenarioId);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [check, setCheck] = useState<CheckOutcome | null>(null);

  const scenario = query.data?.scenario ?? null;
  const phases = useMemo(() => (scenario === null ? [] : buildPhases(scenario)), [scenario]);

  // Mở lại đúng chỗ đang dở — nửa "khôi phục" của ô AC tiến độ. Chỉ đặt MỘT lần
  // (khi activeKey còn null): đặt lại mỗi khi `progress` đổi sẽ kéo người học
  // nhảy phase ngay sau mỗi lượt chấm đạt.
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

  // ── Setup script: chạy đúng MỘT lần cho mỗi phase, và chỉ khi phiên đã sẵn sàng ──
  //
  // `runSetup` KHÔNG đảm bảo idempotent (nó chạy `background` thật), nên phải tự
  // nhớ phase nào đã chạy. Ref chứ không state: giá trị này không được phép gây
  // re-render, và nếu nó nằm trong state thì lần set đầu tiên sẽ chạy lại effect
  // trước khi cờ kịp có tác dụng — tức chạy setup hai lần.
  const setupDone = useRef(new Set<string>());
  const terminal = session.terminal;
  const phaseKey = active?.key ?? null;
  const phaseRef = active?.ref ?? null;
  const sessionId = session.state.sessionId;

  useEffect(() => {
    if (phaseKey === null || phaseRef === null || sessionId === null || terminal === null) {
      return;
    }
    // Khoá gồm CẢ `sessionId`, không chỉ `phaseKey`.
    //
    // Khoá chỉ theo phase thì sau khi người học bấm "Bắt đầu" lần hai (phiên cũ
    // hết hạn, pod mới toanh), cờ của phiên CŨ vẫn còn ⇒ `background` KHÔNG BAO
    // GIỜ chạy trong pod mới. Bài hiện ra bình thường rồi hỏng ở step đầu tiên,
    // với triệu chứng ("lệnh trong bài không có tác dụng") không trỏ về đâu cả.
    const runKey = `${sessionId}:${phaseKey}`;
    if (setupDone.current.has(runKey)) {
      return;
    }
    setupDone.current.add(runKey);

    runSetup.mutate(
      { scenarioId, sessionId, phase: phaseRef },
      {
        onSuccess: (result) => {
          // `foreground` được TRẢ VỀ chứ không chạy ở server — đó là định nghĩa
          // của nó (phải hiện ra trong terminal người học đang nhìn). Gõ nó vào
          // WS ở đây là nửa còn lại của ranh giới 2.C/2.D.
          if (result.foreground !== null) {
            terminal.sendInput(`${result.foreground}\r`);
          }
        },
        onError: () => {
          // Cho phép thử lại: setup hỏng mà khoá luôn phase thì người học không
          // có đường nào ngoài việc tải lại trang.
          setupDone.current.delete(runKey);
        },
      },
    );
    // `runSetup` bị loại khỏi deps có chủ ý: danh tính của mutation object đổi
    // mỗi lần render, và đưa nó vào deps sẽ chạy lại effect liên tục.
  }, [phaseKey, phaseRef, sessionId, terminal, scenarioId]);

  // ── Điều hướng ──────────────────────────────────────────────────────────────
  const onSelect = useCallback(
    (key: string) => {
      setActiveKey(key);
      setCheck(null);

      const target = phases.find((p) => p.key === key);
      // `saveProgress` chỉ có nghĩa với STEP — intro/finish không nằm trong hệ
      // đếm `stepIndex`, và ghi chúng vào đó sẽ làm tiến độ nhảy lung tung.
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
    setCheck({ kind: 'running' });
    checkStep.mutate(
      { scenarioId, sessionId, phase: active.ref },
      {
        onSuccess: (result) => {
          setCheck({
            kind: 'result',
            passed: result.passed,
            exitCode: result.exitCode,
            output: result.output,
          });
          void utils.lessons.invalidate();
        },
        // ⛔ Lỗi hệ thống KHÔNG được hiện thành "bài sai". Phiên hết hạn, pod bị
        // thu hồi, apiserver trục trặc — cả ba đều tới đây dưới dạng ném, và vẽ
        // chúng thành dấu X đỏ sẽ bắt người học đi sửa một bài vốn đã đúng.
        onError: (error) => {
          setCheck({ kind: 'error', message: describeTrpcError(error) });
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

  const onExec = useCallback(
    (command: string, interrupt: boolean) => {
      if (terminal === null) {
        return;
      }
      // `exec-interrupt` = Ctrl+C rồi mới tới lệnh (contract Killercoda). Gửi
      // \x03 riêng chứ không nối vào chuỗi: chúng là hai sự kiện bàn phím.
      if (interrupt) {
        terminal.sendInput('\x03');
      }
      terminal.sendInput(`${command}\r`);
      terminal.focus();
    },
    [terminal],
  );

  if (query.isPending) {
    return <Centered>Đang tải bài học…</Centered>;
  }
  if (query.isError) {
    return <Centered tone="error">{describeTrpcError(query.error)}</Centered>;
  }
  if (scenario === null || active === null) {
    return <Centered tone="error">Không tìm thấy bài học này.</Centered>;
  }

  const blocks = parseContentBlocks(active.phase.markdown);
  const doneThrough = query.data.progress.stepIndex;
  const completed = query.data.progress.status === 'completed';
  const unsupported = query.data.unsupportedCapabilities;

  const navItems = phases.map((p) => ({
    key: p.key,
    label: p.label,
    done:
      p.stepIndex === null
        ? false
        : completed || p.stepIndex < doneThrough,
  }));

  return (
    <main className="flex h-screen flex-col bg-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2">
        <Link href="/lessons" className="text-sm text-slate-500 hover:text-slate-900">
          ← Bài học
        </Link>
        <h1 className="text-sm font-semibold">{scenario.title}</h1>

        <div className="w-40">
          <ProgressBar
            value={completed ? scenario.steps.length : doneThrough}
            max={scenario.steps.length}
            label={`${String(completed ? scenario.steps.length : doneThrough)}/${String(scenario.steps.length)} bước`}
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {SESSION_PHASE_LABEL[session.state.phase] ?? session.state.phase}
          </span>
          {session.state.sessionId === null && (
            <Button onClick={session.start} disabled={session.starting}>
              {session.starting ? 'Đang tạo phiên…' : 'Bắt đầu'}
            </Button>
          )}
        </div>
      </header>

      {/*
        Cảnh báo năng lực — BẮT BUỘC hiện (2.B §2.2). `unsupportedCapabilities`
        là cái giá của quyết định "cảnh báo, không chặn": bỏ nó đi thì người học
        mở bài CKAD và gặp `kubectl: command not found` mà không có lời giải
        thích nào, và một đánh đổi đã cân nhắc trở thành một lỗi im lặng.
      */}
      {unsupported.length > 0 && (
        <div
          role="alert"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
        >
          Bài này cần <strong>{unsupported.join(', ')}</strong> — nền tảng chưa chạy được
          những năng lực đó, nên một số lệnh trong bài sẽ báo lỗi. Bạn vẫn mở được để đọc
          nội dung.
        </div>
      )}

      {session.startError !== null && (
        <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {session.startError}
        </div>
      )}

      <div className="border-b border-slate-200 px-4 py-2">
        <StepNav items={navItems} activeKey={active.key} onSelect={onSelect} />
      </div>

      <div className="min-h-0 flex-1">
        <SplitPane
          storageKey="dlp-lesson-split"
          left={
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <ContentView
                  blocks={blocks}
                  resolveAssetUrl={resolveAssetUrl}
                  onExec={onExec}
                  execEnabled={terminal !== null}
                />
              </div>

              {canCheck(active) && (
                <div className="border-t border-slate-200 px-5 py-3">
                  <Button
                    onClick={onCheck}
                    disabled={sessionId === null || check?.kind === 'running'}
                    title={sessionId === null ? 'Hãy bắt đầu phiên trước' : undefined}
                  >
                    {check?.kind === 'running' ? 'Đang chấm…' : 'Kiểm tra'}
                  </Button>
                  <CheckResultPanel outcome={check} />
                </div>
              )}
            </div>
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
    </main>
  );
}

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
