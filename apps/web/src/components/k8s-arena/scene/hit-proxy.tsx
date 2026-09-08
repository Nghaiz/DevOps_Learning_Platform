'use client';

import { useEffect, useMemo, useState, type ReactElement, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { HIT_PADDING, INITIAL_CAPACITY } from './scene-constants';
import type { SceneRuntime } from './scene-entry';

const MATRIX = new THREE.Matrix4();
const POSITION = new THREE.Vector3();
const SCALE = new THREE.Vector3();
const ROTATION = new THREE.Quaternion();

/** Chỉ số instance → uid. Bên bắn tia tra ngược qua bảng này. */
export interface HitProxyHandle {
  readonly mesh: THREE.InstancedMesh;
  readonly uids: string[];
}

export interface HitProxyProps {
  readonly runtime: SceneRuntime;
  readonly proxyRef: RefObject<HitProxyHandle | null>;
}

/**
 * Hình bao VÔ HÌNH để bắn tia — thứ quyết định "bấm vào đâu thì trúng".
 *
 * ## Vì sao KHÔNG bắn tia thẳng vào mô hình đang hiện
 *
 * Mỗi loại tài nguyên có một mô hình riêng, ghép từ nhiều khối
 * (`resource-geometry.ts`), và phần lớn chúng RỖNG Ở GIỮA: `RoleBinding` là hai
 * vòng xuyến mảnh, `Namespace` là khung dây gồm 12 thanh dày 0.085, `CronJob`
 * là một vành tròn cộng hai cây kim. Bắn tia vào chính hình đó thì vùng bấm
 * được là cái bóng của kim loại, không phải cái bóng của vật.
 *
 * Đo trực tiếp 2026-09-08 ở `/games/k8s` level 10 — quét lưới 10px, ghi lại con
 * trỏ có đổi thành `pointer` không (`#` = trúng):
 *
 * ```
 *  410 ......##.#........##...........
 *  440 ..####...##.....##.#...........
 *  470 ..###.#......####.###.....#####
 *  500 ..#####.....######.......###.#.
 * ```
 *
 * Những dấu `.` nằm GIỮA các dấu `#` là lỗ thủng bên trong chính một con pod:
 * người chơi bấm đúng vào vật mà không trúng, rồi bấm lại chệch một pixel thì
 * trúng. Đúng triệu chứng chủ dự án báo — *"lúc hiện cursor lúc hiện pointer"*.
 * Chuột phải cũng chết theo, vì menu chỉ mở khi tia trúng.
 *
 * ## Cách sửa: tách VÙNG BẤM khỏi HÌNH VẼ
 *
 * Ở đây là một khối hộp đơn cho mỗi vật, cùng tâm và cùng cỡ với mô hình, hơi
 * nới ra. Nó KHÔNG được vẽ, nên hình khối đẹp của các tài nguyên giữ nguyên
 * từng pixel — thứ duy nhất đổi là câu hỏi "tia có trúng không".
 *
 * ⛔ `visible = false` mà VẪN bắn tia được: `Raycaster.intersectObject` chỉ kiểm
 * `object.layers`, KHÔNG kiểm `object.visible` (three 0.185.1,
 * `src/core/Raycaster.js` — hàm `intersect`). Đây là chỗ dựa của cả file, nên
 * nếu nâng `three` thì kiểm lại đúng hàm đó trước.
 *
 * Hệ quả cho cổng đo: khối này KHÔNG thêm lệnh vẽ nào (`visible === false` ⇒
 * renderer bỏ qua), nên bất biến "draw call không tăng theo số object" của
 * §15.3 vẫn nguyên vẹn.
 */
export function HitProxy({ runtime, proxyRef }: HitProxyProps): ReactElement {
  const [capacity, setCapacity] = useState(INITIAL_CAPACITY);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial(), []);
  const proxy = useMemo<HitProxyHandle>(() => {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    // Không vẽ, không đổ bóng, không nhận bóng — chỉ tồn tại cho tia dò.
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return { mesh, uids: [] };
  }, [geometry, material, capacity]);

  useEffect(() => {
    proxyRef.current = proxy;
    return () => {
      proxyRef.current = null;
    };
  }, [proxy, proxyRef]);

  useEffect(() => () => proxy.mesh.dispose(), [proxy]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    if (runtime.visible.length > capacity) {
      setCapacity(2 ** Math.ceil(Math.log2(runtime.visible.length)));
      return;
    }
    const { mesh, uids } = proxy;
    mesh.count = 0;
    uids.length = 0;
    for (const entry of runtime.visible) {
      const index = mesh.count;
      if (index >= capacity) {
        break;
      }
      mesh.count += 1;
      uids[index] = entry.uid;
      POSITION.set(entry.x, entry.drawY, entry.z);
      SCALE.setScalar(entry.drawScale * HIT_PADDING);
      MATRIX.compose(POSITION, ROTATION, SCALE);
      mesh.setMatrixAt(index, MATRIX);
    }
    mesh.instanceMatrix.needsUpdate = true;
    /*
     * Xoá hình cầu bao: `InstancedMesh.raycast` tự tính lại khi nó là `null`, và
     * không xoá thì hình cầu của khung hình ĐẦU TIÊN (lúc mọi vật còn tỉ lệ 0)
     * được giữ mãi — mọi tia sau đó đều bị loại ở phép kiểm bao ngoài, tức
     * không bấm được gì cả.
     */
    mesh.boundingSphere = null;
  });

  return <primitive object={proxy.mesh} />;
}
