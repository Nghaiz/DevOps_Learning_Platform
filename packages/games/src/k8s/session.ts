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
  K8sGameAction,
  K8sRunLog,
  K8sSession,
  Level,
  Objective,
  SessionPhase,
  SessionStatus,
} from './contract.ts';
import type { ClusterState } from './model.ts';
import { findByUid } from './model.ts';
import { describeObject } from './describe.ts';
import { toManifestYaml } from './manifest-yaml.ts';
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
/**
 * Kết quả người dùng nhìn thấy được của một `dispatch`.
 *
 * Tồn tại vì `K8sSession.dispatch` trả `void`, nên `ReduceResult.output` — nơi
 * engine ghi *"Không lưu được thay đổi: …"* — bị vứt đi trước khi tới giao diện.
 * Hệ quả đo được: bấm Lưu trên một YAML sai cú pháp thì KHÔNG CÓ GÌ xảy ra và
 * không có gì nói tại sao, đúng thứ mà `development-principles.md` §"Errors Over
 * Silent Fallbacks" cấm.
 */
export interface DispatchOutcome {
  /** Văn bản engine phát ra. Chuỗi rỗng khi hành động không có gì để nói. */
  readonly output: string;
  /** `false` ⇒ hành động bị TỪ CHỐI và không vào `RunLog`. */
  readonly accepted: boolean;
}

export interface K8sEngineSession extends K8sSession {
  /** Gõ một lệnh vào thanh lệnh. Trả về văn bản để in ra, và tự ghi vào log. */
  runCommand(command: string): string;
  /**
   * Như `dispatch`, nhưng TRẢ LẠI thứ engine nói.
   *
   * `dispatch` giữ nguyên chữ ký `void` của hợp đồng tối thiểu và uỷ quyền vào
   * đây, nên chỉ có MỘT đường áp hành động — không có nhánh thứ hai để lệch.
   */
  dispatchDetailed(action: K8sGameAction): DispatchOutcome;
  /** Đọc trạng thái thô — dùng cho test và cho `verify.ts`, KHÔNG cho renderer. */
  getState(): ClusterState;
  /**
   * Khối `kubectl describe` của một object, tra theo uid. `null` = không có
   * object nào mang uid đó (đã bị xoá, hoặc uid tới từ một snapshot cũ).
   *
   * ## Vì sao ở ĐÂY chứ không ở `K8sSession`
   *
   * `K8sSession` là hợp đồng TỐI THIỂU và có hai bản giả trong test dựng thủ
   * công; thêm một method bắt buộc vào đó làm cả hai đỏ mà chẳng đổi gì về chất.
   * `K8sEngineSession` sinh ra đúng để chứa "phần lane E cần mà hợp đồng tối
   * thiểu cố ý không mang", và `runCommand` — cũng là một tính năng giao diện
   * hạng nhất — đã ở đây. Chỗ này là chỗ của nó.
   *
   * Lane giao diện KHÔNG cần thêm dòng nào ở barrel: `createSession` đã được
   * export, và kiểu trả về suy ra của nó mang sẵn method này. Chỉ lưu ý đừng
   * chú kiểu biến giữ phiên là `K8sSession` — chú như thế sẽ xoá mất method.
   *
   * ## Vì sao là method của phiên chứ không phải một hàm thuần lane E tự gọi
   *
   * Dựng mô tả cần `ClusterState` đầy đủ (spec container, `lastState`, danh sách
   * event có `reason`), và `getState()` ghi rõ là KHÔNG dành cho renderer. Trả
   * một chuỗi đã dựng xong giữ nguyên ranh giới đó: giao diện không bao giờ cầm
   * trạng thái thô, và chỉ có một bộ sinh mô tả cho cả thanh lệnh lẫn tab Mô tả.
   */
  describe(uid: string): string | null;
  /**
   * Manifest YAML ĐẦY ĐỦ của một object, tra theo uid. `null` = không có object
   * nào mang uid đó.
   *
   * ⛔ Đây là thứ ô soạn thảo YAML phải đọc, KHÔNG phải `objectToYaml` của tầng
   * giao diện. `objectToYaml` tuần tự hoá `ObjectView` — một phép chiếu để hiển
   * thị, không mang `spec` — nên lưu lại bản đó sẽ XOÁ SẠCH spec của tài nguyên
   * (`edit` thay nguyên `spec` bằng những gì YAML nói). Đã xảy ra thật:
   * `manifest-yaml.ts` ghi lại đo đạc.
   *
   * Cùng lý do tồn tại với `describe`: dựng nó cần `ClusterState` đầy đủ, mà
   * `getState()` ghi rõ là KHÔNG dành cho renderer.
   */
  manifest(uid: string): string | null;
}

