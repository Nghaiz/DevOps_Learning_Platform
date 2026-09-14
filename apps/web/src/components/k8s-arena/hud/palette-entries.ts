/**
 * Dữ liệu của bảng tạo tài nguyên bên trái — nhãn, nhóm, phím tắt, một dòng
 * giải thích.
 *
 * ⛔ Đây là bảng tra THUẦN, cố ý tách khỏi `palette-rail.tsx`: nó test được ở
 * env node, và nó là chỗ duy nhất phải sửa khi hợp đồng mở thêm một loại tài
 * nguyên.
 *
 * `satisfies Record<ResourceKind, …>` là cổng lúc BIÊN DỊCH. Hợp đồng khai 26
 * loại và gọi danh sách đó là ĐÓNG; nếu lead mở loại thứ 27 mà quên bảng này,
 * `satisfies` đỏ ngay — thay vì loại mới lặng lẽ vắng mặt khỏi bảng, thứ mà
 * người chơi đọc ra là "game không tạo được loại đó".
 */

import type { PaletteEntry, PaletteGroup } from '../arena-contract.ts';
import type { ResourceKind } from '@devops-platform/games';

/** Thứ tự nhóm hiện trên bảng. Cố định — bảng bên trái phải đứng yên giữa các level. */
export const PALETTE_GROUP_ORDER: readonly PaletteGroup[] = [
  'workload',
  'network',
  'config',
  'storage',
  'cluster',
];

interface PaletteMeta {
  readonly short: string;
  readonly group: PaletteGroup;
  readonly hotkey: number | null;
  /** Một dòng tiếng Việt: loại này DÙNG ĐỂ LÀM GÌ, hiện trong tooltip. */
  readonly hint: string;
}

/*
 * Phím số 1..9 gán cho chín loại người học chạm nhiều nhất trong sáu chương —
 * không phải chín loại đầu bảng. Gán theo tần suất dùng chứ không theo thứ tự
 * hiển thị: phím tắt tồn tại để tay khỏi rời bàn phím, nên nó phải phục vụ thứ
 * hay gõ, kể cả khi ô đó nằm cuối bảng.
 *
 * Thứ tự khai báo bên dưới CHÍNH LÀ thứ tự hiển thị trong mỗi nhóm (khoá chuỗi
 * giữ nguyên thứ tự chèn), nên không có bảng thứ tự thứ hai để lệch nhau.
 */
