import { err, t } from '@devops-platform/copy';
import type { BadgeVariant } from '@devops-platform/ui';
import { CONTENT_KINDS, CONTENT_STATES } from '@devops-platform/shared-types/authoring';
import type { ContentKind, ContentState } from '@devops-platform/shared-types/authoring';

/**
 * Nhãn cho bảng nội dung của `/admin/content` (13.G), hàm thuần, test được.
 *
 * ## Không có procedure `admin.content.*`, và đó là quyết định đúng
 *
 * Trang này gọi `authoring.list` + `authoring.archive`. `authorProcedure` đã
 * cho `admin` qua, `listAuthoredBy(db, null)` với admin trả MỌI bài của MỌI
 * người, và `assertContentOwner` bỏ qua phép kiểm chủ sở hữu khi vai trò là
 * `admin`. Thêm một cặp procedure song song chỉ để đổi tên là thêm một đường
 * ghi thứ hai lên cùng bảng, tức thêm một chỗ để hai đường trôi khỏi nhau.
 */

function isContentKind(value: string): value is ContentKind {
  return (CONTENT_KINDS as readonly string[]).includes(value);
}

function isContentState(value: string): value is ContentState {
  return (CONTENT_STATES as readonly string[]).includes(value);
}

const STATE_VARIANT: Readonly<Record<ContentState, BadgeVariant>> = {
  draft: 'outline',
  publishing: 'warning',
  published: 'success',
  archived: 'secondary',
};

/** Bộ lọc trạng thái; `'all'` là sentinel của giao diện (Radix Select không nhận `value=""`). */
export const CONTENT_STATE_FILTERS: readonly (ContentState | 'all')[] = ['all', ...CONTENT_STATES];

export const CONTENT_KIND_LIST: readonly ContentKind[] = CONTENT_KINDS;

/**
 * Nhãn loại nội dung; giá trị lạ giữ nguyên chuỗi gốc thay vì thành ô trống.
 *
 * Phép thu hẹp đi qua `CONTENT_KINDS` chứ không qua một phép ép kiểu: `t()` chỉ
 * nhận khoá có thật, nên `admin.content-kind.${kind}` phải chứng minh được
 * `kind` thuộc union trước khi ghép. Bản cũ dùng `KIND_LABEL[kind as ContentKind]`,
 * và phép ép đó cho một `undefined` lúc chạy mà tầng kiểu không thấy.
 */
export function describeContentKind(kind: string): string {
  return isContentKind(kind) ? t(`admin.content-kind.${kind}`) : kind;
}

export function describeContentState(state: string): string {
  return isContentState(state) ? t(`admin.content-state.${state}`) : state;
}

export function contentStateVariant(state: string): BadgeVariant {
  return isContentState(state) ? STATE_VARIANT[state] : 'warning';
}

export interface ArchivePlan {
  readonly allowed: boolean;
  readonly blockedReason: string | null;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
}

/**
 * Câu xác nhận cho `authoring.archive`.
 *
 * Lưu trữ KHÔNG phải xoá, và câu chữ phải nói ra: `progress.lesson_id` và
 * `lab_attempts.lab_id` là cột text KHÔNG có khoá ngoại, nên xoá một bài sẽ làm
 * chúng trỏ vào hư không trong im lặng, tức tiến độ của người học biến mất khỏi
 * màn hình mà không ai biết vì sao. Đó là lý do `authoring.ts` chỉ có `archive`.
 */
export function planArchive(input: {
  readonly title: string;
  readonly kind: string;
  readonly state: string;
}): ArchivePlan {
  const what = t('admin.archive.what', {
    kind: describeContentKind(input.kind),
    title: input.title,
  });
  const title = t('admin.archive.title', { what });
  const confirmLabel = t('admin.archive.confirm');

  if (input.state === 'archived') {
    return {
      allowed: false,
      blockedReason: t('admin.archive.blocked-archived'),
      title,
      body: t('admin.archive.body-archived', { what }),
      confirmLabel,
    };
  }

  if (input.state === 'publishing') {
    return {
      allowed: false,
      blockedReason: t('admin.archive.blocked-publishing'),
      title,
      body: t('admin.archive.body-publishing', { what }),
      confirmLabel,
    };
  }

  return {
    allowed: true,
    blockedReason: null,
    title,
    body: t('admin.archive.body', { what }),
    confirmLabel,
  };
}

/** Câu lỗi khi lưu trữ hỏng. Ghép hai nửa vì `ConfirmDialog` chỉ có một khe `error`. */
export function describeArchiveError(message: string): string {
  const entry = err('admin.error.archive', { message });
  return `${entry.what} ${entry.next}`;
}

/**
 * Sắp bảng: đang xuất bản lên trước (đó là thứ người trực cần nhìn), rồi tới
 * bài lỗi xuất bản, rồi theo thời điểm sửa gần nhất.
 */
const STATE_ORDER: Readonly<Record<string, number>> = {
  publishing: 0,
  draft: 2,
  published: 3,
  archived: 4,
};

export interface ContentRowLike {
  readonly state: string;
  readonly publishError: string | null;
  readonly updatedAt: string;
}

export function orderContent<T extends ContentRowLike>(rows: readonly T[]): readonly T[] {
  return [...rows].sort((left, right) => {
    const leftRank = rankContent(left);
    const rightRank = rankContent(right);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function rankContent(row: ContentRowLike): number {
  // Bài lỗi xuất bản nằm ngay sau bài đang chạy: nó là việc CẦN LÀM, và nếu để
  // nó chìm theo thứ tự thời gian thì không ai thấy cho tới khi người soạn hỏi.
  if (row.state !== 'publishing' && row.publishError !== null) {
    return 1;
  }
  return STATE_ORDER[row.state] ?? 5;
}

/** Lọc theo trạng thái ở CLIENT; `authoring.list` không nhận tham số lọc và trả về cả danh sách. */
export function filterContentByState<T extends { readonly state: string }>(
  rows: readonly T[],
  state: string,
): readonly T[] {
  return state === 'all' ? rows : rows.filter((row) => row.state === state);
}
