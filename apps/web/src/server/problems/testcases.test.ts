import { describe, expect, it } from 'vitest';
import type { Problem } from '@devops-platform/games';
import { problemTestcases, toAuthorTestcaseTeasers, toTestcaseTeasers } from './testcases';
import { toAuthorProblem, toSolverProblem } from './solver';

/**
 * §18.B.4 — testcase ẩn, và phép che phải nằm ở MÁY CHỦ.
 *
 * ⛔ Ô quan trọng nhất của file này là `không rò cách chấm ra dây`. Đọc
 * `rules/green-that-proves-nothing.md` trước khi sửa nó: một ô khẳng định
 * "phản hồi KHÔNG chứa X" chỉ có giá trị nếu nó ĐỎ ĐƯỢC khi ai đó lỡ trả
 * `Testcase` đầy đủ. Đối chứng dương đã chạy — xem
 * `plans/devops-learning-platform/reports/2026-09-14-lane-18b-report.md`.
 *
 * ⚠ Ô đó khẳng định trên CHUỖI ĐÃ SERIALIZE, không trên object. `JSON.stringify`
 * ở đây là mô hình trung thực của byte đi trên dây vì client tRPC của app này
 * cố ý KHÔNG có transformer (`dto.ts` ghi lại ràng buộc đó, và nó là lý do
 * `createdAt` khai `string`). Vế HTTP thật nằm ở
 * `solver-wire.integration.test.ts`.
 */

/** Tên vị từ và tham số — hai thứ TUYỆT ĐỐI không được ra khỏi máy chủ. */
const SECRET_CHECK = 'deployment-replicas-ready';
const SECRET_ARG = 'so-bi-mat-cua-testcase';

function rawObjectives(): readonly unknown[] {
  return [
    { id: 't1', label: 'Đưa 3 pod lên 2 node khác nhau', check: SECRET_CHECK, required: true },
    { id: 't2', label: 'Giữ service còn endpoint', check: 'service-has-endpoints', required: true },
    { id: 't3', label: 'Không pod nào CrashLoop', check: 'no-crashloop', required: true },
    { id: 't4', label: 'Đặt resource limits', check: 'has-limits', required: false },
    {
      id: 't5',
      label: 'Nhãn bí mật của testcase ẩn',
      check: 'hidden-check',
      args: { name: SECRET_ARG, minReplicas: 3 },
      // Thứ lane §18.D.2 sẽ ghi. Dựng thẳng ở đây vì trang soạn bài chưa ghi
      // được nó, và một ô test chờ lane khác là một ô test không chạy.
      visible: false,
    },
  ];
}

function problemFixture(): Problem {
  return {
    code: 'K8S-0042',
    slug: 'bai-mau',
    title: 'Bài mẫu',
    statement: 'Đề bài.',
    difficulty: 'medium',
    topics: ['workload'],
    tags: [],
    timeLimitSec: null,
    initialState: { nodes: [], namespaces: [], resources: [] } as never,
    objectives: rawObjectives() as never,
    allowedResources: null,
    hints: [{ id: 'h1', text: 'Nội dung gợi ý', penaltyPoints: 50 }],
    parMoves: null,
    state: 'published',
    authorId: null,
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
  } as Problem;
}

describe('problemTestcases — đọc cột jsonb', () => {
  it('giữ đủ năm testcase, và chỉ cái khai `visible: false` mới là ẩn', () => {
    const testcases = problemTestcases(rawObjectives());
    expect(testcases).toHaveLength(5);
    expect(testcases.filter((testcase) => !testcase.visible).map((t) => t.id)).toEqual(['t5']);
  });

  it('KHÔNG ánh xạ `required: false` thành `visible: false`', () => {
    // `t4` là mục tiêu thưởng cũ (`required: false`). Nó phải vẫn HIỆN —
    // hai trường trả lời hai câu hỏi khác nhau, xem khối đầu `testcases.ts`.
    const t4 = problemTestcases(rawObjectives()).find((testcase) => testcase.id === 't4');
    expect(t4?.visible).toBe(true);
  });

  it('dòng cũ không có trường `visible` thì mặc định HIỆN', () => {
    const [only] = problemTestcases([{ id: 'x', label: 'nhãn', check: 'c' }]);
    expect(only?.visible).toBe(true);
  });

  it('bỏ phần tử hỏng thay vì ném, để một bài soạn dở không làm sập cả trang', () => {
    const testcases = problemTestcases([
      null,
      'chuỗi lạc',
      { label: 'thiếu id và check' },
      { id: 'ok', label: 'hợp lệ', check: 'c' },
    ]);
    expect(testcases.map((testcase) => testcase.id)).toEqual(['ok']);
  });
});

