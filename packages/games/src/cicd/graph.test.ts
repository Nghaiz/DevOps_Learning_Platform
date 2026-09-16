/**
 * Ghim hai lỗi cứng của đồ thị, và ghim chúng **trỏ về đúng job**.
 *
 * Phần lớn số test ở đây không đo "có phát hiện được chu trình không" — chuyện
 * đó một vòng lặp mười dòng cũng làm được. Chúng đo ba thứ khó hơn:
 *
 *   1. Danh sách trả về là ĐÚNG các stage trong vòng, không dư đường đi tới vòng.
 *      Dư một stage nghĩa là 19.C.4 tô sáng một dòng YAML không có lỗi gì.
 *   2. Kết quả KHÔNG đổi khi hoán vị `stages` hay `dependsOn`. Hợp đồng ghi thứ
 *      tự mảng là trình bày; một vòng đọc-ghi YAML sắp lại stage mà đổi lỗi được
 *      báo là một lỗi im lặng và rất khó truy.
 *   3. Hai lỗi tách bạch. Gõ nhầm tên stage KHÔNG được đọc ra thành chu trình.
 */
import { describe, expect, it } from 'vitest';

import type { StageId, StageSpec, WorkflowSpec } from './contract.ts';
import { findCycle, findUnknownDependency, validateGraph } from './graph.ts';

/**
 * Stage tối thiểu. `steps`, `kind`, `retries`, `runnerClass` không ảnh hưởng gì
 * tới phép kiểm đồ thị — chúng có mặt vì kiểu đòi, không vì phép đo cần.
 */
function stage(id: StageId, dependsOn: readonly StageId[] = []): StageSpec {
  return {
    id,
    kind: 'build',
    name: id,
    dependsOn,
    steps: [],
    blocking: true,
    retries: 0,
    runnerClass: 'linux',
  };
}

function workflow(stages: readonly StageSpec[]): WorkflowSpec {
  return { name: 'đồ thị thử', stages };
}

/**
 * Ba hoán vị của cùng một danh sách stage.
 *
 * Không xáo ngẫu nhiên: một test tất định không được dùng `Math.random`, và ba
 * hoán vị cố định thì đọc lại được khi nó đỏ.
 */
function hoanVi(stages: readonly StageSpec[]): readonly (readonly StageSpec[])[] {
  const xuoi = [...stages];
  const nguoc = [...stages].reverse();
  const xoay = [...stages.slice(1), ...stages.slice(0, 1)];
  return [xuoi, nguoc, xoay];
}

describe('graph — đồ thị hợp lệ', () => {
  it('chuỗi nối tiếp không có lỗi nào', () => {
    const wf = workflow([stage('clone'), stage('build', ['clone']), stage('test', ['build'])]);
    expect(findUnknownDependency(wf)).toBeNull();
    expect(findCycle(wf)).toBeNull();
    expect(validateGraph(wf)).toBeNull();
  });

  it('quạt ra rồi gộp lại vẫn là DAG', () => {
    const wf = workflow([
      stage('clone'),
      stage('lint', ['clone']),
      stage('build', ['clone']),
      stage('pack', ['lint', 'build']),
    ]);
    expect(validateGraph(wf)).toBeNull();
  });

  it('workflow rỗng không phải lỗi', () => {
    expect(validateGraph(workflow([]))).toBeNull();
  });

  it('phụ thuộc khai trùng chỉ là thừa, không phải lỗi', () => {
    const wf = workflow([stage('clone'), stage('build', ['clone', 'clone'])]);
    expect(validateGraph(wf)).toBeNull();
  });
});

describe('graph — chu trình trỏ về đúng job', () => {
  it('vòng ba đỉnh trả về đúng ba stage theo chiều dependsOn', () => {
    // a cần b, b cần c, c cần a.
    const wf = workflow([stage('a', ['b']), stage('b', ['c']), stage('c', ['a'])]);
    expect(findCycle(wf)).toEqual(['a', 'b', 'c']);
  });

  it('tự phụ thuộc là vòng độ dài 1', () => {
    const wf = workflow([stage('clone'), stage('build', ['build'])]);
    expect(findCycle(wf)).toEqual(['build']);
    expect(validateGraph(wf)).toEqual({ kind: 'cycle', stages: ['build'] });
  });

  it('KHÔNG báo những stage chỉ nằm trên đường đi TỚI vòng', () => {
    /*
     * `app` sắp trước `x` nên DFS xuất phát từ `app` và đi qua nó để tới vòng.
     * Nếu hiện thực trả cả ngăn xếp thay vì cắt từ chỗ gặp lại, `app` sẽ lọt vào
     * danh sách — và 19.C.4 sẽ tô đỏ một dòng YAML hoàn toàn đúng.
     */
    const wf = workflow([stage('app', ['x']), stage('x', ['y']), stage('y', ['x'])]);
    expect(findCycle(wf)).toEqual(['x', 'y']);
  });

  it('vòng dài không kéo theo nhánh cụt đâm vào nó', () => {
    const wf = workflow([
      stage('a', ['b']),
      stage('b', ['c']),
      stage('c', ['a']),
      stage('nhanh-cut', ['a']),
      stage('goc'),
    ]);
    const cycle = findCycle(wf);
    expect(cycle).toEqual(['a', 'b', 'c']);
    expect(cycle).not.toContain('nhanh-cut');
    expect(cycle).not.toContain('goc');
  });

  it('hai mục cùng id thì cạnh của cả hai đều được tính', () => {
    /*
     * Hợp đồng không có nhánh lỗi cho id trùng, nên `adjacency` lấy HỢP các cạnh.
     * Ở đây mục thứ hai của `a` mới là mục đóng vòng; bỏ nó đi là bỏ sót một chu
     * trình và để người chơi chạy một workflow không chạy được.
     */
    const wf = workflow([stage('a'), stage('b', ['a']), stage('a', ['b'])]);
    expect(findCycle(wf)).toEqual(['a', 'b']);
  });
});

