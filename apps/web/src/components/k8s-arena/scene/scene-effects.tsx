'use client';

import type { ReactElement } from 'react';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { TIER_FEATURES } from '../shared/scene-quality';
import type { QualityTier } from '../arena-contract';

export interface SceneEffectsProps {
  readonly tier: QualityTier;
}

/**
 * Hậu kỳ — ĐÚNG hai hiệu ứng, và cả hai đều đặt tay nhẹ.
 *
 * Ngưỡng sáng để CAO (0.78): chỉ phần thật sự phát sáng — quầng quanh pod, viền
 * vật đang chọn — mới vượt qua. Bloom tràn lan là cách nhanh nhất biến "có
 * không khí" thành "mờ nhoè", và một cảnh nhoè đọc ra là đồ nghiệp dư chứ không
 * phải đồ đắt tiền.
 *
 * Chỉ bật ở bậc cao. Trên bộ đổ hoạ mềm (Chromium headless của Playwright chạy
 * SwiftShader) mỗi pass hậu kỳ tốn hàng chục mili-giây, và cả suite e2e hết giờ
 * vì một hiệu ứng trang trí.
 *
 * `multisampling={0}`: khử răng cưa đã bật ở tầng WebGL, bật thêm MSAA cho
 * render target của composer là trả giá hai lần cho cùng một thứ.
 */
export function SceneEffects({ tier }: SceneEffectsProps): ReactElement | null {
  if (!TIER_FEATURES[tier].bloom) {
    return null;
  }
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom mipmapBlur luminanceThreshold={0.78} luminanceSmoothing={0.22} intensity={0.5} radius={0.6} />
      {/* Tối bốn góc rất nhẹ: mắt bị kéo về giữa khung, nơi cụm đứng. Quá tay
          thì nó thành một cái ống nhòm và người dùng thấy ngột. */}
      <Vignette offset={0.32} darkness={0.42} />
    </EffectComposer>
  );
}
