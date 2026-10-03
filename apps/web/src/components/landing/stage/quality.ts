/**
 * Ba tầng chất lượng. Chọn ban đầu theo thiết bị, hạ tiếp khi `PerformanceMonitor` thấy khung
 * hình tụt, và hạ thẳng xuống `low` khi renderer là phần mềm (SwiftShader của Chrome headless
 * trong CI, llvmpipe trên Linux không GPU): ở đó hậu kỳ bloom một mình đã ăn hết ngân sách khung.
 */
export type QualityTier = 'high' | 'medium' | 'low';

export const TIER_DPR: Readonly<Record<QualityTier, readonly [number, number]>> = {
  high: [1, 1.75],
  medium: [1, 1.25],
  low: [0.75, 1],
};

export const DUST_COUNT: Readonly<Record<QualityTier, number>> = { high: 1600, medium: 900, low: 300 };
export const LOOP_COUNT: Readonly<Record<QualityTier, number>> = { high: 9000, medium: 5500, low: 2400 };

export const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

export function initialTier(): QualityTier {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (coarse && window.innerWidth < 900) return 'medium';
  return cores <= 4 ? 'medium' : 'high';
}

export const downgrade = (tier: QualityTier): QualityTier => (tier === 'high' ? 'medium' : 'low');

export function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name: unknown = info === null ? gl.getParameter(gl.RENDERER) : gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
  return typeof name === 'string' ? name : '';
}

/** Thử tạo một context WebGL2 rồi trả nó ngay; không giữ context nào chỉ để hỏi "có không". */
export function webglAvailable(): boolean {
  try {
    const probe = document.createElement('canvas');
    const context = probe.getContext('webgl2');
    if (context === null) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
