'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, type Group, type Mesh, ShaderMaterial, Vector3 } from 'three';
import { t } from '@devops-platform/copy';
import { landingStore } from '../../motion/store';
import { glow, type PaletteKey, type StagePalette } from '../palette';
import type { SceneFonts } from '../scene';
import { INFINITY_CENTER } from '../world';
import { css, hash, Label } from './kit';

const LOOP_SEPARATOR = ' · ';
const SCALE = 12;
/** Màu của tám chặng PLAN..MONITOR, đi một vòng qua các tuyến. */
const STAGE_TONES: readonly PaletteKey[] = ['observe', 'git', 'linux', 'cicd', 'prod', 'docker', 'k8s', 'red'];

/** Lemniscate Bernoulli có thêm độ sâu z: hình ∞ của vòng lặp DevOps. */
export function lemniscate(angle: number, out = new Vector3()): Vector3 {
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  const d = 1 + s * s;
  return out.set((SCALE * c) / d, (SCALE * s * c) / d, Math.sin(angle * 2) * 1.6);
}

const VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute vec3 aJitter;
  uniform float uTime;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform vec3 uTones[8];
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float angle = aSeed * 6.2831853 + uTime * (0.18 + fract(aSeed * 91.0) * 0.06);
    float s = sin(angle);
    float c = cos(angle);
    float d = 1.0 + s * s;
    vec3 p = vec3(uScale * c / d, uScale * s * c / d, sin(angle * 2.0) * 1.6);
    p += aJitter * (0.25 + 0.75 * fract(aSeed * 37.0));
    float stage = floor(mod(angle, 6.2831853) / 6.2831853 * 8.0);
    vColor = uTones[int(stage)];
    vAlpha = 0.45 + 0.55 * fract(aSeed * 13.0);
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = (1.6 + fract(aSeed * 57.0) * 2.6) * uPixelRatio * (34.0 / max(1.0, -view.z));
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = 1.0 - smoothstep(0.1, 0.5, d);
    gl_FragColor = vec4(vColor * core * vAlpha, 1.0);
  }
`;

/**
 * Vòng lặp ∞ của phần kết: vài nghìn hạt chảy mãi theo hình số tám, mỗi đoạn một màu chặng
 * (PLAN, CODE, BUILD...). Nhãn tám chặng sáng lần lượt theo tiến độ cuộn của khu kết.
 */
export function InfinityLoop({
  palette,
  fonts,
  count,
}: {
  readonly palette: StagePalette;
  readonly fonts: SceneFonts;
  readonly count: number;
}) {
  const root = useRef<Group>(null);
  const labels = useRef<(Mesh | null)[]>([]);
  const dpr = useThree((state) => state.viewport.dpr);
  const words = useMemo(() => t('home.closing.loop').split(LOOP_SEPARATOR), []);
  const geometry = useMemo(() => {
    const seeds = new Float32Array(count);
    const jitter = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      seeds[i] = i / count;
      jitter[i * 3] = (hash(i * 1.7) - 0.5) * 1.6;
      jitter[i * 3 + 1] = (hash(i * 2.3) - 0.5) * 1.6;
      jitter[i * 3 + 2] = (hash(i * 3.1) - 0.5) * 1.6;
    }
    const built = new BufferGeometry();
    built.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    built.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    built.setAttribute('aJitter', new BufferAttribute(jitter, 3));
    return built;
  }, [count]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: SCALE },
          uPixelRatio: { value: 1 },
          uTones: { value: STAGE_TONES.map((key) => glow(palette[key], 2.2)) },
        },
      }),
    [palette],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  const specs = useMemo(
    () =>
      words.map((word, i) => ({
        text: word,
        color: css(palette[STAGE_TONES[i] ?? 'ink']),
        family: fonts.mono,
        width: 640,
        height: 160,
      })),
    [words, palette, fonts.mono],
  );
  const anchors = useMemo(
    () => words.map((_, i) => lemniscate((i / words.length) * Math.PI * 2 + 0.2).multiplyScalar(1.22)),
    [words],
  );

  useFrame(({ clock, camera }) => {
    const node = root.current;
    if (node === null) return;
    node.visible = landingStore.visible.closing;
    if (!node.visible) return;
    const { uTime, uPixelRatio } = material.uniforms;
    if (uTime !== undefined) uTime.value = clock.elapsedTime;
    if (uPixelRatio !== undefined) uPixelRatio.value = dpr;
    const lit = landingStore.closing * words.length;
    labels.current.forEach((label, i) => {
      if (label === null || label === undefined) return;
      label.quaternion.copy(camera.quaternion);
      const glowing = Math.max(0, 1 - Math.abs(lit - i - 0.5));
      label.scale.setScalar(1 + glowing * 0.35);
      const labelMaterial = label.material;
      if (!Array.isArray(labelMaterial)) labelMaterial.opacity = 0.45 + glowing * 0.55;
    });
  });

  return (
    <group ref={root} position={INFINITY_CENTER} visible={false}>
      <points geometry={geometry} material={material} frustumCulled={false} />
      {specs.map((spec, i) => {
        const anchor = anchors[i];
        if (anchor === undefined) return null;
        return (
          <group
            key={spec.text}
            position={anchor}
            ref={(node) => {
              labels.current[i] = (node?.children[0] as Mesh | undefined) ?? null;
            }}
          >
            <Label spec={spec} width={2.6} />
          </group>
        );
      })}
      <mesh>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial color={glow(palette.star, 3)} toneMapped={false} />
      </mesh>
    </group>
  );
}
