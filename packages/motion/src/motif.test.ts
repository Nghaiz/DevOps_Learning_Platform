import { readFileSync } from 'node:fs';

import type { SVGProps } from 'react';
import { describe, expect, it } from 'vitest';

import {
  ARC_CENTER,
  ARC_DASH_OFFSET_EXPRESSION,
  ARC_END_DEG,
  ARC_GAP_DEG,
  ARC_PATH_D,
  ARC_RX,
  ARC_RY,
  ARC_SPIN_ANIMATION,
  ARC_SPIN_ANIMATION_NAME,
  ARC_SPIN_KEYFRAMES_CSS,
  ARC_START_DEG,
  ARC_STROKE,
  ARC_STROKE_HAIRLINE,
  ARC_STROKE_HEAVY,
  ARC_SWEEP_DEG,
  ARC_TILT_DEG,
  ARC_TRANSITION,
  ARC_VIEWBOX,
  SVG_X_AXIS_ROTATION_DEG,
  arcPointAt,
  arcProgressProps,
  arcSpinnerProps,
  arcTrackProps,
  clampProgress,
  dashOffsetAt,
  sweepAngleAt,
} from './motif.ts';

// ── §8.1 Hằng số ─────────────────────────────────────────────────────────────

describe('token §8.1/§8.2', () => {
  it('giữ đúng giá trị hợp đồng', () => {
    expect({
      ARC_VIEWBOX,
      ARC_CENTER,
      ARC_RX,
      ARC_RY,
      ARC_TILT_DEG,
      ARC_START_DEG,
      ARC_SWEEP_DEG,
      ARC_GAP_DEG,
      ARC_STROKE_HAIRLINE,
      ARC_STROKE,
      ARC_STROKE_HEAVY,
    }).toEqual({
      ARC_VIEWBOX: '0 0 100 100',
      ARC_CENTER: 50,
      ARC_RX: 42,
      ARC_RY: 30,
      ARC_TILT_DEG: -22,
      ARC_START_DEG: 120,
      ARC_SWEEP_DEG: 300,
      ARC_GAP_DEG: 60,
      ARC_STROKE_HAIRLINE: 2,
      ARC_STROKE: 4,
      ARC_STROKE_HEAVY: 6,
    });
  });

  it('khe hở = 360 − sweep, và cung chạy 120° → 420°', () => {
    expect(ARC_GAP_DEG).toBe(360 - ARC_SWEEP_DEG);
    expect(ARC_END_DEG).toBe(420);
  });

  it('ellipse chứ không tròn — tỉ lệ trục 1.4', () => {
    expect(ARC_RX / ARC_RY).toBeCloseTo(1.4, 10);
  });
});

// ── Hình học: bảng vào/ra tính TAY ───────────────────────────────────────────

/**
 * Bốn mốc dưới đây tính bằng tay từ §8.1, KHÔNG chép từ đầu ra của
 * `arcPointAt` — nếu chép thì test chỉ khẳng định hàm bằng chính nó.
 *
 * `cos(-22°) = 0.9271839`, `sin(-22°) = -0.3746066`.
 *
 * θ=120: local `(42·cos120, 30·sin120) = (-21, 25.98076)`
 *   x' = (-21)(0.9271839) − (25.98076)(-0.3746066) = -19.47086 + 9.73256 = -9.73830
 *   y' = (-21)(-0.3746066) + (25.98076)(0.9271839) =   7.86674 + 24.08894 = 31.95568
 *   màn hình = (50 − 9.73830, 50 − 31.95568) = (40.2617, 18.0443)
 */
const HAND_COMPUTED: ReadonlyArray<readonly [number, number, number]> = [
  [0, 88.9417, 65.7335],
  [60, 79.2034, 33.7779],
  [90, 61.2382, 22.1845],
  [120, 40.2617, 18.0443],
];

