/**
 * Ghim bản vá GLSL viền sáng — chạy ở env `node`, KHÔNG cần WebGL.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Ô ĐẦU TIÊN Ở ĐÂY LÀ Ô ĐÁNG LẼ PHẢI CÓ TỪ ĐẦU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bản vá đầu dùng `uRimColor` và `vRimAmount` trong fragment shader mà không
 * khai cái nào ở đó. Fragment lỗi biên dịch ⇒ chương trình hỏng ⇒ **mọi node
 * biến mất ở cả hai theme**, trong khi `__dlpCicdScene()` vẫn báo
 * `triangles: 864` khoẻ mạnh, vì bộ đếm đếm thứ được NỘP chứ không đếm thứ hiện
 * ra (và `frustumCulled = false` nên hình luôn được nộp).
 *
 * Cổng cũ chỉ kiểm "mốc `#include` còn đúng chỗ không" — một chế độ hỏng chưa hề
 * xảy ra — nên nó cấu trúc-học không thể bắt được chế độ hỏng đã xảy ra. Ô
 * `khai đủ mọi định danh` dưới đây là cổng thay thế, và nó ĐỎ trên bản vá cũ.
 *
 * Mẫu shader dưới đây chỉ giữ đúng những dòng bản vá dựa vào. Không chép cả
 * `meshphysical` thật: ô test sẽ biến thành một bản sao của three, và bản sao đó
 * trôi đi trong im lặng ở lần nâng phiên bản đầu tiên.
 */
import { describe, expect, it } from 'vitest';

import {
  RIM_ATTRIBUTE,
  RIM_DECLARE_ANCHOR,
  RIM_FRAGMENT_BODY_ANCHOR,
  RIM_UNIFORM,
  RIM_VARYING,
  RIM_VERTEX_BODY_ANCHOR,
  declaresIdentifier,
  patchRimShaders,
  undeclaredRimIdentifiers,
  usesIdentifier,
} from './rim-shader';

const VERTEX = `#define STANDARD
varying vec3 vViewPosition;
${RIM_DECLARE_ANCHOR}
void main() {
  ${RIM_VERTEX_BODY_ANCHOR}
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}`;

const FRAGMENT = `#define STANDARD
uniform vec3 emissive;
varying vec3 vViewPosition;
${RIM_DECLARE_ANCHOR}
void main() {
  vec3 totalEmissiveRadiance = emissive;
  #include <normal_fragment_begin>
  ${RIM_FRAGMENT_BODY_ANCHOR}
  gl_FragColor = vec4(totalEmissiveRadiance, 1.0);
}`;

function patched(): { vertexShader: string; fragmentShader: string } {
  const result = patchRimShaders(VERTEX, FRAGMENT);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return { vertexShader: result.vertexShader, fragmentShader: result.fragmentShader };
}

describe('patchRimShaders — tự kiểm khai báo', () => {
  /*
   * ⛔ ĐÂY LÀ Ô QUAN TRỌNG NHẤT CỦA CẢ FILE.
   *
   * Một tầng shader là một đơn vị biên dịch riêng: khai varying ở vertex KHÔNG
   * với sang fragment được, và gán `shader.uniforms.x` chỉ nối giá trị vào hệ
   * uniform của three chứ không sinh ra một dòng GLSL nào. Thiếu một trong hai
   * khai báo đó là cả cảnh biến mất — im lặng, và với bộ đếm vẫn khoẻ.
   */
  it('khai đủ mọi định danh ở đúng tầng shader dùng nó', () => {
    const { vertexShader, fragmentShader } = patched();

    expect(undeclaredRimIdentifiers(vertexShader, fragmentShader)).toEqual([]);
  });

  it('fragment shader TỰ khai varying và uniform của nó', () => {
    const { fragmentShader } = patched();

    expect(declaresIdentifier(fragmentShader, RIM_VARYING)).toBe(true);
    expect(declaresIdentifier(fragmentShader, RIM_UNIFORM)).toBe(true);
  });

  it('vertex shader khai thuộc tính instanced và varying', () => {
    const { vertexShader } = patched();

    expect(declaresIdentifier(vertexShader, RIM_ATTRIBUTE)).toBe(true);
    expect(declaresIdentifier(vertexShader, RIM_VARYING)).toBe(true);
  });

  it('vertex ghi varying, fragment đọc nó', () => {
    const { vertexShader, fragmentShader } = patched();

    expect(vertexShader).toContain(`${RIM_VARYING} = ${RIM_ATTRIBUTE};`);
    expect(usesIdentifier(fragmentShader, RIM_VARYING)).toBe(true);
  });

  it('không đụng tới `attribute` trong fragment — fragment không có attribute', () => {
    const { fragmentShader } = patched();

    expect(usesIdentifier(fragmentShader, RIM_ATTRIBUTE)).toBe(false);
  });
});

