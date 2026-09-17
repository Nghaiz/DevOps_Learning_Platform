'use client';

/**
 * Nối bộ chọn chế độ renderer vào React (19.D.4.4).
 *
 * ⛔ **Không một dòng LUẬT nào ở đây.** Luật "lựa chọn tay của người dùng thắng
 * kết quả dò" sống ở `games/shared/renderer-mode.ts` — hàm thuần, test được mà
 * không dựng DOM. File này chỉ làm ba việc React: giữ state, dò MỘT LẦN sau khi
 * gắn, và ghi lựa chọn xuống `localStorage`.
 *
 * Chép luật xuống đây là dựng nguồn sự thật thứ hai cho một quyết định đã có ô
 * test riêng, và bản chép sẽ trôi trong im lặng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG ĐỌC `localStorage` NGAY Ở LẦN RENDER ĐẦU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Máy chủ không có `localStorage` lẫn `<canvas>`. Đọc ở lần render đầu thì HTML
 * từ server và cây sau hydrate lệch nhau. State khởi tạo bằng `stored: null` +
 * `support: 'unknown'` — tức "chưa đo", đúng thứ đang xảy ra — rồi một
 * `useEffect` nạp cả hai. Xem khối đầu `webgl-detect.ts`: `'unknown'` KHÔNG
 * kích hoạt nhánh hạ cấp, nên một máy có WebGL2 không bị đá về 2D trong khoảnh
 * khắc trước khi phép dò chạy.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  readStoredMode,
  resolveRendererMode,
  writeStoredMode,
  type RendererMode,
  type ResolvedMode,
} from '../../shared/renderer-mode';
import { detectWebgl2, type WebglSupport } from '../../shared/webgl-detect';

export interface UseRendererModeInput {
  /**
   * Renderer 3D đã có trong bản dựng này chưa. Truyền tường minh chứ không ghim
   * `true`: `resolveRendererMode` có một nhánh riêng cho `false`, và ghim ở đây
   * là giết nhánh đó ở mọi call-site.
   */
  readonly has3d: boolean;
  /**
   * Chế độ khi người chơi chưa từng chọn tay.
   *
   * `'2d'` cho game CI/CD: kế hoạch §19.D.2 gọi cảnh 2D là **chế độ mặc định,
   * không phải bản dự phòng**. Mặc định `'3d'` sẽ làm mọi người chơi mới rơi vào
   * đường nặng hơn mà không ai chọn.
   */
  readonly fallback?: RendererMode;
}

export interface RendererModeHandle {
  readonly resolved: ResolvedMode;
  readonly support: WebglSupport;
  /** Lựa chọn tay đã nhớ. `null` = chưa từng chọn. */
  readonly stored: RendererMode | null;
  readonly choose: (mode: RendererMode) => void;
}

export function useRendererMode(input: UseRendererModeInput): RendererModeHandle {
  const [stored, setStored] = useState<RendererMode | null>(null);
  const [support, setSupport] = useState<WebglSupport>('unknown');

  useEffect(() => {
    setStored(readStoredMode());
    setSupport(detectWebgl2());
  }, []);

  const choose = useCallback((mode: RendererMode) => {
    setStored(mode);
    writeStoredMode(mode);
  }, []);

  const resolved = resolveRendererMode({
    stored,
    support,
    has3d: input.has3d,
    ...(input.fallback === undefined ? {} : { fallback: input.fallback }),
  });

  return { resolved, support, stored, choose };
}
