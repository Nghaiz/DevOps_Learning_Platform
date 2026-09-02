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
import { summarizeProgress } from './progress';
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
  const [setupError, setSetupError] = useState<string | null>(null);
  /** Tăng để BUỘC effect setup chạy lại — nút "Thử lại" của lỗi setup. */
  const [setupAttempt, setSetupAttempt] = useState(0);
  /**
   * Step ĐÃ CHẤM ĐẠT trong phiên làm việc này.
   *
   * ⛔ KHÔNG suy dấu ✓ từ `progress.stepIndex`. Router ghi rõ `stepIndex` là
   * "VỊ TRÍ HIỆN TẠI, không phải step xa nhất từng tới", và `onSelect` ghi nó
   * mỗi lần người học chỉ ĐIỀU HƯỚNG. Suy từ đó nghĩa là: mở bài, bấm vào step
   * cuối để xem trước ⇒ mọi step trước nó lập tức hiện ✓ và thanh tiến độ nhảy
   * lên gần đầy, trong khi KHÔNG lượt chấm nào từng chạy. Dấu ✓ khi đó là lời
   * nói dối, và nó nói dối đúng về thứ nền tảng này tồn tại để đo.
   *
   * Nguồn sự thật duy nhất còn lại ở client là kết quả `checkStep` thật.
   */
  const [passedSteps, setPassedSteps] = useState<ReadonlySet<number>>(new Set());

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
  const sessionId = session.state.sessionId;

  useEffect(() => {
    if (active === null || sessionId === null || terminal === null || phases.length === 0) {
      return;
    }

    // ⛔ Phải chuẩn bị phase ĐẦU TIÊN, không chỉ phase đang mở.
    //
    // Asset chỉ được đẩy ở phase setup đầu tiên (`isAssetPushPhase`), và
    // `intro/background.sh` cũng chỉ chạy ở đó. Nhưng người học quay lại được
    // thả đúng vào step đang dở (khôi phục tiến độ). Chuỗi thật:
    //   qua step 1 → phiên hết hạn → mở lại (rơi vào step1) → bấm "Bắt đầu"
    // ⇒ pod MỚI TOANH, mà lượt runSetup duy nhất là cho `step1` — phase không có
    // `background` — nên `intro` không bao giờ chạy và `lab-seed.json` không bao
    // giờ tới pod. Mọi verify sau đó trượt với "Chua thay /root/lab/hello.txt".
    //
    // Đó ĐÚNG là hạng lỗi "asset chưa tới pod" mà cả lane này sinh ra để đóng,
    // bị đường khôi-phục-tiến-độ dựng lại.
    const first = phases[0];
    const needed = first === undefined || first.key === active.key ? [active] : [first, active];

    for (const target of needed) {
      // Bỏ qua phase chẳng có gì để chuẩn bị — trừ phase đầu, nơi asset được đẩy
      // (việc đó là logic phía server, client không thấy trong DTO).
      const isFirst = target.key === first?.key;
      if (!isFirst && target.phase.setup.background === null) {
        continue;
      }

      // Khoá gồm CẢ `sessionId`: khoá chỉ theo phase thì cờ của phiên CŨ sống
      // sót sang pod mới và setup không bao giờ chạy lại.
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
            // `foreground` được TRẢ VỀ chứ không chạy ở server — đó là định
            // nghĩa của nó (phải hiện ra trong terminal người học đang nhìn).
            // Chỉ gõ của phase ĐANG MỞ: gõ foreground của intro trong lúc người
            // ta đang ở step 3 là bơm lệnh lạ vào màn hình họ đang làm bài.
            if (result.foreground !== null && target.key === active.key) {
              terminal.sendInput(`${result.foreground}\r`);
            }
          },
          onError: (error) => {
            // ⛔ Setup hỏng PHẢI hiện ra. Bản đầu chỉ xoá cờ rồi im lặng: người
            // học nhìn một terminal bình thường trong khi môi trường bài chưa hề
            // được dựng, và mọi verify sau đó trượt vì lý do không liên quan.
            // Xoá cờ mà không có gì kích hoạt lại effect cũng KHÔNG phải "cho
            // phép thử lại" — nút "Thử lại" ở dưới mới là.
            setupDone.current.delete(runKey);
            setSetupError(describeTrpcError(error));
          },
        },
      );
    }
    // `runSetup` bị loại khỏi deps có chủ ý: danh tính của mutation object đổi
    // mỗi lần render, và đưa nó vào deps sẽ chạy lại effect liên tục.
  }, [active, phases, sessionId, terminal, scenarioId, setupAttempt]);

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
          // Chỉ ĐÂY mới sinh ra dấu ✓ — một lượt chấm ĐẠT có thật.
          if (result.passed && active.stepIndex !== null) {
            const index = active.stepIndex;
            setPassedSteps((prev) => new Set(prev).add(index));
          }
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
  const completed = query.data.progress.status === 'completed';
  const unsupported = query.data.unsupportedCapabilities;

  // `done` = ĐÃ CHẤM ĐẠT, không phải "đã đi qua". Bài đã hoàn thành
  // (`completed`, do server ghi `completedAt` khi chấm đạt step cuối) thì mọi
  // step đều đạt; ngoài ra chỉ tick thứ chính phiên này chấm đạt.
  const navItems = phases.map((p) => ({
    key: p.key,
    label: p.label,
    done: p.stepIndex === null ? false : completed || passedSteps.has(p.stepIndex),
  }));

  // Thanh tiến độ đếm CÙNG một thứ với dấu ✓ — nếu nó đếm `stepIndex` thì hai
  // chỉ báo cạnh nhau sẽ nói hai điều khác nhau về cùng một bài.
  //
  // Nhãn thì tách hẳn sang `summarizeProgress`: nhánh `completed` đặt con số
  // bằng tổng số step từ MỘT lượt chấm, nên câu "N/N bước đã đạt" khẳng định
  // nhiều hơn thứ ta lưu (nợ P2 §2). Xem `progress.ts`.
  const progress = summarizeProgress({
    stepCount: scenario.steps.length,
    passedInSession: passedSteps.size,
    completed,
  });

  return (
    <main className="flex h-screen flex-col bg-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2">
        <Link href="/lessons" className="text-sm text-slate-500 hover:text-slate-900">
          ← Bài học
        </Link>
        <h1 className="text-sm font-semibold">{scenario.title}</h1>

        <div className="w-40">
          <ProgressBar value={progress.value} max={progress.max} label={progress.label} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {SESSION_PHASE_LABEL[session.state.phase] ?? session.state.phase}
          </span>
          {/*
            Lý do thật, khi máy trạng thái đã hỏi được (contract §7).

            Không có dòng này thì lượt hỏi lý do chỉ đổi state chứ không đổi màn
            hình: nhãn phase nói "Đang kết nối…" trong khi phiên đã chết hẳn, và
            phase `error` thì nói đúng một chữ "Lỗi". Đó là nửa còn lại của lỗi
            mà đối chứng âm ở lượt này bắt được — sửa hook mà quên chỗ hiển thị
            thì người học vẫn ngồi nhìn một cái nhãn không nói gì.
          */}
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
          {/*
            Trả pod ngay khi học xong thay vì để reaper dọn sau 1h. Hiện ở MỌI
            phase có sessionId (kể cả reconnecting/error): một phiên đang hỏng
            vẫn đang giữ khe quota, và "kết thúc" là cách duy nhất người học tự
            nhả nó ra mà không đợi TTL.
          */}
          {/*
            Đồng hồ + nút "Thêm giờ".

            Chỉ hiện khi còn DƯỚI 10 phút: một cái đồng hồ chạy suốt buổi học là
            nhiễu, còn mười phút cuối là lúc nó thật sự nói được điều gì.

            ⛔ Chạm `hardCap` thì DISABLE kèm lý do, KHÔNG ẩn đi. Một nút biến
            mất không nói được vì sao nó biến mất, và người học sẽ đọc ra là
            trang hỏng chứ không phải "đã hết thời lượng tối đa".
          */}
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
                      ? 'Đã dùng hết thời lượng tối đa cho phiên này — hãy kết thúc và mở phiên mới.'
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

      {/*
        Setup hỏng KHÔNG được im lặng. Không có khối này, một lượt đẩy asset lỗi
        hay `background` thoát non-zero hiện ra dưới dạng: không gì cả — terminal
        trông bình thường, còn bài thì lặng lẽ không chạy được.
      */}
      {setupError !== null && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800"
        >
          <span>Không chuẩn bị được môi trường bài học: {setupError}</span>
          <Button
            variant="secondary"
            onClick={() => {
              setSetupError(null);
              setSetupAttempt((n) => n + 1);
            }}
          >
            Thử lại
          </Button>
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
