'use client';

/**
 * Thân node, vành, và lớp vỏ phát sáng — tất cả bằng `InstancedMesh` (19.D.3.3/6).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SỐ LỆNH VẼ KHÔNG PHỤ THUỘC SỐ NODE — ĐÂY LÀ CHỖ GIỮ ĐIỀU ĐÓ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Năm lô thân (một cho mỗi `BodyStyle`) + hai lô vành + một lô vỏ sáng = **tối
 * đa 8 lệnh vẽ cho toàn bộ node**, dù level có 8 hay 80 job. Ô AC-D4 (dưới 100
 * lệnh vẽ ở level đông nhất) đứng được là nhờ tính chất này, không nhờ level nào
 * đó tình cờ nhỏ.
 *
 * Lô nào rỗng thì `mesh.visible = false` và nó KHÔNG tốn lệnh vẽ nào — một level
 * chương CI không có node `sunken` nào thì lô đó biến mất khỏi phép đếm.
 *
 * ⛔ Không thêm một `<mesh>` cho mỗi node vì bất kỳ lý do gì. Đó là con đường
 * duy nhất làm ô AC-D4 đỏ, và nó chỉ đỏ ở level đông nhất — tức muộn nhất có thể.
 */

import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { InstanceKey } from '@devops-platform/games';

import { NODE_HALF } from './scene-3d-math';
import {
  BODY_STYLES,
  SUNKEN_DROP,
  motionOf,
  rimStrength,
  type BodyStyle,
} from './node-visuals';
import {
  attachRimAttribute,
  batchCapacity,
  createBodyGeometry,
  createBodyMaterial,
  createGlowMaterial,
  createInstancedMesh,
  createRingGeometry,
  createRingMaterial,
} from './scene-geometry';
import type { SceneDraw } from './scene-draw';
import type { CicdThreeColors } from './use-cicd-colors';

/** Vòng mỗi giây của vành `running`. Chậm — nó báo "đang chạy", không đua với mắt. */
const SPIN_TURNS_PER_SECOND = 0.35;
/** Chu kỳ mạch đập của `queued`, giây. */
const PULSE_PERIOD = 2.4;
/** Biên độ mạch đập, theo đơn vị thế giới. */
const PULSE_AMPLITUDE = 0.06;
/** Một cú rung của `failed` kéo dài bao lâu, giây. Một lần rồi đứng. */
const SHAKE_SECONDS = 0.45;
const SHAKE_AMPLITUDE = 0.09;
const SHAKE_HZ = 11;

const MATRIX = new THREE.Matrix4();
const POSITION = new THREE.Vector3();
const SCALE = new THREE.Vector3(1, 1, 1);
const ROTATION = new THREE.Quaternion();
const SPIN_AXIS = new THREE.Vector3(0, 1, 0);

interface BodyBatch {
  readonly style: BodyStyle;
  readonly mesh: THREE.InstancedMesh;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshStandardMaterial;
  readonly rim: THREE.InstancedBufferAttribute;
}

export interface NodeBatchesProps {
  readonly draw: SceneDraw;
  readonly colors: CicdThreeColors;
  readonly darkBackground: boolean;
  /** Số mặt của khối bo góc — bậc thấp dùng ít mặt để bớt đỉnh. */
  readonly roundedSegments: number;
  readonly selectedId: InstanceKey | null;
  readonly hoveredId: InstanceKey | null;
  readonly reducedMotion: boolean;
}

