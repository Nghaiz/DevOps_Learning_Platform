'use client';

import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from 'three';
import { glow, type StagePalette } from '../palette';
import { frameAt } from '../world';
import { hash } from './kit';

const VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.4 + aSeed * 40.0) * 0.35;
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = (2.0 + aSeed * 3.0) * uPixelRatio * (24.0 / max(1.0, -view.z));
    vColor = aColor;
    vAlpha = (0.35 + 0.65 * abs(sin(uTime * (0.6 + aSeed) + aSeed * 90.0))) * (1.0 - smoothstep(30.0, 110.0, -view.z));
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = max(abs(c.x), abs(c.y));
    float shape = 1.0 - smoothstep(0.32, 0.5, d);
    gl_FragColor = vec4(vColor * shape * vAlpha, 1.0);
  }
`;

/**
 * Bụi sáng lơ lửng dọc tuyến: hạt vuông (khớp ngôn ngữ góc sắc), lấp lánh lệch pha, đa số màu
 * ink, một ít đỏ và vàng. Toàn bộ chuyển động nằm trong vertex shader, CPU không đụng mỗi khung.
 */
export function Dust({ palette, count }: { readonly palette: StagePalette; readonly count: number }) {
  const dpr = useThree((state) => state.viewport.dpr);
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const tones = [glow(palette.ink, 1.1), glow(palette.ink, 0.8), glow(palette.red, 1.6), glow(palette.star, 1.4)];
    for (let i = 0; i < count; i += 1) {
      const frame = frameAt(hash(i * 3.1));
      const side = (hash(i * 7.7) - 0.5) * 70;
      positions[i * 3] = frame.point.x + frame.right.x * side;
      positions[i * 3 + 1] = -0.5 + hash(i * 1.3) * 18;
      positions[i * 3 + 2] = frame.point.z + frame.right.z * side;
      seeds[i] = hash(i * 5.9);
      const pick = hash(i * 11.1);
      const tone = tones[pick < 0.7 ? 0 : pick < 0.86 ? 1 : pick < 0.95 ? 2 : 3] ?? tones[0];
      if (tone !== undefined) tone.toArray(colors, i * 3);
    }
    const built = new BufferGeometry();
    built.setAttribute('position', new BufferAttribute(positions, 3));
    built.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    built.setAttribute('aColor', new BufferAttribute(colors, 3));
    return built;
  }, [count, palette]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
      }),
    [],
  );

  useFrame(({ clock }) => {
    const { uTime, uPixelRatio } = material.uniforms;
    if (uTime !== undefined) uTime.value = clock.elapsedTime;
    if (uPixelRatio !== undefined) uPixelRatio.value = dpr;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
