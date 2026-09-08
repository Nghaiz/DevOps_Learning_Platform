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
 * Ngưỡng sáng để CAO (1.1): chỉ phần thật sự phát sáng — quầng quanh pod, viền
 * vật đang chọn — mới vượt qua. Bloom tràn lan là cách nhanh nhất biến "có
 * không khí" thành "mờ nhoè", và một cảnh nhoè đọc ra là đồ nghiệp dư chứ không
 * phải đồ đắt tiền.
 *
 * Chỉ bật ở bậc cao. Trên bộ đổ hoạ mềm (Chromium headless của Playwright chạy
 * SwiftShader) mỗi pass hậu kỳ tốn hàng chục mili-giây, và cả suite e2e hết giờ
 * vì một hiệu ứng trang trí.
 *
 * Composer vẽ vào render target riêng: antialias của canvas không khử răng
 * cưa ở target này. MSAA 4 mẫu giữ đường bao mượt khi bật hậu kỳ.
 */
export function SceneEffects({ tier }: SceneEffectsProps): ReactElement | null {
  if (!TIER_FEATURES[tier].bloom) {
    return null;
  }
  return (
    <EffectComposer multisampling={4} enableNormalPass={false}>
      <Bloom
        mipmapBlur
        luminanceThreshold={1.1}
        luminanceSmoothing={0.22}
        intensity={0.25}
        radius={0.6}
      />
      {/* Tối bốn góc rất nhẹ: mắt bị kéo về giữa khung, nơi cụm đứng. Quá tay
          thì nó thành một cái ống nhòm và người dùng thấy ngột. */}
      <Vignette offset={0.32} darkness={0.25} />
    </EffectComposer>
  );
}
