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
 * ⛔ KHÔNG viết lại `PROBLEM_TOPIC_LABELS` / `PROBLEM_DIFFICULTY_LABELS` ở đây —
 * hai bảng đó là SSOT nằm trong hợp đồng (`packages/games/src/k8s/problem.ts`)
 * và file này chỉ nhập chúng vào chỗ dùng.
 */

/**
 * Ba trạng thái của NGƯỜI ĐANG XEM, dạng mảng để dựng bộ lọc.
 *
 * Hợp đồng khai `ProblemViewerStatus` là một union nhưng KHÔNG kèm mảng hằng
 * như `PROBLEM_TOPICS`, nên mảng này phải khai ở đây. Hai cái gác giữ nó khỏi
 * trôi khi union đổi: `satisfies` chặn chiều "mảng có phần tử không thuộc
 * union", còn `Record<ProblemViewerStatus, string>` của bảng nhãn ngay dưới
 * chặn chiều "union có thành viên mảng chưa liệt kê" — thêm một trạng thái thứ
 * tư vào hợp đồng sẽ làm bảng nhãn đỏ ngay, chứ không lặng lẽ biến mất khỏi bộ
 * lọc.
 */
export const PROBLEM_VIEWER_STATUSES = [
  'solved',
  'attempted',
  'untouched',
] as const satisfies readonly ProblemViewerStatus[];

export const PROBLEM_VIEWER_STATUS_LABELS: Readonly<Record<ProblemViewerStatus, string>> = {
  solved: 'Đã giải',
  attempted: 'Đã thử',
  untouched: 'Chưa động tới',
};

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
 * Biến thể `Badge` cho độ khó — bốn bậc, bốn token, không ánh xạ mất mát nào.
 *
 * Bản đầu của lane này phải cho `expert` dùng chung nền với `hard` vì
 * `globals.css` mới có ba token (thang ba bậc của `packages/scenario`), và
 * `problem.ts` cấm ánh xạ ngầm giữa hai thang. Lead đã thêm
 * `--difficulty-expert` + biến thể `Badge` thứ tám (2026-09-08) nên chỗ chắp vá
 * đó biến mất: giữ lại nó bây giờ sẽ là hai bậc trùng màu mà không còn lý do.
 *
 * `Record<ProblemDifficulty, …>` giữ bảng này đầy đủ — thêm một bậc thứ năm vào
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
 * Tỉ lệ giải, dạng chữ.
 *
 * ⚠ Nhận cả `ProblemStats` chứ không chỉ `acceptanceRate`, vì "0%" và "chưa ai
 * thử" là HAI câu khác nhau và hợp đồng cho cả hai cùng một số 0
 * (`acceptanceRate` = 0 khi `attemptCount` = 0). In "0%" lúc chưa ai thử là nói
 * rằng bài này ai cũng trượt — một câu sai, và sai theo hướng làm người học né
 * bài.
 */
export function formatAcceptance(stats: ProblemStats): string {
  if (stats.attemptCount === 0) {
    return 'Chưa ai thử';
  }
  return `${Math.round(stats.acceptanceRate * 100)}%`;
}

/** Hạn giờ. `null` = không giới hạn — hợp đồng nói rõ không phải bài nào cũng nên chạy đua. */
export function formatTimeLimit(seconds: number | null): string {
  if (seconds === null) {
    return 'Không giới hạn';
  }
  return formatDuration(seconds);
}

/** Khoảng thời gian tính bằng giây → "M phút S giây", bỏ vế bằng 0. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  if (minutes === 0) {
    return `${rest} giây`;
  }
  if (rest === 0) {
    return `${minutes} phút`;
  }
  return `${minutes} phút ${rest} giây`;
}

/**
 * Mốc thời gian ISO → chữ tiếng Việt.
 *
 * CHỈ gọi trong component client (sau khi query trả về). Gọi lúc render máy chủ
 * sẽ định dạng theo múi giờ máy chủ rồi hydrate lại theo múi giờ trình duyệt —
 * một sai lệch React báo là hydration mismatch chứ không phải lỗi ngày giờ, nên
 * rất khó lần ra.
 */
export function formatMoment(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(at);
}

/** Danh sách chủ đề của một bài, ghép thành một câu cho ô bảng hẹp. */
export function joinTopics(topics: readonly ProblemTopic[], labels: Readonly<Record<ProblemTopic, string>>): string {
  return topics.map((topic) => labels[topic]).join(', ');
}

/**
 * Nhãn cho bốn khoá sắp xếp của hợp đồng.
 *
 * `Record<ProblemOrderKey, string>` chứ không phải một mảng cặp: thêm một khoá
 * vào `PROBLEM_ORDER_KEYS` mà quên nhãn sẽ đỏ ngay ở đây, thay vì hiện ra một
 * mục trống trong ô chọn. Và KHÔNG có `title` — hợp đồng loại nó vì collation
 * Postgres không khớp JavaScript với tiếng Việt có dấu, mà lệch thứ tự dưới
 * phân trang keyset nghĩa là mất dòng trong im lặng.
 */
export const PROBLEM_ORDER_LABELS: Readonly<Record<ProblemOrderKey, string>> = {
  code: 'Mã bài',
  difficulty: 'Độ khó',
  solverCount: 'Số người giải',
  createdAt: 'Ngày thêm',
};

export const PROBLEM_DIRECTION_LABELS: Readonly<Record<'asc' | 'desc', string>> = {
  asc: 'Tăng dần',
  desc: 'Giảm dần',
};
