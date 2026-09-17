/**
 * Ưu tiên nhãn của cảnh 3D — toán thuần, không `three`, không DOM (19.D.3.5).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ TRẦN, VÀ VÌ SAO TRẦN KÉO THEO MỘT THỨ TỰ ƯU TIÊN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nhãn là `<span>` DOM chiếu tay theo khuôn `k8s-arena/scene/scene-labels.tsx`:
 * chữ DOM sắc nét ở mọi mức phóng, trình đọc màn hình thấy được, và không tốn
 * một texture atlas nào. Nhưng mỗi `<span>` là một phần tử bố cục thật, nên số
 * lượng phải có trần — 64, đúng con số kế hoạch chốt.
 *
 * Có trần thì phải có thứ tự: khi 80 node tranh 64 chỗ, thứ bị loại phải là thứ
 * người chơi ít cần nhất. Bài học đã ghi trong arena: không có bước này thì "200
 * pod khoẻ mạnh chiếm hết chỗ và pod đang hỏng — thứ duy nhất người chơi cần
 * thấy tên — bị đẩy ra ngoài".
 *
 * ⛔ **Đây KHÔNG phải đường đếm node.** Pool có trần 64 và nhãn còn bị loại tiếp
 * ở bước giãn chống chồng, nên số `<span>` hiện ra KHÔNG bằng số node được vẽ.
 * Phép đếm của AC-D1 đọc `data-cicd-node-count` trên phần tử bọc canvas
 * (`cicd-scene-3d.tsx`), lấy từ `cicdSceneNodes()`.
 */

import type { StageRunState } from '@devops-platform/games';

/** Trần số nhãn hiện cùng lúc. Kế hoạch D.3.5. */
export const MAX_CICD_LABELS = 64;

/**
 * Trần số ỨNG VIÊN đưa vào bước giãn.
 *
 * Gấp đôi trần hiển thị: đủ dư để bước giãn còn lựa chọn khi nhiều nhãn chồng
 * nhau, đủ ít để phép sắp xếp mỗi khung hình vẫn rẻ. Cùng tỉ lệ arena dùng.
 */
export const MAX_CICD_LABEL_CANDIDATES = MAX_CICD_LABELS * 2;

/**
 * Điểm ưu tiên theo TRẠNG THÁI.
 *
 * Thứ tự không phải thẩm mỹ, nó là thứ tự "người chơi cần đọc tên cái này đến
 * mức nào để chơi tiếp":
 *
 * - `failed` cao nhất trong nhóm không-tương-tác: nó là thứ duy nhất người chơi
 *   phải đi sửa.
 * - `running` / `retrying` kế tiếp: đang diễn ra, và `retrying` là thứ bài C10
 *   dạy.
 * - `queued` trên `skipped`: một job xếp hàng là một quyết định người chơi đổi
 *   được (thêm máy, đổi thứ tự); một job bị bỏ qua chỉ là hệ quả của một job đỏ
 *   ở trên, mà cái đỏ đó đã được ưu tiên rồi.
 * - `passed` và `pending` thấp nhất: chúng không đòi hành động nào.
 */
const STATE_PRIORITY: Readonly<Record<StageRunState, number>> = {
  failed: 700,
  retrying: 640,
  running: 620,
  queued: 520,
  skipped: 320,
  passed: 260,
  pending: 200,
};

export const PRIORITY_SELECTED = 1000;
export const PRIORITY_HOVERED = 900;

export interface LabelPriorityInput {
  readonly id: string;
  readonly state: StageRunState;
  readonly selectedId: string | null;
  readonly hoveredId: string | null;
}

/**
 * Điểm ưu tiên của một nhãn.
 *
 * Đang chọn và đang rê luôn thắng mọi trạng thái: chúng là thứ người chơi VỪA
 * trỏ tay vào, và một nhãn biến mất đúng lúc được trỏ thì giao diện đọc ra là
 * hỏng chứ không phải là chật.
 */
export function labelPriority(input: LabelPriorityInput): number {
  if (input.id === input.selectedId) {
    return PRIORITY_SELECTED;
  }
  if (input.id === input.hoveredId) {
    return PRIORITY_HOVERED;
  }
  return STATE_PRIORITY[input.state];
}

/**
 * Nhãn này thuộc lượt quét THỨ NHẤT hay thứ hai.
 *
 * Hai lượt, giống arena: lượt đầu lấy thứ đòi hành động, lượt sau mới lấp bằng
 * phần còn lại. Bước này khác bước sắp theo điểm ở một chỗ quan trọng — phép sắp
 * chỉ quyết định ai được chỗ TRƯỚC, còn hai lượt quyết định ai được **đưa vào
 * danh sách ứng viên** khi số node vượt `MAX_CICD_LABEL_CANDIDATES`. Không có
 * nó, một level 200 node thì 128 ứng viên đầu tiên có thể toàn `passed`.
 */
export function isPrimaryLabelPass(input: LabelPriorityInput): boolean {
  return (
    input.id === input.selectedId ||
    input.id === input.hoveredId ||
    input.state === 'failed' ||
    input.state === 'running' ||
    input.state === 'retrying' ||
    input.state === 'queued'
  );
}

/** Độ dài tối đa của một nhãn trước khi cắt bớt. */
export const MAX_LABEL_TEXT = 24;

/** Cắt cho vừa, giữ dấu ba chấm để người đọc biết là đã cắt. */
export function shortenLabel(text: string): string {
  return text.length <= MAX_LABEL_TEXT ? text : `${text.slice(0, MAX_LABEL_TEXT - 1)}…`;
}

/**
 * Chữ hiện trên nhãn: icon của trạng thái đứng trước tên.
 *
 * Icon là kênh thứ tư của bảng mã hoá, và là kênh DUY NHẤT còn đọc được khi in
 * ra thang xám VÀ đã tắt mọi chuyển động. Nó phải nằm trên nhãn chứ không chỉ
 * trong `aria-label`, nếu không người nhìn thấy màn hình mà không phân biệt được
 * màu sẽ không có gì để dựa vào ngoài hình khối.
 */
export function labelText(icon: string, name: string): string {
  return `${icon} ${shortenLabel(name)}`;
}
