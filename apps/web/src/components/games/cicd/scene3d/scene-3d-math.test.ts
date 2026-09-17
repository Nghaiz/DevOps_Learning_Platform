/**
 * Ghim phần toán của cảnh 3D — chạy ở env `node`, KHÔNG cần WebGL.
 *
 * Hai ô nặng nhất, và cả hai gác một lỗi IM LẶNG:
 *
 * 1. **`NaN` bị chặn ở biên.** Một `NaN` lọt vào `BufferAttribute` làm three vứt
 *    TOÀN BỘ draw call đó mà không ném, không cảnh báo — một mảng cảnh biến mất
 *    và không gì nói tại sao. `toWorld`/`toWorldPath` là chỗ duy nhất chặn được.
 * 2. **Đóng khung chiếu đủ tám đỉnh.** Chỉ chiếu hai đỉnh `min`/`max` thì đỉnh
 *    chiếu ra xa nhất theo trục màn hình không nằm trong hai đỉnh đó, và cảnh bị
 *    cắt — ở CẢ BỐN góc mặc định, vì cả bốn đều là góc chéo. Ô dưới đây dựng đúng
 *    cảnh đó và bắt con số phải nhỏ hơn con số của phép hai-đỉnh.
 */
import { describe, expect, it } from 'vitest';

import { CAMERA_ANGLE_COUNT, CAMERA_ELEVATION, angleAzimuth } from './camera-angles';
import {
  WORLD_SCALE,
  ZOOM_RANGE,
  boundingRadius,
  boundsCorners,
  cameraBasis,
  dot,
  fitOrthographicZoom,
  toWorld,
  toWorldPath,
  worldCenter,
} from './scene-3d-math';

describe('toWorld', () => {
  it('nhân mỗi trục bằng đúng hệ số của trục đó', () => {
    expect(toWorld({ x: 3, y: 2, z: 4 })).toEqual({
      x: 3 * WORLD_SCALE.layer,
      y: 2 * WORLD_SCALE.height,
      z: 4 * WORLD_SCALE.lane,
    });
  });

  it.each([
    ['x', { x: Number.NaN, y: 0, z: 0 }],
    ['y', { x: 0, y: Number.NaN, z: 0 }],
    ['z', { x: 0, y: 0, z: Number.NaN }],
    ['vô cực', { x: 0, y: Number.POSITIVE_INFINITY, z: 0 }],
  ])('trả null khi %s không hữu hạn', (_label, point) => {
    expect(toWorld(point)).toBeNull();
  });
});

describe('toWorldPath', () => {
  it('đổi cả đường khi mọi điểm đều hữu hạn', () => {
    const path = toWorldPath([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 0, z: 2 },
    ]);
    expect(path).toHaveLength(3);
    expect(path?.[2]).toEqual({ x: WORLD_SCALE.layer, y: 0, z: 2 * WORLD_SCALE.lane });
  });

  it('loại CẢ đường khi một điểm giữa hỏng — không vẽ nửa đường', () => {
    expect(
      toWorldPath([
        { x: 0, y: 0, z: 0 },
        { x: Number.NaN, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
      ]),
    ).toBeNull();
  });

  it('loại đường chỉ có một điểm — không có đoạn nào để vẽ', () => {
    expect(toWorldPath([{ x: 0, y: 0, z: 0 }])).toBeNull();
  });
});

describe('cameraBasis', () => {
  it('cho ba vec-tơ trực chuẩn ở mọi góc mặc định', () => {
    for (let i = 0; i < CAMERA_ANGLE_COUNT; i += 1) {
      const basis = cameraBasis(angleAzimuth(i), CAMERA_ELEVATION);
      expect(dot(basis.dir, basis.dir)).toBeCloseTo(1, 10);
      expect(dot(basis.right, basis.right)).toBeCloseTo(1, 10);
      expect(dot(basis.up, basis.up)).toBeCloseTo(1, 10);
      expect(dot(basis.dir, basis.right)).toBeCloseTo(0, 10);
      expect(dot(basis.dir, basis.up)).toBeCloseTo(0, 10);
      expect(dot(basis.right, basis.up)).toBeCloseTo(0, 10);
    }
  });

  it('giữ `up` hướng lên ở mọi góc — camera không bao giờ lộn ngược', () => {
    for (let i = 0; i < CAMERA_ANGLE_COUNT; i += 1) {
      expect(cameraBasis(angleAzimuth(i), CAMERA_ELEVATION).up.y).toBeGreaterThan(0);
    }
  });

  it('nhìn thẳng từ đỉnh xuống vẫn cho một hệ trục dùng được', () => {
    const basis = cameraBasis(0, Math.PI / 2);
    expect(basis.dir.y).toBeCloseTo(1, 10);
    expect(dot(basis.right, basis.right)).toBeCloseTo(1, 10);
    expect(dot(basis.right, basis.dir)).toBeCloseTo(0, 10);
  });
});

