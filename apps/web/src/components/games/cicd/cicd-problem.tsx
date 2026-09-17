'use client';

import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  CICD_UNSEEDED_REPLAY_SEED,
  toVerdictView,
  type CicdCdPolicies,
  type CicdPlayerOverrides,
  type VerdictView,
} from '@devops-platform/games';

import { CicdLevelScreen } from './cicd-level-screen';
import {
  cicdOjClaim,
  cicdOjGradable,
  cicdOjLevel,
  cicdOjSpecThieu,
  type CicdOjProblem,
  type CicdOjTestcase,
} from './cicd-oj-level';
import { useHintReveal } from '../../../lib/use-hint-reveal';
import { api, TrpcQueryProvider } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';

/**
 * `/games/cicd?problem=<mã>` — chế độ LÀM BÀI OJ của game CI/CD, §19.J.3.
 *
 * Khuôn mẫu là `games/git/git-problem.tsx`; bốn quyết định của nó giữ nguyên ở
 * đây, và chúng được nhắc lại vì lý do chứ không phải để trang trí.
 *
 * ## 1. Vì sao file này tự cấp `TrpcQueryProvider`
 *
 * `app/games/layout.tsx` CỐ Ý không cấp nó: game phải chạy với **0 lời gọi
 * backend trong lúc chơi** (AC-2 và AC-D6, đo bằng network trace). Cấp provider ở
 * tầng layout là mở đường phá ô đó cho cả trụ cột.
 *
 * Chế độ làm bài thì ngược lại — nó KHÔNG chạy được nếu không gọi máy chủ, vì đề
 * nằm trong DB và verdict do máy chủ chấm lại. Nên provider sống ở đúng cây con
 * này, và `cicd-game.tsx` nạp file này bằng `next/dynamic`: `/games/cicd` không
 * có `?problem=` thì tầng mạng cũng không vào bundle của người chơi level.
 *
 * ## 2. Ai chấm, và vì sao KHÔNG phải trình duyệt
 *
 * `problems.byCode` cắt `check`/`args` của MỌI testcase trước khi dữ liệu rời
 * máy chủ (§18.B.4). Nhãn là đề bài; tên vị từ và tham số là CÁCH CHẤM. Nên
 * engine trong trình duyệt không chấm được, và `problems.tryGrade` phát lại nhật
 * ký phía máy chủ rồi trả `passed`.
 *
 * ⚠ Một lần bấm "Nộp bài" là HAI lượt gọi (`tryGrade` rồi `submit`), và cả hai
 * tiêu một suất của CÙNG trần nhịp — trần nộp thật là **3 lần/phút**. Không gộp
 * hai lượt: `submit` GHI một dòng, `tryGrade` không ghi gì; gộp lại thì mọi lượt
 * xem-thử đẻ một dòng trong lịch sử của người học và đẩy `attemptCount` của bài.
 *
 * ## 3. Nhật ký chở ĐỦ BA MẢNH (19.J)
 *
 * `CicdGameAction.evaluate` chở `source` + `overrides` + `cd`, và cả ba phải đến
 * từ CÙNG một khoảnh khắc — đó là lý do `CicdOjScreenProps.onSubmit` nhận cả ba
 * thay vì chỉ YAML. Gửi thiếu một mảnh thì máy chủ phát lại một lượt chơi khác
 * lượt người ta vừa chơi, và người giải ĐÚNG có thể nhận WA.
 *
 * ## 4. Verdict dựng bằng `toVerdictView`, không tự suy
 *
 * `toVerdictView` là nguồn DUY NHẤT được phép suy verdict, và nó ép bằng KIỂU
 * rằng `CE` không mang phân số (`fraction: null`). In `0/5` cho một lượt không
 * chạy tới nơi là bịa ra một phép đo.
 */

const CAU_CHUA_NOP_DUOC =
  'Bài này chưa có testcase nào nên chưa chấm được. Mở ở chế độ đọc và luyện ' +
  'tay; hãy báo cho tác giả bài.';

