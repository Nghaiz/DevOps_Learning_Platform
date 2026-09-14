'use client';

/**
 * Vẽ toàn bộ cạnh của đồ thị commit (17.K.5).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MỘT LỆNH VẼ CHO MỖI LOẠI CẠNH — KHÔNG PHẢI MỘT CHO MỖI CẠNH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Trần của cả cảnh là **dưới 100 draw call** (AC-7). Một `<Line>` cho mỗi cạnh
 * phá trần đó ngay ở level đông: level kho đôi có hàng chục commit, mỗi commit
 * ít nhất một cạnh cha, cộng cạnh `remote-mirror` cho mỗi commit đã push.
 *
 * Tiền lệ đã chứng minh trong chính repo này: `k8s-arena/scene/relation-edges.tsx`
 * gộp TOÀN BỘ quan hệ vào `LineSegments2` + `LineSegmentsGeometry` và chạy ở
 * một draw call, với `THREE.Points` cho chấm chạy trên dây.
 *
 * Ở đây con số là **4 + số loại cạnh có chấm nối = 5**, và nó KHÔNG phụ thuộc
 * số cạnh:
 *
 *  | Đối tượng                          | Lệnh vẽ |
 *  |---|---|
 *  | `LineSegments2` × 4 loại cạnh      | 4 |
 *  | `THREE.Points` chấm nối (`merge-parent`) | 1 |
 *
 * Bốn chứ không phải một, vì `LineMaterial` mang **một** bề dày và **một** nhịp
 * đứt cho cả vật liệu — mà bốn loại cạnh khác nhau ở đúng hai thứ đó (cộng màu
 * và chấm nối). Gộp thành một vật liệu là vứt bỏ ba trong bốn kênh phân biệt,
 * và `git-palette.ts` nói rõ vì sao không được: chỗ hai nhánh GẶP NHAU là thông
 * tin chính của mọi bài merge, và nó phải đọc được cả trên bản in đen trắng.
 *
 * Loại cạnh không có phần tử nào bị `visible = false` — nên con số thực tế
 * thường nhỏ hơn 5.
 *
 * ⚠ **`cherry-source` và `remote-mirror` DÙNG CHUNG `--muted-foreground` là CÓ
 * Ý.** Cả hai là "sợi chỉ tham chiếu", không phải quan hệ cha-con, nên chúng
 * đứng cùng một bậc thị giác; chúng phân biệt bằng NHỊP ĐỨT. Đừng "sửa" bằng
 * cách đổi màu một trong hai — xem `git-palette.ts`.
 */

import { useEffect, useMemo, type ReactElement } from 'react';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { useThree } from '@react-three/fiber';

import type { SceneEdgeKind } from '../../shared/scene-props.ts';
import { EDGE_STYLE } from '../git-palette.ts';
import { polylineSegments, routeEdges3d, type EdgeRoute3D } from './edge-route-3d.ts';
import type { Scene3DLayerProps } from './scene3d-contract.ts';
import type { GitSceneThreeColors } from './use-git-scene-colors.ts';

/**
 * ⚠ `Scene3DLayerProps` chưa mang bảng màu, nên mọi tầng vẽ phải nới nó ra.
 * Tên `colors` / `colorsVersion` lấy đúng của `RelationEdgesProps` trong arena
 * để năm lane không nở ra năm hình dạng khác nhau cho cùng một thứ.
 */
export interface LaneEdgesProps extends Scene3DLayerProps {
  readonly colors: GitSceneThreeColors;
  /** Đổi mỗi lần token được đọc lại. Là dep của việc ghi lại màu vật liệu. */
  readonly colorsVersion: number;
  /** Người chơi tắt cạnh trong bảng cài đặt khi đồ thị đông và cảnh rối. */
  readonly visible?: boolean;
}

