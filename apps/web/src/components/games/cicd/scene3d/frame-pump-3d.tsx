'use client';

/**
 * Bộ đập nhịp: chỗ DUY NHẤT quyết định khi nào cảnh được vẽ (19.D.3.7/8/9).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ GÁC BẰNG `visibilityState` + `IntersectionObserver`, KHÔNG BẰNG CON TRỎ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bản đầu của arena gác hoạt ảnh nền bằng `pointerenter`/`pointerleave` trên
 * canvas, và đó là một lỗi trải nghiệm đo được: mọi bảng HUD đều bắt sự kiện
 * chuột, nên vừa đưa con trỏ sang bảng bên cạnh là `pointerleave` bắn, không ai
 * gọi `invalidate()` nữa, và vòng lặp `frameloop="demand"` **dừng hẳn** — cảnh
 * chết cứng giữa nhịp, đúng lúc người chơi vẫn đang nhìn nó.
 *
 * Câu hỏi đáng gác là "người dùng có NHÌN THẤY cảnh không", và nó được trả lời
 * bởi `document.visibilityState` (tab bị ẩn) cộng `IntersectionObserver` (canvas
 * cuộn ra khỏi màn hình) — không phải bởi vị trí con trỏ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `gl.info.reset()` GỌI Ở **ĐẦU** `useFrame`, KHÔNG PHẢI CUỐI (D.3.9)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Và `autoReset` phải TẮT. Để `autoReset` bật thì `calls` chỉ còn là số của pass
 * CUỐI — một con số nhỏ, trông đẹp, và không đo cái gì cả. Đặt ở đầu vòng lặp
 * với `priority: -2` thì nó chạy trước mọi thứ khác ghi vào cảnh, nên con số đọc
 * ra ở effect dưới là số của khung hình vừa xong trọn vẹn.
 *
 * ⚠ **Số đọc ra vô nghĩa nếu không kèm BẬC chất lượng.** AC-D4 nói rõ: "không
 * ghim bậc là ô xanh chứng minh đúng zero điều gì" — bậc thấp tắt bóng đổ nên nó
 * vẽ ít hơn hẳn bậc cao, và một phép đo không nói mình đo ở bậc nào thì không so
 * được với bất cứ gì. Nên `tier` đi ra cùng `calls` trong cùng một object.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SWIFTSHADER (D.3.8)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Chromium headless của Playwright CẤP WebGL2 qua SwiftShader — một bản rasterize
 * bằng CPU. Nó chạy được, nên mọi phép kiểm "có WebGL không" đều xanh, rồi bóng
 * mềm làm mỗi khung hình tốn hàng trăm mili-giây và suite e2e hết giờ. Phải dò
 * và tự hạ bậc NGAY, trước khi kịp đo khung hình.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

import {
  TIER_FEATURES,
  createTierController,
  detectRendererString,
  tierFromRenderer,
  type QualityTier,
} from '../../../k8s-arena/shared/scene-quality';
import { needsContinuousFrames } from './node-visuals';
import type { SceneDraw } from './scene-draw';

/**
 * Số liệu cho cổng đo e2e, phát ở `globalThis.__dlpCicdScene`.
 *
 * ⚠ TÊN NÀY LÀ MỘT HỢP ĐỒNG với ô AC-D4. Arena đã trả giá một lần cho việc đổi
 * tên cửa sổ đo mà không đổi bên đọc: mọi ô hiệu năng báo "không đo được" trong
 * im lặng suốt từ đó — một cổng không đỏ, chỉ ngừng đo. Đổi tên ở đây thì phải
 * đổi cả bên kia.
 */
export interface CicdSceneStats {
  readonly calls: number;
  readonly triangles: number;
  readonly frames: number;
  /** Bậc chất lượng lúc đo. Thiếu nó thì `calls` không so được với gì. */
  readonly tier: QualityTier;
  readonly nodes: number;
  readonly edges: number;
  /** Node bị loại vì toạ độ hỏng. Khác 0 là có lỗi ở tầng đặt chỗ. */
  readonly droppedNodes: number;
  /**
   * Cảnh có đang cần khung hình liên tục không — đối chứng ÂM của ô "0 khung
   * hình khi tĩnh". Không có nó, `frames` đứng yên có hai cách đọc không phân
   * biệt được: "vẽ theo yêu cầu đang chạy đúng" và "cảnh đã chết".
   */
  readonly animating: boolean;
}

