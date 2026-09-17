/**
 * Adapter Kubernetes trên bộ quét YAML dùng chung, cộng phép chuyển manifest →
 * `ResourceSpec` phẳng.
 *
 * Phần QUÉT — thụt lề, dãy, vô hướng, nháy, chú thích, `---`, và mọi lỗi từ
 * chối — đã chuyển sang `core/yaml.ts` khi game thứ hai cũng cần đọc YAML. Ở
 * lại đây đúng phần biết Kubernetes: `resolveKind`, `isNamespaced`, và phép làm
 * phẳng manifest bên dưới. Lý lẽ "vì sao không kéo `js-yaml`" nằm ở đầu file
 * `core/yaml.ts` và vẫn nguyên giá trị.
 */

import type { ResourceKind } from './contract.ts';
import { isNamespaced, resolveKind } from './resources.ts';
import { parseYaml } from '../core/yaml.ts';
import type { YamlValue } from '../core/yaml.ts';

export { parseYaml };
export type { YamlResult, YamlValue } from '../core/yaml.ts';

// ── Manifest → ResourceSpec phẳng ───────────────────────────────────────────

/**
 * Manifest thật lồng `metadata` / `spec` / `template.metadata.labels`. Từ vựng
 * mà level và mô phỏng dùng thì PHẲNG (`labels` và `containers` cùng cấp), theo
 * quy ước lane C ở `levels/index.ts`.
 *
 * Làm phẳng ở ĐÂY, một chỗ duy nhất, chứ không để mô phỏng đọc được cả hai dạng:
 * hai dạng nghĩa là mọi vị từ, mọi controller phải nhớ thử cả hai, và cái quên
 * đầu tiên sẽ là một level chỉ hỏng khi người chơi gõ YAML thay vì dùng bảng.
 *
 * Chiều ngược lại — người chơi VẪN gõ YAML thật, có `metadata`, có
 * `template.spec` — được giữ nguyên. Dạy một cú pháp YAML riêng của game thì
 * người học mang về cụm thật không dùng được.
 */
export interface Manifest {
  readonly kind: ResourceKind;
  readonly name: string;
  readonly namespace: string;
  readonly spec: Readonly<Record<string, unknown>>;
}

export type ManifestResult =
  | { readonly ok: true; readonly manifests: readonly Manifest[] }
  | { readonly ok: false; readonly error: string };

const RESERVED = new Set(['apiVersion', 'kind', 'metadata', 'spec', 'status']);

export function parseManifests(source: string, defaultNamespace = 'default'): ManifestResult {
  const parsed = parseYaml(source);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  // Bộ quét dùng chung trả về MỘT phần tử cho mỗi tài liệu ngăn bởi `---`, kể cả
  // tài liệu rỗng (là `null`). Ở đây tài liệu rỗng không phải manifest nào cả —
  // `---` thừa ở đầu hay cuối file là chuyện thường — nên lọc trước khi hỏi
  // "có manifest nào không", chứ không để một file rỗng đi tiếp rồi báo sai là
  // "phải là một map ở cấp cao nhất".
  const documents = parsed.documents.filter((document) => document !== null);
  if (documents.length === 0) {
    return { ok: false, error: 'YAML rỗng — không có manifest nào để áp.' };
  }
  const manifests: Manifest[] = [];
  for (const document of documents) {
    const record = asYamlMap(document);
    if (record === null) {
      return { ok: false, error: 'Manifest phải là một map ở cấp cao nhất.' };
    }
    const kindText = typeof record['kind'] === 'string' ? record['kind'] : '';
    const kind = resolveKind(kindText);
    if (kind === null) {
      return {
        ok: false,
        error:
          kindText === ''
            ? 'Manifest thiếu trường `kind`.'
            : `Không biết loại tài nguyên "${kindText}".`,
      };
    }
    const metadata = asYamlMap(record['metadata']) ?? {};
    const name = typeof metadata['name'] === 'string' ? metadata['name'] : '';
    if (name === '') {
      return { ok: false, error: `Manifest ${kind} thiếu \`metadata.name\`.` };
    }
    const extras: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!RESERVED.has(key)) {
        extras[key] = value;
      }
    }
    const spec = asYamlMap(record['spec']) ?? {};
    const merged: Record<string, unknown> = { ...extras, ...spec };
    const labels = asYamlMap(metadata['labels']);
    if (labels !== null) {
      merged['labels'] = labels;
    }
    if (merged['template'] !== undefined) {
      merged['template'] = flattenPodTemplate(merged['template']);
    }
    if (merged['jobTemplate'] !== undefined) {
      merged['jobTemplate'] = flattenJobTemplate(merged['jobTemplate']);
    }
    manifests.push({
      kind,
      name,
      namespace: isNamespaced(kind)
        ? typeof metadata['namespace'] === 'string'
          ? metadata['namespace']
          : defaultNamespace
        : '',
      spec: merged,
    });
  }
  return { ok: true, manifests };
}

function asYamlMap(value: unknown): Record<string, YamlValue> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, YamlValue>;
}

/** `{metadata:{labels}, spec:{containers}}` → `{labels, containers}`. Đã phẳng thì giữ nguyên. */
function flattenPodTemplate(value: unknown): unknown {
  const template = asYamlMap(value);
  if (template === null) {
    return value;
  }
  const metadata = asYamlMap(template['metadata']);
  const spec = asYamlMap(template['spec']);
  if (metadata === null && spec === null) {
    return template;
  }
  const out: Record<string, unknown> = { ...(spec ?? {}) };
  for (const [key, item] of Object.entries(template)) {
    if (key !== 'metadata' && key !== 'spec') {
      out[key] = item;
    }
  }
  const labels = metadata === null ? null : asYamlMap(metadata['labels']);
  if (labels !== null) {
    out['labels'] = labels;
  }
  return out;
}

function flattenJobTemplate(value: unknown): unknown {
  const job = asYamlMap(value);
  if (job === null) {
    return value;
  }
  const spec = asYamlMap(job['spec']) ?? job;
  const out: Record<string, unknown> = { ...spec };
  if (out['template'] !== undefined) {
    out['template'] = flattenPodTemplate(out['template']);
  }
  return out;
}