describe('graph — phụ thuộc trỏ vào hư không', () => {
  it('báo đúng cặp stage / tên thiếu', () => {
    const wf = workflow([stage('clone'), stage('build', ['clon'])]);
    expect(findUnknownDependency(wf)).toEqual({
      kind: 'unknown-dependency',
      stage: 'build',
      missing: 'clon',
    });
  });

  it('một cạnh trỏ vào hư không KHÔNG bị đọc ra thành chu trình', () => {
    // Đây là chỗ hai lỗi dễ bị gộp nhất: đỉnh thiếu không có cạnh đi ra nên nó
    // không thể nằm trong vòng nào, và báo "đồ thị có chu trình" ở đây là bắt
    // người mới đi gỡ một vòng không tồn tại.
    const wf = workflow([stage('clone'), stage('build', ['khong-co-that'])]);
    expect(findCycle(wf)).toBeNull();
  });

  it('nhiều tên thiếu thì báo cái đầu theo stageId đã sắp', () => {
    const wf = workflow([stage('zz', ['mat-tich']), stage('aa', ['bien-mat'])]);
    expect(findUnknownDependency(wf)).toEqual({
      kind: 'unknown-dependency',
      stage: 'aa',
      missing: 'bien-mat',
    });
  });
});

describe('graph — thứ tự ưu tiên khi hỏng cả hai kiểu', () => {
  const wf = workflow([
    stage('x', ['y']),
    stage('y', ['x']),
    stage('zz', ['mat-tich']),
  ]);

  it('validateGraph báo tên thiếu TRƯỚC chu trình', () => {
    expect(validateGraph(wf)).toEqual({
      kind: 'unknown-dependency',
      stage: 'zz',
      missing: 'mat-tich',
    });
  });

  it('nhưng chu trình vẫn tồn tại và vẫn tìm được riêng', () => {
    // Đối chứng: nếu vế này rỗng thì test trên không chứng minh được thứ tự ưu
    // tiên — nó chỉ chứng minh không có chu trình nào.
    expect(findCycle(wf)).toEqual(['x', 'y']);
  });
});

describe('graph — tất định, không phụ thuộc thứ tự mảng', () => {
  const stages = [
    stage('app', ['x']),
    stage('x', ['y']),
    stage('y', ['x']),
    stage('goc'),
  ];

  it('ba hoán vị dùng trong test này thật sự khác nhau', () => {
    // Đối chứng cho hai test dưới: nếu ba hoán vị trùng nhau thì chúng xanh mà
    // không đo được gì — đúng thứ `rules/green-that-proves-nothing.md` cảnh báo.
    const dang = hoanVi(stages).map((list) => list.map((s) => s.id).join(','));
    expect(new Set(dang).size).toBe(3);
  });

  it('chu trình tìm được không đổi qua ba hoán vị stages', () => {
    for (const perm of hoanVi(stages)) {
      expect(findCycle(workflow(perm))).toEqual(['x', 'y']);
    }
  });

  it('tên thiếu báo ra không đổi qua ba hoán vị stages', () => {
    const hong = [stage('zz', ['mat-tich']), stage('aa', ['bien-mat']), stage('goc')];
    for (const perm of hoanVi(hong)) {
      expect(findUnknownDependency(workflow(perm))).toEqual({
        kind: 'unknown-dependency',
        stage: 'aa',
        missing: 'bien-mat',
      });
    }
  });

  it('thứ tự khai trong dependsOn cũng không đổi chu trình', () => {
    const xuoi = workflow([stage('a', ['b', 'c']), stage('b', ['a']), stage('c')]);
    const nguoc = workflow([stage('a', ['c', 'b']), stage('b', ['a']), stage('c')]);
    expect(findCycle(xuoi)).toEqual(findCycle(nguoc));
    expect(findCycle(xuoi)).toEqual(['a', 'b']);
  });
});
