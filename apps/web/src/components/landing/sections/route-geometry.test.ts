import { describe, expect, it } from 'vitest';
import { ROUTE_HEIGHT, ROUTE_WIDTH, pointAt, routeLength, routePoints, stopPoints } from './route-geometry';
import type { Point } from './route-geometry';

/** Luật vẽ bản đồ metro: mỗi đoạn chỉ đi ngang hoặc chéo đúng 45 độ. */

const ROUTE_INDICES = Array.from({ length: 9 }, (_, i) => i);
const EPS = 1e-9;

const segments = (points: readonly Point[]): (readonly [Point, Point])[] =>
  points.slice(1).flatMap((to, i) => {
    const from = points[i];
    return from === undefined ? [] : [[from, to] as const];
  });

describe('route-geometry · routePoints', () => {
  it('mọi đoạn của 9 dáng tuyến đều ngang hoặc chéo đúng 45 độ', () => {
    const offenders: string[] = [];
    for (const index of ROUTE_INDICES) {
      for (const [from, to] of segments(routePoints(index))) {
        const dx = Math.abs(to.x - from.x);
        const dy = Math.abs(to.y - from.y);
        const horizontal = dy < EPS;
        const diagonal = Math.abs(dx - dy) < EPS;
        if (!(horizontal || diagonal)) {
          offenders.push(`tuyến ${String(index)}: (${String(from.x)},${String(from.y)}) -> (${String(to.x)},${String(to.y)})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('không có đoạn suy biến và tuyến luôn tiến sang phải', () => {
    for (const index of ROUTE_INDICES) {
      for (const [from, to] of segments(routePoints(index))) {
        expect(to.x - from.x, `tuyến ${String(index)}`).toBeGreaterThan(0);
      }
    }
  });

  it('mọi điểm nằm trong khung vẽ', () => {
    for (const index of ROUTE_INDICES) {
      for (const point of routePoints(index)) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(ROUTE_WIDTH);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(ROUTE_HEIGHT);
      }
    }
  });

  it('tất định: cùng chỉ số cho cùng dáng tuyến', () => {
    expect(routePoints(4)).toEqual(routePoints(4));
  });
});

describe('route-geometry · stopPoints', () => {
  const points = routePoints(0);
  const first = points[0];

  it('trả đúng số ga yêu cầu', () => {
    for (const count of [0, 1, 2, 3, 5, 8]) {
      expect(stopPoints(points, count)).toHaveLength(count);
    }
    expect(stopPoints(points, -2)).toEqual([]);
  });

  it('một ga thì đặt ở đầu tuyến', () => {
    expect(stopPoints(points, 1)).toEqual([first]);
  });

  it('ga đầu và ga cuối nằm đúng hai đầu tuyến', () => {
    for (const index of ROUTE_INDICES) {
      const route = routePoints(index);
      const routeFirst = route[0];
      const routeLast = route[route.length - 1];
      for (const count of [2, 4, 7]) {
        const stops = stopPoints(route, count);
        const firstStop = stops[0];
        const lastStop = stops[stops.length - 1];
        expect(firstStop?.x).toBeCloseTo(routeFirst?.x ?? Number.NaN, 9);
        expect(firstStop?.y).toBeCloseTo(routeFirst?.y ?? Number.NaN, 9);
        expect(lastStop?.x).toBeCloseTo(routeLast?.x ?? Number.NaN, 9);
        expect(lastStop?.y).toBeCloseTo(routeLast?.y ?? Number.NaN, 9);
      }
    }
  });

  it('các ga rải đều theo chiều dài tuyến', () => {
    const route = routePoints(1);
    const stops = stopPoints(route, 5);
    const step = routeLength(route) / 4;
    /* Đo khoảng cách dọc tuyến bằng cách dò lại tỉ lệ của từng ga trên một lưới mịn. */
    const fractionOf = (stop: Point): number => {
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let k = 0; k <= 4000; k += 1) {
        const candidate = pointAt(route, k / 4000);
        const distance = Math.hypot(candidate.x - stop.x, candidate.y - stop.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = k / 4000;
        }
      }
      return best;
    };
    stops.forEach((stop, i) => {
      expect(fractionOf(stop) * routeLength(route)).toBeCloseTo(step * i, 0);
    });
  });
});

describe('route-geometry · pointAt', () => {
  const points = routePoints(2);
  const first = points[0];
  const last = points[points.length - 1];

  it('kẹp tỉ lệ âm về đầu tuyến', () => {
    expect(pointAt(points, -0.5)).toEqual(pointAt(points, 0));
    expect(pointAt(points, -100)).toEqual(pointAt(points, 0));
    expect(pointAt(points, 0)).toEqual(first);
  });

  it('kẹp tỉ lệ lớn hơn 1 về cuối tuyến', () => {
    expect(pointAt(points, 1.5)).toEqual(pointAt(points, 1));
    expect(pointAt(points, 100)).toEqual(pointAt(points, 1));
    const end = pointAt(points, 1);
    expect(end.x).toBeCloseTo(last?.x ?? Number.NaN, 9);
    expect(end.y).toBeCloseTo(last?.y ?? Number.NaN, 9);
  });

  it('tuyến rỗng trả gốc toạ độ thay vì ném', () => {
    expect(pointAt([], 0.5)).toEqual({ x: 0, y: 0 });
  });
});
