import { and, eq, inArray, or, type SQL } from 'drizzle-orm';
import { PROBLEM_STATES, type ProblemState } from '@devops-platform/games';
import { problems } from '../db/schema';
import type { AuthedUser } from '../trpc/init';

/**
 * Ai đang hỏi → thấy được những bài nào.
 *
 * Cùng khuôn `content/authz.ts` và cố ý KHÔNG dùng lại kiểu `ContentVisibility`
 * của nó: hai hệ có hai tập state khác nhau (`content_state` có `publishing`,
 * `problem_state` không), nên một kiểu dùng chung sẽ phải mang một state mà một
 * nửa số chỗ dùng không hiểu.
 */
export type ProblemVisibility =
  | { readonly kind: 'published-only' }
  | { readonly kind: 'author'; readonly authorId: string }
  | { readonly kind: 'admin' };

/**
 * ⚠ `null` (chưa đăng nhập) và `role: 'user'` cho ra CÙNG một tầm nhìn, cùng lý
 * lẽ đã ghi ở `visibilityFor`: một người học đã đăng nhập không được thấy nhiều
 * bài hơn một người chưa. Hôm nay mọi procedure của `problems.*` đều là
 * `protectedProcedure` nên nhánh `null` không tới được từ router — nó ở đây để
 * hàm này còn đúng nếu sau có một trang catalog công khai.
 */
export function problemVisibilityFor(user: AuthedUser | null): ProblemVisibility {
  if (user === null) {
    return { kind: 'published-only' };
  }
  switch (user.role) {
    case 'admin':
      return { kind: 'admin' };
    case 'author':
      return { kind: 'author', authorId: user.id };
    case 'user':
      return { kind: 'published-only' };
  }
}

/**
 * Mệnh đề "được nhìn thấy".
 *
 * Với `author`: `state = 'published'` **HOẶC** (`author_id = tôi` **VÀ** mọi
 * state). Vế thứ hai KHÔNG được viết thành `author_id = tôi` trần — một tác giả
 * vẫn phải thấy bài đã xuất bản của người khác, nếu không thì catalog của họ co
 * lại thành đúng những bài họ tự viết.
 *
 * Đây là chỗ hợp đồng `problem.ts` được thi hành: *"`draft` không hiện với người
 * học, kể cả khi biết URL"*. Vì mệnh đề này nằm trong MỌI truy vấn đọc (danh
 * sách lẫn tra theo mã), biết mã một bài `draft` cũng không đọc được nó.
 */
export function visibleProblemWhere(visibility: ProblemVisibility): SQL {
  switch (visibility.kind) {
    case 'admin':
      // `inArray` trên đủ tập thay vì bỏ hẳn mệnh đề: chỗ gọi luôn nhận về một
      // `SQL` nên không phải xử lý một nhánh `undefined` riêng, và câu sinh ra
      // vẫn đúng nghĩa "mọi state".
      return inArray(problems.state, [...PROBLEM_STATES]);
    case 'author':
      return or(
        eq(problems.state, 'published'),
        eq(problems.authorId, visibility.authorId),
      ) as SQL;
    case 'published-only':
      return eq(problems.state, 'published');
  }
}

/**
 * Người xem có được đọc NGUYÊN VĂN gợi ý không.
 *
 * Chủ bài và admin thì có — họ viết ra nó, che đi chỉ làm trang soạn không sửa
 * được. Mọi người khác thì không, kể cả khi bài đã xuất bản: gợi ý có giá, và
 * giá chỉ có nghĩa khi nội dung chưa nằm sẵn trong payload.
 */
export function canReadHintText(
  visibility: ProblemVisibility,
  problemAuthorId: string | null,
): boolean {
  if (visibility.kind === 'admin') {
    return true;
  }
  if (visibility.kind === 'author' && problemAuthorId !== null) {
    return visibility.authorId === problemAuthorId;
  }
  return false;
}

/**
 * Lọc state mà NGƯỜI GỌI xin, giao với tầm nhìn.
 *
 * Trả `null` khi giao rỗng — chỗ gọi hiểu đó là "không có gì để trả" và trả
 * trang rỗng thay vì dựng một câu SQL `state IN ()` không hợp lệ. Một người học
 * lọc `state: ['draft']` rơi vào đúng nhánh này: không lỗi, không dữ liệu, và
 * quan trọng nhất là không có tín hiệu nào nói cho họ biết có bao nhiêu bản
 * nháp đang tồn tại.
 */
export function intersectStates(
  visibility: ProblemVisibility,
  requested: readonly ProblemState[] | undefined,
): readonly ProblemState[] | null {
  const allowed: readonly ProblemState[] =
    visibility.kind === 'published-only' ? ['published'] : PROBLEM_STATES;
  if (requested === undefined || requested.length === 0) {
    return allowed;
  }
  const kept = requested.filter((state) => allowed.includes(state));
  return kept.length === 0 ? null : kept;
}

/** `state IN (…)` cho tập đã giao ở trên. Tách ra để `list.ts` đọc thẳng. */
export function stateWhere(states: readonly ProblemState[]): SQL {
  return inArray(problems.state, [...states]);
}

/** Gộp các mệnh đề không rỗng. `undefined` khi không có mệnh đề nào. */
export function allOf(clauses: readonly (SQL | undefined)[]): SQL | undefined {
  const kept = clauses.filter((clause): clause is SQL => clause !== undefined);
  if (kept.length === 0) {
    return undefined;
  }
  return kept.length === 1 ? kept[0] : and(...kept);
}
