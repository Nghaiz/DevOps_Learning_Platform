import { describe, expect, it, vi } from 'vitest';
import {
  SCENE_TOKEN_NAMES,
  SCENE_TOKEN_VARS,
  fallbackSceneColors,
  parseCssRgb,
  readSceneColors,
  type Rgb,
} from './scene-tokens';

/**
 * ⚠ Phần DOM của module này (`createCanvasColorResolver`) KHÔNG test được ở đây,
 * và giả vờ ngược lại còn tệ hơn không test.
 *
 * jsdom không hiện thực canvas 2D (trả `null` từ `getContext`) và **không phân
 * giải `var()`** trong `getComputedStyle` — tức hai mắt xích quan trọng nhất của
 * đường đọc màu đều vắng mặt. Một test jsdom "xanh" ở đây chỉ chứng minh rằng
 * mock của chính nó chạy được.
 *
 * Nên: ở đây kiểm phần THUẦN (phân tích chuỗi màu, nhánh dự phòng, cổng kiểu),
 * còn đường DOM thật kiểm bằng trình duyệt thật trong report của lane E.
 */
describe('parseCssRgb', () => {
  it('đọc rgb() cú pháp dấu phẩy', () => {
    expect(parseCssRgb('rgb(255, 0, 128)')).toEqual({ r: 1, g: 0, b: 128 / 255 });
  });

  it('đọc rgba() và BỎ alpha', () => {
    // Độ trong suốt do vật liệu three quyết định, không do token.
    expect(parseCssRgb('rgba(0, 255, 0, 0.5)')).toEqual({ r: 0, g: 1, b: 0 });
  });

  it('đọc cú pháp CSS Color 4 dùng khoảng trắng và dấu gạch chéo', () => {
    expect(parseCssRgb('rgb(255 128 0 / 50%)')).toEqual({ r: 1, g: 128 / 255, b: 0 });
  });

  it('đọc phần trăm', () => {
    expect(parseCssRgb('rgb(100%, 0%, 50%)')).toEqual({ r: 1, g: 0, b: 0.5 });
  });

  it('đọc hex dài và hex ngắn', () => {
    expect(parseCssRgb('#ff0080')).toEqual({ r: 1, g: 0, b: 128 / 255 });
    expect(parseCssRgb('#f08')).toEqual({ r: 1, g: 0, b: 136 / 255 });
  });

  /**
   * Đây là lý do module này tồn tại. `oklch()` là dạng MÀ REPO THẬT SỰ DÙNG
   * (`globals.css` khai toàn bộ token bằng oklch), và bộ phân tích thuần cố ý
   * KHÔNG hiểu nó — viết lại phép chuyển oklch→sRGB bằng tay là dựng bản sao
   * thứ hai của thứ trình duyệt đã làm đúng. Trả `null` để rơi xuống canvas.
   */
  it('trả null cho oklch() — cố ý, để nhường cho canvas', () => {
    expect(parseCssRgb('oklch(0.546 0.215 25)')).toBeNull();
  });

  it('trả null cho rác', () => {
    expect(parseCssRgb('')).toBeNull();
    expect(parseCssRgb('   ')).toBeNull();
    expect(parseCssRgb('rgb(1, 2)')).toBeNull();
    expect(parseCssRgb('var(--primary)')).toBeNull();
  });
});

describe('readSceneColors', () => {
  function probeStub(): HTMLElement {
    // Chỉ cần `style.color` ghi được — không cần một DOM thật.
    return { style: { color: '' } } as unknown as HTMLElement;
  }

  it('đọc đủ mọi token và đặt var() đúng tên biến', () => {
    const seen: string[] = [];
    const probe = probeStub();
    const result = readSceneColors(
      probe,
      (el) => {
        seen.push(el.style.color);
        return 'rgb(10, 20, 30)';
      },
      parseCssRgb,
    );

    expect(Object.keys(result.colors).sort()).toEqual([...SCENE_TOKEN_NAMES].sort());
    expect(result.degraded).toBe(false);
    expect(seen).toEqual(SCENE_TOKEN_NAMES.map((n) => `var(${SCENE_TOKEN_VARS[n]})`));
  });

  /**
   * Nhánh dự phòng phải NÓI RA rằng nó đã chạy. Một fallback im lặng để người
   * dùng ngồi đoán vì sao cảnh toàn màu xám — đúng thứ
   * `development-principles.md` § "Errors Over Silent Fallbacks" cấm.
   */
  it('báo degraded khi không phân giải được màu nào', () => {
    const result = readSceneColors(probeStub(), () => 'oklch(0.5 0.1 25)', () => null);
    expect(result.degraded).toBe(true);
    for (const name of SCENE_TOKEN_NAMES) {
      const c: Rgb = result.colors[name];
      expect(Number.isFinite(c.r) && Number.isFinite(c.g) && Number.isFinite(c.b)).toBe(true);
    }
  });

  it('báo degraded khi CHỈ MỘT token hỏng', () => {
    let call = 0;
    const result = readSceneColors(
      probeStub(),
      () => 'rgb(1, 2, 3)',
      () => {
        call += 1;
        return call === 2 ? null : { r: 0, g: 0, b: 0 };
      },
    );
    expect(result.degraded).toBe(true);
  });

  it('một token ném không làm sập cả bảng', () => {
    const probe = {
      style: {
        set color(_v: string) {
          throw new Error('CSSOM bị chặn');
        },
        get color(): string {
          return '';
        },
      },
    } as unknown as HTMLElement;
    const spy = vi.fn(() => 'rgb(1, 2, 3)');
    const result = readSceneColors(probe, spy, parseCssRgb);
    expect(result.degraded).toBe(true);
    expect(Object.keys(result.colors)).toHaveLength(SCENE_TOKEN_NAMES.length);
  });
});

describe('fallbackSceneColors', () => {
  it('phủ đủ token, dùng được ngay ở frame đầu khi chưa có DOM', () => {
    expect(Object.keys(fallbackSceneColors()).sort()).toEqual([...SCENE_TOKEN_NAMES].sort());
  });

  /**
   * Cổng màu grep của lane A cấm hex trong mã. Ô này khẳng định màu dự phòng là
   * số thực, không phải một chuỗi hex lén vào qua đường khác.
   */
  it('màu dự phòng là số 0..1, không phải chuỗi', () => {
    for (const c of Object.values(fallbackSceneColors())) {
      expect(typeof c.r).toBe('number');
      expect(c.r).toBeGreaterThanOrEqual(0);
      expect(c.r).toBeLessThanOrEqual(1);
    }
  });
});
