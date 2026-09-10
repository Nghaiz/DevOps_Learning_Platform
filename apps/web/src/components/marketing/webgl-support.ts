/**
 * Dò WebGL2, với `failIfMajorPerformanceCaveat: true`.
 *
 * ## Vì sao cờ đó bắt buộc, và vì sao đây không phải một khuyến nghị
 *
 * Repo này đã đo: tắt hardware acceleration KHÔNG gỡ WebGL2. Chrome rơi về
 * SwiftShader, một bộ dựng chạy trên CPU, và nó trả lời "có" cho mọi phép dò
 * ngây thơ. Kết quả là một context hợp lệ vẽ hàng trăm mili giây một khung.
 * `failIfMajorPerformanceCaveat` là cờ DUY NHẤT bắt trình duyệt nói ra rằng
 * context nó sắp cấp là context phần mềm.
 *
 * Hệ quả cho CI: `--disable-gpu` không đưa được trình duyệt vào nhánh lùi, chỉ
 * `--disable-3d-apis` mới cho một trình duyệt thật sự không có WebGL. Ai viết ô
 * nghiệm thu cho nhánh lùi phải dùng cờ sau.
 *
 * ## Vì sao huỷ context ngay
 *
 * Mỗi tab có một trần số context WebGL sống cùng lúc (16 trên Chrome). Phép dò
 * này chạy trước khi cảnh thật mount, nên nếu nó giữ lại context thì cảnh thật
 * xin thêm một cái nữa. `WEBGL_lose_context` là cách duy nhất trả context về
 * ngay lập tức thay vì đợi bộ thu gom rác.
 *
 * ## Hàm thuần, `document` truyền vào
 *
 * Không đọc `globalThis.document`: truyền vào thì test dựng được một document
 * giả trả `null` từ `getContext` và khẳng định hàm này báo KHÔNG có WebGL. Đọc
 * biến toàn cục thì nhánh đó chỉ chạy được trên một trình duyệt thật sự thiếu
 * WebGL, tức là không bao giờ chạy trong suite.
 */

export interface WebglProbeDocument {
  createElement(tagName: 'canvas'): {
    getContext(
      contextId: 'webgl2',
      options?: WebGLContextAttributes,
    ): WebGL2RenderingContext | null;
  };
}

/**
 * `true` khi máy có WebGL2 do phần cứng dựng.
 *
 * Trả `false` cho cả ba ca: không có `webgl2`, có nhưng chỉ ở dạng phần mềm
 * (`failIfMajorPerformanceCaveat` từ chối), và mọi lỗi ném ra giữa chừng. Ba ca
 * đó dẫn tới cùng một hành vi (không gắn canvas), nên gộp chúng là đúng.
 */
export function hasHardwareWebgl2(doc: WebglProbeDocument): boolean {
  let gl: WebGL2RenderingContext | null;
  try {
    const canvas = doc.createElement('canvas');
    gl = canvas.getContext('webgl2', {
      failIfMajorPerformanceCaveat: true,
      // Phép dò không vẽ gì, nên mọi buffer phụ đều là lãng phí thuần.
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
  } catch {
    return false;
  }

  if (gl === null) {
    return false;
  }

  try {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // Huỷ context là dọn dẹp, không phải điều kiện của câu trả lời. Một trình
    // duyệt không cho gọi `loseContext` vẫn là một trình duyệt CÓ WebGL2.
  }

  return true;
}
