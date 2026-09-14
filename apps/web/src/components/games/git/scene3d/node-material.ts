import * as THREE from 'three';

/**
 * Vật liệu của tầng commit 3D (17.K.10): rim light fresnel + bảng ký hiệu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ FILE NÀY KHÔNG ĐỌC TOKEN MÀU — ĐÓ LÀ VIỆC CỦA `use-git-scene-colors.ts`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cầu nối token CSS → `THREE.Color` do lead sở hữu (`e369df7`). Nó đã xử lý ba
 * chỗ dễ sai — `oklch()` không qua được `setStyle`, computed value vẫn có thể là
 * `oklch()` nên phải đọc byte từ canvas, và `SRGBColorSpace` khi `setRGB` — nên
 * mọi hàm ở đây **nhận `THREE.Color` vào**, không tự dựng màu.
 *
 * ⚠ **Giữ THAM CHIẾU, không `.clone()`.** Bảng màu kia sửa `THREE.Color` TẠI
 * CHỖ khi theme đổi. Một `.clone()` ở đây tạo bản sao đứng yên: bật chế độ tối
 * thì cả cảnh đổi màu trừ đúng viền rim, và **không lỗi nào được ném**.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO RIM NẰM TRONG VẬT LIỆU, KHÔNG PHẢI MỘT `Outline` PASS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hiệu ứng `Outline` của `postprocessing` nhận một danh sách `Object3D`. Commit
 * của ta KHÔNG phải `Object3D` riêng — chúng là instance bên trong một
 * `InstancedMesh`, và cả lô chỉ là MỘT object với hiệu ứng đó. Chọn một commit
 * sẽ tô viền toàn bộ commit cùng khối hình. Arena đã gặp đúng chuyện này
 * (`k8s-arena/scene/selection-halo.tsx` § "Vì sao KHÔNG dùng hiệu ứng Outline").
 *
 * Arena giải bằng một lớp VỎ hình học phóng to. Ở đây làm khác, và rẻ hơn: rim
 * là một phép cộng trong chính fragment shader của thân, lái bằng một **instance
 * attribute** `aRim`. Không mesh phụ, không lệnh vẽ phụ, và đúng instance —
 * `aRim` là per-instance nên một commit sáng viền còn 200 commit kia thì không.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Thân commit — MeshStandardMaterial + fresnel rim per-instance
// ═══════════════════════════════════════════════════════════════════════════

/** Tên instance attribute lái cường độ rim. Hình học phải khai đúng tên này. */
export const RIM_ATTRIBUTE = 'aRim';

export interface NodeMaterialHandle {
  readonly material: THREE.MeshStandardMaterial;
  /** Số mũ fresnel. Cao ⇒ viền mảnh và gắt; thấp ⇒ cả mặt ánh lên. */
  readonly rimPower: { value: number };
}

/**
 * Vật liệu thân commit.
 *
 * @param rimColor **Tham chiếu** tới `THREE.Color` của bảng màu. Đổi theme làm
 *   giá trị bên trong đổi và uniform được nạp lại theo — không cần dựng lại
 *   vật liệu, không cần `version` làm dep.
 */
