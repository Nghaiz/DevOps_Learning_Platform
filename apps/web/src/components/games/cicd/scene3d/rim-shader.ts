/**
 * Bản vá GLSL cho viền sáng fresnel — **thuần chuỗi, không `three`** (19.D.3.6).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO TÁCH RA KHỎI `scene-geometry.ts`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Vì bản đầu SAI, và sai theo đúng kiểu không cổng nào bắt được.
 *
 * Bản đầu chèn vào fragment shader một khối dùng `uRimColor` và `vRimAmount`
 * nhưng **không khai báo cái nào trong chính fragment shader đó**:
 *
 * - `shader.uniforms.uRimColor = { value }` đăng ký uniform với hệ uniform của
 *   three. Nó **không** sinh ra dòng `uniform vec3 uRimColor;` trong GLSL.
 * - `varying float vRimAmount;` chỉ được thêm vào **vertex** shader. Fragment
 *   shader là một đơn vị biên dịch KHÁC và phải tự khai lại varying của nó.
 *
 * Kết quả: fragment shader lỗi biên dịch, chương trình hỏng, và **mọi vật liệu
 * bị vá vẽ ra rỗng**. Đo được ngày 2026-09-17 ở `/games/cicd/cicd-c13-…`:
 * `__dlpCicdScene()` báo `calls: 4, triangles: 864` — tức 6 khung × 144 tam giác
 * ĐÃ được nộp đầy đủ — mà ảnh chụp cả hai theme không có lấy một khối node. Cạnh
 * thì hiện, vì cạnh dùng `LineBasicMaterial` không bị vá.
 *
 * Hai điều bản đầu làm sai ngoài bản thân GLSL:
 *
 * 1. **Bộ đếm không thể phát hiện chuyện này.** `frustumCulled = false` nên hình
 *    luôn được nộp, và `info.render` đếm thứ được NỘP chứ không đếm thứ hiện ra.
 *    Một con số khoẻ mạnh ở đây chứng minh đúng zero điều gì về việc có nhìn thấy
 *    không (`green-that-proves-nothing.md`).
 * 2. **Cổng "báo lỗi to" gác nhầm chỗ.** Nó kiểm mốc `#include` còn đúng không —
 *    một hỏng hóc chưa hề xảy ra — và cấu trúc của nó không cho phép bắt lỗi biên
 *    dịch GLSL, thứ đã xảy ra. Viết một cổng cho chế độ hỏng mình tưởng tượng ra
 *    mà bỏ trống chế độ hỏng thật là cách tệ nhất để tiêu công.
 *
 * Nên bản này: phép vá là **hàm thuần trên chuỗi**, nó **tự kiểm mình** trước khi
 * trả về, và `rim-shader.test.ts` chạy phép tự kiểm đó ở env `node` — không cần
 * WebGL, không cần trình duyệt. Ô test đó bắt được đúng con bug trên.
 *
 * ⚠ Bản vá bám cấu trúc chunk của `meshphysical` trong **three 0.185.1**
 * (`package.json` ghim chính xác, không `^`). Nâng `three` thì bốn mốc dưới đây
 * phải được kiểm lại.
 */

/** Thuộc tính instanced mang độ mạnh viền của từng node. */
export const RIM_ATTRIBUTE = 'aRim';
/** Varying chuyển độ mạnh đó từ vertex sang fragment. */
export const RIM_VARYING = 'vRimAmount';
/** Uniform màu viền. */
export const RIM_UNIFORM = 'uRimColor';

/** Nơi chèn KHAI BÁO — có mặt ở cả vertex lẫn fragment của mọi vật liệu three. */
export const RIM_DECLARE_ANCHOR = '#include <common>';
/** Nơi ghi varying trong vertex: sau khi `transformed` đã sẵn sàng. */
export const RIM_VERTEX_BODY_ANCHOR = '#include <begin_vertex>';
/**
 * Nơi cộng viền vào phát xạ trong fragment.
 *
 * Chọn mốc này vì tới đây `normal` (từ `<normal_fragment_begin>`) và
 * `totalEmissiveRadiance` đều đã có, còn `vViewPosition` là varying khai sẵn ở
 * đầu `meshphysical_frag`.
 */
export const RIM_FRAGMENT_BODY_ANCHOR = '#include <emissivemap_fragment>';

/** Mọi định danh bản vá đưa vào, kèm nơi nó phải được khai. */
const REQUIRED_DECLARATIONS = [
  { stage: 'vertex', name: RIM_ATTRIBUTE },
  { stage: 'vertex', name: RIM_VARYING },
  { stage: 'fragment', name: RIM_VARYING },
  { stage: 'fragment', name: RIM_UNIFORM },
] as const;

