'use client';

import { useCallback, useMemo, type ReactElement } from 'react';
import { api, TrpcQueryProvider } from '../../lib/trpc-react';
import { useHintReveal } from '../../lib/use-hint-reveal';
import { describeTrpcError } from '../../lib/trpc';
import type { ArenaModeContext } from './arena-contract';
import { ArenaRoot } from './arena-root';
import { k8sOjLevel, type K8sOjProblem, type K8sOjTestcase } from './problem-level';

/**
 * `/games/k8s?problem=<mã>` — chế độ LÀM BÀI OJ của đấu trường K8s.
 *
 * ## Vì sao file này tồn tại, và vì sao nó là file MỚI chứ không phải một nhánh
 * trong `arena-entry.tsx`
 *
 * Tới 2026-09-15 chế độ `problem` của đấu trường K8s **không chạy được**, và
 * không phải vì thiếu một mảnh — vì ba mảnh, mỗi mảnh đủ để chặn một mình:
 *
 * 1. `arena-entry.tsx` cho người chơi chọn một level trong `LEVELS` kể cả khi có
 *    `?problem=`, nên `log.levelId` là `k8s-NN-…` và không bao giờ khớp
 *    `expectedLogLevelId(problem)` (= `problem.code`). `tryGradeProblem` và
 *    `submitProblem` đều trả `BAD_REQUEST` trước khi phát lại chạy dòng nào.
 * 2. `use-problem-submit.ts` gọi `api.*` trong khi `app/games/layout.tsx` CỐ Ý
 *    không cấp `TrpcQueryProvider`.
 * 3. `buildRunResult` tính điểm bằng `computeScore` còn máy chủ dùng
 *    `scoreProblemRun` — hai số khác nhau ngay khi bài có gợi ý được mở.
 *
 * Ba lỗi độc lập, cùng một triệu chứng: bài K8s mở ra chơi được nhưng không nộp
 * được. Ghi ở đây vì một trong ba (cái số 3) chỉ cắn SAU khi hai cái kia được
 * sửa — tách chúng ra ba lượt là tự đặt bẫy cho lượt sau.
 *
 * ## Vì sao file này tự cấp `TrpcQueryProvider`
 *
 * `app/games/layout.tsx` cố ý không cấp nó, và khối chú thích ở đó nói rõ lý do:
 * game phải chạy với **0 lời gọi backend trong lúc chơi**. Cấp provider ở tầng
 * layout là mở đường phá ô đó cho cả trụ cột.
 *
 * Chế độ làm bài thì ngược lại — nó KHÔNG chạy được nếu không gọi máy chủ, vì đề
 * bài nằm trong DB và verdict do máy chủ chấm lại. Nên provider sống ở đúng cây
 * con này: `/games/k8s` không có `?problem=` vẫn không mở một kết nối nào, và
 * `arena-entry.tsx` nạp file này bằng `next/dynamic` nên tầng mạng cũng không
 * vào bundle của người chơi level. Cùng khuôn `games/git/git-problem.tsx`.
 *
 * ## Ai chấm, và vì sao KHÔNG phải trình duyệt
 *
 * `problems.byCode` cắt `check`/`args` của MỌI testcase (§18.B.4). Engine trong
 * trình duyệt vì thế không chấm được, và client không khai được `objectivesMet`.
 * `problems.tryGrade` phát lại nhật ký ở máy chủ và trả `passed` — xem
 * `problem-level.ts` § `K8sOjClaimInput.objectivesMet` về cái giá của lựa chọn đó.
 */

const CAU_BAI_KHAC_GAME =
  'Bài này không thuộc game Kubernetes nên không mở được ở đấu trường. Hãy mở ' +
  'nó từ trang bài tập.';

export interface ArenaProblemScreenProps {
  /** Mã bài, từ `?problem=`. Đã lọc rỗng ở `page.tsx`. */
  readonly code: string;
}

