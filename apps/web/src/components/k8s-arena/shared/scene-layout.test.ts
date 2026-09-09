import { describe, expect, it } from 'vitest';
import {
  PLATFORM_DEPTH,
  PLATFORM_GAP,
  PLATFORM_HEIGHT,
  PLATFORM_WIDTH,
  POD_SIZE,
  computeLayout,
  platformX,
  podGrid,
} from './scene-layout';
import { clusterView, nodeView, podView, serviceView } from './test-fixtures';

/**
 * Bố cục là phần DUY NHẤT của renderer 3D kiểm được không cần WebGL, nên nó gánh
 * phần lớn giá trị test của lane E. Mọi lỗi vẽ "vật biến mất" / "pod chồng nhau"
 * / "cảnh nhảy chỗ mỗi tick" đều là lỗi ở đây.
 */
describe('computeLayout', () => {
  it('xếp node thành hàng căn giữa quanh gốc', () => {
    const layout = computeLayout(clusterView());
    const xs = layout.nodes.map((n) => n.position.x);
    expect(xs).toHaveLength(2);
    expect(xs[0]).toBeCloseTo(-(PLATFORM_WIDTH + PLATFORM_GAP) / 2);
    expect(xs[1]).toBeCloseTo((PLATFORM_WIDTH + PLATFORM_GAP) / 2);
  });

  it('một node đứng đúng ở gốc', () => {
    expect(platformX(0, 1)).toBe(0);
  });

  /**
   * ĐỐI CHỨNG cho bình luận "thứ tự đầu vào không quyết định vị trí". Không có ô
   * này thì cả nhận định đó chỉ là một câu trong comment.
   */
  it('vị trí bất biến khi lane B đảo thứ tự mảng', () => {
    const a = clusterView();
    const b = clusterView({
      nodes: [...a.nodes].reverse(),
      objects: [...a.objects].reverse(),
    });
    expect(computeLayout(b)).toEqual(computeLayout(a));
  });

  it('pod đứng sát mặt bệ', () => {
    const layout = computeLayout(clusterView());
    const floor = -PLATFORM_HEIGHT / 2 + POD_SIZE / 2;
    for (const object of layout.objects) {
      if (object.zone === 'node') {
        expect(object.position.y).toBeGreaterThan(floor);
        expect(object.position.y).toBeLessThan(0.35);
      }
    }
  });

  /**
   * Pod phải nằm TRONG mặt bệ, ở mọi số lượng.
   *
   * Ô này thay cho một ô cũ chỉ khẳng định `z > 0.6` — một ngưỡng bám vào hằng
   * số `z = 1.3` của bản cũ chứ không bám vào điều thật sự cần đúng. Và vì nó
   * chỉ gác cận DƯỚI, nó xanh nguyên trong khi hàng pod thứ hai đã rơi hẳn ra
   * ngoài mép trước của bệ (đo ở level 13, 2026-09-09). Ở đây gác cả hai cận,
   * trên cả hai trục, và quét từ 1 tới 12 pod để bắt đúng lúc lưới sinh thêm hàng.
   */
  it('pod nằm trong mặt bệ dù có bao nhiêu pod', () => {
    const halfW = PLATFORM_WIDTH / 2;
    const halfD = PLATFORM_DEPTH / 2;
    for (let count = 1; count <= 12; count += 1) {
      const objects = Array.from({ length: count }, (_, i) =>
        podView(`p-${String(i).padStart(2, '0')}`, `pod-${i}`, { nodeName: 'node-a' }),
      );
      const layout = computeLayout(clusterView({ objects }));
      const platform = layout.nodes.find((n) => n.name === 'node-a');
      expect(platform).toBeDefined();
      const placed = layout.objects.filter((o) => o.zone === 'node');
      expect(placed).toHaveLength(count);
      for (const pod of placed) {
        const dx = Math.abs(pod.position.x - (platform?.position.x ?? 0));
        const dz = Math.abs(pod.position.z - (platform?.position.z ?? 0));
        expect(dx + POD_SIZE / 2, `${count} pod: tràn ngang`).toBeLessThanOrEqual(halfW);
        expect(dz + POD_SIZE / 2, `${count} pod: tràn dọc`).toBeLessThanOrEqual(halfD);
      }
    }
  });

  it('pod theo đúng node của nó', () => {
    const layout = computeLayout(clusterView());
    const nodeB = layout.nodes.find((n) => n.name === 'node-b');
    const pod2 = layout.objects.find((o) => o.uid === 'u-2');
    expect(nodeB).toBeDefined();
    expect(pod2?.position.x).toBeCloseTo(nodeB?.position.x ?? Number.NaN);
  });

  it('pod chưa xếp lịch xuống dải chờ phía trước, không lên bệ', () => {
    const view = clusterView({
      objects: [podView('u-1', 'web-1', { nodeName: null, phase: 'Pending' })],
    });
    const layout = computeLayout(view);
    expect(layout.objects[0]?.zone).toBe('pending');
    expect(layout.objects[0]?.position.z).toBeGreaterThan(0);
  });

  /**
   * Bẫy NaN. Một pod trỏ tới node vừa rời cụm KHÔNG được sinh toạ độ `undefined`:
   * NaN trong ma trận của three không ném — vật chỉ lặng lẽ biến mất, và không có
   * gì trong log nói tại sao.
   */
  it('pod trỏ tới node không tồn tại vẫn có toạ độ hữu hạn', () => {
    const view = clusterView({
      nodes: [nodeView('node-a')],
      objects: [podView('u-9', 'mo-coi', { nodeName: 'node-da-bi-xoa' })],
    });
    const layout = computeLayout(view);
    expect(layout.objects[0]?.zone).toBe('pending');
    expect(Number.isFinite(layout.objects[0]?.position.x ?? Number.NaN)).toBe(true);
    expect(Number.isFinite(layout.objects[0]?.position.z ?? Number.NaN)).toBe(true);
  });

  it('object không phải Pod lên kệ phía sau', () => {
    const view = clusterView({ objects: [serviceView('svc-1', 'web')] });
    const layout = computeLayout(view);
    expect(layout.objects[0]?.zone).toBe('shelf');
    expect(layout.objects[0]?.position.z).toBeLessThan(0);
  });

  /**
   * Cạnh cụt (một đầu không có object nào) phải bị loại ở đây. Để lọt xuống khâu
   * vẽ thì nó thành một đoạn thẳng nối tới gốc toạ độ — một tia lạ cắt ngang cảnh.
   */
  it('loại cạnh có đầu không tồn tại', () => {
    const view = clusterView({
      edges: [
        { fromUid: 'u-1', toUid: 'u-2', kind: 'selects', healthy: true },
        { fromUid: 'u-1', toUid: 'khong-co', kind: 'selects', healthy: false },
      ],
    });
    expect(computeLayout(view).edges).toEqual([
      { fromUid: 'u-1', toUid: 'u-2', kind: 'selects', healthy: true },
    ]);
  });

  it('cụm rỗng vẫn cho bán kính dương để camera có gì mà đóng khung', () => {
    const layout = computeLayout(clusterView({ nodes: [], objects: [] }));
    expect(layout.radius).toBeGreaterThan(0);
  });

  it('không có hai pod nào trùng vị trí, kể cả khi đông', () => {
    const pods = Array.from({ length: 24 }, (_, i) =>
      podView(`u-${String(i).padStart(2, '0')}`, `web-${String(i)}`),
    );
    const layout = computeLayout(clusterView({ nodes: [nodeView('node-a')], objects: pods }));
    const keys = layout.objects.map((o) => `${o.position.x.toFixed(4)}:${o.position.z.toFixed(4)}`);
    expect(new Set(keys).size).toBe(pods.length);
  });
});

describe('podGrid', () => {
  it('lưới gần vuông', () => {
    expect(podGrid(9)).toMatchObject({ cols: 3, rows: 3 });
    expect(podGrid(4)).toMatchObject({ cols: 2, rows: 2 });
    expect(podGrid(1)).toMatchObject({ cols: 1, rows: 1 });
  });

  it('rỗng thì không có lưới', () => {
    expect(podGrid(0)).toEqual({ cols: 0, rows: 0, pitch: 0 });
  });

  /**
   * SÀN khoảng cách: dưới ngưỡng này pod dính vào nhau và không đếm được bằng
   * mắt. Đông quá thì thà tràn nhẹ ra mép bệ còn hơn vẽ ra một khối đặc.
   */
  it('bước lưới không bao giờ nhỏ hơn kích thước pod', () => {
    for (const n of [2, 9, 25, 100, 400]) {
      expect(podGrid(n).pitch).toBeGreaterThan(POD_SIZE);
    }
  });
});