declare global {
  var __dlpCicdScene: (() => CicdSceneStats) | undefined;
}

/**
 * Khoảng thời gian tối đa còn được coi là "một khung hình".
 *
 * Ở chế độ vẽ-theo-yêu-cầu, hai khung hình có thể cách nhau vài giây vì KHÔNG CÓ
 * GÌ cần vẽ. Đưa khoảng đó vào bộ đo tốc độ sẽ hạ bậc chất lượng của một máy
 * hoàn toàn khoẻ mạnh, chỉ vì nó đang đứng yên đúng như thiết kế.
 */
const MAX_FRAME_S = 0.1;

export interface FramePump3dProps {
  readonly draw: SceneDraw;
  readonly tier: QualityTier;
  readonly reducedMotion: boolean;
  readonly onQualityDowngrade: (tier: QualityTier, reason: string) => void;
}

export function FramePump3d({
  draw,
  tier,
  reducedMotion,
  onQualityDowngrade,
}: FramePump3dProps): null {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const framesRef = useRef(0);
  const visibleRef = useRef(true);
  const tierRef = useRef(tier);
  tierRef.current = tier;
  const downgradeRef = useRef(onQualityDowngrade);
  downgradeRef.current = onQualityDowngrade;
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    // Bộ đếm phải cộng dồn qua MỌI lượt vẽ trong một khung hình (bản đồ bóng,
    // mọi pass). Xem khối tài liệu đầu file.
    gl.info.autoReset = false;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
  }, [gl]);

  useEffect(() => {
    const canvas = gl.domElement;
    const visibility = (): void => {
      if (document.visibilityState === 'visible') {
        invalidate();
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry === undefined) {
          return;
        }
        visibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          invalidate();
        }
      },
      { threshold: 0 },
    );
    observer.observe(canvas);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [gl, invalidate]);

  useEffect(() => {
    const detected = tierFromRenderer(detectRendererString(gl.getContext()));
    if (detected === 'low' && tierRef.current !== 'low') {
      downgradeRef.current('low', 'GPU đổ hoạ bằng phần mềm — đã tắt bóng đổ và hiệu ứng nặng');
    }
  }, [gl]);

  /*
   * Mọi thay đổi KHÔNG sinh chuyển động (đồ thị đổi, đổi theme, đổi bậc, bật/tắt
   * giảm chuyển động) vẫn phải hiện ra — nên nó tự xin đúng một khung hình. Đây
   * là nửa còn lại của `frameloop="demand"`: nửa kia là "đừng vẽ khi không có gì
   * đổi", và thiếu nửa này thì cảnh đứng hình sau lần đổi đầu tiên.
   */
  useEffect(() => {
    invalidate();
  }, [draw, tier, reducedMotion, invalidate]);

  const controllerRef = useRef(createTierController(tier));
  useEffect(() => {
    controllerRef.current = createTierController(tier);
  }, [tier]);

  useFrame((_state, rawDt) => {
    framesRef.current += 1;
    gl.info.reset();

    const animating =
      visibleRef.current &&
      document.visibilityState === 'visible' &&
      needsContinuousFrames(drawRef.current.states, reducedMotion);

    if (TIER_FEATURES[tierRef.current].shadows) {
      gl.shadowMap.needsUpdate = true;
    }
    if (animating) {
      invalidate();
    }

    if (rawDt <= MAX_FRAME_S) {
      const next = controllerRef.current.observe(rawDt * 1000);
      if (next !== null && next !== tierRef.current) {
        downgradeRef.current(next, 'Khung hình tụt kéo dài — đã hạ bậc hiển thị');
      }
    }
  }, -2);

  useEffect(() => {
    globalThis.__dlpCicdScene = (): CicdSceneStats => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      frames: framesRef.current,
      tier: tierRef.current,
      nodes: drawRef.current.nodes.length,
      edges: drawRef.current.edges.length,
      droppedNodes: drawRef.current.droppedNodes,
      animating: needsContinuousFrames(drawRef.current.states, reducedMotion),
    });
    return () => {
      // Gán `undefined` chứ không `delete`: cửa sổ đo NGỪNG hoạt động, chứ không
      // phải chưa từng tồn tại — và `delete` trên một `var` toàn cục là lỗi kiểu.
      globalThis.__dlpCicdScene = undefined;
    };
  }, [gl, reducedMotion]);

  return null;
}
