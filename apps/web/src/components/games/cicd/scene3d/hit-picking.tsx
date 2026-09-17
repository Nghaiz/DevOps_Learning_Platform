'use client';

/**
 * Vùng bấm: một `InstancedMesh` hộp **VÔ HÌNH**, cùng tâm cùng cỡ (19.D.3.6).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG BẮN TIA THẲNG VÀO HÌNH ĐANG HIỆN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hai trong năm kiểu thân RỖNG RUỘT: `frame` là 12 thanh dày 0.055, `ghost` ở
 * nền tối là khung dây. Bắn tia vào chính hình đó thì vùng bấm được là cái bóng
 * của mấy thanh kim loại, không phải cái bóng của vật — người chơi bấm đúng vào
 * giữa một node `pending` và **không trúng gì cả**.
 *
 * Arena đã đo đúng triệu chứng này ngày 2026-09-08 và ghi lại bản đồ lỗ thủng
 * trong `k8s-arena/scene/hit-proxy.tsx`. Lane này thừa hưởng cả cách sửa.
 *
 * ⛔ **`visible = false` mà VẪN bắt được tia**: `Raycaster.intersectObject` chỉ
 * kiểm `object.layers`, KHÔNG kiểm `object.visible` (three 0.185.1,
 * `src/core/Raycaster.js`). Đây là chỗ dựa của cả file — nâng `three` thì kiểm
 * lại đúng hàm đó trước. Hệ quả cho ô AC-D4: lô này **không thêm lệnh vẽ nào**.
 *
 * ## Vì sao tự bắn tia thay vì dùng sự kiện của R3F
 *
 * Hệ sự kiện của `@react-three/fiber` bỏ qua object `visible === false` — tức là
 * bỏ qua đúng thứ tồn tại ở đây. Arena cũng tự bắn tia, cùng lý do. Đổi lại thì
 * phải tự nhớ: chuyển toạ độ con trỏ bằng `offsetX/offsetY` (không gọi
 * `getBoundingClientRect` trong `pointermove` — nó ép trình duyệt tính lại bố
 * cục mỗi lần chuột nhúc nhích).
 */

import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { InstanceKey } from '@devops-platform/games';

import { NODE_HALF } from './scene-3d-math';
import { batchCapacity, createInstancedMesh } from './scene-geometry';
import type { SceneDraw } from './scene-draw';

const RAY = new THREE.Raycaster();
const NDC = new THREE.Vector2();
const HITS: THREE.Intersection[] = [];
const MATRIX = new THREE.Matrix4();
const POSITION = new THREE.Vector3();
const SCALE = new THREE.Vector3();
const ROTATION = new THREE.Quaternion();

/** Nới vùng bấm ra một chút so với khối: bấm sát mép vẫn nên trúng. */
const HIT_PADDING = 1.15;

export interface HitPickingProps {
  readonly draw: SceneDraw;
  readonly onSelect: (id: InstanceKey | null) => void;
  readonly onHover: (id: InstanceKey | null) => void;
  /**
   * ⚠ `| undefined` viết TƯỜNG MINH, không chỉ dấu `?`. Gói này bật
   * `exactOptionalPropertyTypes`, nên "thuộc tính có thể vắng mặt" khác hẳn
   * "thuộc tính có thể mang `undefined`" — và `props.interaction.onDrillIn` đọc
   * ra đúng kiểu thứ hai. Thiếu vế này thì chỗ truyền xuống đỏ, và cách sửa sai
   * (bọc một hàm rỗng) sẽ nuốt mất khả năng phân biệt "không có drill-in" với
   * "có drill-in nhưng không làm gì".
   */
  readonly onDrillIn?: ((id: InstanceKey) => void) | undefined;
}

