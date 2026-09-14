'use client';

import { useEffect, useMemo } from 'react';
import type { ReactElement } from 'react';
import * as THREE from 'three';

import type { ColorToken } from '../git-palette.ts';
import type { SceneFileStatus } from '../../shared/scene-props.ts';
import {
  PLATE_CELL_BASE,
  PLATE_CELL_FOOTPRINT,
  PLATE_STATUS,
  plateCellCenterY,
} from './label-priority.ts';
import {
  PLATE_CELL_STEP,
  PLATE_Y,
  PLATE_Z,
  assertPlanesClearOfDag,
  maxDeviationOf,
  type Plate3D,
  type Scene3DLayerProps,
} from './scene3d-contract.ts';
import type { GitSceneThreeColors } from './use-git-scene-colors.ts';

/**
 * Ba mặt phẳng HEAD / Index / Worktree, nhìn thấy ĐỒNG THỜI (K.3).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO "ĐỒNG THỜI" LÀ CẢ ĐIỂM CỦA MỤC NÀY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mọi công cụ git đang có đều bắt người học xem ba vùng này LẦN LƯỢT: `git
 * status` in ra một danh sách, `git diff` in ra một danh sách khác, `git diff
 * --cached` in ra danh sách thứ ba. Người học phải tự dựng mô hình ba tầng
 * trong đầu từ ba tờ giấy rời — và đó chính là chỗ họ tắc.
 *
 * Ở đây ba tầng nằm cùng một khung hình, và cột của mỗi file bị KHOÁ THEO ĐƯỜNG
 * DẪN (hợp đồng §place3d). Nhờ hai điều đó cộng lại, `git add` đọc ra bằng mắt
 * là một chuyển động **rơi thẳng xuống** — không phải một danh sách đổi nội
 * dung. Đừng phá bất biến cột: ô file lấy toạ độ SẴN CÓ từ `placement.plates`,
 * không tính lại.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MÀU ĐẾN TỪ TOKEN, QUA `useGitSceneColors` CỦA LEAD — KHÔNG TỰ PHÂN GIẢI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `colors` nhận TỪ TRÊN XUỐNG chứ tầng này không tự gọi hook: hook giữ một phần
 * tử dò, một canvas 1×1 và một `MutationObserver`. Mỗi tầng tự gọi là mỗi tầng
 * một bộ ba đó, và ba bản đọc có thể lệch pha nhau giữa hai lần đổi theme.
 *
 * ⚠ **Không `.clone()` màu nhận được.** Bảng màu được sửa TẠI CHỖ khi đổi
 * theme; vật liệu ở đây giữ tham chiếu tới chính các thể hiện đó nên cả ba mặt
 * phẳng đổi theo mà không cần dựng lại gì. Một bản sao sẽ đứng yên ở màu cũ, và
 * không có lỗi nào được ném.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A11Y NẰM Ở TẦNG NHÃN, KHÔNG Ở ĐÂY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mesh trong canvas không có mặt trong cây DOM, nên không có gì để trình đọc
 * màn hình đọc. Câu đọc của từng ô file (`"README.md, Index · đã stage, đã
 * sửa"`) do `scene-labels-3d.tsx` phát ra, và ký tự trạng thái cũng vậy — hai
 * file dùng CHUNG `plateCellTopY()` / `plateCellCenterY()` để chữ không bao giờ
 * lệch khỏi khối nó gọi tên.
 */

/** Chiều dày tấm nền của một mặt phẳng. */
const SLAB_THICKNESS = 0.08;
/** Tấm nền rộng hơn hàng ô bao nhiêu, tính theo bước cột. */
const SLAB_MARGIN = PLATE_CELL_STEP * 1.1;
/** Chiều sâu (trục Z) của tấm nền. */
const SLAB_DEPTH = PLATE_CELL_STEP * 1.15;
/**
 * Xẻ đôi (`split`): mỗi nửa dày 42% bề rộng ô, lệch 29% khỏi tâm.
 *
 * Hai con số đi với nhau: nửa-rộng của mỗi khối là 21%, nên khe giữa hai nửa
 * rộng 2 × (29% − 21%) = 16% bề rộng ô, và tổng bề ngang vẫn đúng bằng một ô.
 * Khe hẹp hơn thì ở góc camera thấp hai nửa dính lại thành một khối liền.
 */
