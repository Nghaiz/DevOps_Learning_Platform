import type { ComponentProps } from 'react';
import { renderCopy, type CopyRef, type StaticTextKey } from '@devops-platform/copy';
import type { Difficulty } from '@devops-platform/ui';
import {
  type ProblemDifficulty,
  type ProblemOrderKey,
  type ProblemStats,
  type ProblemTopicId,
  type ProblemViewerStatus,
} from '@devops-platform/games';

/**
 * Nhãn + cách định dạng cho trang bài tập OJ. Hàm THUẦN, không JSX, để cả phần
 * hiển thị lẫn test dùng chung được.
 *
 * Mọi chuỗi người dùng đọc nằm ở `packages/copy/src/surfaces/problem.ts`
 * (`problem.oj.*`). Thứ ở lại đây là bảng ÁNH XẠ giá trị sang khoá và các hàm
 * CHỌN, và hàm chọn trả về `CopyRef` (`{ key, params }`) chứ không trả câu đã
 * ghép: bộ dò của `packages/copy` đọc bản đồ, nên mọi nhánh là một mục tĩnh mà
 * cổng gạch ngang và cổng mất dấu soi tới được, kể cả nhánh không test nào gọi.
 *
 * ⛔ KHÔNG viết lại `PROBLEM_TOPIC_LABELS` / `PROBLEM_DIFFICULTY_LABELS` ở đây.
 * Hai bảng đó là SSOT nằm trong hợp đồng (`packages/games/src/k8s/problem.ts`).
 */

/**
 * Dựng một bảng `giá trị -> khoá` thành bảng `giá trị -> chữ`, một lần lúc nạp
 * module. Bảng KHOÁ là SSOT; bảng chữ suy ra từ nó.
 */
