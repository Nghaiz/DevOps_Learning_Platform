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
 * · `multi-node` — P7-bis (2026-09-04). Mở SAU khi có, và CHỈ khi có, những
 *     thứ mà bản P7 đòi trước khi được phép mở nó: một cụm con HAI node dựng
 *     được trên đường sản xuất (`DLP_K8S_NODES=2` → `start_k8s` dựng thêm một
 *     container `k3s agent`; 2/2 node Ready sau 23 s, đo bằng `dlp-k8s-wait`);
 *     một profile tài nguyên riêng (`sandbox.profiles.k8s-multinode`) đặt theo
 *     đỉnh ĐO ĐƯỢC DƯỚI TẢI 1094.79 MiB, với trần đồng thời 3 ghi thẳng vào
 *     values; và cách ly không tụt — `p7-escape-verify.sh` chạy với `NODES=2`,
 *     gồm cả phép thử từ một pod GHIM TRÊN NODE 2 (một container riêng, trên
 *     một mạng docker riêng — bề mặt mới, không phải bản sao của node 1).
 *
 * ⚠ NÓI THẲNG MỘT ĐIỀU KHÔNG DỄ CHỊU: hôm nay KHÔNG bài nào trong giáo trình
 * thật sự cần hai node. `ckad-configmap-as-files` mang nhãn `multi-node` chỉ vì
 * `backend.imageid` upstream của nó là `kubernetes-kubeadm-2nodes`; `verify.sh`
 * của bài dùng đúng MỘT pod và MỘT ConfigMap, không chạm node/nodeSelector/
 * taint/DaemonSet ở dòng nào. Nhãn ấy mô tả thứ backend upstream CUNG CẤP,
 * không phải thứ bài học ĐÒI.
 *
 * Mở vì hai lý do đứng độc lập với bài đó: nội dung CKA/CKAD nhập về sau (drain,
 * taint, nodeSelector, DaemonSet) cần 2 node thật; và phase-7 đã ghi sẵn điều
 * kiện "multi-node vẫn chưa — TRỪ KHI ĐO ĐƯỢC", nay đã thoả bằng số.
 */
export const RUNTIME_SUPPORTED_CAPABILITIES: readonly ScenarioCapability[] = [
  'docker',
  'kubernetes',
  'multi-node',
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
export function profileForCapabilities(
  capabilities: readonly ScenarioCapability[],
  interfaceLayout: string | null = null,
): string {
  // Thứ tự KHÔNG hoán đổi được: `multi-node` phải xét TRƯỚC. Một bài
  // multi-node cũng mang `kubernetes`, nên kiểm `kubernetes` trước sẽ trả
  // `'k8s'` và bài hai node nhận một pod 1Gi chỉ đủ cho một node — node phụ
  // đội trần rồi bị kubelet đuổi, và triệu chứng ("thỉnh thoảng chỉ thấy một
  // node") không trỏ về dòng này ở đâu cả.
  //
  // ⚠ K8s xét TRƯỚC ide, và tổ hợp ide+k8s CHƯA CÓ SỐ ĐO. `sandbox.profiles.k8s`
  // (1Gi requests) đo với cluster con + lab thật nhưng KHÔNG có IDE trong pod;
  // 6.E đo IDE + bài cùng lúc là 660Mi nhưng KHÔNG có cluster con. Cộng thẳng
  // hai số là đúng phép tính đã sai 18% ở `ideProfile` — nên ở đây ta chọn
  // profile lớn hơn (k8s) và ĐỂ NGỎ, có `TestNoContentIsBothIdeAndK8s` gác:
  // bài đầu tiên vừa `ide` vừa `kubernetes` sẽ làm test đó đỏ, và lúc ấy việc
  // phải làm là ĐO, không phải nới test.
  //
  // ⚠ Cổng ấy sống ở `packages/scenario/src/content-ide-k8s-guard.test.ts`.
  // Đường dẫn được ghi ra vì suốt một thời gian dòng trên viện dẫn một cái tên
  // KHÔNG TỒN TẠI ở đâu trong repo — hai chỗ trong mã dựa vào một cái chốt
  // không có thật, và không có gì báo. Dựng thật 2026-09-13. Đổi tên file thì
  // đổi cả dòng này và ghi chú của `content/scenarios/dlp-ide-config-edit`.
  if (capabilities.includes('multi-node')) return 'k8s-multinode';
  if (capabilities.includes('kubernetes')) return 'k8s';
  // 6.E: một pod có IDE đỉnh 660Mi (IDE + bài cùng lúc), 783Mi qua ba lượt tải
  // lại. Không đặt profile ⇒ LimitRange mặc định (256Mi requests) ⇒ kubelet
  // đuổi pod khi node bị ép RAM, ngẫu nhiên, giữa buổi học.
  return interfaceLayout === 'ide' ? 'ide' : '';
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
