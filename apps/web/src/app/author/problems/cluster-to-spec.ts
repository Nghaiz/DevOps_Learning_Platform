import { errText, t } from '@devops-platform/copy';
import type { ClusterSpec, NodeSpec, ResourceSpec } from '@devops-platform/games';
import type { ClusterFormState, FieldIssue } from './cluster-form';
import { parseKeyValueLines, parseList } from './text-tools';
import { isClusterScoped } from './vocabulary';

/**
 * Form → `ClusterSpec`, kèm lỗi theo TỪNG Ô.
 *
 * Tách khỏi `cluster-form.ts` vì hai việc khác nhau: bên kia khai hình dạng và
 * đọc bài đã lưu về form, bên này là phép đổi ngược có thể ĐỎ. Gộp lại thì mọi
 * chỗ chỉ cần kiểu `NodeFormState` cũng phải kéo theo toàn bộ phép kiểm.
 */
function readInt(raw: string, path: string, label: string, issues: FieldIssue[]): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    issues.push({
      path,
      message: errText('problem.cluster-to-spec-chua-khai', { label: String(label) }),
    });
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    issues.push({
      path,
      message: errText('problem.cluster-to-spec-phai-la-so-nguyen-khong-am', {
        label: String(label),
      }),
    });
    return null;
  }
  return value;
}

/**
 * Form → `ClusterSpec`. Trả lỗi theo TỪNG Ô để trang soạn chỉ đúng chỗ sai, chứ
 * không ném một câu "trạng thái cụm không hợp lệ" mà người soạn phải tự dò.
 */
export function clusterToSpec(
  form: ClusterFormState,
):
  | { readonly ok: true; readonly value: ClusterSpec }
  | { readonly ok: false; readonly issues: readonly FieldIssue[] } {
  const issues: FieldIssue[] = [];
  const nodes: NodeSpec[] = [];
  const seenNodes = new Set<string>();

  form.nodes.forEach((node, index) => {
    const path = `nodes.${String(index)}`;
    const name = node.name.trim();
    if (name === '') {
      issues.push({
        path: `${path}.name`,
        message: errText('problem.cluster-to-spec-node-phai-co-ten'),
      });
    } else if (seenNodes.has(name)) {
      issues.push({
        path: `${path}.name`,
        message: errText('problem.cluster-to-spec-trung-ten-node', { name: String(name) }),
      });
    }
    seenNodes.add(name);

    const cpu = readInt(node.cpu, `${path}.cpu`, t('problem.resource-cpu'), issues);
    const memory = readInt(
      node.memory,
      `${path}.memory`,
      t('problem.cluster-to-spec-bo-nho-mib'),
      issues,
    );
    if (name === '' || cpu === null || memory === null) {
      return;
    }

    const labels = parseKeyValueLines(node.labels);
    const taints = parseList(node.taints);
    nodes.push({
      name,
      cpu,
      memory,
      ready: node.ready,
      ...(Object.keys(labels).length > 0 ? { labels } : {}),
      ...(taints.length > 0 ? { taints } : {}),
    });
  });

  const namespaces = parseList(form.namespacesText);
  if (namespaces.length === 0) {
    issues.push({
      path: 'namespaces',
      message: errText('problem.cluster-to-spec-can-it-nhat-mot-namespace'),
    });
  }

  const resources: ResourceSpec[] = [];
  form.resources.forEach((resource, index) => {
    const path = `resources.${String(index)}`;
    const name = resource.name.trim();
    if (name === '') {
      issues.push({
        path: `${path}.name`,
        message: errText('problem.cluster-to-spec-tai-nguyen-phai-co-ten'),
      });
    }

    // Loại phạm vi cluster mang namespace rỗng — đó là quy ước của `lookup` trong
    // engine, không phải một ô bỏ trống cho vui.
    const namespace = isClusterScoped(resource.kind) ? '' : resource.namespace.trim();
    if (!isClusterScoped(resource.kind)) {
      if (namespace === '') {
        issues.push({
          path: `${path}.namespace`,
          message: errText('problem.cluster-to-spec-tai-nguyen-co-namespace-phai-khai-namespace'),
        });
      } else if (!namespaces.includes(namespace)) {
        issues.push({
          path: `${path}.namespace`,
          message: errText(
            'problem.cluster-to-spec-namespace-chua-duoc-khai-o-danh-sach-namespace',
            { namespace: String(namespace) },
          ),
        });
      }
    }

    const parsed = parseSpecJson(resource.specJson);
    if (!parsed.ok) {
      issues.push({ path: `${path}.spec`, message: parsed.message });
      return;
    }
    if (name === '') {
      return;
    }

    resources.push({
      kind: resource.kind,
      name,
      namespace,
      spec: parsed.value,
      ...(resource.seededIncident === '' ? {} : { seededIncident: resource.seededIncident }),
    });
  });

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, value: { nodes, namespaces, resources } };
}

function parseSpecJson(
  raw: string,
):
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly message: string } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: true, value: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return {
      ok: false,
      message: errText('problem.cluster-json-fields-json-khong-doc-duoc', {
        value1: String(
          error instanceof Error ? error.message : t('problem.cluster-json-fields-loi-cu-phap'),
        ),
      }),
    };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      message: errText(
        'problem.cluster-to-spec-phan-than-phai-la-mot-object-json-khong-phai-mang-hay-gia-tri-don',
      ),
    };
  }
  return { ok: true, value: parsed as Readonly<Record<string, unknown>> };
}
