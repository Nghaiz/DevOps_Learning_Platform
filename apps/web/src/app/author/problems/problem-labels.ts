import type { StaticTextKey } from '@devops-platform/copy';
import type { BadgeVariant } from '@devops-platform/ui';
import type { ProblemDifficulty, ProblemState } from '@devops-platform/games';

/**
 * Nhãn và màu cho hai enum của bài OJ.
 *
 * ## ⚠ Bẫy tên — KHÔNG ghép chuỗi để suy ra biến thể badge
 *
 * Token màu mang tên theo thang BA bậc của hệ nội dung cũ
 * (`basic|intermediate|advanced`, cộng `expert` mới thêm), còn
 * `PROBLEM_DIFFICULTIES` là `easy|medium|hard|expert`. Bốn giá trị, bốn biến
 * thể, nhưng chỉ MỘT tên trùng nhau. `` `difficulty-${difficulty}` `` sẽ sinh ra
 * `difficulty-easy` — một class Tailwind không tồn tại, nên badge vẫn render và
 * chỉ mất màu. Không lỗi, không cảnh báo, và không ai để ý cho tới khi nhìn ảnh
 * chụp màn hình.
 *
 * Ánh xạ tường minh, và `satisfies Record<…>` bắt nó phải đủ bốn bậc.
 *
 * ## Chữ không còn ở đây, chỉ còn KHOÁ (P16 / 16.G2)
 *
 * `STATE_LABELS` từng giữ ba chuỗi tiếng Việt. Chúng đã sang
 * `packages/copy/src/surfaces/author.ts` dưới tiền tố `author.problem.state.`,
 * và bảng dưới đây trả `StaticTextKey`. Đổi này không phải chuyện phong cách: một
 * bảng chuỗi ở tầng ứng dụng thì cổng gạch ngang dài và cổng mất dấu của
 * `packages/copy` không soi tới, nên hai luật đó không có hiệu lực trên nó.
 *
 * ⛔ KHÔNG gộp với `author.state.*` của `components/author/content-state.ts`.
 * Đó là `ContentState` (bốn giá trị, có `publishing`); đây là `ProblemState`
 * (ba giá trị). Chúng trùng chữ ở hai mục và không trùng miền.
 */
export const DIFFICULTY_BADGE = {
  easy: 'difficulty-basic',
  medium: 'difficulty-intermediate',
  hard: 'difficulty-advanced',
  expert: 'difficulty-expert',
} satisfies Record<ProblemDifficulty, BadgeVariant>;

export const STATE_KEYS: Readonly<Record<ProblemState, StaticTextKey>> = {
  draft: 'author.problem.state.draft',
  published: 'author.problem.state.published',
  archived: 'author.problem.state.archived',
};

/**
 * `draft` dùng `outline` chứ không `secondary`: bản nháp là trạng thái CHƯA tới
 * đích, và một badge tô đặc đọc ra như một trạng thái đã xong.
 */
export const STATE_BADGE = {
  draft: 'outline',
  published: 'status-done',
  archived: 'secondary',
} satisfies Record<ProblemState, BadgeVariant>;

/** Bộ lọc trạng thái ở trang danh sách. `all` không phải một `ProblemState`. */
export const STATE_FILTERS = ['all', 'draft', 'published', 'archived'] as const;

export type StateFilter = (typeof STATE_FILTERS)[number];

/**
 * Trả KHOÁ chứ không trả nhãn, và tên hàm nói ra điều đó.
 *
 * Cùng lý do `filterLabel` của `components/author/content-state.ts` đổi thành
 * `filterLabelKey`: giữ tên cũ cho một kiểu trả về mới là cách chắc chắn để nơi
 * gọi tiếp theo dựng thẳng nó vào JSX và in ra chuỗi khoá.
 */
export function filterLabelKey(filter: StateFilter): StaticTextKey {
  return filter === 'all' ? 'author.problem.filter-all' : STATE_KEYS[filter];
}
