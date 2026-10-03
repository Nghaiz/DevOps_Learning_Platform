/**
 * Hình học của một "tuyến metro" 2D cho thẻ lộ trình: đường gấp khúc chỉ đi ngang và chéo 45 độ
 * (đúng luật vẽ bản đồ metro), với các ga rải đều theo CHIỀU DÀI đường chứ không theo trục x.
 * Hàm thuần, khung 400×120, để test khẳng định được mà không cần DOM.
 */

export const ROUTE_WIDTH = 400;
export const ROUTE_HEIGHT = 120;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Mỗi lộ trình một dáng tuyến khác, chọn tất định theo thứ tự để render server và client khớp nhau. */
export function routePoints(index: number): readonly Point[] {
  const up = index % 2 === 0;
  const low = 84;
  const high = 36;
  const a = up ? low : high;
  const b = up ? high : low;
  const kink = 40 + (index % 3) * 22;
  return [
    { x: 18, y: a },
    { x: 18 + kink, y: a },
    { x: 18 + kink + Math.abs(a - b), y: b },
    { x: 250, y: b },
    { x: 250 + Math.abs(a - b) / 2, y: (a + b) / 2 },
    { x: ROUTE_WIDTH - 18, y: (a + b) / 2 },
  ];
}

export const routePathD = (points: readonly Point[]): string =>
  points.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');

const segmentLength = (from: Point, to: Point): number => Math.hypot(to.x - from.x, to.y - from.y);

export function routeLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    if (from !== undefined && to !== undefined) total += segmentLength(from, to);
  }
  return total;
}

/** Điểm nằm ở tỉ lệ `fraction` (0..1) dọc theo chiều dài tuyến. */
export function pointAt(points: readonly Point[], fraction: number): Point {
  const first = points[0] ?? { x: 0, y: 0 };
  let remaining = Math.min(1, Math.max(0, fraction)) * routeLength(points);
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    if (from === undefined || to === undefined) continue;
    const length = segmentLength(from, to);
    if (remaining <= length || i === points.length - 1) {
      const k = length === 0 ? 0 : Math.min(1, remaining / length);
      return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
    }
    remaining -= length;
  }
  return first;
}

/** Vị trí `count` ga, ga đầu và ga cuối nằm đúng hai đầu tuyến. Một ga thì đặt ở đầu tuyến. */
export function stopPoints(points: readonly Point[], count: number): readonly Point[] {
  if (count <= 0) return [];
  if (count === 1) return [pointAt(points, 0)];
  return Array.from({ length: count }, (_, i) => pointAt(points, i / (count - 1)));
}
