'use client';

import { useCallback, useState } from 'react';
import { toVerdictView, type VerdictView } from '@devops-platform/games';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import type { ArenaModeContext } from './arena-contract';
import type { ArenaSessionHandle } from './arena-session';
import { k8sOjClaim, k8sOjGradable } from './problem-level';

/**
 * Nộp lượt chơi về `problems.submit`, và trả verdict máy chủ chấm lại.
 *
 * ## Vì sao hook này tồn tại
 *
 * Tới 2026-09-14 KHÔNG màn nào trong `apps/web` gọi `problems.submit` (grep ra
 * đúng 0 chỗ ngoài chính router và `submit.ts`). Đấu trường chưa từng nộp bài
 * về máy chủ, nên cả đường chấm-lại phía máy chủ là mã không ai đi qua, và
 * `problem-verdict.tsx` có test nhưng chưa có màn hình. Hook này là chỗ nối.
 *
 * ## Vì sao import `toVerdictView` từ `@devops-platform/games`
 *
 * Vì đó là NGUỒN DUY NHẤT được phép suy verdict: nó gọi `problemVerdictOf`, và
 * §18.C.3 nói phép so verdict client-với-server chỉ có nghĩa khi hai bên dùng
 * chung một hàm. Viết một bản thứ hai ở đây, kể cả một dòng `passed === total`
 * trông vô hại, là làm phép so đó nói về hai hàm thay vì nói về engine.
 *
 * ⛔ ĐÍNH CHÍNH 2026-09-14, và đọc kỹ vì bản trước của chính khối này là thứ đã
 * sai. Nó ghi rằng hook này import `toVerdictView` từ
 * `apps/web/src/server/problems/verdict-view.ts` và biện hộ rằng làm vậy an
 * toàn vì file kia "thuần". Lời biện hộ đó đúng về sự kiện nhưng sai về kết
 * luận: một file `'use client'` import GIÁ TRỊ từ `src/server/` chỉ đứng được
 * chừng nào không ai thêm `import 'server-only'` vào file kia, và điều kiện đó
 * không phải một bảo đảm mà là một sự tình cờ.
 *
 * Đã sửa ở gốc: `verdict-view.ts` chuyển xuống `packages/games/src/core/`, cạnh
 * `problemVerdictOf`. Từ nay "cùng một hàm" là một sự thật của cấu trúc thư mục
 * chứ không còn là một lời hứa trong chú thích.
 *
 * ## ⛔ ĐỔI NGHĨA 2026-09-15 — máy chủ chấm, và lời khai không còn tự dựng
 *
 * Bản trước dựng lời khai bằng `buildRunResult(level, engine, …)`, tức đọc
 * `engine.status.objectivesMet` của phiên cục bộ và tính điểm bằng
 * `computeScore`. Hai điều đó nay đều sai ở chế độ bài tập:
 *
 * 1. **`objectivesMet` cục bộ luôn RỖNG.** `toTestcaseTeasers` cắt `check`/`args`
 *    của mọi testcase (§18.B.4), nên level tổng hợp phía client mang vị từ rỗng
 *    và `evaluateObjectives` bỏ qua tất cả. Lời khai rỗng ⇒ `verifyRun` ra
 *    `khong-khop` ⇒ `CE` cho một lượt chơi ĐÚNG. Nay `objectivesMet` tới từ
 *    `problems.tryGrade` — máy chủ phát lại và trả `passed`.
 * 2. **`computeScore` không phải công thức máy chủ dùng.** Máy chủ chấm bài OJ
 *    bằng `scoreProblemRun` (`problemScoreRun` ở `replay.ts`), vốn trừ điểm gợi
 *    ý bằng `penaltyPoints` chứ không bằng tỉ lệ. Hai số lệch nhau ngay khi bài
 *    có một gợi ý được mở. `k8sOjClaim` gọi đúng hàm của máy chủ.
 *
 * `buildRunResult` KHÔNG bị bỏ: nó vẫn là bản dựng đúng cho chế độ LEVEL, nơi
 * `recordRun` là bên đọc và `computeScore` là công thức đúng.
 *
 * ⚠ Cái giá, nói ra vì nó không hiện trên màn: một lần bấm "Nộp bài" là HAI lượt
 * gọi (`tryGrade` rồi `submit`), và cả hai tiêu một suất của cùng trần nhịp
 * (6 lượt/phút) — trần nộp thật là 3 lần/phút. Gộp hai lượt thành một thì mọi
 * lượt xem-thử sẽ đẻ một dòng trong lịch sử người học và đẩy `attemptCount` của
 * bài, tức biến một phép đo thành một lượt nộp.
 *
 * ## Vì sao phải gọi `byCode` một lần nữa sau khi nộp
 *
 * `submitProblem` trả `grade` mang `passed: string[]` và `total` — TOÀN LÀ ID,
 * không có nhãn nào. `toVerdictView` cần `TestcaseTeaser[]` để nói *testcase
 * NÀO* đỏ, và bộ teaser đó chỉ tới từ `problems.byCode`.
 *
 * `invalidate`/`fetch` sau khi nộp là BẮT BUỘC chứ không phải cho mới:
 * `toTestcaseTeasers` chỉ mở nhãn của testcase ẩn khi `afterSubmit` là `true`,
 * và trước lượt nộp đầu tiên mọi nhãn ẩn về `null`. Không đọc lại thì danh sách
 * "cái này sai" hiện ra toàn dòng *"Testcase ẩn chưa hiện tên"* đúng vào lúc
 * người làm cần tên nhất.
 */
