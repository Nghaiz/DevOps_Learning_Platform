/**
 * Chọn và ghi nhớ chế độ renderer (17.B.5).
 *
 * Toàn bộ file là hàm THUẦN cộng một cặp đọc/ghi có bọc `try/catch`. Không
 * React, không hằng nào của SVG hay three.js — phần quyết định phải test được
 * mà không dựng DOM, vì nó là chỗ dễ sai nhất và là chỗ ít nhìn thấy nhất.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LUẬT: LỰA CHỌN TAY CỦA NGƯỜI DÙNG THẮNG KẾT QUẢ DÒ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Người dùng chọn 2D trên một máy có WebGL2 là một lựa chọn HỢP LỆ, không phải
 * một sự cố cần sửa. Design §2.3 liệt kê bốn lý do 2D là chế độ ngang hàng chứ
 * không phải bản dự phòng: máy không có WebGL2, trình đọc màn hình (canvas
 * WebGL là một ô đen), ảnh in cho báo cáo, và test tự động. Ba lý do sau KHÔNG
 * liên quan gì tới phần cứng — nên một bộ dò đè lên lựa chọn tay sẽ đá người
 * dùng ra khỏi chế độ họ cần, mỗi lần tải trang, và không nói vì sao.
 *
 * Chiều ngược lại vẫn giữ: chọn tay 3D trên máy **đã đo được** là không có
 * WebGL2 thì rơi về 2D — ở đó 3D không hiện được gì cả, và một canvas trắng còn
 * tệ hơn một lựa chọn bị bỏ qua. `'unknown'` (chưa đo) KHÔNG kích hoạt nhánh
 * này: xem `webgl-detect.ts`.
 */

import type { WebglSupport } from './webgl-detect.ts';

export type RendererMode = '2d' | '3d';

export const RENDERER_MODES: readonly RendererMode[] = ['2d', '3d'];

/**
 * Khoá `localStorage`.
 *
 * Tiền tố `dlp:` theo đúng quy ước đã có ở `packages/games` (`STORAGE_KEY_PREFIX`)
 * để một lượt dọn "xoá dữ liệu game" sau này quét được bằng một tiền tố. Hậu tố
 * `renderer-mode` chứ không `mode`: `localStorage` là không gian tên phẳng dùng
 * chung cho cả origin, và `mode` sẽ đụng bất cứ thứ gì khác cũng có "chế độ".
 */
export const RENDERER_MODE_STORAGE_KEY = 'dlp:games:renderer-mode';

export function isRendererMode(value: unknown): value is RendererMode {
  return value === '2d' || value === '3d';
}

/** Kiểu tối thiểu của `localStorage` — chỉ hai phương thức thật sự dùng. */
export interface ModeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Đọc lựa chọn đã ghi nhớ. `null` = người dùng chưa từng chọn tay.
 *
 * Bọc `try/catch` vì `localStorage` **ném** (không phải trả `null`) ở chế độ
 * riêng tư của Safari và khi trình duyệt chặn dữ liệu site. Một `SecurityError`
 * không bắt ở đây sẽ nổ trong lúc dựng cây React và làm trắng cả trang chơi —
 * vì một tuỳ chọn hiển thị.
 */
