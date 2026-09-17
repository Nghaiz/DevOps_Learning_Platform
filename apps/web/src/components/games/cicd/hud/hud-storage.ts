/**
 * Đọc/ghi một giá trị nhỏ của HUD game CI/CD lên `localStorage` (19.D.4).
 *
 * Ba chỗ cần đúng một cặp đọc/ghi có bọc `try/catch`: trạng thái thu/mở của các
 * lớp phủ (D.4.3), và cờ "đã xem màn chuyển tiếp trục Y" (D.5.1). Viết riêng ở
 * mỗi chỗ là ba bản `try/catch` sẽ trôi khỏi nhau — và bản quên bọc sẽ **ném
 * trong lúc dựng cây React** ở chế độ riêng tư của Safari, tức trắng cả màn chơi
 * vì một tuỳ chọn hiển thị. Lý lẽ đầy đủ ở `games/shared/renderer-mode.ts`.
 *
 * ⛔ Không có cache ở tầng module. Một biến nhớ giá trị sẽ sống qua `cleanup()`
 * giữa hai test và làm ô thứ hai đọc lại câu trả lời của ô thứ nhất.
 */

import type { ModeStorage } from '../../shared/renderer-mode';

/**
 * Tiền tố khoá. Cùng quy ước `dlp:` với `RENDERER_MODE_STORAGE_KEY` và với
 * `STORAGE_KEY_PREFIX` của `packages/games`, để một lượt dọn "xoá dữ liệu game"
 * sau này quét được bằng đúng một tiền tố.
 */
export const CICD_HUD_STORAGE_PREFIX = 'dlp:games:cicd:';

export function cicdHudStorageKey(suffix: string): string {
  return `${CICD_HUD_STORAGE_PREFIX}${suffix}`;
}

/**
 * `localStorage` nếu chạm được, `null` nếu không.
 *
 * `typeof` là chưa đủ: chính việc **truy cập** `localStorage` đã ném được ở chế
 * độ riêng tư, trước cả khi gọi `getItem`.
 */
export function cicdHudStorage(): ModeStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** `null` = chưa từng ghi, hoặc không đọc được. Hai thứ này bên gọi xử như nhau. */
export function readHudValue(suffix: string, storage?: ModeStorage | null): string | null {
  const store = storage ?? cicdHudStorage();
  if (store === null) return null;
  try {
    return store.getItem(cicdHudStorageKey(suffix));
  } catch {
    return null;
  }
}

/** Trả `false` khi không ghi được — bên gọi vẫn chạy tiếp bình thường. */
export function writeHudValue(
  suffix: string,
  value: string,
  storage?: ModeStorage | null,
): boolean {
  const store = storage ?? cicdHudStorage();
  if (store === null) return false;
  try {
    store.setItem(cicdHudStorageKey(suffix), value);
    return true;
  } catch {
    return false;
  }
}
