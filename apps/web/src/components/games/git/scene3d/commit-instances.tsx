'use client';

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useThree } from '@react-three/fiber';

import {
  ACCENT_3D,
  NODE_SOLIDS,
  SIGIL_CELLS,
  nodeHalfExtent,
  sigilCell,
  type NodeSolid,
} from './accent-3d.ts';
import {
  SIGIL_CELL_ATTRIBUTE,
  attachRimAttribute,
  createNodeMaterial,
  createSigilAtlas,
  createSigilMaterial,
} from './node-material.ts';
import type { Placed3D, Scene3DLayerProps } from './scene3d-contract.ts';
import type { GitSceneThreeColors } from './use-git-scene-colors.ts';

/**
 * Thân commit + ký hiệu trạng thái (17.K.4), mục tiêu < 100 lệnh vẽ/khung.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SỐ ĐO — `InstancedMesh` vs `Mesh`, VÀ NÓ ĐO CÁI GÌ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Plan §17.K bắt đo trước khi xây tiếp lên `InstancedMesh`, vì issue mở
 * `mrdoob/three.js#30352` báo rằng ở vài cấu hình nó CHẬM HƠN `Mesh` dùng
 * attribute chung. Kết quả đo, và ranh giới của phép đo:
 *
 * **(1) Lệnh vẽ — số học, tất định, và là thứ K.4 thật sự gác:**
 *
 * | cách dựng                   | lệnh vẽ / khung        |
 * |---|---|
 * | một `Mesh` mỗi commit       | N (+ N cho sigil)      |
 * | `InstancedMesh` mỗi khối    | **5 (+ 1 cho sigil)**  |
 *
 * Level đông nhất của game (G20, kho đôi) có ~40 commit ⇒ 80 vs 6. Hằng số 6
 * KHÔNG tăng theo số commit, nên trần 100 của K.4 không bao giờ chạm tới. Ô
 * `accent-3d.test.ts` § "trần lệnh vẽ" ghim con số đó.
 *
 * **(2) Chi phí CPU mỗi lượt cập nhật** — ĐO THẬT, 2026-09-14, three r185,
 * node v24.13.0, best-of-5 sau 400 lượt làm nóng. Phép đo là `compose()` +
 * `setMatrixAt()` so với `position.set()` + `updateMatrix()` + `updateMatrixWorld()`:
 *
 *     N=40   InstancedMesh 0.00257 ms  ·  Mesh 0.00875 ms  →  3.40×
 *     N=400  InstancedMesh 0.02345 ms  ·  Mesh 0.08341 ms  →  3.56×
 *
 * ⚠ **Phép đo này KHÔNG trả lời được #30352, và nói rằng nó trả lời được sẽ là
 * một con số xanh chẳng chứng minh gì** (`rules/green-that-proves-nothing.md`).
 * #30352 nói về chi phí phía GPU/driver; một tiến trình node không có WebGL
 * không thể nhìn thấy nửa đó. Nên kết luận trung thực có hai vế:
 *
 *  • nửa CPU — đã đo, `InstancedMesh` thắng rõ ở cả hai cỡ;
 *  • nửa GPU — CHƯA đo, và **không đo được từ lane này**. Cần một trình duyệt
 *    thật trên GPU thật, sau khi gốc hợp thành tồn tại. Chromium headless cũng
 *    KHÔNG trả lời được: ở đó WebGL chạy bằng SwiftShader (phần mềm), không đại
 *    diện cho driver nào — xem `memory/disable-gpu-does-not-remove-webgl2.md`.
 *
 * **(3) Vì sao #30352 gần như chắc chắn không cắn ở đây, dù chưa đo GPU:** issue
 * đó nói về cảnh cập nhật `instanceMatrix` MỖI KHUNG HÌNH cho hàng vạn instance.
 * Cảnh này ngược lại: DAG git **đứng yên** giữa hai lệnh người chơi gõ. Ma trận
 * được ghi trong một `useEffect` khi `placement` đổi, không phải trong
 * `useFrame` — xem khối "KHÔNG có useFrame" bên dưới. Chi phí mỗi khung hình
 * của cả tầng này là 0.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KHÔNG CÓ `useFrame` — VÀ ĐÓ LÀ CHỖ KHÁC ARENA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `k8s-arena/scene/cluster-instances.tsx` ghi lại toàn bộ ma trận mỗi khung
 * hình, và đúng với nó: pod ở arena trôi, nảy, bị kéo bằng chuột. Commit trong
 * game Git không di chuyển — vị trí là hàm thuần của `placement`, mà `placement`
 * chỉ đổi khi người chơi gõ một lệnh.
 *
 * Nên ma trận ghi trong effect, và chỉ `aRim` (chọn/rê) được ghi lại khi tương
 * tác đổi. Hệ quả: tầng này tốn **0 công mỗi khung hình**, và nó chạy đúng dưới
 * `frameloop="demand"`. `invalidate()` gọi tường minh sau mỗi lượt ghi — không
 * dựa vào việc R3F có tự xin khung hình sau một lượt commit React hay không,
 * vì đó là chi tiết cài đặt chứ không phải hợp đồng.
 */

