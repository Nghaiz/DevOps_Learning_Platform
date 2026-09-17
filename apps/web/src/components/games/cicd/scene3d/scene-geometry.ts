/**
 * Hình khối và vật liệu của cảnh 3D. **Chạm `three` — nằm sau barrel.**
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VIỀN SÁNG LÀM TRONG VẬT LIỆU, KHÔNG LÀM BẰNG MỘT PASS HẬU KỲ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kế hoạch D.3.6 đòi "rim light fresnel trong material (0 pass)". Lý do không
 * phải là tiết kiệm — nó là một ràng buộc cứng của cảnh này:
 *
 * `k8s-arena/scene/selection-halo.tsx` đã ghi lại tại sao hiệu ứng `Outline` của
 * hậu kỳ KHÔNG dùng được với `InstancedMesh`: nó nhận một danh sách `Object3D`,
 * mà mỗi node của ta là một *instance* bên trong một object. Chọn một node sẽ tô
 * viền cả lô. Điều đó đúng y hệt với `SelectiveBloom` — nên **bloom chọn lọc cho
 * riêng `running` là thứ lane này KHÔNG dựng được bằng `@react-three/post-
 * processing`**, và bản này thay nó bằng một lớp vỏ phát sáng cộng dồn (một lô
 * instanced, MỘT lệnh vẽ). Xem `createGlowMaterial`.
 *
 * Viền chọn/rê thì làm bằng fresnel vá thẳng vào shader chuẩn, qua một thuộc
 * tính instanced `aRim`. Không thêm một lệnh vẽ nào, và nó chọn đúng từng
 * instance — điều mà mọi đường hậu kỳ đều không làm được ở đây.
 *
 * ⚠ **Bản vá shader này bám vào cấu trúc chunk của `meshphysical` trong three
 * 0.185.1** (`package.json` ghim đúng số đó, không phải `^`). Nếu nâng `three`,
 * kiểm lại hai mốc `#include <common>` và `#include <emissivemap_fragment>` còn
 * đúng chỗ không. Mốc không khớp thì `applyRimPatch` KHÔNG âm thầm bỏ qua — nó
 * ghi `console.error` và tắt hẳn viền, để lỗi hiện ra thành một câu chứ không
 * thành "viền tự dưng biến mất".
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { NODE_HALF } from './scene-3d-math';
import { RIM_ATTRIBUTE, RIM_UNIFORM, patchRimShaders } from './rim-shader';
import { SKIPPED_OPACITY, SUNKEN_HEIGHT, type BodyStyle } from './node-visuals';

const W = NODE_HALF.x * 2;
const H = NODE_HALF.y * 2;
const D = NODE_HALF.z * 2;

/** Bề dày thanh của khung rỗng (`outline`). Đủ mảnh để đọc ra là khung, đủ dày để thấy. */
const FRAME_BAR = 0.055;

function rounded(w: number, h: number, d: number, segments: number): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, Math.max(1, segments), Math.min(w, h, d) * 0.18);
}

/**
 * Khung hộp rỗng: bốn thanh dọc mỗi mặt, tổng 12 thanh, gộp thành MỘT hình.
 *
 * Gộp chứ không dựng 12 mesh: cả khung phải là một `BufferGeometry` để còn nhét
 * được vào một `InstancedMesh`. Mười hai mesh riêng là mười hai lệnh vẽ cho mỗi
 * node, và đó là đúng con đường làm ô AC-D4 đỏ.
 */
function createFrameGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bar = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.translate(x, y, z);
    parts.push(geometry);
  };
  for (const y of [-NODE_HALF.y, NODE_HALF.y]) {
    for (const z of [-NODE_HALF.z, NODE_HALF.z]) {
      bar(W, FRAME_BAR, FRAME_BAR, 0, y, z);
    }
    for (const x of [-NODE_HALF.x, NODE_HALF.x]) {
      bar(FRAME_BAR, FRAME_BAR, D, x, y, 0);
    }
  }
  for (const x of [-NODE_HALF.x, NODE_HALF.x]) {
    for (const z of [-NODE_HALF.z, NODE_HALF.z]) {
      bar(FRAME_BAR, H, FRAME_BAR, x, 0, z);
    }
  }
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (merged === null) {
    throw new Error('Không gộp được khung hộp rỗng cho node CI/CD');
  }
  return merged;
}

