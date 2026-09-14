import { renderCopy, type CopyRef, type StaticTextKey } from '@devops-platform/copy';
import {
  type ProblemDifficulty,
  type ProblemOrderKey,
  type ProblemStats,
  type ProblemTopic,
  type ProblemViewerStatus,
} from '@devops-platform/games';

/**
 * Nhãn + cách định dạng cho trang bài tập OJ. Hàm THUẦN, không JSX, để cả phần
 * hiển thị lẫn test dùng chung được.
 *
 * ## Chữ không còn ở đây, chỉ còn nhánh và bảng khoá
 *
 * Mọi chuỗi người dùng đọc đã sang `packages/copy/src/surfaces/catalog.ts`.
 * Thứ ở lại là ba bảng ÁNH XẠ giá trị sang khoá, hai bảng ánh xạ giá trị sang
 * biến thể `Badge`, và các hàm CHỌN, và các hàm chọn trả về `CopyRef`
 * (`{ key, params }`) chứ không trả câu đã ghép, theo §1.6 của
 * `contracts/p16-copy.md`.
 *
 * Lý do là cơ học chứ không phải phong cách: một hàm ghép câu tại chỗ thì cổng
 * gạch ngang dài và cổng mất dấu chỉ soi được nhánh mà test gọi tới, còn nhánh
 * kia đi thẳng ra người dùng không qua cổng nào. `formatAcceptance` có đúng hai
 * nhánh và một trong hai là câu dễ sai nhất của cả màn (xem dưới), nên đây
 * chính là chỗ luật đó mua được thứ gì đó thật.
 *
 * ⛔ KHÔNG viết lại `PROBLEM_TOPIC_LABELS` / `PROBLEM_DIFFICULTY_LABELS` ở đây,
 * và cũng không kéo chúng sang `packages/copy`: hai bảng đó là SSOT nằm trong
 * hợp đồng (`packages/games/src/k8s/problem.ts`), §5.1 cấm trích chữ ra khỏi
 * package đó, và §8 của `phase-16.md` đặt nó ngoài phạm vi. File này chỉ nhập
 * chúng vào chỗ dùng.
 */

/**
 * Dựng một bảng `giá trị -> khoá` thành bảng `giá trị -> chữ`, một lần lúc nạp
 * module.
 *
 * Bảng KHOÁ là SSOT; bảng chữ là thứ suy ra từ nó, nên không có hai nguồn để
 * lệch nhau. Nó tồn tại vì `FilterChecklist` và `SelectItem` nhận
 * `Record<T, string>`, và bắt mỗi nơi gọi tự dựng lại phép ánh xạ này là chép
 * cùng một vòng lặp ra bốn chỗ.
 */
function labelsFrom<T extends string>(
  keys: Readonly<Record<T, StaticTextKey>>,
): Readonly<Record<T, string>> {
  const out = {} as Record<T, string>;
  /*
    `Object.entries` khai kiểu khoá là `string`, và TypeScript từ chối ép thẳng
    `string` sang `T` vì `T` có thể hẹp hơn. Bắc qua `unknown` một lần, ở đúng
    một chỗ: lúc chạy thì khoá của `keys` ĐÚNG là `T` theo chính kiểu tham số,
    nên phép ép này không giấu một khả năng nào có thật.

    ⚠ Lỗi này chỉ đỏ ở `next build`, KHÔNG đỏ ở `turbo run typecheck`. Hai pha
    dùng hai cấu hình khác nhau, nên `typecheck` xanh không thay được `build`.
  */
  for (const [value, key] of Object.entries(keys) as unknown as readonly (readonly [
    T,
    StaticTextKey,
  ])[]) {
    out[value] = renderCopy({ key });
  }
  return out;
}