/**
 * Bốn loại cạnh, suy ra từ `EDGE_STYLE` và sắp xếp cho thứ tự ổn định.
 *
 * Khai tay một danh sách thứ hai là tạo ra một chỗ để quên: hợp đồng thêm một
 * `SceneEdgeKind` mà danh sách này chưa có ⇒ loại cạnh đó **không được vẽ**, và
 * không cổng nào đỏ vì cả hai bảng đều "trông đúng" khi đọc riêng.
 */
const EDGE_KINDS: readonly SceneEdgeKind[] = (Object.keys(EDGE_STYLE) as SceneEdgeKind[]).sort(
  (a, b) => a.localeCompare(b),
);

/**
 * Hệ số đổi `stroke-dasharray` của SVG sang đơn vị thế giới 3D.
 *
 * `EDGE_STYLE.dash` viết bằng đơn vị của renderer 2D. 0.1 chọn để nhịp dài nhất
 * (`remote-mirror`, `'8 4'`) ra 0.8 — tức 40% của `Z_STEP`, đủ dài để đọc ra là
 * "gạch dài" ở khoảng cách camera mặc định, còn `'2 4'` của `cherry-source` ra
 * 0.2 và đọc ra là "chấm mảnh". Chính khoảng cách giữa hai nhịp đó là thứ phân
 * biệt hai loại cạnh dùng chung màu.
 */
const DASH_WORLD_SCALE = 0.1;

/** Đường kính chấm nối, tính bằng CSS pixel, theo bề dày cạnh mang nó. */
const JOINT_PX_PER_WIDTH = 2.4;

interface KindBundle {
  readonly kind: SceneEdgeKind;
  readonly geometry: LineSegmentsGeometry;
  readonly material: LineMaterial;
  readonly lines: LineSegments2;
  /** Chỉ có ở loại cạnh khai `joint: true` trong `EDGE_STYLE`. */
  readonly joints: THREE.Points | null;
}

function parseDash(dash: string | null): { dashSize: number; gapSize: number } | null {
  if (dash === null) return null;
  const parts = dash
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  const [dashPart, gapPart] = parts;
  if (dashPart === undefined) return null;
  return {
    dashSize: dashPart * DASH_WORLD_SCALE,
    gapSize: (gapPart ?? dashPart) * DASH_WORLD_SCALE,
  };
}

/**
 * Đổ các tuyến của MỘT loại cạnh vào mảng phẳng, chặn mọi giá trị không hữu hạn.
 *
 * ⚠ Đây là chỗ đắt nhất trong cả file nếu bỏ qua: **một `NaN` trong một
 * `BufferAttribute` làm three vứt TOÀN BỘ draw call đó — im lặng.** Không lỗi,
 * không cảnh báo, chỉ là cả một loại cạnh biến mất khỏi cảnh. `edge-route-3d.ts`
 * đã không sinh `NaN` ở mọi hình dạng đầu vào nó được test, nhưng dữ liệu tới
 * đây đi qua `place3d()` và qua bố cục DAG, nên phép kiểm vẫn phải đứng ở đúng
 * ranh giới buffer chứ không ở thượng nguồn.
 *
 * Tuyến hỏng bị BỎ và được BÁO, không nuốt lặng
 * (`development-principles.md` § "Errors Over Silent Fallbacks") — mất một cạnh
 * mà biết còn hơn mất cả loại cạnh mà không biết.
 */
function writeKindPositions(routes: readonly EdgeRoute3D[]): {
  positions: number[];
  joints: number[];
  dropped: string[];
} {
  const positions: number[] = [];
  const joints: number[] = [];
  const dropped: string[] = [];

  for (const route of routes) {
    const segment: number[] = [];
    polylineSegments(route.points, segment);
    if (segment.length === 0 || segment.some((n) => !Number.isFinite(n))) {
      dropped.push(route.key);
      continue;
    }
    positions.push(...segment);
    // Chấm nối nằm ở đầu phía CON. `sceneEdges()` dựng cạnh theo chiều
    // con → cha (`{ from: 'c2', to: 'c1' }`), nên đó là `points[0]`; đánh dấu ở
    // đầu kia sẽ gắn chấm vào commit CHA, tức nói sai chiều của quan hệ.
    const head = route.points[0];
    if (head !== undefined) joints.push(head[0], head[1], head[2]);
  }

  return { positions, joints, dropped };
}

