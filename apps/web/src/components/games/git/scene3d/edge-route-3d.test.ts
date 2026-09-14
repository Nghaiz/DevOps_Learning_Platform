/**
 * Test cho định tuyến cạnh 3D (17.K.5).
 *
 * Chạy ở env `node` — không docblock `@vitest-environment`, và đó là điều kiện
 * để test này tồn tại: `edge-route-3d.ts` không import `three`, nên phép đặt
 * chỗ kiểm được mà không cần WebGL. Mọi file `scene/*.tsx` của game K8s đều
 * không có test vì chúng không tách được phần toán ra khỏi phần vẽ.
 */

import { describe, expect, it } from 'vitest';
import {
  GAP_ARC_SEGMENTS,
  polylineLength,
  polylineSegments,
  routeEdge3d,
  routeEdges3d,
  routeSegmentCount,
  type EdgeRoute3D,
} from './edge-route-3d.ts';
import {
  NODE_RADIUS,
  PLATE_FLOOR,
  X_STEP,
  Y_STEP,
  Z_STEP,
  type Routed3D,
  type Vec3,
} from './scene3d-contract.ts';

function edge(from: Vec3, to: Vec3, over = false): Routed3D {
  return {
    key: `${from.join(',')}->${to.join(',')}`,
    kind: over ? 'remote-mirror' : 'parent',
    fromId: `local:${from.join(',')}`,
    toId: `${over ? 'origin' : 'local'}:${to.join(',')}`,
    from,
    to,
    crossesGap: over,
  };
}

/** Hướng đơn vị của đoạn thứ `i`. */
function direction(route: EdgeRoute3D, i: number): Vec3 {
  const a = route.points[i] as Vec3;
  const b = route.points[i + 1] as Vec3;
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / len, d[1] / len, d[2] / len];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

describe('cạnh trong cùng một làn', () => {
  it('là một đoạn thẳng, không có chỗ rẽ nào', () => {
    const route = routeEdge3d(edge([0, 0, 0], [X_STEP * 3, 0, 0]));
    expect(route.points).toHaveLength(2);
    expect(routeSegmentCount(route)).toBe(1);
  });

  it('giữ nguyên phương của đoạn gốc sau khi lùi hai đầu', () => {
    const route = routeEdge3d(edge([0, 0, 0], [X_STEP * 3, 0, 0]));
    expect(direction(route, 0)).toEqual([1, 0, 0]);
  });
});

describe('lùi hai đầu vào bán kính ô commit', () => {
  it('cắt đúng NODE_RADIUS ở mỗi đầu khi cạnh đủ dài', () => {
    const full = X_STEP * 3;
    const route = routeEdge3d(edge([0, 0, 0], [full, 0, 0]));
    expect((route.points[0] as Vec3)[0]).toBeCloseTo(NODE_RADIUS, 9);
    expect((route.points[1] as Vec3)[0]).toBeCloseTo(full - NODE_RADIUS, 9);
  });

  it('không xoá sạch một cạnh ngắn hơn hai lần bán kính', () => {
    // Ngắn hơn `2 * NODE_RADIUS`: phép cắt mong muốn sẽ ăn hết cả đường. Trần
    // 40% mỗi đầu là thứ giữ cho nét vẽ còn tồn tại.
    const tiny = NODE_RADIUS;
    const route = routeEdge3d(edge([0, 0, 0], [tiny, 0, 0]));
    expect(route.points.length).toBeGreaterThanOrEqual(2);
    expect(polylineLength(route.points)).toBeGreaterThan(0);
    expect(polylineLength(route.points)).toBeLessThan(tiny);
  });

  it('không sinh toạ độ nằm ngoài đoạn gốc', () => {
    const route = routeEdge3d(edge([0, 0, 0], [X_STEP, 0, 0]));
    for (const p of route.points) {
      expect(p[0]).toBeGreaterThanOrEqual(0);
      expect(p[0]).toBeLessThanOrEqual(X_STEP);
    }
  });
});

describe('cạnh đổi làn', () => {
  const crossing = routeEdge3d(edge([0, 0, 0], [X_STEP, Y_STEP, Z_STEP]));

  it('có đúng ba đoạn: dọc X, cắt ngang làn, dọc X', () => {
    expect(crossing.points).toHaveLength(4);
    expect(routeSegmentCount(crossing)).toBe(3);
  });

  it('cắt ngang ở CHÍNH GIỮA hai cột X, không dính vào đầu nào', () => {
    const mid = X_STEP / 2;
    expect((crossing.points[1] as Vec3)[0]).toBeCloseTo(mid, 9);
    expect((crossing.points[2] as Vec3)[0]).toBeCloseTo(mid, 9);
  });

  it('đoạn cắt ngang vuông góc THẬT với hai đoạn dọc X', () => {
    // Y sinh ra từ `lane`, nên đoạn cắt ngang đi chéo trong mặt phẳng YZ —
    // nhưng nó vẫn vuông góc với trục X. Đây là bất biến, không phải thẩm mỹ.
    expect(dot(direction(crossing, 0), direction(crossing, 1))).toBeCloseTo(0, 12);
    expect(dot(direction(crossing, 1), direction(crossing, 2))).toBeCloseTo(0, 12);
  });

  it('hai đoạn dọc X nằm đúng trên làn của hai đầu', () => {
    expect((crossing.points[1] as Vec3)[2]).toBeCloseTo(0, 9);
    expect((crossing.points[2] as Vec3)[2]).toBeCloseTo(Z_STEP, 9);
  });

  it('rút về một đoạn thẳng khi hai đầu cùng cột X', () => {
    // `cherry-source` giữa hai commit cùng thời điểm logic. Hai điểm rẽ rơi
    // trùng lên hai đầu; giữ chúng lại sẽ sinh hai đoạn dài 0 trong buffer.
    const flat = routeEdge3d(edge([0, 0, 0], [0, Y_STEP, Z_STEP]));
    expect(flat.points).toHaveLength(2);
  });
});