/**
 * Định danh này có được KHAI trong đoạn shader không.
 *
 * Nhận cả `attribute`/`varying` (GLSL ES 1.00) lẫn `in`/`out` (3.00): three thêm
 * `#define attribute in` ở tiền tố khi chạy WebGL2, nên mã nguồn viết theo lối
 * cũ vẫn hợp lệ — nhưng phép kiểm thì không được giả định lối nào.
 */
export function declaresIdentifier(source: string, name: string): boolean {
  return new RegExp(
    `\\b(?:attribute|varying|uniform|in|out)\\s+\\w+\\s+${name}\\b`,
    'm',
  ).test(source);
}

/** Định danh này có được DÙNG trong đoạn shader không. */
export function usesIdentifier(source: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`).test(source);
}

/**
 * Định danh nào được dùng mà không được khai, theo từng tầng shader.
 *
 * Đây là phép tự kiểm của bản vá, và là thứ duy nhất bắt được con bug 2026-09-17
 * mà không cần chạy WebGL. Trả mảng rỗng là sạch.
 */
export function undeclaredRimIdentifiers(
  vertexShader: string,
  fragmentShader: string,
): readonly string[] {
  const sources = { vertex: vertexShader, fragment: fragmentShader };
  const out: string[] = [];
  for (const required of REQUIRED_DECLARATIONS) {
    const source = sources[required.stage];
    if (usesIdentifier(source, required.name) && !declaresIdentifier(source, required.name)) {
      out.push(`${required.stage}:${required.name}`);
    }
  }
  return out;
}

export type RimPatch =
  | { readonly ok: true; readonly vertexShader: string; readonly fragmentShader: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Vá hai đoạn shader, rồi TỰ KIỂM trước khi trả về.
 *
 * `ok: false` nghĩa là **đừng dùng kết quả** — chỗ gọi giữ nguyên shader gốc, ghi
 * một dòng lỗi, và cảnh chạy tiếp không có viền. Đó mới là cái fallback mà khối
 * tài liệu bản đầu hứa: mất viền thì mất viền, chứ không mất cả cảnh.
 */
export function patchRimShaders(vertexShader: string, fragmentShader: string): RimPatch {
  for (const [stage, source, anchor] of [
    ['vertex', vertexShader, RIM_DECLARE_ANCHOR],
    ['vertex', vertexShader, RIM_VERTEX_BODY_ANCHOR],
    ['fragment', fragmentShader, RIM_DECLARE_ANCHOR],
    ['fragment', fragmentShader, RIM_FRAGMENT_BODY_ANCHOR],
  ] as const) {
    if (!source.includes(anchor)) {
      return { ok: false, reason: `thiếu mốc ${anchor} trong ${stage} shader` };
    }
  }

  const patchedVertex = vertexShader
    .replace(
      RIM_DECLARE_ANCHOR,
      `${RIM_DECLARE_ANCHOR}
attribute float ${RIM_ATTRIBUTE};
varying float ${RIM_VARYING};`,
    )
    .replace(
      RIM_VERTEX_BODY_ANCHOR,
      `${RIM_VERTEX_BODY_ANCHOR}
${RIM_VARYING} = ${RIM_ATTRIBUTE};`,
    );

  /*
   * ⛔ Fragment shader phải TỰ khai lại varying của nó. Nó là một đơn vị biên
   * dịch khác; khai ở vertex không với sang được. Và uniform cũng phải khai ở
   * đây — gán vào `shader.uniforms` chỉ nối giá trị vào hệ uniform của three,
   * nó không sinh ra một dòng GLSL nào.
   */
  const patchedFragment = fragmentShader
    .replace(
      RIM_DECLARE_ANCHOR,
      `${RIM_DECLARE_ANCHOR}
uniform vec3 ${RIM_UNIFORM};
varying float ${RIM_VARYING};`,
    )
    .replace(
      RIM_FRAGMENT_BODY_ANCHOR,
      `${RIM_FRAGMENT_BODY_ANCHOR}
{
  float rimFacing = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
  totalEmissiveRadiance += ${RIM_UNIFORM} * pow(rimFacing, 2.2) * ${RIM_VARYING} * 1.6;
}`,
    );

  const undeclared = undeclaredRimIdentifiers(patchedVertex, patchedFragment);
  if (undeclared.length > 0) {
    return { ok: false, reason: `định danh dùng mà chưa khai: ${undeclared.join(', ')}` };
  }
  return { ok: true, vertexShader: patchedVertex, fragmentShader: patchedFragment };
}
