import { describe, expect, it } from 'vitest';
import {
  RENDERER_MODE_STORAGE_KEY,
  isRendererMode,
  readStoredMode,
  rendererModeReasonText,
  resolveRendererMode,
  writeStoredMode,
  type ModeStorage,
} from './renderer-mode.ts';
import { detectWebgl2, type CanvasFactory } from './webgl-detect.ts';

/**
 * Chọn chế độ renderer + dò WebGL2.
 *
 * ⚠ **KHÔNG ô nào ở đây kiểm được "máy không có WebGL2".** Tắt hardware
 * acceleration KHÔNG xoá WebGL2 — Chromium rơi về SwiftShader và
 * `getContext('webgl2')` vẫn trả context. Ô đó chỉ đóng được bằng Playwright
 * với `--disable-3d-apis`, kèm đối chứng dương (AC-5, plan §17.B), và nó thuộc
 * lane khác. Ở đây chỉ kiểm phần LOGIC THUẦN: hàm phân loại đúng ba nhánh khi
 * được đưa ba loại factory, và luật chọn chế độ đúng với từng tổ hợp đầu vào.
 *
 * Viết ra để không ai đọc một ô xanh ở file này thành "đã kiểm cảnh không-WebGL".
 */

function storage(initial: Record<string, string> = {}): ModeStorage & { readonly data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const THROWING: ModeStorage = {
  getItem: () => {
    throw new Error('SecurityError: chế độ riêng tư chặn localStorage');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('detectWebgl2 · ba trạng thái, không phải boolean', () => {
  const factory = (getContext: () => unknown): CanvasFactory => ({
    createElement: () => ({ getContext }),
  });

  it('tạo được context ⇒ available', () => {
    expect(detectWebgl2(factory(() => ({})))).toBe('available');
  });

  it('getContext trả null ⇒ unavailable', () => {
    expect(detectWebgl2(factory(() => null))).toBe('unavailable');
  });

  it('getContext NÉM ⇒ vẫn là unavailable — phép dò đã chạy tới nơi', () => {
    expect(
      detectWebgl2(
        factory(() => {
          throw new Error('Not implemented');
        }),
      ),
    ).toBe('unavailable');
  });

  it('không có document ⇒ unknown, KHÔNG phải unavailable', () => {
    expect(detectWebgl2(null)).toBe('unknown');
  });

  it('createElement ném ⇒ unknown — chưa đo được gì về phần cứng', () => {
    const broken: CanvasFactory = {
      createElement: () => {
        throw new Error('document bị khoá');
      },
    };
    expect(detectWebgl2(broken)).toBe('unknown');
  });

  it('KHÔNG nhớ kết quả giữa hai lượt gọi', () => {
    let answer: unknown = {};
    const swinging = factory(() => answer);
    expect(detectWebgl2(swinging)).toBe('available');
    answer = null;
    expect(detectWebgl2(swinging)).toBe('unavailable');
  });
});

describe('resolveRendererMode · lựa chọn tay THẮNG kết quả dò', () => {
  it('3D chưa có trong bản dựng ⇒ luôn 2D, kể cả khi người dùng đã chọn 3D', () => {
    expect(
      resolveRendererMode({ stored: '3d', support: 'available', has3d: false }),
    ).toEqual({ mode: '2d', reason: 'no-3d-build' });
  });

  it('người dùng chọn 2D trên máy có WebGL2 ⇒ vẫn 2D', () => {
    expect(resolveRendererMode({ stored: '2d', support: 'available', has3d: true })).toEqual({
      mode: '2d',
      reason: 'user',
    });
  });

  it('người dùng chọn 3D và máy chạy được ⇒ 3D', () => {
    expect(resolveRendererMode({ stored: '3d', support: 'available', has3d: true })).toEqual({
      mode: '3d',
      reason: 'user',
    });
  });

  it('người dùng chọn 3D mà ĐÃ ĐO ĐƯỢC là unavailable ⇒ hạ về 2D', () => {
    expect(resolveRendererMode({ stored: '3d', support: 'unavailable', has3d: true })).toEqual({
      mode: '2d',
      reason: 'no-webgl',
    });
  });

  it('unknown KHÔNG hạ chế độ — chưa đo thì chưa có quyền phủ quyết', () => {
    expect(resolveRendererMode({ stored: '3d', support: 'unknown', has3d: true })).toEqual({
      mode: '3d',
      reason: 'user',
    });
  });

  it('chưa chọn tay ⇒ fallback, và fallback 3D bị hạ khi đo được là unavailable', () => {
    expect(
      resolveRendererMode({ stored: null, support: 'available', has3d: true, fallback: '3d' }),
    ).toEqual({ mode: '3d', reason: 'default' });
    expect(
      resolveRendererMode({ stored: null, support: 'unavailable', has3d: true, fallback: '3d' }),
    ).toEqual({ mode: '2d', reason: 'no-webgl' });
    expect(
      resolveRendererMode({ stored: null, support: 'unknown', has3d: true, fallback: '3d' }),
    ).toEqual({ mode: '3d', reason: 'default' });
  });

  it('mặc định khi không khai fallback là 2D', () => {
    expect(resolveRendererMode({ stored: null, support: 'available', has3d: true }).mode).toBe('2d');
  });

  it('mỗi lý do có một câu giải thích riêng, không câu nào rỗng', () => {
    const reasons = ['user', 'no-webgl', 'no-3d-build', 'default'] as const;
    const texts = reasons.map((reason) => rendererModeReasonText({ mode: '2d', reason }));
    expect(new Set(texts).size).toBe(reasons.length);
    for (const text of texts) expect(text.length).toBeGreaterThan(20);
  });
});

describe('ghi nhớ lựa chọn', () => {
  it('đọc lại đúng thứ đã ghi', () => {
    const store = storage();
    expect(writeStoredMode('3d', store)).toBe(true);
    expect(store.data[RENDERER_MODE_STORAGE_KEY]).toBe('3d');
    expect(readStoredMode(store)).toBe('3d');
  });

  it('giá trị rác trong localStorage đọc ra null, không ném', () => {
    expect(readStoredMode(storage({ [RENDERER_MODE_STORAGE_KEY]: 'vr' }))).toBeNull();
    expect(readStoredMode(storage())).toBeNull();
  });

  it('localStorage NÉM (chế độ riêng tư) ⇒ đọc ra null, ghi trả false, không nổ', () => {
    expect(() => readStoredMode(THROWING)).not.toThrow();
    expect(readStoredMode(THROWING)).toBeNull();
    expect(writeStoredMode('2d', THROWING)).toBe(false);
  });

  it('không có storage ⇒ null / false', () => {
    expect(readStoredMode(null)).toBeNull();
    expect(writeStoredMode('2d', null)).toBe(false);
  });

  it('khoá mang tiền tố dlp: để một lượt dọn quét được bằng tiền tố', () => {
    expect(RENDERER_MODE_STORAGE_KEY.startsWith('dlp:')).toBe(true);
  });

  it('isRendererMode chỉ nhận đúng hai giá trị', () => {
    expect(isRendererMode('2d')).toBe(true);
    expect(isRendererMode('3d')).toBe(true);
    expect(isRendererMode('2D')).toBe(false);
    expect(isRendererMode(null)).toBe(false);
    expect(isRendererMode(undefined)).toBe(false);
  });
});
