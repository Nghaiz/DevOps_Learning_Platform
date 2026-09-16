import { describe, expect, it } from 'vitest';
import {
  CI_LEVELS,
  mergeStageCatalogue,
  readWorkflowYaml,
  writeWorkflowYaml,
  type CacheSpec,
  type CicdLevel,
  type WorkflowSpec,
} from '@devops-platform/games';
import { runWorkflow, type CicdRunOutcome } from './cicd-run.ts';
import { appendSnippet, cicdSnippets } from './cicd-snippets.ts';

/**
 * Đo đường chạy THẬT của màn chơi CI/CD, không đo từng mảnh rời.
 *
 * ⚠ Ô đầu tiên là lý do file này tồn tại. `hydrateWorkflow` được NỐI vào
 * `runWorkflow` từ lúc dựng màn, nhưng nối không phải là đo: bỏ nó đi thì mọi
 * thứ vẫn biên dịch, vẫn chạy, vẫn hiện ba con số — chỉ là ba con số `0`, và
 * không ô nào đỏ. Ô "lead time > 0" ở đây là thứ duy nhất phân biệt hai trạng
 * thái đó. Xem `rules/green-that-proves-nothing.md`.
 */

function nguonCua(level: CicdLevel) {
  const catalogue = mergeStageCatalogue(
    level.initialWorkflow,
    level.solutionWorkflow,
    level.altSolutionWorkflow,
  );
  return () => ({ baseline: level.initialWorkflow, catalogue });
}

/** `retries`/`cache` người chơi đặt qua ô điều khiển riêng — ở đây lấy của lời giải. */
function overridesCua(spec: WorkflowSpec) {
  const retries: Record<string, number> = {};
  const cache: Record<string, CacheSpec | null> = {};
  for (const stage of spec.stages) {
    retries[stage.id] = stage.retries;
    for (const step of stage.steps) {
      cache[`${stage.id}/${step.id}`] = step.cache ?? null;
    }
  }
  return { retries, cache };
}

function chay(level: CicdLevel, spec: WorkflowSpec): CicdRunOutcome {
  return runWorkflow({
    yaml: writeWorkflowYaml(spec).yaml,
    sourcesFor: nguonCua(level),
    editable: level.editable,
    overrides: overridesCua(spec),
    workload: level.workload,
    evaluation: level.evaluation,
    objectives: level.objectives,
  });
}

describe('runWorkflow — lời giải mẫu đi qua ô soạn YAML và VẪN thắng', () => {
  const ca = CI_LEVELS.flatMap((level) => [
    { level, nhan: 'lời giải', wf: level.solutionWorkflow },
    { level, nhan: 'lời giải thay thế', wf: level.altSolutionWorkflow },
  ]);

  it.each(ca)('$level.id — $nhan', ({ level, wf }) => {
    const ket = chay(level, wf);
    if (ket.kind !== 'scored') {
      throw new Error(
        `Đáng lẽ chấm được, nhưng ra "${ket.kind}"` +
          (ket.kind === 'parse-error' ? `: ${ket.errors.map((e) => e.message).join(' | ')}` : ''),
      );
    }
    expect(ket.failingRequired).toEqual([]);
    expect(ket.won).toBe(true);
  });

  /*
   * Ô CHỐNG-XANH-KHỐNG. Ba ô trên vẫn xanh nếu `runWorkflow` đánh rơi
   * `hydrateWorkflow`: mọi mục tiêu về đồ thị vẫn đạt, chỉ có ba con số là 0.
   * Ô này là chỗ duy nhất phân biệt "đã ghép" với "chưa ghép".
   */
  it('ba trục điểm KHÁC 0 — bằng chứng tầng ghép thật sự chạy', () => {
    const level = CI_LEVELS[0];
    if (level === undefined) throw new Error('không có level nào');
    const ket = chay(level, level.solutionWorkflow);
    if (ket.kind !== 'scored') throw new Error(`ra "${ket.kind}"`);
    expect(ket.axes.leadTimeSeconds).toBeGreaterThan(0);
    expect(ket.axes.runnerMinutes).toBeGreaterThan(0);
  });
});

