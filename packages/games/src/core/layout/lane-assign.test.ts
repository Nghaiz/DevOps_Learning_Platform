import { describe, expect, it } from 'vitest';
import { type LaneNode, assignLanes } from './lane-assign.ts';

/**
 * ⚠ `assignLanes` KHÔNG tự sắp lại đầu vào — nó tin vào thứ tự `(depth, id)` mà
 * `dag-layout.ts` đã dựng. Mọi mảng trong file này viết sẵn theo thứ tự đó.
 */
describe('assignLanes — gom chuỗi', () => {
  it('đồ thị rỗng', () => {
    expect(assignLanes([])).toEqual({ laneOf: {}, laneCount: 0, chainHeads: [] });
  });

  it('chuỗi tuyến tính dùng chung một làn', () => {
    const out = assignLanes([
      { id: 'c1', parents: [] },
      { id: 'c2', parents: ['c1'] },
      { id: 'c3', parents: ['c2'] },
    ]);
    expect(out.laneCount).toBe(1);
    expect(out.laneOf).toEqual({ c1: 0, c2: 0, c3: 0 });
  });

  /**
   * Cha chỉ nhường chuỗi cho MỘT con. Con thứ hai phải mở chuỗi mới — đó chính
   * là chỗ rẽ nhánh, và là lý do làn mang nghĩa "nhánh".
   */
  it('cha chỉ nhường làn cho một con, con thứ hai mở làn mới', () => {
    const out = assignLanes([
      { id: 'c1', parents: [] },
      { id: 'a1', parents: ['c1'] },
      { id: 'b1', parents: ['c1'] },
    ]);
    expect(out.laneCount).toBe(2);
    expect(out.laneOf['a1']).not.toBe(out.laneOf['b1']);
    // `a1` đứng trước `b1` theo thứ tự chuẩn tắc nên `a1` là con kế thừa.
    expect(out.laneOf['a1']).toBe(out.laneOf['c1']);
  });

  it('commit merge nối tiếp chuỗi của CHA THỨ NHẤT', () => {
    const out = assignLanes([
      { id: 'c1', parents: [] },
      { id: 'a1', parents: ['c1'] },
      { id: 'b1', parents: ['c1'] },
      { id: 'm1', parents: ['a1', 'b1'] },
    ]);
    expect(out.laneOf['m1']).toBe(out.laneOf['a1']);
    expect(out.laneOf['m1']).not.toBe(out.laneOf['b1']);
  });

  it('mỗi gốc rời mở một chuỗi riêng', () => {
    const out = assignLanes([
      { id: 'r1', parents: [] },
      { id: 'r2', parents: [] },
      { id: 'r3', parents: [] },
    ]);
    expect(out.laneCount).toBe(3);
    expect(new Set(Object.values(out.laneOf)).size).toBe(3);
  });

  it('chainHeads đánh chỉ số theo làn và không rỗng', () => {
    const out = assignLanes([
      { id: 'c1', parents: [] },
      { id: 'a1', parents: ['c1'] },
      { id: 'b1', parents: ['c1'] },
    ]);
    expect(out.chainHeads).toHaveLength(out.laneCount);
    for (const head of out.chainHeads) expect(head).not.toBe('');
    // Node mở đầu một chuỗi phải nằm đúng làn mà `chainHeads` khai.
    out.chainHeads.forEach((head, lane) => {
      expect(out.laneOf[head]).toBe(lane);
    });
  });
});

describe('assignLanes — laneHint thắng hình dạng', () => {
  it('cùng hint thì cùng làn kể cả khi không nối nhau qua cha thứ nhất', () => {
    const out = assignLanes([
      { id: 'c1', parents: [], laneHint: 'main' },
      { id: 'a1', parents: ['c1'] },
      { id: 'b1', parents: ['c1'], laneHint: 'main' },
    ]);
    expect(out.laneOf['b1']).toBe(out.laneOf['c1']);
  });

  it('hint gặp lần đầu vẫn kế thừa được làn của cha', () => {
    const out = assignLanes([
      { id: 'c1', parents: [] },
      { id: 'c2', parents: ['c1'], laneHint: 'main' },
    ]);
    expect(out.laneCount).toBe(1);
    expect(out.laneOf['c2']).toBe(out.laneOf['c1']);
  });
});

describe('assignLanes — làn nằm trong khoảng hợp lệ', () => {
  const GRAPH: readonly LaneNode[] = [
    { id: 'c1', parents: [] },
    { id: 'c2', parents: ['c1'] },
    { id: 'f1', parents: ['c1'] },
    { id: 'c3', parents: ['c2'] },
    { id: 'f2', parents: ['f1'] },
    { id: 'g1', parents: ['c2'] },
    { id: 'm1', parents: ['c3', 'f2'] },
  ];

  it('mọi làn thuộc [0, laneCount) và phủ kín', () => {
    const out = assignLanes(GRAPH);
    const lanes = Object.values(out.laneOf);
    expect(lanes).toHaveLength(GRAPH.length);
    for (const lane of lanes) {
      expect(lane).toBeGreaterThanOrEqual(0);
      expect(lane).toBeLessThan(out.laneCount);
    }
    expect(new Set(lanes).size).toBe(out.laneCount);
  });

  /**
   * Heuristic trung vị chạy số lượt CỐ ĐỊNH, không lặp tới hội tụ — một cấu hình
   * đối xứng có thể dao động giữa hai thứ tự cùng điểm và không bao giờ dừng.
   * Khẳng định ở đây là kết quả ỔN ĐỊNH giữa các lượt gọi, không phải nó tối ưu.
   */
  it('gọi nhiều lần cho cùng một kết quả', () => {
    expect(JSON.stringify(assignLanes(GRAPH))).toBe(JSON.stringify(assignLanes(GRAPH)));
  });
});