export function NodeBatches({
  draw,
  colors,
  darkBackground,
  roundedSegments,
  selectedId,
  hoveredId,
  reducedMotion,
}: NodeBatchesProps): ReactElement {
  const capacity = batchCapacity(draw.nodes.length);
  /*
   * Màu viền sáng là một `THREE.Color` ỔN ĐỊNH theo tham chiếu: uniform của
   * shader trỏ thẳng vào chính nó, nên đổi theme chỉ cần ghi vào object này.
   * Cấp một object mới sẽ buộc biên dịch lại shader — một khựng hình nhìn thấy
   * được ngay giữa lượt chơi.
   */
  const rimColor = useRef(new THREE.Color()).current;

  const batches = useMemo<readonly BodyBatch[]>(() => {
    return BODY_STYLES.map((style) => {
      const geometry = createBodyGeometry(style, roundedSegments);
      const material = createBodyMaterial({ style, rimColor, darkBackground });
      const rim = attachRimAttribute(geometry, capacity);
      return { style, geometry, material, rim, mesh: createInstancedMesh(geometry, material, capacity) };
    });
  }, [capacity, roundedSegments, darkBackground, rimColor]);

  const ringMaterial = useMemo(() => createRingMaterial(), []);
  const ringGeometries = useMemo(
    () => [createRingGeometry(0, roundedSegments), createRingGeometry(1, roundedSegments)] as const,
    [roundedSegments],
  );
  const ringMeshes = useMemo(
    () =>
      ringGeometries.map((geometry) => createInstancedMesh(geometry, ringMaterial, capacity)),
    [ringGeometries, ringMaterial, capacity],
  );

  const glowMaterial = useMemo(() => createGlowMaterial(), []);
  const glowGeometry = useMemo(
    () => createBodyGeometry('solid', roundedSegments),
    [roundedSegments],
  );
  const glowMesh = useMemo(
    () => createInstancedMesh(glowGeometry, glowMaterial, capacity),
    [glowGeometry, glowMaterial, capacity],
  );

  useEffect(() => {
    rimColor.copy(colors.primary);
  }, [colors, rimColor]);

  useEffect(
    () => () => {
      for (const batch of batches) {
        batch.mesh.dispose();
        batch.geometry.dispose();
        batch.material.dispose();
      }
    },
    [batches],
  );
  useEffect(() => () => ringMeshes.forEach((mesh) => mesh.dispose()), [ringMeshes]);
  useEffect(() => () => ringGeometries.forEach((geometry) => geometry.dispose()), [ringGeometries]);
  useEffect(() => () => ringMaterial.dispose(), [ringMaterial]);
  useEffect(() => () => glowMesh.dispose(), [glowMesh]);
  useEffect(() => () => glowGeometry.dispose(), [glowGeometry]);
  useEffect(() => () => glowMaterial.dispose(), [glowMaterial]);

  /**
   * Thời điểm mỗi node BƯỚC VÀO trạng thái đỏ.
   *
   * `shake-once` cố ý không lặp (`scene-encoding.ts`): một cú rung báo "vừa đỏ",
   * còn rung vĩnh viễn là thứ người chơi phải nhìn suốt phiên và nó thắng mọi
   * thứ khác trên màn hình. Muốn "một lần" thì phải nhớ lần đó là lúc nào — và
   * nhớ theo `InstanceKey`, không theo chỉ số trong mảng: mảng sắp lại theo toạ
   * độ, nên chỉ số của một node đổi khi đồ thị đổi hình.
   */
  const shakeStartRef = useRef(new Map<InstanceKey, number>());
  const elapsedRef = useRef(0);

  useEffect(() => {
    const starts = shakeStartRef.current;
    const alive = new Set<InstanceKey>();
    for (const node of draw.nodes) {
      if (node.state !== 'failed') {
        continue;
      }
      alive.add(node.id);
      if (!starts.has(node.id)) {
        starts.set(node.id, elapsedRef.current);
      }
    }
    for (const id of [...starts.keys()]) {
      if (!alive.has(id)) {
        starts.delete(id);
      }
    }
  }, [draw]);

  useFrame((_state, delta) => {
    elapsedRef.current += Math.min(delta, 0.1);
    const now = elapsedRef.current;
    const spin = reducedMotion ? 0 : now * SPIN_TURNS_PER_SECOND * Math.PI * 2;
    const pulse = reducedMotion ? 0 : Math.sin((now / PULSE_PERIOD) * Math.PI * 2);

    for (const batch of batches) {
      batch.mesh.count = 0;
    }
    ringMeshes.forEach((mesh) => {
      mesh.count = 0;
    });
    glowMesh.count = 0;

    for (const node of draw.nodes) {
      const batch = batches.find((candidate) => candidate.style === node.style);
      if (batch === undefined || batch.mesh.count >= capacity) {
        continue;
      }
      const index = batch.mesh.count;
      batch.mesh.count += 1;

      const motion = motionOf(node.state, reducedMotion);
      let dy = node.style === 'sunken' ? -NODE_HALF.y * SUNKEN_DROP : 0;
      let dx = 0;
      if (motion === 'pulse-slow') {
        dy += pulse * PULSE_AMPLITUDE;
      }
      if (motion === 'shake-once') {
        const start = shakeStartRef.current.get(node.id);
        if (start !== undefined) {
          const age = now - start;
          if (age >= 0 && age < SHAKE_SECONDS) {
            const decay = 1 - age / SHAKE_SECONDS;
            dx = Math.sin(age * SHAKE_HZ * Math.PI * 2) * SHAKE_AMPLITUDE * decay;
          }
        }
      }

      POSITION.set(node.world.x + dx, node.world.y + dy, node.world.z);
      MATRIX.compose(POSITION, ROTATION, SCALE);
      batch.mesh.setMatrixAt(index, MATRIX);
      batch.mesh.setColorAt(index, colors.byToken[node.token]);
      batch.rim.setX(index, rimStrength(node.id, selectedId, hoveredId));
    }

    for (const slot of draw.ringSlots) {
      const mesh = ringMeshes[slot.index];
      if (mesh === undefined || mesh.count >= capacity) {
        continue;
      }
      const index = mesh.count;
      mesh.count += 1;
      POSITION.set(slot.node.world.x, slot.node.world.y, slot.node.world.z);
      // Hai vành quay NGƯỢC chiều nhau: vành kép mà quay cùng chiều thì ở tốc độ
      // này nó đọc ra hệt một vành dày, tức mất đúng thứ nó sinh ra để phân biệt.
      ROTATION.setFromAxisAngle(SPIN_AXIS, slot.index === 0 ? spin : -spin * 0.7);
      MATRIX.compose(POSITION, ROTATION, SCALE);
      ROTATION.identity();
      mesh.setMatrixAt(index, MATRIX);
      mesh.setColorAt(index, colors.byToken[slot.node.token]);
    }

    for (const node of draw.glowNodes) {
      if (glowMesh.count >= capacity) {
        break;
      }
      const index = glowMesh.count;
      glowMesh.count += 1;
      POSITION.set(node.world.x, node.world.y, node.world.z);
      SCALE.setScalar(1.22);
      MATRIX.compose(POSITION, ROTATION, SCALE);
      SCALE.setScalar(1);
      glowMesh.setMatrixAt(index, MATRIX);
      glowMesh.setColorAt(index, colors.byToken[node.token]);
    }

    for (const batch of batches) {
      commit(batch.mesh);
      batch.rim.needsUpdate = true;
    }
    ringMeshes.forEach(commit);
    commit(glowMesh);
  });

  return (
    <>
      {batches.map((batch) => (
        <primitive key={batch.style} object={batch.mesh} />
      ))}
      {ringMeshes.map((mesh, index) => (
        <primitive key={`ring-${index}`} object={mesh} />
      ))}
      <primitive object={glowMesh} />
    </>
  );
}

/**
 * Đóng sổ một lô sau khi ghi xong.
 *
 * `visible = count > 0` KHÔNG phải trang trí: một `InstancedMesh` với `count`
 * bằng 0 vẫn được renderer duyệt qua, và ở vài phiên bản three nó vẫn tính một
 * lệnh vẽ. Tắt hẳn thì phép đếm của AC-D4 nói đúng số lô THẬT SỰ có gì để vẽ.
 */
function commit(mesh: THREE.InstancedMesh): void {
  mesh.visible = mesh.count > 0;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor !== null) {
    mesh.instanceColor.needsUpdate = true;
  }
  /*
   * Xoá hình cầu bao mỗi lần ghi: `InstancedMesh` tự tính lại khi nó là `null`,
   * và không xoá thì hình cầu của khung hình ĐẦU TIÊN (lúc lô còn rỗng) được giữ
   * mãi. Với `frustumCulled = false` nó không ảnh hưởng việc vẽ, nhưng
   * `Raycaster` vẫn dùng nó để loại sớm — và lô vùng bấm sẽ không bắt được tia
   * nào. Bẫy này đã cắn arena một lần (`hit-proxy.tsx`).
   */
  mesh.boundingSphere = null;
}
