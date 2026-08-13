import type { SandboxTierName, ScenarioCapability } from '@devops-platform/shared-types/scenario';

/**
 * Ánh xạ `backend.imageid` của Killercoda sang tier + năng lực sandbox của TA.
 *
 * Đây là SSOT của phép ánh xạ đó, và nó cố ý là một BẢNG chứ không phải một
 * chuỗi `if` đoán theo tiền tố: `kubernetes-kubeadm-1node-4GB-rapid` khớp mọi
 * heuristic "bắt đầu bằng kubernetes-" nhưng cũng đòi RAM khác hẳn, và một
 * heuristic sẽ nuốt luôn mọi imageid tương lai mà không ai kịp xem xét.
 *
 * ⛔ Sidecar `dlp.json` KHÔNG khai `tier`/`capabilities`. Chúng suy được trọn vẹn
 * từ `imageid`, nên khai thêm ở sidecar là dựng derived field
 * (`rules/code-conventions.md` § No Derived Fields): hai chỗ trả lời cùng một câu
 * hỏi thì sớm muộn lệch nhau, và không ai biết bên nào đúng.
 *
 * imageid lạ ⇒ NÉM. Không có nhánh "mặc định về ubuntu": một bài cần cụm
 * Kubernetes mà rơi vào sandbox chỉ có shell sẽ chết ở `kubectl: command not
 * found` giữa step 1 — triệu chứng nằm cách nguyên nhân (một dòng trong bảng
 * này) đúng ba tầng.
 */
export interface BackendMapping {
  readonly tier: SandboxTierName;
  readonly capabilities: readonly ScenarioCapability[];
}

/**
 * Danh sách imageid lấy từ trang docs của Killercoda creator (đọc 2026-08-13).
 *
 * Mọi dòng đều `sysbox` vì đó là tier DUY NHẤT P1 dựng thật (1.E-2: DinD chạy
 * trong pod Sysbox). `gvisor`/`kata` có trong enum của proto/DB nhưng chưa có
 * runtime nào sau lưng — điền chúng vào đây bây giờ là hứa một thứ không tồn tại.
 *
 * ⚠ `kubernetes` capability nghĩa là "bài này cần một cụm k8s BÊN TRONG sandbox".
 * P1 đã chứng minh DinD; kubeadm-trong-pod thì CHƯA. Nên capability này hôm nay
 * là một NHÃN CẢNH BÁO đọc được bằng máy, không phải một lời hứa chạy được —
 * 2.C/2.D phải dùng nó để chặn hoặc để cảnh báo, và test
 * `content-scenarios.test.ts` khẳng định nhãn đó có mặt.
 */
export const BACKEND_IMAGE_MAPPING: Readonly<Record<string, BackendMapping>> = {
  ubuntu: { tier: 'sysbox', capabilities: [] },
  'kubernetes-kubeadm-1node': { tier: 'sysbox', capabilities: ['kubernetes'] },
  'kubernetes-kubeadm-1node-rapid': { tier: 'sysbox', capabilities: ['kubernetes'] },
  'kubernetes-kubeadm-1node-4GB-rapid': { tier: 'sysbox', capabilities: ['kubernetes'] },
  'kubernetes-kubeadm-2nodes': { tier: 'sysbox', capabilities: ['kubernetes', 'multi-node'] },
  'kubernetes-kubeadm-2nodes-rapid': { tier: 'sysbox', capabilities: ['kubernetes', 'multi-node'] },
};

export const KNOWN_BACKEND_IMAGE_IDS: readonly string[] = Object.keys(BACKEND_IMAGE_MAPPING).sort();

/** `null` khi imageid chưa có trong bảng — caller quyết định thông điệp lỗi. */
export function mapBackendImage(imageId: string): BackendMapping | null {
  return BACKEND_IMAGE_MAPPING[imageId] ?? null;
}
