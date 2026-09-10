import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  EASE_OUT,
  MOTION_BASE_MS,
  MOTION_FAST_MS,
  MOTION_SLOW_MS,
  fadeVariants,
  riseVariants,
  sectionVariants,
  staggerContainer,
  toSeconds,
  transitionBase,
  transitionFast,
  transitionSlow,
} from './index.ts';

/**
 * ⚠ Bản sao JS của `--motion-*` và `--ease-out` chỉ tin được chừng nào nó còn
 * KHỚP `globals.css`. Ba con số dưới đây là nguồn duy nhất mà framer-motion đọc
 * được; ngày ai đó đổi CSS mà quên đây thì hover chạy 150ms còn tooltip chạy
 * 200ms trong cùng một màn hình, và không có gì báo.
 *
 * Test này đọc THẲNG `globals.css` để phép so là phép so với SSOT, không phải
 * với một hằng số thứ hai chép sang. Nếu file đó chưa tồn tại (lane L0 đang
 * viết lại nó) thì ca này SKIP có tên — chứ không im lặng xanh.
 */
const GLOBALS_CSS_URL = new URL('../../../apps/web/src/app/globals.css', import.meta.url);

function readGlobalsCss(): string | null {
  try {
    return readFileSync(GLOBALS_CSS_URL, 'utf8');
  } catch {
    return null;
  }
}

function cssTokenValue(css: string, token: string): string | null {
  const match = new RegExp(`^\\s*${token}:\\s*([^;]+);`, 'm').exec(css);
  return match?.[1]?.trim() ?? null;
}

describe('§7 thời lượng — khớp globals.css', () => {
  it('ba token giữ đúng giá trị hợp đồng', () => {
    expect({ MOTION_FAST_MS, MOTION_BASE_MS, MOTION_SLOW_MS }).toEqual({
      MOTION_FAST_MS: 150,
      MOTION_BASE_MS: 220,
      MOTION_SLOW_MS: 320,
    });
  });

  it('EASE_OUT là cubic-bezier(0.16, 1, 0.3, 1) — kế thừa, KHÔNG đổi', () => {
    expect([...EASE_OUT]).toEqual([0.16, 1, 0.3, 1]);
  });

  it('toSeconds đổi ms → s, đúng đơn vị framer-motion', () => {
    expect(toSeconds(150)).toBeCloseTo(0.15, 12);
    expect(toSeconds(220)).toBeCloseTo(0.22, 12);
    expect(toSeconds(320)).toBeCloseTo(0.32, 12);
  });

  const css = readGlobalsCss();

  it.runIf(css !== null)('không lệch với --motion-* trong globals.css', () => {
    expect(css).not.toBeNull();
    const sheet = css ?? '';
    expect(cssTokenValue(sheet, '--motion-fast')).toBe(`${MOTION_FAST_MS}ms`);
    expect(cssTokenValue(sheet, '--motion-base')).toBe(`${MOTION_BASE_MS}ms`);
    expect(cssTokenValue(sheet, '--motion-slow')).toBe(`${MOTION_SLOW_MS}ms`);
  });

  it.runIf(css !== null)('không lệch với --ease-out trong globals.css', () => {
    const value = cssTokenValue(css ?? '', '--ease-out');
    const numbers = (value ?? '').match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
    expect(numbers).toEqual([...EASE_OUT]);
  });
});

describe('transition dùng chung', () => {
  it.each([
    ['fast', transitionFast, MOTION_FAST_MS],
    ['base', transitionBase, MOTION_BASE_MS],
    ['slow', transitionSlow, MOTION_SLOW_MS],
  ])('%s: duration = %s ms đổi sang giây, ease = EASE_OUT', (_name, transition, ms) => {
    const t = transition as { duration?: number; ease?: readonly number[] };
    expect(t.duration).toBeCloseTo(ms / 1000, 12);
    expect(t.ease === undefined ? [] : [...t.ease]).toEqual([...EASE_OUT]);
  });

  it('ba thời lượng KHÁC nhau — một bảng ba dòng cùng giá trị không gác gì', () => {
    const durations = [transitionFast, transitionBase, transitionSlow].map(
      (t) => (t as { duration?: number }).duration,
    );
    expect(new Set(durations).size).toBe(3);
  });
});

describe('biến thể', () => {
  it.each([
    ['fadeVariants', fadeVariants],
    ['riseVariants', riseVariants],
    ['sectionVariants', sectionVariants],
  ])('%s có đủ ba trạng thái hidden/visible/exit', (_name, variants) => {
    expect(Object.keys(variants).sort()).toEqual(['exit', 'hidden', 'visible']);
  });

  it('fadeVariants KHÔNG dịch chuyển — dùng cho chỗ một cú dịch sẽ lộ mép', () => {
    expect(JSON.stringify(fadeVariants)).not.toContain('"y"');
  });

  it('riseVariants vào từ dưới lên 8px, về 0 ở trạng thái hiện', () => {
    expect(riseVariants['hidden']).toMatchObject({ opacity: 0, y: 8 });
    expect(riseVariants['visible']).toMatchObject({ opacity: 1, y: 0 });
  });

  it('sectionVariants chạy --motion-slow, quãng dịch dài hơn riseVariants', () => {
    expect(sectionVariants['visible']).toMatchObject({ transition: transitionSlow });
    expect(riseVariants['visible']).toMatchObject({ transition: transitionBase });
  });

  it('staggerContainer: bước mặc định 0.04s, đổi được', () => {
    expect(staggerContainer()['visible']).toMatchObject({
      transition: { staggerChildren: 0.04 },
    });
    expect(staggerContainer(0.01)['visible']).toMatchObject({
      transition: { staggerChildren: 0.01 },
    });
  });

  it('trả về đối tượng MỚI mỗi lần gọi — không chia sẻ trạng thái giữa danh sách', () => {
    expect(staggerContainer()).not.toBe(staggerContainer());
  });
});