export function createNodeMaterial(rimColor: THREE.Color): NodeMaterialHandle {
  const rimPower = { value: 2.6 };
  const uniforms = {
    uRimColor: { value: rimColor },
    uRimPower: rimPower,
  };

  const material = new THREE.MeshStandardMaterial({
    // `instanceColor` mang màu accent, còn `color` của đỉnh mang sắc độ của từng
    // phần trong một khối ghép (vòng của `ringed` tối hơn thân). Three NHÂN hai
    // thứ đó, nên một khối ghép vẫn chỉ tốn một lô.
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.15,
    envMapIntensity: 0.7,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    /*
     * `attribute` / `varying` viết theo cú pháp GLSL1 là ĐÚNG kể cả trên WebGL2:
     * three chèn `#define attribute in` / `#define varying out` vào tiền tố
     * shader trước mã này (`WebGLProgram.js`, nhánh không phải RawShaderMaterial).
     * Đổi sang `in`/`out` bằng tay sẽ hỏng trên WebGL1 mà không hỏng ở đây.
     */
    shader.vertexShader =
      `attribute float ${RIM_ATTRIBUTE};\nvarying float vRim;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `vRim = ${RIM_ATTRIBUTE};\n#include <begin_vertex>`,
      );

    /*
     * Chèn TRƯỚC `<opaque_fragment>`, không phải trước `<dithering_fragment>`.
     *
     * Đây là một quyết định có lý do đọc được từ chính mã three 0.185.1
     * (`ShaderLib/meshphysical.glsl.js`, dòng 216–221): thứ tự cuối `main()` là
     * `opaque_fragment` → `tonemapping_fragment` → `colorspace_fragment` → … →
     * `dithering_fragment`. Cộng vào SAU `colorspace_fragment` nghĩa là cộng một
     * giá trị LINEAR lên một fragment đã mã hoá sRGB — viền sẽ cháy sáng và
     * không theo tone mapping của cảnh. Cộng vào `outgoingLight` trước
     * `opaque_fragment` thì rim đi qua đúng đường như mọi ánh sáng khác.
     *
     * `normal` (pháp tuyến trong không gian view, do `<normal_fragment_begin>`
     * khai) và `vViewPosition` (varying, `= -mvPosition.xyz` tức hướng từ điểm
     * này về camera) đều còn trong tầm ở điểm chèn. `saturate()` đến từ
     * `<common>`.
     */
    shader.fragmentShader =
      `varying float vRim;\nuniform vec3 uRimColor;\nuniform float uRimPower;\n${shader.fragmentShader}`.replace(
        '#include <opaque_fragment>',
        [
          'float rimFacing = 1.0 - saturate( dot( normalize( vViewPosition ), normal ) );',
          'outgoingLight += uRimColor * pow( rimFacing, uRimPower ) * vRim;',
          '#include <opaque_fragment>',
        ].join('\n'),
      );
  };

  return { material, rimPower };
}

/**
 * Gắn attribute `aRim` vào một hình học dùng cho `InstancedMesh`.
 *
 * Phải gọi cho MỌI hình học đi cùng `createNodeMaterial()`. Thiếu nó thì WebGL
 * để attribute ở giá trị mặc định 0 — tức không có viền nào, im lặng, và triệu
 * chứng ("chọn commit mà không thấy gì sáng lên") không hề chỉ về hình học.
 */
export function attachRimAttribute(
  geometry: THREE.BufferGeometry,
  capacity: number,
): THREE.InstancedBufferAttribute {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute(RIM_ATTRIBUTE, attribute);
  return attribute;
}

// ═══════════════════════════════════════════════════════════════════════════
// Bảng ký hiệu (sigil) — MỘT texture atlas, MỘT lệnh vẽ
// ═══════════════════════════════════════════════════════════════════════════

/** Tên instance attribute chọn ô atlas. */
export const SIGIL_CELL_ATTRIBUTE = 'aCell';

/** Cạnh một ô atlas, pixel. 64 đủ nét ở mọi cỡ mà sigil xuất hiện trên màn hình. */
const CELL_PX = 64;

export interface SigilAtlas {
  readonly texture: THREE.Texture;
  readonly cells: number;
}

/**
 * Vẽ các ký hiệu thành MỘT dải ngang, mỗi ký hiệu một ô.
 *
 * ⚠ Vẽ bằng **màu trắng**, không bằng màu của accent. Màu thật đến từ
 * `instanceColor` và được NHÂN trong fragment shader, nên một atlas duy nhất
 * phục vụ cả sáu accent ở mọi theme. Vẽ sẵn màu vào atlas sẽ cần dựng lại
 * texture mỗi lần đổi theme — một việc tốn kém và dễ quên.
 *
 * `'white'` là từ khoá CSS, không phải hex: cổng `check-design-tokens` cấm
 * `#hex` / `0xRRGGBB` trong mã chạy được, và ở đây trắng KHÔNG phải một lựa chọn
 * màu mà là phần tử đơn vị của phép nhân.
 *
 * Trả `null` khi không có canvas 2D (SSR, hoặc trình duyệt chặn canvas). Bên gọi
 * bỏ hẳn lớp sigil — mất một kênh a11y nhưng cảnh vẫn chạy.
 */
