import { filesystemScenarioSource, type ScenarioSource } from '@devops-platform/scenario';
import type { ScenarioCapability } from '@devops-platform/shared-types/scenario';
import { scenariosDir } from '../env';

/**
 * Nguồn nội dung bài học của BFF — MỘT chỗ duy nhất trong apps/web biết bài học
 * tới từ đâu.
 *
 * Router tRPC gọi `scenarioSource()`, không gọi `loadScenarios()`. Đó là điều
 * làm bản DB-backed (soạn bài trên UI) thay được vào đây mà không sửa router,
 * `checkStep`, hay FE — xem `packages/scenario/src/source.ts`.
 */
let source: ScenarioSource | null = null;

export function scenarioSource(): ScenarioSource {
  source ??= filesystemScenarioSource(scenariosDir());
  return source;
}

/**
 * Năng lực sandbox mà P1 ĐÃ CHỨNG MINH chạy được.
 *
 * ⛔ Đây là danh sách của những gì ĐÃ ĐO, không phải của những gì proto/DB có
 * tên. `docker` nằm đây vì 1.E-2 chạy thật DinD trong pod Sysbox. `kubernetes` /
 * `multi-node` KHÔNG nằm đây: kubeadm-trong-pod chưa từng chạy trên nền tảng
 * này (`packages/scenario/src/backend.ts` ghi rõ nhãn đó hôm nay là CẢNH BÁO,
 * không phải lời hứa).
 */
export const RUNTIME_SUPPORTED_CAPABILITIES: readonly ScenarioCapability[] = ['docker'];

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
