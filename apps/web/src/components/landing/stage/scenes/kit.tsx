'use client';

import { useEffect, useMemo } from 'react';
import { Edges } from '@react-three/drei';
import { SRGBColorSpace, type Color } from 'three';
import { LABEL_ASPECT, labelTexture, type LabelSpec } from '../labels';
import { glow, type PaletteKey, type StagePalette } from '../palette';

/** `rgb(r g b / a)` từ một màu của bảng, để vẽ lên canvas 2D mà không khai màu thứ hai. */
export function css(color: Color, alpha = 1): string {
  const rgb = { r: 0, g: 0, b: 0 };
  color.getRGB(rgb, SRGBColorSpace);
  const channel = (value: number) => Math.round(value * 255);
  return `rgb(${channel(rgb.r)} ${channel(rgb.g)} ${channel(rgb.b)} / ${alpha})`;
}

/** Băm tất định 0..1: cùng đầu vào cho cùng kết quả ở mọi khung, nên đèn nhấp nháy không giật. */
export const hash = (n: number): number => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export const easeOutBack = (x: number): number => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2;
export const easeOutCubic = (x: number): number => 1 - (1 - x) ** 3;

/** `spec` phải được memo ở nơi gọi: mỗi object mới là một texture mới được vẽ lại. */
export function useLabelTexture(spec: LabelSpec) {
  const texture = useMemo(() => labelTexture(spec), [spec]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

export function Label({
  spec,
  width,
  position,
  rotation,
}: {
  readonly spec: LabelSpec;
  readonly width: number;
  readonly position?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}) {
  const texture = useLabelTexture(spec);
  return (
    <mesh {...(position === undefined ? {} : { position: [...position] })} {...(rotation === undefined ? {} : { rotation: [...rotation] })}>
      <planeGeometry args={[width, width / LABEL_ASPECT(spec)]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

export function DarkMaterial({ palette, shade = 'bg-2' }: { readonly palette: StagePalette; readonly shade?: PaletteKey }) {
  return <meshStandardMaterial color={palette[shade]} roughness={0.38} metalness={0.62} envMapIntensity={1.1} />;
}

/** Viền phát sáng: đường kẻ mảnh đúng ngôn ngữ "hairline" của app, đủ sáng để bloom bắt. */
export function GlowEdges({ color, strength = 2.2, width = 1.4 }: { readonly color: Color; readonly strength?: number; readonly width?: number }) {
  return <Edges color={glow(color, strength)} lineWidth={width} toneMapped={false} threshold={20} />;
}

export function GlowMaterial({ color, strength = 2.6 }: { readonly color: Color; readonly strength?: number }) {
  return <meshBasicMaterial color={glow(color, strength)} toneMapped={false} />;
}

/**
 * Sân ga chung của mọi ga: bệ tối viền màu tuyến, vạch sáng ở mép trước. Không dựng biển tên
 * 3D: thẻ DOM bên trái đã gọi tên ga, một biển thứ hai trong cảnh chỉ là chữ trùng đè lên model.
 * `+z` của nhóm ga luôn quay về phía camera đang tới (xem `stationYaw`).
 */
export function Platform({ palette, color }: { readonly palette: StagePalette; readonly color: Color }) {
  return (
    <group>
      <mesh position={[0, -0.14, 0]}>
        <boxGeometry args={[10, 0.28, 8]} />
        <DarkMaterial palette={palette} />
        <GlowEdges color={color} strength={1.5} />
      </mesh>
      <mesh position={[0, 0.01, 3.3]}>
        <boxGeometry args={[10, 0.03, 0.18]} />
        <GlowMaterial color={color} strength={2.2} />
      </mesh>
    </group>
  );
}