export function ArenaProblemScreen({ code }: ArenaProblemScreenProps): ReactElement {
  return (
    <TrpcQueryProvider>
      <ArenaProblemBody code={code} />
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

function ArenaProblemBody({ code }: { readonly code: string }): ReactElement {
  const solver = api.problems.byCode.useQuery({ code });
  const solverProblem = solver.data?.problem;

  const problem = useMemo<K8sOjProblem | null>(() => {
    if (solverProblem === undefined || solverProblem.gameId !== 'k8s') {
      return null;
    }
    /*
     * KHÔNG có `check`/`args` — đường của người học không chở chúng, và đó là
     * §18.B.4 chứ không phải một khe thiếu. Máy chủ chấm qua `problems.tryGrade`.
     */
    const testcases: readonly K8sOjTestcase[] = solverProblem.testcases.map((teaser) => ({
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
      allowedResources: solverProblem.allowedResources,
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

  /*
   * Chế độ suy MỘT LẦN ở đây rồi truyền xuống, đúng như hợp đồng yêu cầu — cùng
   * luật mà `arena-entry.tsx` theo cho chế độ `level`.
   */
  /*
   * Gợi ý xin từ máy chủ — hook sống ở ĐÂY vì đây là cây con duy nhất có
   * `TrpcQueryProvider`, và nó chỉ tồn tại ở chế độ `problem`. Xem khối chú
   * thích `onRevealHint` trong `arena-contract.ts` về việc vì sao nó không thể
   * nằm ở `mission-card.tsx`.
   */
  const hints = useHintReveal(code);
  const revealHint = hints.reveal;

  const onRevealHint = useCallback(
    async (index: number): Promise<string | null> => {
      const hint = problem?.hints[index];
      if (hint === undefined) {
        // Giao diện đang giữ một bản đề cũ hơn dữ liệu. Không gọi máy chủ với
        // một id bịa ra; trả `null` để chỗ gọi không trừ điểm.
        return null;
      }
      return revealHint(index, hint.id);
    },
    [problem, revealHint],
  );

  const mode = useMemo<ArenaModeContext>(
    () => ({
      mode: 'problem',
      problemCode: code,
      /* Bài OJ không dạy, nên không có ngăn tra cứu. */
      codexAvailable: false,
      hintsCostPoints: true,
      problem,
      hintReveals: hints.reveals,
      onRevealHint,
    }),
    [code, problem, hints.reveals, onRevealHint],
  );

  /*
   * ⛔ `useMemo` ở đây KHÔNG phải tối ưu hoá — nó là điều kiện để phiên chơi
   * sống sót.
   *
   * `useArenaSession` dựng lại phiên mỗi khi ĐỊNH DANH của `level` đổi
   * (`useEffect(..., [level])`), và `k8sOjLevel(problem)` trả một object MỚI mỗi
   * lần render. Trước lượt này `ArenaProblemBody` không có state nào nên nó gần
   * như không render lại, và cái bẫy đó nằm im. Thêm trạng thái gợi ý là đánh
   * thức nó: mỗi lần mở một gợi ý sẽ dựng lại phiên và xoá sạch tiến độ người
   * chơi — không báo gì, không lỗi nào.
   */
  const level = useMemo(() => (problem === null ? null : k8sOjLevel(problem)), [problem]);

  if (solver.isPending) {
    return <ManMotDong text="Đang nạp đề bài…" role="status" />;
  }
  if (solver.isError) {
    return (
      <ManMotDong text={`Không mở được bài ${code}: ${describeTrpcError(solver.error)}`} role="alert" />
    );
  }
  /*
   * Bài của game khác: nói ra thay vì ép một `WorldSpec` của Git xuống reducer
   * K8s. Cùng lý lẽ `problemAsLevel` ném ở phía máy chủ — triệu chứng khi ép là
   * một lỗi CẤU HÌNH đọc ra thành "bộ mô phỏng hỏng".
   *
   * `/problems/:code` đã định tuyến theo `gameId` từ `65c97e0`, nên đường tới
   * đây là một URL gõ tay. Vẫn phải gác: một URL gõ tay không phải một lý do để
   * hỏng khó hiểu.
   */
  if (problem === null || level === null) {
    return <ManMotDong text={CAU_BAI_KHAC_GAME} role="alert" />;
  }

  return (
    <ArenaRoot
      key={problem.code}
      level={level}
      mode={mode}
      onExit={() => {
        window.location.assign(`/problems/${encodeURIComponent(problem.code)}`);
      }}
    />
  );
}
