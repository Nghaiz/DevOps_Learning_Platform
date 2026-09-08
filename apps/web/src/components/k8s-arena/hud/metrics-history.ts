/**
 * Chuỗi thời gian cho bảng số liệu — THUẦN, không React, không DOM.
 *
 * Engine không lưu lịch sử: `ClusterView` chỉ có ảnh chụp tại `tick` hiện tại.
 * Vẽ được đồ thị thì phải có ai đó giữ các mẫu lại, và chỗ đúng để giữ là lớp
 * trình bày — không phải engine. Lý do là tính tất định: `RunLog` phát lại phải
 * cho ra đúng cùng một trạng thái, nên nhét một bộ đệm đồ thị vào `ClusterState`
 * là thêm dữ liệu vào thứ đang được so bằng giá trị lúc xác minh chống gian lận.
 *
 * ⚠ Hệ quả người dùng thấy được, ghi ra đây để không ai coi là lỗi: đồ thị bắt
 * đầu từ lúc MỞ bảng, không có phần trước đó. Bảng số liệu tự nói câu này.
 */

import type { ClusterView } from '@devops-platform/games';

/** Số mẫu giữ lại. Dài vô hạn là một rò rỉ bộ nhớ chậm — cùng lập luận với nhật ký. */
export const METRICS_WINDOW = 120;

export interface MetricSample {
  readonly tick: number;
  /** 0..1 — trung bình phần CPU đã dùng trên toàn bộ node. */
  readonly cpu: number;
  /** 0..1 — trung bình phần bộ nhớ đã dùng. */
  readonly memory: number;
  readonly pods: number;
}

/**
 * Rút một mẫu từ ảnh chụp cụm.
 *
 * Trung bình cộng, KHÔNG có trọng số theo dung lượng node: `NodeView` chỉ mang
 * phần đã dùng (0..1) chứ không mang dung lượng tuyệt đối, nên không có gì để
 * đánh trọng số. Ghi ra đây vì "trung bình CPU cụm" nghe như đã tính theo dung
 * lượng, và người đọc đồ thị cần biết nó không phải vậy.
 */
export function sampleFrom(view: ClusterView): MetricSample {
  const count = view.nodes.length;
  const total = view.nodes.reduce(
    (acc, node) => ({ cpu: acc.cpu + node.cpuUsed, memory: acc.memory + node.memoryUsed }),
    { cpu: 0, memory: 0 },
  );
  return {
    tick: view.tick,
    cpu: count === 0 ? 0 : total.cpu / count,
    memory: count === 0 ? 0 : total.memory / count,
    pods: view.objects.reduce((acc, object) => (object.kind === 'Pod' ? acc + 1 : acc), 0),
  };
}

/**
 * Thêm một mẫu, cắt bớt phần vượt cửa sổ.
 *
 * Mẫu trùng `tick` với mẫu cuối bị BỎ QUA thay vì ghi đè: React có thể render
 * lại nhiều lần trong cùng một tick mô phỏng (đổi tab, rê chuột, đổi theme), và
 * ghi mỗi lần render sẽ làm trục hoành dày lên ở đúng những chỗ người dùng
 * tương tác nhiều — một đồ thị nói về thao tác chuột chứ không nói về cụm.
 */
export function pushSample(
  history: readonly MetricSample[],
  sample: MetricSample,
): readonly MetricSample[] {
  const last = history.at(-1);
  if (last !== undefined && last.tick >= sample.tick) {
    return history;
  }
  const next = [...history, sample];
  return next.length > METRICS_WINDOW ? next.slice(next.length - METRICS_WINDOW) : next;
}
