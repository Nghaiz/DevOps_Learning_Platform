import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { STATION_COUNT } from '../journey-timeline';
import { STATION_U, TRUNK, frameAt, makePose, stationCenter, stationLine, trackPose } from './world';

/**
 * Hình học của thế giới 3D. Các ngưỡng ở đây là RÀO, không phải số đo: đo 2026-10-03 trên bản
 * này, cặp ga gần nhất cách 29.4 đơn vị, bước nhảy camera lớn nhất 0.40 (vị trí) và 0.57 (điểm
 * nhìn) giữa hai mẫu cách 0.01, đầu tuyến màu cách tâm ga 3.1.
 */

const stations = Array.from({ length: STATION_COUNT }, (_, i) => i);

describe('world · ga', () => {
  it('có đúng một tham số tuyến cho mỗi ga, tăng dần dọc tuyến', () => {
    expect(STATION_U).toHaveLength(STATION_COUNT);
    STATION_U.forEach((u, i) => {
      expect(u).toBeGreaterThan(0);
      expect(u).toBeLessThan(1);
      if (i > 0) expect(u).toBeGreaterThan(STATION_U[i - 1] ?? 1);
    });
  });

  it('vector "phải" của khung là ngang, đơn vị, vuông góc với hướng tuyến', () => {
    for (const i of stations) {
      const frame = frameAt(STATION_U[i] ?? 0);
      expect(frame.right.length()).toBeCloseTo(1, 9);
      expect(frame.right.y).toBeCloseTo(0, 9);
      expect(frame.right.dot(frame.tangent)).toBeCloseTo(0, 9);
    }
  });

  it('mọi tâm ga nằm bên PHẢI tuyến đỏ', () => {
    for (const i of stations) {
      const frame = frameAt(STATION_U[i] ?? 0);
      const offset = stationCenter(i).sub(frame.point);
      expect(offset.dot(frame.right), `ga ${String(i)}`).toBeGreaterThan(0);
    }
  });

  it('không khúc quanh nào khác của tuyến đỏ cắt qua sân ga', () => {
    const trunk = TRUNK.getSpacedPoints(2000);
    for (const i of stations) {
      const center = stationCenter(i);
      const nearest = Math.min(...trunk.map((point) => Math.hypot(point.x - center.x, point.z - center.z)));
      expect(nearest, `ga ${String(i)}`).toBeGreaterThan(6);
    }
  });

  it('các tâm ga cách nhau từng đôi ít nhất 15 đơn vị', () => {
    const centers = stations.map((i) => stationCenter(i));
    for (let a = 0; a < centers.length; a += 1) {
      for (let b = a + 1; b < centers.length; b += 1) {
        const from = centers[a] ?? new Vector3();
        const to = centers[b] ?? new Vector3();
        expect(from.distanceTo(to), `ga ${String(a)} - ga ${String(b)}`).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it('stationCenter ghi vào vector `out` được truyền vào', () => {
    const out = new Vector3();
    expect(stationCenter(2, out)).toBe(out);
    expect(out.equals(stationCenter(2))).toBe(true);
  });
});

describe('world · tuyến màu', () => {
  it('tuyến màu của mỗi ga kết thúc cách tâm ga không quá 4 đơn vị', () => {
    for (const i of stations) {
      const end = stationLine(i).getPointAt(1);
      expect(end.distanceTo(stationCenter(i)), `ga ${String(i)}`).toBeLessThanOrEqual(4);
    }
  });
});

describe('world · camera', () => {
  const samples = (): { track: number; position: Vector3; target: Vector3 }[] => {
    const pose = makePose();
    return Array.from({ length: 601 }, (_, k) => {
      const track = -1 + k / 100;
      trackPose(track, pose);
      return { track, position: pose.position.clone(), target: pose.target.clone() };
    });
  };

  it('vị trí camera không nhảy quá 2.5 đơn vị giữa hai mẫu cách 0.01 trên [-1, 5]', () => {
    const jumps: string[] = [];
    const all = samples();
    for (let k = 1; k < all.length; k += 1) {
      const before = all[k - 1];
      const after = all[k];
      if (before === undefined || after === undefined) continue;
      const distance = before.position.distanceTo(after.position);
      if (distance > 2.5) jumps.push(`track ${after.track.toFixed(2)}: ${distance.toFixed(3)}`);
    }
    expect(all).toHaveLength(601);
    expect(jumps).toEqual([]);
  });

  it('điểm nhìn của camera cũng không nhảy quá 2.5 đơn vị', () => {
    const jumps: string[] = [];
    const all = samples();
    for (let k = 1; k < all.length; k += 1) {
      const before = all[k - 1];
      const after = all[k];
      if (before === undefined || after === undefined) continue;
      const distance = before.target.distanceTo(after.target);
      if (distance > 2.5) jumps.push(`track ${after.track.toFixed(2)}: ${distance.toFixed(3)}`);
    }
    expect(jumps).toEqual([]);
  });

  it('kẹp track ngoài [-1, 5] về hai đầu', () => {
    const outside = makePose();
    const edge = makePose();
    trackPose(-3, outside);
    trackPose(-1, edge);
    expect(outside.position.equals(edge.position)).toBe(true);
    trackPose(9, outside);
    trackPose(STATION_COUNT - 1, edge);
    expect(outside.position.equals(edge.position)).toBe(true);
  });

  it('camera di chuyển thật giữa hai ga (không đứng im cả chặng)', () => {
    const a = makePose();
    const b = makePose();
    trackPose(0, a);
    trackPose(1, b);
    expect(a.position.distanceTo(b.position)).toBeGreaterThan(15);
  });
});
