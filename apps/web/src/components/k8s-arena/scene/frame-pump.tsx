'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { TIER_FEATURES, createTierController, detectRendererString, tierFromRenderer } from '../shared/scene-quality';
import type { ArenaSceneProps, QualityTier } from '../arena-contract';
import type { SceneRuntime } from './scene-entry';

/**
 * Số liệu cho cổng đo e2e. Cùng hình dạng với cửa sổ của bản cũ
 * (`__dlpK8sScene`) để harness không phải học một hợp đồng thứ hai.
 */
export interface ArenaSceneStats {
  readonly calls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly frames: number;
  readonly objects: number;
  /**
   * Tick của đồng hồ MÔ PHỎNG — đối chứng ÂM của cổng "0 khung hình khi tĩnh".
   *
   * Không có nó, `frames` đứng yên có hai cách đọc không phân biệt được: "vẽ
   * theo yêu cầu đang chạy đúng" và "mô phỏng đã chết nên chẳng có gì để vẽ".
   */
  readonly tick: number;
  readonly tier: QualityTier;
}

declare global {
  var __dlpArenaScene: (() => ArenaSceneStats) | undefined;
}

/**
 * Khoảng thời gian tối đa còn được coi là "một khung hình".
 *
 * Ở chế độ vẽ-theo-yêu-cầu, hai khung hình có thể cách nhau vài giây vì KHÔNG
 * CÓ GÌ cần vẽ. Đưa khoảng đó vào bộ đo tốc độ sẽ hạ bậc chất lượng của một máy
 * hoàn toàn khoẻ mạnh, chỉ vì nó đang đứng yên đúng như thiết kế.
 */
const MAX_FRAME_S = 0.1;

export interface FramePumpProps {
  readonly runtime: SceneRuntime;
  readonly propsRef: RefObject<ArenaSceneProps>;
  readonly tier: QualityTier;
  readonly reducedMotion: boolean;
}

/**
 * Bộ đập nhịp: nó là chỗ DUY NHẤT quyết định khi nào cảnh được vẽ lại.
 *
 * Luật: cảnh đứng yên thì KHÔNG vẽ khung hình mới. Mọi thứ cần chuyển động phải
 * tự xin một khung hình nữa qua `invalidate()`; hết thứ xin thì vòng lặp dừng.
 * Đó là lý do không được gọi `invalidate()` vô điều kiện ở đây — làm vậy là vẽ
 * 60 lần một giây suốt ván chơi và cổng e2e mất chỗ dựa.
 */
export function FramePump({ runtime, propsRef, tier, reducedMotion }: FramePumpProps): null {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const elapsedRef = useRef(0);
  const framesRef = useRef(0);
  const insideRef = useRef(false);
  const structureRef = useRef(-1);
  const tierRef = useRef(tier);
  tierRef.current = tier;

  useEffect(() => {
    // Bộ đếm phải cộng dồn qua MỌI lượt vẽ trong một khung hình (bóng tiếp xúc,
    // bản đồ bóng, các pass hậu kỳ). Để `autoReset` bật thì `calls` chỉ còn là
    // số của pass CUỐI — một con số nhỏ, trông đẹp, và không đo cái gì cả.
    gl.info.autoReset = false;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
  }, [gl]);

  useEffect(() => {
    const unsubscribe = propsRef.current.subscribe(() => {
      if (runtime.sync()) {
        invalidate();
      }
    });
    runtime.sync();
    invalidate();
    return unsubscribe;
  }, [runtime, propsRef, invalidate]);

  useEffect(() => {
    const canvas = gl.domElement;
    const enter = (): void => {
      insideRef.current = true;
      invalidate();
    };
    const leave = (): void => {
      insideRef.current = false;
    };
    const visibility = (): void => {
      if (document.visibilityState === 'visible') {
        invalidate();
      }
    };
    canvas.addEventListener('pointerenter', enter);
    canvas.addEventListener('pointerleave', leave);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      canvas.removeEventListener('pointerenter', enter);
      canvas.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [gl, invalidate]);

  // Bộ đổ hoạ mềm (SwiftShader của Chromium headless, llvmpipe của Mesa) chạy
  // được nên mọi phép kiểm "có WebGL không" đều xanh — rồi bóng mềm và hậu kỳ
  // ngốn hàng trăm mili-giây mỗi khung hình. Phải hạ bậc NGAY, trước khi đo.
  useEffect(() => {
    const detected = tierFromRenderer(detectRendererString(gl.getContext()));
    if (detected === 'low' && tierRef.current !== 'low') {
      propsRef.current.onQualityDowngrade('low', 'GPU đổ hoạ bằng phần mềm — đã tắt hậu kỳ và bóng đổ');
    }
  }, [gl, propsRef]);

  const controllerRef = useRef(createTierController(tier));
  useEffect(() => {
    controllerRef.current = createTierController(tier);
  }, [tier]);

  useFrame((_state, rawDt) => {
    framesRef.current += 1;
    gl.info.reset();

    const dt = Math.min(rawDt, MAX_FRAME_S);
    elapsedRef.current += dt;

    /*
     * Bồng bềnh CHỈ khi tab đang hiện VÀ con trỏ ở trong khung, và không bao giờ
     * ở bậc thấp. Đây là chỗ hoà giải hai yêu cầu ngược nhau: cảnh phải sống,
     * và cảnh tĩnh không được vẽ. Không khí có giá của nó, và giá đó chỉ đáng
     * trả khi người dùng đang thật sự nhìn vào khung.
     */
    const bobActive =
      insideRef.current &&
      document.visibilityState === 'visible' &&
      tierRef.current !== 'low' &&
      !reducedMotion;

    const animating = runtime.advanceFrame(elapsedRef.current, dt, { bobActive, reducedMotion });

    if (structureRef.current !== runtime.structureVersion) {
      structureRef.current = runtime.structureVersion;
      if (TIER_FEATURES[tierRef.current].shadows) {
        gl.shadowMap.needsUpdate = true;
      }
    } else if (animating && TIER_FEATURES[tierRef.current].shadows) {
      // Vật đang phóng to / chìm xuống thì bóng của nó cũng phải đổi theo. Ngoài
      // hai lúc đó, bản đồ bóng giữ nguyên — bồng bềnh 0.045 đơn vị không đủ để
      // ai nhìn ra bóng lệch, mà tính lại nó thì tốn bằng cả một lượt vẽ cảnh.
      gl.shadowMap.needsUpdate = true;
    }

    if (animating || bobActive) {
      invalidate();
    }

    if (rawDt <= MAX_FRAME_S) {
      const next = controllerRef.current.observe(rawDt * 1000);
      if (next !== null && next !== tierRef.current) {
        propsRef.current.onQualityDowngrade(next, 'Khung hình tụt kéo dài — đã hạ bậc hiển thị');
      }
    }
  }, -2);

  useEffect(() => {
    globalThis.__dlpArenaScene = (): ArenaSceneStats => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      frames: framesRef.current,
      objects: runtime.visible.length,
      tick: propsRef.current.getView().tick,
      tier: tierRef.current,
    });
    return () => {
      // Gán `undefined` chứ không `delete`: cửa sổ đo NGỪNG hoạt động, chứ không
      // phải chưa từng tồn tại — và `delete` trên một `var` toàn cục là lỗi kiểu.
      globalThis.__dlpArenaScene = undefined;
    };
  }, [gl, runtime, propsRef]);

  return null;
}
