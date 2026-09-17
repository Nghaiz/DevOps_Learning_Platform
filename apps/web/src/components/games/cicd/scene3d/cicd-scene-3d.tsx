'use client';

/**
 * Cảnh 3D của game CI/CD — kiểu arena K8s (19.D.3).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BỘ ĐẾM TRÊN PHẦN TỬ BỌC LÀ ĐƯỜNG DUY NHẤT AC-D1 ĐO ĐƯỢC CẢNH NÀY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cảnh 3D vẽ trên canvas, nên **không có phần tử DOM cho từng node**. Một ô e2e
 * đếm `[data-cicd-node]` sẽ trả 0 ở chế độ 3D, và vì nó so "số node vẽ ra" với
 * một số kỳ vọng, ô đó XANH khi cả hai vế cùng bằng 0 — tức nó chỉ có thể báo
 * động giả, không bao giờ báo đúng (`green-that-proves-nothing.md`).
 *
 * Nên `data-cicd-node-count` / `data-cicd-edge-count` ở đây lấy từ ĐÚNG hai hàm
 * `cicdSceneNodes()` / `cicdSceneEdges()` — qua `buildSceneDraw`, nơi cả cảnh
 * lấy tập được vẽ. Không phải `view.nodes.length`: một level có `fanOut` sinh
 * nhiều thực thể cùng `stageId`, và đếm theo stage cho ra 1 ở chỗ đáng lẽ là 3 —
 * đúng con bug AC-D1 tồn tại để bắt.
 *
 * `data-cicd-node-dropped` chỉ xuất hiện khi khác 0. Xem `scene-draw.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BỐ CỤC: CANVAS CHIẾM TRỌN KHUNG CHA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Đúng luật của arena (`arena-root.tsx`): canvas nằm dưới, mọi lớp phủ là lớp
 * nổi tuyệt đối bên trên nó, và lớp nào không nhận tương tác phải để chuột lọt
 * xuống canvas (`pointer-events-none`, từng nút tự bật lại `pointer-events-auto`).
 * Không làm vậy thì một `div` trong suốt phủ toàn khung sẽ nuốt mọi cú bấm vào
 * node.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';

import {
  CICD_SCENE_TESTIDS,
  type CicdSceneProps,
} from '../scene-props';
import {
  TIER_FEATURES,
  type QualityTier,
} from '../../../k8s-arena/shared/scene-quality';
import { CAMERA_ANGLE_COUNT, angleLabel, stepAngle } from './camera-angles';
import { CameraRig3d } from './camera-rig-3d';
import { EdgeLines } from './edge-lines';
import { FramePump3d } from './frame-pump-3d';
import { HitPicking } from './hit-picking';
import { NodeBatches } from './node-batches';
import { SceneLabels3d } from './scene-labels-3d';
import { buildSceneDraw } from './scene-draw';
import { useCicdColors } from './use-cicd-colors';

export interface CicdScene3dProps extends CicdSceneProps {
  /** Bậc chất lượng do bên ngoài ép. Bỏ trống = tự dò và tự hạ bậc (D.3.8). */
  readonly quality?: QualityTier;
  /** Gọi khi cảnh tự hạ bậc, để vỏ game hiện một dòng cho người dùng biết. */
  readonly onQualityDowngrade?: (tier: QualityTier, reason: string) => void;
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

