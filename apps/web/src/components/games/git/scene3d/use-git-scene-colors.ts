'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';

import {
  createCanvasColorResolver,
  fallbackGitSceneColors,
  readGitSceneColors,
  GIT_SCENE_TOKENS,
  type GitSceneColors,
  type Rgb,
} from './scene3d-tokens.ts';
import type { ColorToken } from '../git-palette.ts';

/**
 * Bảng màu tầng 3D game Git, đã đổi sang `THREE.Color`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SỬA TẠI CHỖ, KHÔNG TẠO MÀU MỚI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Vật liệu và ánh sáng giữ **tham chiếu** tới chính các thể hiện `THREE.Color`
 * này. Đổi theme chỉ cần ghi đè giá trị bên trong là cả cảnh đổi theo — không
 * phải dựng lại một cây React nào, không phải nạp lại một vật liệu nào.
 *
 * Tạo `new THREE.Color()` mỗi lần đọc lại token sẽ làm mọi tham chiếu cũ trỏ
 * tới màu CŨ: cảnh giữ nguyên màu sau khi bật chế độ tối, và không có lỗi nào
 * được ném ra.
 */
export type GitSceneThreeColors = Readonly<Record<ColorToken, THREE.Color>>;

export interface GitSceneColorsHandle {
  readonly colors: GitSceneThreeColors;
  /** Tăng mỗi lần bảng màu được ghi lại. Component dùng nó để nạp lại vật liệu. */
  readonly version: number;
}

function createColors(): GitSceneThreeColors {
  const out: Record<ColorToken, THREE.Color> = {};
  for (const token of GIT_SCENE_TOKENS) out[token] = new THREE.Color();
  return out;
}

/**
 * `SRGBColorSpace` là **BẮT BUỘC**.
 *
 * Token là màu sRGB, còn không gian làm việc của three là linear. Bỏ tham số
 * này thì mọi màu ra nhạt và bợt — và triệu chứng đó dễ bị đọc nhầm thành "bảng
 * màu chọn sai", dẫn tới sửa token thay vì sửa chỗ này.
 */
function writeColor(target: THREE.Color, rgb: Rgb): void {
  target.setRGB(rgb.r, rgb.g, rgb.b, THREE.SRGBColorSpace);
}

function applyColors(target: GitSceneThreeColors, source: GitSceneColors): void {
  for (const token of GIT_SCENE_TOKENS) {
    const rgb = source[token];
    const slot = target[token];
    if (rgb === undefined || slot === undefined) continue;
    writeColor(slot, rgb);
  }
}

/**
 * Đọc token qua một phần tử dò, và đọc **LẠI** khi theme đổi.
 *
 * ⚠ Nghe `MutationObserver` trên `<html>` chứ **không** dùng context theme của
 * React: lớp `.dark` cũng bị đổi bởi script khởi tạo sớm và bởi đường "theo hệ
 * thống" — hai đường mà context React không đi qua. Dùng context thì đổi theme
 * bằng nút bấm sẽ chạy, còn đổi theme của hệ điều hành thì không, và cái sai đó
 * chỉ lộ ra trên máy người dùng.
 *
 * @param probeRef phần tử dò. Nên là một `<span>` ngoài màn hình, KHÔNG
 *   `display: none` — phần tử không được render thì `getComputedStyle` không
 *   cho used value.
 * @param onDegraded gọi **một lần** khi có token không đọc được.
 */
export function useGitSceneColors(
  probeRef: RefObject<HTMLElement | null>,
  onDegraded: (reason: string) => void,
): GitSceneColorsHandle {
  const colorsRef = useRef<GitSceneThreeColors | null>(null);
  colorsRef.current ??= createColors();
  const [version, setVersion] = useState(0);
  const degradedRef = useRef(false);
  // Bộ phân giải giữ một canvas 1×1 bên trong — dựng MỘT lần, không dựng lại
  // mỗi lần đổi theme.
  const resolverRef = useRef<((css: string) => Rgb | null) | null>(null);

  const read = useCallback((): void => {
    const colors = colorsRef.current;
    const probe = probeRef.current;
    if (colors === null) return;

    let source: GitSceneColors;
    let degraded: boolean;
    if (typeof window === 'undefined' || probe === null) {
      source = fallbackGitSceneColors();
      degraded = true;
    } else {
      resolverRef.current ??= createCanvasColorResolver(document);
      const result = readGitSceneColors(
        probe,
        (el) => window.getComputedStyle(el).color,
        resolverRef.current,
      );
      source = result.colors;
      degraded = result.degraded;
    }

    applyColors(colors, source);
    if (degraded && !degradedRef.current) {
      // Báo MỘT lần: phép đọc chạy lại mỗi lần đổi theme, và một cảnh báo lặp
      // lại mỗi lần bật/tắt chế độ tối là tiếng ồn, không phải thông tin.
      degradedRef.current = true;
      onDegraded(
        'Không đọc được màu từ design token — cảnh 3D game Git đang dùng màu xám dự phòng. ' +
          'Thường là do trình duyệt chặn canvas 2D, thứ dùng để phân giải oklch().',
      );
    }
    setVersion((n) => n + 1);
  }, [probeRef, onDegraded]);

  useEffect(() => {
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      observer.disconnect();
    };
  }, [read]);

  return { colors: colorsRef.current, version };
}
