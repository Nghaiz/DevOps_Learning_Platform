'use client';

import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { toVerdictView, type GitEngineSession, type VerdictView } from '@devops-platform/games';

import { GitLevelScreen } from './git-level-screen';
import { useHintReveal } from '../../../lib/use-hint-reveal';
import { gitOjClaim, gitOjGradable, gitOjLevel, type GitOjProblem, type GitOjTestcase } from './problem-level';
import { api, TrpcQueryProvider } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';

/**
 * `/games/git?problem=<mã>` — chế độ LÀM BÀI OJ của game Git, §18.C cho game thứ hai.
 *
 * ## Vì sao file này tự cấp `TrpcQueryProvider`
 *
 * `app/games/layout.tsx` CỐ Ý không cấp nó, và khối chú thích ở đó nói rõ lý do:
 * game phải chạy với **0 lời gọi backend trong lúc chơi** (AC-2, đo bằng network
 * trace). Cấp provider ở tầng layout là mở đường phá ô đó cho cả trụ cột.
 *
 * Chế độ làm bài thì ngược lại — nó KHÔNG chạy được nếu không gọi máy chủ, vì
 * đề bài nằm trong DB và verdict do máy chủ chấm lại. Nên provider sống ở đúng
 * cây con này: `/games/git` không có `?problem=` vẫn không mở một kết nối nào,
 * và `git-game.tsx` nạp file này bằng `next/dynamic` nên tầng mạng cũng không
 * vào bundle của người chơi level.
 *
 * ## Ai chấm, và vì sao KHÔNG phải trình duyệt
 *
 * `problems.byCode` cắt `check`/`args` của MỌI testcase trước khi dữ liệu rời
 * máy chủ (§18.B.4, `server/problems/testcases.ts`). Đó là chốt chặn chống dò
 * đáp án, và nó cố ý: nhãn là đề bài, còn tên vị từ và tham số là CÁCH CHẤM.
 *
 * Nên engine trong trình duyệt không chấm được, và client không khai được
 * `objectivesMet` — trường mà `verifyRun` so. Bản đầu của file này giải bằng
 * `problems.forEdit` (`authorProcedure`), tức chỉ TÁC GIẢ và admin nộp được;
 * người học đọc đề và gõ lệnh được nhưng nút nộp tắt.
 *
 * **Chốt bởi chủ dự án 2026-09-15: máy chủ chấm.** `problems.tryGrade` phát lại
 * nhật ký và trả `passed`, nên client không bao giờ cầm cách chấm và §18.B.4 giữ
 * nguyên vẹn. `forEdit` đã gỡ khỏi file này cùng lượt đó.
 *
 * ⚠ Hai cái giá, nói ra vì chúng không hiện trên màn:
 *
 *  1. Một lần bấm "Nộp bài" là HAI lượt gọi (`tryGrade` rồi `submit`), và cả hai
 *     tiêu một suất của cùng trần nhịp — trần nộp thật là 3 lần/phút.
 *  2. Lời khai nay là tiếng VỌNG của máy chủ, nên phép so `objectivesMet`/`score`
 *     trong `verifyRun` không còn là nhân chứng độc lập cho bài Git. Xem
 *     `GitOjClaimInput.objectivesMet` về thứ VẪN gác thật.
 */

const CAU_CHUA_NOP_DUOC =
  'Bài này chưa có testcase nào nên chưa chấm được. Mở ở chế độ đọc và luyện ' +
  'tay; hãy báo cho tác giả bài.';

export interface GitProblemScreenProps {
  /** Mã bài, từ `?problem=`. Đã lọc rỗng ở `page.tsx`. */
  readonly code: string;
}

export function GitProblemScreen({ code }: GitProblemScreenProps): ReactElement {
  return (
    <TrpcQueryProvider>
      <GitProblemBody code={code} />
    </TrpcQueryProvider>
  );
}