export function createSigilAtlas(glyphs: readonly string[]): SigilAtlas | null {
  if (typeof document === 'undefined') return null;

  let ctx: CanvasRenderingContext2D | null = null;
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, glyphs.length) * CELL_PX;
    canvas.height = CELL_PX;
    ctx = canvas.getContext('2d');
  } catch {
    return null;
  }
  if (ctx === null) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Chữ nằm gọn trong 40/64 của ô: viền còn dư để phép lọc tuyến tính không kéo
  // pixel của ô bên cạnh vào (bleed), mà không cần chia ô thành hai hàng đệm.
  ctx.font = `bold ${String(Math.round(CELL_PX * 0.62))}px ui-monospace, monospace`;
  glyphs.forEach((glyph, index) => {
    if (glyph === '') return;
    ctx.fillText(glyph, index * CELL_PX + CELL_PX / 2, CELL_PX / 2 + 2);
  });

  const texture = new THREE.CanvasTexture(canvas);
  // Atlas vẽ bằng màu sRGB; khai đúng để three chuyển sang linear lúc lấy mẫu,
  // nếu không phép nhân với `instanceColor` (đã linear) lệch không gian.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // Không mipmap: dải ngang N×1 ô, mipmap sẽ trộn các ô vào nhau ở mức thấp.
  texture.generateMipmaps = false;
  return { texture, cells: glyphs.length };
}

/**
 * Vật liệu sigil: billboard hướng camera, chọn ô atlas theo instance.
 *
 * ⛔ KHÔNG dùng `drei/<Text>` hay một mesh chữ cho mỗi commit — đó là một lệnh
 * vẽ mỗi commit, và K.4 đặt trần 100 lệnh vẽ cho cả cảnh. Một `InstancedMesh`
 * phẳng + atlas cho ra ĐÚNG MỘT lệnh vẽ dù có bao nhiêu commit.
 *
 * `ShaderMaterial` (không phải `RawShaderMaterial`) là chủ ý: three chỉ chèn
 * `attribute mat4 instanceMatrix` / `attribute vec3 instanceColor` vào tiền tố
 * khi vật liệu KHÔNG phải raw (`WebGLProgram.js` — nhánh `isRawShaderMaterial`
 * cắt hết tiền tố đó). Đổi sang raw là mất instancing mà không có thông báo nào.
 */
export function createSigilMaterial(atlas: SigilAtlas): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlas.texture },
      uCells: { value: Math.max(1, atlas.cells) },
    },
    vertexShader: `
      attribute float ${SIGIL_CELL_ATTRIBUTE};
      uniform float uCells;
      varying vec2 vAtlasUv;
      varying vec3 vTint;
      void main() {
        vAtlasUv = vec2( ( uv.x + ${SIGIL_CELL_ATTRIBUTE} ) / uCells, uv.y );
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #else
          vTint = vec3( 1.0 );
        #endif
        /*
         * Billboard: lấy TÂM của instance trong không gian view rồi cộng offset
         * của mặt phẳng theo hai trục màn hình. Nhờ vậy ký hiệu luôn quay thẳng
         * về camera — một sigil xoay nghiêng theo khối là một sigil không đọc
         * được, mà đây là kênh a11y mạnh nhất của bảng màu.
         *
         * Cỡ lấy từ chính ma trận instance (độ dài cột đầu) thay vì một uniform
         * riêng: chỉ một nguồn kích thước thì không có gì để trôi.
         *
         * ⚠ KHÔNG đặt dấu backtick trong khối này — đây là một template literal
         * của TypeScript, nên một backtick trong chú thích GLSL sẽ ĐÓNG chuỗi.
         * Đã dính thật ở lượt viết đầu: tsc báo mười lỗi TS1005 và, vì lỗi cú
         * pháp làm nó bỏ hẳn pha ngữ nghĩa, nó GIẤU mọi lỗi kiểu còn lại.
         */
        float size = length( instanceMatrix[ 0 ].xyz );
        vec4 center = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
        center.xy += position.xy * size;
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: `
      uniform sampler2D uAtlas;
      varying vec2 vAtlasUv;
      varying vec3 vTint;
      void main() {
        vec4 texel = texture2D( uAtlas, vAtlasUv );
        // Vứt hẳn pixel gần trong suốt thay vì pha: ô của accent normal rỗng
        // hoàn toàn, và một lớp alpha ~0 vẫn ghi chiều sâu thì nó che mất thân
        // commit phía sau.
        if ( texel.a < 0.05 ) discard;
        gl_FragColor = vec4( vTint * texel.rgb, texel.a );
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    // Ký hiệu là CHỮ, không phải vật thể có ánh sáng — tone mapping làm nó xám
    // đi theo độ sáng cảnh và mất đúng độ tương phản đã đo.
    toneMapped: false,
  });
}