/**
 * Ba trạng thái của NGƯỜI ĐANG XEM, dạng mảng để dựng bộ lọc.
 *
 * Hợp đồng khai `ProblemViewerStatus` là một union nhưng KHÔNG kèm mảng hằng
 * như `PROBLEM_TOPICS`, nên mảng này phải khai ở đây. Hai cái gác giữ nó khỏi
 * trôi khi union đổi: `satisfies` chặn chiều "mảng có phần tử không thuộc
 * union", còn `Record<ProblemViewerStatus, StaticTextKey>` của bảng khoá ngay dưới
 * chặn chiều "union có thành viên mảng chưa liệt kê", thêm một trạng thái thứ
 * tư vào hợp đồng sẽ làm bảng khoá đỏ ngay, chứ không lặng lẽ biến mất khỏi bộ
 * lọc.
 */
export const PROBLEM_VIEWER_STATUSES = [
  'solved',
  'attempted',
  'untouched',
] as const satisfies readonly ProblemViewerStatus[];

export const PROBLEM_VIEWER_STATUS_KEYS = {
  solved: 'catalog.problems.viewer.solved',
  attempted: 'catalog.problems.viewer.attempted',
  untouched: 'catalog.problems.viewer.untouched',
} as const satisfies Record<ProblemViewerStatus, StaticTextKey>;

export const PROBLEM_VIEWER_STATUS_LABELS = labelsFrom(PROBLEM_VIEWER_STATUS_KEYS);

/**
 * Biến thể `Badge` cho trạng thái người xem. Ba token trạng thái của
 * `globals.css` khớp 1-1 với ba giá trị, không phải ánh xạ mất mát nào.
 */
export const PROBLEM_VIEWER_STATUS_VARIANT: Readonly<
  Record<ProblemViewerStatus, 'status-done' | 'status-progress' | 'status-todo'>
> = {
  solved: 'status-done',
  attempted: 'status-progress',
  untouched: 'status-todo',
};

/**
 * Biến thể `Badge` cho độ khó, bốn bậc, bốn token, không ánh xạ mất mát nào.
 *
 * Bản đầu của lane này phải cho `expert` dùng chung nền với `hard` vì
 * `globals.css` mới có ba token (thang ba bậc của `packages/scenario`), và
 * `problem.ts` cấm ánh xạ ngầm giữa hai thang. Lead đã thêm
 * `--difficulty-expert` + biến thể `Badge` thứ tám (2026-09-08) nên chỗ chắp vá
 * đó biến mất: giữ lại nó bây giờ sẽ là hai bậc trùng màu mà không còn lý do.
 *
 * `Record<ProblemDifficulty, …>` giữ bảng này đầy đủ, thêm một bậc thứ năm vào
 * hợp đồng sẽ đỏ ở đây thay vì rơi về một biến thể mặc định nào đó.
 */
export const PROBLEM_DIFFICULTY_VARIANT: Readonly<
  Record<
    ProblemDifficulty,
    'difficulty-basic' | 'difficulty-intermediate' | 'difficulty-advanced' | 'difficulty-expert'
  >
> = {
  easy: 'difficulty-basic',
  medium: 'difficulty-intermediate',
  hard: 'difficulty-advanced',
  expert: 'difficulty-expert',
};

/**
 * Tỉ lệ giải, dạng khoá.
 *
 * ⚠ Nhận cả `ProblemStats` chứ không chỉ `acceptanceRate`, vì "0%" và "chưa ai
 * thử" là HAI câu khác nhau và hợp đồng cho cả hai cùng một số 0
 * (`acceptanceRate` = 0 khi `attemptCount` = 0). In "0%" lúc chưa ai thử là nói
 * rằng bài này ai cũng trượt: một câu sai, và sai theo hướng làm người học né
 * bài.
 */
export function formatAcceptance(stats: ProblemStats): CopyRef {
  if (stats.attemptCount === 0) {
    return { key: 'catalog.problems.acceptance-none' };
  }
  return {
    key: 'catalog.problems.acceptance-percent',
    params: { percent: Math.round(stats.acceptanceRate * 100) },
  };
}

