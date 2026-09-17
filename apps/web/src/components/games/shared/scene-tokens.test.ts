import { describe, expect, it, vi } from 'vitest';
import {
  createCanvasColorResolver,
  fallbackSceneColors,
  parseCssRgb,
  readSceneColors,
  type Rgb,
} from './scene-tokens';

/**
 * ⚠ Cái KHÔNG chứng minh được ở đây, và giả vờ ngược lại còn tệ hơn không test.
 *
 * jsdom không hiện thực canvas 2D và **không phân giải `var()`** trong
 * `getComputedStyle` — tức hai mắt xích của đường đọc màu THẬT đều vắng mặt.
 * Nên ở đây kiểm phần THUẦN và phần LUỒNG (thứ tự ưu tiên giữa bộ phân tích
 * nhanh và canvas, mốc sentinel, nhánh dự phòng, cổng kiểu), còn việc
 * `oklch()` ra đúng màu nào là việc của trình duyệt thật trong report lane E.
 *
 * `createCanvasColorResolver` nhận `Document` qua THAM SỐ chứ không đọc biến
 * toàn cục, nên luồng của nó tiêm được một document giả — đó là lý do phần
 * dưới không phải một cái mock tự kiểm chính nó.
 */
describe('parseCssRgb', () => {
  it('đọc rgb() cú pháp dấu phẩy', () => {
    expect(parseCssRgb('rgb(255, 0, 128)')).toEqual({ r: 1, g: 0, b: 128 / 255 });
  });

  it('đọc rgba() và BỎ alpha', () => {
    // Độ trong suốt do vật liệu / thuộc tính SVG quyết định, không do token.
    expect(parseCssRgb('rgba(0, 255, 0, 0.5)')).toEqual({ r: 0, g: 1, b: 0 });
  });

  it('đọc cú pháp CSS Color 4 dùng khoảng trắng và dấu gạch chéo', () => {
    expect(parseCssRgb('rgb(255 128 0 / 50%)')).toEqual({ r: 1, g: 128 / 255, b: 0 });
  });

  it('đọc phần trăm', () => {
    expect(parseCssRgb('rgb(100%, 0%, 50%)')).toEqual({ r: 1, g: 0, b: 0.5 });
  });

  it('đọc hex dài, hex ngắn, và bỏ kênh alpha của cả hai', () => {
    expect(parseCssRgb('#ff0080')).toEqual({ r: 1, g: 0, b: 128 / 255 });
    expect(parseCssRgb('#f08')).toEqual({ r: 1, g: 0, b: 136 / 255 });
    expect(parseCssRgb('#ff008080')).toEqual({ r: 1, g: 0, b: 128 / 255 });
    expect(parseCssRgb('#f088')).toEqual({ r: 1, g: 0, b: 136 / 255 });
  });

  it('cắt khoảng trắng thừa và không phân biệt hoa thường', () => {
    expect(parseCssRgb('  #FF0080  ')).toEqual({ r: 1, g: 0, b: 128 / 255 });
    expect(parseCssRgb('RGB(255, 0, 0)')).toEqual({ r: 1, g: 0, b: 0 });
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
    expect(parseCssRgb('rgb(')).toBeNull();
    expect(parseCssRgb('var(--primary)')).toBeNull();
    expect(parseCssRgb('#ff')).toBeNull();
    expect(parseCssRgb('#12345')).toBeNull();
    expect(parseCssRgb('#gggggg')).toBeNull();
  });

  /**
   * `#ff00` KHÔNG phải rác: CSS Color 4 có dạng 4 chữ số `#RGBA`, nên nó là
   * vàng với alpha 0. Ghi ô này ra vì cái sai tự nhiên khi đọc lướt là tưởng
   * hex chỉ có 3 hoặc 6 chữ số rồi "sửa" regex cho chặt lại — và lúc đó một
   * token khai bằng 4 chữ số sẽ rơi xuống canvas một cách vô cớ.
   */
  it('hiểu hex 4 chữ số là #RGBA chứ không phải rác', () => {
    expect(parseCssRgb('#ff00')).toEqual({ r: 1, g: 1, b: 0 });
  });
});

interface FakeCtx {
  fillStyle: string;
  clearRect: (x: number, y: number, w: number, h: number) => void;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray };
}

/** Document giả trả về đúng context mình đưa vào (kể cả `null`). */
function docReturning(ctx: FakeCtx | null): Document {
  return {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  } as unknown as Document;
}

function fakeCtx(bytes: readonly number[]): { ctx: FakeCtx; assigned: string[] } {
  const assigned: string[] = [];
  const ctx: FakeCtx = {
    get fillStyle(): string {
      return assigned[assigned.length - 1] ?? '';
    },
    set fillStyle(v: string) {
      assigned.push(v);
    },
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    getImageData: () => ({ data: Uint8ClampedArray.from(bytes) }),
  };
  return { ctx, assigned };
}