const SPLIT_HALF_FRACTION = 0.42;
const SPLIT_OFFSET_FRACTION = 0.29;
/** Chiều dày cái gờ của `ridged`, bội số chiều dày cơ sở. */
const RIDGE_THICKNESS = 0.18;
/** Gờ rộng hơn thân ô bao nhiêu lần. */
const RIDGE_SPREAD = 1.2;

const ZONES = ['head', 'index', 'worktree'] as const;

/** Token mà tầng này cần đọc được. Dùng cho phép kiểm ở `useEffect` bên dưới. */
const REQUIRED_TOKENS: readonly ColorToken[] = [
  ...new Set<ColorToken>([
    ...Object.values(PLATE_STATUS).map((s) => s.fill),
    '--card',
    '--muted-foreground',
  ]),
];

interface PlateMaterials {
  /** Thân ô, theo trạng thái. */
  readonly solid: Readonly<Record<SceneFileStatus, THREE.MeshStandardMaterial>>;
  /**
   * Khung viền theo trạng thái — chỉ `hollow` dùng.
   *
   * Tách khỏi `edge` trung tính vì `hollow` không có thân khối nào để mang màu:
   * nếu khung của nó cũng là màu trung tính thì trạng thái `untracked` mất luôn
   * kênh MÀU, và còn lại đúng hai kênh trong khi năm trạng thái kia có ba.
   */
  readonly outline: Readonly<Record<SceneFileStatus, THREE.LineBasicMaterial>>;
  /**
   * Viền trung tính quanh mọi ô đặc và quanh tấm nền.
   *
   * KHÔNG phải trang trí. `git-palette.ts` đã đo: `--card` bằng ĐÚNG
   * `--background` ở nhánh sáng (tỉ lệ 1.00), nên một ô `unchanged` tô `--card`
   * trên nền cảnh là **vô hình** — đường viền là thứ duy nhất làm nó tồn tại.
   * Cũng vì thế viền dùng `--muted-foreground` (6.01/7.98) chứ không `--border`
   * (1.30, trượt ngưỡng 3:1 của đồ hoạ mang nghĩa).
   */
  readonly edge: THREE.LineBasicMaterial;
  readonly slab: THREE.MeshStandardMaterial;
}

function pickColor(colors: GitSceneThreeColors, token: ColorToken): THREE.Color | undefined {
  return colors[token];
}

// ═══════════════════════════════════════════════════════════════════════════

export interface FilePlatesProps extends Scene3DLayerProps {
  /**
   * Bảng màu đã phân giải, từ `useGitSceneColors()` của gốc hợp thành.
   *
   * Không có `version`: màu được sửa tại chỗ nên vật liệu ở đây tự đổi theo
   * theme. Nhận thêm một `version` chỉ để làm dep sẽ dựng lại vật liệu mỗi lần
   * đổi theme mà không đổi được gì trên màn hình.
   */
  readonly colors: GitSceneThreeColors;
  /**
   * Nơi nhận cảnh báo lúc chạy. Mặc định ra `console.warn`.
   *
   * Tồn tại để gốc hợp thành đưa được cảnh báo lên giao diện cùng chỗ với
   * `onDegraded` của bảng màu — một cảnh báo chỉ nằm trong console là một cảnh
   * báo không ai đọc khi nó xảy ra trên máy người dùng.
   */
  readonly onWarning?: (message: string) => void;
}

