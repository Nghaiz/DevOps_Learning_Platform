'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  type Group,
  type InstancedMesh,
  Object3D,
  QuadraticBezierCurve3,
  ShaderMaterial,
  TubeGeometry,
  Vector3,
} from 'three';
import { t } from '@devops-platform/copy';
import { clamp01, stationEventAt } from '../../journey-timeline';
import { landingStore } from '../../motion/store';
import { glow } from '../palette';
import { css, DarkMaterial, easeOutBack, GlowEdges, hash, Label } from './kit';
import type { StationProps } from './stations';

const GLOBE_RADIUS = 2.3;
const GLOBE_POINTS = 1500;
const ARCS = 7;
const METRIC_BARS = 14;

/** Điểm rải đều trên mặt cầu theo xoắn Fibonacci (không dồn ở hai cực như lưới kinh vĩ). */
function fibonacciSphere(count: number, radius: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const ring = Math.sqrt(1 - y * y);
    const theta = golden * i;
    positions[i * 3] = Math.cos(theta) * ring * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * ring * radius;
  }
  return positions;
}

const ARC_VERTEX = /* glsl */ `
  varying float vAlong;
  void main() {
    vAlong = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* Một xung sáng chạy dọc cung, đầu sáng đuôi nhạt; uIntensity tăng khi lưu lượng tăng. */
const ARC_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uOffset;
  uniform vec3 uFrom;
  uniform vec3 uTo;
  varying float vAlong;
  void main() {
    float head = fract(uTime * 0.45 + uOffset);
    float tail = smoothstep(head - 0.28, head, vAlong) * (1.0 - step(head, vAlong));
    vec3 color = mix(uFrom, uTo, vAlong);
    gl_FragColor = vec4(color * (0.12 + tail * uIntensity), 1.0);
  }
`;

/**
 * Ga production: địa cầu bằng điểm sáng, các cung lưu lượng giữa các vùng, bảng metric bên
 * cạnh. Sự kiện: lưu lượng tăng, độ trễ vọt lên (cột đỏ), cụm giãn thêm hai node, rồi metric
 * dịu lại xanh.
 */
