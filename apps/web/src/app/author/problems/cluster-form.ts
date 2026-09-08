import type { ClusterSpec, IncidentKind, ResourceKind } from '@devops-platform/games';
import { formatKeyValueLines } from './text-tools';

/**
 * Mô hình FORM của `ClusterSpec` — trạng thái cụm lúc bắt đầu bài.
 *
 * ## Vì sao form giữ chuỗi chứ không giữ số
 *
 * Cùng lý lẽ với `components/author/draft-form.ts`: ô nhập trả `''` khi trống VÀ
 * khi đang gõ dở. Ép sang số ngay lúc gõ thì `Number('')` ra `0` — một node "chưa
 * khai CPU" lặng lẽ thành "node có 0 CPU", và bài xuất bản được với một cụm
 * không lịch nổi pod nào. `NaN` còn tệ hơn: nó serialise thành `null` trong JSON
 * nên tới máy chủ dưới dạng "không khai".
 *
 * ## Vì sao `spec` là một ô JSON chứ không phải biểu mẫu
 *
 * Đây là chủ ý, không phải cắt góc. `ResourceSpec.spec` cố ý lỏng ở hợp đồng:
 * 26 loại × mọi field thật của Kubernetes là một cây kiểu khổng lồ, và
 * `resources.ts` chỉ đọc một góc nhỏ của nó — góc đó cũng không xuất ra ngoài
 * package. Dựng biểu mẫu cho một hình dạng mình không biết là bịa ra một hợp
 * đồng thứ hai, và nó sẽ chặn đúng những field mà engine THẬT SỰ đọc.
 *
 * Nên ô JSON, có kiểm cú pháp, kèm yêu cầu phải là object — không phải mảng,
 * không phải chuỗi. Người soạn dán YAML đã đổi sang JSON vào đây.
 */

export interface NodeFormState {
  /** Khoá React ổn định khi chèn/xoá giữa danh sách. KHÔNG gửi lên máy chủ. */
  readonly key: string;
  name: string;
  cpu: string;
  memory: string;
  ready: boolean;
  labels: string;
  taints: string;
}

export interface ResourceFormState {
  readonly key: string;
  kind: ResourceKind;
  name: string;
  namespace: string;
  specJson: string;
  seededIncident: '' | IncidentKind;
}

export interface ClusterFormState {
  nodes: readonly NodeFormState[];
  /** Một namespace mỗi dòng. */
  namespacesText: string;
  resources: readonly ResourceFormState[];
}

export interface FieldIssue {
  readonly path: string;
  readonly message: string;
}

export function emptyNode(key: string): NodeFormState {
  return { key, name: '', cpu: '4000', memory: '8192', ready: true, labels: '', taints: '' };
}

export function emptyResource(key: string): ResourceFormState {
  return { key, kind: 'Pod', name: '', namespace: 'default', specJson: '{}', seededIncident: '' };
}

export function emptyCluster(nextKey: () => string): ClusterFormState {
  return { nodes: [emptyNode(nextKey())], namespacesText: 'default', resources: [] };
}

export function clusterFromSpec(spec: ClusterSpec, nextKey: () => string): ClusterFormState {
  return {
    nodes: spec.nodes.map((node) => ({
      key: nextKey(),
      name: node.name,
      cpu: String(node.cpu),
      memory: String(node.memory),
      ready: node.ready,
      labels: formatKeyValueLines(node.labels),
      taints: (node.taints ?? []).join('\n'),
    })),
    namespacesText: spec.namespaces.join('\n'),
    resources: spec.resources.map((resource) => ({
      key: nextKey(),
      kind: resource.kind,
      name: resource.name,
      namespace: resource.namespace,
      specJson: JSON.stringify(resource.spec, null, 2),
      seededIncident: resource.seededIncident ?? '',
    })),
  };
}