export function createSession(options: CreateSessionOptions): K8sEngineSession {
  const { level, seed } = options;
  const autoTick = options.autoTick ?? true;
  const namespace = defaultNamespace(level);

  let state = initialState(level, seed);
  const actions: K8sGameAction[] = [];
  const listeners = new Set<() => void>();

  let cachedView: ClusterView = toView(state);
  let cachedFrom: ClusterState = state;
  let cachedStatus: SessionStatus = buildStatus(state, level, actions);
  let statusFrom: ClusterState = state;
  let disposed = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  /**
   * Hệ số nhịp phát. KHÔNG nằm trong `ClusterState` và KHÔNG vào `RunLog`: nó
   * đổi đồng hồ treo tường, không đổi chuỗi tick. Cùng chuỗi action ở 1x và 4x
   * cho ra đúng cùng một trạng thái — xem chú thích `setSpeed` ở `contract.ts`.
   */
  let speed = 1;
  /**
   * Tạm dừng — TÁCH khỏi `speed`, không phải `speed === 0`.
   *
   * Gộp hai thứ lại sẽ mất thông tin "người dùng đã chọn 4×" ngay khi họ bấm tạm
   * dừng, và `resume()` chỉ còn cách nhảy về 1×. Hai biến thì `resume()` trả
   * đúng nhịp người dùng đang xem dở.
   */
  let paused = false;

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

  /**
   * ⚠ Điều kiện `paused` nằm ở ĐÂY chứ không ở từng chỗ gọi.
   *
   * `setSpeed` dựng lại bộ đếm giờ để đổi chu kỳ, và nếu phép kiểm tạm dừng nằm
   * ở `pause()` thôi thì một lần `setSpeed` trong lúc đang dừng sẽ âm thầm cho
   * cụm chạy lại — người chơi bấm tạm dừng, kéo thanh tốc độ, và cụm chạy tiếp
   * mà nút vẫn hiện "đang dừng". Gác ở đây thì mọi đường vào đều bị chặn.
   */
  function startTimer(): void {
    if (!autoTick || paused || timer !== null) {
      return;
    }
    timer = setInterval(() => {
      if (disposed) {
        return;
      }
      commit(advance(state, 1));
    }, Math.max(1, Math.round(TICK_MS / speed)));
  }

  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  /**
   * Đường DUY NHẤT áp một hành động. Cả `dispatch` lẫn `dispatchDetailed` gọi
   * vào đây, nên không có nhánh thứ hai để hai bên lệch nhau.
   *
   * ⚠ `action.tick` bị GHI ĐÈ bằng tick hiện tại của mô phỏng.
   *
   * Bên gọi không có cách nào biết tick hiện tại mà không đọc trạng thái, và một
   * `tick` sai trong log làm bản phát lại lệch — reducer sẽ tua tới một thời
   * điểm khác thời điểm hành động thật sự xảy ra. Ghi đè ở đây là chỗ duy nhất
   * biết chắc con số đúng.
   */
  function applyAction(action: K8sGameAction): DispatchOutcome {
    if (disposed) {
      return { output: '', accepted: false };
    }
    const stamped = { ...action, tick: state.tick } as K8sGameAction;
    const result = reduce(state, stamped, namespace);
    if (result.accepted) {
      actions.push(stamped);
    }
    commit(result.state);
    return { output: result.output, accepted: result.accepted };
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

    dispatch(action: K8sGameAction): void {
      /*
       * Uỷ quyền qua BIẾN CỤC BỘ, không qua `this.dispatchDetailed`. Bên gọi
       * hoàn toàn có thể rút method ra khỏi phiên (`const { dispatch } =
       * session`) — `arena-session.ts` bọc chúng trong `useCallback` — và lúc
       * đó `this` là `undefined`, tức mọi hành động của người chơi ném ở dòng
       * đầu tiên.
       */
      applyAction(action);
    },

    dispatchDetailed(action: K8sGameAction): DispatchOutcome {
      return applyAction(action);
    },

    runCommand(command: string): string {
      if (disposed) {
        return '';
      }
      const action: K8sGameAction = { gameId: 'k8s', tick: state.tick, kind: 'kubectl', command };
      const result = reduce(state, action, namespace);
      if (result.accepted) {
        actions.push(action);
      }
      commit(result.state);
      return result.output;
    },

    getLog(): K8sRunLog {
      return { gameId: 'k8s', levelId: level.id, seed, actions: [...actions] };
    },

    getState(): ClusterState {
      return state;
    },

    describe(uid: string): string | null {
      const object = findByUid(state, uid);
      return object === null ? null : describeObject(state, object);
    },

    manifest(uid: string): string | null {
      const object = findByUid(state, uid);
      return object === null ? null : toManifestYaml(object);
    },

    setSpeed(multiplier: number): void {
      /*
       * Kẹp và làm sạch đầu vào ngay tại đây thay vì tin người gọi: giá trị 0
       * hay âm sẽ cho ra chu kỳ `setInterval` bằng 0 hoặc âm, mà trình duyệt
       * diễn giải thành "nhanh nhất có thể" — tức treo tab, không phải báo lỗi.
       */
      const next = Number.isFinite(multiplier) ? Math.min(8, Math.max(0.25, multiplier)) : 1;
      if (next === speed) {
        return;
      }
      speed = next;
      /*
       * Đổi nhịp = dựng lại timer; `setInterval` không sửa chu kỳ được sau khi
       * tạo. Trong lúc đang tạm dừng thì `startTimer` tự bỏ qua, nên tốc độ mới
       * được NHỚ mà cụm không chạy lại — `resume()` sau đó dùng đúng nhịp này.
       */
      stopTimer();
      startTimer();
    },

    /*
     * Hai hàm dưới đây tự bỏ qua khi đã ở đúng trạng thái được yêu cầu, nên gọi
     * `pause()` hai lần hay `resume()` lúc chưa dừng đều vô hại. Không tự bỏ qua
     * thì `resume()` thừa sẽ dựng thêm một `setInterval` thứ hai chồng lên cái
     * đang chạy, và cụm đập nhịp gấp đôi — một lỗi không có gì đỏ, chỉ có mô
     * phỏng chạy nhanh gấp đôi tốc độ ghi trên nút.
     */
    pause(): void {
      if (paused) {
        return;
      }
      paused = true;
      stopTimer();
    },

    resume(): void {
      if (!paused) {
        return;
      }
      paused = false;
      startTimer();
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
  actions: readonly K8sGameAction[],
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
