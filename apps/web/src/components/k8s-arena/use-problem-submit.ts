'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Level } from '@devops-platform/games';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { toVerdictView, type VerdictView } from '../../server/problems/verdict-view';
import type { ArenaModeContext } from './arena-contract';
import type { ArenaSessionHandle } from './arena-session';
import { buildRunResult } from './run-result';

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
 * ## Vì sao import `toVerdictView` từ `src/server/problems/`
 *
 * Vì đó là NGUỒN DUY NHẤT được phép suy verdict: nó gọi `problemVerdictOf` của
 * `packages/games`, và §18.C.3 nói phép so verdict client-với-server chỉ có
 * nghĩa khi hai bên dùng chung một hàm. Viết một bản thứ hai ở đây — kể cả một
 * dòng `passed === total` trông vô hại — là làm phép so đó nói về hai hàm thay
 * vì nói về engine.
 *
 * `verdict-view.ts` thuần: nó chỉ import `@devops-platform/games`, không chạm
 * `node:*`, không chạm DB. Không có `server-only` ở đầu file. Và đấu trường đã
 * kéo chính barrel đó vào bundle client sẵn (`arena-session.ts` gọi
 * `createSession`), nên nhánh import này không thêm gì mới vào bundle.
 *
 * ⚠ Nếu lane máy chủ thêm `import 'server-only'` vào `verdict-view.ts` thì
 * `next build` sẽ đỏ ngay tại đây. Đường sửa đúng khi đó KHÔNG phải là chép
 * `toVerdictView` sang tầng client, mà là đẩy nó xuống `packages/games` —
 * chỗ `problemVerdictOf` đã ở. Đã báo lead.
 *
 * ## Vì sao phải gọi `byCode` một lần nữa ở đây
 *
 * `submitProblem` trả `grade` mang `passed: string[]` và `total` — TOÀN LÀ ID,
 * không có nhãn nào. `toVerdictView` cần `TestcaseTeaser[]` để nói *testcase
 * NÀO* đỏ, và bộ teaser đó chỉ tới từ `problems.byCode`. Đây là một khe trong
 * hợp đồng dây, không phải một lựa chọn: xem báo cáo lane.
 *
 * `invalidate` sau khi nộp là BẮT BUỘC chứ không phải cho mới: `toTestcaseTeasers`
 * chỉ mở nhãn của testcase ẩn khi `afterSubmit` là `true`, và trước lượt nộp
 * đầu tiên mọi nhãn ẩn về `null`. Không đọc lại thì danh sách "cái này sai" hiện
 * ra toàn dòng *"Testcase ẩn chưa hiện tên"* đúng vào lúc người làm cần tên nhất.
 */
export type ProblemSubmitPhase = 'idle' | 'pending' | 'done' | 'error';

export interface ProblemSubmitState {
  readonly phase: ProblemSubmitPhase;
  /** Khác `null` chỉ ở `done`. */
  readonly view: VerdictView | null;
  /** Khác `null` chỉ ở `error`. */
  readonly errorMessage: string | null;
  /** Nộp lại. Dùng cho cả nút "Nộp bài" lẫn nút "Thử lại" sau khi hỏng. */
  readonly submit: () => void;
}

export function useProblemSubmit(
  level: Level,
  engine: ArenaSessionHandle,
  mode: ArenaModeContext,
  startedAt: number,
): ProblemSubmitState {
  const code = mode.problemCode;
  const utils = api.useUtils();
  const [view, setView] = useState<VerdictView | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const submitMutation = api.problems.submit.useMutation();
  const { mutateAsync } = submitMutation;

  const submit = useCallback(() => {
    if (code === null) {
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
        const result = await mutateAsync({
          code,
          /*
           * Nhật ký của ĐÚNG lượt vừa chơi, lấy thẳng từ engine: `levelId`,
           * `seed` và `actions` đi cùng nhau hoặc không đi. Ghép `seed` của
           * engine với `actions` của một bản khác là một lượt phát lại ra trạng
           * thái khác, và người chơi nhận `CE` mà không hiểu vì sao.
           */
          runLog: {
            /*
             * `gameId` viết TƯỜNG MINH chứ không rải `...log`, và đó là một
             * khe hợp đồng chứ không phải chuộng dài dòng: `RunLog.gameId`
             * khai `GameId` (mọi game của repo) trong khi `problems.submit`
             * chốt `z.literal('k8s')`. `tsc` từ chối phép gán, và nó đúng.
             *
             * Liệt kê từng trường làm phép hẹp kiểu thành một câu đọc được,
             * thay vì một `as never` che mất việc hai kiểu thật sự lệch nhau.
             * Ba trường còn lại đi NGUYÊN từ engine.
             */
            gameId: 'k8s',
            levelId: log.levelId,
            seed: log.seed,
            actions: log.actions,
          },
          claimed: buildRunResult(level, engine, startedAt, Date.now()),
        });
        /*
         * Đọc lại teaser TRƯỚC khi dựng view: nhãn của testcase ẩn vừa mở khoá
         * bởi chính lượt nộp này.
         */
        const fresh = await utils.problems.byCode.fetch({ code });
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
  }, [code, engine, level, mutateAsync, startedAt, utils]);

  /*
   * Tự nộp đúng MỘT LẦN khi lượt chơi kết thúc thắng, ở chế độ bài tập.
   *
   * `submittedRef` là thứ chặn nộp lặp, không phải mảng phụ thuộc: `phase` giữ
   * nguyên `won` sau khi thắng và `engine.status` đổi danh tính theo từng nhịp
   * engine, nên không chặn thì mỗi nhịp là một lượt nộp mới — cùng cái bẫy mà
   * `useRecordWin` đã ghi lại, chỉ khác là ở đây nó đập vào máy chủ.
   */
  const submittedRef = useRef(false);
  const phase = engine.status.phase;
  useEffect(() => {
    if (code === null || phase !== 'won' || submittedRef.current) {
      return;
    }
    submittedRef.current = true;
    submit();
  }, [code, phase, submit]);

  if (code === null) {
    return { phase: 'idle', view: null, errorMessage: null, submit };
  }
  if (localError !== null) {
    return { phase: 'error', view: null, errorMessage: localError, submit };
  }
  if (submitMutation.isPending) {
    return { phase: 'pending', view: null, errorMessage: null, submit };
  }
  if (view !== null) {
    return { phase: 'done', view, errorMessage: null, submit };
  }
  return { phase: 'idle', view: null, errorMessage: null, submit };
}
