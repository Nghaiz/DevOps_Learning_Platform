import { CONTENT_STATES, type ContentKind, type ContentState } from '@devops-platform/shared-types/authoring';
import { t, type TextKey } from '@devops-platform/copy';
import type { CopyRef } from '../catalog/catalog-labels';

/**
 * Từ vựng TRẠNG THÁI cho trang soạn bài (13.F task 20).
 *
 * Hàm thuần, không biết tRPC, không biết React (đó là điều kiện để chúng có
 * test trong `apps/web`: vitest ở đây chạy môi trường **node**, không có jsdom
 * và không có React Testing Library; xem `apps/web/vitest.config.ts`). Mọi
 * quyết định "hiện chữ gì" của lane F vì thế nằm ở tầng này chứ không nằm trong
 * JSX, và JSX chỉ còn việc vẽ.
 *
 * ## Chữ không còn ở đây, chỉ còn nhánh (P16 / 16.G)
 *
 * Mọi chuỗi hiển thị đã chuyển sang `packages/copy/src/surfaces/author.ts`.
 * Thứ ở lại là các hàm CHỌN, và chúng trả về `CopyRef` (`{ key, params }`) chứ
 * không trả về câu đã ghép, theo §1.6 của `contracts/p16-copy.md`. Một hàm ghép
 * câu tại chỗ thì cổng gạch ngang dài và cổng mất dấu chỉ soi được nhánh mà
 * test gọi tới, còn nhánh kia đi thẳng ra người dùng không qua cổng nào.
 *
 * `CopyRef` và `renderCopy` mượn từ `components/catalog/catalog-labels.ts` chứ
 * KHÔNG khai lại ở đây: lane 16.C đã dựng đúng một bản, và
 * `app/(session)/problems/problem-labels.ts` đã mượn qua đúng đường này. Hai
 * bản của cùng một kiểu là hai bản sẽ lệch.
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

export const KIND_KEYS: Readonly<Record<ContentKind, TextKey>> = {
  lesson: 'author.kind.lesson',
  lab: 'author.kind.lab',
  playground: 'author.kind.playground',
};

export const STATE_KEYS: Readonly<Record<ContentState, TextKey>> = {
  draft: 'author.state.draft',
  publishing: 'author.state.publishing',
  published: 'author.state.published',
  archived: 'author.state.archived',
};

/** Variant `Badge` (C2) cho từng trạng thái: một bảng, không phải một chuỗi ternary. */
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

export function filterLabelKey(filter: StateFilter): TextKey {
  return filter === 'all' ? 'author.list.filter.all' : STATE_KEYS[filter];
}

/**
 * Lọc theo trạng thái ở CLIENT, và đó là chủ ý chứ không phải một lối tắt.
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
 * nhật bằng tay. Một `useState` ở đây là một bản sao sẽ lệch đúng vào lúc
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
 * ĐÚNG BẰNG so sánh thời gian: cùng độ dài, cùng múi giờ `Z`, cùng số chữ số
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
 * không có thân). Viết "0 bước" cho một playground là đúng số nhưng sai nghĩa,
 * đúng lớp lỗi mà nhãn `"4/4 bước"` của P2 đã mắc. Nhánh playground vì thế
 * không nhận `n` ở tầng kiểu, chứ không chỉ là không hiện nó.
 *
 * `kind` được dựng bằng `t()` tại đây thay vì truyền khoá xuống: nhãn loại nội
 * dung tự nó cũng là một mục trong bản đồ, nên bộ dò vẫn đọc được nó, và nơi
 * gọi không phải ghép hai `renderCopy` lồng nhau cho một dòng chữ.
 */
export function describeItem(item: AuthoredItem): CopyRef {
  const kind = t(KIND_KEYS[item.kind]);
  switch (item.kind) {
    case 'playground':
      return { key: 'author.item.desc.playground', params: { kind } };
    case 'lab':
      return { key: 'author.item.desc.lab', params: { kind, n: item.stepCount } };
    case 'lesson':
      return { key: 'author.item.desc.lesson', params: { kind, n: item.stepCount } };
  }
}

/**
 * `publishError` còn sót trên một bài `draft` = lượt xuất bản gần nhất đã TRƯỢT.
 *
 * `publish` xoá field này ngay khi nhận lượt mới, và `runPublishTrial` chỉ ghi
 * nó ở nhánh thất bại, nên "draft + có lỗi" là dấu vết đọc được chứ không phải
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
 * hơn, vì chuỗi nó trả ra đổi theo bản ICU của máy chạy nên một test pin chuỗi
 * đó sẽ đỏ trên CI mà xanh ở máy dev. Nhánh `on-date` vì thế cắt thẳng phần
 * ngày của chuỗi ISO (UTC, đúng thứ BE gửi) thay vì đổi sang giờ địa phương.
 *
 * ⚠ Đổi tên từ `formatUpdatedAt`: cái tên cũ hứa trả về một chuỗi đã định dạng,
 * và nó không còn làm thế. Giữ tên cũ cho một kiểu trả về mới là cách chắc chắn
 * để nơi gọi tiếp theo dùng sai.
 */
export function describeUpdatedAt(iso: string, now: Date): CopyRef {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    // Chuỗi hỏng KHÔNG được vẽ thành "vừa xong": đó là bịa. Nhánh `unknown` giữ
    // nguyên văn thứ máy chủ gửi VÀ nói ra rằng nó không đọc được, nên người
    // đọc không tưởng đó là định dạng mốc thời gian của hệ thống.
    return { key: 'author.item.updated.unknown', params: { value: iso } };
  }
  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (minutes < 0) {
    // Đồng hồ máy khách chạy chậm hơn máy chủ là chuyện thường (đã đo ở P12:
    // lệch ~59 s giữa VM và Windows). Vẽ nó thành "trong tương lai" là khoe một
    // sai số không ai sửa được từ đây.
    return { key: 'author.item.updated.just-now' };
  }
  if (minutes < 1) return { key: 'author.item.updated.just-now' };
  if (minutes < 60) return { key: 'author.item.updated.minutes', params: { n: minutes } };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'author.item.updated.hours', params: { n: hours } };
  const days = Math.floor(hours / 24);
  if (days <= 7) return { key: 'author.item.updated.days', params: { n: days } };
  return { key: 'author.item.updated.on-date', params: { date: iso.slice(0, 10) } };
}