const MATRIX = new THREE.Matrix4();
const POSITION = new THREE.Vector3();
const SCALE = new THREE.Vector3();
const ROTATION = new THREE.Quaternion();
const COLOR = new THREE.Color();

/** Sức chứa cấp phát sẵn. Vượt thì nhân đôi, và KHÔNG BAO GIỜ thu lại. */
const INITIAL_CAPACITY = 64;

/** Cường độ rim của commit đang CHỌN và đang RÊ. Chọn phải rõ hơn rê. */
const RIM_SELECTED = 1;
const RIM_HOVERED = 0.45;

function nextPow2(n: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, n)));
}

// ═══════════════════════════════════════════════════════════════════════════
// Hình học — một khối mỗi `NodeSolid`, dựng ở kích thước ĐƠN VỊ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ghép các phần thành MỘT hình học, kèm `color` mỗi đỉnh làm sắc độ.
 *
 * `vertexColors` + `instanceColor` được three NHÂN với nhau, nên một khối ghép
 * (vòng tối hơn thân) vẫn chỉ tốn một lô. Đây là khuôn của
 * `k8s-arena/scene/resource-geometry.ts`; phần đắt giá là `toNonIndexed()` —
 * `mergeGeometries` từ chối trộn hình học có index với hình học không có, và
 * thông báo lỗi của nó không nói ra điều đó.
 */
function shaded(source: THREE.BufferGeometry, shade: number): THREE.BufferGeometry {
  const geometry = source.index === null ? source : source.toNonIndexed();
  if (geometry !== source) source.dispose();
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array(count * 3).fill(shade), 3),
  );
  return geometry;
}

