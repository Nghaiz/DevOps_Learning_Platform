'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ArenaSceneProps } from '../arena-contract';
import type { SceneRuntime } from './scene-entry';

export interface LayoutSyncProps {
  readonly runtime: SceneRuntime;
  readonly propsRef: RefObject<ArenaSceneProps>;
}

/**
 * Cầu hai chiều giữa bố cục kéo tay và HUD.
 *
 * **Đi lên:** báo cho HUD biết có vật nào đang bị kéo lệch không, để nút "Sắp
 * xếp lại" biết mình có việc để làm. Báo bằng một CỜ chứ không phải số lượng —
 * xem `ArenaSceneProps.onMovedChange` về lý do hiệu năng.
 *
 * **Đi xuống:** nhận lệnh "sắp xếp lại" và gọi `runtime.resetLayout()`.
 *
 * Tách thành một thành phần riêng thay vì nhét vào `FramePump`: bộ đập nhịp đã
 * gánh việc quyết định khi nào vẽ, và trộn thêm một đường trạng thái ngược lên
 * React vào đó là trộn hai trách nhiệm chạy theo hai nhịp khác nhau.
 */
export function LayoutSync({ runtime, propsRef }: LayoutSyncProps): null {
  const invalidate = useThree((s) => s.invalidate);
  const movedRef = useRef(false);
  const alignedRef = useRef(0);

  /*
   * Lệnh "sắp xếp lại" đọc trong effect, không trong vòng lặp vẽ: ở chế độ vẽ
   * theo yêu cầu, cảnh đang đứng yên thì KHÔNG có khung hình nào chạy — nên một
   * cú bấm chỉ được đọc khi có thứ khác tình cờ xin vẽ. Người dùng bấm nút và
   * không có gì xảy ra cho tới lần sau họ chạm vào cảnh.
   */
  useEffect(() => {
    const at = propsRef.current.autoAlignAt;
    if (at === alignedRef.current) {
      return;
    }
    alignedRef.current = at;
    if (at !== 0 && runtime.resetLayout()) {
      movedRef.current = false;
      propsRef.current.onMovedChange(false);
      invalidate();
    }
  });

  useFrame(() => {
    const moved = runtime.overrides.size > 0;
    if (moved !== movedRef.current) {
      movedRef.current = moved;
      propsRef.current.onMovedChange(moved);
    }
  });

  return null;
}
