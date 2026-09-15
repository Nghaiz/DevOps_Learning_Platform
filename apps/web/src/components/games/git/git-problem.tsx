'use client';

import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { toVerdictView, type GitEngineSession, type VerdictView } from '@devops-platform/games';

import { GitLevelScreen } from './git-level-screen';
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
 * ## ⛔ CÒN HỞ, ĐỌC TRƯỚC KHI KẾT LUẬN "chế độ OJ đã xong"
 *
 * `problems.byCode` cắt `check`/`args` của MỌI testcase trước khi dữ liệu rời
 * máy chủ (§18.B.4, `server/problems/testcases.ts`). Không có hai trường đó thì
 * engine trong trình duyệt **không chấm được**, nên client không thể khai
 * `objectivesMet` — mà `verifyRun` so đúng trường đó. Một lượt nộp khai rỗng sẽ
 * nhận `CE` cho một lượt chơi đúng, tức lỗi của chúng ta đọc ra như gian lận của
 * người chơi.
 *
 * Đường duy nhất chở đủ dữ liệu hôm nay là `problems.forEdit` (`authorProcedure`
 * + cổng chủ sở hữu), nên chế độ NỘP BÀI hiện chỉ mở cho tác giả bài và admin —
 * đúng đường "xem trước" mà `problemPreviewHref` phục vụ. Người học vẫn mở được
 * bài, đọc đề, và gõ lệnh trên đúng thế giới của bài; họ chỉ chưa nộp được, và
 * màn hình NÓI RA điều đó thay vì để nút nộp dẫn tới một `CE` khó hiểu.
 *
 * Chỗ sửa nằm ở `apps/web/src/server/**` (một đường trả testcase đủ `check` cho
 * người đang làm bài, hoặc một đường chấm thử ở máy chủ), ngoài phạm vi lane
 * này. Đã báo lead — xem báo cáo `2026-09-15-lane-18-git-oj-client.md`.
 */

const CAU_CHUA_NOP_DUOC =
  'Bài này mở ở chế độ đọc và luyện tay: trình duyệt chưa nhận được cách chấm ' +
  'của từng testcase nên chưa nộp được. Tác giả bài và admin xem trước thì nộp ' +
  'được đầy đủ.';

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
   * Đường thứ hai, và nó ĐƯỢC PHÉP hỏng: `forEdit` là `authorProcedure` với cổng
   * chủ sở hữu, nên một người học gọi nó nhận `FORBIDDEN`. Đó là câu trả lời
   * đúng, không phải một lỗi — `retry: false` để không thử lại ba lần một câu
   * trả lời đã dứt khoát, và `isError` được đọc như "không có dữ liệu chấm" chứ
   * không hiện lên màn như một sự cố.
   *
   * ⚠ Giá của hình dạng này: một người học trả thêm một vòng 403 mỗi lần mở bài.
   * Chấp nhận tường minh, vì đường còn lại là một lời nói dối trên màn — nút nộp
   * bấm được rồi trả `CE`. Khi máy chủ có đường trả cách chấm cho người đang làm
   * bài thì query này biến mất, không phải được vá.
   */
  const grading = api.problems.forEdit.useQuery({ code }, { retry: false });

  const [view, setView] = useState<VerdictView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const submitMutation = api.problems.submit.useMutation();
  const { mutateAsync } = submitMutation;
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
  const gradingTestcases = grading.data?.testcases;

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
    const checks = new Map((gradingTestcases ?? []).map((testcase) => [testcase.id, testcase]));
    const testcases: readonly GitOjTestcase[] = solverProblem.testcases.map((teaser) => {
      const full = checks.get(teaser.id);
      return {
        id: teaser.id,
        label: teaser.label,
        visible: teaser.visible,
        ...(full === undefined ? {} : { check: full.check }),
        ...(full?.args === undefined ? {} : { args: full.args }),
      };
    });
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
  }, [solverProblem, gradingTestcases]);

  const gradable = problem !== null && gitOjGradable(problem);

  const submit = useCallback(
    (session: GitEngineSession) => {
      if (problem === null) {
        return;
      }
      const log = session.getLog();
      setErrorMessage(null);
      void (async () => {
        try {
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
              status: session.getStatus(),
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
    [problem, mutateAsync, utils],
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
   * Đợi CẢ đường chấm ngã ngũ trước khi dựng phiên.
   *
   * Phiên được dựng một lần rồi giữ trong `useRef` suốt lượt chơi (xem
   * `GitLevelScreen`), nên nếu dựng lúc `forEdit` còn đang bay thì level không
   * có `check` nào và sẽ giữ nguyên như vậy KỂ CẢ khi dữ liệu chấm về sau đó —
   * một tác giả mở bài của chính mình rơi vào nhánh người học vì một cuộc đua
   * mạng, và không có dấu hiệu nào trên màn nói tại sao.
   */
  if (grading.isPending) {
    return <ManMotDong text="Đang nạp đề bài…" role="status" />;
  }

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