export type ProblemSubmitPhase = 'idle' | 'pending' | 'done' | 'error';

export interface ProblemSubmitState {
  readonly phase: ProblemSubmitPhase;
  /** Khác `null` chỉ ở `done`. */
  readonly view: VerdictView | null;
  /** Khác `null` chỉ ở `error`. */
  readonly errorMessage: string | null;
  /**
   * Bài chưa chấm được (không testcase nào). `null` = chấm được.
   *
   * Màn hình phải NÓI RA câu này thay vì để nút nộp dẫn tới một `CE` khó hiểu.
   */
  readonly notice: string | null;
  /** Nộp lại. Dùng cho cả nút "Nộp bài" lẫn nút "Thử lại" sau khi hỏng. */
  readonly submit: () => void;
}

const CAU_CHUA_NOP_DUOC =
  'Bài này chưa có testcase nào nên chưa chấm được. Mở ở chế độ đọc và luyện ' +
  'tay; hãy báo cho tác giả bài.';

export function useProblemSubmit(
  engine: ArenaSessionHandle,
  mode: ArenaModeContext,
  startedAt: number,
): ProblemSubmitState {
  const problem = mode.problem;
  const utils = api.useUtils();
  const [view, setView] = useState<VerdictView | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const submitMutation = api.problems.submit.useMutation();
  const tryGradeMutation = api.problems.tryGrade.useMutation();
  const { mutateAsync } = submitMutation;
  const { mutateAsync: tryGradeAsync } = tryGradeMutation;

  const submit = useCallback(() => {
    if (problem === null) {
      return;
    }
    const log = engine.getLog();
    if (log === null) {
      // Phiên chưa dựng xong. NÓI RA thay vì gửi một nhật ký rỗng: một lượt nộp
      // không có hành động nào sẽ được chấm là `WA (0/n)` và ghi vào lịch sử
      // nộp của người chơi — mất một lượt vì một lỗi thời điểm của chúng ta.
      setLocalError('Phiên chơi chưa sẵn sàng nên chưa lấy được nhật ký lượt chơi.');
      return;
    }
    setLocalError(null);
    void (async () => {
      try {
        /*
         * Nhật ký của ĐÚNG lượt vừa chơi, lấy thẳng từ engine: `levelId`, `seed`
         * và `actions` đi cùng nhau hoặc không đi. Ghép `seed` của engine với
         * `actions` của một bản khác là một lượt phát lại ra trạng thái khác, và
         * người chơi nhận `CE` mà không hiểu vì sao.
         *
         * `gameId` viết TƯỜNG MINH chứ không rải `...log`: `RunLog.gameId` khai
         * `GameId` (mọi game của repo) trong khi lượt nộp này chốt `'k8s'`.
         * Liệt kê từng trường làm phép hẹp kiểu thành một câu đọc được, thay vì
         * một `as never` che mất việc hai kiểu thật sự lệch nhau.
         *
         * Dựng MỘT LẦN rồi dùng cho cả hai lượt gọi — `tryGrade` và `submit`
         * phải nhận y hệt một nhật ký, nếu không thì "thử thì đạt, nộp thì
         * trượt" và không ai biết vì sao.
         */
        const runLog = {
          gameId: 'k8s' as const,
          levelId: log.levelId,
          seed: log.seed,
          actions: log.actions,
        };
        /*
         * Chấm THỬ trước, rồi nộp bằng chính kết quả đó. `tryGrade` không ghi
         * dòng nào; `submit` thì có.
         */
        const thu = await tryGradeAsync({ code: problem.code, runLog });
        const result = await mutateAsync({
          code: problem.code,
          runLog,
          claimed: k8sOjClaim({
            problem,
            log,
            /*
             * `objectivesMet` tới từ MÁY CHỦ, không từ `engine.status`. Phiên cục
             * bộ không có `check` nên nó luôn trả rỗng — xem khối chú thích ở
             * `K8sOjClaimInput.objectivesMet`.
             */
            objectivesMet: thu.passed,
            startedAt,
            finishedAt: Date.now(),
          }),
        });
        /*
         * Đọc lại teaser TRƯỚC khi dựng view: nhãn của testcase ẩn vừa mở khoá
         * bởi chính lượt nộp này.
         */
        const fresh = await utils.problems.byCode.fetch({ code: problem.code });
        setView(toVerdictView(result.grade, fresh.problem.testcases));
      } catch (error) {
        /*
         * KHÔNG nuốt. Lượt chơi vẫn còn nguyên trong engine, nên nút "Thử lại"
         * gọi lại đúng hook này và nộp lại đúng nhật ký đó —
         * `rules/development-principles.md` § Errors Over Silent Fallbacks.
         */
        setLocalError(describeTrpcError(error));
      }
    })();
  }, [problem, engine, mutateAsync, tryGradeAsync, startedAt, utils]);

  /*
   * ⛔ KHÔNG còn tự nộp khi `engine.status.phase === 'won'` — gỡ 2026-09-15.
   *
   * Nhánh đó không thể chạy nữa, và nó không chạy vì một lý do cấu trúc chứ
   * không phải một cờ tắt: level tổng hợp của chế độ bài tập mang vị từ RỖNG
   * (§18.B.4 cắt `check` ở wire), nên `evaluateObjectives` không bao giờ đánh
   * dấu mục tiêu nào đạt và phiên không bao giờ tới pha `won`. Giữ lại một
   * `useEffect` chờ một pha không tới được là để lại mã chết trông như đang
   * sống — và người sau sẽ đọc nó như bằng chứng rằng tự-nộp đang hoạt động.
   *
   * Nộp bài ở chế độ này là một hành động TƯỜNG MINH: nút "Nộp bài" của
   * `ProblemSubmitPanel`. Điều đó cũng đúng hơn về mặt sản phẩm — bài OJ không
   * có khái niệm "thắng màn", chỉ có lượt nộp và verdict.
   */

  const notice = problem !== null && !k8sOjGradable(problem) ? CAU_CHUA_NOP_DUOC : null;

  if (problem === null) {
    return { phase: 'idle', view: null, errorMessage: null, notice: null, submit };
  }
  if (localError !== null) {
    return { phase: 'error', view: null, errorMessage: localError, notice, submit };
  }
  if (submitMutation.isPending || tryGradeMutation.isPending) {
    return { phase: 'pending', view: null, errorMessage: null, notice, submit };
  }
  if (view !== null) {
    return { phase: 'done', view, errorMessage: null, notice, submit };
  }
  return { phase: 'idle', view: null, errorMessage: null, notice, submit };
}
