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
 */
export const DIFFICULTY_BADGE = {
  easy: 'difficulty-basic',
  medium: 'difficulty-intermediate',
  hard: 'difficulty-advanced',
  expert: 'difficulty-expert',
} satisfies Record<ProblemDifficulty, BadgeVariant>;

export const STATE_LABELS: Readonly<Record<ProblemState, string>> = {
  draft: 'Nháp',
  published: 'Đã xuất bản',
  archived: 'Lưu trữ',
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

export function filterLabel(filter: StateFilter): string {
  return filter === 'all' ? 'Tất cả' : STATE_LABELS[filter];
}
