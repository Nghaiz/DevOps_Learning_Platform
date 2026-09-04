import { join } from 'node:path';
import type { ScenarioSource } from '@devops-platform/scenario';
import type { ScenarioCapability } from '@devops-platform/shared-types/scenario';
import { publishedContentSource } from '../content/source';
import { scenariosDir } from '../env';

/**
 * Nguồn nội dung bài học của BFF — MỘT chỗ duy nhất trong apps/web biết bài học
 * tới từ đâu.
 *
 * Router tRPC gọi `scenarioSource()`, không gọi `loadScenarios()`. Đó là điều
 * làm bản DB-backed (soạn bài trên UI) thay được vào đây mà không sửa router,
 * `checkStep`, hay FE — xem `packages/scenario/src/source.ts`.
 *
 * ✅ P9 (2026-09-04): ngày đó đã tới, và lời hứa trên đứng vững — nguồn giờ là
 * `composite([đĩa, DB])` và KHÔNG một dòng nào của `lessons.ts`/`checkStep`/FE
 * phải sửa. Chữ ký zero-arg là vế còn lại của lời hứa đó, nên nó KHÔNG được
 * nhận tham số: một `scenarioSource(ctx)` sẽ phá đúng ô AC này.
 *
 * Nguồn này chỉ trả bài `published`. Bài nháp sống ở `authoring.list`, nơi nguồn
 * được dựng KÈM tầm nhìn (`content/source.ts` § `contentSourceFor`).
 *
 * ⚠ KHÔNG còn cache singleton ở đây: nguồn DB không được cache (một bài vừa sửa
 * phải thấy ngay). Cache của phần ĐĨA vẫn còn, nằm trong `content/source.ts`.
 */
export function scenarioSource(): ScenarioSource {
  return publishedContentSource();
}

/**
 * Thư mục trên đĩa của một scenario — dùng cho asset (đẩy vào sandbox, và phục
 * vụ ảnh qua `/api/scenarios/[id]/assets/[...path]`).
 *
 * ⚠ Đây là chỗ DUY NHẤT trong apps/web giả định nội dung nằm trên đĩa, tức nó là
 * món nợ đã biết đối với seam `ScenarioSource`: bản DB-backed sẽ không có thư
 * mục nào để trả về. Khi ngày đó tới, asset phải đi qua chính seam đó (thêm
 * `readAsset(id, name)`) chứ không phải qua đường dẫn. Ghi ra đây để nó không
 * lặng lẽ nhân bản sang call-site thứ ba.
 *
 * `id` an toàn để nối vào đường dẫn vì mọi caller đều đã cho nó qua
 * `scenarioIdSchema` (`^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$`) — không có `.`,
 * không có `/`, nên không traversal được.
 */
export function scenarioDir(id: string): string {
  return join(scenariosDir(), id);
}

/**
 * Năng lực sandbox mà nền tảng ĐÃ CHỨNG MINH chạy được.
 *
 * ⛔ Đây là danh sách của những gì ĐÃ ĐO, không phải của những gì proto/DB có
 * tên.
 *
 * · `docker` — 1.E-2 chạy thật DinD trong pod Sysbox.
 * · `kubernetes` — P7/7.B–7.F (2026-09-04). Mở SAU khi có, theo đúng thứ tự:
 *     một cluster k3s dựng được trong pod Sysbox (Ready sau 49 s, đo bằng
 *     `dlp-k8s-wait`); một Deployment/ConfigMap/Service tạo được và
 *     `nginx:1.29.0` KÉO ĐƯỢC trong cluster con; một profile tài nguyên
 *     (`sandbox.profiles.k8s`) đặt theo đỉnh đo được 589 MiB, với trần đồng
 *     thời tính ra 6 phiên và ghi thẳng vào values; và cách ly không tụt —
 *     `netpol-verify.sh` 22/22 cùng `p7-escape-verify.sh` 9/9 với một pod có
 *     cluster con đang chạy. Số đo đầy đủ: `docs/k8s-in-pod.md`.
 *
 * ⛔ `multi-node` VẪN KHÔNG nằm đây, và cố ý không mở kèm: cluster con là MỘT
 * node. Mở nó chỉ vì `kubernetes` đã mở sẽ là đúng cái lời hứa sai mà cả khối
 * chú thích này tồn tại để chặn.
 */
export const RUNTIME_SUPPORTED_CAPABILITIES: readonly ScenarioCapability[] = [
  'docker',
  'kubernetes',
];

/**
 * Tên profile tài nguyên mà orchestrator phải dùng cho một bài có các năng lực
 * này. Rỗng = profile mặc định (LimitRange của namespace lo).
 *
 * ⚠ Đây là mắt xích khiến `'kubernetes'` ở trên KHÔNG phải một lời hứa suông.
 * Một bài K8s chạy bằng pod mặc định (limit 1Gi, không có `DLP_K8S`) sẽ không
 * có cluster nào để `kubectl` trỏ tới, và người học nhận
 * `connection refused` — tức đúng chế độ hỏng mà việc mở năng lực lẽ ra phải
 * kết thúc. Profile `k8s` vừa nâng trần RAM lên 2Gi vừa đặt `DLP_K8S=1`, và cờ
 * đó là thứ `start_k8s` của entrypoint sandbox đọc để dựng cluster.
 *
 * Tên trả về phải khớp một key trong `sandbox.profiles` của Helm values;
 * orchestrator TỪ CHỐI (`InvalidArgument`) một tên lạ thay vì lặng lẽ rơi về
 * mặc định — cùng kỷ luật fail-closed với `SandboxTier`.
 */
export function profileForCapabilities(capabilities: readonly ScenarioCapability[]): string {
  return capabilities.includes('kubernetes') ? 'k8s' : '';
}

/**
 * Năng lực bài này đòi mà nền tảng chưa chạy được.
 *
 * ⛔ **CẢNH BÁO, KHÔNG CHẶN — và đây là một đánh đổi có chủ ý, không phải sự dễ
 * dãi.** Chặn cứng nghe an toàn hơn, nhưng nó làm `ckad-configmap-as-files`
 * (imageid `kubernetes-kubeadm-2nodes`) không khởi động được — chính là scenario
 * mà plan P2 chỉ định làm bằng chứng pass/fail, vì ba bài còn lại hoặc không có
 * verify, hoặc verify là `/bin/true`. Chặn ở đây nghĩa là ô AC "Check trả pass/fail
 * đúng" không còn cách nào đóng.
 *
 * Cái giá của việc cảnh báo thay vì chặn: người học mở bài CKAD và thấy `kubectl:
 * command not found`. Cái giá đó CHẤP NHẬN ĐƯỢC chỉ khi lời cảnh báo tới TRƯỚC —
 * nên `startSession` trả field này và FE (2.D) bắt buộc phải hiện nó. Nếu 2.D bỏ
 * qua field này thì đánh đổi trên trở thành một lỗi im lặng.
 *
 * Đường đóng thật sự là dựng runtime kubeadm-in-pod (P3), lúc đó thêm một dòng
 * vào `RUNTIME_SUPPORTED_CAPABILITIES` và hàm này tự trả rỗng.
 */
export function unsupportedCapabilities(
  capabilities: readonly ScenarioCapability[],
): ScenarioCapability[] {
  return capabilities.filter((c) => !RUNTIME_SUPPORTED_CAPABILITIES.includes(c));
}