/** Một dòng trạng thái chiếm trọn màn — dùng cho cả đang tải lẫn lỗi. */
function ManMotDong({ text, role }: { readonly text: string; readonly role: string }): ReactElement {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <p className="max-w-xl text-sm text-muted-foreground" role={role}>
        {text}
      </p>
    </div>
  );
}

function GitProblemBody({ code }: { readonly code: string }): ReactElement {
  const solver = api.problems.byCode.useQuery({ code });
  /*
   * ⛔ KHÔNG còn query `forEdit` ở đây — gỡ 2026-09-15 cùng lượt mở
   * `problems.tryGrade`.
   *
   * Bản trước nạp cách chấm qua `forEdit` (`authorProcedure`) vì client phải tự
   * chấm mới khai được `objectivesMet`. Hệ quả: chỉ TÁC GIẢ bài và admin nộp
   * được, người học thì không — và mỗi người học trả thêm một vòng 403 mỗi lần
   * mở bài.
   *
   * Nay máy chủ chấm, nên client không cần cách chấm và không được cầm nó
   * (§18.B.4 giữ nguyên vẹn). Một query biến mất chứ không được vá.
   */
  const tryGradeMutation = api.problems.tryGrade.useMutation();

  /*
   * Gợi ý xin từ máy chủ — cùng hook với đấu trường K8s, cố ý.
   *
   * Hai bản sao của cùng một luật là chỗ hai game trôi khỏi nhau trong im lặng;
   * §3.1 của kế hoạch đã ghi đúng một va chạm loại đó trong phase này.
   */
  const hints = useHintReveal(code);

  const [view, setView] = useState<VerdictView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const submitMutation = api.problems.submit.useMutation();
  const { mutateAsync } = submitMutation;
  const { mutateAsync: tryGradeAsync } = tryGradeMutation;
  const utils = api.useUtils();

  /*
   * Mốc bắt đầu, ghim MỘT LẦN lúc mount.
   *
   * `Date.now()` gọi trong thân component sẽ đổi ở mỗi lần vẽ lại, và màn này vẽ
   * lại sau mỗi lệnh người chơi gõ — `durationSeconds` khi đó luôn xấp xỉ 0 và
   * lịch sử nộp bài ghi rằng mọi người giải xong trong chưa tới một giây.
   */
  const startedAtRef = useRef(Date.now());

  const solverProblem = solver.data?.problem;

  /**
   * Bài đã ghép: thân bài từ `byCode`, cách chấm từ `forEdit` khi có.
   *
   * Ghép theo `id` chứ không theo chỉ số: hai đường là hai truy vấn riêng và
   * không có gì bảo đảm thứ tự — một phép ghép theo vị trí sẽ gán `check` của
   * testcase này cho nhãn của testcase kia, im lặng, và bài vẫn chấm được (sai).
   */
  const problem = useMemo<GitOjProblem | null>(() => {
    if (solverProblem === undefined) {
      return null;
    }
    /*
     * KHÔNG có `check`/`args` — đường của người học không chở chúng, và đó là
     * §18.B.4 chứ không phải một khe thiếu. Máy chủ chấm qua `problems.tryGrade`.
     */
    const testcases: readonly GitOjTestcase[] = solverProblem.testcases.map((teaser) => ({
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
      ...(solverProblem.targetState === undefined
        ? {}
        : { targetState: solverProblem.targetState }),
      testcases,
      hints: solverProblem.hints.map((hint) => ({
        id: hint.id,
        penaltyPoints: hint.penaltyPoints,
        revealed: hint.revealed,
        text: hint.text,
      })),
      parMoves: solverProblem.parMoves,
    };
  }, [solverProblem]);

  const gradable = problem !== null && gitOjGradable(problem);

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
    (session: GitEngineSession) => {
      if (problem === null) {
        return;
      }
      const log = session.getLog();
      setErrorMessage(null);
      void (async () => {
        try {
          /*
           * Chấm THỬ trước, rồi nộp bằng chính kết quả đó.
           *
           * ⚠ Hai lượt gọi cho một lần bấm, và cả hai tiêu một suất của CÙNG
           * trần nhịp (6 lượt/phút), nên trần nộp thật là 3 lần/phút. Chấp nhận
           * tường minh: một người làm bài thật nộp lại sau mỗi lần sửa, tức hàng
           * chục giây một lượt, còn ba lần mỗi phút vẫn rộng hơn nhịp đó.
           *
           * Vì sao KHÔNG gộp hai lượt thành một: `submit` GHI một dòng, `tryGrade`
           * không ghi gì. Gộp lại nghĩa là mọi lượt xem-thử đều đẻ một dòng trong
           * lịch sử của người học và đẩy `attemptCount` của bài — tức biến một
           * phép đo thành một lượt nộp.
           */
          const thu = await tryGradeAsync({
            code: problem.code,
            runLog: {
              gameId: 'git',
              levelId: log.levelId,
              seed: log.seed,
              actions: log.actions,
            },
          });
          const result = await mutateAsync({
            /*
             * Nhật ký của ĐÚNG lượt vừa chơi, lấy thẳng từ engine: `levelId`,
             * `seed` và `actions` đi cùng nhau hoặc không đi. `gameId` viết
             * tường minh vì `submitProblem` chốt nó phải khớp `problem.gameId`,
             * và các action thừa kế nó ở tầng schema — không cần lặp.
             */
            code: problem.code,
            runLog: {
              gameId: 'git',
              levelId: log.levelId,
              seed: log.seed,
              actions: log.actions,
            },
            claimed: gitOjClaim({
              problem,
              log,
              /*
               * `objectivesMet` tới từ MÁY CHỦ, không từ `session.getStatus()`.
               * Phiên cục bộ không có `check` nên nó luôn trả rỗng — xem khối
               * chú thích ở `GitOjClaimInput.objectivesMet`.
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
           * KHÔNG nuốt. Lượt chơi vẫn còn nguyên trong engine, nên bấm lại là
           * nộp lại đúng nhật ký đó — `rules/development-principles.md`
           * § Errors Over Silent Fallbacks.
           */
          setErrorMessage(describeTrpcError(error));
        }
      })();
    },
    [problem, mutateAsync, tryGradeAsync, utils],
  );

  if (solver.isPending) {
    return <ManMotDong text="Đang nạp đề bài…" role="status" />;
  }
  if (solver.isError || problem === null) {
    return (
      <ManMotDong
        text={`Không mở được bài ${code}: ${solver.error === null ? 'không có dữ liệu' : describeTrpcError(solver.error)}`}
        role="alert"
      />
    );
  }
  /*
   * Không còn lượt chờ thứ hai ở đây. Bản trước đợi `forEdit` ngã ngũ trước khi
   * dựng phiên, vì phiên giữ trong `useRef` suốt lượt chơi nên dựng lúc dữ liệu
   * chấm còn đang bay sẽ khoá level ở trạng thái không có `check` VĨNH VIỄN. Nay
   * không có dữ liệu chấm nào ở client nên cuộc đua đó không tồn tại.
   */

  return (
    <GitLevelScreen
      key={problem.code}
      level={gitOjLevel(problem)}
      // Bài OJ theo định nghĩa là bài KHÔNG dạy, nên không có ngăn bài giảng.
      theory={null}
      exitLabel="← Trang bài tập"
      onExit={() => {
        window.location.assign(`/problems/${encodeURIComponent(problem.code)}`);
      }}
      oj={{
        gradable,
        notice: gradable ? null : CAU_CHUA_NOP_DUOC,
        submitLabel: submitMutation.isPending ? 'Đang nộp…' : 'Nộp bài',
        submitDisabled: !gradable || submitMutation.isPending,
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
