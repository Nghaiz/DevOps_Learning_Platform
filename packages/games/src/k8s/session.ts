/**
 * `createSession` — ranh giới giữa máy mô phỏng (lane B) và giao diện (lane D/E).
 *
 * ## Đây là NƠI DUY NHẤT trong package được đọc đồng hồ treo tường
 *
 * `reducer.ts` và `tick.ts` thuần tuyệt đối, vì xác minh chống gian lận (§8.3)
 * phát lại chúng và mọi thứ không phát lại được đều làm một lượt chơi trung thực
 * bị gắn cờ. File này đổi thời gian thật thành SỐ TICK rồi gọi xuống — và đó là
 * toàn bộ phần "không thuần" của cả engine.
 *
 * ## `getView()` trả CÙNG MỘT THAM CHIẾU cho tới khi trạng thái đổi
 *
 * `useSyncExternalStore` của React so snapshot bằng `Object.is`. Trả một object
 * mới mỗi lần gọi ⇒ React kết luận trạng thái đổi ở mỗi lần render ⇒ vòng lặp
 * render vô hạn, kèm một stack trace không chỉ về đây. Vì thế `toView` được nhớ
 * lại và chỉ dựng lại khi CHÍNH `ClusterState` đổi tham chiếu — mà nó chỉ đổi
 * khi reducer thật sự sinh state mới, nên phép so `Object.is` ở đây là đủ và
 * không cần so sâu.
 */

import type {
  ClusterView,
  CreateSessionOptions,
  GameAction,
  K8sSession,
  Level,
  Objective,
  RunLog,
  SessionPhase,
  SessionStatus,
} from './contract.ts';
import type { ClusterState } from './model.ts';
import { COMMAND_KINDS, countHints, countMoves, initialState, reduce } from './reducer.ts';
import { TICK_MS, advance } from './tick.ts';
import { toView } from './view.ts';
import { PREDICATES } from './predicates.ts';

/**
 * Namespace mặc định của phiên: namespace ĐẦU TIÊN mà level khai báo, không phải
 * `default`.
 *
 * Level đặt người chơi vào một namespace cụ thể (`hoc-tap`, `bao-cao`), và bắt họ
 * gõ `-n hoc-tap` ở mọi lệnh của level đầu tiên là dựng một rào không dạy gì —
 * người vận hành thật đặt namespace một lần trong context rồi quên nó đi. Level
 * nào muốn dạy chính chuyện namespace thì khai báo nhiều namespace và ra mục tiêu
 * ở namespace thứ hai.
 */
export function defaultNamespace(level: Level): string {
  return level.initialState.namespaces[0] ?? 'default';
}

/**
 * Objective đã đạt, tính lại TỪ ĐẦU mỗi lần gọi — không chốt lại.
 *
 * Một mục tiêu đạt rồi có thể mất lại (người chơi xoá đúng thứ vừa tạo, hoặc một
 * đợt chaos đánh sập nó), và nhìn thấy một ô đã tích quay về chưa-tích là học
 * được một điều đúng về Kubernetes: trạng thái mong muốn phải được DUY TRÌ, không
 * phải đạt một lần rồi thôi.
 *
 * Vị từ lạ (level gọi một tên chưa hiện thực) tính là CHƯA đạt và không ném. Một
 * level viết sai thì hỏng một level; ném ở đây thì hỏng cả phiên chơi.
 */
export function evaluateObjectives(
  state: ClusterState,
  objectives: readonly Objective[],
): readonly string[] {
  const met: string[] = [];
  for (const objective of objectives) {
    const predicate = PREDICATES[objective.check as keyof typeof PREDICATES];
    if (predicate === undefined) {
      continue;
    }
    if (predicate(state, objective.args ?? {})) {
      met.push(objective.id);
    }
  }
  return met;
}

/**
 * Thắng khi MỌI mục tiêu `required` đã đạt. Mục tiêu thưởng ăn điểm, không chặn.
 *
 * Level không có điều kiện THUA — `'lost'` dành cho challenge có đồng hồ, nơi hết
 * giờ là thua chứ không phải điểm thấp. Ở level, người chơi có thể làm hỏng cụm
 * tuỳ ý rồi sửa lại; phạt việc thử nghiệm là phạt đúng cái hành vi mà một môi
 * trường mô phỏng sinh ra để khuyến khích.
 */
