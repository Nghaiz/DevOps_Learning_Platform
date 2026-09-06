import { SCENARIO_DIFFICULTIES, type ScenarioDifficulty } from '@devops-platform/shared-types/scenario';

/**
 * Sắp xếp danh mục (13.C task 9) — **trong trang**, không phải toàn kho.
 *
 * ⚠ Đây là giới hạn CÓ THẬT, không phải một bước làm dở: `lessons.list` /
 * `labs.list` / `playgrounds.list` / `paths.list` / `quiz.list` phân trang
 * keyset theo `id` và không nhận tham số `sort` nào. Một thứ tự chọn ở client
 * chỉ xếp lại đúng những mục server đã trả về trang này.
 *
 * Vì vậy nhãn của bộ điều khiển là "Sắp xếp trong trang", và
 * `describeSortScope` nói thẳng hệ quả khi còn trang sau. Đổi nhãn thành "Sắp
 * xếp" trần là khẳng định một thứ tự toàn cục mà dữ liệu không có.
 */
export interface SortOption<T> {
  readonly key: string;
  readonly label: string;
  readonly compare: (a: T, b: T) => number;
}

/** Thứ tự sắp xếp mặc định: giữ nguyên thứ tự server trả (keyset theo `id`). */
export const DEFAULT_SORT_KEY = 'default';

/**
 * Xếp lại một trang. KHÔNG sửa mảng gốc (`toSorted` chứ không `sort`) — mảng
 * gốc là `query.data.items` do TanStack Query giữ trong cache, và sắp xếp tại
 * chỗ sẽ ghi đè cache dùng chung với mọi component khác đọc cùng key.
 */
export function sortPage<T>(items: readonly T[], option: SortOption<T> | undefined): readonly T[] {
  if (option === undefined) {
    return items;
  }
  return items.toSorted(option.compare);
}

/** Tìm comparator theo key; key lạ (state cũ sau khi đổi trang) ⇒ giữ thứ tự server. */
export function findSortOption<T>(
  options: readonly SortOption<T>[],
  key: string,
): SortOption<T> | undefined {
  return options.find((option) => option.key === key);
}

/**
 * So sánh tiêu đề theo BẢNG CHỮ TIẾNG VIỆT.
 *
 * ⛔ Không dùng `a < b`: so sánh theo code point xếp "Ánh" (U+00C1) SAU "Bình"
 * (U+0042), tức mọi tiêu đề có dấu bị đẩy xuống cuối danh sách A→Z. Với một
 * sản phẩm mà phần lớn tiêu đề là tiếng Việt, đó không phải sai số nhỏ.
 */
export function compareTitle(a: { readonly title: string }, b: { readonly title: string }): number {
  return a.title.localeCompare(b.title, 'vi');
}

const DIFFICULTY_RANK: Record<ScenarioDifficulty, number> = Object.fromEntries(
  SCENARIO_DIFFICULTIES.map((level, index) => [level, index]),
) as Record<ScenarioDifficulty, number>;

/** Dễ → khó, theo đúng thứ tự khai trong `SCENARIO_DIFFICULTIES` (một nguồn). */
export function compareDifficulty(
  a: { readonly difficulty: ScenarioDifficulty },
  b: { readonly difficulty: ScenarioDifficulty },
): number {
  return DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty];
}

/**
 * Ngắn → dài. `null` (bài không khai thời lượng) luôn xuống CUỐI, ở cả hai
 * chiều — "chưa biết" không phải "bằng 0": xếp nó lên đầu danh sách "ngắn nhất"
 * là để giao diện khẳng định một con số không tồn tại.
 */
export function compareMinutes(
  a: { readonly estimatedMinutes: number | null },
  b: { readonly estimatedMinutes: number | null },
): number {
  if (a.estimatedMinutes === null) {
    return b.estimatedMinutes === null ? 0 : 1;
  }
  if (b.estimatedMinutes === null) {
    return -1;
  }
  return a.estimatedMinutes - b.estimatedMinutes;
}

/** So sánh một trường đếm được (số bước, số nhiệm vụ, số câu hỏi, số phần) — ít → nhiều. */
export function compareCount<T>(pick: (item: T) => number): (a: T, b: T) => number {
  return (a, b) => pick(a) - pick(b);
}
