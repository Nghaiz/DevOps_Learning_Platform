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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';

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
import { clampFocus, navIntentOf, resolveFocus } from './keyboard-nav';
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

/**
 * Tương tác rỗng, dùng riêng cho phép dựng mô hình vẽ.
 *
 * `buildSceneDraw` chỉ đọc `view` và `placement` — nó KHÔNG đọc `interaction`,
 * và `scene-draw.test.ts` ghim đúng điều đó bằng một ô so hai mô hình dựng từ
 * hai tương tác khác nhau. Nhờ vậy `useMemo` dưới đây phụ thuộc đúng hai thứ đổi
 * hiếm, thay vì cả object `props` (đổi mỗi lần cha render) hay `interaction`
 * (đổi mỗi lần con trỏ nhúc nhích) — nếu không thì cả đồ thị được dựng lại ở
 * MỖI bước rê chuột.
 */
const DRAW_ONLY_INTERACTION = {
  selectedId: null,
  hoveredId: null,
  onSelect: () => {},
  onHover: () => {},
} as const;

export function CicdScene3d(props: CicdScene3dProps): ReactElement {
  const { view, placement } = props;
  const draw = useMemo(
    () => buildSceneDraw({ view, placement, interaction: DRAW_ONLY_INTERACTION }),
    [view, placement],
  );
  const reducedMotion = usePrefersReducedMotion();
  const probeRef = useRef<HTMLSpanElement>(null);
  const [labelLayer, setLabelLayer] = useState<HTMLDivElement | null>(null);
  const [angleIndex, setAngleIndex] = useState(0);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
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
   * Tiêu điểm bàn phím — xem `keyboard-nav.ts` về việc vì sao nó KHÔNG nằm trong
   * `CicdSceneInteraction`. Kẹp lại ở mỗi lần dựng: đồ thị đổi hình sau mỗi lượt
   * chạy, nên một chỉ số hợp lệ ở lượt trước có thể trỏ ra ngoài mảng ở lượt này.
   */
  const clampedFocus = clampFocus(focusIndex, draw.nodes.length);
  const focusedNode = clampedFocus === null ? null : (draw.nodes[clampedFocus] ?? null);
  const focusedId = focusedNode?.id ?? null;

  const onSelectProp = props.interaction.onSelect;
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      const intent = navIntentOf(event.key, event.shiftKey);
      if (intent === null) {
        // ⛔ Không nuốt phím mình không xử lý — đó là cách làm hỏng mọi phím tắt
        // của trình duyệt lẫn của ứng dụng, một cách âm thầm.
        return;
      }
      const nodes = draw.nodes;
      const current = clampFocus(focusIndex, nodes.length);
      const move = resolveFocus(current, nodes.length, intent);

      if (intent === 'select') {
        const target = move.index === null ? null : (nodes[move.index] ?? null);
        if (target !== null) {
          onSelectProp(target.id);
        }
      } else if (intent === 'clear') {
        onSelectProp(null);
      } else if (move.index !== current) {
        setFocusIndex(move.index);
      }

      if (move.handled) {
        event.preventDefault();
      }
    },
    [draw, focusIndex, onSelectProp],
  );

  /*
   * Đồ thị đổi hình (chạy lại đường ống, sửa YAML) thì góc camera giữ nguyên —
   * cố ý. Tự quay về góc mặc định sau mỗi lượt chạy là cướp lại góc mà người
   * chơi vừa chọn, và họ phải chọn lại sau MỖI lần bấm chạy.
   */
  const flowActive = !reducedMotion && draw.glowNodes.length > 0;

  return (
    <div
      className="relative h-full w-full overflow-hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      data-testid={CICD_SCENE_TESTIDS.scene3d}
      data-cicd-node-count={draw.nodeCount}
      data-cicd-edge-count={draw.edgeCount}
      {...(draw.droppedNodes > 0 ? { 'data-cicd-node-dropped': draw.droppedNodes } : {})}
      {...(draw.droppedEdges > 0 ? { 'data-cicd-edge-dropped': draw.droppedEdges } : {})}
      data-cicd-quality={tier}
      {...(focusedId !== null ? { 'data-cicd-focused': focusedId } : {})}
      /*
       * `tabIndex={0}` là chỗ DUY NHẤT bàn phím vào được cảnh 3D: node không phải
       * phần tử DOM nên trình duyệt không có gì để trao tiêu điểm. `aria-label`
       * nói luôn cách dùng — người dùng đọc màn hình không có cách nào khác để
       * biết một ô `role="img"` lại nhận phím.
       */
      tabIndex={0}
      onKeyDown={handleKeyDown}
      /*
       * ⛔ `role="img"` KHÔNG đặt ở đây, nó đặt trên `<Canvas>` bên dưới.
       *
       * Vai trò `img` là "children presentational" theo ARIA: mọi thứ BÊN TRONG
       * nó bị gỡ khỏi cây trợ năng. Lúc phần tử này còn rỗng (bản stub của lead)
       * thì vô hại, nhưng giờ nó chứa hai nút xoay và một vùng `aria-live` — cả
       * ba sẽ biến mất với trình đọc màn hình, và biến mất IM LẶNG: mắt vẫn thấy
       * nút, `tabIndex` vẫn nhận tiêu điểm, không cổng tự động nào kêu.
       *
       * Canvas mới đúng là "cái hình"; khung ngoài là một NHÓM điều khiển. Đây
       * cũng là cách arena đặt (`k8s-arena/scene/arena-scene.tsx:98`).
       */
      role="group"
      aria-label={`${props.label ?? 'Đồ thị đường ống CI/CD, chế độ 3D'}. Dùng phím mũi tên để đi giữa các công việc, Enter để chọn, Escape để bỏ chọn.`}
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
        className="pointer-events-none fixed top-[-9999px] h-px w-px opacity-0"
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
        role="img"
        aria-label={props.label ?? 'Đồ thị đường ống CI/CD, chế độ 3D'}
      >
        <SceneBackground color={colors.background} />
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
          focusedId={focusedId}
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
          focusedId={focusedId}
          layer={labelLayer}
        />
        <FramePump3d
          draw={draw}
          tier={tier}
          reducedMotion={reducedMotion}
          interactionKey={`${props.interaction.selectedId ?? ''}|${props.interaction.hoveredId ?? ''}|${focusedId ?? ''}`}
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
      {/*
        Vùng đọc SỐNG cho tiêu điểm bàn phím.
        Bản mô tả tĩnh ở trên đọc một lần lúc vào cảnh và không bao giờ đọc lại;
        nó không nói được "con trỏ của tôi vừa chuyển sang đâu". Với người dùng
        đọc màn hình, canvas là một ô đen, nên vùng này là đường DUY NHẤT họ biết
        mũi tên vừa làm gì.
      */}
      <p className="sr-only" aria-live="polite" data-testid="cicd-scene-3d-live">
        {focusedNode === null ? '' : focusedNode.ariaLabel}
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
/**
 * Nền của cảnh = nền của TRANG.
 *
 * ⚠ **THÊM 2026-09-17 sau khi nhìn ảnh chụp thật.** Không có component này,
 * `<Canvas gl={{ alpha: false }}>` xoá khung bằng màu mặc định của three: ĐEN.
 * Ở theme tối trông "tạm được" nên nó sống sót mọi cổng; ở theme SÁNG thì cả
 * trang nền trắng còn khung cảnh là một ô đen đặc giữa màn hình.
 *
 * Và nó không chỉ xấu. Node ở trạng thái `pending` — trạng thái của MỌI job
 * trước lượt chạy đầu, tức thứ người chơi thấy khi vừa mở màn — vẽ bằng khung 12
 * thanh mảnh màu `status-locked`. Trên nền đen, khung đó **không nhìn thấy**:
 * ảnh chụp chỉ còn nhãn chữ và vài đường cạnh, trong khi `data-cicd-node-count`
 * vẫn báo đủ 6 node và mọi ô nghiệm thu vẫn xanh.
 *
 * ⛔ Đây là lý do "đã đo bằng máy" không thay được "đã nhìn bằng mắt": axe đo
 * tương phản của CHỮ, `tokens:check` đo màu có đến từ token, bộ đếm đo số node
 * DỰNG ra — không phép đo nào trong số đó hỏi "người chơi có thấy gì không".
 *
 * Tự xin một khung khi màu đổi: `frameloop="demand"` nên đổi theme mà không
 * `invalidate()` thì nền cũ nằm nguyên tới lần vẽ sau.
 */
function SceneBackground({ color }: { readonly color: THREE.Color }): null {
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    scene.background = color;
    invalidate();
    return () => {
      scene.background = null;
    };
  }, [scene, color, invalidate]);

  return null;
}

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
