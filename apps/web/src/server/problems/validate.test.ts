import { describe, expect, it } from 'vitest';
import { PROBLEM_TOPICS } from '@devops-platform/games';
import { formatProblemCode } from './next-code';
import { STATEMENT_MAX_WORDS, countWords, publishIssues } from './publish-gate';
import { problemBodySchema } from './validate';

const BODY = {
  slug: 'pod-dau-tien',
  title: 'Pod đầu tiên',
  statement: 'Dựng một pod tên web.',
  difficulty: 'easy' as const,
  topics: ['workload' as const],
  tags: ['init-container'],
  timeLimitSec: null,
  initialState: {
    nodes: [{ name: 'n1', cpu: 1000, memory: 1024, ready: true }],
    namespaces: ['ns'],
    resources: [{ kind: 'Pod' as const, name: 'web', namespace: 'ns', spec: {} }],
  },
  objectives: [{ id: 'o1', label: 'Xong', check: 'resource-exists', required: true }],
  allowedResources: null,
  hints: [{ id: 'h1', text: 'gợi ý', penaltyPoints: 10 }],
  parMoves: 3,
};

describe('biên ghi của bài tập', () => {
  it('nhận một bài hợp lệ', () => {
    expect(problemBodySchema.safeParse(BODY).success).toBe(true);
  });

  it('từ chối field lạ thay vì nhận-rồi-bỏ-qua', () => {
    // Một schema nhận field lạ rồi phớt lờ nó làm trang soạn gửi `authorId` mà
    // không nhận được tín hiệu nào là nó không có tác dụng.
    expect(problemBodySchema.safeParse({ ...BODY, authorId: 'kẻ-tấn-công' }).success).toBe(false);
  });

  it('từ chối chủ đề ngoài tập đóng', () => {
    expect(problemBodySchema.safeParse({ ...BODY, topics: ['mang-luoi'] }).success).toBe(false);
    // Đối chứng dương: mọi chủ đề THẬT đều qua được. Không có vế này thì một
    // schema từ chối TẤT CẢ cũng làm ô trên xanh.
    for (const topic of PROBLEM_TOPICS) {
      expect(problemBodySchema.safeParse({ ...BODY, topics: [topic] }).success, topic).toBe(true);
    }
  });

  it('từ chối loại tài nguyên gõ sai', () => {
    const bad = { ...BODY, initialState: { ...BODY.initialState, resources: [{ kind: 'Deploymnet', name: 'x', namespace: 'ns', spec: {} }] } };
    expect(problemBodySchema.safeParse(bad).success).toBe(false);
  });

  it('đòi 1..3 chủ đề — nhiều hơn ba nghĩa là bài đang làm quá nhiều việc', () => {
    expect(problemBodySchema.safeParse({ ...BODY, topics: [] }).success).toBe(false);
    expect(
      problemBodySchema.safeParse({
        ...BODY,
        topics: ['workload', 'networking', 'storage', 'config'],
      }).success,
    ).toBe(false);
  });

  it('tag phải đã chuẩn hoá thường + gạch nối', () => {
    expect(problemBodySchema.safeParse({ ...BODY, tags: ['Init-Container'] }).success).toBe(false);
    expect(problemBodySchema.safeParse({ ...BODY, tags: ['init container'] }).success).toBe(false);
  });

  it('điểm trừ của gợi ý không được âm — đó sẽ là gợi ý CỘNG điểm', () => {
    const bad = { ...BODY, hints: [{ id: 'h1', text: 'x', penaltyPoints: -5 }] };
    expect(problemBodySchema.safeParse(bad).success).toBe(false);
  });

  it('cụm phải có ít nhất một node', () => {
    const bad = { ...BODY, initialState: { ...BODY.initialState, nodes: [] } };
    expect(problemBodySchema.safeParse(bad).success).toBe(false);
  });

  it('xoá khoá `undefined` để hợp với exactOptionalPropertyTypes', () => {
    // `JSON.stringify` bỏ hẳn khoá có giá trị `undefined`, nên phép ép kiểu ở
    // `toContractShape` mô tả đúng giá trị lúc chạy chứ không chỉ khẳng định suông.
    const withUndefined = {
      ...BODY,
      initialState: {
        ...BODY.initialState,
        nodes: [{ name: 'n1', cpu: 1000, memory: 1024, ready: true, taints: undefined }],
      },
    };
    const parsed = problemBodySchema.parse(withUndefined);
    expect(Object.hasOwn(parsed.initialState.nodes[0] ?? {}, 'taints')).toBe(false);
  });
});

