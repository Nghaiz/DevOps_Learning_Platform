import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROBLEM_QUERY,
  PROBLEM_PAGE_SIZE,
  buildProblemListInput,
  hasActiveFilter,
  normalizeTag,
  parseProblemQuery,
  toSearchParams,
} from './problem-query';

/**
 * Bộ lọc nằm trong URL nên URL LÀ trạng thái — mọi lỗi ở đây đều là lỗi im
 * lặng: một giá trị bị đánh rơi lúc mã hoá không làm gì đỏ, người dùng chỉ thấy
 * danh sách trả về nhiều bài hơn họ xin.
 */
describe('problem-query', () => {
  it('đọc đủ năm chiều lọc từ URL', () => {
    const query = parseProblemQuery(
      new URLSearchParams('difficulty=easy,hard&topic=networking,storage&tag=Ingress Rule&status=solved&q=nginx'),
    );

    expect(query.filter.difficulty).toEqual(['easy', 'hard']);
    expect(query.filter.topics).toEqual(['networking', 'storage']);
    expect(query.filter.tags).toEqual(['ingress-rule']);
    expect(query.filter.viewerStatus).toEqual(['solved']);
    expect(query.filter.query).toBe('nginx');
  });

  it('bỏ giá trị không thuộc tập đóng thay vì ném lỗi', () => {
    const query = parseProblemQuery(new URLSearchParams('difficulty=easy,khong-co-that&topic=mang&status=xong'));

    expect(query.filter.difficulty).toEqual(['easy']);
    expect(query.filter.topics).toBeUndefined();
    expect(query.filter.viewerStatus).toBeUndefined();
  });

  it('bỏ giá trị trùng — hai lần cùng một chủ đề vẫn là một điều kiện', () => {
    const query = parseProblemQuery(new URLSearchParams('topic=storage,storage&tag=a,a'));

    expect(query.filter.topics).toEqual(['storage']);
    expect(query.filter.tags).toEqual(['a']);
  });

  it('khoá sắp xếp lạ rơi về mặc định, và `title` KHÔNG phải khoá hợp lệ', () => {
    // `title` bị loại khỏi `PROBLEM_ORDER_KEYS` vì collation Postgres ≠ JS với
    // tiếng Việt có dấu; đọc lý do đầy đủ ở `packages/games/src/k8s/problem.ts`.
    expect(parseProblemQuery(new URLSearchParams('order=title')).orderBy).toBe('code');
    expect(parseProblemQuery(new URLSearchParams('order=solverCount')).orderBy).toBe('solverCount');
  });

  it('đi vòng URL → trạng thái → URL không đánh rơi chiều nào', () => {
    const source = 'difficulty=expert&topic=security&tag=rbac&status=attempted&q=role&order=createdAt&dir=desc';
    const round = toSearchParams(parseProblemQuery(new URLSearchParams(source)));

    expect(parseProblemQuery(round)).toEqual(parseProblemQuery(new URLSearchParams(source)));
  });

  it('giá trị mặc định bị bỏ khỏi URL — `/problems` và `?order=code&dir=asc` là một màn hình', () => {
    expect(toSearchParams(DEFAULT_PROBLEM_QUERY).toString()).toBe('');
  });

  it('chuẩn hoá tag về thường + gạch nối, và nuốt dấu phẩy (ký tự phân cách)', () => {
    expect(normalizeTag('  Ingress   Rule ')).toBe('ingress-rule');
    expect(normalizeTag('a,b')).toBe('ab');
    expect(normalizeTag('__x__')).toBe('x');
    expect(normalizeTag('Gỡ Sự Cố')).toBe('gỡ-sự-cố');
  });

  it('hasActiveFilter phân biệt "không lọc gì" với "lọc rỗng"', () => {
    expect(hasActiveFilter({})).toBe(false);
    expect(hasActiveFilter({ difficulty: [] })).toBe(false);
    expect(hasActiveFilter({ query: '' })).toBe(false);
    expect(hasActiveFilter({ query: 'x' })).toBe(true);
  });

  it('input gửi lên server KHÔNG mang khoá thừa nào', () => {
    const input = buildProblemListInput(DEFAULT_PROBLEM_QUERY, undefined);

    // `.strict()` ở tầng Zod sẽ trả 400 cho bất kỳ khoá lạ nào — kể cả khoá do
    // một tầng thư viện tự chèn. Ghim đúng tập khoá thay vì chỉ ghim giá trị.
    expect(Object.keys(input).sort()).toEqual(['direction', 'limit', 'orderBy']);
    expect(input.limit).toBe(PROBLEM_PAGE_SIZE);
  });

  it('input mang `filter` khi có lọc, và mang `cursor` khi không ở trang đầu', () => {
    const query = parseProblemQuery(new URLSearchParams('difficulty=easy'));
    const input = buildProblemListInput(query, 'K8S-0007');

    expect(Object.keys(input).sort()).toEqual(['cursor', 'direction', 'filter', 'limit', 'orderBy']);
    expect(input.cursor).toBe('K8S-0007');
    expect(input.filter).toEqual({ difficulty: ['easy'] });
  });
});
