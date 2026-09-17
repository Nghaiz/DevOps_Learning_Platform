/**
 * Ghim bốn góc camera cố định (19.D.3.2).
 *
 * Ô đáng giá nhất ở đây là ô quấn vòng: nút "xoay trái" ở góc 0 phải về góc
 * cuối, không phải về −1. Một `-1` lọt xuống `CAMERA_ANGLE_LABELS[-1]` cho
 * `undefined`, và `aria-label` của nút xoay thành chuỗi rỗng — trình đọc màn
 * hình đọc ra một nút không tên, mà không gì đỏ.
 *
 * Hai ô dưới đây ĐÃ bắt hai bản sai liên tiếp của bộ góc; lý lẽ đầy đủ ở
 * `camera-angles.ts`, khối trên `CAMERA_ANGLE_COUNT`.
 */
import { describe, expect, it } from 'vitest';

import {
  CAMERA_ANGLE_COUNT,
  CAMERA_ANGLE_LABELS,
  CAMERA_ELEVATION,
  angleAzimuth,
  angleLabel,
  normalizeAngleIndex,
  stepAngle,
} from './camera-angles';
import { cameraBasis, dot } from './scene-3d-math';

describe('normalizeAngleIndex', () => {
  it.each([
    [0, 0],
    [3, 3],
    [4, 0],
    [5, 1],
    [-1, 3],
    [-4, 0],
    [-5, 3],
    [17, 1],
  ])('đưa %i về %i', (input, expected) => {
    expect(normalizeAngleIndex(input)).toBe(expected);
  });

  it('mọi chỉ số đều rơi vào khoảng hợp lệ', () => {
    for (let i = -20; i <= 20; i += 1) {
      const index = normalizeAngleIndex(i);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(CAMERA_ANGLE_COUNT);
    }
  });

  it('không nổ với giá trị không hữu hạn', () => {
    expect(normalizeAngleIndex(Number.NaN)).toBe(0);
    expect(normalizeAngleIndex(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('stepAngle', () => {
  it('quấn vòng ở cả hai chiều', () => {
    expect(stepAngle(CAMERA_ANGLE_COUNT - 1, 1)).toBe(0);
    expect(stepAngle(0, -1)).toBe(CAMERA_ANGLE_COUNT - 1);
  });

  it('đi hết một vòng thì về chỗ cũ', () => {
    let index = 1;
    for (let i = 0; i < CAMERA_ANGLE_COUNT; i += 1) {
      index = stepAngle(index, 1);
    }
    expect(index).toBe(1);
  });
});

describe('angleAzimuth', () => {
  it('cách đều nhau đúng một phần của vòng tròn', () => {
    const step = (Math.PI * 2) / CAMERA_ANGLE_COUNT;
    for (let i = 1; i < CAMERA_ANGLE_COUNT; i += 1) {
      expect(angleAzimuth(i) - angleAzimuth(i - 1)).toBeCloseTo(step, 12);
    }
  });

  /*
   * Ô này đã BẮT một lỗi thật, không phải trang trí: bản đầu là TÁM góc bước 45°
   * từ gốc 45°, và khi đó bốn trong tám rơi đúng vào 90°/180°/270°/360° — camera
   * nằm trên trục Z (mọi làn chồng lên nhau) hoặc trên trục X (mọi tầng phụ
   * thuộc chồng lên nhau). Ngưỡng để ở 0.3 chứ không 0.01: "khác 0" chỉ loại
   * được đúng trường hợp trùng khít, còn thứ cần giữ là hai trục TÁCH ĐỦ ĐỂ ĐỌC.
   */
  it('không góc nào nhìn dọc một trục — ở đó cả một trục chồng lên chính nó', () => {
    for (let i = 0; i < CAMERA_ANGLE_COUNT; i += 1) {
      const azimuth = angleAzimuth(i);
      expect(Math.abs(Math.sin(azimuth))).toBeGreaterThan(0.3);
      expect(Math.abs(Math.cos(azimuth))).toBeGreaterThan(0.3);
    }
  });
});

describe('CAMERA_ELEVATION', () => {
  /*
   * Góc trục lượng là độ cao DUY NHẤT mà một bước trên mỗi trục chiếu ra cùng
   * một độ dài trên màn hình — tức là độ cao duy nhất mà "đếm ô" đọc được như
   * nhau ở cả ba trục.
   *
   * Kiểm bằng chính tính chất đó, KHÔNG bằng con số 35.264°: một hằng số chép
   * tay vẫn khớp khi ai đó đổi công thức sinh ra nó thành sai, còn tính chất thì
   * không.
   */
  it('chiếu một bước của cả ba trục ra cùng độ dài trên màn hình', () => {
    const basis = cameraBasis(angleAzimuth(0), CAMERA_ELEVATION);
    const project = (v: { x: number; y: number; z: number }): number =>
      Math.hypot(dot(v, basis.right), dot(v, basis.up));
    const alongX = project({ x: 1, y: 0, z: 0 });
    const alongY = project({ x: 0, y: 1, z: 0 });
    const alongZ = project({ x: 0, y: 0, z: 1 });
    expect(alongY).toBeCloseTo(alongX, 12);
    expect(alongZ).toBeCloseTo(alongX, 12);
    expect(alongX).toBeGreaterThan(0);
  });

  it('một độ cao KHÁC phá đúng tính chất đó — đối chứng dương cho ô trên', () => {
    const basis = cameraBasis(angleAzimuth(0), CAMERA_ELEVATION + 0.3);
    const project = (v: { x: number; y: number; z: number }): number =>
      Math.hypot(dot(v, basis.right), dot(v, basis.up));
    expect(project({ x: 0, y: 1, z: 0 })).not.toBeCloseTo(project({ x: 1, y: 0, z: 0 }), 6);
  });

  it('nhìn chếch từ trên xuống, không phải ngang và không phải thẳng đỉnh', () => {
    expect(CAMERA_ELEVATION).toBeGreaterThan(0.2);
    expect(CAMERA_ELEVATION).toBeLessThan(Math.PI / 2 - 0.2);
  });
});

describe('angleLabel', () => {
  it('có đủ một nhãn cho mỗi góc', () => {
    expect(CAMERA_ANGLE_LABELS).toHaveLength(CAMERA_ANGLE_COUNT);
    for (const label of CAMERA_ANGLE_LABELS) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('không bao giờ trả chuỗi rỗng, kể cả với chỉ số âm hay vượt trần', () => {
    for (const index of [-1, -9, 8, 42, Number.NaN]) {
      expect(angleLabel(index).length).toBeGreaterThan(0);
    }
  });
});
