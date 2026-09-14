'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

import type { SceneInteraction, SceneNodeId } from '../../shared/scene-props.ts';
import { HIT_PADDING_3D, nodeHalfExtent } from './accent-3d.ts';
import type { Scene3DLayerProps } from './scene3d-contract.ts';

/**
 * Vùng bấm của tầng commit 3D — thứ quyết định "bấm vào đâu thì trúng".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG BẮN TIA THẲNG VÀO HÌNH ĐANG HIỆN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ba trong năm khối của `accent-3d.ts` RỖNG hoặc MẢNH: `cage` (accent
 * `orphaned`) là ba vòng vuông dày 0.045, `ringed` (accent `head`) có một vòng
 * xuyến nhô ra khỏi thân, `stacked` là hai phiến mỏng lệch nhau. Bắn tia vào
 * chính hình đó thì vùng bấm được là cái bóng của khung kim loại, không phải cái
 * bóng của vật — bản đồ trúng thủng lỗ chỗ, người chơi bấm đúng vào commit mà
 * không trúng gì, bấm lại chệch một pixel thì trúng.
 *
 * Đây KHÔNG phải một phòng xa. Arena đã đo và ghi lại bản đồ trúng thật ở
 * `k8s-arena/scene/hit-proxy.tsx` § "Vì sao KHÔNG bắn tia thẳng vào mô hình đang
 * hiện" — cùng một nguyên nhân hình học, và ở đây nó còn nặng hơn, vì `orphaned`
 * (commit đã mất) là thứ cả chương `reset`/`reflog` bắt người chơi bấm vào.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CÁCH SỬA: TÁCH VÙNG BẤM KHỎI HÌNH VẼ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Một `InstancedMesh` hộp **vô hình**, cùng tâm và cùng cỡ với khối đang vẽ, nới
 * ra `HIT_PADDING_3D`. Nó không được vẽ, nên hình khối giữ nguyên từng pixel;
 * thứ duy nhất đổi là câu hỏi "tia có trúng không".
 *
 * ⛔ `visible = false` mà VẪN bắt được tia: `Raycaster.intersectObject` chỉ kiểm
 * `object.layers`, **KHÔNG** kiểm `object.visible` — đã đọc lại
 * `three@0.185.1/src/core/Raycaster.js` để xác nhận, không suy từ tài liệu. Nâng
 * `three` thì kiểm lại đúng hàm đó TRƯỚC khi tin file này.
 *
 * Hệ quả cho K.4: khối này thêm **0 lệnh vẽ** (`visible === false` ⇒ renderer bỏ
 * qua), nên trần 100 lệnh vẽ không bị nó chạm vào.
 */

const RAY = new THREE.Raycaster();
const NDC = new THREE.Vector2();
const HITS: THREE.Intersection[] = [];
const MATRIX = new THREE.Matrix4();
const POSITION = new THREE.Vector3();
const SCALE = new THREE.Vector3();
const ROTATION = new THREE.Quaternion();

/**
 * Nhịp bắn tia tối đa, mili-giây (~30 lần/giây).
 *
 * Trình duyệt bắn `pointermove` nhanh hơn nhiều lần thế, và mỗi tia là một lượt
 * duyệt toàn bộ instance. 30 lần/giây đã vượt xa ngưỡng người nhận ra được độ
 * trễ khi rê chuột — cùng con số arena dùng (`scene-constants.ts`).
 */
const PICK_INTERVAL_MS = 33;

/** Rê quá ngần này pixel giữa nhấn và nhả thì đó là thao tác camera, không phải cú bấm. */
const CLICK_SLOP_PX = 5;

const INITIAL_CAPACITY = 64;

function nextPow2(n: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, n)));
}

export type HitProxyProps = Scene3DLayerProps;

