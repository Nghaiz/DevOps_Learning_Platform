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
 *
 * ## Hai KÊNH, và vì sao phải phân biệt
 *
 * - `engine`: `GameAction` có cấu trúc, đi thẳng qua `dispatch`. Kết quả là một
 *   thay đổi trong cụm, nhìn thấy được trên cảnh 3D.
 * - `terminal`: một câu `kubectl` được CHẠY trong terminal, và kết quả in ra đó.
 *
 * ⚠ Phân biệt này ra đời từ một lỗi đo được: `Xem log` từng đi qua `dispatch`,
 * mà `arena-session.dispatch` VỨT kết quả đi trừ khi engine từ chối
 * (`if (result && !result.accepted) toast(...)`). Log in ra rồi bị ném thẳng vào
 * thùng rác — bấm "Xem log" không có gì xảy ra cả, không lỗi, không thông báo.
 * Lệnh chỉ SINH RA CHỮ thì phải đi kênh `terminal`, nơi có chỗ hiện chữ.
 */

import type { GameAction, ObjectView, ResourceRef } from '@devops-platform/games';
import { ROLLOUT_KINDS, SCALABLE_KINDS } from './inspector-types.ts';

export type ArenaActionId =
  | 'describe'
  | 'scale'
  | 'logs'
  | 'logs-previous'
  | 'exec'
  | 'selected-pods'
  | 'rollout-status'
  | 'restart'
  | 'rollback'
  | 'delete';

export interface ArenaActionDef {
  readonly id: ArenaActionId;
  readonly label: string;
  /** Câu giải thích ngắn hiện khi rê chuột — nói HỆ QUẢ, không nhắc lại nhãn. */
  readonly hint: string;
  /** Hành động phá huỷ ⇒ tách bằng HÌNH DẠNG (viền + icon), không chỉ bằng màu. */
  readonly danger: boolean;
  /** Xem khối tài liệu đầu file. */
  readonly channel: 'engine' | 'terminal';
}

/**
 * Loại KHÔNG cho xoá.
 *
 * Node không phải thứ `kubectl delete` trong game này — nó là phần cứng, và một
 * mục "Xoá" trên nó dạy sai mô hình. (Bản tham chiếu k8sgames cũng bỏ Delete
 * khỏi menu của Node, vì cùng lý do.) Namespace giữ lại được xoá: xoá namespace
 * là một thao tác có thật và có bài dùng tới.
 */
const UNDELETABLE: readonly ObjectView['kind'][] = ['Node'];

/**
 * Thứ tự khai báo LÀ thứ tự hiển thị, và nó có chủ ý: đọc/chẩn đoán trước, sửa
 * đổi sau, `delete` đứng cuối cùng và tách ra. Đặt nút xoá cạnh nút xem log là
 * mời người ta bấm nhầm.
 */
export const ARENA_ACTIONS: readonly ArenaActionDef[] = [
  {
    id: 'describe',
    label: 'Mô tả chi tiết',
    hint: 'Chạy `kubectl describe` — nơi Events nói vì sao tài nguyên đang ở trạng thái này.',
    danger: false,
    channel: 'terminal',
  },
  {
    id: 'logs',
    label: 'Xem log',
    hint: 'In log của container ra terminal.',
    danger: false,
    channel: 'terminal',
  },
  {
    id: 'logs-previous',
    label: 'Log lần chạy trước',
    hint: 'Log của container ĐÃ CHẾT. Đây là chỗ duy nhất còn lý do nó chết.',
    danger: false,
    channel: 'terminal',
  },
  {
    id: 'exec',
    label: 'Vào shell',
    hint: 'Mở một shell bên trong container.',
    danger: false,
    channel: 'terminal',
  },
  {
    id: 'selected-pods',
    label: 'Pod khớp selector',
    hint: 'Liệt kê pod mà selector của Service này thật sự chọn được.',
    danger: false,
    channel: 'terminal',
  },
  {
    id: 'rollout-status',
    label: 'Trạng thái phát hành',
    hint: 'Lứa pod mới đã lên tới đâu.',
    danger: false,
    channel: 'terminal',
  },
  {
    id: 'scale',
    label: 'Co giãn',
    hint: 'Đổi số replica mong muốn; controller tự tạo hoặc xoá pod cho khớp.',
    danger: false,
    channel: 'engine',
  },
  {
    id: 'restart',
    label: 'Khởi động lại',
    hint: 'Thay toàn bộ pod bằng lứa mới, giữ nguyên manifest.',
    danger: false,
    channel: 'terminal',
  },
  {
    id: 'rollback',
    label: 'Quay lui bản phát hành',
    hint: 'Trở về ReplicaSet của lần phát hành trước đó.',
    danger: false,
    channel: 'terminal',
  },
  {
    id: 'delete',
    label: 'Xoá',
    hint: 'Gỡ tài nguyên khỏi cụm. Không hoàn tác được.',
    danger: true,
    channel: 'engine',
  },
];

