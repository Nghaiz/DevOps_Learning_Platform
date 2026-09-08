import { describe, expect, it } from 'vitest';
import {
  TIER_FEATURES,
  createTierController,
  isSoftwareRenderer,
  tierFromRenderer,
  type QualityTier,
} from './scene-quality';

describe('isSoftwareRenderer', () => {
  /**
   * Chuỗi thật, không phải chuỗi bịa. `SwiftShader` là thứ Chromium headless của
   * Playwright báo về, và đó là cả lý do module này tồn tại (§9.5): nếu không dò
   * ra nó, bóng mềm + bloom làm mỗi khung hình tốn hàng trăm ms và suite e2e hết
   * giờ vì phần cứng CI, không vì mã.
   */
  it('nhận ra bản rasterize bằng CPU', () => {
    const software = [
      'Google SwiftShader',
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'Mesa OffScreen',
      'Microsoft Basic Render Driver',
    ];
    for (const renderer of software) {
      expect(isSoftwareRenderer(renderer), renderer).toBe(true);
    }
  });

  it('không nhận nhầm GPU thật', () => {
    const real = [
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Apple M2 Pro',
      'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'AMD Radeon Pro 5500M OpenGL Engine',
    ];
    for (const renderer of real) {
      expect(isSoftwareRenderer(renderer), renderer).toBe(false);
    }
  });

  /**
   * `null` = trình duyệt không chịu nói (chặn fingerprint). Đó KHÔNG phải bằng
   * chứng của phần mềm đổ mềm, nên bắt đầu ở bậc cao rồi để phép đo khung hình
   * kéo xuống. Đo hơn đoán.
   */
  it('không biết thì không kết luận là software', () => {
    expect(isSoftwareRenderer(null)).toBe(false);
    expect(tierFromRenderer(null)).toBe('high');
  });

  it('software ⇒ bậc thấp ngay', () => {
    expect(tierFromRenderer('Google SwiftShader')).toBe('low');
  });
});

describe('createTierController', () => {
  function feed(controller: ReturnType<typeof createTierController>, ms: number, frames: number): (QualityTier | null)[] {
    return Array.from({ length: frames }, () => controller.observe(ms));
  }

  it('khung hình nhanh thì không bao giờ hạ bậc', () => {
    const controller = createTierController('high');
    const changes = feed(controller, 8, 500).filter((c) => c !== null);
    expect(changes).toEqual([]);
    expect(controller.current()).toBe('high');
  });

  /**
   * MỘT cửa sổ chậm không đủ. Cửa sổ đầu tiên sau mount luôn chậm — shader đang
   * biên dịch, texture đang tải lên. Hạ bậc ở đó là hạ bậc mọi máy, kể cả máy khoẻ.
   */
  it('một cửa sổ chậm chưa hạ bậc', () => {
    const controller = createTierController('high');
    expect(feed(controller, 40, 45).filter((c) => c !== null)).toEqual([]);
    expect(controller.current()).toBe('high');
  });

  it('hai cửa sổ chậm liên tiếp thì hạ một bậc', () => {
    const controller = createTierController('high');
    const changes = feed(controller, 40, 90).filter((c) => c !== null);
    expect(changes).toEqual(['medium']);
  });

  it('cửa sổ nhanh xen giữa xoá bộ đếm chậm', () => {
    const controller = createTierController('high');
    feed(controller, 40, 45);
    feed(controller, 8, 45);
    expect(feed(controller, 40, 45).filter((c) => c !== null)).toEqual([]);
    expect(controller.current()).toBe('high');
  });

  it('hạ tới đáy rồi dừng, không đi xuống nữa', () => {
    const controller = createTierController('high');
    const changes = feed(controller, 60, 90 * 6).filter((c) => c !== null);
    expect(changes).toEqual(['medium', 'low']);
    expect(controller.current()).toBe('low');
  });

  /**
   * Trung vị, không phải trung bình: một khung hình 400ms (tab vừa được bật lại)
   * kéo trung bình đủ để hạ bậc oan trên máy hoàn toàn khoẻ.
   */
  it('một đột biến đơn lẻ không kéo được cả cửa sổ', () => {
    const controller = createTierController('high');
    controller.observe(400);
    expect(feed(controller, 6, 89).filter((c) => c !== null)).toEqual([]);
  });

  it('bỏ qua số đo vô nghĩa', () => {
    const controller = createTierController('high');
    for (let i = 0; i < 200; i += 1) {
      expect(controller.observe(Number.NaN)).toBeNull();
      expect(controller.observe(0)).toBeNull();
      expect(controller.observe(-5)).toBeNull();
    }
    expect(controller.current()).toBe('high');
  });
});

describe('TIER_FEATURES', () => {
  /**
   * Bậc thấp là bậc dành cho SwiftShader. Mọi thứ đắt phải TẮT ở đó — nếu một
   * dòng trong bảng này bật nhầm thì cổng e2e của lane F hết giờ, và triệu chứng
   * sẽ đọc ra như "test flaky" chứ không như "cấu hình sai".
   */
  it('bậc thấp tắt hết phần đắt tiền', () => {
    expect(TIER_FEATURES.low).toMatchObject({
      shadows: false,
      softShadows: false,
      bloom: false,
      environment: false,
      particles: false,
      maxPixelRatio: 1,
    });
  });

  it('đắt dần theo bậc, không có bậc nào nhảy cóc', () => {
    const cost = (t: QualityTier): number =>
      Number(TIER_FEATURES[t].shadows) +
      Number(TIER_FEATURES[t].softShadows) +
      Number(TIER_FEATURES[t].bloom) +
      Number(TIER_FEATURES[t].environment) +
      Number(TIER_FEATURES[t].particles);
    expect(cost('low')).toBeLessThan(cost('medium'));
    expect(cost('medium')).toBeLessThan(cost('high'));
  });

  it('pixel ratio bị kẹp ở 2 — §11.1 mục 5', () => {
    for (const tier of ['low', 'medium', 'high'] as const) {
      expect(TIER_FEATURES[tier].maxPixelRatio).toBeLessThanOrEqual(2);
    }
  });
});
