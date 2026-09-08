'use client';

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { TIER_FEATURES } from '../shared/scene-quality';
import { CAMERA_TUNING, type ArenaSceneProps } from '../arena-contract';
import { SceneContent } from './scene-content';
import { useArenaColors } from './use-arena-colors';

/**
 * Cảnh 3D của đấu trường Kubernetes.
 *
 * ⛔ Canvas nằm DƯỚI mọi lớp HUD và chiếm trọn khung cha. Lớp nhãn phủ lên trên
 * nó nhưng đặt `pointer-events: none`, nên chuột vẫn lọt xuống canvas — bẫy
 * "canvas nuốt pointer-event của nút menu" ở bản của k8sgames.com đến từ đúng
 * chỗ này, chỉ ngược chiều.
 *
 * ⚠ Thành phần này KHÔNG nhận `ClusterView` qua props. Nó nhận `subscribe` và
 * `getView` rồi tự kéo dữ liệu trong vòng lặp vẽ. Hai hàm đó BẮT BUỘC ổn định
 * theo tham chiếu — nếu chúng đổi mỗi lần cha render thì cả cây scene bị tháo
 * dựng liên tục và kết quả là KHÔNG CÓ cảnh 3D nào.
 */
export function ArenaScene(props: ArenaSceneProps): ReactElement | null {
  // Không có hook nào trước nhánh này: `enabled` tắt thì cả cảnh không tồn tại,
  // và một thân component có hook sẽ không được phép trả về sớm như vậy.
  return props.enabled ? <ArenaCanvas {...props} /> : null;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const listen = (event: MediaQueryListEvent): void => setReduced(event.matches);
    query.addEventListener('change', listen);
    return () => query.removeEventListener('change', listen);
  }, []);
  return reduced;
}

function ArenaCanvas(props: ArenaSceneProps): ReactElement {
  const propsRef = useRef<ArenaSceneProps>(props);
  propsRef.current = props;

  const probeRef = useRef<HTMLSpanElement>(null);
  const [labelLayer, setLabelLayer] = useState<HTMLDivElement | null>(null);
  /*
   * Bọc `useCallback` với phụ thuộc RỖNG và đọc qua `propsRef`: hook màu dùng
   * hàm này làm phụ thuộc của effect, nên một tham chiếu mới mỗi lần render sẽ
   * bắt nó đọc lại toàn bộ bảng màu ở mọi lượt render.
   */
  const reportDegraded = useCallback((reason: string): void => {
    propsRef.current.onColorsDegraded?.(reason);
  }, []);
  const { colors, version } = useArenaColors(probeRef, reportDegraded);
  const reducedMotion = usePrefersReducedMotion();
  const features = TIER_FEATURES[props.quality];

  return (
    <div className="relative h-full w-full" data-testid="arena-scene">
      {/*
        Phần tử dò màu: nó nằm TRONG cây DOM đang mang theme, nên
        `getComputedStyle` trả về màu đã được `.dark` phân giải. Đặt ngoài màn
        hình thay vì `display: none` cho chắc — một vài trình duyệt trả rỗng cho
        thuộc tính màu của phần tử không được bố trí.
      */}
      <span
        ref={probeRef}
        aria-hidden="true"
        className="pointer-events-none fixed -top-[9999px] h-px w-px opacity-0"
      />
      <Canvas
        // Vẽ THEO YÊU CẦU: không có gì đổi thì không có khung hình nào được vẽ.
        // Mọi thứ cần chuyển động tự xin một khung hình qua `invalidate()`.
        frameloop="demand"
        dpr={[1, features.maxPixelRatio]}
        shadows={features.softShadows ? 'soft' : features.shadows}
        camera={{
          fov: CAMERA_TUNING.fov,
          near: 0.1,
          far: 400,
          // Sao chép mảng: hằng số của hợp đồng là `readonly`, và R3F ghi thẳng vào
          // mảng nó nhận được.
          position: [...CAMERA_TUNING.initialPosition],
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          // 1.2 lấy từ bản của họ và giữ lại: dưới mức đó cảnh trên nền tối bị
          // chìm, trên mức đó vùng sáng cháy trắng và mất hết chi tiết bề mặt.
          toneMappingExposure: 1.2,
        }}
        role="img"
        aria-label="Sơ đồ 3D của cụm Kubernetes"
      >
        <SceneContent
          propsRef={propsRef}
          colors={colors}
          colorsVersion={version}
          tier={props.quality}
          reducedMotion={reducedMotion}
          labelLayer={labelLayer}
          selectedUid={props.selectedUid}
          hoveredUid={props.hoveredUid}
          showLabels={props.showLabels}
          showEdges={props.showEdges}
        />
      </Canvas>
      <div ref={setLabelLayer} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