const PALETTE_META = {
  Pod: {
    short: 'Pod',
    group: 'workload',
    hotkey: 1,
    hint: 'Đơn vị chạy nhỏ nhất — một hoặc vài container dùng chung mạng và ổ đĩa.',
  },
  Deployment: {
    short: 'Deploy',
    group: 'workload',
    hotkey: 2,
    hint: 'Giữ đúng N bản sao pod và cuộn phiên bản mới không gián đoạn.',
  },
  ReplicaSet: {
    short: 'RS',
    group: 'workload',
    hotkey: null,
    hint: 'Tầng dưới của Deployment — giữ số bản sao. Thường không tạo tay.',
  },
  StatefulSet: {
    short: 'STS',
    group: 'workload',
    hotkey: null,
    hint: 'Cho ứng dụng có trạng thái: tên pod ổn định, ổ đĩa riêng từng pod.',
  },
  DaemonSet: {
    short: 'DS',
    group: 'workload',
    hotkey: null,
    hint: 'Đúng một pod trên MỖI node — agent log, agent metric.',
  },
  Job: {
    short: 'Job',
    group: 'workload',
    hotkey: 8,
    hint: 'Chạy tới khi xong rồi dừng — không khởi động lại vô hạn như Deployment.',
  },
  CronJob: {
    short: 'CronJob',
    group: 'workload',
    hotkey: null,
    hint: 'Tạo Job theo lịch định kỳ.',
  },
  HorizontalPodAutoscaler: {
    short: 'HPA',
    group: 'workload',
    hotkey: null,
    hint: 'Tự tăng giảm số bản sao theo tải đo được.',
  },
  PodDisruptionBudget: {
    short: 'PDB',
    group: 'workload',
    hotkey: null,
    hint: 'Chặn việc bảo trì làm rơi quá nhiều pod cùng lúc.',
  },

  Service: {
    short: 'Svc',
    group: 'network',
    hotkey: 3,
    hint: 'Một địa chỉ ổn định trỏ tới nhóm pod khớp selector.',
  },
  Ingress: {
    short: 'Ing',
    group: 'network',
    hotkey: 6,
    hint: 'Định tuyến HTTP từ ngoài vào Service theo host và path.',
  },
  NetworkPolicy: {
    short: 'NetPol',
    group: 'network',
    hotkey: null,
    hint: 'Tường lửa ở tầng pod — mặc định K8s cho mọi pod nói chuyện với nhau.',
  },

  ConfigMap: {
    short: 'CM',
    group: 'config',
    hotkey: 4,
    hint: 'Cấu hình dạng văn bản, tách khỏi image.',
  },
  Secret: {
    short: 'Secret',
    group: 'config',
    hotkey: 5,
    hint: 'Như ConfigMap nhưng cho dữ liệu nhạy cảm.',
  },
  ServiceAccount: {
    short: 'SA',
    group: 'config',
    hotkey: null,
    hint: 'Danh tính mà pod dùng khi gọi API server.',
  },
  Role: { short: 'Role', group: 'config', hotkey: null, hint: 'Bộ quyền trong MỘT namespace.' },
  RoleBinding: {
    short: 'RB',
    group: 'config',
    hotkey: null,
    hint: 'Gắn một Role vào một danh tính.',
  },
  ClusterRole: {
    short: 'CRole',
    group: 'config',
    hotkey: null,
    hint: 'Bộ quyền phạm vi toàn cụm.',
  },
  ClusterRoleBinding: {
    short: 'CRB',
    group: 'config',
    hotkey: null,
    hint: 'Gắn một ClusterRole vào một danh tính, toàn cụm.',
  },

  PersistentVolumeClaim: {
    short: 'PVC',
    group: 'storage',
    hotkey: 7,
    hint: 'Yêu cầu ổ đĩa: cần bao nhiêu, kiểu truy cập nào.',
  },
  PersistentVolume: {
    short: 'PV',
    group: 'storage',
    hotkey: null,
    hint: 'Ổ đĩa thật trong cụm, thứ mà PVC được khớp vào.',
  },
  StorageClass: {
    short: 'SC',
    group: 'storage',
    hotkey: null,
    hint: 'Loại ổ đĩa — quyết định PVC được cấp phát thế nào.',
  },

  Namespace: {
    short: 'NS',
    group: 'cluster',
    hotkey: 9,
    hint: 'Vách ngăn logic chia cụm thành nhiều vùng tên riêng.',
  },
  ResourceQuota: {
    short: 'Quota',
    group: 'cluster',
    hotkey: null,
    hint: 'Trần tài nguyên cho cả một namespace.',
  },
  LimitRange: {
    short: 'Limits',
    group: 'cluster',
    hotkey: null,
    hint: 'Mức mặc định và mức trần cho từng container trong namespace.',
  },
  /*
   * `Node` có mặt để `satisfies` đủ theo kiểu, và vì một level dạy về taint /
   * nodeSelector có thể mở nó ra. Trong hầu hết level nó nằm ngoài
   * `allowedResources` nên ô hiện mờ kèm lời giải thích — đúng trạng thái người
   * chơi cần thấy: loại này CÓ thật, chỉ là bài này không dùng tới.
   */
  Node: {
    short: 'Node',
    group: 'cluster',
    hotkey: null,
    hint: 'Máy chạy pod. Ở cụm thật node do hạ tầng cấp, không tạo bằng manifest.',
  },
} as const satisfies Record<ResourceKind, PaletteMeta>;

/**
 * Danh sách ô, đã sắp theo `PALETTE_GROUP_ORDER` rồi theo thứ tự khai báo trong
 * mỗi nhóm. Dựng MỘT LẦN ở module scope: bảng bên trái vẽ lại mỗi lần chọn
 * object, và sắp lại 26 mục trong mỗi lần render là công vô ích.
 */
export const PALETTE_ENTRIES: readonly PaletteEntry[] = PALETTE_GROUP_ORDER.flatMap((group) =>
  (Object.entries(PALETTE_META) as [ResourceKind, PaletteMeta][])
    .filter(([, meta]) => meta.group === group)
    .map(([kind, meta]) => ({
      kind,
      short: meta.short,
      full: kind,
      group: meta.group,
      hotkey: meta.hotkey,
    })),
);

/** Một dòng "loại này để làm gì" — nội dung tooltip của ô. */
export function paletteHint(kind: ResourceKind): string {
  return PALETTE_META[kind].hint;
}

/**
 * Tra ô theo phím số. Trả `null` khi phím đó không gán cho ô nào.
 *
 * Quét tuyến tính 26 phần tử là đủ: hàm chỉ chạy lúc người dùng bấm một phím số,
 * không chạy trong vòng lặp vẽ.
 */
export function entryByHotkey(hotkey: number): PaletteEntry | null {
  return PALETTE_ENTRIES.find((entry) => entry.hotkey === hotkey) ?? null;
}