describe('runWorkflow — hai nhánh hỏng nói ra đúng loại hỏng', () => {
  const level = CI_LEVELS[0]!;

  it('YAML sai cú pháp ⇒ parse-error, kèm dòng thật', () => {
    const ket = runWorkflow({
      yaml: 'jobs:\n\tbuild:\n',
      sourcesFor: nguonCua(level),
      editable: level.editable,
      overrides: {},
      workload: level.workload,
      evaluation: level.evaluation,
      objectives: level.objectives,
    });
    expect(ket.kind).toBe('parse-error');
    if (ket.kind === 'parse-error') {
      expect(ket.errors[0]?.line).toBeGreaterThan(0);
    }
  });

  it('đồ thị có chu trình ⇒ bị chặn trước khi tới engine', () => {
    const ket = runWorkflow({
      yaml: 'jobs:\n  a:\n    needs:\n      - b\n    steps: []\n  b:\n    needs:\n      - a\n    steps: []\n',
      sourcesFor: nguonCua(level),
      editable: level.editable,
      overrides: {},
      workload: level.workload,
      evaluation: level.evaluation,
      objectives: level.objectives,
    });
    // 19.C.4 bắt chu trình ngay ở bộ đọc, nên nó về dưới dạng lỗi CÓ VỊ TRÍ.
    expect(ket.kind).toBe('parse-error');
    if (ket.kind === 'parse-error') {
      expect(ket.errors.some((e) => e.message.includes('Chu trình'))).toBe(true);
    }
  });
});

describe('cicdSnippets — mẩu chèn nhanh phải ĐỌC ĐƯỢC bằng chính bộ đọc', () => {
  /*
   * Bộ quét YAML của kho này là bản TỐI THIỂU: nó chỉ nhận `[]` và `{}` RỖNG ở
   * dạng dòng, và từ chối mọi tập hợp dạng dòng CÓ nội dung. Một mẩu viết
   * `needs: [clone]` trông hoàn toàn hợp lệ với mắt người quen GitHub Actions,
   * nhưng người chơi bấm nút chèn sẽ nhận ngay một lỗi cú pháp — do công cụ của
   * game gây ra, ở chỗ họ không có cách nào đoán.
   *
   * Ô này đo bằng cách CHẠY bộ đọc thật, không bằng cách đọc mã mẩu.
   */
  const may = ['linux'];

  it.each(cicdSnippets(may).map((s) => ({ id: s.id, yaml: s.yaml })))(
    'mẩu "$id" không dùng tập hợp dạng dòng có nội dung',
    ({ yaml }) => {
      expect(yaml).not.toMatch(/[[{]\s*[^\]}\s]/u);
    },
  );

  it('mẩu "Job mới" chèn vào tài liệu rỗng cho ra YAML đọc được', () => {
    const snippet = cicdSnippets(may).find((s) => s.id === 'job');
    if (snippet === undefined) throw new Error('không thấy mẩu job');
    const ket = readWorkflowYaml(appendSnippet('jobs:', snippet.yaml));
    if (!ket.ok) {
      throw new Error(`mẩu không đọc được: ${ket.errors.map((e) => e.message).join(' | ')}`);
    }
    expect(ket.workflow.stages.map((s) => s.id)).toEqual(['build']);
  });

  it('mẩu "needs" và "matrix" ghép vào một job thật vẫn đọc được', () => {
    const table = cicdSnippets(may);
    const needs = table.find((s) => s.id === 'needs')?.yaml ?? '';
    const matrix = table.find((s) => s.id === 'matrix')?.yaml ?? '';
    const nguon = ['jobs:', '  clone:', '    steps: []', '  build:', '    steps: []', needs, matrix].join('\n');
    const ket = readWorkflowYaml(nguon);
    if (!ket.ok) {
      throw new Error(`ghép mẩu không đọc được: ${ket.errors.map((e) => e.message).join(' | ')}`);
    }
    expect(ket.workflow.stages.find((s) => s.id === 'build')?.dependsOn).toEqual(['clone']);
  });
});