export interface CicdProblemScreenProps {
  /** Mã bài, từ `?problem=`. Đã lọc rỗng ở `page.tsx`. */
  readonly code: string;
}

export function CicdProblemScreen({ code }: CicdProblemScreenProps): ReactElement {
  return (
    <TrpcQueryProvider>
      <CicdProblemBody code={code} />
    </TrpcQueryProvider>
  );
}

function ManBao({
  text,
  onRetry,
}: {
  readonly text: string;
  readonly onRetry?: () => void;
}): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="max-w-lg text-sm text-muted-foreground">{text}</p>
      {onRetry === undefined ? null : (
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-sm"
          onClick={onRetry}
        >
          Thử lại
        </button>
      )}
    </div>
  );
}

function CicdProblemBody({ code }: { readonly code: string }): ReactElement {
  const solver = api.problems.byCode.useQuery({ code });
  const tryGradeMutation = api.problems.tryGrade.useMutation();
  const submitMutation = api.problems.submit.useMutation();
  /*
   * Gợi ý xin từ máy chủ — cùng hook với đấu trường K8s và game Git, cố ý. Hai
   * bản sao của cùng một luật là chỗ hai game trôi khỏi nhau trong im lặng.
   */
  const hints = useHintReveal(code);

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [view, setView] = useState<VerdictView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { mutateAsync } = submitMutation;
  const { mutateAsync: tryGradeAsync } = tryGradeMutation;
  const utils = api.useUtils();

  /*
   * Mốc bắt đầu, ghim MỘT LẦN lúc mount.
   *
   * `Date.now()` gọi trong thân component sẽ đổi ở mỗi lần vẽ lại, và màn này vẽ
   * lại sau mỗi phím người chơi gõ vào ô YAML — `durationSeconds` khi đó luôn
   * xấp xỉ 0 và lịch sử nộp bài ghi rằng mọi người giải xong trong chưa tới một
   * giây.
   */
  const startedAtRef = useRef(Date.now());

  const solverProblem = solver.data?.problem;

  const problem = useMemo<CicdOjProblem | null>(() => {
    if (solverProblem === undefined) {
      return null;
    }
    /*
     * KHÔNG có `check`/`args` — đường của người học không chở chúng, và đó là
     * §18.B.4 chứ không phải một khe thiếu.
     */
    const testcases: readonly CicdOjTestcase[] = solverProblem.testcases.map((teaser) => ({
      id: teaser.id,
      label: teaser.label,
      visible: teaser.visible,
    }));
    return {
      code: solverProblem.code,
      title: solverProblem.title,
      statement: solverProblem.statement,
      difficulty: solverProblem.difficulty,
      initialState: solverProblem.initialState,
      testcases,
      hints: solverProblem.hints.map((hint) => ({
        id: hint.id,
        penaltyPoints: hint.penaltyPoints,
        revealed: hint.revealed,
        text: hint.text,
      })),
    };
  }, [solverProblem]);

  const revealHint = hints.reveal;
  const onRevealHint = useCallback(
    async (index: number): Promise<string | null> => {
      const hint = problem?.hints[index];
      if (hint === undefined) {
        // Đề trên màn cũ hơn dữ liệu. Không gọi máy chủ với một id bịa ra.
        return null;
      }
      return revealHint(index, hint.id);
    },
    [problem, revealHint],
  );

  const submit = useCallback(
    (nop: {
      readonly yaml: string;
      readonly overrides: CicdPlayerOverrides;
      readonly cd: CicdCdPolicies | null;
    }) => {
      if (problem === null || submittingRef.current) {
        return;
      }
      submittingRef.current = true;
      setSubmitting(true);
      setErrorMessage(null);
      setView(null);
      void (async () => {
        try {
          /*
           * Nhật ký của ĐÚNG lượt vừa chơi. Một hành động `evaluate` duy nhất
           * chở trọn trạng thái hiện tại — khác hai game kia, nơi nhật ký là một
           * chuỗi lệnh tích luỹ. `gradeCicdProblem` chấm bản `evaluate` CUỐI
           * CÙNG, nên một dòng là đủ và là trung thực.
           *
           * `levelId` là MÃ BÀI: bài OJ không đứng sau một level nào, và mã bài
           * là định danh duy nhất có thật ở đây.
           */
          /*
           * ⛔ GỢI Ý PHẢI CÓ MẶT TRONG NHẬT KÝ. Bỏ chúng ra là một lỗi ĐÃ ĐO
           * (review PR #146): `verifyRun` so `claimed.hintsUsed` với
           * `tallyLog(log).hintsUsed`, mà `tallyLog` chỉ đếm action `hint`. Một
           * nhật ký không có action nào ⇒ máy chủ đếm 0, client khai 1 ⇒
           * `khong-khop` ⇒ `CE` cho một bài giải ĐÚNG. Cả hai bài seed đều có
           * gợi ý, nên đường hỏng này nằm trên dữ liệu thật.
           *
           * CHỈ pha `ready` — gợi ý xin HỎNG thì máy chủ không ghi gì, nên đưa
           * nó vào nhật ký là tự khai một lượt mở không tồn tại.
           *
           * Thứ tự: gợi ý TRƯỚC, `evaluate` SAU, và `tick` tăng dần —
           * `logShapeError` từ chối một nhật ký có `tick` lùi.
           */
          const goiYDaMo = [...hints.reveals.entries()]
            .filter(([, reveal]) => reveal.phase === 'ready')
            .map(([index]) => index)
            .sort((a, b) => a - b);

          const runLog = {
            gameId: 'cicd' as const,
            levelId: problem.code,
            seed: CICD_SEED_PHAT_LAI,
            actions: [
              ...goiYDaMo.map((index, thuTu) => ({
                gameId: 'cicd' as const,
                tick: thuTu,
                kind: 'hint' as const,
                index,
              })),
              {
                gameId: 'cicd' as const,
                tick: goiYDaMo.length,
                kind: 'evaluate' as const,
                source: nop.yaml,
                overrides: nop.overrides,
                cd: nop.cd,
              },
            ],
          };

          /*
           * Chấm THỬ trước, rồi nộp bằng chính kết quả đó. Xem khối §2 đầu file
           * về hai lượt gọi và trần nhịp thật.
           */
          const thu = await tryGradeAsync({ code: problem.code, runLog });
          const result = await mutateAsync({
            code: problem.code,
            runLog,
            claimed: cicdOjClaim({
              problem,
              log: runLog,
              /*
               * `objectivesMet` tới từ MÁY CHỦ, không từ một phép chấm tại chỗ.
               * Client không có `check` nên nó không thể tự tính trường này —
               * đây là tiếng vọng, và `verifyRun` biết như vậy.
               */
              objectivesMet: thu.passed,
              startedAt: startedAtRef.current,
              finishedAt: Date.now(),
            }),
          });
          /*
           * Đọc lại teaser TRƯỚC khi dựng view: nhãn của testcase ẩn vừa mở khoá
           * bởi chính lượt nộp này (`toTestcaseTeasers` chỉ mở nhãn khi
           * `afterSubmit`). Không đọc lại thì danh sách "cái này sai" hiện ra
           * toàn dòng vô danh đúng lúc người làm cần tên nhất.
           */
          const fresh = await utils.problems.byCode.fetch({ code: problem.code });
          setView(toVerdictView(result.grade, fresh.problem.testcases));
        } catch (error) {
          /*
           * KHÔNG nuốt. Lượt chơi vẫn còn nguyên trên màn, nên bấm lại là nộp
           * lại đúng trạng thái đó — `rules/development-principles.md`
           * § Errors Over Silent Fallbacks.
           */
          setErrorMessage(describeTrpcError(error));
        } finally {
          submittingRef.current = false;
          setSubmitting(false);
        }
      })();
    },
    [problem, mutateAsync, tryGradeAsync, utils, hints.reveals],
  );

  if (solver.isPending) {
    return <ManBao text="Đang nạp đề bài và dựng đường ống của bạn…" />;
  }
  if (solver.isError || problem === null) {
    return (
      <ManBao
        onRetry={() => {
          void solver.refetch();
        }}
        text={`Không mở được bài ${code}: ${solver.error === null ? 'không có dữ liệu' : describeTrpcError(solver.error)}`}
      />
    );
  }

  /*
   * ⛔ Kiểm bộ ba TRƯỚC khi dựng màn chơi. `initialState` tới đây ở `unknown` và
   * biên ghi cố ý không dựng lại `CicdProblemSpec` — nên một đề thiếu `workload`
   * sẽ ném bên trong `runWorkflow` và người làm nhận một TRANG TRẮNG, không
   * thông điệp, không cách nào đoán rằng lỗi nằm ở đề chứ không ở họ.
   */
  const thieu = cicdOjSpecThieu(problem);
  if (thieu !== null) {
    return (
      <ManBao
        text={`Đề bài ${problem.code} thiếu phần "${thieu}", nên chưa dựng được màn chơi. Đây là lỗi của đề, không phải của bạn — hãy báo cho tác giả bài.`}
      />
    );
  }

  const gradable = cicdOjGradable(problem);

  return (
    <CicdLevelScreen
      key={problem.code}
      level={cicdOjLevel(problem)}
      // Bài OJ theo định nghĩa là bài KHÔNG dạy, nên không có ngăn bài giảng.
      theory={null}
      onExit={() => {
        window.location.assign(`/problems/${encodeURIComponent(problem.code)}`);
      }}
      oj={{
        gradable,
        notice: gradable ? null : CAU_CHUA_NOP_DUOC,
        submitLabel: submitting ? 'Đang chấm và nộp…' : 'Nộp bài',
        submitDisabled: !gradable || submitting,
        onSubmit: submit,
        result: ketQuaDocDuoc(view, errorMessage),
        failedLabels: (view?.failed ?? []).map(
          (failed) => failed.label ?? 'Testcase ẩn chưa hiện tên',
        ),
        hintReveals: hints.reveals,
        onRevealHint,
      }}
    />
  );
}