export function CicdScene3d(props: CicdScene3dProps): ReactElement {
  const draw = useMemo(() => buildSceneDraw(props), [props]);
  const reducedMotion = usePrefersReducedMotion();
  const probeRef = useRef<HTMLSpanElement>(null);
  const [labelLayer, setLabelLayer] = useState<HTMLDivElement | null>(null);
  const [angleIndex, setAngleIndex] = useState(0);
  const [autoTier, setAutoTier] = useState<QualityTier>('high');
  const tier = props.quality ?? autoTier;
  const features = TIER_FEATURES[tier];
  const { colors, darkBackground, degraded } = useCicdColors(probeRef);

  const onDowngradeProp = props.onQualityDowngrade;
  const handleDowngrade = useCallback(
    (next: QualityTier, reason: string): void => {
      setAutoTier(next);
      onDowngradeProp?.(next, reason);
    },
    [onDowngradeProp],
  );

  const rotate = useCallback((delta: number): void => {
    setAngleIndex((current) => stepAngle(current, delta));
  }, []);

  /*
   * Đồ thị đổi hình (chạy lại đường ống, sửa YAML) thì góc camera giữ nguyên —
   * cố ý. Tự quay về góc mặc định sau mỗi lượt chạy là cướp lại góc mà người
   * chơi vừa chọn, và họ phải chọn lại sau MỖI lần bấm chạy.
   */
  const flowActive = !reducedMotion && draw.glowNodes.length > 0;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      data-testid={CICD_SCENE_TESTIDS.scene3d}
      data-cicd-node-count={draw.nodeCount}
      data-cicd-edge-count={draw.edgeCount}
      {...(draw.droppedNodes > 0 ? { 'data-cicd-node-dropped': draw.droppedNodes } : {})}
      {...(draw.droppedEdges > 0 ? { 'data-cicd-edge-dropped': draw.droppedEdges } : {})}
      data-cicd-quality={tier}
      role="img"
      aria-label={props.label ?? 'Đồ thị đường ống CI/CD, chế độ 3D'}
    >
      {/*
        Phần tử dò màu: nằm TRONG cây DOM đang mang theme, nên `getComputedStyle`
        trả về màu đã được `.dark` phân giải. Đặt ngoài màn hình thay vì
        `display: none` — vài trình duyệt trả rỗng cho thuộc tính màu của phần tử
        không được bố trí.
      */}
      <span
        ref={probeRef}
        aria-hidden="true"
        className="pointer-events-none fixed -top-[9999px] h-px w-px opacity-0"
      />

      <Canvas
        orthographic
        // Vẽ THEO YÊU CẦU: không có gì đổi thì không có khung hình nào được vẽ.
        // Mọi thứ cần chuyển động tự xin một khung qua `invalidate()`.
        frameloop="demand"
        dpr={[1, features.maxPixelRatio]}
        shadows={features.shadows}
        camera={{ zoom: 40, position: [12, 12, 12], near: 0.1, far: 400 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
        }}
      >
        <SceneLighting tier={tier} />
        <CameraRig3d
          bounds={props.placement.bounds}
          angleIndex={angleIndex}
          reducedMotion={reducedMotion}
        />
        <NodeBatches
          draw={draw}
          colors={colors}
          darkBackground={darkBackground}
          roundedSegments={features.roundedSegments}
          selectedId={props.interaction.selectedId}
          hoveredId={props.interaction.hoveredId}
          reducedMotion={reducedMotion}
        />
        <EdgeLines draw={draw} colors={colors} flowActive={flowActive} />
        <HitPicking
          draw={draw}
          onSelect={props.interaction.onSelect}
          onHover={props.interaction.onHover}
          onDrillIn={props.interaction.onDrillIn}
        />
        <SceneLabels3d
          draw={draw}
          selectedId={props.interaction.selectedId}
          hoveredId={props.interaction.hoveredId}
          layer={labelLayer}
        />
        <FramePump3d
          draw={draw}
          tier={tier}
          reducedMotion={reducedMotion}
          onQualityDowngrade={handleDowngrade}
        />
      </Canvas>

      {/* Lớp nhãn: phủ lên canvas nhưng để chuột lọt xuống. */}
      <div
        ref={setLabelLayer}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      />

      <CameraAngleControl angleIndex={angleIndex} onRotate={rotate} />

      {/*
        Canvas WebGL là một ô đen với trình đọc màn hình. Bản mô tả chữ dưới đây
        là thứ DUY NHẤT người dùng đọc màn hình có được từ cảnh này — nó không
        thay được đồ thị, nhưng nó nói đúng những gì đồ thị đang nói.
      */}
      <p className="sr-only">
        {`Đồ thị có ${draw.nodeCount} công việc và ${draw.edgeCount} quan hệ phụ thuộc. `}
        {draw.nodes.map((node) => node.ariaLabel).join('. ')}
      </p>
      {degraded ? (
        <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-background/85 px-2 py-1 text-xs text-muted-foreground ring-1 ring-border">
          Không đọc được một số màu chủ đề — cảnh đang dùng màu dự phòng.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Ánh sáng. Ba nguồn, không có môi trường HDR.
 *
 * Bỏ `Environment` của drei hoàn toàn: nó tải một tấm HDR qua mạng, và AC-D6 đòi
 * **0 lời gọi `/api/`** trong lúc chơi — một tấm HDR không phải `/api/`, nhưng
 * cùng một tinh thần: cảnh này phải chạy được khi không có mạng, vì bài học chạy
 * trong sandbox không internet. Ba đèn thường là đủ cho khối hộp phẳng mặt.
 */
function SceneLighting({ tier }: { readonly tier: QualityTier }): ReactElement {
  const features = TIER_FEATURES[tier];
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight intensity={0.45} />
      <directionalLight
        position={[9, 14, 7]}
        intensity={1.15}
        castShadow={features.shadows}
        shadow-mapSize-width={features.softShadows ? 2048 : 1024}
        shadow-mapSize-height={features.softShadows ? 2048 : 1024}
      />
    </>
  );
}

/**
 * Nút xoay giữa các góc chốt sẵn.
 *
 * Là `<button>` thật chứ không phải `<div onClick>`: bàn phím phải tới được, và
 * `aria-label` phải nói đang nhìn từ đâu — với người đọc màn hình, "đã xoay" mà
 * không nói xoay tới đâu thì không phải một thông tin.
 */
function CameraAngleControl({
  angleIndex,
  onRotate,
}: {
  readonly angleIndex: number;
  readonly onRotate: (delta: number) => void;
}): ReactElement {
  return (
    <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1">
      <button
        type="button"
        className="pointer-events-auto rounded bg-background/85 px-2 py-1 text-xs text-foreground ring-1 ring-border hover:bg-background"
        onClick={() => onRotate(-1)}
        aria-label={`Xoay cảnh sang trái. ${angleLabel(angleIndex - 1)}`}
      >
        ◀
      </button>
      <span
        className="pointer-events-none rounded bg-background/85 px-2 py-1 text-xs text-muted-foreground ring-1 ring-border"
        data-cicd-camera-angle={angleIndex}
      >
        {`${angleIndex + 1}/${CAMERA_ANGLE_COUNT}`}
      </span>
      <button
        type="button"
        className="pointer-events-auto rounded bg-background/85 px-2 py-1 text-xs text-foreground ring-1 ring-border hover:bg-background"
        onClick={() => onRotate(1)}
        aria-label={`Xoay cảnh sang phải. ${angleLabel(angleIndex + 1)}`}
      >
        ▶
      </button>
    </div>
  );
}