/**
 * Hành động nào áp được lên object này.
 *
 * Lọc theo loại chứ không hiện hết rồi vô hiệu hoá: một nút xám ngắt trên Pod
 * ghi "Quay lui bản phát hành" vẫn dạy rằng Pod có lịch sử phát hành, mà nó
 * không có. Không áp dụng được thì không hiện.
 *
 * Một số mục còn lọc theo TRẠNG THÁI, không chỉ theo loại: "Log lần chạy trước"
 * chỉ có nghĩa khi container đã chết ít nhất một lần, và hiện nó trên một pod
 * chưa từng restart là hứa một thứ engine sẽ trả về rỗng.
 */
export function availableActions(object: ObjectView): readonly ArenaActionDef[] {
  return ARENA_ACTIONS.filter((action) => {
    switch (action.id) {
      case 'describe':
        return true;
      case 'scale':
        return SCALABLE_KINDS.includes(object.kind);
      case 'logs':
        return object.kind === 'Pod';
      case 'logs-previous':
        return object.kind === 'Pod' && (object.restartCount ?? 0) > 0;
      case 'exec':
        return object.kind === 'Pod' && object.phase === 'Running';
      case 'selected-pods':
        return object.kind === 'Service';
      case 'rollout-status':
      case 'restart':
      case 'rollback':
        return ROLLOUT_KINDS.includes(object.kind);
      case 'delete':
        return !UNDELETABLE.includes(object.kind);
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
 * Câu `kubectl` của một hành động kênh `terminal`. `null` nếu không áp được.
 *
 * ⚠ MỌI chuỗi trả về từ đây phải được `parseKubectl` chấp nhận. Đó không phải
 * một lời hứa suông: `inspector-action-list.test.ts` dựng đúng tập hành động này
 * trên MỌI object của cả 36 level và bắt engine phân tích từng câu. Một mục menu
 * phát ra lệnh engine không hiểu thì tệ hơn hẳn việc không có mục đó.
 */
export function commandFor(id: ArenaActionId, object: ObjectView): string | null {
  const kindToken = object.kind.toLowerCase();
  const ns = namespaceFlag(object);
  switch (id) {
    case 'describe':
      return `kubectl describe ${kindToken} ${object.name}${ns}`;
    case 'logs':
      return object.kind === 'Pod' ? `kubectl logs ${object.name}${ns}` : null;
    case 'logs-previous':
      return object.kind === 'Pod' ? `kubectl logs ${object.name} --previous${ns}` : null;
    case 'exec':
      // `-it -- sh`: đúng cú pháp người học sẽ gõ trên cụm thật, và `RunLog` ghi
      // lại đúng câu đó nên đọc lại log vẫn học được cú pháp.
      return object.kind === 'Pod' ? `kubectl exec -it ${object.name}${ns} -- sh` : null;
    case 'selected-pods': {
      if (object.kind !== 'Service') {
        return null;
      }
      // Selector của Service nằm trong `spec`, mà `ObjectView` không mang `spec`.
      // Dùng nhãn của chính Service làm xấp xỉ: trong mọi bài của game, Service
      // và workload nó chọn dùng chung bộ nhãn `app=…`.
      const selector = Object.entries(object.labels)
        .map(([key, value]) => `${key}=${value}`)
        .join(',');
      return selector === '' ? `kubectl get pods${ns}` : `kubectl get pods -l ${selector}${ns}`;
    }
    case 'rollout-status':
      return ROLLOUT_KINDS.includes(object.kind)
        ? `kubectl rollout status ${kindToken}/${object.name}${ns}`
        : null;
    case 'restart':
      return ROLLOUT_KINDS.includes(object.kind)
        ? `kubectl rollout restart ${kindToken}/${object.name}${ns}`
        : null;
    case 'rollback':
      return ROLLOUT_KINDS.includes(object.kind)
        ? `kubectl rollout undo ${kindToken}/${object.name}${ns}`
        : null;
    case 'scale':
    case 'delete':
      // Hai cái này đi kênh `engine`, không có câu lệnh nào.
      return null;
  }
}

/**
 * Dựng `GameAction` cho một hành động kênh `engine`.
 *
 * Trả `null` khi hành động không áp được lên object, hoặc khi nó thuộc kênh
 * `terminal` — nơi gọi bỏ qua, KHÔNG ném: một cú bấm sai chỗ không được phép làm
 * sập phiên chơi.
 */
export function buildAction(
  id: ArenaActionId,
  object: ObjectView,
  tick: number,
  replicas: number,
): GameAction | null {
  switch (id) {
    case 'scale':
      return SCALABLE_KINDS.includes(object.kind)
        ? { tick, kind: 'scale', target: refOf(object), replicas }
        : null;
    case 'delete':
      return UNDELETABLE.includes(object.kind)
        ? null
        : { tick, kind: 'delete', target: refOf(object) };
    default:
      return null;
  }
}