describe('createCanvasColorResolver — không có canvas 2D', () => {
  /**
   * Đây là môi trường THẬT của test đơn vị (jsdom trả `null` từ `getContext`)
   * và cũng là môi trường của một trình duyệt chặn canvas. Đường nhanh phải
   * vẫn chạy, và thứ không phân giải được phải trả `null` để chỗ gọi bật cờ
   * `degraded` — chứ không ném giữa lúc dựng cảnh.
   */
  it('vẫn phân giải được rgb()/hex bằng đường nhanh', () => {
    const resolve = createCanvasColorResolver(docReturning(null));
    expect(resolve('rgb(255, 0, 128)')).toEqual({ r: 1, g: 0, b: 128 / 255 });
    expect(resolve('#f08')).toEqual({ r: 1, g: 0, b: 136 / 255 });
  });

  it('trả null cho oklch() và cho chuỗi rỗng', () => {
    const resolve = createCanvasColorResolver(docReturning(null));
    expect(resolve('oklch(0.546 0.215 25)')).toBeNull();
    expect(resolve('')).toBeNull();
    expect(resolve('   ')).toBeNull();
  });

  it('createElement ném cũng không làm hỏng bộ phân giải', () => {
    const doc = {
      createElement: () => {
        throw new Error('canvas bị chặn');
      },
    } as unknown as Document;
    const resolve = createCanvasColorResolver(doc);
    expect(resolve('rgb(1, 2, 3)')).toEqual({ r: 1 / 255, g: 2 / 255, b: 3 / 255 });
    expect(resolve('oklch(0.5 0.1 25)')).toBeNull();
  });
});

describe('createCanvasColorResolver — có canvas 2D', () => {
  it('đọc BYTE cho cú pháp mà đường nhanh không hiểu', () => {
    const { ctx } = fakeCtx([255, 128, 0, 255]);
    const resolve = createCanvasColorResolver(docReturning(ctx));
    expect(resolve('oklch(0.75 0.18 60)')).toEqual({ r: 1, g: 128 / 255, b: 0 });
  });

  /**
   * Mốc sentinel là chỗ dễ mất nhất khi ai đó "dọn" hàm này: `fillStyle` giữ
   * NGUYÊN giá trị cũ khi bị gán một chuỗi không hợp lệ, nên thiếu nó thì một
   * token hỏng trả về màu của token TRƯỚC ĐÓ — sai mà không ai thấy.
   */
  it('gán một màu đã biết TRƯỚC khi gán chuỗi cần đo', () => {
    const { ctx, assigned } = fakeCtx([10, 20, 30, 255]);
    const resolve = createCanvasColorResolver(docReturning(ctx));
    resolve('lab(50% 40 59.5)');
    expect(assigned).toEqual(['rgb(0, 0, 0)', 'lab(50% 40 59.5)']);
  });

  it('KHÔNG đụng canvas khi đường nhanh đã trả lời', () => {
    const { ctx, assigned } = fakeCtx([0, 0, 0, 255]);
    const resolve = createCanvasColorResolver(docReturning(ctx));
    expect(resolve('rgb(10, 20, 30)')).toEqual({ r: 10 / 255, g: 20 / 255, b: 30 / 255 });
    expect(assigned).toEqual([]);
  });

  it('getImageData ném thì trả null, không ném ra ngoài', () => {
    const { ctx } = fakeCtx([]);
    ctx.getImageData = () => {
      throw new Error('canvas bị nhiễm bẩn cross-origin');
    };
    const resolve = createCanvasColorResolver(docReturning(ctx));
    expect(resolve('oklch(0.5 0.1 25)')).toBeNull();
  });
});

/*
 * Hai bảng token GIẢ, cố ý không phải bảng của game nào: thứ đang kiểm là
 * "module chung suy kiểu theo bảng được truyền vào", nên nếu test mượn bảng
 * thật của arena thì nó sẽ vẫn xanh kể cả khi hàm quay về dùng một bảng cứng.
 */
const VARS_A = { alpha: '--alpha', beta: '--beta', gamma: '--gamma' } as const;
const VARS_B = { solo: '--solo' } as const;

function probeStub(): HTMLElement {
  // Chỉ cần `style.color` ghi được — không cần một DOM thật.
  return { style: { color: '' } } as unknown as HTMLElement;
}

