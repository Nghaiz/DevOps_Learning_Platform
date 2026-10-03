import { clamp01 } from '../journey-timeline';

/**
 * Kịch bản của khung terminal tua theo cuộn, viết thành hàm thuần `terminalStateAt(t)`.
 *
 * Vì sao không dùng một timeline GSAP: trạng thái pod đổi theo từng NẤC (Pending, rồi
 * ContainerCreating, rồi Running), và mỗi lần đổi nấc phải bắn một hiệu ứng scramble theo cả hai
 * chiều cuộn. Tính trạng thái từ `t` rồi so với khung trước là cách duy nhất để "cuộn ngược"
 * trả pod về Pending mà không phải đoán callback nào của timeline đã chạy.
 */

export const TERMINAL_STEPS = ['build', 'apply', 'watch', 'check'] as const;
export type TerminalStep = (typeof TERMINAL_STEPS)[number];

/** Cửa sổ gõ của bốn lệnh, theo thứ tự trong `home.term.cmd.*`. */
export const COMMAND_WINDOWS: readonly (readonly [number, number])[] = [
  [0.03, 0.12],
  [0.33, 0.4],
  [0.47, 0.54],
  [0.8, 0.86],
];
export const BUILD_OUTPUT: readonly [number, number] = [0.13, 0.31];
export const APPLY_OUTPUT: readonly [number, number] = [0.41, 0.45];
export const WATCH_HEADER_AT = 0.55;
export const PODS_IN: readonly [number, number] = [0.56, 0.6];
export const CREATING_AT = 0.61;
export const RUNNING_AT = 0.68;
export const POD_STAGGER = 0.035;
export const CURL_AT = 0.87;
export const CHECK_AT = 0.92;
/** Bước đang sáng ở cột chú thích bên trái; mốc là điểm bắt đầu của mỗi bước. */
export const STEP_STARTS: readonly number[] = [0, 0.32, 0.46, 0.79];

export interface TerminalState {
  readonly step: number;
  /** Số ký tự đã gõ của từng lệnh. */
  readonly typed: readonly number[];
  /** 0..1 cho cả khối output build; dòng i đầy khi tiến độ vượt (i+1)/số dòng. */
  readonly build: number;
  readonly applyLines: number;
  readonly header: boolean;
  readonly pods: number;
  /** Nấc trạng thái của từng pod: 0 Pending, 1 ContainerCreating, 2 Running. */
  readonly phases: readonly number[];
  readonly curl: boolean;
  readonly checked: boolean;
}

const span = (t: number, [from, to]: readonly [number, number]): number =>
  clamp01((t - from) / (to - from));

export function terminalStateAt(
  t: number,
  commands: readonly string[],
  applyLineCount: number,
  podCount: number,
): TerminalState {
  const typed = COMMAND_WINDOWS.map((window, index) =>
    Math.round(span(t, window) * (commands[index]?.length ?? 0)),
  );
  const phases = Array.from({ length: podCount }, (_, index) => {
    if (t >= RUNNING_AT + index * POD_STAGGER) return 2;
    if (t >= CREATING_AT + index * (POD_STAGGER / 2)) return 1;
    return 0;
  });
  let step = 0;
  for (let index = 0; index < STEP_STARTS.length; index += 1) {
    if (t >= (STEP_STARTS[index] ?? 1)) step = index;
  }
  return {
    step,
    typed,
    build: span(t, BUILD_OUTPUT),
    applyLines: Math.ceil(span(t, APPLY_OUTPUT) * applyLineCount),
    header: t >= WATCH_HEADER_AT,
    pods: Math.ceil(span(t, PODS_IN) * podCount),
    phases,
    curl: t >= CURL_AT,
    checked: t >= CHECK_AT,
  };
}

/** Số pod đang Running, cho giá máy 3D phía sau sáng đèn đúng nhịp với chữ. */
export const runningPods = (state: TerminalState): number =>
  state.phases.filter((phase, index) => index < state.pods && phase === 2).length;
