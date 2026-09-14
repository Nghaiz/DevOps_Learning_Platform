/**
 * Dò khả dụng WebGL2 (17.B.5).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO BA TRẠNG THÁI CHỨ KHÔNG PHẢI BOOLEAN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Phép dò cần một `<canvas>` thật, nên nó KHÔNG chạy được lúc render phía máy
 * chủ. Một boolean buộc phải trả `false` ở đó, và `false` mang nghĩa "máy này
 * không có WebGL2" — một khẳng định ta chưa hề đo. Hậu quả thấy được bằng mắt:
 * HTML từ server nói "2D", rồi hydrate xong lại nhảy sang "3D" — trang nháy một
 * cái ngay trước mặt người dùng, và với người dùng chuyển động nhạy cảm thì đó
 * là một cú giật không ai giải thích được.
 *
 * `'unknown'` nói đúng thứ đang xảy ra: **chưa đo**. `resolveRendererMode()` ở
 * `renderer-mode.ts` xử nó khác hẳn `'unavailable'` — nó GIỮ NGUYÊN chế độ đang
 * hiện thay vì hạ xuống 2D.
 *
 * ⚠ **TẮT HARDWARE ACCELERATION KHÔNG XOÁ WEBGL2.** Chromium rơi về SwiftShader
 * (raster bằng CPU) và `getContext('webgl2')` vẫn trả về một context hợp lệ.
 * Nên KHÔNG unit test nào ở đây được phép giả vờ đã kiểm cảnh "máy không có
 * WebGL2": ô đó chỉ đóng được bằng Playwright chạy với `--disable-3d-apis`, và
 * kèm một đối chứng dương chứng minh test đỏ khi bộ dò bị hỏng (AC-5, plan
 * §17.B). Test ở lane này chỉ kiểm ĐÚNG phần logic thuần: hàm phân loại đúng ba
 * nhánh khi được đưa cho ba loại document giả.
 */

/**
 * Kết quả dò.
 *
 * - `'available'`   — đã tạo được context WebGL2.
 * - `'unavailable'` — đã thử và KHÔNG tạo được (hoặc lời gọi ném).
 * - `'unknown'`     — CHƯA thử được: không có `document`, hoặc không tạo nổi
 *                     phần tử canvas. Không phải một câu trả lời về phần cứng.
 */
export type WebglSupport = 'available' | 'unavailable' | 'unknown';

/**
 * Kiểu tối thiểu của thứ cần để dò — chỉ một hàm tạo phần tử.
 *
 * Hẹp thế này để test đưa vào một document giả mà không phải dựng cả jsdom, và
 * để hàm không vô tình đọc thêm gì khác từ DOM.
 */
export interface CanvasFactory {
  createElement(tag: 'canvas'): { getContext(id: 'webgl2'): unknown };
}

/**
 * Dò một lần. KHÔNG nhớ kết quả ở đây.
 *
 * Ghi nhớ là việc của chỗ gọi (`use-renderer-mode` ở tầng trên, hoặc một
 * `useState` khởi tạo một lần). Một biến module nhớ kết quả sẽ sống qua cả
 * `cleanup()` giữa hai test và làm ô thứ hai đọc lại câu trả lời của ô thứ
 * nhất — một dạng rò rỉ trạng thái mà chính repo này đã trả giá.
 */
export function detectWebgl2(factory?: CanvasFactory | null): WebglSupport {
  const doc = factory ?? defaultFactory();
  if (doc === null) return 'unknown';

  let canvas: { getContext(id: 'webgl2'): unknown };
  try {
    canvas = doc.createElement('canvas');
  } catch {
    // Không tạo nổi canvas ⇒ chưa đo được gì về phần cứng. `unknown`, không
    // phải `unavailable`.
    return 'unknown';
  }

  try {
    return canvas.getContext('webgl2') === null ? 'unavailable' : 'available';
  } catch {
    /*
     * `getContext` ném — jsdom là ca thường gặp nhất (`Not implemented`), và
     * vài cấu hình doanh nghiệp chặn WebGL cũng ném ở đây.
     *
     * Trả `unavailable` chứ không `unknown`: phép dò ĐÃ chạy tới nơi và câu trả
     * lời là "không dùng được". Khác hẳn nhánh trên, nơi phép dò chưa bắt đầu.
     */
    return 'unavailable';
  }
}

function defaultFactory(): CanvasFactory | null {
  if (typeof document === 'undefined') return null;
  return document as unknown as CanvasFactory;
}
