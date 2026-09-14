'use client';

/**
 * Hai kho là hai KHỐI KHÔNG GIAN tách rời (17.K.8).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI VẼ RA CÁI KHỐI, KHI KHOẢNG TRỐNG ĐÃ CÓ SẴN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `laneZ()` đã đẩy kho `origin` ra sau `REPO_LANE_GAP` làn trống, nên hai cụm
 * commit đã tách nhau về mặt toạ độ. Nhưng một chỗ THƯA và một RANH GIỚI đọc ra
 * hai điều khác nhau: không có ranh giới, người chơi thấy "một đồ thị có một
 * quãng rỗng ở giữa" — mà đó là cách đọc SAI, và nó làm hỏng cả chương 2. Một
 * commit ở kho từ xa không phải một commit xa hơn; nó là commit ở MỘT NƠI KHÁC.
 *
 * Khối được vẽ bằng nền + đường bao + bốn cột góc: đủ để đọc ra một thể tích,
 * không kín nóc nên không che đồ thị bên trong.
 *
 * ⚠ **KHÔNG tự tính lại công thức Z.** `laneZ()` là nguồn duy nhất, và hợp đồng
 * nói thẳng vì sao: bốn chỗ cần nó, ba trong bốn nằm ở lane khác, và một bản sao
 * lệch nửa bước là loại lỗi không ai thấy cho tới khi nhìn ảnh chụp.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MÀU: NỀN LÀ `--muted`, ĐƯỜNG BAO LÀ `--muted-foreground`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `git-palette.ts` đã đo: `--muted` trên `--background` chỉ đạt 1.09/1.31 — gần
 * như vô hình. Đó đúng là thứ ta muốn ở một tấm NỀN (nó không được tranh chú ý
 * với đồ thị), và đúng là thứ ta KHÔNG muốn ở đường bao — vì đường bao mới là
 * thứ mang nghĩa "ranh giới kho", tức đồ hoạ chịu ngưỡng 3:1 của WCAG 1.4.11.
 * Đường bao dùng `--muted-foreground` (6.01/7.98). Cùng lý do đã ghi ở hệ quả #2
 * của `git-palette.ts`, chỉ khác đối tượng.
 *
 * `opacity` trên tấm nền là chấp nhận được, khác với lệnh cấm `opacity` ở
 * `git-palette.ts`: lệnh cấm đó nói về việc làm MỜ CHỮ và MỜ CẠNH (hạ tương phản
 * của thứ phải đọc được). Tấm nền không mang chữ và không mang nghĩa nào ngoài
 * "vùng này thuộc kho kia".
 *
 * ⚠ Lớp này chỉ DỰNG KHÔNG GIAN. Chuyển động bay qua khoảng trống (push/fetch)
 * là việc của lane E — đừng viết animation ở đây.
 */

import { useEffect, useMemo, type ReactElement } from 'react';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { useThree } from '@react-three/fiber';

import type { SceneLayout, SceneRepo } from '../../shared/scene-props.ts';
import { REPO_LABEL } from '../git-palette.ts';
import {
  NODE_RADIUS,
  X_STEP,
  Z_STEP,
  deviationY,
  laneZ,
  type Scene3DLayerProps,
  type Vec3,
} from './scene3d-contract.ts';
import type { GitSceneThreeColors } from './use-git-scene-colors.ts';

/**
 * Mặt nền, theo Y.
 *
 * Nằm dưới làn chính (y = 0) một khoảng lớn hơn `NODE_RADIUS`, nên ô commit trên
 * nhánh chính KHÔNG chạm nền. Chạm nền sẽ đọc ra thành "commit này đứng trên mặt
 * đất" — một quan hệ không tồn tại, và nó tranh nghĩa với chiều đi XUỐNG mà hợp
 * đồng để dành cho chuyển động "mất" (`reset --hard` làm commit chìm).
 */
const FLOOR_Y = -NODE_RADIUS - 0.55;

/** Phần lề quanh cụm commit, theo tỉ lệ với bước của trục tương ứng. */
const PAD_RATIO = 0.7;

/** Bề dày đường bao, CSS pixel. Mảnh hơn cạnh `parent` — nó là khung, không phải nội dung. */
const OUTLINE_PX = 1.5;

