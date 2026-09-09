'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import {
  createCanvasColorResolver,
  fallbackSceneColors,
  readSceneColors,
  type SceneColors,
  type StatusToken,
} from '../shared/scene-tokens';
import { deriveArenaPalette, type ArenaPalette } from './arena-palette';

/**
 * Bảng màu đã đổi sang `THREE.Color`, dùng lại đúng các thể hiện đó qua mọi lần
 * đọc lại token.
 *
 * Sửa TẠI CHỖ chứ không tạo màu mới: vật liệu và ánh sáng giữ tham chiếu tới
 * chính các `Color` này, nên đổi theme chỉ cần ghi đè giá trị là cả cảnh đổi
 * theo — không phải dựng lại một cây React nào.
 */
export interface ArenaColors {
  readonly background: THREE.Color;
  readonly ground: THREE.Color;
  readonly platform: THREE.Color;
  readonly platformReady: THREE.Color;
  readonly platformDown: THREE.Color;
  readonly edge: THREE.Color;
  readonly edgeBroken: THREE.Color;
  readonly select: THREE.Color;
  readonly hover: THREE.Color;
  readonly body: Readonly<Record<StatusToken, THREE.Color>>;
  readonly glow: Readonly<Record<StatusToken, THREE.Color>>;
  /** Thân theo LOẠI. Khoá là token của `KIND_ACCENT`; thiếu khoá thì bên gọi tự lo dự phòng. */
  readonly kind: Record<string, THREE.Color>;
  readonly gridCell: THREE.Color;
  readonly gridSection: THREE.Color;
}

const STATUS_TOKENS: readonly StatusToken[] = [
  'success',
  'destructive',
  'warning',
  'status-progress',
  'status-locked',
];

function emptyStatusColors(): Record<StatusToken, THREE.Color> {
  const out: Partial<Record<StatusToken, THREE.Color>> = {};
  for (const token of STATUS_TOKENS) {
    out[token] = new THREE.Color();
  }
  return out as Record<StatusToken, THREE.Color>;
}

export function createArenaColors(): ArenaColors {
  return {
    background: new THREE.Color(),
    ground: new THREE.Color(),
    platform: new THREE.Color(),
    platformReady: new THREE.Color(),
    platformDown: new THREE.Color(),
    edge: new THREE.Color(),
    edgeBroken: new THREE.Color(),
    select: new THREE.Color(),
    hover: new THREE.Color(),
    body: emptyStatusColors(),
    glow: emptyStatusColors(),
    kind: {},
    gridCell: new THREE.Color(),
    gridSection: new THREE.Color(),
  };
}

/**
 * `SRGBColorSpace` là BẮT BUỘC ở đây: token là màu sRGB còn không gian làm việc
 * của three là linear. Bỏ tham số này thì mọi màu ra nhạt và bợt — đúng triệu
 * chứng "trông rẻ tiền" mà cả lane này sinh ra để chữa.
 */
function writeColor(target: THREE.Color, rgb: { r: number; g: number; b: number }): void {
  target.setRGB(rgb.r, rgb.g, rgb.b, THREE.SRGBColorSpace);
}

export function applyArenaPalette(target: ArenaColors, palette: ArenaPalette): void {
  writeColor(target.background, palette.background);
  writeColor(target.ground, palette.ground);
  writeColor(target.platform, palette.platform);
  writeColor(target.platformReady, palette.platformReady);
  writeColor(target.platformDown, palette.platformDown);
  writeColor(target.edge, palette.edge);
  writeColor(target.edgeBroken, palette.edgeBroken);
  writeColor(target.select, palette.select);
  writeColor(target.hover, palette.hover);
  for (const token of STATUS_TOKENS) {
    writeColor(target.body[token], palette.body[token]);
    writeColor(target.glow[token], palette.glow[token]);
  }
  writeColor(target.gridCell, palette.gridCell);
  writeColor(target.gridSection, palette.gridSection);
  for (const [token, rgb] of Object.entries(palette.kind)) {
    // Dựng một lần rồi sửa tại chỗ: vật liệu giữ tham chiếu tới chính các `Color`
    // này, nên đổi theme không được phép tạo thể hiện mới.
    const existing = target.kind[token];
    if (existing === undefined) {
      target.kind[token] = new THREE.Color();
    }
    writeColor(target.kind[token] as THREE.Color, rgb);
  }
}

export interface ArenaColorsHandle {
  readonly colors: ArenaColors;
  /** Tăng mỗi lần bảng màu được ghi lại. Thành phần dùng nó để nạp lại vật liệu. */
  readonly version: number;
}

/**
 * Đọc token qua một phần tử dò, và đọc LẠI khi theme đổi.
 *
 * Nghe `MutationObserver` trên `<html>` chứ không dùng context theme của React:
 * lớp `.dark` cũng bị đổi bởi script khởi tạo sớm và bởi đường "theo hệ thống",
 * hai đường mà context React không đi qua.
 */
export function useArenaColors(
  probeRef: RefObject<HTMLElement | null>,
  onDegraded: (reason: string) => void,
): ArenaColorsHandle {
  const colorsRef = useRef<ArenaColors | null>(null);
  colorsRef.current ??= createArenaColors();
  const [version, setVersion] = useState(0);
  const degradedRef = useRef(false);
  // Bộ phân giải giữ một canvas 1×1 bên trong — dựng một lần, không dựng lại
  // mỗi lần đổi theme.
  const resolverRef = useRef<((css: string) => { r: number; g: number; b: number } | null) | null>(
    null,
  );

  const read = useCallback((): void => {
    const colors = colorsRef.current;
    const probe = probeRef.current;
    if (colors === null) {
      return;
    }
    let source: SceneColors;
    let degraded: boolean;
    if (typeof window === 'undefined' || probe === null) {
      source = fallbackSceneColors();
      degraded = true;
    } else {
      resolverRef.current ??= createCanvasColorResolver(document);
      const result = readSceneColors(
        probe,
        (el) => window.getComputedStyle(el).color,
        resolverRef.current,
      );
      source = result.colors;
      degraded = result.degraded;
    }
    applyArenaPalette(colors, deriveArenaPalette(source));
    if (degraded && !degradedRef.current) {
      // Báo MỘT lần: đọc lại màu chạy mỗi lần đổi theme, và một cảnh báo lặp lại
      // mỗi lần bật/tắt chế độ tối là tiếng ồn, không phải thông tin.
      degradedRef.current = true;
      onDegraded(
        'Không đọc được màu từ design token — cảnh 3D đang dùng màu xám dự phòng. ' +
          'Thường là do trình duyệt chặn canvas 2D, thứ dùng để phân giải oklch().',
      );
    }
    setVersion((n) => n + 1);
  }, [probeRef, onDegraded]);

  useEffect(() => {
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [read]);

  return { colors: colorsRef.current, version };
}