describe('arcPointAt', () => {
  it.each(HAND_COMPUTED)('θ=%i° ⇒ (%f, %f)', (angle, x, y) => {
    const point = arcPointAt(angle);
    expect(point.x).toBeCloseTo(x, 3);
    expect(point.y).toBeCloseTo(y, 3);
  });

  it('θ=420° trùng θ=60° (một vòng đủ)', () => {
    const a = arcPointAt(60);
    const b = arcPointAt(420);
    expect(b.x).toBeCloseTo(a.x, 10);
    expect(b.y).toBeCloseTo(a.y, 10);
  });

  /**
   * Bất biến độc lập với mọi con số ở trên: quay ngược lại `-ARC_TILT_DEG` rồi
   * chuẩn hoá theo hai bán trục phải cho đúng đường tròn đơn vị. Bắt được mọi
   * lỗi tỉ lệ/nhầm trục mà bốn mốc kia có thể lọt.
   */
  it('mọi điểm nằm trên ellipse — bất biến (x/rx)² + (y/ry)² = 1', () => {
    const rad = (-ARC_TILT_DEG * Math.PI) / 180;
    for (let angle = 0; angle < 360; angle += 7) {
      const p = arcPointAt(angle);
      const dx = p.x - ARC_CENTER;
      // Lật `y` về hệ toán học trước khi quay ngược.
      const dy = ARC_CENTER - p.y;
      const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
      const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
      expect((localX / ARC_RX) ** 2 + (localY / ARC_RY) ** 2).toBeCloseTo(1, 9);
    }
  });
});

describe('khe hở nằm PHÍA TRÊN BÊN PHẢI (§8.1)', () => {
  const GAP_MID_DEG = ARC_END_DEG + ARC_GAP_DEG / 2; // 450 ≡ 90

  it('tâm khe hở ở bên phải tâm và bên trên tâm', () => {
    const mid = arcPointAt(GAP_MID_DEG);
    expect(mid.x).toBeGreaterThan(ARC_CENTER);
    expect(mid.y).toBeLessThan(ARC_CENTER);
  });

  it('toàn bộ nêm khe hở nằm bên trên tâm', () => {
    for (let angle = ARC_END_DEG; angle <= ARC_END_DEG + ARC_GAP_DEG; angle += 5) {
      expect(arcPointAt(angle).y).toBeLessThan(ARC_CENTER);
    }
  });

  /**
   * ĐỐI CHỨNG DƯƠNG cho dấu của `--arc-tilt`. §8.1 đọc được theo hai cách và
   * chỉ một cách cho ra "phía trên bên phải"; ca này chạy cách KIA và đòi nó
   * rơi sang bên trái. Không có ca này thì khẳng định ở trên không phân biệt
   * được hai cách đọc, tức nó gác một điều nó không đo.
   */
  it('đảo dấu nghiêng ⇒ khe hở sang bên TRÁI, tức trái §8.1', () => {
    const rad = (GAP_MID_DEG * Math.PI) / 180;
    const flipped = (-ARC_TILT_DEG * Math.PI) / 180;
    const localX = ARC_RX * Math.cos(rad);
    const localY = ARC_RY * Math.sin(rad);
    const x = ARC_CENTER + (localX * Math.cos(flipped) - localY * Math.sin(flipped));
    expect(x).toBeLessThan(ARC_CENTER);
  });
});

// ── §8.3 Ánh xạ tiến độ ──────────────────────────────────────────────────────

describe('clampProgress', () => {
  it.each([
    [0, 0],
    [0.25, 0.25],
    [0.5, 0.5],
    [1, 1],
    [-0.01, 0],
    [-99, 0],
    [1.01, 1],
    [99, 1],
    [Number.POSITIVE_INFINITY, 0],
    [Number.NEGATIVE_INFINITY, 0],
    [Number.NaN, 0],
  ])('p=%f ⇒ %f', (input, expected) => {
    expect(clampProgress(input)).toBe(expected);
  });

  it('NaN ⇒ 0 chứ không 1 — "không biết" không được đọc ra là "đã xong"', () => {
    expect(clampProgress(0 / 0)).toBe(0);
    expect(dashOffsetAt(Number.NaN)).toBe(1);
  });
});

describe('sweepAngleAt — §8.3 θ(p) = start + p × sweep', () => {
  it.each([
    [0, 120],
    [0.25, 195],
    [0.5, 270],
    [0.75, 345],
    [1, 420],
  ])('p=%f ⇒ θ=%f°', (p, theta) => {
    expect(sweepAngleAt(p)).toBeCloseTo(theta, 10);
  });

  it('ngoài miền bị kẹp về hai biên', () => {
    expect(sweepAngleAt(-1)).toBe(ARC_START_DEG);
    expect(sweepAngleAt(2)).toBe(ARC_END_DEG);
    expect(sweepAngleAt(Number.NaN)).toBe(ARC_START_DEG);
  });
});