describe('cổng xuất bản chặt hơn cổng lưu nháp', () => {
  it('bài hợp lệ không có vấn đề nào', () => {
    expect(publishIssues(BODY)).toEqual([]);
  });

  it('chặn đề bài vượt 150 từ, và chỉ đúng ô sai', () => {
    const long = { ...BODY, statement: Array.from({ length: 151 }, () => 'từ').join(' ') };
    const issues = publishIssues(long);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual(['statement']);
    // Đúng 150 từ thì QUA — trần là "vượt thì chặn", không phải "gần thì chặn".
    const exact = { ...BODY, statement: Array.from({ length: STATEMENT_MAX_WORDS }, () => 'từ').join(' ') };
    expect(publishIssues(exact)).toEqual([]);
  });

  /*
   * ⛔ Ô này THAY một ô đã chết, không phải sửa kỳ vọng cho xanh. Chiều của thay
   * đổi là NỚI, và nó phải đọc ra được từ đây — xem
   * `rules/pinned-baseline-test-companion.md`.
   *
   * Bản trước: `chặn bài không có mục tiêu bắt buộc nào`, dựng
   * `objectives: [{ id: 'o1', required: false }]` và đòi cổng ĐỎ. Bất biến đó
   * chết theo quyết định #20 — `core/problem.ts` § `Testcase` bỏ hẳn `required`
   * (*"một testcase thì luôn chặn — đó là nghĩa của AC"*), nên "mục tiêu bắt
   * buộc" không còn là một khái niệm để mà đếm. Cổng (`publish-gate.ts`) nay hỏi
   * một câu khác: *có case nào không*.
   *
   * Nên ca cũ không được viết lại cho qua — nó bị XOÁ, và đúng cái đầu vào từng
   * làm nó đỏ giờ là đối chứng dương của ô mới: một case duy nhất, không nhãn
   * "bắt buộc", PHẢI xuất bản được.
   */
  it('chặn bài KHÔNG CÓ testcase nào — bài không chấm được thì không ra mắt', () => {
    const issues = publishIssues({ ...BODY, objectives: [] });
    expect(issues.map((issue: { path: PropertyKey[] }) => issue.path)).toContainEqual(['objectives']);
    // Đối chứng dương, và là ca mà cổng CŨ từ chối. Thiếu vế này thì một cổng
    // từ chối MỌI bài cũng làm vế trên xanh.
    expect(publishIssues({ ...BODY, objectives: [{ id: 'o1' }] })).toEqual([]);
  });

  it('chặn id trùng ở cả mục tiêu lẫn gợi ý', () => {
    // Bất biến này KHÔNG chết theo #20: bên chấm khử trùng theo `id`, nên hai
    // case cùng id vẫn làm điểm sai. Chỉ bỏ `required` khỏi fixture — nó không
    // còn tồn tại trong hình dạng cổng đọc, chứ ô test thì vẫn gác đúng thứ cũ.
    const issues = publishIssues({
      ...BODY,
      objectives: [{ id: 'o1' }, { id: 'o1' }],
      hints: [{ id: 'h1' }, { id: 'h1' }],
    });
    expect(issues).toHaveLength(2);
  });
});

describe('đếm từ và định dạng mã bài', () => {
  it('chuỗi rỗng là 0 từ, không phải 1', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n  ')).toBe(0);
    expect(countWords('một hai  ba')).toBe(3);
  });

  it('mã bài luôn bốn chữ số — đó là thứ làm ORDER BY code đúng bằng so chuỗi', () => {
    expect(formatProblemCode(1)).toBe('K8S-0001');
    expect(formatProblemCode(42)).toBe('K8S-0042');
    expect(formatProblemCode(9999)).toBe('K8S-9999');
    // Nếu độ dài không cố định thì `K8S-9` đứng sau `K8S-42` theo thứ tự chuỗi,
    // và cả phân trang keyset lẫn phép cấp mã kế tiếp đều sai theo.
    expect(formatProblemCode(9) < formatProblemCode(42)).toBe(true);
  });
});