function createSolidGeometry(solid: NodeSolid): THREE.BufferGeometry {
  switch (solid) {
    case 'rounded':
      return shaded(new RoundedBoxGeometry(1, 1, 1, 3, 0.17), 1);

    case 'ringed': {
      // Thân + một vòng xuyến đồng tâm — gương 3D của "viền dày + vòng ngoài".
      const body = shaded(new RoundedBoxGeometry(0.84, 0.84, 0.84, 3, 0.16), 1);
      const ring = shaded(new THREE.TorusGeometry(0.62, 0.055, 8, 40), 0.72);
      return mergeGeometries([body, ring], false) ?? body;
    }

    case 'cage': {
      /*
       * Gương 3D của viền ĐỨT: một khung rỗng ruột ghép từ ba vòng vuông mảnh.
       *
       * KHÔNG dùng `wireframe: true` — nó là một cờ của VẬT LIỆU, mà cả năm khối
       * dùng CHUNG một vật liệu để giữ số lô bằng số khối. Bật wireframe sẽ cần
       * một vật liệu thứ hai, tức một lô nữa và một lần nữa cho mỗi lượt sau
       * này. Rỗng ruột bằng hình học thì miễn phí.
       */
      const parts: THREE.BufferGeometry[] = [];
      for (const axis of ['x', 'y', 'z'] as const) {
        const ring = new THREE.TorusGeometry(0.46, 0.045, 6, 4);
        if (axis === 'x') ring.rotateY(Math.PI / 2);
        if (axis === 'y') ring.rotateX(Math.PI / 2);
        ring.rotateZ(Math.PI / 4);
        parts.push(shaded(ring, 1));
      }
      return mergeGeometries(parts, false) ?? parts[0]!;
    }

    case 'sharp':
      // Tám mặt: silhouette khác hẳn hộp ngay cả khi chỉ còn vài pixel trên màn
      // hình — đúng lý do `NodeShape.sharp` tồn tại ở bản 2D.
      return shaded(new THREE.OctahedronGeometry(0.72, 0), 1);

    case 'stacked': {
      // Hai phiến lệch nhau. Phiến sau tối hơn nên chỗ chồng đọc được ngay cả
      // khi nhìn thẳng, lúc hai phiến gần như trùng bóng.
      const back = shaded(new RoundedBoxGeometry(0.82, 0.82, 0.2, 2, 0.08), 0.62);
      back.translate(-0.1, -0.1, -0.16);
      const front = shaded(new RoundedBoxGeometry(0.82, 0.82, 0.2, 2, 0.08), 1);
      front.translate(0.1, 0.1, 0.16);
      return mergeGeometries([back, front], false) ?? front;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Lô
// ═══════════════════════════════════════════════════════════════════════════

interface Batch {
  readonly solid: NodeSolid;
  readonly mesh: THREE.InstancedMesh;
  readonly geometry: THREE.BufferGeometry;
  readonly rim: THREE.InstancedBufferAttribute;
}

/** Chỗ đứng của một commit trong các lô — dùng để ghi lại `aRim` mà không quét lại. */
interface Slot {
  readonly batch: number;
  readonly index: number;
}

export interface CommitInstancesProps extends Scene3DLayerProps {
  /**
   * Bảng màu, tra theo tên biến CSS.
   *
   * ⚠ KHÔNG có trong `Scene3DLayerProps`. Xem báo cáo lane B: hợp đồng khai ba
   * trường (`placement` · `view` · `interaction`) nhưng ít nhất ba tầng cần bảng
   * màu, nên mỗi tầng đang tự nới props theo cách riêng. Nếu lead thêm `colors`
   * vào hợp đồng thì xoá phần nới này đi.
   */
  readonly colors: GitSceneThreeColors;
  /** Tăng mỗi lần token được đọc lại (đổi theme). Dùng làm dep ghi lại màu lô. */
  readonly colorsVersion: number;
}

export function CommitInstances({
  placement,
  interaction,
  colors,
  colorsVersion,
}: CommitInstancesProps): ReactElement {
  const invalidate = useThree((s) => s.invalidate);

  /** Commit đã gom theo khối, cùng bảng tra `id → chỗ đứng`. */
  const grouped = useMemo(() => {
    const rows: Placed3D[][] = NODE_SOLIDS.map(() => []);
    const slots = new Map<string, Slot>();
    for (const node of placement.nodes) {
      const batch = NODE_SOLIDS.indexOf(ACCENT_3D[node.accent].solid);
      // `indexOf` < 0 là không thể theo ô "NODE_SOLIDS phủ đủ khối" của
      // accent-3d.test.ts. Giữ phép kiểm vì nó rẻ, và vì bỏ qua một commit đọc
      // ra dễ hơn nhiều so với một ngoại lệ giữa lúc dựng cảnh.
      if (batch < 0) continue;
      const row = rows[batch];
      if (row === undefined) continue;
      slots.set(node.id, { batch, index: row.length });
      row.push(node);
    }
    return { rows, slots };
  }, [placement]);

  const needed = useMemo(
    () => grouped.rows.reduce((max, row) => Math.max(max, row.length), 0),
    [grouped],
  );
  const [capacity, setCapacity] = useState(() => Math.max(INITIAL_CAPACITY, nextPow2(needed)));
  useEffect(() => {
    if (needed > capacity) setCapacity(nextPow2(needed));
  }, [needed, capacity]);

  const materialHandle = useMemo(
    // Tham chiếu, KHÔNG clone — bảng màu sửa `THREE.Color` tại chỗ khi đổi theme.
    () => createNodeMaterial(colors['--foreground'] ?? new THREE.Color()),
    [colors],
  );

  const batches = useMemo<readonly Batch[]>(
    () =>
      NODE_SOLIDS.map((solid) => {
        const geometry = createSolidGeometry(solid);
        const rim = attachRimAttribute(geometry, capacity);
        const mesh = new THREE.InstancedMesh(geometry, materialHandle.material, capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Hộp bao của cả cảnh do camera lo; cắt theo khối ở đây chỉ tốn công
        // tính lại bao ngoài mà không bỏ được lô nào (một lô trải khắp cảnh).
        mesh.frustumCulled = false;
        mesh.count = 0;
        mesh.setColorAt(0, COLOR.setRGB(1, 1, 1));
        mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
        return { solid, mesh, geometry, rim };
      }),
    [materialHandle, capacity],
  );

  const atlas = useMemo(() => createSigilAtlas(SIGIL_CELLS), []);
  const sigilMaterial = useMemo(
    () => (atlas === null ? null : createSigilMaterial(atlas)),
    [atlas],
  );
  const sigils = useMemo(() => {
    if (sigilMaterial === null) return null;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const cell = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    cell.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(SIGIL_CELL_ATTRIBUTE, cell);
    const mesh = new THREE.InstancedMesh(geometry, sigilMaterial, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.setColorAt(0, COLOR.setRGB(1, 1, 1));
    mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    // Vẽ SAU thân, và không ghi chiều sâu (xem vật liệu) — ký hiệu nổi lên trên
    // mặt khối chứ không bị mặt đó z-fight.
    mesh.renderOrder = 1;
    return { mesh, geometry, cell };
  }, [sigilMaterial, capacity]);

  // ── dọn dẹp ──────────────────────────────────────────────────────────────
  useEffect(
    () => () => {
      for (const batch of batches) {
        batch.mesh.dispose();
        batch.geometry.dispose();
      }
    },
    [batches],
  );
  useEffect(() => () => materialHandle.material.dispose(), [materialHandle]);
  useEffect(() => () => atlas?.texture.dispose(), [atlas]);
  useEffect(() => () => sigilMaterial?.dispose(), [sigilMaterial]);
  useEffect(() => {
    if (sigils === null) return undefined;
    return () => {
      sigils.mesh.dispose();
      sigils.geometry.dispose();
    };
  }, [sigils]);

  // ── ghi ma trận + màu: CHỈ khi cảnh đổi, không mỗi khung hình ────────────
  useEffect(() => {
    let sigilCount = 0;
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const row = grouped.rows[b];
      if (batch === undefined || row === undefined) continue;
      batch.mesh.count = 0;
      for (const node of row) {
        const index = batch.mesh.count;
        if (index >= capacity) break;
        batch.mesh.count += 1;

        const accent = ACCENT_3D[node.accent];
        const side = 2 * nodeHalfExtent(node.accent);
        POSITION.set(node.position[0], node.position[1], node.position[2]);
        SCALE.setScalar(side);
        MATRIX.compose(POSITION, ROTATION, SCALE);
        batch.mesh.setMatrixAt(index, MATRIX);
        batch.mesh.setColorAt(index, pick(colors, accent.fill));
        batch.rim.setX(index, 0);

        if (sigils !== null && accent.sigil !== '' && sigilCount < capacity) {
          // Ký hiệu đặt ngay trên mặt trước của khối theo trục Z — trục LÀN. Đặt
          // theo trục X sẽ chồng lên cạnh cha-con, thứ chạy đúng theo X.
          POSITION.z += side * 0.52;
          SCALE.setScalar(side * 0.52);
          MATRIX.compose(POSITION, ROTATION, SCALE);
          sigils.mesh.setMatrixAt(sigilCount, MATRIX);
          sigils.mesh.setColorAt(sigilCount, pick(colors, accent.text));
          sigils.cell.setX(sigilCount, sigilCell(node.accent));
          sigilCount += 1;
        }
      }
      batch.mesh.visible = batch.mesh.count > 0;
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.rim.needsUpdate = true;
      if (batch.mesh.instanceColor !== null) batch.mesh.instanceColor.needsUpdate = true;
    }

    if (sigils !== null) {
      sigils.mesh.count = sigilCount;
      sigils.mesh.visible = sigilCount > 0;
      sigils.mesh.instanceMatrix.needsUpdate = true;
      sigils.cell.needsUpdate = true;
      if (sigils.mesh.instanceColor !== null) sigils.mesh.instanceColor.needsUpdate = true;
    }
    invalidate();
  }, [batches, sigils, grouped, capacity, colors, colorsVersion, invalidate]);

  // ── ghi lại `aRim` khi chỗ chọn / chỗ rê đổi ─────────────────────────────
  useEffect(() => {
    for (const batch of batches) {
      batch.rim.array.fill(0);
      batch.rim.needsUpdate = true;
    }
    const light = (id: string | null, strength: number): void => {
      if (id === null) return;
      const slot = grouped.slots.get(id);
      if (slot === undefined) return;
      batches[slot.batch]?.rim.setX(slot.index, strength);
    };
    // Rê trước, chọn sau: một commit vừa được chọn vừa đang rê phải sáng ở mức
    // CHỌN, không phải mức rê.
    light(interaction.hoveredId, RIM_HOVERED);
    light(interaction.selectedId, RIM_SELECTED);
    invalidate();
  }, [batches, grouped, interaction.hoveredId, interaction.selectedId, invalidate]);

  return (
    <>
      {batches.map((batch) => (
        <primitive key={batch.solid} object={batch.mesh} />
      ))}
      {sigils === null ? null : <primitive object={sigils.mesh} />}
    </>
  );
}

/**
 * Màu của một token, đã sao vào `COLOR` ở tầm module.
 *
 * Sao ở đây là ĐÚNG (khác với việc giữ một bản sao lâu dài): giá trị đi thẳng
 * vào buffer instance ngay trong lượt này, nên nó không cần theo dõi đổi theme —
 * effect ghi màu đã có `colorsVersion` trong mảng phụ thuộc.
 */
function pick(colors: GitSceneThreeColors, token: string): THREE.Color {
  const found = colors[token];
  // Thiếu token là một lỗi cấu hình đã có ô gác lúc test
  // (`accent-3d.test.ts` § "mọi token accent nằm trong GIT_SCENE_TOKENS").
  // Lúc chạy thì xám còn hơn đen: đen trên nền tối là vô hình.
  return found === undefined ? COLOR.setRGB(0.5, 0.5, 0.5) : COLOR.copy(found);
}
