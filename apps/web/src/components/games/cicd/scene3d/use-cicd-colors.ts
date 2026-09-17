'use client';

/**
 * Đọc bảng màu token của cảnh CI/CD và giữ nó đồng bộ với theme.
 *
 * Phần phân tích màu (vì sao `oklch()` phải đi qua canvas 1×1) nằm ở
 * `games/shared/scene-tokens.ts`; bảng token riêng của game ở
 * `cicd-scene-tokens.ts`. File này chỉ còn ba việc: gọi hai thứ đó, đổi sang
 * `THREE.Color`, và **nhận biết khi theme đổi**.
 *
 * ⚠ Việc thứ ba là việc dễ quên nhất và hỏng im lặng nhất: đọc màu đúng một lần
 * lúc mount thì cảnh giữ nguyên bảng màu sáng sau khi người dùng bật theme tối,
 * và không gì đỏ — chỉ là một cảnh 3D sai màu giữa một giao diện tối. Nên có
 * `MutationObserver` trên `<html>` (lớp `.dark` gắn ở đó) VÀ một `matchMedia`
 * cho người để theme theo hệ điều hành.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';

import {
  CICD_TOKEN_VARS,
  createCanvasColorResolver,
  fallbackCicdSceneColors,
  readCicdSceneColors,
  type CicdSceneColors,
  type CicdStatusToken,
  type Rgb,
} from './cicd-scene-tokens';
import { isDarkBackground } from './node-visuals';

export interface CicdThreeColors {
  /** Màu theo token trạng thái — chỗ duy nhất node tra màu của nó. */
  readonly byToken: Readonly<Record<CicdStatusToken, THREE.Color>>;
  readonly primary: THREE.Color;
  readonly foreground: THREE.Color;
  readonly border: THREE.Color;
  readonly mutedForeground: THREE.Color;
  readonly background: THREE.Color;
}

export interface UseCicdColorsResult {
  readonly colors: CicdThreeColors;
  /** Tăng mỗi lần đọc lại. Bên nào cần biết "màu vừa đổi" thì phụ thuộc vào nó. */
  readonly version: number;
  /** Nền đang tối — quyết định `skipped` vẽ khung dây hay đặc mờ. */
  readonly darkBackground: boolean;
  /** Có token nào không phân giải được và đang dùng màu xám dự phòng. */
  readonly degraded: boolean;
}

function toThree(target: THREE.Color, rgb: Rgb): THREE.Color {
  /*
   * `setRGB` với không gian màu sRGB, KHÔNG phải `set(r, g, b)`: byte đọc từ
   * canvas là giá trị sRGB đã mã hoá gamma, còn three làm việc trong không gian
   * tuyến tính. Bỏ tham số không gian màu thì mọi màu ra nhạt hơn thấy rõ, và
   * "nhạt hơn" là thứ không ai gọi là lỗi nên nó sống rất lâu.
   */
  return target.setRGB(rgb.r, rgb.g, rgb.b, THREE.SRGBColorSpace);
}

export function useCicdColors(
  probeRef: RefObject<HTMLElement | null>,
  onDegraded?: (reason: string) => void,
): UseCicdColorsResult {
  const [raw, setRaw] = useState<CicdSceneColors>(() => fallbackCicdSceneColors());
  const [version, setVersion] = useState(0);
  const [degraded, setDegraded] = useState(false);
  const degradedRef = useRef(onDegraded);
  degradedRef.current = onDegraded;

  const read = useCallback((): void => {
    const probe = probeRef.current;
    if (probe === null || typeof window === 'undefined') {
      return;
    }
    const resolve = createCanvasColorResolver(document);
    const result = readCicdSceneColors(
      probe,
      (el) => window.getComputedStyle(el).color,
      resolve,
    );
    setRaw(result.colors);
    setDegraded(result.degraded);
    setVersion((n) => n + 1);
    if (result.degraded) {
      degradedRef.current?.(
        'Không đọc được một số token màu — cảnh đang dùng màu xám dự phòng',
      );
    }
  }, [probeRef]);

  useEffect(() => {
    read();
    const target = document.documentElement;
    const observer = new MutationObserver(read);
    observer.observe(target, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', read);
    return () => {
      observer.disconnect();
      query.removeEventListener('change', read);
    };
  }, [read]);

  const colors = useMemo<CicdThreeColors>(() => {
    const byToken = {} as Record<CicdStatusToken, THREE.Color>;
    for (const name of Object.keys(CICD_TOKEN_VARS) as readonly (keyof CicdSceneColors)[]) {
      // Chỉ năm token trạng thái đi vào `byToken`; phần còn lại là màu khung cảnh.
      if (
        name === 'success' ||
        name === 'destructive' ||
        name === 'warning' ||
        name === 'status-progress' ||
        name === 'status-locked'
      ) {
        byToken[name] = toThree(new THREE.Color(), raw[name]);
      }
    }
    return {
      byToken,
      primary: toThree(new THREE.Color(), raw.primary),
      foreground: toThree(new THREE.Color(), raw.foreground),
      border: toThree(new THREE.Color(), raw.border),
      mutedForeground: toThree(new THREE.Color(), raw['muted-foreground']),
      background: toThree(new THREE.Color(), raw.background),
    };
  }, [raw]);

  return { colors, version, darkBackground: isDarkBackground(raw.background), degraded };
}