describe('undeclaredRimIdentifiers — đối chứng dương', () => {
  /*
   * Bản vá CŨ, dựng lại nguyên văn: fragment dùng cả hai định danh, không khai
   * cái nào. Phép kiểm phải ĐỎ ở đây. Không có ô này thì ô "khai đủ" ở trên chỉ
   * chứng minh rằng nó không kêu — chứ không chứng minh nó biết kêu.
   */
  it('BẮT được đúng con bug 2026-09-17: fragment dùng mà không khai', () => {
    const brokenVertex = `${RIM_DECLARE_ANCHOR}
attribute float ${RIM_ATTRIBUTE};
varying float ${RIM_VARYING};
void main() { ${RIM_VARYING} = ${RIM_ATTRIBUTE}; }`;
    const brokenFragment = `${RIM_DECLARE_ANCHOR}
void main() {
  totalEmissiveRadiance += ${RIM_UNIFORM} * ${RIM_VARYING};
}`;

    expect(undeclaredRimIdentifiers(brokenVertex, brokenFragment)).toEqual([
      `fragment:${RIM_VARYING}`,
      `fragment:${RIM_UNIFORM}`,
    ]);
  });

  it('BẮT được cả chiều ngược: vertex ghi varying mà quên khai', () => {
    const brokenVertex = `${RIM_DECLARE_ANCHOR}
attribute float ${RIM_ATTRIBUTE};
void main() { ${RIM_VARYING} = ${RIM_ATTRIBUTE}; }`;
    const okFragment = `${RIM_DECLARE_ANCHOR}
uniform vec3 ${RIM_UNIFORM};
varying float ${RIM_VARYING};
void main() { totalEmissiveRadiance += ${RIM_UNIFORM} * ${RIM_VARYING}; }`;

    expect(undeclaredRimIdentifiers(brokenVertex, okFragment)).toEqual([`vertex:${RIM_VARYING}`]);
  });

  it('không kêu oan khi shader không hề nhắc tới định danh nào', () => {
    expect(undeclaredRimIdentifiers('void main() {}', 'void main() {}')).toEqual([]);
  });
});

describe('patchRimShaders — từ chối khi mốc không còn', () => {
  /*
   * Từ chối chứ không vá bừa: chỗ gọi giữ nguyên shader gốc, nên mất viền chứ
   * KHÔNG mất cả cảnh. Đó là cái fallback mà bản đầu hứa nhưng không làm được —
   * nó vá xong rồi mới hỏng, và lúc đó không còn đường lui.
   */
  it('thiếu mốc khai báo ở vertex', () => {
    const result = patchRimShaders('void main() {}', FRAGMENT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(RIM_DECLARE_ANCHOR);
    }
  });

  it('thiếu mốc thân ở fragment', () => {
    const noBody = FRAGMENT.replace(RIM_FRAGMENT_BODY_ANCHOR, '');
    const result = patchRimShaders(VERTEX, noBody);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(RIM_FRAGMENT_BODY_ANCHOR);
    }
  });

  it('nêu TÊN mốc thiếu, không chỉ nói "hỏng"', () => {
    const result = patchRimShaders(VERTEX.replace(RIM_VERTEX_BODY_ANCHOR, ''), FRAGMENT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(RIM_VERTEX_BODY_ANCHOR);
    }
  });
});

describe('declaresIdentifier', () => {
  it.each([
    ['attribute float aRim;', true],
    ['in float aRim;', true],
    ['varying float aRim;', true],
    ['uniform vec3 aRim;', true],
    ['  aRim = 1.0;', false],
    ['float x = aRim * 2.0;', false],
  ])('%s → %s', (source, expected) => {
    expect(declaresIdentifier(source, 'aRim')).toBe(expected);
  });

  it('không nhầm một định danh có tên dài hơn', () => {
    expect(declaresIdentifier('attribute float aRimExtra;', 'aRim')).toBe(false);
    expect(usesIdentifier('float x = aRimExtra;', 'aRim')).toBe(false);
  });
});