export function sessionPhase(objectives: readonly Objective[], met: readonly string[]): SessionPhase {
  const required = objectives.filter((objective) => objective.required);
  if (required.length === 0) {
    return 'playing';
  }
  const done = new Set(met);
  return required.every((objective) => done.has(objective.id)) ? 'won' : 'playing';
}

/**
 * ⚠ Tách riêng khỏi `K8sSession` của hợp đồng: đây là phần lane E cần mà giao
 * diện `K8sSession` cố ý không mang (nó là hợp đồng tối thiểu). Lane E ép kiểu
 * xuống `K8sEngineSession` khi cần `runCommand` cho thanh lệnh.
 */
export interface K8sEngineSession extends K8sSession {
  /** Gõ một lệnh vào thanh lệnh. Trả về văn bản để in ra, và tự ghi vào log. */
  runCommand(command: string): string;
  /** Đọc trạng thái thô — dùng cho test và cho `verify.ts`, KHÔNG cho renderer. */
  getState(): ClusterState;
}

export function createSession(options: CreateSessionOptions): K8sEngineSession {
  const { level, seed } = options;
  const autoTick = options.autoTick ?? true;
  const namespace = defaultNamespace(level);

  let state = initialState(level, seed);
  const actions: GameAction[] = [];
  const listeners = new Set<() => void>();

  let cachedView: ClusterView = toView(state);
  let cachedFrom: ClusterState = state;
  let cachedStatus: SessionStatus = buildStatus(state, level, actions);
  let statusFrom: ClusterState = state;
  let disposed = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  function notify(): void {
    for (const listener of [...listeners]) {
      listener();
    }
  }

  /** Chỉ báo cho người nghe khi trạng thái THẬT SỰ đổi tham chiếu. */
  function commit(nextState: ClusterState): void {
    if (Object.is(nextState, state)) {
      return;
    }
    state = nextState;
    notify();
  }

  function startTimer(): void {
    if (!autoTick || timer !== null) {
      return;
    }
    timer = setInterval(() => {
      if (disposed) {
        return;
      }
      commit(advance(state, 1));
    }, TICK_MS);
  }

  startTimer();

  return {
    getView(): ClusterView {
      if (!Object.is(cachedFrom, state)) {
        cachedFrom = state;
        cachedView = toView(state);
      }
      return cachedView;
    },

    getStatus(): SessionStatus {
      if (!Object.is(statusFrom, state) || cachedStatus.movesUsed !== countMoves(actions)) {
        statusFrom = state;
        cachedStatus = buildStatus(state, level, actions);
      }
      return cachedStatus;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /**
     * ⚠ `action.tick` bị GHI ĐÈ bằng tick hiện tại của mô phỏng.
     *
     * Bên gọi không có cách nào biết tick hiện tại mà không đọc trạng thái, và
     * một `tick` sai trong log làm bản phát lại lệch — reducer sẽ tua tới một
     * thời điểm khác thời điểm hành động thật sự xảy ra. Ghi đè ở đây là chỗ duy
     * nhất biết chắc con số đúng.
     */
    dispatch(action: GameAction): void {
      if (disposed) {
        return;
      }
      const stamped = { ...action, tick: state.tick } as GameAction;
      const result = reduce(state, stamped, namespace);
      if (result.accepted) {
        actions.push(stamped);
      }
      commit(result.state);
    },

    runCommand(command: string): string {
      if (disposed) {
        return '';
      }
      const action: GameAction = { tick: state.tick, kind: 'kubectl', command };
      const result = reduce(state, action, namespace);
      if (result.accepted) {
        actions.push(action);
      }
      commit(result.state);
      return result.output;
    },

    getLog(): RunLog {
      return { levelId: level.id, seed, actions: [...actions] };
    },

    getState(): ClusterState {
      return state;
    },

    dispose(): void {
      disposed = true;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      listeners.clear();
    },
  };
}

function buildStatus(
  state: ClusterState,
  level: Level,
  actions: readonly GameAction[],
): SessionStatus {
  const met = evaluateObjectives(state, level.objectives);
  return {
    phase: sessionPhase(level.objectives, met),
    objectivesMet: met,
    hintsRevealed: countHints(actions),
    movesUsed: countMoves(actions),
  };
}

/** Re-export để lane E và lane G dùng CHUNG một định nghĩa phép đếm nước đi. */
export { COMMAND_KINDS };
