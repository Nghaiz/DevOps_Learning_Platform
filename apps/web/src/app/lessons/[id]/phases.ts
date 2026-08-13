import type { Scenario, ScenarioPhase } from '@devops-platform/shared-types/scenario';
import type { PhaseRef } from '../../../server/lessons/phase';

/**
 * Mô hình điều hướng của trang bài học — thuần, không React, test được.
 *
 * ## Vì sao KHÔNG dùng thẳng `stepIndex`
 *
 * `progress.stepIndex` đếm trên MẢNG STEP. Thanh điều hướng thì đi qua cả
 * `intro` và `finish` — hai phase có thể vắng mặt, độc lập nhau. Trộn hai hệ
 * đếm đó vào một con số là cách chắc chắn nhất để "Tiếp" ở intro nhảy sang step
 * 1, hoặc để `saveProgress` ghi nhầm chỉ số khi bài không có intro.
 *
 * Nên: điều hướng chạy trên `key` (chuỗi), còn tiến độ vẫn chạy trên `stepIndex`
 * (số) — và chỗ DUY NHẤT dịch giữa hai hệ là file này.
 */

export interface LessonPhase {
  /** `intro` | `step0` | `step1` | … | `finish`. */
  readonly key: string;
  readonly label: string;
  readonly phase: ScenarioPhase;
  /** Tham chiếu gửi lên tRPC (`checkStep`, `runSetup`). */
  readonly ref: PhaseRef;
  /** Chỉ số trong `scenario.steps`, hoặc `null` với intro/finish. */
  readonly stepIndex: number | null;
}

export function buildPhases(scenario: Scenario): LessonPhase[] {
  const out: LessonPhase[] = [];

  if (scenario.intro !== null) {
    out.push({
      key: 'intro',
      label: scenario.intro.title ?? 'Giới thiệu',
      phase: scenario.intro,
      ref: { kind: 'intro' },
      stepIndex: null,
    });
  }

  for (const step of scenario.steps) {
    out.push({
      key: `step${String(step.index)}`,
      // Killercoda cho phép step KHÔNG có title (`loki-quickstart` là vậy cả 2
      // step). Rơi về "Bước N" thay vì hiện một nút rỗng không bấm trúng.
      label: step.title ?? `Bước ${String(step.index + 1)}`,
      phase: step,
      ref: { kind: 'step', index: step.index },
      stepIndex: step.index,
    });
  }

  if (scenario.finish !== null) {
    out.push({
      key: 'finish',
      label: scenario.finish.title ?? 'Kết thúc',
      phase: scenario.finish,
      ref: { kind: 'finish' },
      stepIndex: null,
    });
  }

  return out;
}

/**
 * Phase nên mở khi vào lại bài, suy từ `progress.stepIndex`.
 *
 * Người học quay lại phải rơi đúng vào chỗ đang dở, không phải về intro — đó là
 * nửa "khôi phục" của ô AC "Progress lưu và khôi phục".
 */
export function phaseKeyForStepIndex(phases: readonly LessonPhase[], stepIndex: number): string {
  const match = phases.find((p) => p.stepIndex === stepIndex);
  // Không khớp (bài đổi số step sau khi người học đã đi được nửa đường) → về
  // phase đầu tiên thay vì ném: nội dung đổi là chuyện của ta, không phải lỗi
  // của người học, và mất chỗ đang dở còn hơn là không mở được bài.
  return match?.key ?? phases[0]?.key ?? 'intro';
}

/**
 * Nút "Kiểm tra" chỉ tồn tại khi phase CÓ script chấm.
 *
 * ⛔ Không phải chuyện thẩm mỹ: `lessons.checkStep` NÉM `PRECONDITION_FAILED`
 * khi `verifyScript === null`. `loki-quickstart` không có script chấm ở bất kỳ
 * phase nào, nên một nút hiện vô điều kiện sẽ là một nút chỉ biết báo lỗi.
 */
export function canCheck(phase: LessonPhase): boolean {
  return phase.phase.verifyScript !== null;
}