export function LaneEdges({
  placement,
  colors,
  colorsVersion,
  visible = true,
}: LaneEdgesProps): ReactElement {
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  /*
   * `placement.edges` ổn định về định danh tham chiếu vì gốc hợp thành gọi
   * `place3d()` ĐÚNG MỘT LẦN (hợp đồng §Scene3DLayerProps). Gọi lần thứ hai ở
   * đâu đó phía trên sẽ làm `useMemo` này mất tác dụng trong im lặng và cả đồ
   * thị được định tuyến lại sau mỗi lệnh người chơi gõ.
   */
  const routes = useMemo(() => routeEdges3d(placement.edges), [placement.edges]);

  const byKind = useMemo(() => {
    const out = new Map<SceneEdgeKind, EdgeRoute3D[]>();
    for (const kind of EDGE_KINDS) out.set(kind, []);
    for (const route of routes) out.get(route.kind)?.push(route);
    return out;
  }, [routes]);

  const bundles = useMemo<readonly KindBundle[]>(
    () =>
      EDGE_KINDS.map((kind) => {
        const style = EDGE_STYLE[kind];
        const dash = parseDash(style.dash);
        const geometry = new LineSegmentsGeometry();
        const material = new LineMaterial({
          // Bề dày tính bằng CSS pixel (`worldUnits` mặc định `false`), dùng
          // ĐÚNG con số của renderer 2D: hai renderer phải cho cạnh cùng một
          // trọng lượng thị giác, không thì người chơi đổi chế độ và thấy đồ
          // thị "khác đi" ở chỗ đáng ra không đổi gì.
          linewidth: style.width,
          transparent: true,
          toneMapped: false,
          fog: false,
          // Khử răng cưa theo độ phủ: cạnh mảnh chạy chéo mà thiếu nó thì viền
          // răng cưa thấy rõ hơn cả chính sợi cạnh.
          alphaToCoverage: true,
          depthWrite: false,
          dashed: dash !== null,
          ...(dash ?? {}),
        });
        const lines = new LineSegments2(geometry, material);
        lines.frustumCulled = false;
        lines.renderOrder = 2;

        let joints: THREE.Points | null = null;
        if (style.joint) {
          const jointGeometry = new THREE.BufferGeometry();
          const jointMaterial = new THREE.PointsMaterial({
            // Cỡ cố định theo pixel: một chấm nhỏ dần theo chiều sâu sẽ biến
            // mất ở commit xa, mà commit xa là commit CŨ — tức đúng phần lịch
            // sử mà bài merge bảo người chơi nhìn lại.
            sizeAttenuation: false,
            toneMapped: false,
            fog: false,
            depthWrite: false,
          });
          joints = new THREE.Points(jointGeometry, jointMaterial);
          joints.frustumCulled = false;
          joints.renderOrder = 3;
        }

        return { kind, geometry, material, lines, joints };
      }),
    [],
  );

  useEffect(
    () => () => {
      for (const bundle of bundles) {
        bundle.geometry.dispose();
        bundle.material.dispose();
        bundle.joints?.geometry.dispose();
        (bundle.joints?.material as THREE.Material | undefined)?.dispose();
      }
    },
    [bundles],
  );

  // Hình học: dựng lại khi cấu trúc đồ thị đổi, tức một lần mỗi lệnh người chơi
  // gõ — không phải mỗi khung hình.
  useEffect(() => {
    const missing: string[] = [];
    for (const bundle of bundles) {
      const { positions, joints, dropped } = writeKindPositions(byKind.get(bundle.kind) ?? []);
      missing.push(...dropped);

      const hasLines = positions.length > 0;
      bundle.lines.visible = visible && hasLines;
      if (hasLines) {
        // `dispose()` trước khi thay: `setPositions` cấp buffer GPU mới, và bỏ
        // qua bước này là rò một buffer cho mỗi lần đồ thị đổi.
        bundle.geometry.dispose();
        bundle.geometry.setPositions(new Float32Array(positions));
        bundle.geometry.computeBoundingBox();
        bundle.geometry.computeBoundingSphere();
        // Bắt buộc cho vật liệu có nhịp đứt: thiếu `instanceDistanceStart/End`
        // thì shader đọc rác và nét đứt ra loang lổ theo góc nhìn.
        if (bundle.material.dashed) bundle.lines.computeLineDistances();
      }

      if (bundle.joints !== null) {
        const hasJoints = joints.length > 0;
        bundle.joints.visible = visible && hasJoints;
        bundle.joints.geometry.setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array(hasJoints ? joints : [0, 0, 0]), 3),
        );
        bundle.joints.geometry.setDrawRange(0, hasJoints ? joints.length / 3 : 0);
        bundle.joints.geometry.computeBoundingSphere();
      }
    }

    if (missing.length > 0) {
      console.error(
        `[git-scene-3d] Bỏ ${String(missing.length)} cạnh vì toạ độ không hữu hạn: ` +
          `${missing.slice(0, 5).join(', ')}. Một NaN lọt vào BufferAttribute sẽ làm ` +
          'three vứt TOÀN BỘ lệnh vẽ của loại cạnh đó, im lặng.',
      );
    }
    invalidate();
  }, [bundles, byKind, visible, invalidate]);

  /*
   * Màu: gán THAM CHIẾU dùng chung chứ không `.clone()`. `LineMaterial.color`
   * là một getter/setter trỏ thẳng vào `uniforms.diffuse.value`, nên gán tham
   * chiếu vào đó có nghĩa là hook sửa màu TẠI CHỖ khi đổi theme và vật liệu đổi
   * theo — không phải dựng lại một vật liệu nào. `uniformsNeedUpdate` ép đúng
   * một lượt nạp uniform ngay, thay vì chờ đợi điều kiện làm mới của renderer.
   */
  useEffect(() => {
    for (const bundle of bundles) {
      const style = EDGE_STYLE[bundle.kind];
      const stroke = colors[style.stroke];
      if (stroke === undefined) continue;
      bundle.material.color = stroke;
      bundle.material.uniformsNeedUpdate = true;
      if (bundle.joints !== null) {
        const jointMaterial = bundle.joints.material as THREE.PointsMaterial;
        jointMaterial.color = stroke;
        jointMaterial.size = style.width * JOINT_PX_PER_WIDTH * dpr;
        jointMaterial.needsUpdate = true;
      }
    }
    invalidate();
  }, [bundles, colors, colorsVersion, dpr, invalidate]);

  /*
   * ⚠ Bề dày của `LineSegments2` được tính TRONG SHADER từ `resolution`. Không
   * cập nhật nó theo kích thước khung vẽ thì cạnh dày đúng ở một cỡ cửa sổ và
   * sai ở mọi cỡ khác — sai âm thầm, không lỗi, không cảnh báo.
   */
  useEffect(() => {
    for (const bundle of bundles) {
      bundle.lines.onBeforeRender = (): void => {
        bundle.material.resolution.set(size.width, size.height);
      };
      bundle.material.resolution.set(size.width, size.height);
    }
    invalidate();
  }, [bundles, size, invalidate]);

  return (
    <>
      {bundles.map((bundle) => (
        <primitive key={bundle.kind} object={bundle.lines} />
      ))}
      {bundles
        .filter((bundle) => bundle.joints !== null)
        .map((bundle) => (
          <primitive key={`${bundle.kind}-joint`} object={bundle.joints as THREE.Points} />
        ))}
    </>
  );
}
