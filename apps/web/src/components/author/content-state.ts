import { CONTENT_STATES, type ContentKind, type ContentState } from '@devops-platform/shared-types/authoring';

/**
 * Từ vựng TRẠNG THÁI cho trang soạn bài (13.F task 20).
 *
 * Hàm thuần, không biết tRPC, không biết React — đó là điều kiện để chúng có
 * test trong `apps/web` (vitest ở đây chạy môi trường **node**, không có jsdom
 * và không có React Testing Library; xem `apps/web/vitest.config.ts`). Mọi
 * quyết định "hiện chữ gì" của lane F vì thế nằm ở tầng này chứ không nằm trong
 * JSX, và JSX chỉ còn việc vẽ.
 */

/**
 * Hàng `authoring.list` trả về, ở dạng CẤU TRÚC.
 *
 * Cố ý KHÔNG `import type { AppRouter }` rồi `inferRouterOutputs`: những hàm
 * dưới đây chỉ đọc năm field, và buộc chúng vào kiểu suy ra từ router nghĩa là
 * mỗi lần BE1 thêm một field thì tầng thuần này phải biên dịch lại một kiểu nó
 * không dùng. Trang gọi API vẫn nhận kiểu thật từ tRPC; chỗ hẹp này là seam.
 */
export interface AuthoredItem {
  readonly id: string;
  readonly kind: ContentKind;
  readonly state: ContentState;
  readonly title: string;
  readonly stepCount: number;
  readonly publishError: string | null;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export const KIND_LABELS: Readonly<Record<ContentKind, string>> = {
  lesson: 'Bài học',
  lab: 'Lab',
  playground: 'Playground',
};

export const STATE_LABELS: Readonly<Record<ContentState, string>> = {
  draft: 'Nháp',
  publishing: 'Đang xuất bản',
  published: 'Đã xuất bản',
  archived: 'Lưu trữ',
};

/** Variant `Badge` (C2) cho từng trạng thái — một bảng, không phải một chuỗi ternary. */
export const STATE_BADGE: Readonly<Record<ContentState, 'default' | 'secondary' | 'success' | 'warning' | 'outline'>> =
  {
    draft: 'secondary',
    publishing: 'warning',
    published: 'success',
    archived: 'outline',
  };

/** Bộ lọc của trang danh sách: bốn trạng thái + một mục "tất cả". */
export const STATE_FILTERS = ['all', ...CONTENT_STATES] as const;
export type StateFilter = (typeof STATE_FILTERS)[number];

export function filterLabel(filter: StateFilter): string {
  return filter === 'all' ? 'Tất cả' : STATE_LABELS[filter];
}

/**
 * Lọc theo trạng thái ở CLIENT — và đó là chủ ý, không phải một lối tắt.
 *
 * `authoring.list` là procedure zero-arg, không phân trang, trả về mọi bài của
 * người gọi (admin: mọi bài) trong một lượt. Không có tham số `state` nào để
 * truyền, nên lọc ở client là chỗ DUY NHẤT có thể lọc. Hệ quả cần nói thẳng
 * với người soạn: con số ở mỗi tab là **toàn bộ**, không phải "trang này".
 */
export function filterByState(items: readonly AuthoredItem[], filter: StateFilter): readonly AuthoredItem[] {
  return filter === 'all' ? items : items.filter((item) => item.state === filter);
}

/**
 * Đếm theo trạng thái, TÍNH LÚC ĐỌC.
 *
 * `rules/code-conventions.md` § No Derived Fields ở dạng nhỏ nhất: con số này
 * suy được 100% từ `items`, nên nó không được giữ trong state của React rồi cập
 * nhật bằng tay — một `useState` ở đây là một bản sao sẽ lệch đúng vào lúc
 * `invalidate` chạy mà không ai để ý.
 */
export function countByFilter(items: readonly AuthoredItem[]): Readonly<Record<StateFilter, number>> {
  const counts: Record<StateFilter, number> = {
    all: items.length,
    draft: 0,
    publishing: 0,
    published: 0,
    archived: 0,
  };
  for (const item of items) {
    counts[item.state] += 1;
  }
  return counts;
}

/**
 * Sắp xếp: sửa gần nhất lên đầu, id làm khoá phá hoà.
 *
 * `updatedAt` là chuỗi ISO 8601 (router đã `.toISOString()`), nên so sánh chuỗi
 * ĐÚNG BẰNG so sánh thời gian — cùng độ dài, cùng múi giờ `Z`, cùng số chữ số
 * mili giây. Đổi định dạng ở BE mà không đổi hàm này là một lỗi thầm lặng, nên
 * test pin đúng giả định đó.
 */
export function sortByRecent(items: readonly AuthoredItem[]): readonly AuthoredItem[] {
  return [...items].sort((a, b) =>
    a.updatedAt === b.updatedAt ? a.id.localeCompare(b.id) : b.updatedAt.localeCompare(a.updatedAt),
  );
}

/**
 * Một dòng mô tả bài, nói ĐÚNG thứ ta biết.
 *
 * ⚠ `stepCount` là số hàng `content_steps`, và nó có nghĩa khác nhau theo loại:
 * bước của bài học, task của lab, và **luôn 0** với playground (playground
 * không có thân). Viết "0 bước" cho một playground là đúng số nhưng sai nghĩa —
 * đúng lớp lỗi mà nhãn `"4/4 bước"` của P2 đã mắc.
 */
export function describeItem(item: AuthoredItem): string {
  const kind = KIND_LABELS[item.kind];
  switch (item.kind) {
    case 'playground':
      return `${kind} · không có bước`;
    case 'lab':
      return `${kind} · ${String(item.stepCount)} task`;
    case 'lesson':
      return `${kind} · ${String(item.stepCount)} bước`;
  }
}

/**
 * `publishError` còn sót trên một bài `draft` = lượt xuất bản gần nhất đã TRƯỢT.
 *
 * `publish` xoá field này ngay khi nhận lượt mới, và `runPublishTrial` chỉ ghi
 * nó ở nhánh thất bại — nên "draft + có lỗi" là dấu vết đọc được, không phải
 * một suy đoán. Trạng thái khác (`published`, `archived`) thì lỗi cũ không còn
 * nói gì về bản đang chạy, và hiện nó ra là làm người soạn hoảng.
 */
export function lastPublishFailure(item: AuthoredItem): string | null {
  return item.state === 'draft' && item.publishError !== null ? item.publishError : null;
}

/**
 * "Sửa lúc nào" ở dạng người đọc được, TÍNH từ hai đầu vào tường minh.
 *
 * `now` là THAM SỐ chứ không phải `new Date()` đọc bên trong: một hàm đọc đồng
 * hồ hệ thống không test được ở mọi múi giờ, và `Intl`/`toLocaleString` còn tệ
 * hơn — chuỗi nó trả ra đổi theo bản ICU của máy chạy, nên một test pin chuỗi
 * đó sẽ đỏ trên CI mà xanh ở máy dev. Nhánh cuối vì thế cắt thẳng phần ngày của
 * chuỗi ISO (UTC, đúng thứ BE gửi) thay vì đổi sang giờ địa phương.
 */
export function formatUpdatedAt(iso: string, now: Date): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    // Chuỗi hỏng KHÔNG được vẽ thành "vừa xong": đó là bịa. Trả nguyên văn để
    // người đọc thấy đúng thứ máy chủ gửi.
    return iso;
  }
  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (minutes < 0) {
    // Đồng hồ máy khách chạy chậm hơn máy chủ là chuyện thường (đã đo ở P12:
    // lệch ~59 s giữa VM và Windows). Vẽ nó thành "trong tương lai" là khoe một
    // sai số không ai sửa được từ đây.
    return 'vừa xong';
  }
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${String(minutes)} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${String(days)} ngày trước`;
  return iso.slice(0, 10);
}