/** Khoảng hở giữa đỉnh cột góc và commit cao nhất trong khối. */
const POST_HEADROOM = 0.5;

/** Chiều cao tối thiểu của cột góc, cho khối chỉ có commit trên nhánh chính. */
const POST_MIN_HEIGHT = 1.1;

/** Bề rộng canvas nhãn, tính bằng pixel ở tỉ lệ 1×. */
const LABEL_CANVAS = { width: 512, height: 96 } as const;

/** Bề rộng nhãn trong không gian 3D. Cao suy ra theo tỉ lệ canvas. */
const LABEL_WORLD_WIDTH = 6.2;

interface BlockBox {
  readonly repo: SceneRepo;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly topY: number;
}

/**
 * Hộp bao của MỘT kho, đo từ `SceneLayout` của chính kho đó.
 *
 * ⚠ **Đo từ layout, KHÔNG quét `placement.nodes`.** Bản đầu của file này quét
 * node để suy ra `depth`/`lane` lớn nhất — đúng thứ docblock của
 * `Scene3DLayerProps.layouts` cảnh báo: "tầng 3D phải dựng lại hình dạng
 * `SceneLayout` từ `placement.nodes`". Hai lý do nó sai, ngoài chuyện SSOT:
 *
 *  1. **Khối co giãn theo từng lệnh.** Quét node cho biên bám sát tập commit
 *     ĐANG hiện, nên mỗi `commit` mới làm cả khối nhảy rộng ra một bước. Ranh
 *     giới một cái kho không đổi khi bạn thêm một commit vào nó.
 *  2. **Làn trống vẫn thuộc về kho.** `layoutDag` cấp làn cho một nhánh kể cả
 *     khi commit ngoài cùng của nhánh đó tạm không được vẽ; biên đo từ node sẽ
 *     cắt mất phần làn đó, rồi nhánh "chui ra ngoài khối" khi nó hiện lại.
 *
 * Trả `null` khi layout rỗng — vẽ một khối rỗng nói dối rằng có một kho ở đó,
 * mà ở chương 1 thì `origin` chưa tồn tại.
 */
function blockOf(
  layout: SceneLayout | null,
  repo: SceneRepo,
  localLaneCount: number,
): BlockBox | null {
  if (layout === null || layout.laneCount <= 0 || layout.depthCount <= 0) return null;

  const padX = X_STEP * PAD_RATIO;
  const padZ = Z_STEP * PAD_RATIO;
  // `depth` chạy 0..depthCount-1 và `lane` chạy 0..laneCount-1 — đó là hợp đồng
  // của `SceneLayout`, và `place3d()` đặt node đúng theo hai khoảng đó.
  const lastLane = layout.laneCount - 1;
  // Làn đầu và làn cuối qua `laneZ()`, không qua công thức chép tay.
  const nearZ = laneZ(repo, 0, localLaneCount);
  const farZ = laneZ(repo, lastLane, localLaneCount);
  // `MAIN_LANE` là 0, nên bậc lệch lớn nhất mà khối này chứa được chính là
  // `lastLane`. Dùng `deviationY()` chứ không nhân `Y_STEP` tay: chiều Y có
  // nghĩa và công thức của nó thuộc hợp đồng.
  const ceilingY = deviationY(lastLane) + NODE_RADIUS + POST_HEADROOM;

  return {
    repo,
    minX: -padX,
    maxX: (layout.depthCount - 1) * X_STEP + padX,
    minZ: Math.min(nearZ, farZ) - padZ,
    maxZ: Math.max(nearZ, farZ) + padZ,
    topY: FLOOR_Y + Math.max(POST_MIN_HEIGHT, ceilingY - FLOOR_Y),
  };
}

/** Bốn góc nền, theo chiều kim đồng hồ nhìn từ trên xuống. */
function corners(box: BlockBox): readonly Vec3[] {
  return [
    [box.minX, FLOOR_Y, box.minZ],
    [box.maxX, FLOOR_Y, box.minZ],
    [box.maxX, FLOOR_Y, box.maxZ],
    [box.minX, FLOOR_Y, box.maxZ],
  ];
}