export function FilePlates({ placement, colors, onWarning }: FilePlatesProps): ReactElement {
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    return { box, edges: new THREE.EdgesGeometry(box) };
  }, []);

  useEffect(() => {
    const { box, edges } = geometry;
    return () => {
      box.dispose();
      edges.dispose();
    };
  }, [geometry]);

  const materials = useMemo<PlateMaterials>(() => {
    const solid: Record<string, THREE.MeshStandardMaterial> = {};
    const outline: Record<string, THREE.LineBasicMaterial> = {};
    for (const [status, style] of Object.entries(PLATE_STATUS)) {
      const color = pickColor(colors, style.fill);
      const mesh = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.04 });
      const line = new THREE.LineBasicMaterial();
      // Gán THAM CHIẾU, không `.copy()` — xem khối đầu file.
      if (color !== undefined) {
        mesh.color = color;
        line.color = color;
      }
      solid[status] = mesh;
      outline[status] = line;
    }
    const edge = new THREE.LineBasicMaterial();
    const edgeColor = pickColor(colors, '--muted-foreground');
    if (edgeColor !== undefined) edge.color = edgeColor;

    const slab = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      // Tấm nền là một BỀ MẶT, không phải một vật thể. Để đặc thì nó che mất
      // phần DAG nằm sau và người chơi mất luôn quan hệ giữa hai tầng — mà quan
      // hệ đó chính là thứ chương "vùng làm việc" dạy.
      opacity: 0.55,
    });
    const slabColor = pickColor(colors, '--card');
    if (slabColor !== undefined) slab.color = slabColor;

    return {
      solid: solid as PlateMaterials['solid'],
      outline: outline as PlateMaterials['outline'],
      edge,
      slab,
    };
  }, [colors]);

  useEffect(() => {
    return () => {
      for (const material of Object.values(materials.solid)) material.dispose();
      for (const material of Object.values(materials.outline)) material.dispose();
      materials.edge.dispose();
      materials.slab.dispose();
    };
  }, [materials]);

  /*
   * Ba cổng lúc chạy. Cả ba báo ra ngoài chứ KHÔNG nuốt: mỗi lỗi ở đây hiện lên
   * màn hình dưới dạng "hình như chỗ này render sai" và tốn một buổi để lần ra
   * nếu không có câu cảnh báo nói thẳng con số vi phạm.
   */
  useEffect(() => {
    const warn = onWarning ?? ((message: string) => console.warn(`[file-plates] ${message}`));

    const overlap = assertPlanesClearOfDag(maxDeviationOf(placement.nodes));
    if (overlap !== null) warn(overlap);

    const missing = REQUIRED_TOKENS.filter((token) => pickColor(colors, token) === undefined);
    if (missing.length > 0) {
      warn(
        `Thiếu ${String(missing.length)} token màu (${missing.join(', ')}) trong bảng đã phân giải — ` +
          'ô file sẽ ra màu mặc định của vật liệu. Kiểm `GIT_SCENE_TOKENS` ở `scene3d-tokens.ts`.',
      );
    }

    /*
     * Bất biến "một file, một cột trên cả ba mặt phẳng". Hợp đồng bảo đảm nó,
     * nhưng nó là bất biến mà CẢ mục K.3 đứng lên trên: hỏng nó thì `git add`
     * đọc ra thành "rơi chéo sang bên" thay vì "rơi thẳng xuống", và không có
     * lỗi nào được ném ra.
     */
    const columnOf = new Map<string, number>();
    const drifted = new Set<string>();
    for (const plate of placement.plates) {
      const known = columnOf.get(plate.path);
      if (known === undefined) columnOf.set(plate.path, plate.position[0]);
      else if (known !== plate.position[0]) drifted.add(plate.path);
    }
    if (drifted.size > 0) {
      warn(
        `${String(drifted.size)} file đứng ở hai cột khác nhau giữa các mặt phẳng ` +
          `(${[...drifted].join(', ')}). Chuyển động "git add" sẽ đọc ra là rơi chéo.`,
      );
    }
  }, [placement, colors, onWarning]);

  const columnCount = useMemo(
    () => new Set(placement.plates.map((plate) => plate.path)).size,
    [placement],
  );

  return (
    <group name="file-plates">
      {ZONES.map((zone) => (
        <PlateSlab
          key={zone}
          y={PLATE_Y[zone]}
          columnCount={columnCount}
          geometry={geometry}
          materials={materials}
        />
      ))}
      {placement.plates.map((plate) => (
        <PlateCell key={plate.key} plate={plate} geometry={geometry} materials={materials} />
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

interface SharedGeometry {
  readonly box: THREE.BoxGeometry;
  readonly edges: THREE.EdgesGeometry;
}

/** Tấm nền của một mặt phẳng, cộng đường viền làm nó tồn tại ở nhánh sáng. */
function PlateSlab({
  y,
  columnCount,
  geometry,
  materials,
}: {
  readonly y: number;
  readonly columnCount: number;
  readonly geometry: SharedGeometry;
  readonly materials: PlateMaterials;
}): ReactElement {
  const span = Math.max(columnCount - 1, 0) * PLATE_CELL_STEP;
  const width = span + SLAB_MARGIN * 2;
  const centreX = span / 2;
  // Tâm tấm nằm DƯỚI `y` đúng nửa chiều dày, nên MẶT TRÊN của tấm trùng `y` —
  // cũng là mốc mà `plateCellCenterY()` dựng ô lên trên.
  const position: [number, number, number] = [centreX, y - SLAB_THICKNESS / 2, PLATE_Z];
  const scale: [number, number, number] = [width, SLAB_THICKNESS, SLAB_DEPTH];

  return (
    <group>
      <mesh
        geometry={geometry.box}
        material={materials.slab}
        position={position}
        scale={scale}
        receiveShadow
      />
      <lineSegments
        geometry={geometry.edges}
        material={materials.edge}
        position={position}
        scale={scale}
      />
    </group>
  );
}

/** Một ô file. Hình khối theo `PLATE_STATUS[status].shape`. */
function PlateCell({
  plate,
  geometry,
  materials,
}: {
  readonly plate: Plate3D;
  readonly geometry: SharedGeometry;
  readonly materials: PlateMaterials;
}): ReactElement {
  const style = PLATE_STATUS[plate.status];
  const [x, planeY, z] = plate.position;
  const y = plateCellCenterY(planeY, plate.status);
  const thickness = style.height * PLATE_CELL_BASE;
  const foot = PLATE_CELL_FOOTPRINT * PLATE_CELL_STEP;
  const solid = materials.solid[plate.status];
  const outline = materials.outline[plate.status];

  if (style.shape === 'hollow') {
    /*
     * Chỉ khung, không ruột — "git chưa biết tới file này". Đây là hình khối duy
     * nhất KHÔNG có mặt đặc, và đó là chủ ý: `untracked` là trạng thái duy nhất
     * mà file chưa thuộc về git, nên nó là thứ duy nhất chưa có "thân".
     */
    return (
      <lineSegments
        geometry={geometry.edges}
        material={outline}
        position={[x, y, z]}
        scale={[foot, thickness, foot]}
      />
    );
  }

  if (style.shape === 'split') {
    /*
     * Xẻ theo trục Z, KHÔNG theo trục X. Trục X mang danh tính CỘT (một file
     * một cột), nên hai nửa lệch nhau theo X sẽ đọc ra thành hai file khác nhau
     * — đúng thứ hiểu nhầm mà ô xung đột cần tránh nhất.
     */
    const halfScale: [number, number, number] = [
      foot,
      thickness,
      SPLIT_HALF_FRACTION * foot,
    ];
    return (
      <group position={[x, y, z]}>
        {[-SPLIT_OFFSET_FRACTION, SPLIT_OFFSET_FRACTION].map((fraction) => (
          <group key={fraction} position={[0, 0, fraction * foot]}>
            <mesh geometry={geometry.box} material={solid} scale={halfScale} castShadow />
            <lineSegments
              geometry={geometry.edges}
              material={materials.edge}
              scale={halfScale}
            />
          </group>
        ))}
      </group>
    );
  }

  const scale: [number, number, number] = [foot, thickness, foot];

  return (
    <group position={[x, y, z]}>
      <mesh geometry={geometry.box} material={solid} scale={scale} castShadow />
      <lineSegments geometry={geometry.edges} material={materials.edge} scale={scale} />
      {style.shape === 'ridged' ? (
        // Gờ nổi quanh mép trên. Mỏng và rộng hơn thân, nên nó đọc ra ở SIÊU
        // HÌNH BÓNG — thấy được cả khi camera hạ thấp tới mức thân ô bẹt lại.
        <mesh
          geometry={geometry.box}
          material={solid}
          position={[0, thickness / 2, 0]}
          scale={[
            foot * RIDGE_SPREAD,
            RIDGE_THICKNESS * PLATE_CELL_BASE,
            foot * RIDGE_SPREAD,
          ]}
          castShadow
        />
      ) : null}
    </group>
  );
}
