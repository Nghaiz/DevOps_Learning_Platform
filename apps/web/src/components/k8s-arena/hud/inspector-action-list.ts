/**
 * Danh mục hành động nhanh — SSOT cho CẢ bảng thông số lẫn menu chuột phải.
 *
 * Hai chỗ đó hiện cùng một tập hành động trên cùng một object. Nếu mỗi bên tự
 * liệt kê thì chúng sẽ lệch nhau ngay lần đầu ai đó thêm một hành động, và
 * triệu chứng là "chuột phải có mục X mà bảng bên phải không có" — người dùng
 * đọc ra thành lỗi ngẫu nhiên. Một bảng, hai nơi đọc.
 *
 * File THUẦN, không import React: nó chỉ trả dữ liệu và dựng `GameAction`, nên
 * test được mà không cần DOM.
 */

import type { GameAction, ObjectView, ResourceRef } from '@devops-platform/games';
import { ROLLOUT_KINDS, SCALABLE_KINDS } from './inspector-types.ts';

export type ArenaActionId = 'scale' | 'logs' | 'restart' | 'rollback' | 'delete';

export interface ArenaActionDef {
  readonly id: ArenaActionId;
  readonly label: string;
  /** Câu giải thích ngắn hiện khi rê chuột — nói HỆ QUẢ, không nhắc lại nhãn. */
  readonly hint: string;
  /** Hành động phá huỷ ⇒ tách bằng HÌNH DẠNG (viền + icon), không chỉ bằng màu. */
  readonly danger: boolean;
}

/**
 * Thứ tự khai báo LÀ thứ tự hiển thị, và nó có chủ ý: ba hành động đọc/hồi phục
 * đứng trước, `delete` đứng cuối cùng và tách ra. Đặt nút xoá cạnh nút xem log
 * là mời người ta bấm nhầm.
 */
export const ARENA_ACTIONS: readonly ArenaActionDef[] = [
  {
    id: 'scale',
    label: 'Co giãn',
    hint: 'Đổi số replica mong muốn; controller tự tạo hoặc xoá pod cho khớp.',
    danger: false,
  },
  {
    id: 'logs',
    label: 'Xem log',
    hint: 'In log của container ra thanh lệnh.',
    danger: false,
  },
  {
    id: 'restart',
    label: 'Khởi động lại',
    hint: 'Thay toàn bộ pod bằng lứa mới, giữ nguyên manifest.',
    danger: false,
  },
  {
    id: 'rollback',
    label: 'Quay lui bản phát hành',
    hint: 'Trở về ReplicaSet của lần phát hành trước đó.',
    danger: false,
  },
  {
    id: 'delete',
    label: 'Xoá',
    hint: 'Gỡ tài nguyên khỏi cụm. Không hoàn tác được.',
    danger: true,
  },
];

/**
 * Hành động nào áp được lên object này.
 *
 * Lọc theo loại chứ không hiện hết rồi vô hiệu hoá: một nút xám ngắt trên Pod
 * ghi "Quay lui bản phát hành" vẫn dạy rằng Pod có lịch sử phát hành, mà nó
 * không có. Không áp dụng được thì không hiện.
 */
export function availableActions(object: ObjectView): readonly ArenaActionDef[] {
  return ARENA_ACTIONS.filter((action) => {
    switch (action.id) {
      case 'scale':
        return SCALABLE_KINDS.includes(object.kind);
      case 'logs':
        return object.kind === 'Pod';
      case 'restart':
      case 'rollback':
        return ROLLOUT_KINDS.includes(object.kind);
      case 'delete':
        return true;
    }
  });
}

export function refOf(object: ObjectView): ResourceRef {
  return { kind: object.kind, namespace: object.namespace, name: object.name };
}

/**
 * Hậu tố `-n <ns>` cho lệnh kubectl.
 *
 * Tài nguyên phạm vi cluster mang `namespace` là chuỗi rỗng (`model.ts` ghi rõ),
 * và `kubectl … -n ''` là một lệnh sai. Bỏ hẳn cờ trong trường hợp đó.
 */
function namespaceFlag(object: ObjectView): string {
  return object.namespace === '' ? '' : ` -n ${object.namespace}`;
}

/**
 * Dựng `GameAction` cho một hành động.
 *
 * `scale` và `delete` đi bằng action CÓ CẤU TRÚC vì hợp đồng đã có sẵn; ba cái
 * còn lại đi bằng chuỗi `kubectl` vì `GameAction` không có biến thể tương ứng —
 * và đó là lựa chọn đúng chứ không phải đường vòng: `RunLog` khi đó ghi lại đúng
 * câu lệnh người chơi lẽ ra phải gõ, nên phát lại vẫn khớp và người đọc lại log
 * học được cú pháp thật.
 *
 * Trả `null` khi hành động không áp được lên object — nơi gọi bỏ qua, KHÔNG ném:
 * một cú bấm sai chỗ không được phép làm sập phiên chơi.
 */
export function buildAction(
  id: ArenaActionId,
  object: ObjectView,
  tick: number,
  replicas: number,
): GameAction | null {
  const kindToken = object.kind.toLowerCase();
  switch (id) {
    case 'scale':
      return SCALABLE_KINDS.includes(object.kind)
        ? { tick, kind: 'scale', target: refOf(object), replicas }
        : null;
    case 'delete':
      return { tick, kind: 'delete', target: refOf(object) };
    case 'logs':
      return object.kind === 'Pod'
        ? { tick, kind: 'kubectl', command: `kubectl logs ${object.name}${namespaceFlag(object)}` }
        : null;
    case 'restart':
      return ROLLOUT_KINDS.includes(object.kind)
        ? {
            tick,
            kind: 'kubectl',
            command: `kubectl rollout restart ${kindToken}/${object.name}${namespaceFlag(object)}`,
          }
        : null;
    case 'rollback':
      return ROLLOUT_KINDS.includes(object.kind)
        ? {
            tick,
            kind: 'kubectl',
            command: `kubectl rollout undo ${kindToken}/${object.name}${namespaceFlag(object)}`,
          }
        : null;
  }
}