/**
 * Hộp khuyết một góc: hộp đầy trừ đi một phần tám ở góc `+x +y +z`.
 *
 * Ghép từ ba khối thay vì trừ hình, vì three không có phép trừ khối. Ba khối
 * ghép lại đúng bằng hộp đầy trừ một octant, nên vết khuyết là vết THẬT chứ
 * không phải một mặt tối vẽ giả — nó còn nguyên khi nhìn từ mọi góc camera, và
 * đó là điều kiện để nó gánh được vai trò "kênh hình học" của `failed`.
 */
function createNotchedGeometry(segments: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const push = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
    const geometry = rounded(w, h, d, segments);
    geometry.translate(x, y, z);
    parts.push(geometry);
  };
  push(W, H / 2, D, 0, -H / 4, 0);
  push(W / 2, H / 2, D, -W / 4, H / 4, 0);
  push(W / 2, H / 2, D / 2, W / 4, H / 4, -D / 4);
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (merged === null) {
    throw new Error('Không gộp được hộp khuyết góc cho node CI/CD');
  }
  return merged;
}

/**
 * Hình của một kiểu thân.
 *
 * `sunken` lùn hơn và được đặt chìm (`SUNKEN_DROP` ở `node-visuals.ts`): khối
 * thấp nằm dưới mặt tầng đọc ra ngay là "đang bị giữ lại", và nó vẫn còn đủ mặt
 * trên để bắt màu `--warning`.
 */
export function createBodyGeometry(style: BodyStyle, segments: number): THREE.BufferGeometry {
  switch (style) {
    case 'frame':
      return createFrameGeometry();
    case 'notched':
      return createNotchedGeometry(segments);
    case 'sunken':
      return rounded(W, H * SUNKEN_HEIGHT, D, segments);
    case 'ghost':
    case 'solid':
    default:
      return rounded(W, H, D, segments);
  }
}

/** Vành quanh trục Y của `ringed` / `ringed-double`. Nằm ngang, ôm lấy khối. */
export function createRingGeometry(index: 0 | 1, segments: number): THREE.BufferGeometry {
  const radius = NODE_HALF.x * (index === 0 ? 1.18 : 1.42);
  return new THREE.TorusGeometry(radius, 0.022, Math.max(4, segments * 2), 28).rotateX(
    Math.PI / 2,
  );
}

export { RIM_ATTRIBUTE } from './rim-shader';

/**
 * Vật liệu thân có viền sáng fresnel theo từng instance.
 *
 * `rimColor` là một `THREE.Color` do bên gọi giữ: uniform trỏ THẲNG vào chính
 * object đó, nên đổi màu theo theme chỉ cần ghi vào nó, không phải biên dịch lại
 * shader. Biên dịch lại shader giữa lượt chơi là một khựng hình nhìn thấy được.
 */
export interface BodyMaterialOptions {
  readonly style: BodyStyle;
  readonly rimColor: THREE.Color;
  /** Nền đang tối hay sáng — quyết định `ghost` vẽ khung dây hay đặc mờ. */
  readonly darkBackground: boolean;
}

export function createBodyMaterial(options: BodyMaterialOptions): THREE.MeshStandardMaterial {
  const ghost = options.style === 'ghost';
  const material = new THREE.MeshStandardMaterial({
    roughness: options.style === 'frame' ? 0.5 : 0.38,
    metalness: options.style === 'frame' ? 0.35 : 0.22,
    /*
     * ⚠ Theme sáng KHÔNG phải theme tối đảo ngược (`scene-encoding.ts`). Khung
     * dây rỗng cho `skipped` gần như biến mất trên nền trắng, nên nền sáng dùng
     * khối ĐẶC MỜ thay vì khung dây. Quyết định đọc từ chính màu `--background`
     * đã phân giải, không đọc lớp CSS `.dark` — xem `isDarkBackground`.
     */
    wireframe: ghost && options.darkBackground,
    transparent: ghost && !options.darkBackground,
    opacity: ghost && !options.darkBackground ? SKIPPED_OPACITY : 1,
  });
  applyRimPatch(material, options.rimColor);
  return material;
}