export function HitPicking({ draw, onSelect, onHover, onDrillIn }: HitPickingProps): ReactElement {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  const capacity = batchCapacity(draw.nodes.length);
  const geometry = useMemo(
    () => new THREE.BoxGeometry(NODE_HALF.x * 2, NODE_HALF.y * 2, NODE_HALF.z * 2),
    [],
  );
  const material = useMemo(() => new THREE.MeshBasicMaterial(), []);
  const mesh = useMemo(() => {
    const created = createInstancedMesh(geometry, material, capacity);
    // Không vẽ, không đổ bóng, không nhận bóng — chỉ tồn tại cho tia dò.
    created.visible = false;
    created.castShadow = false;
    created.receiveShadow = false;
    return created;
  }, [geometry, material, capacity]);

  /** Chỉ số instance → `InstanceKey`. Bên bắn tia tra ngược qua mảng này. */
  const idsRef = useRef<InstanceKey[]>([]);
  const handlersRef = useRef({ onSelect, onHover, onDrillIn });
  handlersRef.current = { onSelect, onHover, onDrillIn };
  const hoveredRef = useRef<InstanceKey | null>(null);

  useEffect(() => () => mesh.dispose(), [mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const ids = idsRef.current;
    mesh.count = 0;
    ids.length = 0;
    for (const node of draw.nodes) {
      if (mesh.count >= capacity) {
        break;
      }
      const index = mesh.count;
      mesh.count += 1;
      ids[index] = node.id;
      POSITION.set(node.world.x, node.world.y, node.world.z);
      SCALE.setScalar(HIT_PADDING);
      MATRIX.compose(POSITION, ROTATION, SCALE);
      mesh.setMatrixAt(index, MATRIX);
    }
    mesh.instanceMatrix.needsUpdate = true;
    /*
     * Xoá hình cầu bao: `InstancedMesh.raycast` tự tính lại khi nó `null`, và
     * không xoá thì hình cầu của khung hình ĐẦU TIÊN (lúc lô còn rỗng) được giữ
     * mãi — mọi tia sau đó bị loại ở phép kiểm bao ngoài, tức KHÔNG BẤM ĐƯỢC GÌ.
     */
    mesh.boundingSphere = null;
  });

  useEffect(() => {
    const canvas = gl.domElement;

    const pick = (event: PointerEvent | MouseEvent): InstanceKey | null => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0 || mesh.count === 0) {
        return null;
      }
      NDC.set((event.offsetX / width) * 2 - 1, -(event.offsetY / height) * 2 + 1);
      RAY.setFromCamera(NDC, camera);
      HITS.length = 0;
      RAY.intersectObject(mesh, false, HITS);
      // `intersectObject` đã sắp theo khoảng cách, nên phần tử đầu là vật gần nhất.
      const index = HITS[0]?.instanceId;
      HITS.length = 0;
      return index === undefined ? null : (idsRef.current[index] ?? null);
    };

    const move = (event: PointerEvent): void => {
      const id = pick(event);
      if (id === hoveredRef.current) {
        return;
      }
      hoveredRef.current = id;
      canvas.style.cursor = id === null ? '' : 'pointer';
      handlersRef.current.onHover(id);
      // Rê chuột KHÔNG sinh chuyển động, nên nó phải TỰ XIN một khung hình —
      // `frameloop="demand"` không vẽ lại giúp ai cả (19.D.3.7).
      invalidate();
    };

    const leave = (): void => {
      if (hoveredRef.current === null) {
        return;
      }
      hoveredRef.current = null;
      canvas.style.cursor = '';
      handlersRef.current.onHover(null);
      invalidate();
    };

    const down = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }
      // Bấm ra chỗ trống là BỎ CHỌN, không phải "không làm gì": người chơi cần
      // một đường thoát khỏi bảng thông số mà không phải đi tìm nút đóng.
      handlersRef.current.onSelect(pick(event));
      invalidate();
    };

    const dbl = (event: MouseEvent): void => {
      const id = pick(event);
      if (id !== null) {
        handlersRef.current.onDrillIn?.(id);
      }
    };

    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('dblclick', dbl);
    return () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('dblclick', dbl);
      canvas.style.cursor = '';
    };
  }, [gl, camera, mesh, invalidate]);

  return <primitive object={mesh} />;
}
