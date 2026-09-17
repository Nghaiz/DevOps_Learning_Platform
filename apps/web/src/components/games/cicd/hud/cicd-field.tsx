'use client';

/**
 * SÂN CHƠI — vùng chứa cảnh, chiếm trọn phần dưới thanh trên cùng (19.D.4.1).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐÂY LÀ PHẦN TỬ AC-D7 ĐO. ĐỪNG BỌC THÊM LỚP CÓ PADDING QUANH NÓ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `data-testid={CICD_SCENE_TESTIDS.field}` nằm trên ĐÚNG khối định vị tuyệt đối
 * chiếm trọn vùng dưới thanh. Ô AC-D7 gọi `boundingBox()` trên nó và đòi chiều
 * cao > 80% viewport, chiều rộng > 95%. Đặt móc lên một thẻ bọc bên ngoài có
 * padding là ô đó đỏ oan; đặt lên một thẻ con nhỏ hơn cảnh là ô đó **xanh oan**
 * — nguy hiểm hơn, vì bố cục chia đôi kiểu cũ vẫn qua được.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `next/dynamic` + `ssr: false` LÀ BẮT BUỘC, KHÔNG PHẢI TỐI ƯU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cả cây `scene3d/**` kéo theo `three` + R3F + `postprocessing` (~631KB). AC-D9
 * đo rằng route `/games/cicd` KHÔNG chạm chunk `three` cho tới khi người chơi
 * bật 3D, và P17 đã một lần rò engine sang 6 route không liên quan qua đúng một
 * barrel. Ngoài ra `three` chạm `window` lúc dựng renderer nên render phía máy
 * chủ sẽ ném. Cùng khuôn `k8s-arena/arena-root.tsx:38`.
 *
 * ⛔ Import SÂU vào `scene3d/` (ví dụ `scene3d/cicd-scene-3d`) là bỏ qua barrel
 * và kéo `three` vào bundle của route. Chỉ một đường vào: `'../scene3d'`.
 */

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';
import { cn } from '@devops-platform/ui';

import type { RendererMode } from '../../shared/renderer-mode';
import { CICD_SCENE_TESTIDS, type CicdSceneProps } from '../scene-props';
import { CicdSvgScene } from '../scene2d/cicd-svg-scene';
import { CICD_FIELD_TOP_OFFSET, type CicdQualityTier } from './cicd-top-bar';

const CicdScene3d = dynamic(async () => (await import('../scene3d')).CicdScene3d, {
  ssr: false,
});

export interface CicdFieldProps {
  /**
   * Cảnh dựng được, hoặc `null` khi KHÔNG dựng được (YAML dở dang, đồ thị có
   * chu trình…).
   *
   * ⛔ `null` KHÔNG được vẽ thành một sân trống im lặng: một sân trống đọc ra
   * thành "workflow của tôi chẳng có gì", và người chơi sẽ đi sửa nhầm chỗ. Nó
   * vẽ ra câu `emptyNote`.
   */
  readonly scene: CicdSceneProps | null;
  /** Câu tiếng Việt nói vì sao chưa có đồ thị. Bắt buộc khi `scene === null`. */
  readonly emptyNote: string;
  readonly mode: RendererMode;
  readonly quality: CicdQualityTier;
  readonly className?: string;
}

export function CicdField({
  scene,
  emptyNote,
  mode,
  quality,
  className,
}: CicdFieldProps): ReactElement {
  return (
    <div
      data-testid={CICD_SCENE_TESTIDS.field}
      data-cicd-mode={mode}
      className={cn('absolute inset-x-0 bottom-0 bg-background', CICD_FIELD_TOP_OFFSET, className)}
    >
      {scene === null ? (
        <div className="flex h-full w-full items-center justify-center px-6">
          <p className="max-w-md text-center text-sm text-muted-foreground">{emptyNote}</p>
        </div>
      ) : mode === '3d' ? (
        <CicdScene3d {...scene} quality={quality} />
      ) : (
        <CicdSvgScene {...scene} />
      )}
    </div>
  );
}
