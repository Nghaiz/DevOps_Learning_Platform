import {
  PROBLEM_DIFFICULTIES,
  PROBLEM_ORDER_KEYS,
  PROBLEM_TOPICS,
  type ProblemDifficulty,
  type ProblemFilter,
  type ProblemListOptions,
  type ProblemOrderKey,
  type ProblemTopic,
  type ProblemViewerStatus,
} from '@devops-platform/games';
import { PROBLEM_VIEWER_STATUSES } from './problem-labels';

/**
 * Bộ mã hoá HAI CHIỀU giữa thanh địa chỉ và bộ lọc danh sách bài.
 *
 * Vì sao trạng thái lọc sống trong URL chứ trong `useState`: một bộ lọc đã gõ
 * xong là thứ người ta gửi cho nhau ("làm mấy bài mạng khó đi") và là thứ họ
 * bấm nút quay lại để lấy lại. `useCatalogControls` của `/labs` giữ trong state
 * nên cả hai việc đó đều không làm được — không sai với `/labs` (bộ lọc ở đó
 * chỉ hai ô), nhưng ở đây bộ lọc có năm chiều nên gõ lại là một hình phạt.
 *
 * ⛔ CON TRỎ (`cursor`) CỐ Ý KHÔNG nằm trong URL. Nó là một NGĂN XẾP
 * (`lib/cursor-stack.ts`) chứ không phải một giá trị: số trang = độ dài ngăn
 * xếp, và nút "Về đầu" cần cả ngăn xếp. Nhét một cursor lẻ vào URL thì trang
 * mở từ link đó hiện "Trang 1" trong khi dữ liệu là trang giữa — đúng chế độ
 * hỏng mà `cursor-stack.ts` mô tả: hợp lệ, không lỗi, và sai.
 *
 * Hàm ở đây THUẦN, gác bằng `problem-query.test.ts`.
 */

export interface ProblemQuery {
  readonly filter: ProblemFilter;
  readonly orderBy: ProblemOrderKey;
  readonly direction: 'asc' | 'desc';
}

/** `code` tăng dần — khoá duy nhất theo từng dòng, xem `PROBLEM_ORDER_KEYS`. */
export const DEFAULT_PROBLEM_QUERY: ProblemQuery = { filter: {}, orderBy: 'code', direction: 'asc' };

/** Số bài mỗi trang. Bảng nhiều cột nên trang dài hơn là cuộn nhiều hơn chứ không đọc thêm được gì. */
export const PROBLEM_PAGE_SIZE = 25;

const PARAM = {
  difficulty: 'difficulty',
  topic: 'topic',
  tag: 'tag',
  status: 'status',
  query: 'q',
  order: 'order',
  direction: 'dir',
} as const;

/**
 * Chuẩn hoá một tag về đúng dạng hợp đồng ghi: "thường + gạch nối".
 *
 * Dấu phẩy bị bỏ vì nó là ký tự PHÂN CÁCH trong URL ở đây — một tag chứa dấu
 * phẩy sẽ tự tách làm đôi lúc đọc lại, và người dùng không có cách nào thấy
 * điều đó đã xảy ra.
 */