describe('boundsCorners', () => {
  const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 1, z: 3 } };

  it('cho đúng tám đỉnh', () => {
    expect(boundsCorners(bounds)).toHaveLength(8);
  });

  it('nới ra ngoài tâm node — nếu không thì node đầu và node cuối bị cắt mất nửa', () => {
    const xs = boundsCorners(bounds).map((c) => c.x);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(2 * WORLD_SCALE.layer);
  });

  it('trả mảng rỗng khi khung bao hỏng, thay vì đẩy NaN vào camera', () => {
    expect(boundsCorners({ min: { x: Number.NaN, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } })).toEqual(
      [],
    );
  });
});

describe('worldCenter', () => {
  it('lấy trung điểm sau khi đã nhân tỉ lệ', () => {
    expect(worldCenter({ min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 2, z: 6 } })).toEqual({
      x: 2 * WORLD_SCALE.layer,
      y: 1 * WORLD_SCALE.height,
      z: 3 * WORLD_SCALE.lane,
    });
  });

  it('trả null khi khung bao hỏng', () => {
    expect(
      worldCenter({ min: { x: 0, y: 0, z: 0 }, max: { x: Number.NaN, y: 1, z: 1 } }),
    ).toBeNull();
  });
});

describe('fitOrthographicZoom', () => {
  const viewport = { width: 1200, height: 800 };
  const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 6, y: 1, z: 4 } };

  it('cho zoom sao cho MỌI đỉnh còn nằm trong khung', () => {
    for (let i = 0; i < CAMERA_ANGLE_COUNT; i += 1) {
      const basis = cameraBasis(angleAzimuth(i), CAMERA_ELEVATION);
      const corners = boundsCorners(bounds);
      const zoom = fitOrthographicZoom(corners, basis, viewport);
      const center = worldCenter(bounds);
      expect(center).not.toBeNull();
      if (center === null) continue;
      for (const corner of corners) {
        const rel = { x: corner.x - center.x, y: corner.y - center.y, z: corner.z - center.z };
        expect(Math.abs(dot(rel, basis.right)) * zoom).toBeLessThanOrEqual(viewport.width / 2);
        expect(Math.abs(dot(rel, basis.up)) * zoom).toBeLessThanOrEqual(viewport.height / 2);
      }
    }
  });

  /*
   * Đối chứng cho bẫy "chỉ chiếu hai đỉnh": ở góc chéo, bề rộng chiếu của CẢ hộp
   * lớn hơn bề rộng chiếu của riêng đường chéo min→max, nên phép tám-đỉnh phải
   * cho zoom NHỎ HƠN. Bằng nhau nghĩa là ai đó đã rút gọn về hai đỉnh.
   */
  it('chặt hơn phép chỉ-chiếu-hai-đỉnh ở góc nhìn chéo', () => {
    const basis = cameraBasis(angleAzimuth(0), CAMERA_ELEVATION);
    const corners = boundsCorners(bounds);
    const eight = fitOrthographicZoom(corners, basis, viewport);
    const firstCorner = corners[0];
    const lastCorner = corners[corners.length - 1];
    expect(firstCorner).toBeDefined();
    expect(lastCorner).toBeDefined();
    if (firstCorner === undefined || lastCorner === undefined) return;
    const two = fitOrthographicZoom([firstCorner, lastCorner], basis, viewport);
    expect(eight).toBeLessThan(two);
  });

  it('không chia cho 0 ở cảnh một node', () => {
    const basis = cameraBasis(angleAzimuth(2), CAMERA_ELEVATION);
    const zoom = fitOrthographicZoom(
      boundsCorners({ min: { x: 1, y: 0, z: 1 }, max: { x: 1, y: 0, z: 1 } }),
      basis,
      viewport,
    );
    expect(Number.isFinite(zoom)).toBe(true);
    expect(zoom).toBeLessThanOrEqual(ZOOM_RANGE.max);
    expect(zoom).toBeGreaterThanOrEqual(ZOOM_RANGE.min);
  });

  it('rơi về zoom nhỏ nhất khi khung hình chưa có kích thước', () => {
    const basis = cameraBasis(0, CAMERA_ELEVATION);
    expect(fitOrthographicZoom(boundsCorners(bounds), basis, { width: 0, height: 0 })).toBe(
      ZOOM_RANGE.min,
    );
  });
});

describe('boundingRadius', () => {
  it('không bao giờ trả 0 — mặt cắt gần của camera cần một con số dùng được', () => {
    expect(boundingRadius([], { x: 0, y: 0, z: 0 })).toBeGreaterThan(0);
  });

  it('lấy đỉnh xa nhất', () => {
    const radius = boundingRadius(
      [
        { x: 3, y: 0, z: 4 },
        { x: 1, y: 0, z: 0 },
      ],
      { x: 0, y: 0, z: 0 },
    );
    expect(radius).toBeCloseTo(5, 10);
  });
});