/**
 * Gộp nền của MỌI khối vào một `BufferGeometry` — một lệnh vẽ, không phải một
 * lệnh cho mỗi kho. Cùng lý do đã ghi ở đầu `lane-edges.tsx`: trần AC-7 là trần
 * của cả cảnh, và mỗi tầng phải tự giữ phần của mình cho nhỏ.
 */
function buildFloors(boxes: readonly BlockBox[]): THREE.BufferGeometry {
  const position: number[] = [];
  const index: number[] = [];
  for (const box of boxes) {
    const base = position.length / 3;
    for (const c of corners(box)) position.push(c[0], c[1], c[2]);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(position.length > 0 ? position : [0, 0, 0]), 3),
  );
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Đường bao nền + bốn cột góc, cho MỌI khối, trong một mảng đoạn duy nhất. */
function buildOutline(boxes: readonly BlockBox[]): number[] {
  const out: number[] = [];
  for (const box of boxes) {
    const ring = corners(box);
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i] as Vec3;
      const b = ring[(i + 1) % ring.length] as Vec3;
      out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      // Cột góc: mở nóc là có chủ ý — một hộp kín sẽ có hai cạnh trên chạy
      // ngang qua trước mặt đồ thị ở mọi góc camera.
      out.push(a[0], a[1], a[2], a[0], box.topY, a[2]);
    }
  }
  return out.every((n) => Number.isFinite(n)) ? out : [];
}

/**
 * Nhãn tên kho, vẽ lên canvas rồi dán làm texture.
 *
 * Vì sao canvas chứ không phải `troika-three-text` hay `drei <Html>`: `troika`
 * chưa có trong repo và cổng `bundle:check` đang gác; còn `<Html>` thì §3 của
 * plan đã chốt là không dùng (nó bị ẩn khi có postprocessing, và arena né được
 * đúng vì không dùng nó). Canvas không thêm một phụ thuộc nào.
 *
 * ⚠ Nhãn này là CHỮ TRÊN TEXTURE, trình đọc màn hình không thấy. Nó không thay
 * được nhãn DOM của AC-6 — đó là việc của lane D. Ở đây nó là nhãn thị giác cho
 * người nhìn được màn hình, và cây DOM song song vẫn phải nói cùng nội dung.
 */
function drawLabel(text: string, cssColor: string): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_CANVAS.width * scale;
  canvas.height = LABEL_CANVAS.height * scale;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;

  ctx.scale(scale, scale);
  // Dấu tiếng Việt: để `Be Vietnam Pro` / `Noto Sans` lên đầu, `system-ui` đỡ
  // phía sau. Canvas không chờ webfont tải xong, nên lớp đỡ phải là một họ chắc
  // chắn dựng được dấu — không phải một họ chỉ có Latin cơ bản.
  ctx.font = `600 34px 'Be Vietnam Pro', 'Noto Sans', system-ui, sans-serif`;
  ctx.fillStyle = cssColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 4, LABEL_CANVAS.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export interface RepoBlocksProps extends Scene3DLayerProps {
  readonly colors: GitSceneThreeColors;
  /** Đổi mỗi lần token được đọc lại. Nhãn phải được VẼ LẠI, không chỉ đổi màu. */
  readonly colorsVersion: number;
}

