'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Bloom, ChromaticAberration, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode, type ChromaticAberrationEffect } from 'postprocessing';
import { HalfFloatType } from 'three';
import { landingStore } from '../motion/store';
import type { QualityTier } from './quality';

/**
 * Hậu kỳ: bloom chỉ bắt thứ phát sáng (màu > 1, xem `glow()`), tách màu tăng theo vận tốc cuộn
 * cho cảm giác lao đi, vignette, hạt phim mỏng, tone mapping Neutral ở cuối (AgX khử bão hoà
 * vùng sáng nên màu tuyến thương hiệu ra nhợt nhạt; Neutral giữ đúng sắc độ). Bộ đệm half-float là
 * bắt buộc: bộ đệm 8 bit kẹp mọi giá trị về 1 và bloom không còn gì để bắt.
 */
export function Effects({ tier }: { readonly tier: QualityTier }) {
  const aberration = useRef<ChromaticAberrationEffect>(null);

  useFrame(() => {
    const effect = aberration.current;
    if (effect === null) return;
    const speed = Math.min(Math.abs(landingStore.velocity), 40);
    effect.offset.set(0.0004 + speed * 0.00009, 0.0002 + speed * 0.00005);
  });

  return (
    <EffectComposer multisampling={tier === 'high' ? 4 : 0} enableNormalPass={false} frameBufferType={HalfFloatType}>
      <Bloom
        mipmapBlur
        luminanceThreshold={1}
        luminanceSmoothing={0.15}
        intensity={tier === 'high' ? 0.95 : 0.75}
        radius={0.62}
      />
      <ChromaticAberration ref={aberration} radialModulation modulationOffset={0.3} />
      <Vignette offset={0.3} darkness={0.7} />
      <Noise opacity={0.045} premultiply blendFunction={BlendFunction.SCREEN} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}
