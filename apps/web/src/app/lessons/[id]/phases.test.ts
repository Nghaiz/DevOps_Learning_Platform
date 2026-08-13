import { describe, expect, it } from 'vitest';
import type { Scenario, ScenarioPhase, ScenarioStep } from '@devops-platform/shared-types/scenario';
import { buildPhases, canCheck, phaseKeyForStepIndex } from './phases';

function phase(over: Partial<ScenarioPhase> = {}): ScenarioPhase {
  return {
    title: null,
    markdown: '',
    setup: { foreground: null, background: null },
    verifyScript: null,
    ...over,
  };
}

function step(index: number, over: Partial<ScenarioStep> = {}): ScenarioStep {
  return { ...phase(), index, ...over };
}

function scenario(over: Partial<Scenario> = {}): Scenario {
  return { intro: null, finish: null, steps: [step(0)], ...over } as Scenario;
}

describe('buildPhases', () => {
  it('xâu chuỗi intro → các step → finish', () => {
    const phases = buildPhases(
      scenario({
        intro: phase({ title: 'Mở đầu' }),
        steps: [step(0, { title: 'A' }), step(1, { title: 'B' })],
        finish: phase({ title: 'Xong' }),
      }),
    );

    expect(phases.map((p) => p.key)).toEqual(['intro', 'step0', 'step1', 'finish']);
    expect(phases.map((p) => p.label)).toEqual(['Mở đầu', 'A', 'B', 'Xong']);
  });

  it('bỏ qua intro/finish khi chúng vắng mặt', () => {
    // `index.json` cho phép thiếu cả hai. Một mảng phase chèn sẵn ô rỗng sẽ tạo
    // ra nút bấm không mở được gì.
    const phases = buildPhases(scenario({ steps: [step(0)] }));
    expect(phases.map((p) => p.key)).toEqual(['step0']);
  });

  it('step KHÔNG có title rơi về "Bước N" — không để nhãn rỗng', () => {
    // `loki-quickstart` có title null ở cả hai step. Nhãn rỗng = nút không bấm trúng.
    const phases = buildPhases(scenario({ steps: [step(0), step(1)] }));
    expect(phases.map((p) => p.label)).toEqual(['Bước 1', 'Bước 2']);
  });

  it('chỉ step mang stepIndex; intro/finish là null', () => {
    // Đây là ranh giới giữa hai hệ đếm. Nếu intro nhận một stepIndex, `saveProgress`
    // sẽ ghi tiến độ mỗi lần người học bấm vào phần giới thiệu.
    const phases = buildPhases(
      scenario({ intro: phase(), steps: [step(0)], finish: phase() }),
    );
    expect(phases.map((p) => p.stepIndex)).toEqual([null, 0, null]);
  });

  it('ref gửi lên tRPC khớp đúng loại phase', () => {
    const phases = buildPhases(
      scenario({ intro: phase(), steps: [step(0), step(1)], finish: phase() }),
    );
    expect(phases.map((p) => p.ref)).toEqual([
      { kind: 'intro' },
      { kind: 'step', index: 0 },
      { kind: 'step', index: 1 },
      { kind: 'finish' },
    ]);
  });
});

describe('phaseKeyForStepIndex', () => {
  it('mở lại đúng step đang dở', () => {
    const phases = buildPhases(scenario({ intro: phase(), steps: [step(0), step(1)] }));
    expect(phaseKeyForStepIndex(phases, 1)).toBe('step1');
  });

  it('stepIndex ngoài phạm vi rơi về phase đầu, KHÔNG ném', () => {
    // Xảy ra thật khi ta sửa nội dung bài sau lúc người học đã đi được nửa
    // đường. Mất chỗ đang dở còn hơn là không mở được bài.
    const phases = buildPhases(scenario({ intro: phase(), steps: [step(0)] }));
    expect(phaseKeyForStepIndex(phases, 99)).toBe('intro');
  });
});

describe('canCheck', () => {
  it('chỉ true khi phase CÓ script chấm', () => {
    // `checkStep` NÉM PRECONDITION_FAILED khi verifyScript là null, nên một nút
    // hiện vô điều kiện là một nút chỉ biết báo lỗi (`loki-quickstart`: không
    // phase nào có verify).
    const [withVerify] = buildPhases(scenario({ steps: [step(0, { verifyScript: 'true' })] }));
    const [without] = buildPhases(scenario({ steps: [step(0)] }));

    expect(withVerify === undefined ? null : canCheck(withVerify)).toBe(true);
    expect(without === undefined ? null : canCheck(without)).toBe(false);
  });
});