describe('readSceneColors', () => {
  it('trả đúng những khoá của bảng đã truyền vào, theo đúng thứ tự khai', () => {
    const seen: string[] = [];
    const result = readSceneColors(
      VARS_A,
      probeStub(),
      (el) => {
        seen.push(el.style.color);
        return 'rgb(10, 20, 30)';
      },
      parseCssRgb,
    );

    expect(Object.keys(result.colors)).toEqual(['alpha', 'beta', 'gamma']);
    expect(seen).toEqual(['var(--alpha)', 'var(--beta)', 'var(--gamma)']);
    expect(result.degraded).toBe(false);
  });

  it('bảng khác vào thì khoá khác ra — không có bảng cứng nào ở trong', () => {
    const result = readSceneColors(VARS_B, probeStub(), () => 'rgb(1, 2, 3)', parseCssRgb);
    expect(Object.keys(result.colors)).toEqual(['solo']);
  });

  /**
   * Cổng lúc BIÊN DỊCH. `npx tsc --noEmit` có quét file này (tsconfig include
   * `src/**` + `*.ts`), nên `@ts-expect-error` ở đây là một khẳng định thật:
   * nếu kiểu trả về tụt xuống `Record<string, Rgb>` thì dòng dưới HẾT lỗi và
   * tsc báo "unused '@ts-expect-error' directive" — tức cổng tự đỏ.
   */
  it('kiểu trả về mang đúng khoá, không phải Record<string, Rgb> trống nghĩa', () => {
    const result = readSceneColors(VARS_A, probeStub(), () => 'rgb(1, 2, 3)', parseCssRgb);

    const alpha: Rgb = result.colors.alpha;
    expect(alpha).toEqual({ r: 1 / 255, g: 2 / 255, b: 3 / 255 });

    // @ts-expect-error — 'delta' không có trong VARS_A; đây chính là thứ cần gác.
    const delta: Rgb | undefined = result.colors.delta;
    expect(delta).toBeUndefined();

    // @ts-expect-error — khoá của VARS_A không được rò sang bảng VARS_B.
    const crossed: Rgb | undefined = fallbackSceneColors(VARS_B).alpha;
    expect(crossed).toBeUndefined();
  });

  /**
   * Nhánh dự phòng phải NÓI RA rằng nó đã chạy. Một fallback im lặng để người
   * dùng ngồi đoán vì sao cảnh toàn màu xám — đúng thứ
   * `development-principles.md` § "Errors Over Silent Fallbacks" cấm.
   */
  it('báo degraded khi không phân giải được màu nào, và vẫn phủ đủ khoá', () => {
    const result = readSceneColors(
      VARS_A,
      probeStub(),
      () => 'oklch(0.5 0.1 25)',
      () => null,
    );
    expect(result.degraded).toBe(true);
    expect(Object.keys(result.colors)).toEqual(['alpha', 'beta', 'gamma']);
    for (const c of Object.values(result.colors)) {
      expect(Number.isFinite(c.r) && Number.isFinite(c.g) && Number.isFinite(c.b)).toBe(true);
    }
  });

  it('báo degraded khi CHỈ MỘT token hỏng', () => {
    let call = 0;
    const result = readSceneColors(
      VARS_A,
      probeStub(),
      () => 'rgb(1, 2, 3)',
      () => {
        call += 1;
        return call === 2 ? null : { r: 0, g: 0, b: 0 };
      },
    );
    expect(result.degraded).toBe(true);
    expect(result.colors.beta).not.toEqual({ r: 0, g: 0, b: 0 });
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
    const result = readSceneColors(VARS_A, probe, spy, parseCssRgb);
    expect(result.degraded).toBe(true);
    expect(Object.keys(result.colors)).toEqual(['alpha', 'beta', 'gamma']);
  });
});

describe('fallbackSceneColors', () => {
  it('phủ đủ khoá của bảng truyền vào, dùng được ngay khi chưa có DOM', () => {
    expect(Object.keys(fallbackSceneColors(VARS_A))).toEqual(['alpha', 'beta', 'gamma']);
    expect(Object.keys(fallbackSceneColors(VARS_B))).toEqual(['solo']);
  });

  /**
   * Cổng màu grep của lane A cấm hex trong mã. Ô này khẳng định màu dự phòng là
   * số thực, không phải một chuỗi hex lén vào qua đường khác.
   */
  it('màu dự phòng là số 0..1, không phải chuỗi', () => {
    for (const c of Object.values(fallbackSceneColors(VARS_A))) {
      expect(typeof c.r).toBe('number');
      expect(c.r).toBeGreaterThanOrEqual(0);
      expect(c.r).toBeLessThanOrEqual(1);
    }
  });

  it('cùng một giá trị xám cho mọi khoá, và nhìn thấy được (không phải đen)', () => {
    const colors = fallbackSceneColors(VARS_A);
    expect(colors.beta).toEqual(colors.alpha);
    expect(colors.alpha.r).toBeGreaterThan(0);
  });
});