function labelsFrom<T extends string>(
  keys: Readonly<Record<T, StaticTextKey>>,
): Readonly<Record<T, string>> {
  const out = {} as Record<T, string>;
  /*
    `Object.entries` khai kiểu khoá là `string`, và TypeScript từ chối ép thẳng
    sang `T`. Bắc qua `unknown` một lần, ở đúng một chỗ: lúc chạy thì khoá của
    `keys` ĐÚNG là `T` theo chính kiểu tham số.

    ⚠ Lỗi này chỉ đỏ ở `next build`, KHÔNG đỏ ở `turbo run typecheck`.
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
 * `satisfies` chặn chiều "mảng có phần tử lạ", còn `Record<ProblemViewerStatus,
 * StaticTextKey>` ngay dưới chặn chiều "union có thành viên chưa liệt kê".
 */
export const PROBLEM_VIEWER_STATUSES = [
  'solved',
  'attempted',
  'untouched',
] as const satisfies readonly ProblemViewerStatus[];

export const PROBLEM_VIEWER_STATUS_KEYS = {
  solved: 'problem.oj.viewer.solved',
  attempted: 'problem.oj.viewer.attempted',
  untouched: 'problem.oj.viewer.untouched',
} as const satisfies Record<ProblemViewerStatus, StaticTextKey>;

export const PROBLEM_VIEWER_STATUS_LABELS = labelsFrom(PROBLEM_VIEWER_STATUS_KEYS);

/**
 * Thang độ khó của bài tập (bốn bậc) sang glyph `Difficulty` của `packages/ui`.
 *
 * Hai thang cùng có bốn bậc nên đây là ánh xạ 1-1, không mất mát. Glyph chỉ vẽ
 * SỐ VẠCH; chữ của bậc vẫn đến từ `PROBLEM_DIFFICULTY_LABELS` của hợp đồng.
 */
export const PROBLEM_DIFFICULTY_LEVEL: Readonly<
  Record<ProblemDifficulty, ComponentProps<typeof Difficulty>['level']>
> = {
  easy: 'basic',
  medium: 'intermediate',
  hard: 'advanced',
  expert: 'expert',
};

/**
 * Tỉ lệ giải dưới dạng phần trăm nguyên, hoặc `null` khi chưa ai thử.
 *
 * ⚠ "0%" và "chưa ai thử" là HAI câu khác nhau, và hợp đồng cho cả hai cùng một
 * số 0 (`acceptanceRate` = 0 khi `attemptCount` = 0). In "0%" lúc chưa ai thử là
 * nói rằng bài này ai cũng trượt: sai, và sai theo hướng làm người học né bài.
 */
export function acceptancePercent(stats: ProblemStats): number | null {
  if (stats.attemptCount === 0) {
    return null;
  }
  return Math.round(stats.acceptanceRate * 100);
}

/** Tỉ lệ giải, dạng khoá. Cùng luật hai ca của `acceptancePercent`. */
export function formatAcceptance(stats: ProblemStats): CopyRef {
  const percent = acceptancePercent(stats);
  if (percent === null) {
    return { key: 'problem.oj.acceptance-none' };
  }
  return { key: 'problem.oj.acceptance-percent', params: { percent } };
}

/** Hạn giờ. `null` = không giới hạn: không phải bài nào cũng nên chạy đua. */
export function formatTimeLimit(seconds: number | null): CopyRef {
  if (seconds === null) {
    return { key: 'problem.oj.time-unlimited' };
  }
  return formatDuration(seconds);
}

/** Khoảng thời gian tính bằng giây, thành "M phút S giây", bỏ vế bằng 0. */
export function formatDuration(seconds: number): CopyRef {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  if (minutes === 0) {
    return { key: 'problem.oj.duration.seconds', params: { seconds: rest } };
  }
  if (rest === 0) {
    return { key: 'problem.oj.duration.minutes', params: { minutes } };
  }
  return { key: 'problem.oj.duration.both', params: { minutes, seconds: rest } };
}

/**
 * Mốc thời gian ISO thành chữ tiếng Việt.
 *
 * CHỈ gọi trong component client (sau khi query trả về). Gọi lúc render máy chủ
 * sẽ định dạng theo múi giờ máy chủ rồi hydrate lại theo múi giờ trình duyệt.
 *
 * KHÔNG đi qua `packages/copy`: đầu ra do `Intl.DateTimeFormat` sinh theo locale.
 * Nhánh hỏng trả lại chính chuỗi đầu vào.
 *
 * ⚠ Trùng TÊN với `apps/web/src/lib/format-moment.ts`, và hai hàm KHÁC hành vi:
 * bản kia trả "không rõ" cho đầu vào hỏng. Gộp lại là việc của chủ `lib/`.
 */
export function formatMoment(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(at);
}

/**
 * Nhãn của MỘT chủ đề, tra có phòng hờ.
 *
 * `ProblemBase.topics` là `ProblemTopicId = string`: tập đóng chuyển xuống từng
 * plugin, nên không còn MỘT bảng nào phủ hết chủ đề của mọi game. Bảng nhãn
 * truyền vào phải là bảng THEO `problem.gameId` (`problemTopicLabels`, dữ liệu
 * lá, không kéo engine vào bundle; `engine-leak.test.ts` gác chuyện đó).
 *
 * ⛔ KHÔNG vá bằng `as ProblemTopic`: một chủ đề lạ sẽ tra ra `undefined`, React
 * vẽ thành chỗ trống, và màn hình hiện một nhãn rỗng mà không lỗi nào báo.
 * Chủ đề không có trong bảng thì hiện chính id của nó.
 */
export function topicLabel(topic: ProblemTopicId, labels: Readonly<Record<string, string>>): string {
  return labels[topic] ?? topic;
}

/**
 * Khoá nhãn cho bốn khoá sắp xếp của hợp đồng.
 *
 * KHÔNG có `title`: hợp đồng loại nó vì collation Postgres không khớp JavaScript
 * với tiếng Việt có dấu, mà lệch thứ tự dưới phân trang keyset nghĩa là mất
 * dòng trong im lặng.
 */
export const PROBLEM_ORDER_KEY_LABELS = {
  code: 'problem.oj.order.code',
  difficulty: 'problem.oj.order.difficulty',
  solverCount: 'problem.oj.order.solvers',
  createdAt: 'problem.oj.order.created',
} as const satisfies Record<ProblemOrderKey, StaticTextKey>;

export const PROBLEM_ORDER_LABELS = labelsFrom(PROBLEM_ORDER_KEY_LABELS);

export const PROBLEM_DIRECTION_KEY_LABELS = {
  asc: 'problem.oj.direction.asc',
  desc: 'problem.oj.direction.desc',
} as const satisfies Record<'asc' | 'desc', StaticTextKey>;

export const PROBLEM_DIRECTION_LABELS = labelsFrom(PROBLEM_DIRECTION_KEY_LABELS);