export function ProdStation({ index, palette, fonts }: StationProps) {
  const globe = useRef<Group>(null);
  const bars = useRef<InstancedMesh>(null);
  const scaleOut = useRef<(Group | null)[]>([]);
  const work = useMemo(() => ({ dummy: new Object3D(), color: new Color() }), []);
  const points = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(fibonacciSphere(GLOBE_POINTS, GLOBE_RADIUS), 3));
    return geometry;
  }, []);
  const arcs = useMemo(
    () =>
      Array.from({ length: ARCS }, (_, i) => {
        const pick = (seed: number) =>
          new Vector3(hash(seed) - 0.5, hash(seed + 1) - 0.5, hash(seed + 2) - 0.5).normalize().multiplyScalar(GLOBE_RADIUS);
        const from = pick(i * 9.1);
        const to = pick(i * 4.7 + 50);
        const mid = from.clone().add(to).multiplyScalar(0.5).normalize().multiplyScalar(GLOBE_RADIUS * 1.75);
        const geometry = new TubeGeometry(new QuadraticBezierCurve3(from, mid, to), 48, 0.028, 4, false);
        const material = new ShaderMaterial({
          vertexShader: ARC_VERTEX,
          fragmentShader: ARC_FRAGMENT,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          toneMapped: false,
          uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 2 },
            uOffset: { value: hash(i * 3.3) },
            uFrom: { value: glow(palette.prod, 2.6) },
            uTo: { value: glow(palette.observe, 2.6) },
          },
        });
        return { geometry, material };
      }),
    [palette],
  );
  useEffect(
    () => () => {
      points.dispose();
      arcs.forEach((arc) => {
        arc.geometry.dispose();
        arc.material.dispose();
      });
    },
    [points, arcs],
  );
  const tones = useMemo(
    () => ({ calm: glow(palette.cicd, 2.4), busy: glow(palette.prod, 2.4), hot: glow(palette.red, 3.2) }),
    [palette],
  );
  const caption = useMemo(
    () => ({
      text: t('home.station.prod.cmd'),
      color: css(palette.ink),
      accent: css(palette.prod),
      background: css(palette.bg, 0.88),
      family: fonts.mono,
      width: 1024,
      height: 128,
    }),
    [palette, fonts.mono],
  );

  useLayoutEffect(() => {
    const mesh = bars.current;
    if (mesh === null) return;
    for (let i = 0; i < METRIC_BARS; i += 1) mesh.setColorAt(i, tones.busy);
  }, [tones]);

  useFrame(({ clock }, delta) => {
    const event = stationEventAt(landingStore.journey, index);
    const time = clock.elapsedTime;
    if (globe.current !== null) globe.current.rotation.y += delta * 0.18;
    const traffic = 1.2 + clamp01(event / 0.3) * 2.4;
    arcs.forEach((arc) => {
      const { uTime, uIntensity } = arc.material.uniforms;
      if (uTime !== undefined) uTime.value = time;
      if (uIntensity !== undefined) uIntensity.value = traffic;
    });
    const spike = clamp01((event - 0.3) / 0.12) * (1 - clamp01((event - 0.62) / 0.12));
    const calm = clamp01((event - 0.68) / 0.2);
    const mesh = bars.current;
    if (mesh !== null) {
      const { dummy, color } = work;
      for (let i = 0; i < METRIC_BARS; i += 1) {
        const wave = 0.5 + 0.5 * Math.sin(time * 2.2 + i * 0.9 + hash(i) * 6);
        const height = 0.25 + wave * (0.9 - calm * 0.45) + spike * (i > 8 ? 1.4 : 0.3);
        dummy.position.set(-1.5 + i * 0.23, height / 2 - 0.85, 0.06);
        dummy.scale.set(1, height, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        color.copy(tones.busy).lerp(tones.hot, spike).lerp(tones.calm, calm);
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    }
    scaleOut.current.forEach((node, i) => {
      if (node === null || node === undefined) return;
      const grow = clamp01((event - 0.5 - i * 0.05) / 0.1);
      node.visible = grow > 0;
      node.scale.setScalar(Math.max(easeOutBack(grow), 0.0001));
    });
  });

  return (
    <group position={[0, 0, -0.2]}>
      <group ref={globe} position={[1.8, 3.2, -0.6]}>
        <points geometry={points}>
          <pointsMaterial color={glow(palette.prod, 2.2)} size={0.07} sizeAttenuation toneMapped={false} />
        </points>
        {arcs.map((arc, i) => (
          <mesh key={i} geometry={arc.geometry} material={arc.material} />
        ))}
        <mesh rotation-x={Math.PI / 2.4}>
          <torusGeometry args={[GLOBE_RADIUS * 1.32, 0.018, 4, 96]} />
          <meshBasicMaterial color={glow(palette.observe, 2.4)} toneMapped={false} />
        </mesh>
      </group>
      {[0, 1].map((i) => (
        <group
          key={i}
          ref={(node) => {
            scaleOut.current[i] = node;
          }}
          position={[-0.9 - i * 1.9, 0.55, -2.4]}
        >
          <mesh>
            <boxGeometry args={[1.6, 1, 1.4]} />
            <DarkMaterial palette={palette} shade="bg-3" />
            <GlowEdges color={palette.cicd} strength={2.6} />
          </mesh>
        </group>
      ))}
      <group position={[-2.8, 2.4, 1.2]}>
        <mesh>
          <boxGeometry args={[3.6, 2.1, 0.05]} />
          <meshStandardMaterial color={palette.bg} roughness={0.6} metalness={0.2} transparent opacity={0.8} />
          <GlowEdges color={palette.prod} strength={2} />
        </mesh>
        <instancedMesh ref={bars} args={[undefined, undefined, METRIC_BARS]} frustumCulled={false}>
          <boxGeometry args={[0.15, 1, 0.04]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
        <Label spec={caption} width={3.4} position={[0, 1.42, 0]} />
      </group>
    </group>
  );
}
