import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Scenario, ScenarioPhase } from '@devops-platform/shared-types/scenario';

/**
 * Trỏ tới một "phase" của scenario.
 *
 * Killercoda coi intro / step / finish là ba thứ CÙNG HÌNH DẠNG (`text` +
 * `foreground`/`background`/`verify`), và cả ba đều có thể mang script chấm. Nội
 * dung đã vendor chứng minh điều đó chứ không phải docs:
 * `loxilb-tcp-load-balancing` có `verify` ở **intro** và không có ở step nào.
 *
 * Nên `checkStep` KHÔNG thể chỉ nhận một `stepIndex`. Một API chỉ chấm được step
 * sẽ im lặng bỏ qua script chấm của intro, và bài đó hiện ra như "không có gì để
 * chấm" — một chế độ hỏng không có triệu chứng nào trỏ về nguyên nhân.
 */
export const phaseRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('intro') }).strict(),
  z.object({ kind: z.literal('finish') }).strict(),
  z.object({ kind: z.literal('step'), index: z.number().int().min(0) }).strict(),
]);

export type PhaseRef = z.infer<typeof phaseRefSchema>;

/**
 * Lấy phase theo ref, hoặc ném `NOT_FOUND` kèm thông điệp nói rõ bài có gì.
 *
 * ⚠ Tách khỏi router và export vì một lý do cụ thể: nhánh `intro === null` /
 * `finish === null` KHÔNG chạm được bằng nội dung đã vendor — cả bốn bài đều có
 * đủ intro lẫn finish. DTO thì cho phép vắng (`scenarioSchema` khai chúng
 * nullable, đúng theo Killercoda). Để nhánh đó nằm trong router nghĩa là nó vĩnh
 * viễn không có test nào giết được, tức một `return null` lọt vào đó sẽ không
 * làm ô nào đỏ. Là hàm thuần thì một scenario dựng tay giết được nó.
 */
export function resolvePhase(scenario: Scenario, ref: PhaseRef): ScenarioPhase {
  switch (ref.kind) {
    case 'intro':
    case 'finish': {
      const phase = ref.kind === 'intro' ? scenario.intro : scenario.finish;
      if (phase === null) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Bài "${scenario.id}" không có phần ${ref.kind}`,
        });
      }
      return phase;
    }
    case 'step': {
      const step = scenario.steps[ref.index];
      if (step === undefined) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Bài "${scenario.id}" chỉ có ${scenario.steps.length} step (yêu cầu index ${ref.index})`,
        });
      }
      return step;
    }
  }
}