export function HitProxy({ placement, interaction }: HitProxyProps): ReactElement {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  /*
   * ⛔ `interaction` và `size` đi qua ref, KHÔNG qua mảng phụ thuộc của effect.
   *
   * Cả hai đổi DANH TÍNH gần như mỗi lượt render — `interaction` là một object
   * dựng lại ở gốc hợp thành, `size` là object mới mỗi lần `ResizeObserver` của
   * R3F bắn, kể cả khi kích thước không đổi. Đưa chúng vào mảng phụ thuộc thì
   * effect gỡ và gắn lại toàn bộ listener liên tục, và trạng thái tiết chế
   * (`castAt`, `hovered`) bị xoá theo mỗi lần — tia bắn lại từ đầu, `onHover`
   * bắn lặp. Arena đã trả giá cho đúng hình dạng này
   * (`pointer-picking.tsx` § "luật 4").
   */
  const interactionRef = useRef<SceneInteraction>(interaction);
  interactionRef.current = interaction;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const [capacity, setCapacity] = useState(() =>
    Math.max(INITIAL_CAPACITY, nextPow2(placement.nodes.length)),
  );
  useEffect(() => {
    if (placement.nodes.length > capacity) setCapacity(nextPow2(placement.nodes.length));
  }, [placement, capacity]);

  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial(), []);

  const proxy = useMemo(() => {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    // Không vẽ, không đổ bóng, không nhận bóng — chỉ tồn tại cho tia dò.
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return { mesh, ids: [] as SceneNodeId[] };
  }, [geometry, material, capacity]);

  useEffect(() => () => proxy.mesh.dispose(), [proxy]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  /*
   * Ghi hộp bấm trong EFFECT, không trong `useFrame`.
   *
   * DAG git đứng yên giữa hai lệnh người chơi gõ (xem `commit-instances.tsx`),
   * nên ghi lại mỗi khung hình là làm đi làm lại một phép tính cho ra cùng kết
   * quả. Arena ghi mỗi khung vì pod ở đó trôi và bị kéo bằng chuột; ở đây không.
   */
  useEffect(() => {
    const { mesh, ids } = proxy;
    mesh.count = 0;
    ids.length = 0;
    for (const node of placement.nodes) {
      const index = mesh.count;
      if (index >= capacity) break;
      mesh.count += 1;
      ids[index] = node.id;
      POSITION.set(node.position[0], node.position[1], node.position[2]);
      // CÙNG `nodeHalfExtent()` mà tầng vẽ dùng, nhân thêm phần nới. Hai bản sao
      // của phép tính cỡ là cách nhanh nhất để vùng bấm lệch khỏi hình vẽ nửa
      // bước — một lỗi không ai thấy cho tới khi ngồi bấm thử từng commit.
      SCALE.setScalar(2 * nodeHalfExtent(node.accent) * HIT_PADDING_3D);
      MATRIX.compose(POSITION, ROTATION, SCALE);
      mesh.setMatrixAt(index, MATRIX);
    }
    mesh.instanceMatrix.needsUpdate = true;
    /*
     * Xoá hình cầu bao: `InstancedMesh.raycast` tự tính lại khi nó là `null`.
     * Không xoá thì hình cầu tính ở lượt ĐẦU (lúc `count === 0`, hoặc lúc cảnh
     * còn nhỏ hơn) được giữ mãi, và mọi tia sau đó bị loại ở phép kiểm bao
     * ngoài — tức không bấm được gì cả, mà cũng không có lỗi nào.
     */
    mesh.boundingSphere = null;
  }, [proxy, placement, capacity]);

  // ── bắn tia ──────────────────────────────────────────────────────────────
  const pokeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;
    const lastCamera = new THREE.Matrix4();
    let lastX = Number.NaN;
    let lastY = Number.NaN;
    let inside = false;
    let castAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hovered: SceneNodeId | null = null;
    let downX = 0;
    let downY = 0;
    let rectLeft = 0;
    let rectTop = 0;

    function refreshRect(): void {
      const rect = canvas.getBoundingClientRect();
      rectLeft = rect.left;
      rectTop = rect.top;
    }
    refreshRect();

    const localX = (event: { clientX: number }): number => event.clientX - rectLeft;
    const localY = (event: { clientY: number }): number => event.clientY - rectTop;

    /** `SceneNodeId` dưới một điểm màn hình, hoặc `null`. Không cấp phát. */
    function pick(offsetX: number, offsetY: number): SceneNodeId | null {
      const { mesh, ids } = proxy;
      const { width, height } = sizeRef.current;
      if (mesh.count === 0 || width === 0 || height === 0) return null;
      NDC.set((offsetX / width) * 2 - 1, -(offsetY / height) * 2 + 1);
      RAY.setFromCamera(NDC, camera);
      HITS.length = 0;
      RAY.intersectObject(mesh, false, HITS);
      // `intersectObject` đã sắp theo khoảng cách — phần tử đầu là vật gần nhất.
      const index = HITS[0]?.instanceId;
      return index === undefined ? null : (ids[index] ?? null);
    }

    function cast(): void {
      castAt = performance.now();
      lastCamera.copy(camera.matrixWorld);
      const id = Number.isNaN(lastX) ? null : pick(lastX, lastY);
      if (id === hovered) return;
      hovered = id;
      interactionRef.current.onHover(id);
      canvas.style.cursor = id === null ? '' : 'pointer';
    }

    /** Bắn ngay nếu đã qua nhịp tiết chế, nếu chưa thì hẹn đúng phần còn lại. */
    function requestCast(): void {
      const waited = performance.now() - castAt;
      if (waited >= PICK_INTERVAL_MS) {
        window.clearTimeout(timer);
        timer = undefined;
        cast();
        return;
      }
      if (timer === undefined) {
        // Đuôi: người dùng dừng tay ngay sau một sự kiện bị tiết chế bỏ qua thì
        // vị trí CUỐI vẫn phải được dò, nếu không commit dưới con trỏ không sáng.
        timer = setTimeout(() => {
          timer = undefined;
          cast();
        }, PICK_INTERVAL_MS - waited);
      }
    }

    /*
     * Nguyên nhân THỨ HAI làm cảnh dưới con trỏ đổi: con trỏ đứng yên mà CAMERA
     * đổi (người chơi xoay, lệnh bay tới, quán tính bộ điều khiển). Bỏ nhánh này
     * thì commit trôi qua dưới con trỏ trong lúc camera đang bay mà không hề
     * sáng lên. So ma trận nên khung hình nào camera đứng yên thì tốn 0 tia —
     * đây là toàn bộ chi phí mỗi-khung-hình của tầng bắt tia.
     */
    pokeRef.current = () => {
      if (inside && !lastCamera.equals(camera.matrixWorld)) requestCast();
    };

    const onMove = (event: PointerEvent): void => {
      const x = localX(event);
      const y = localY(event);
      // Trình duyệt bắn `pointermove` cả khi con trỏ đứng yên (cuộn trang, đổi
      // bố cục). Không lọc thì "chỉ bắn khi di chuyển" là một lời nói suông.
      if (x === lastX && y === lastY) return;
      inside = true;
      lastX = x;
      lastY = y;
      requestCast();
    };

    const onLeave = (): void => {
      window.clearTimeout(timer);
      timer = undefined;
      inside = false;
      lastX = Number.NaN;
      lastY = Number.NaN;
      cast();
    };

    const onDown = (event: PointerEvent): void => {
      // Bố cục có thể đã đổi kể từ lần đo trước (bảng bên mở, trang cuộn). Một
      // lượt `getBoundingClientRect` mỗi cú nhấn thì rẻ; mỗi cú rê thì không —
      // nó ép trình duyệt tính lại bố cục ngay trong đường đi nóng nhất.
      refreshRect();
      downX = event.clientX;
      downY = event.clientY;
    };

    const onClick = (event: MouseEvent): void => {
      const dragged =
        Math.abs(event.clientX - downX) > CLICK_SLOP_PX ||
        Math.abs(event.clientY - downY) > CLICK_SLOP_PX;
      // Rê quá ngưỡng giữa nhấn và nhả là thao tác xoay camera, không phải một
      // cú bấm chọn. Thiếu ngưỡng này thì mỗi lần xoay cảnh lại đổi chỗ đang chọn.
      if (dragged) return;
      // Bấm ra chỗ trống ⇒ BỎ chọn. `onSelect` nhận `null` theo hợp đồng, và bỏ
      // nhánh đó thì không có cách nào đóng bảng thông tin bằng chuột.
      interactionRef.current.onSelect(pick(localX(event), localY(event)));
    };

    const observer = new ResizeObserver(refreshRect);
    observer.observe(canvas);
    window.addEventListener('scroll', refreshRect, { passive: true, capture: true });
    window.addEventListener('resize', refreshRect, { passive: true });
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('click', onClick);

    return () => {
      window.clearTimeout(timer);
      pokeRef.current = null;
      observer.disconnect();
      window.removeEventListener('scroll', refreshRect, true);
      window.removeEventListener('resize', refreshRect);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('click', onClick);
      canvas.style.cursor = '';
    };
  }, [gl, camera, proxy]);

  useFrame(() => {
    pokeRef.current?.();
  });

  return <primitive object={proxy.mesh} />;
}
