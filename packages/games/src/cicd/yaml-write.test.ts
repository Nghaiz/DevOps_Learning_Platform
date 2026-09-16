/**
 * Ghim bộ ghi `WorkflowSpec` → YAML (19.C.2), và ô nghiệm thu VÒNG ĐỌC-GHI.
 *
 * Vòng `read(write(spec)) === spec` là phép đo duy nhất bắt được một bảng ánh
 * xạ lệch MỘT CHIỀU. Hai bộ có thể tự nhất quán: bộ đọc hiểu `continue-on-error`
 * đúng nghĩa đảo, bộ ghi phát nó ngược — mỗi bên đúng với test của chính mình,
 * và chỉ vòng khép kín mới lộ ra.
 *
 * Vòng này chỉ đóng được **khi `dropped` rỗng**, và đó không phải một chỗ nới
 * tay: tài liệu của nhà cung cấp không có khoá nào cho `durationTicks`,
 * `retries`, `flake`, `cache`, `requires`/`produces`, `runnerSlots`,
 * `approval`. Nửa sau file này đo chiều ĐÓ — một spec cho mỗi trường, khẳng
 * định bộ ghi KÊU LÊN thay vì nuốt.
 */
import { describe, expect, it } from 'vitest';

import type { StageSpec, WorkflowSpec } from './contract.ts';
import { readWorkflowYaml } from './yaml-read.ts';
import { writeWorkflowYaml } from './yaml-write.ts';

function buoc(id: string, name: string, blocking = true): StageSpec['steps'][number] {
  return { id, name, durationTicks: 0, blocking };
}

