import { describe, expect, it } from 'vitest';
import {
  EDGE_SEGMENTS,
  EDGE_TRIM,
  RELATION_TOKEN,
  arcBend,
  arcHeight,
  fanOffset,
  pairKey,
  writeCurve,
  type RelationKind,
} from './edge-routing';

const A = { x: 0, y: 0, z: 0 };
const B = { x: 10, y: 0, z: 0 };

describe('fanOffset', () => {
  it('xoè đều hai bên quanh đường giữa', () => {
    expect([0, 1, 2, 3, 4, 5].map(fanOffset)).toEqual([0, 1, -1, 2, -2, 3]);
  });

  it('bậc âm coi như không xoè', () => {
    expect(fanOffset(-3)).toBe(0);
  });
});

describe('pairKey', () => {
  it('không phân biệt chiều', () => {
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
  });

  it('tách được hai cặp khác nhau', () => {
    expect(pairKey('a', 'b')).not.toBe(pairKey('a', 'c'));
  });
});

describe('arcHeight', () => {
  it('phồng theo sqrt, không theo khoảng cách', () => {
    // Gấp bốn khoảng cách thì phần phồng chỉ gấp đôi — đây LÀ luật, không phải
    // hệ quả tình cờ: nó là thứ giữ dây dài khỏi hoá cầu vồng.
    const near = arcHeight(4) - 0.28;
    const far = arcHeight(16) - 0.28;
    expect(far / near).toBeCloseTo(2, 5);
  });

  it('dây ngắn gần như phẳng', () => {
    expect(arcHeight(1)).toBeLessThan(0.7);
  });

  it('có trần, kể cả với cụm rất rộng', () => {
    expect(arcHeight(1_000)).toBeLessThanOrEqual(2.2);
  });

  it('không âm ở khoảng cách 0', () => {
    expect(arcHeight(0)).toBeGreaterThan(0);
  });
});

describe('arcBend', () => {
  it('bậc 0 thì không bạt', () => {
    expect(arcBend(12, 0)).toBe(0);
  });

  it('hai bậc đối xứng thì bạt ngược chiều, cùng độ lớn', () => {
    expect(arcBend(12, 1)).toBe(-arcBend(12, -1));
  });

  it('có trần', () => {
    expect(Math.abs(arcBend(1_000, 1))).toBeLessThanOrEqual(0.62);
  });
});

describe('writeCurve', () => {
  it('ghi đúng 6 số cho mỗi đoạn', () => {
    const out: number[] = [];
    writeCurve(out, A, B, 0);
    expect(out).toHaveLength(EDGE_SEGMENTS * 6);
  });

  it('cắt hai đầu nên dây không chạm tâm vật', () => {
    const out: number[] = [];
    writeCurve(out, A, B, 0);
    const firstX = out[0] ?? Number.NaN;
    const lastX = out[out.length - 3] ?? Number.NaN;
    expect(firstX).toBeCloseTo(10 * EDGE_TRIM, 5);
    expect(lastX).toBeCloseTo(10 * (1 - EDGE_TRIM), 5);
  });

  it('đỉnh cung nằm trên đường nối, không dưới', () => {
    const out: number[] = [];
    writeCurve(out, A, B, 0);
    let peak = 0;
    for (let i = 1; i < out.length; i += 3) {
      peak = Math.max(peak, out[i] ?? 0);
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(arcHeight(10));
  });

  it('bậc xoè đẩy dây ra khỏi mặt phẳng nối — hai cạnh cùng cặp không đè nhau', () => {
    const straight: number[] = [];
    const fanned: number[] = [];
    writeCurve(straight, A, B, 0);
    writeCurve(fanned, A, B, 1);
    // Giữa dây là chỗ lệch nhiều nhất; trục z là trục bạt cho cặp nằm trên trục x.
    const middle = Math.floor(EDGE_SEGMENTS / 2) * 6 + 2;
    expect(Math.abs((fanned[middle] ?? 0) - (straight[middle] ?? 0))).toBeGreaterThan(0.2);
  });

  it('bạt vuông góc với dây trên mặt sàn, kể cả khi hai đầu lệch độ cao', () => {
    // Hai đầu lệch cao: nếu bạt theo pháp tuyến 3D thì dây nghiêng đi và hai
    // cạnh cùng cặp lại chồng nhau. Bạt phải nằm ngang.
    const out: number[] = [];
    writeCurve(out, { x: 0, y: 0, z: 0 }, { x: 10, y: 6, z: 0 }, 1);
    const middle = Math.floor(EDGE_SEGMENTS / 2) * 6;
    // Cặp nằm trên trục x ⇒ toàn bộ độ bạt phải rơi vào z.
    expect(Math.abs(out[middle + 2] ?? 0)).toBeGreaterThan(0.2);
  });

  it('không cấp phát lại: ghi tiếp vào mảng có sẵn', () => {
    const out = [1, 2, 3];
    writeCurve(out, A, B, 0);
    expect(out).toHaveLength(3 + EDGE_SEGMENTS * 6);
    expect(out.slice(0, 3)).toEqual([1, 2, 3]);
  });
});

describe('RELATION_TOKEN', () => {
  it('phủ đủ năm quan hệ engine phát ra', () => {
    const kinds: readonly RelationKind[] = ['owns', 'runs-on', 'selects', 'routes', 'mounts'];
    for (const kind of kinds) {
      expect(RELATION_TOKEN[kind]).toMatch(/^kind-/);
    }
  });

  it('quan hệ mạng dùng chung sắc của tài nguyên mạng', () => {
    expect(RELATION_TOKEN.selects).toBe(RELATION_TOKEN.routes);
  });
});