export function RepoBlocks({
  placement,
  view,
  layouts,
  colors,
  colorsVersion,
}: RepoBlocksProps): ReactElement {
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);

  const boxes = useMemo(() => {
    const out: BlockBox[] = [];
    const local = blockOf(layouts.local, 'local', placement.localLaneCount);
    if (local !== null) out.push(local);
    /*
     * Khối `origin` cần CẢ HAI điều kiện. `view.hasOrigin` là ý định của level
     * (chương 1 chạy một kho), còn `layouts.origin` là thứ thật sự có bố cục —
     * `buildSceneLayouts()` trả `null` cho nó đúng khi `hasOrigin` sai, nhưng
     * đọc cả hai thì lớp này không phụ thuộc vào việc bất biến đó còn đúng.
     */
    if (view.hasOrigin) {
      const origin = blockOf(layouts.origin, 'origin', placement.localLaneCount);
      if (origin !== null) out.push(origin);
    }
    return out;
  }, [layouts.local, layouts.origin, placement.localLaneCount, view.hasOrigin]);

  const floors = useMemo(() => {
    const geometry = buildFloors(boxes);
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.6,
      toneMapped: false,
      fog: false,
      side: THREE.DoubleSide,
      // Không ghi chiều sâu: tấm nền không bao giờ được che một ô commit, kể cả
      // ở góc camera nhìn từ dưới lên.
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 0;
    mesh.visible = boxes.length > 0;
    return { geometry, material, mesh };
  }, [boxes]);

  const outline = useMemo(() => {
    const points = buildOutline(boxes);
    const geometry = new LineSegmentsGeometry();
    if (points.length > 0) geometry.setPositions(new Float32Array(points));
    const material = new LineMaterial({
      linewidth: OUTLINE_PX,
      transparent: true,
      toneMapped: false,
      fog: false,
      alphaToCoverage: true,
      depthWrite: false,
    });
    const lines = new LineSegments2(geometry, material);
    lines.frustumCulled = false;
    lines.renderOrder = 1;
    lines.visible = points.length > 0;
    return { geometry, material, lines };
  }, [boxes]);

  const labels = useMemo(() => {
    const stroke = colors['--muted-foreground'];
    // `getStyle()` cho một chuỗi `rgb()` tính lúc chạy, không phải một hằng màu
    // trong mã nguồn — cổng `check-design-tokens` quét mã nguồn, và ở đây không
    // có giá trị màu nào được viết ra.
    const css = stroke === undefined ? 'rgb(128, 128, 128)' : stroke.getStyle(THREE.SRGBColorSpace);
    const height = (LABEL_WORLD_WIDTH * LABEL_CANVAS.height) / LABEL_CANVAS.width;
    return boxes.flatMap((box) => {
      const texture = drawLabel(REPO_LABEL[box.repo], css);
      if (texture === null) return [];
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        toneMapped: false,
        fog: false,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(LABEL_WORLD_WIDTH, height, 1);
      // Đặt ở đầu khối theo trục X (mốc thời gian sớm nhất) và giữa theo Z: đó
      // là chỗ mắt bắt đầu đọc một dòng lịch sử chạy từ trái sang phải.
      sprite.position.set(box.minX, box.topY + height * 0.6, (box.minZ + box.maxZ) / 2);
      sprite.renderOrder = 4;
      return [{ texture, material, sprite }];
    });
    // `colorsVersion` là dep THẬT: nhãn là chữ đã nướng vào texture, nên đổi
    // theme phải VẼ LẠI canvas — đổi màu vật liệu không chạm được vào nó.
  }, [boxes, colors, colorsVersion]);

  useEffect(
    () => () => {
      floors.geometry.dispose();
      floors.material.dispose();
      outline.geometry.dispose();
      outline.material.dispose();
      for (const label of labels) {
        label.texture.dispose();
        label.material.dispose();
      }
    },
    [floors, outline, labels],
  );

  /*
   * Màu: gán THAM CHIẾU dùng chung, không `.clone()`. Hook sửa `THREE.Color` tại
   * chỗ khi đổi theme, nên vật liệu giữ tham chiếu là vật liệu đổi theo — còn
   * một bản sao thì đứng yên ở màu cũ, và không lỗi nào được ném ra.
   */
  useEffect(() => {
    const fill = colors['--muted'];
    const stroke = colors['--muted-foreground'];
    if (fill !== undefined) floors.material.color = fill;
    if (stroke !== undefined) {
      outline.material.color = stroke;
      outline.material.uniformsNeedUpdate = true;
    }
    invalidate();
  }, [floors, outline, colors, colorsVersion, invalidate]);

  /*
   * ⚠ Bề dày của `LineSegments2` tính TRONG SHADER từ `resolution`. Thiếu bước
   * này thì đường bao dày đúng ở một cỡ cửa sổ và sai ở mọi cỡ khác.
   */
  useEffect(() => {
    outline.lines.onBeforeRender = (): void => {
      outline.material.resolution.set(size.width, size.height);
    };
    outline.material.resolution.set(size.width, size.height);
    invalidate();
  }, [outline, size, invalidate]);

  return (
    <>
      <primitive object={floors.mesh} />
      <primitive object={outline.lines} />
      {labels.map((label) => (
        <primitive key={label.sprite.uuid} object={label.sprite} />
      ))}
    </>
  );
}