function chang(phan: Partial<StageSpec> & Pick<StageSpec, 'id' | 'kind' | 'name'>): StageSpec {
  return {
    dependsOn: [],
    steps: [],
    blocking: true,
    retries: 0,
    runnerClass: 'linux',
    ...phan,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tập spec CHỞ ĐƯỢC — mỗi phần tử mang một hình dạng mà bảng ánh xạ phải giữ
// ═══════════════════════════════════════════════════════════════════════════

const CHO_DUOC: readonly (readonly [string, WorkflowSpec])[] = [
  [
    'một stage, không phụ thuộc, không bước nào',
    { name: 'Tối thiểu', stages: [chang({ id: 'clone', kind: 'clone', name: 'Lấy mã nguồn' })] },
  ],
  [
    'chuỗi nối tiếp, có stage một phụ thuộc và stage hai phụ thuộc',
    {
      name: 'Đường ống ba chặng',
      stages: [
        chang({ id: 'clone', kind: 'clone', name: 'Lấy mã nguồn', steps: [buoc('buoc-1', 'git clone')] }),
        chang({ id: 'build', kind: 'build', name: 'Dựng', dependsOn: ['clone'], steps: [buoc('bd', 'Biên dịch')] }),
        chang({ id: 'lint', kind: 'lint', name: 'Kiểm hình thức', dependsOn: ['clone'] }),
        chang({ id: 'deploy', kind: 'deploy', name: 'Phát hành', dependsOn: ['build', 'lint'] }),
      ],
    },
  ],
  [
    'continue-on-error ở CẢ HAI tầng, và một stage chặn để đối chứng',
    {
      name: 'Nghĩa đảo',
      stages: [
        chang({
          id: 'lint',
          kind: 'lint',
          name: 'Chỉ cảnh báo',
          blocking: false,
          steps: [buoc('a', 'Bước bỏ qua được', false), buoc('b', 'Bước chặn', true)],
        }),
        chang({ id: 'build', kind: 'build', name: 'Dựng', blocking: true, steps: [buoc('c', 'Bước chặn')] }),
      ],
    },
  ],
  [
    'ma trận nhiều trục kèm loại trừ',
    {
      name: 'Quạt ra',
      stages: [
        chang({
          id: 'unit-test',
          kind: 'unit-test',
          name: 'Thử đơn vị',
          fanOut: {
            axes: [
              { name: 'node', values: ['20', '22'] },
              { name: 'os', values: ['ubuntu', 'mac'] },
            ],
            exclude: ['unit-test#22/mac'],
          },
        }),
      ],
    },
  ],
  [
    'ma trận một trục, không loại trừ',
    {
      name: 'Quạt một trục',
      stages: [
        chang({
          id: 'images',
          kind: 'publish',
          name: 'Build & push',
          fanOut: { axes: [{ name: 'ten', values: ['web', 'api'] }] },
        }),
      ],
    },
  ],
  [
    'environment',
    {
      name: 'Có môi trường',
      stages: [chang({ id: 'deploy', kind: 'deploy', name: 'Phát hành', environment: 'prod' })],
    },
  ],
  [
    'chuỗi cần nháy — số, boolean, dấu thăng, dấu hai chấm, nháy đơn',
    {
      name: '2026',
      stages: [
        chang({
          id: 'build',
          kind: 'build',
          name: 'true',
          runnerClass: 'linux-lon',
          steps: [
            buoc('s1', '# không phải chú thích'),
            buoc('s2', 'khoá: giá trị'),
            buoc('s3', "đừng 'bỏ' dấu nháy"),
            buoc('s4', '- không phải gạch đầu dòng'),
            buoc('s5', '1.5'),
          ],
        }),
      ],
    },
  ],
  [
    'nhiều stage cùng đọc ra một loại — thứ tự mảng là trình bày, phải giữ nguyên',
    {
      name: 'Giữ thứ tự',
      stages: [
        chang({ id: 'z-lint', kind: 'lint', name: 'Z' }),
        chang({ id: 'a-lint', kind: 'lint', name: 'A' }),
        chang({ id: 'm-lint', kind: 'lint', name: 'M' }),
      ],
    },
  ],
];

describe('vòng đọc-ghi', () => {
  for (const [ten, spec] of CHO_DUOC) {
    it(`read(write(spec)) bằng spec — ${ten}`, () => {
      const { yaml, dropped } = writeWorkflowYaml(spec);
      // Nếu vế này đỏ thì phép đo dưới nó vô nghĩa: vòng chỉ khép khi không
      // trường nào bị bỏ, nên `dropped` phải được khẳng định TRƯỚC.
      expect(dropped).toEqual([]);

      const ket = readWorkflowYaml(yaml);
      if (!ket.ok) {
        throw new Error(`YAML bộ ghi phát ra không đọc lại được:\n${yaml}\n${JSON.stringify(ket.errors, null, 2)}`);
      }
      expect(ket.workflow).toEqual(spec);
    });
  }

  it('vòng thứ HAI cũng bằng — bộ ghi không trôi qua mỗi lượt', () => {
    for (const [, spec] of CHO_DUOC) {
      const mot = writeWorkflowYaml(spec).yaml;
      const ket = readWorkflowYaml(mot);
      if (!ket.ok) {
        throw new Error('không tới được đây');
      }
      expect(writeWorkflowYaml(ket.workflow).yaml).toBe(mot);
    }
  });

  it('không tài liệu nào sinh ra khoá bị bỏ qua — bộ ghi chỉ phát khoá bộ đọc hiểu', () => {
    for (const [ten, spec] of CHO_DUOC) {
      const ket = readWorkflowYaml(writeWorkflowYaml(spec).yaml);
      if (!ket.ok) {
        throw new Error('không tới được đây');
      }
      expect({ ten, ignored: ket.ignored }).toEqual({ ten, ignored: [] });
    }
  });

  it('tập spec phủ đủ những hình dạng bảng ánh xạ khai', () => {
    // Một tập "đủ đa dạng" mà không ai kiểm thì co lại dần theo mỗi lần sửa.
    const tat = CHO_DUOC.flatMap(([, s]) => s.stages);
    expect(tat.some((s) => s.dependsOn.length === 0)).toBe(true);
    expect(tat.some((s) => s.dependsOn.length === 1)).toBe(true);
    expect(tat.some((s) => s.dependsOn.length >= 2)).toBe(true);
    expect(tat.some((s) => !s.blocking)).toBe(true);
    expect(tat.some((s) => s.steps.some((b) => !b.blocking))).toBe(true);
    expect(tat.some((s) => (s.fanOut?.axes.length ?? 0) >= 2)).toBe(true);
    expect(tat.some((s) => (s.fanOut?.exclude?.length ?? 0) >= 1)).toBe(true);
    expect(tat.some((s) => s.environment !== undefined)).toBe(true);
    expect(tat.some((s) => s.steps.length === 0)).toBe(true);
  });
});

describe('hình dạng YAML phát ra', () => {
  it('`continue-on-error` CHỈ xuất hiện khi blocking là false', () => {
    const chan = writeWorkflowYaml({
      name: 'a',
      stages: [chang({ id: 'build', kind: 'build', name: 'b', steps: [buoc('s', 'x')] })],
    }).yaml;
    expect(chan).not.toContain('continue-on-error');

    const khong = writeWorkflowYaml({
      name: 'a',
      stages: [chang({ id: 'build', kind: 'build', name: 'b', blocking: false })],
    }).yaml;
    expect(khong).toContain('continue-on-error: true');
  });

  it('`needs` vắng hẳn khi stage không phụ thuộc gì', () => {
    const yaml = writeWorkflowYaml({
      name: 'a',
      stages: [chang({ id: 'clone', kind: 'clone', name: 'b' })],
    }).yaml;
    expect(yaml).not.toContain('needs');
  });

  it('workflow không stage nào vẫn đọc lại được', () => {
    const spec: WorkflowSpec = { name: 'Rỗng', stages: [] };
    const { yaml, dropped } = writeWorkflowYaml(spec);
    expect(dropped).toEqual([]);
    const ket = readWorkflowYaml(yaml);
    if (!ket.ok) {
      throw new Error(`không đọc lại được: ${yaml}`);
    }
    expect(ket.workflow).toEqual(spec);
  });

  it('chuỗi CẦN nháy mà chứa cả hai loại nháy bị ném, không ghi ra một bản hỏng', () => {
    // `core/yaml.ts` bỏ nháy bằng cách cắt hai đầu và không hiểu dấu thoát nào,
    // nên chuỗi này không bọc được. Ghi đại rồi để bộ đọc trả về một chuỗi khác
    // là đúng loại hỏng im lặng mà cả hai file tồn tại để chặn.
    //
    // ⚠ Điều kiện là CẦN NHÁY, không phải "có hai loại nháy". Ca dưới bắt đầu
    // bằng `#` nên bắt buộc phải bọc.
    expect(() =>
      writeWorkflowYaml({
        name: 'a',
        stages: [chang({ id: 'build', kind: 'build', name: `# cả ' lẫn "` })],
      }),
    ).toThrow(/nháy đơn lẫn nháy kép/);
  });

  it('chuỗi KHÔNG cần nháy mà có dấu nháy đơn vẫn ghi ra và đọc lại nguyên vẹn', () => {
    // Đối chứng cho ô trên: nếu điều kiện ném bị nới thành "có hai loại nháy",
    // ca này sẽ ném và không phép đo nào khác phân biệt được hai cách cài đặt.
    const spec: WorkflowSpec = {
      name: 'a',
      stages: [chang({ id: 'build', kind: 'build', name: `đừng 'bỏ' dấu "nháy"` })],
    };
    const ket = readWorkflowYaml(writeWorkflowYaml(spec).yaml);
    if (!ket.ok) {
      throw new Error('không tới được đây');
    }
    expect(ket.workflow).toEqual(spec);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Chiều mất mát — YAML không chở được cả hợp đồng, và bộ ghi phải NÓI RA
// ═══════════════════════════════════════════════════════════════════════════

describe('trường không chở được', () => {
  const CA: readonly (readonly [string, StageSpec])[] = [
    ['retries', chang({ id: 'build', kind: 'build', name: 'b', retries: 2 })],
    ['runnerSlots', chang({ id: 'build', kind: 'build', name: 'b', runnerSlots: 0 })],
    ['approval', chang({ id: 'build', kind: 'build', name: 'b', approval: { reviewers: 2 } })],
    [
      'steps[].durationTicks',
      chang({ id: 'build', kind: 'build', name: 'b', steps: [{ id: 's', name: 'x', durationTicks: 7, blocking: true }] }),
    ],
    [
      'steps[].durationSpreadTicks',
      chang({
        id: 'build',
        kind: 'build',
        name: 'b',
        steps: [{ id: 's', name: 'x', durationTicks: 0, durationSpreadTicks: 2, blocking: true }],
      }),
    ],
    [
      'steps[].flake',
      chang({
        id: 'build',
        kind: 'build',
        name: 'b',
        steps: [{ id: 's', name: 'x', durationTicks: 0, blocking: true, flake: { rate: 0.05, nature: 'infra' } }],
      }),
    ],
    [
      'steps[].cache',
      chang({
        id: 'build',
        kind: 'build',
        name: 'b',
        steps: [
          {
            id: 's',
            name: 'x',
            durationTicks: 0,
            blocking: true,
            cache: { id: 'deps', keyParts: ['lockfile'], invalidatedBy: ['lockfile'], savesTicks: 3 },
          },
        ],
      }),
    ],
    [
      'steps[].requires',
      chang({
        id: 'build',
        kind: 'build',
        name: 'b',
        steps: [{ id: 's', name: 'x', durationTicks: 0, blocking: true, requires: ['dist'] }],
      }),
    ],
    [
      'steps[].produces',
      chang({
        id: 'build',
        kind: 'build',
        name: 'b',
        steps: [{ id: 's', name: 'x', durationTicks: 0, blocking: true, produces: ['dist'] }],
      }),
    ],
  ];

  for (const [field, s] of CA) {
    it(`"${field}" được khai trong dropped, không nuốt im lặng`, () => {
      const { dropped } = writeWorkflowYaml({ name: 'a', stages: [s] });
      expect(dropped.map((d) => d.field)).toEqual([field]);
      expect(dropped[0]?.stage).toBe('build');
      expect(dropped[0]?.reason).not.toBe('');
    });
  }

  it('mỗi trường có khoá tương ứng KHÔNG bị khai nhầm vào dropped', () => {
    // Đối chứng âm cho khối trên: nếu điều kiện nào ở bộ ghi bị viết ngược,
    // mọi spec sạch cũng sẽ sinh dropped và khối trên vẫn xanh.
    for (const [, spec] of CHO_DUOC) {
      expect(writeWorkflowYaml(spec).dropped).toEqual([]);
    }
  });

  it('`kind` không suy lại được cũng vào dropped, kèm giá trị sẽ đọc ra', () => {
    const { dropped } = writeWorkflowYaml({
      name: 'a',
      // Không tín hiệu nào trong `id` hay `name` nói "deploy", nên đọc lại sẽ
      // ra nhánh mặc định.
      stages: [chang({ id: 'x1', kind: 'deploy', name: 'x1' })],
    });
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.field).toBe('kind');
    expect(dropped[0]?.reason).toContain('"build"');
    expect(dropped[0]?.reason).toContain('nhánh mặc định');
  });

  it('`kind` khớp phép suy thì KHÔNG vào dropped', () => {
    const { dropped } = writeWorkflowYaml({
      name: 'a',
      stages: [chang({ id: 'x1', kind: 'build', name: 'x1' })],
    });
    expect(dropped).toEqual([]);
  });

  it('tổ hợp loại trừ không tách ngược được thành trục cũng vào dropped', () => {
    const { yaml, dropped } = writeWorkflowYaml({
      name: 'a',
      stages: [
        chang({
          id: 'unit-test',
          kind: 'unit-test',
          name: 'b',
          fanOut: {
            axes: [{ name: 'node', values: ['20'] }],
            // Thiếu tiền tố `unit-test#`, nên không nói được nó loại trừ tổ hợp nào.
            exclude: ['22'],
          },
        }),
      ],
    });
    expect(dropped.map((d) => d.field)).toEqual(['fanOut.exclude[0]']);
    expect(yaml).not.toContain('exclude');
  });
});
