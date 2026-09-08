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
    issues.push({ path, message: `${label} chưa khai.` });
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    issues.push({ path, message: `${label} phải là số nguyên không âm.` });
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
): { readonly ok: true; readonly value: ClusterSpec } | { readonly ok: false; readonly issues: readonly FieldIssue[] } {
  const issues: FieldIssue[] = [];
  const nodes: NodeSpec[] = [];
  const seenNodes = new Set<string>();

  form.nodes.forEach((node, index) => {
    const path = `nodes.${String(index)}`;
    const name = node.name.trim();
    if (name === '') {
      issues.push({ path: `${path}.name`, message: 'Node phải có tên.' });
    } else if (seenNodes.has(name)) {
      issues.push({ path: `${path}.name`, message: `Trùng tên node "${name}".` });
    }
    seenNodes.add(name);

    const cpu = readInt(node.cpu, `${path}.cpu`, 'CPU (milli-core)', issues);
    const memory = readInt(node.memory, `${path}.memory`, 'Bộ nhớ (MiB)', issues);
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
    issues.push({ path: 'namespaces', message: 'Cần ít nhất một namespace.' });
  }

  const resources: ResourceSpec[] = [];
  form.resources.forEach((resource, index) => {
    const path = `resources.${String(index)}`;
    const name = resource.name.trim();
    if (name === '') {
      issues.push({ path: `${path}.name`, message: 'Tài nguyên phải có tên.' });
    }

    // Loại phạm vi cluster mang namespace rỗng — đó là quy ước của `lookup` trong
    // engine, không phải một ô bỏ trống cho vui.
    const namespace = isClusterScoped(resource.kind) ? '' : resource.namespace.trim();
    if (!isClusterScoped(resource.kind)) {
      if (namespace === '') {
        issues.push({ path: `${path}.namespace`, message: 'Tài nguyên có namespace phải khai namespace.' });
      } else if (!namespaces.includes(namespace)) {
        issues.push({
          path: `${path}.namespace`,
          message: `Namespace "${namespace}" chưa được khai ở danh sách namespace.`,
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
): { readonly ok: true; readonly value: Readonly<Record<string, unknown>> } | { readonly ok: false; readonly message: string } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: true, value: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return { ok: false, message: `JSON không đọc được: ${error instanceof Error ? error.message : 'lỗi cú pháp'}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: 'Phần thân phải là một object JSON, không phải mảng hay giá trị đơn.' };
  }
  return { ok: true, value: parsed as Readonly<Record<string, unknown>> };
}