describe('toTestcaseTeasers — §18.B.4', () => {
  const testcases = problemTestcases(rawObjectives());

  it('CHƯA nộp: testcase ẩn không có nhãn, testcase hiện thì có', () => {
    const teasers = toTestcaseTeasers(testcases, false);
    expect(teasers.find((teaser) => teaser.id === 't5')?.label).toBeNull();
    expect(teasers.find((teaser) => teaser.id === 't1')?.label).toBe(
      'Đưa 3 pod lên 2 node khác nhau',
    );
  });

  it('ĐÃ nộp: nhãn của testcase ẩn mới hiện ra', () => {
    const teasers = toTestcaseTeasers(testcases, true);
    expect(teasers.find((teaser) => teaser.id === 't5')?.label).toBe(
      'Nhãn bí mật của testcase ẩn',
    );
  });

  it('giữ đủ phần tử kể cả khi ẩn, để mẫu số `n/m` trung thực', () => {
    // Bỏ phần tử ẩn khỏi mảng sẽ cho người làm thấy `WA (4/4)` trong khi họ
    // trượt — mẫu số nói dối, và đó là thứ tệ hơn cả việc lộ nhãn.
    expect(toTestcaseTeasers(testcases, false)).toHaveLength(5);
  });

  it('KHÔNG bao giờ mang `check`/`args`, kể cả với testcase HIỆN', () => {
    for (const teaser of toTestcaseTeasers(testcases, true)) {
      expect(Object.keys(teaser).sort()).toEqual(['id', 'label', 'visible']);
    }
  });

  it('đường người soạn mở hết nhãn nhưng vẫn không mang `check`/`args`', () => {
    const teasers = toAuthorTestcaseTeasers(testcases);
    expect(teasers.every((teaser) => teaser.label !== null)).toBe(true);
    expect(JSON.stringify(teasers)).not.toContain(SECRET_CHECK);
  });
});

describe('không rò cách chấm ra dây', () => {
  /*
    ⛔ Ô GÁC CỦA §18.B.4, và nó phải đỏ được.

    Đối chứng dương đã chạy một lần: thay `toTestcaseTeasers(...)` trong
    `solver.ts` bằng phép rải `testcases: problemTestcases(objectives)` (tức trả
    `Testcase` đầy đủ đúng như hợp đồng cảnh báo), và cả bốn `expect` dưới đây
    đỏ. Ghi lại trong báo cáo của lane.

    Khẳng định trên CHUỖI chứ không trên object: một ô đọc
    `result.testcases[0].check` sẽ xanh khi ai đó để cách chấm rơi vào một
    trường KHÁC — `objectives`, `meta`, một field mới của `Testcase`. Chuỗi
    serialize không có chỗ nào để trốn.
  */
  it('phản hồi của người học không chứa `check` hay `args` của BẤT KỲ testcase nào', () => {
    const wire = JSON.stringify(toSolverProblem(problemFixture(), new Set(), false));

    expect(wire).not.toContain(SECRET_CHECK);
    expect(wire).not.toContain(SECRET_ARG);
    // Cả nhãn của testcase ẩn — vế "chỉ hiện tên SAU KHI NỘP".
    expect(wire).not.toContain('Nhãn bí mật của testcase ẩn');
    // Và cột `objectives` cũ không được đi kèm theo đường vòng nào.
    expect(wire).not.toContain('"objectives"');
  });

  it('đã nộp thì nhãn hiện ra, nhưng cách chấm vẫn ở lại máy chủ', () => {
    const wire = JSON.stringify(toSolverProblem(problemFixture(), new Set(), true));

    expect(wire).toContain('Nhãn bí mật của testcase ẩn');
    expect(wire).not.toContain(SECRET_CHECK);
    expect(wire).not.toContain(SECRET_ARG);
  });

  it('đường người soạn của trang chi tiết cũng không chở cách chấm', () => {
    // Người soạn cần `check`/`args` thì đi `problems.forEdit`. Trang chi tiết
    // là MỘT trang cho cả hai vai nên nó có MỘT kiểu trả về — xem `solver.ts`.
    const wire = JSON.stringify(toAuthorProblem(problemFixture()));

    expect(wire).not.toContain(SECRET_CHECK);
    expect(wire).not.toContain(SECRET_ARG);
    expect(wire).not.toContain('"objectives"');
    // Gợi ý thì ngược lại: tác giả đọc được nguyên văn.
    expect(wire).toContain('Nội dung gợi ý');
  });

  it('gợi ý chưa mở vẫn không rò — hồi quy cho lỗ hổng đã vá trước đó', () => {
    const wire = JSON.stringify(toSolverProblem(problemFixture(), new Set(), false));
    expect(wire).not.toContain('Nội dung gợi ý');
  });
});
