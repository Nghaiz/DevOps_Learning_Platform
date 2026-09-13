/**
 * Ô nghiệm thu tất định của tầng layout — bản sao của điều kiện §17.J.3.
 *
 * ⛔ File này CỐ Ý đứng riêng, không gộp vào `dag-layout.test.ts`. Lý do: một
 * test tất định nằm lẫn trong một file test chức năng sẽ bị đọc lướt như "một
 * case nữa", và khi ai đó sửa thuật toán rồi thấy nó đỏ thì phản xạ đầu tiên là
 * cập nhật giá trị mong đợi. Ở đây thì không có giá trị mong đợi nào để cập
 * nhật: nó chỉ khẳng định các lượt chạy BẰNG NHAU, nên đỏ ở đây luôn có đúng một
 * nghĩa — tính tất định đã vỡ.
 *
 * Cùng một đồ thị, đưa vào ở ≥ 5 thứ tự chèn khác nhau, phải ra kết quả **bằng
 * nhau từng byte** qua `JSON.stringify`.
 *
 * So byte chứ không `toEqual` là có chủ ý: `toEqual` so theo cấu trúc nên hai
 * mảng cùng phần tử khác THỨ TỰ vẫn trượt, nhưng hai object cùng khoá khác thứ
 * tự khoá lại qua — mà thứ tự khoá chính là thứ 17.Q xuất ra JSON để chia sẻ, và
 * chính là thứ đi vào phép băm trạng thái. Chuỗi serialize mới là thứ phải bằng
 * nhau.
 */

import { describe, expect, it } from 'vitest';
import { type DagNode, layoutDag } from './dag-layout.ts';

/**
 * Đồ thị mẫu: gốc, hai nhánh rẽ, một merge, một nhánh thứ ba, và một commit mồ
 * côi. Đủ để mọi nhánh quyết định trong thuật toán đều được đi qua.
 */
const GRAPH: readonly DagNode[] = [
  { id: 'c1', parents: [] },
  { id: 'c2', parents: ['c1'] },
  { id: 'c3', parents: ['c2'] },
  { id: 'f1', parents: ['c1'] },
  { id: 'f2', parents: ['f1'] },
  { id: 'm1', parents: ['c3', 'f2'] },
  { id: 'g1', parents: ['c2'] },
  { id: 'lost', parents: [] },
];

/**
 * Sáu thứ tự chèn, KHAI TAY.
 *
 * Không sinh hoán vị bằng RNG dù `core/rng.ts` có sẵn: một test tất định mà bản
 * thân nó phụ thuộc một hạt giống thì khi đỏ ta phải đi hỏi "đỏ vì thuật toán
 * hay vì hôm nay bốc phải hoán vị khác". Khai tay thì một lượt đỏ tái hiện được
 * ngay.
 */
const ORDERS: readonly (readonly DagNode[])[] = [
  GRAPH,
  [...GRAPH].reverse(),
  // node lá trước node gốc
  ['m1', 'f2', 'g1', 'c3', 'f1', 'c2', 'lost', 'c1'].map(pick),
  // xen kẽ hai nhánh
  ['c1', 'f1', 'c2', 'f2', 'c3', 'g1', 'm1', 'lost'].map(pick),
  // commit mồ côi lên đầu
  ['lost', 'm1', 'c1', 'g1', 'c2', 'f1', 'c3', 'f2'].map(pick),
  // sắp theo id giảm dần
  [...GRAPH].sort((a, b) => (a.id < b.id ? 1 : -1)),
];

function pick(id: string): DagNode {
  const found = GRAPH.find((n) => n.id === id);
  if (found === undefined) throw new Error(`hoán vị nhắc tới node không có: ${id}`);
  return found;
}

describe('layoutDag — tất định (§17.J.3)', () => {
  it('6 thứ tự chèn cho kết quả bằng nhau TỪNG BYTE', () => {
    const serialized = ORDERS.map((order) => JSON.stringify(layoutDag(order)));
    for (let i = 1; i < serialized.length; i += 1) {
      expect(serialized[i], `thứ tự chèn #${i} lệch khỏi #0`).toBe(serialized[0]);
    }
  });

  /**
   * Đối chứng: các hoán vị phải THẬT SỰ khác nhau.
   *
   * Không có khẳng định này thì một lỗi đánh máy biến cả 6 mảng thành cùng một
   * mảng sẽ làm test trên xanh mà chẳng đo gì — đúng hình dạng
   * `rules/green-that-proves-nothing.md` mô tả.
   */
  it('sáu hoán vị dùng để đo quả thật khác nhau', () => {
    const shapes = new Set(ORDERS.map((o) => o.map((n) => n.id).join(',')));
    expect(shapes.size).toBe(ORDERS.length);
  });

  it('gọi hai lần trên cùng một mảng cho cùng một chuỗi', () => {
    expect(JSON.stringify(layoutDag(GRAPH))).toBe(JSON.stringify(layoutDag(GRAPH)));
  });

  /**
   * Id trùng là lỗi của bên gọi, nhưng nó KHÔNG được phép làm vỡ tính tất định —
   * nếu không, một level viết tay có một dòng chép nhầm sẽ khiến client và server
   * chấm ra hai kết quả khác nhau, và triệu chứng là người chơi bị báo gian lận.
   */
  it('id trùng vẫn cho kết quả không phụ thuộc thứ tự', () => {
    const a: readonly DagNode[] = [
      { id: 'c1', parents: [] },
      { id: 'c2', parents: ['c1'] },
      { id: 'c2', parents: [] },
    ];
    const b: readonly DagNode[] = [
      { id: 'c2', parents: [] },
      { id: 'c2', parents: ['c1'] },
      { id: 'c1', parents: [] },
    ];
    expect(JSON.stringify(layoutDag(a))).toBe(JSON.stringify(layoutDag(b)));
  });

  /**
   * Cổng grep §17.J.2 quét `packages/games/src/git/**`, không quét `core/layout/`.
   * Đây là chỗ chặn tương đương cho thư mục của lane này — và nó chặn bằng HÀNH
   * VI, không bằng văn bản.
   *
   * Vì sao không grep mã nguồn: `tsconfig` của package cố ý bỏ `types: ["node"]`
   * nên `node:fs` không import được ở đây, và đó là ràng buộc đúng chứ không phải
   * chỗ cần lách. Thay vào đó thay thẳng hai hàm bằng bản ném lỗi rồi chạy
   * `layoutDag`. Phép đo này mạnh hơn grep ở một điểm: nó bắt cả lời gọi GIÁN
   * TIẾP qua một hàm trợ giúp mà grep theo tên file sẽ bỏ lọt.
   *
   * Đối chứng dương nằm ngay dưới — nó chứng minh cái bẫy này bắt được thật.
   */
  it('không chạm Math.random hay Date.now', () => {
    const realRandom = Math.random;
    const realNow = Date.now;
    Math.random = () => {
      throw new Error('layoutDag đã gọi Math.random — nguồn bất định');
    };
    Date.now = () => {
      throw new Error('layoutDag đã gọi Date.now — nguồn bất định');
    };
    try {
      expect(() => layoutDag(GRAPH)).not.toThrow();
    } finally {
      Math.random = realRandom;
      Date.now = realNow;
    }
  });

  it('đối chứng dương: bẫy ở trên thật sự bắt được lời gọi', () => {
    const realRandom = Math.random;
    Math.random = () => {
      throw new Error('bắt được');
    };
    try {
      expect(() => Math.random()).toThrow('bắt được');
    } finally {
      Math.random = realRandom;
    }
  });
});