describe('dashOffsetAt — AC-7', () => {
  it.each([
    [0, 1],
    [0.25, 0.75],
    [0.5, 0.5],
    [0.75, 0.25],
    [1, 0],
  ])('p=%f ⇒ offset=%f', (p, offset) => {
    expect(dashOffsetAt(p)).toBeCloseTo(offset, 10);
  });

  it('tuyến tính trong toàn miền, không chỉ ở năm mẫu', () => {
    for (let i = 0; i <= 20; i += 1) {
      const p = i / 20;
      expect(dashOffsetAt(p)).toBeCloseTo(1 - p, 12);
    }
  });

  it('ngoài miền bị kẹp', () => {
    expect(dashOffsetAt(-5)).toBe(1);
    expect(dashOffsetAt(5)).toBe(0);
  });
});

// ── `d` của cung ─────────────────────────────────────────────────────────────

describe('ARC_PATH_D', () => {
  const tokens = ARC_PATH_D.split(' ');

  it('là một lệnh M + một lệnh A, tham số đúng §8.1', () => {
    expect(tokens).toHaveLength(11);
    expect(tokens[0]).toBe('M');
    expect(tokens[3]).toBe('A');
    expect(tokens[4]).toBe(String(ARC_RX));
    expect(tokens[5]).toBe(String(ARC_RY));
    expect(tokens[6]).toBe('22'); // xoay của SVG, ngược dấu với --arc-tilt
    expect(tokens[7]).toBe('1'); // large-arc: 300° > 180°
    expect(tokens[8]).toBe('0'); // sweep: ngược kim đồng hồ trên màn hình
  });

  it('SVG_X_AXIS_ROTATION_DEG là NGƯỢC dấu của --arc-tilt', () => {
    expect(SVG_X_AXIS_ROTATION_DEG).toBe(22);
    expect(SVG_X_AXIS_ROTATION_DEG).toBe(-ARC_TILT_DEG);
  });

  it('hai đầu nét trùng arcPointAt(start) và arcPointAt(end)', () => {
    const from = arcPointAt(ARC_START_DEG);
    const to = arcPointAt(ARC_END_DEG);
    expect(Number(tokens[1])).toBeCloseTo(from.x, 3);
    expect(Number(tokens[2])).toBeCloseTo(from.y, 3);
    expect(Number(tokens[9])).toBeCloseTo(to.x, 3);
    expect(Number(tokens[10])).toBeCloseTo(to.y, 3);
  });

  it('hai đầu KHÁC nhau — nếu trùng, lệnh A của SVG là lệnh rỗng', () => {
    const from = arcPointAt(ARC_START_DEG);
    const to = arcPointAt(ARC_END_DEG);
    expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeGreaterThan(1);
  });

  /**
   * §8.4 — thuộc tính `d` KHÔNG transition được. Nếu tiến độ nằm trong `d` thì
   * cung buộc phải chạy bằng rAF, tức mất luôn cổng reduced-motion miễn phí.
   */
  it('KHÔNG phụ thuộc p — mọi tiến độ dùng chung một `d`', () => {
    const ds = [0, 0.3, 0.77, 1].map((p) => arcProgressProps({ p }).d);
    expect(new Set(ds).size).toBe(1);
    expect(ds[0]).toBe(ARC_PATH_D);
  });
});

// ── AC-7: thuộc tính phần tử cung ────────────────────────────────────────────