/** Hạn giờ. `null` = không giới hạn, hợp đồng nói rõ không phải bài nào cũng nên chạy đua. */
export function formatTimeLimit(seconds: number | null): CopyRef {
  if (seconds === null) {
    return { key: 'catalog.problems.time-unlimited' };
  }
  return formatDuration(seconds);
}

/** Khoảng thời gian tính bằng giây, thành "M phút S giây", bỏ vế bằng 0. */
export function formatDuration(seconds: number): CopyRef {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  if (minutes === 0) {
    return { key: 'catalog.problems.duration.seconds', params: { seconds: rest } };
  }
  if (rest === 0) {
    return { key: 'catalog.problems.duration.minutes', params: { minutes } };
  }
  return { key: 'catalog.problems.duration.both', params: { minutes, seconds: rest } };
}

/**
 * Mốc thời gian ISO thành chữ tiếng Việt.
 *
 * CHỈ gọi trong component client (sau khi query trả về). Gọi lúc render máy chủ
 * sẽ định dạng theo múi giờ máy chủ rồi hydrate lại theo múi giờ trình duyệt,
 * một sai lệch React báo là hydration mismatch chứ không phải lỗi ngày giờ, nên
 * rất khó lần ra.
 *
 * KHÔNG đi qua `packages/copy`: đầu ra là do `Intl.DateTimeFormat` sinh ra theo
 * locale, không phải một câu ai đó viết, nên bản đồ thông điệp không có gì để
 * giữ. Nhánh hỏng trả lại chính chuỗi đầu vào, cũng không phải chữ biên tập.
 *
 * ⚠ Trùng TÊN với `apps/web/src/lib/format-moment.ts`, và hai hàm KHÁC hành vi:
 * bản kia trả "không rõ" cho đầu vào hỏng. Gộp lại là việc đúng nên làm, nhưng
 * `lib/` nằm ngoài đường sở hữu của lane này. Đã ghi vào báo cáo chặng.
 */
export function formatMoment(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(at);
}

/**
 * Danh sách chủ đề của một bài, ghép thành một câu cho ô bảng hẹp.
 *
 * Dấu phẩy là DẤU NỐI, không phải chữ biên tập, nên nó không vào bản đồ thông
 * điệp. Chữ của từng chủ đề tới từ `PROBLEM_TOPIC_LABELS` của `packages/games`.
 */
export function joinTopics(
  topics: readonly ProblemTopic[],
  labels: Readonly<Record<ProblemTopic, string>>,
): string {
  return topics.map((topic) => labels[topic]).join(', ');
}

/**
 * Khoá nhãn cho bốn khoá sắp xếp của hợp đồng.
 *
 * `Record<ProblemOrderKey, StaticTextKey>` chứ không phải một mảng cặp: thêm một khoá
 * vào `PROBLEM_ORDER_KEYS` mà quên nhãn sẽ đỏ ngay ở đây, thay vì hiện ra một
 * mục trống trong ô chọn. Và KHÔNG có `title`, hợp đồng loại nó vì collation
 * Postgres không khớp JavaScript với tiếng Việt có dấu, mà lệch thứ tự dưới
 * phân trang keyset nghĩa là mất dòng trong im lặng.
 */
export const PROBLEM_ORDER_KEY_LABELS = {
  code: 'catalog.problems.order-code',
  difficulty: 'catalog.problems.order-difficulty',
  solverCount: 'catalog.problems.order-solvers',
  createdAt: 'catalog.problems.order-created',
} as const satisfies Record<ProblemOrderKey, StaticTextKey>;

export const PROBLEM_ORDER_LABELS = labelsFrom(PROBLEM_ORDER_KEY_LABELS);

export const PROBLEM_DIRECTION_KEY_LABELS = {
  asc: 'catalog.problems.direction-asc',
  desc: 'catalog.problems.direction-desc',
} as const satisfies Record<'asc' | 'desc', StaticTextKey>;

export const PROBLEM_DIRECTION_LABELS = labelsFrom(PROBLEM_DIRECTION_KEY_LABELS);
