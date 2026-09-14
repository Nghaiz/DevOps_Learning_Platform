/**
 * Con trỏ keyset của `classes.list`.
 *
 * ⛔ Phần thân chuyển sang `server/db/created-at-cursor.ts` ngày 2026-09-15
 * (§18.G), vì `exams` cần đúng hình dạng đó và một bản sao thứ hai sẽ trôi
 * khỏi bản đầu. File này giữ lại đúng hai cái tên mà `classes` đang gọi, và
 * giữ luôn ô gác `cursor.test.ts` — ô đó vẫn đo cùng hành vi, chỉ qua một lớp
 * mở lại tên.
 *
 * Lý do keyset phải mang `id` làm khoá phá hoà (mất dòng im lặng khi hai bản
 * ghi trùng mili giây) nằm ở module mới.
 */
export type { CreatedAtCursor as ClassCursor } from '../db/created-at-cursor';
export {
  decodeCreatedAtCursor as decodeClassCursor,
  encodeCreatedAtCursor as encodeClassCursor,
} from '../db/created-at-cursor';