describe('arcProgressProps — AC-7', () => {
  const props = arcProgressProps({ p: 0.5 });

  it('mang pathLength=1 và vector-effect=non-scaling-stroke', () => {
    expect(props.pathLength).toBe(1);
    expect(props.vectorEffect).toBe('non-scaling-stroke');
  });

  it('đầu nét bo (khớp --radius-full) và dasharray = 1', () => {
    expect(props.strokeLinecap).toBe('round');
    expect(props.strokeDasharray).toBe(1);
  });

  it('§8.5 — stroke là currentColor, không phải token màu', () => {
    expect(props.stroke).toBe('currentColor');
  });

  it('§8.3 — `--p` trên chính phần tử, offset là calc(1 - var(--p))', () => {
    expect(props.style['--p']).toBe('0.5');
    expect(props.style.strokeDashoffset).toBe(ARC_DASH_OFFSET_EXPRESSION);
    expect(ARC_DASH_OFFSET_EXPRESSION).toBe('calc(1 - var(--p))');
  });

  it.each([
    [0, '0', 1],
    [0.25, '0.25', 0.75],
    [0.5, '0.5', 0.5],
    [0.75, '0.75', 0.25],
    [1, '1', 0],
    [-3, '0', 1],
    [7, '1', 0],
  ])('p=%f ⇒ --p="%s", dashOffset %f', (p, cssVar, offset) => {
    expect(arcProgressProps({ p }).style['--p']).toBe(cssVar);
    expect(dashOffsetAt(p)).toBeCloseTo(offset, 10);
  });

  it('NaN ⇒ --p="0", không phải "NaN" (calc(1 - NaN) là khai báo hỏng)', () => {
    expect(arcProgressProps({ p: Number.NaN }).style['--p']).toBe('0');
  });

  it('bề dày mặc định là --arc-stroke, đổi được qua `width`', () => {
    expect(props.strokeWidth).toBe(ARC_STROKE);
    expect(arcProgressProps({ p: 0, width: ARC_STROKE_HEAVY }).strokeWidth).toBe(6);
  });

  it('transition tắt được cho lượt vẽ đầu', () => {
    expect(props.style.transition).toBe(ARC_TRANSITION);
    expect(arcProgressProps({ p: 0.5, transition: false }).style.transition).toBeUndefined();
  });
});

describe('§8.4 — cung tuân thủ reduced-motion nhờ CSS, không nhờ JS', () => {
  it('transition đi qua --motion-slow và --ease-out', () => {
    expect(ARC_TRANSITION).toBe('stroke-dashoffset var(--motion-slow) var(--ease-out)');
  });

  /**
   * Khối `@media (prefers-reduced-motion: reduce)` trong `globals.css` phủ
   * `transition-duration` bằng `!important` với bộ chọn PHỔ QUÁT. Một
   * `!important` của tác giả trên chính phần tử có độ đặc hiệu cao hơn và sẽ
   * THẮNG nó — tức cung thoát khỏi cổng. Đây là cách hỏng im lặng: cung vẫn
   * chạy 320ms trong khi mọi thứ khác đã dừng.
   */
  it('KHÔNG có !important ở bất kỳ style nào của cung', () => {
    const styles = [
      JSON.stringify(arcProgressProps({ p: 0.5 }).style),
      JSON.stringify(arcSpinnerProps().style),
      ARC_TRANSITION,
      ARC_SPIN_ANIMATION,
    ];
    for (const style of styles) {
      expect(style).not.toMatch(/!\s*important/i);
    }
  });
});

// ── Rãnh (§8.5) và trạng thái tải (§8.3) ─────────────────────────────────────

describe('arcTrackProps — §8.5', () => {
  it('trang trí ⇒ --border; control đọc được ⇒ --input (SC 1.4.11 áp vào)', () => {
    expect(arcTrackProps().stroke).toBe('var(--border)');
    expect(arcTrackProps({ role: 'decorative' }).stroke).toBe('var(--border)');
    expect(arcTrackProps({ role: 'control' }).stroke).toBe('var(--input)');
  });

  it('dùng chung `d` với cung tiến độ, và cũng non-scaling-stroke', () => {
    const track = arcTrackProps();
    expect(track.d).toBe(ARC_PATH_D);
    expect(track.vectorEffect).toBe('non-scaling-stroke');
    expect(track.fill).toBe('none');
  });
});

