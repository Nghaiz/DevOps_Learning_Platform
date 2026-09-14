/**
 * `K8sObject` → YAML manifest ĐẦY ĐỦ, đối xứng với `parseManifests`.
 *
 * ## Vì sao nó phải tồn tại, và vì sao ở ĐÂY chứ không ở tầng giao diện
 *
 * Tầng giao diện đã có `object-yaml.ts`, nhưng nó tuần tự hoá `ObjectView` — một
 * PHÉP CHIẾU để hiển thị, cố ý không mang `spec`. Chính chú thích của nó đã nói
 * trước: *"Cần YAML thật cho `apply` sau này thì đó là việc của lane B ở tầng
 * logic, không phải của lớp trình bày."*
 *
 * Ngày ô soạn thảo YAML ra đời (2026-09-08), lời cảnh báo đó thành một lỗi PHÁ
 * DỮ LIỆU đo được: ô soạn thảo hiện manifest do `objectToYaml` dựng — không có
 * `spec` — và `editResource` trong reducer thay nguyên `spec` của object bằng
 * `manifest.spec`. Bấm Lưu mà không sửa gì cũng XOÁ SẠCH spec. Đo trực tiếp
 * trên trình duyệt: sau một lần Lưu, `kubectl describe pod` in ra `Containers:`
 * rồi bỏ trống — pod mất hết container mà vẫn `Running`, và không có một lỗi nào.
 *
 * Cách sửa đúng là để engine phát ra manifest THẬT (nó là bên duy nhất giữ
 * `spec`), chứ không phải làm ô soạn thảo chỉ-đọc.
 *
 * ## Bất biến: `parse(serialize(x))` phải trả lại đúng `x`
 *
 * Đây là điều kiện để "Lưu mà không sửa gì" là một phép KHÔNG LÀM GÌ. Nó được
 * gác bằng test round-trip trên toàn bộ object của cả 36 level
 * (`manifest-yaml.test.ts`), chứ không bằng vài ví dụ chép tay — chính những
 * hình dạng hiếm (mảng lồng mảng, map rỗng của NetworkPolicy, `template` đã
 * phẳng) mới là chỗ một bộ tuần tự tự viết sai.
 *
 * ⛔ KHÔNG kéo thư viện YAML vào đây. Lý do y hệt `yaml.ts`: package này đi
 * thẳng vào bundle trình duyệt, và ta chỉ cần đúng tập con mà `parseYaml` nhận.
 */

import type { K8sObject } from './model.ts';
import { isNamespaced } from './resources.ts';

/**
 * Chuỗi phải bọc nháy khi để trần sẽ bị đọc nhầm thành kiểu khác.
 *
 * Tên tài nguyên K8s theo RFC 1123 nên gần như luôn an toàn — nhưng `no`, `yes`,
 * `on`, `off`, `null`, `~` và mọi thứ trông như số thì KHÔNG: YAML đọc chúng
 * thành boolean/số. Một image tag `1.27` để trần sẽ quay lại thành SỐ 1.27, và
 * so sánh image trong vị từ mục tiêu sẽ trượt mà không ai hiểu tại sao.
 */
const NEEDS_QUOTE =
  /^$|^[-?:,[\]{}#&*!|>'"%@`]|[\s:#]|^(?:y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF|null|Null|NULL|~)$|^[+-]?(?:\d|\.\d)/;

function scalar(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  const text = String(value);
  return NEEDS_QUOTE.test(text) ? `'${text.replace(/'/g, "''")}'` : text;
}

function isMap(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `true` khi giá trị cần MỞ MỘT KHỐI mới thay vì viết cùng dòng với khoá. */
function isBlock(value: unknown): boolean {
  return (Array.isArray(value) && value.length > 0) || (isMap(value) && Object.keys(value).length > 0);
}

function emit(value: unknown, indent: number, out: string[]): void {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return;
    }
    for (const item of value) {
      if (isBlock(item)) {
        /*
         * Phần tử là khối: viết `- ` rồi ghi khối ở thụt lề +2, và KÉO dòng đầu
         * của khối lên nằm ngay sau dấu gạch. `parseYaml` nhận đúng dạng này, và
         * nó cũng là dạng người ta gõ tay.
         */
        const nested: string[] = [];
        emit(item, indent + 2, nested);
        const [first, ...rest] = nested;
        out.push(`${pad}- ${(first ?? '').trimStart()}`);
        out.push(...rest);
      } else {
        out.push(`${pad}- ${scalar(item)}`);
      }
    }
    return;
  }
  if (isMap(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) {
        continue;
      }
      if (Array.isArray(item) && item.length === 0) {
        out.push(`${pad}${key}: []`);
      } else if (isMap(item) && Object.keys(item).length === 0) {
        // `podSelector: {}` của NetworkPolicy — bỏ nó đi là đổi nghĩa policy.
        out.push(`${pad}${key}: {}`);
      } else if (isBlock(item)) {
        out.push(`${pad}${key}:`);
        emit(item, indent + 2, out);
      } else {
        out.push(`${pad}${key}: ${scalar(item)}`);
      }
    }
    return;
  }
  out.push(`${pad}${scalar(value)}`);
}

/**
 * Manifest đầy đủ của một object, ở đúng bố cục `kubectl get -o yaml` in ra:
 * `kind` → `metadata` → `spec`.
 *
 * `labels` đi vào `metadata.labels` chứ không nằm trong `spec`, vì đó là chỗ của
 * nó trong Kubernetes thật — và `parseManifests` gộp ngược nó vào `spec.labels`
 * lúc đọc, nên vòng tuần tự vẫn khép kín.
 *
 * ⚠ KHÔNG in `uid`, `status`, hay `ownerReferences`: chúng do engine sinh ra và
 * `editResource` không đọc chúng. In ra thì người chơi sẽ sửa và tưởng có tác
 * dụng — một ô nhập không làm gì là tệ hơn một ô nhập không tồn tại.
 */
export function toManifestYaml(object: K8sObject): string {
  const out: string[] = [`kind: ${scalar(object.kind)}`, 'metadata:'];
  out.push(`  name: ${scalar(object.name)}`);
  if (isNamespaced(object.kind) && object.namespace !== '') {
    out.push(`  namespace: ${scalar(object.namespace)}`);
  }
  if (Object.keys(object.labels).length > 0) {
    out.push('  labels:');
    emit(object.labels, 4, out);
  }

  /*
   * `labels` đã in ở `metadata` nên phải BỎ khỏi `spec`, nếu không nó xuất hiện
   * hai lần và bản đọc lại có một khoá `labels` thừa trong spec.
   */
  const spec: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object.spec)) {
    if (key !== 'labels') {
      spec[key] = value;
    }
  }
  if (Object.keys(spec).length > 0) {
    out.push('spec:');
    emit(spec, 2, out);
  }

  return out.join('\n');
}