export function normalizeTag(raw: string): string {
  return raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/,/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function splitList(params: URLSearchParams, key: string): readonly string[] {
  const raw = params.get(key);
  if (raw === null) {
    return [];
  }
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * Giữ lại những giá trị THUỘC tập đóng, bỏ phần còn lại.
 *
 * Đây là LỌC ĐẦU VÀO, không phải fallback im lặng: URL là thứ người dùng gõ
 * tay và người khác dán vào, nên một giá trị lạ là dữ liệu hỏng chứ không phải
 * lỗi chương trình. Hậu quả nhìn thấy được là ô đánh dấu tương ứng không bật —
 * đọc được ngay trên màn hình, không cần đọc log.
 */
function keepKnown<T extends string>(values: readonly string[], allowed: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  return values.filter((value): value is T => {
    if (seen.has(value) || !(allowed as readonly string[]).includes(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

export function parseProblemQuery(params: URLSearchParams): ProblemQuery {
  const difficulty = keepKnown<ProblemDifficulty>(splitList(params, PARAM.difficulty), PROBLEM_DIFFICULTIES);
  const topics = keepKnown<ProblemTopic>(splitList(params, PARAM.topic), PROBLEM_TOPICS);
  const viewerStatus = keepKnown<ProblemViewerStatus>(splitList(params, PARAM.status), PROBLEM_VIEWER_STATUSES);
  const tags = [...new Set(splitList(params, PARAM.tag).map(normalizeTag).filter((tag) => tag !== ''))];
  const query = (params.get(PARAM.query) ?? '').trim();
  const orderRaw = params.get(PARAM.order);
  const orderBy = PROBLEM_ORDER_KEYS.find((key) => key === orderRaw) ?? DEFAULT_PROBLEM_QUERY.orderBy;

  return {
    filter: {
      ...(difficulty.length > 0 ? { difficulty } : {}),
      ...(topics.length > 0 ? { topics } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      ...(viewerStatus.length > 0 ? { viewerStatus } : {}),
      ...(query !== '' ? { query } : {}),
    },
    orderBy,
    direction: params.get(PARAM.direction) === 'desc' ? 'desc' : 'asc',
  };
}

/**
 * Chiều ngược lại. Giá trị MẶC ĐỊNH bị bỏ khỏi URL: `/problems` và
 * `/problems?order=code&dir=asc` là cùng một màn hình, nên chỉ một trong hai
 * đáng nằm trong lịch sử duyệt và trong link người ta gửi nhau.
 */
export function toSearchParams(query: ProblemQuery): URLSearchParams {
  const params = new URLSearchParams();
  const { filter } = query;
  const put = (key: string, values: readonly string[] | undefined): void => {
    if (values !== undefined && values.length > 0) {
      params.set(key, values.join(','));
    }
  };

  put(PARAM.difficulty, filter.difficulty);
  put(PARAM.topic, filter.topics);
  put(PARAM.tag, filter.tags);
  put(PARAM.status, filter.viewerStatus);
  if (filter.query !== undefined && filter.query !== '') {
    params.set(PARAM.query, filter.query);
  }
  if (query.orderBy !== DEFAULT_PROBLEM_QUERY.orderBy) {
    params.set(PARAM.order, query.orderBy);
  }
  if (query.direction !== DEFAULT_PROBLEM_QUERY.direction) {
    params.set(PARAM.direction, query.direction);
  }
  return params;
}

export function hasActiveFilter(filter: ProblemFilter): boolean {
  return (
    (filter.difficulty?.length ?? 0) > 0 ||
    (filter.topics?.length ?? 0) > 0 ||
    (filter.tags?.length ?? 0) > 0 ||
    (filter.viewerStatus?.length ?? 0) > 0 ||
    (filter.query ?? '') !== ''
  );
}

/**
 * Input cho `problems.list`.
 *
 * ⚠ Kiểu trả về là `ProblemListOptions` ĐÃ THU HẸP ở đúng một trường, và chỗ
 * thu hẹp đó là một chỗ LỆCH THẬT giữa hợp đồng và tầng kiểm đầu vào:
 * `ProblemListOptions.cursor` khai `string | null`, còn schema Zod của
 * `problems.list` chỉ nhận `string | undefined`. Một người đọc hợp đồng rồi
 * truyền thẳng `page.nextCursor` (vốn là `string | null`) sẽ đỏ mà không hiểu vì
 * sao — đã báo lane D và lead.
 *
 * Ở đây `null` không bao giờ phát sinh: con trỏ đến từ `cursor-stack.ts`, và
 * hàm `pushCursor` của nó CỐ Ý không đẩy `null` vào ngăn xếp (đẩy vào sẽ làm
 * trang sau nạp lại trang 1 dưới nhãn "trang N"). Nên thu hẹp kiểu là nói đúng
 * thứ hàm này thật sự sinh ra, không phải một phép ép kiểu che đi khả năng nào.
 *
 * ⛔ Không thêm khoá nào ngoài bốn khoá dưới đây — `Omit` giữ nguyên ràng buộc
 * đó với hợp đồng. Mọi input danh sách của repo khai `.strict()`, và bài học
 * đắt nhất về chuyện này là lần `useInfiniteQuery` tự chèn `direction` làm trắng
 * `/lessons` (xem `lib/trpc-react.tsx`): server trả `400 unrecognized_keys`,
 * trang không render gì, và test mức API vẫn xanh vì nó gọi thẳng procedure. Ở
 * đây `direction` là khoá THẬT của hợp đồng — cũng là lý do phải tự giữ cursor
 * thay vì dùng `useInfiniteQuery`.
 *
 * `state` KHÔNG được gửi: bài `draft` không hiện với người học là cổng của máy
 * chủ, và một bộ lọc do trình duyệt gửi lên không bao giờ là cổng.
 */
export type ProblemListInput = Omit<ProblemListOptions, 'cursor'> & { readonly cursor?: string };

export function buildProblemListInput(query: ProblemQuery, cursor: string | undefined): ProblemListInput {
  return {
    ...(hasActiveFilter(query.filter) ? { filter: query.filter } : {}),
    orderBy: query.orderBy,
    direction: query.direction,
    limit: PROBLEM_PAGE_SIZE,
    ...(cursor !== undefined ? { cursor } : {}),
  };
}