describe('arcSpinnerProps — §8.3 trạng thái tải', () => {
  it('animation trỏ đúng tên mà ARC_SPIN_KEYFRAMES_CSS định nghĩa', () => {
    expect(ARC_SPIN_KEYFRAMES_CSS).toContain(`@keyframes ${ARC_SPIN_ANIMATION_NAME}`);
    expect(arcSpinnerProps().style.animation).toBe(ARC_SPIN_ANIMATION);
    expect(ARC_SPIN_ANIMATION.startsWith(`${ARC_SPIN_ANIMATION_NAME} `)).toBe(true);
  });

  it('--motion-slow mỗi chiều, lặp vô hạn, đảo chiều (vẽ ra rồi thu lại)', () => {
    expect(ARC_SPIN_ANIMATION).toContain('var(--motion-slow)');
    expect(ARC_SPIN_ANIMATION).toContain('infinite');
    expect(ARC_SPIN_ANIMATION).toContain('alternate');
  });
});

// ── AC-7: 0 lần requestAnimationFrame, kèm đối chứng HAI CHIỀU ───────────────

/**
 * Bỏ chú thích trước khi đếm. Không bỏ thì phép kiểm này báo đỏ trên chính tài
 * liệu giải thích vì sao KHÔNG dùng rAF — đúng lớp lỗi mà §9.2 ghi lại: bản
 * grep cũ kêu oan 5/5 lần và bị tắt trong hai tuần.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function countRequestAnimationFrame(source: string): number {
  return (stripComments(source).match(/\brequestAnimationFrame\b/g) ?? []).length;
}

const FIXTURE_WITH_RAF = `
export function spin(draw) {
  function tick(t) { draw(t); requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
}
`;

const FIXTURE_COMMENT_ONLY = `
/* Cung KHÔNG chạy bằng requestAnimationFrame — xem §8.4. */
// và cũng không requestAnimationFrame ở đây
const d = 'M 0 0';
`;

function readSource(file: string): string {
  return readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
}

describe('AC-7 — module tiến độ chứa 0 lần requestAnimationFrame', () => {
  it('ĐỐI CHỨNG DƯƠNG — fixture cố ý dùng rAF PHẢI bị bắt', () => {
    expect(countRequestAnimationFrame(FIXTURE_WITH_RAF)).toBe(2);
  });

  it('ĐỐI CHỨNG ÂM — nhắc tên trong chú thích KHÔNG phải vi phạm', () => {
    expect(FIXTURE_COMMENT_ONLY).toContain('requestAnimationFrame');
    expect(countRequestAnimationFrame(FIXTURE_COMMENT_ONLY)).toBe(0);
  });

  it.each(['motif.ts', 'index.ts'])('%s: 0 lần gọi', (file) => {
    const source = readSource(file);
    // Phép đo chỉ có nghĩa nếu chuỗi THẬT SỰ có mặt trong file (ở chú thích):
    // một số 0 trên một file không hề nhắc tới rAF thì không chứng minh gì.
    expect(source).toContain('requestAnimationFrame');
    expect(countRequestAnimationFrame(source)).toBe(0);
  });

  it('frame-loop.ts thì CÓ — đó là cổng, không phải vi phạm', () => {
    expect(countRequestAnimationFrame(readSource('frame-loop.ts'))).toBeGreaterThan(0);
  });
});

// ── §9: JSX/TS không bao giờ mang màu trần ───────────────────────────────────

describe('§9 — không màu trần trong motif.ts', () => {
  it('0 lần #hex, 0xRRGGBB, slate|gray|zinc|neutral-N', () => {
    const code = stripComments(readSource('motif.ts'));
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/0x[0-9a-fA-F]{6}\b/);
    expect(code).not.toMatch(/\b(slate|gray|zinc|neutral)-(50|[1-9]00|950)\b/);
  });
});

// ── Tương thích kiểu với React (biên tiêu thụ của packages/ui) ───────────────

const _progressIsSvgProps: SVGProps<SVGPathElement> = arcProgressProps({ p: 0.5 });
const _trackIsSvgProps: SVGProps<SVGPathElement> = arcTrackProps();
const _spinnerIsSvgProps: SVGProps<SVGPathElement> = arcSpinnerProps();

describe('biên React', () => {
  it('ba bộ props spread thẳng được vào <path>', () => {
    expect(_progressIsSvgProps.pathLength).toBe(1);
    expect(_trackIsSvgProps.fill).toBe('none');
    expect(_spinnerIsSvgProps.strokeDasharray).toBe(1);
  });
});