describe('cạnh bắc qua khoảng trống giữa hai kho', () => {
  const gap = Z_STEP * 8;
  const arc = routeEdge3d(edge([0, 0, 0], [0, 0, gap], true));
  const plain = routeEdge3d(edge([0, 0, 0], [0, 0, gap]));

  it('có hình dạng KHÁC hẳn cạnh thường trên cùng hai đầu', () => {
    expect(arc.points.length).toBeGreaterThan(plain.points.length);
    expect(arc.points).not.toEqual(plain.points);
  });

  it('vồng lên trên cả hai đầu — đọc ra là "cùng commit ở kho kia"', () => {
    const top = Math.max(...arc.points.map((p) => p[1]));
    expect(top).toBeGreaterThan(0);
  });

  it('dài hơn đường thẳng nối hai đầu', () => {
    expect(polylineLength(arc.points)).toBeGreaterThan(polylineLength(plain.points));
  });

  it('không bao giờ chạm vùng mặt phẳng ô file, kể cả khi khoảng trống rất rộng', () => {
    // `assertPlanesClearOfDag()` chỉ gác độ lệch nhánh của NODE — nó mù với cung
    // này. Trần trong `arcApexY()` là thứ duy nhất chặn nét vẽ xuyên mặt phẳng.
    for (const span of [Z_STEP * 4, Z_STEP * 40, Z_STEP * 400]) {
      const wide = routeEdge3d(edge([0, 0, 0], [0, 0, span], true));
      const top = Math.max(...wide.points.map((p) => p[1]));
      expect(top).toBeLessThan(PLATE_FLOOR);
    }
  });

  it('lấy mẫu đủ dày để không đọc ra thành hình đa giác', () => {
    // Trừ hai điểm bị phép lùi đầu nuốt mất, cung vẫn phải còn phần lớn số mẫu.
    expect(arc.points.length).toBeGreaterThan(GAP_ARC_SEGMENTS / 2);
  });
});

describe('tất định và an toàn cho buffer', () => {
  it('cùng đầu vào cho ra cùng mảng điểm', () => {
    const input = edge([0, 0, 0], [X_STEP * 2, Y_STEP * 3, Z_STEP * 3]);
    expect(routeEdge3d(input).points).toEqual(routeEdge3d(input).points);
  });

  it('giữ nguyên thứ tự khi định tuyến cả cảnh', () => {
    const inputs = [
      edge([0, 0, 0], [X_STEP, 0, 0]),
      edge([X_STEP, 0, 0], [X_STEP * 2, Y_STEP, Z_STEP]),
      edge([0, 0, 0], [0, 0, Z_STEP * 9], true),
    ];
    expect(routeEdges3d(inputs).map((r) => r.key)).toEqual(inputs.map((e) => e.key));
  });

  it('không sinh NaN hay Infinity ở bất kỳ hình dạng đầu vào nào', () => {
    // Một NaN lọt vào BufferAttribute làm three vứt TOÀN BỘ draw call đó, im
    // lặng — nên chỗ rẻ nhất để chặn là ở đây, trước khi có buffer nào.
    const shapes: Routed3D[] = [
      edge([0, 0, 0], [0, 0, 0]),
      edge([0, 0, 0], [0, 0, 0], true),
      edge([1, 2, 3], [1, 2, 3]),
      edge([0, 0, 0], [X_STEP, Y_STEP, Z_STEP]),
      edge([X_STEP, Y_STEP, Z_STEP], [0, 0, 0]),
      edge([-X_STEP, 0, -Z_STEP], [X_STEP, Y_STEP * 2, Z_STEP * 2], true),
    ];
    for (const route of routeEdges3d(shapes)) {
      expect(route.points.length).toBeGreaterThanOrEqual(2);
      for (const p of route.points) for (const n of p) expect(Number.isFinite(n)).toBe(true);
    }
  });

  it('nở đường gấp khúc thành CẶP đỉnh rời, không phải dải nối tiếp', () => {
    const out: number[] = [];
    const route = routeEdge3d(edge([0, 0, 0], [X_STEP, Y_STEP, Z_STEP]));
    polylineSegments(route.points, out);
    expect(out).toHaveLength(routeSegmentCount(route) * 6);
    // Đỉnh cuối của đoạn k phải TRÙNG đỉnh đầu của đoạn k+1 — nếu không, đường
    // đứt quãng giữa hai đoạn mà không có lỗi nào báo.
    for (let s = 1; s < routeSegmentCount(route); s += 1) {
      expect(out.slice(s * 6, s * 6 + 3)).toEqual(out.slice(s * 6 - 3, s * 6));
    }
  });
});