/**
 * Vá fresnel vào shader chuẩn.
 *
 * Phép vá và phép TỰ KIỂM nằm ở `rim-shader.ts` (thuần chuỗi, test được ở env
 * `node`); ở đây chỉ còn việc nối nó vào vật liệu và xử lý ca từ chối.
 *
 * ⚠ Bản đầu của hàm này vá xong rồi mới hỏng, và hỏng ở tầng GLSL nên không lời
 * cảnh báo nào của nó chạm tới được: fragment shader dùng `uRimColor` và
 * `vRimAmount` mà không khai cái nào, chương trình hỏng, **mọi node biến mất ở
 * cả hai theme** trong khi bộ đếm draw call vẫn khoẻ. Đo 2026-09-17. Đừng gộp
 * phép vá trở lại vào file này — tách ra mới test được.
 */
export function applyRimPatch(material: THREE.MeshStandardMaterial, rimColor: THREE.Color): void {
  material.onBeforeCompile = (shader): void => {
    const result = patchRimShaders(shader.vertexShader, shader.fragmentShader);
    if (!result.ok) {
      /*
       * Giữ NGUYÊN shader gốc. Cảnh chạy tiếp, chỉ mất viền chọn/rê — còn vá một
       * nửa rồi hỏng thì mất TOÀN BỘ node, và mất im lặng (xem `rim-shader.ts`).
       */
      console.error(
        `[cicd-scene-3d] Không vá được viền sáng (${result.reason}). ` +
          'Cảnh vẫn chạy, viền chọn/rê bị tắt.',
      );
      return;
    }
    shader.uniforms[RIM_UNIFORM] = { value: rimColor };
    shader.vertexShader = result.vertexShader;
    shader.fragmentShader = result.fragmentShader;
  };
  material.customProgramCacheKey = (): string => `cicd-rim-${RIM_ATTRIBUTE}`;
}

/**
 * Vật liệu của LỚP VỎ PHÁT SÁNG quanh node đang chạy.
 *
 * Đây là thứ thay cho selective bloom, và nó chỉ tô MẶT SAU: mặt trước bị chính
 * khối che, nên phần còn nhìn thấy đúng là một quầng ôm lấy đường bao — một
 * viền, không phải một khối phủ lên vật. Khuôn lấy từ
 * `k8s-arena/scene/selection-halo.tsx`, nơi nó đã đứng qua một chặng.
 */
export function createGlowMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
    toneMapped: false,
  });
}

/** Vật liệu vành. `toneMapped: false` để vành giữ đúng màu token, không bị ép sáng. */
export function createRingMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    toneMapped: false,
  });
}

/**
 * Dựng một `InstancedMesh` đã chỉnh sẵn cho vòng lặp vẽ.
 *
 * `frustumCulled = false` vì ma trận instance được ghi bằng tay: hình cầu bao
 * của three tính theo hình gốc và không biết gì về chỗ các instance thật sự
 * đứng, nên để nó bật là thỉnh thoảng cả lô biến mất khi camera xoay.
 */
export function createInstancedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  capacity: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

/**
 * Gắn thuộc tính `aRim` vào một hình để mỗi instance mang độ mạnh viền riêng.
 *
 * Trả chính mảng đệm để vòng lặp vẽ ghi thẳng vào, khỏi cấp phát mỗi khung hình.
 */
export function attachRimAttribute(
  geometry: THREE.BufferGeometry,
  capacity: number,
): THREE.InstancedBufferAttribute {
  const attribute = new THREE.InstancedBufferAttribute(
    new Float32Array(Math.max(1, capacity)),
    1,
  );
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute(RIM_ATTRIBUTE, attribute);
  return attribute;
}

/** Dung lượng lô: luỹ thừa 2 gần nhất, để việc cấp lại bộ đệm hiếm khi xảy ra. */
export function batchCapacity(count: number): number {
  return count <= 1 ? 1 : 2 ** Math.ceil(Math.log2(count));
}