/**
 * Hạt giống ghi kèm lượt nộp.
 *
 * ⚠ KHÔNG đi vào phép chấm: engine CI/CD lấy hạt giống từ `evaluation.baseSeed`
 * của chính bài. Hai nguồn hạt giống nghe như một chỗ hỏng, nhưng chúng trả lời
 * hai câu khác nhau — cái này nói "lượt chơi mang số nào", cái kia nói "phép mô
 * phỏng rút xúc xắc từ đâu". Gộp lại thì hai lượt nộp cùng một workflow sẽ cho
 * hai verdict khác nhau.
 *
 * Giá trị phải khớp `CICD_UNSEEDED_REPLAY_SEED` của plugin. Nhập thẳng hằng đó
 * thay vì gõ `1`: một con số gõ tay ở đây sẽ trôi khỏi bản gốc trong im lặng.
 */
const CICD_SEED_PHAT_LAI: number = CICD_UNSEEDED_REPLAY_SEED;

/**
 * Một dòng chữ nói ra kết quả lượt nộp gần nhất.
 *
 * ⛔ `CE` KHÔNG in phân số, và đó là §18.B.5 chứ không phải chuyện trình bày:
 * lượt chơi không chạy tới nơi thì `passed`/`total` không nói lên gì, nên in
 * `0/5` ở đó là bịa ra một phép đo. `VerdictView.fraction` đã ép điều này bằng
 * kiểu (`null` với `CE`); hàm này chỉ việc không nói dối.
 */
function ketQuaDocDuoc(view: VerdictView | null, errorMessage: string | null): string | null {
  if (errorMessage !== null) {
    return `Chưa nộp được: ${errorMessage}`;
  }
  if (view === null) {
    return null;
  }
  if (view.fraction === null) {
    return `CE — ${view.failedReason ?? 'lượt chơi không chạy tới nơi nên chưa chấm được.'}`;
  }
  const { passed, total } = view.fraction;
  return view.verdict === 'AC'
    ? `AC (${String(passed)}/${String(total)}) — qua hết testcase.`
    : `WA (${String(passed)}/${String(total)})`;
}