export function readStoredMode(storage?: ModeStorage | null): RendererMode | null {
  const store = storage ?? defaultStorage();
  if (store === null) return null;
  try {
    const raw = store.getItem(RENDERER_MODE_STORAGE_KEY);
    return isRendererMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Ghi lựa chọn. Trả `false` khi không ghi được — bên gọi vẫn chạy tiếp bình thường. */
export function writeStoredMode(mode: RendererMode, storage?: ModeStorage | null): boolean {
  const store = storage ?? defaultStorage();
  if (store === null) return false;
  try {
    store.setItem(RENDERER_MODE_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

export interface ResolveModeInput {
  /** Lựa chọn tay đã ghi nhớ, `null` nếu chưa có. */
  readonly stored: RendererMode | null;
  readonly support: WebglSupport;
  /**
   * Renderer 3D đã tồn tại trong bản dựng này chưa.
   *
   * Game Git truyền `true` từ P17b (`git-game.tsx`). Giữ là THAM SỐ chứ không
   * biến thành hằng: game thứ hai dùng lại cặp renderer này sẽ bắt đầu ở
   * `false`, và test vẫn phải đóng được cả hai nhánh.
   *
   * ⚠ Nhánh `false` nay **không call-site nào chạm tới** — chỉ test giữ nó
   * sống. Đừng đọc điều đó thành "nhánh chết, dọn đi": nó là điểm vào cho game
   * kế tiếp, và dọn nó là bắt game đó dựng lại từ đầu.
   */
  readonly has3d: boolean;
  /** Chế độ mặc định khi chưa có lựa chọn tay. */
  readonly fallback?: RendererMode;
}

export interface ResolvedMode {
  readonly mode: RendererMode;
  /**
   * Vì sao ra chế độ này. Hiện lên giao diện được, và quan trọng hơn: nó phân
   * biệt "người dùng chọn 2D" với "máy không chạy nổi 3D" — hai thứ trông y hệt
   * nhau trên màn hình mà đòi hai câu giải thích khác hẳn nhau.
   */
  readonly reason: 'user' | 'no-webgl' | 'no-3d-build' | 'default';
}

/**
 * Chọn chế độ. Thứ tự xét là hợp đồng, không phải chi tiết cài đặt.
 *
 * 1. 3D chưa có trong bản dựng ⇒ 2D. Trên hết, vì mọi nhánh dưới đều vô nghĩa
 *    khi không có gì để chạy.
 * 2. Người dùng đã chọn tay:
 *    - chọn `2d` ⇒ luôn tôn trọng (xem khối đầu file);
 *    - chọn `3d` mà đã ĐO ĐƯỢC là `'unavailable'` ⇒ hạ về 2D.
 *      `'unknown'` không hạ: chưa đo thì chưa có quyền phủ quyết.
 * 3. Chưa chọn tay ⇒ `fallback` nếu chạy được, hạ về 2D nếu 3D không dùng được.
 */
export function resolveRendererMode(input: ResolveModeInput): ResolvedMode {
  const fallback = input.fallback ?? '2d';

  if (!input.has3d) return { mode: '2d', reason: 'no-3d-build' };

  if (input.stored !== null) {
    if (input.stored === '3d' && input.support === 'unavailable') {
      return { mode: '2d', reason: 'no-webgl' };
    }
    return { mode: input.stored, reason: 'user' };
  }

  if (fallback === '3d' && input.support === 'unavailable') {
    return { mode: '2d', reason: 'no-webgl' };
  }
  return { mode: fallback, reason: 'default' };
}

/** Câu giải thích tiếng Việt, một dòng, cho thanh trên và cho trình đọc màn hình. */
export function rendererModeReasonText(resolved: ResolvedMode): string {
  switch (resolved.reason) {
    case 'user':
      return 'Bạn đã chọn chế độ này. Lựa chọn được ghi nhớ trên máy bạn.';
    case 'no-webgl':
      return 'Máy hoặc trình duyệt này không cấp được WebGL2, nên bản 3D không chạy được. Đang dùng bản 2D.';
    case 'no-3d-build':
      return 'Bản 3D chưa có trong phiên bản này. Bản 2D là chế độ đầy đủ, không phải bản rút gọn.';
    case 'default':
      return 'Chế độ mặc định. Bạn đổi được bất cứ lúc nào, và lựa chọn sẽ được ghi nhớ.';
  }
}

function defaultStorage(): ModeStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    // Truy cập `localStorage` tự nó đã ném được ở chế độ riêng tư — kể cả trước
    // khi gọi `getItem`. Nên `typeof` không đủ, phải bọc luôn.
    return null;
  }
}
