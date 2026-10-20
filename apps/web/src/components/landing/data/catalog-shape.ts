/**
 * Hình dạng dữ liệu landing nhận từ server. Tách khỏi `catalog.server.ts` để component client
 * import được kiểu mà không kéo theo drizzle/DB vào bundle trình duyệt.
 */

export const COUNT_KINDS = ['lessons', 'labs', 'paths', 'playgrounds', 'quizzes', 'games'] as const;
export type CountKind = (typeof COUNT_KINDS)[number];

/** `null` nghĩa là đọc lỗi. KHÔNG BAO GIỜ là 0 thay cho lỗi: "0 bài học" là một lời khai sai. */
export type LandingCounts = Readonly<Record<CountKind, number | null>>;

export interface LandingPath {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly steps: number;
}

export interface LandingCatalog {
  readonly counts: LandingCounts;
  /** `null` khi đọc lỗi, `[]` khi chưa có lộ trình nào được xuất bản. Hai ca hiển thị khác nhau. */
  readonly paths: readonly LandingPath[] | null;
}

/** Ẩn cả dải số liệu khi KHÔNG đọc được loại nào; đọc được một phần thì vẫn hiện, ô lỗi ghi "?". */
export const hasAnyCount = (counts: LandingCounts): boolean =>
  COUNT_KINDS.some((kind) => counts[kind] !== null);
