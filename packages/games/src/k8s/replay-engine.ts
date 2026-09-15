/**
 * Adapter phát lại của game K8s: dựng một `ReplayEngine` từ `CreateSession` thật.
 *
 * VÌ SAO FILE NÀY Ở `k8s/` CHỨ KHÔNG Ở `core/verify.ts`
 * ----------------------------------------------------
 * Nó ở `core/verify.ts` cho tới 18.A, và đó là món nợ duy nhất còn lại sau
 * 17.A.2: phần *chạy* của `verify.ts` đã lên dạng rộng (`GameAction` / `RunLog`
 * của `core/run-log.ts`) nhưng riêng hàm này vẫn kéo NĂM kiểu K8s
 * (`CreateSession`, `K8sGameAction`, `K8sSession`, `Level`, `SessionStatus`)
 * ngược vào `core/`. Chính `verify.ts` đã tự cảnh báo điều đó:
 *
 *   "File này cố ý làm việc trên DẠNG RỘNG: nó chỉ đọc `tick` và `kind`, nên nó
 *    đúng với mọi game. Kéo `K8sGameAction` vào đây là trói ngược cơ chế chống
 *    gian lận về lại đúng một game."
 *
 * Hệ quả thật, không phải sạch sẽ kiến trúc: §18.C chấm lại phía server dựa
 * thẳng vào `verifyRun`. Chừng nào `core/verify.ts` còn biết K8s là gì thì "OJ
 * đa-game" mới đúng ở tầng `Problem` mà chưa đúng ở tầng CHẤM — một bài Git
 * không có đường đi qua bộ xác minh.
 *
 * Hình dạng ở đây khớp với kiến trúc plugin mà 18.A dựng: giao diện ở `core/`
 * (`ReplayEngine`), hiện thực cụ thể ở package của từng game.
 *
 * ⚠ Tên export giữ NGUYÊN `sessionReplayEngine`. `apps/web/src/server/problems/`
 * gọi nó qua gốc package (`@devops-platform/games`), và `package.json` chỉ mở
 * đúng một subpath `"."` — nên chuyển nhà file này không đụng tới phía web,
 * miễn là barrel vẫn export đúng cái tên đó.
 */

import type { ReplayEngine, RunTally } from '../core/verify.ts';
import type {
  CreateSession,
  K8sGameAction,
  K8sSession,
  Level,
  SessionStatus,
} from './contract.ts';

/**
 * Dựng `ReplayEngine` từ `CreateSession` THẬT của lane B.
 *
 * Đây là adapter mà chỗ dùng thật sẽ gọi; `ReplayEngine` ở `core/verify.ts` vẫn
 * là kiểu generic để (a) test được bằng engine giả, kể cả engine cố tình không
 * tất định, và (b) game sau không phải là Kubernetes vẫn tái dùng được
 * `verifyRun`.
 *
 * ⚠ `autoTick: false` là BẮT BUỘC, không phải một tuỳ chọn hiệu năng. Bật lên
 * thì mô phỏng tiến theo đồng hồ tường, và một lần phát lại trên máy chậm sẽ ra
 * kết quả khác lần phát lại trên máy nhanh — xác minh mất hết ý nghĩa và mọi
 * người chơi hợp lệ bị gắn cờ. Phát lại KHÔNG được phụ thuộc thời gian thật.
 *
 * `project` trả thẳng `getView()` (tức `ClusterView`) thay vì bốc vài field: mô
 * hình lúc chạy của lane B còn `ready` và `restartCount` là các trục riêng của
 * `phase`, và sẽ còn dày lên nữa. So trên hình chiếu đầy đủ thì phép so vẫn đúng
 * khi mô hình lớn thêm; bốc tay field thì im lặng mù dần.
 */
export function sessionReplayEngine(
  createSession: CreateSession,
  level: Level,
  scoreRun: (status: SessionStatus, tally: RunTally) => number,
): ReplayEngine<K8sSession> {
  return {
    init: (levelId, seed) => {
      // Nhật ký thuộc level khác thì phát lại vô nghĩa — ném để thành
      // `phat-lai-loi` (lỗi của ta / của dữ liệu), chứ không âm thầm chấm sai.
      if (levelId !== level.id) {
        throw new Error(`nhật ký thuộc level "${levelId}" nhưng được phát lại trên "${level.id}"`);
      }
      /*
       * `honorActionTick: true` — nhật ký MANG tick thật của lượt chơi, và ở
       * đây nó là thẩm quyền. Thiếu cờ này thì phiên đóng dấu lại mọi action
       * bằng `state.tick` của một phiên không đồng hồ (luôn 0), mô phỏng đứng
       * im, và mọi vị từ đòi pod `Running` trượt — lời giải ĐÚNG ra `WA`.
       * Xem `CreateSessionOptions.honorActionTick`.
       */
      return createSession({ level, seed, autoTick: false, honorActionTick: true });
    },
    reduce: (session, action) => {
      /*
       * `ReplayEngine.reduce` nhận DẠNG RỘNG (mọi game), còn `K8sSession.dispatch`
       * đòi `K8sGameAction`. Chỗ thu hẹp phải ở đây, và phải THU HẸP CÓ KIỂM —
       * `as` trần sẽ đẩy một action của game Git vào reducer K8s, nơi nó rơi vào
       * nhánh `default` và biến mất KHÔNG một tiếng động: phát lại ra một trạng
       * thái thiếu, điểm lệch, và `verifyRun` báo `khong-khop` — tức là đổ lỗi
       * cho người chơi vì một lỗi ghép engine của ta.
       *
       * Ném thì `verifyRun` bắt thành `phat-lai-loi`, đúng ô "lỗi của ta hoặc
       * của dữ liệu, KHÔNG phải bằng chứng gian lận".
       */
      if (action.gameId !== 'k8s') {
        throw new Error(
          `nhật ký của game "${action.gameId}" không phát lại được trên engine K8s`,
        );
      }
      /*
       * Vẫn cần `as` sau phép kiểm: `core/` chỉ biết `target` là `ResourceRefLike`
       * (`kind: string`), còn `dispatch` đòi `ResourceRef` (`kind: ResourceKind`).
       * Kiểm lại `kind` ở đây là chép `resolveKind` sang chỗ thứ hai; và không cần
       * — một `kind` bịa ra không tra ra object nào trong `reducer.ts`, nên hành
       * động không được chấp nhận và phát lại lệch đúng như nó phải lệch.
       */
      session.dispatch(action as K8sGameAction);
      return session;
    },
    objectivesMet: (session) => session.getStatus().objectivesMet,
    score: (session, tally) => scoreRun(session.getStatus(), tally),
    project: (session) => session.getView(),
    dispose: (session) => session.dispose(),
  };
}
