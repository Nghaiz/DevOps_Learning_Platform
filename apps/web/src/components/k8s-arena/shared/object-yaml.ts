/**
 * `ObjectView` → YAML để hiện trong inspector (§4.4).
 *
 * Hàm THUẦN, không phụ thuộc DOM — đây là nội dung của một `<pre>` mà trình đọc
 * màn hình đọc được, nên nó phải đúng và phải test được.
 *
 * ## Đây KHÔNG phải một bộ tuần tự YAML tổng quát
 *
 * Nó chỉ biết đúng hình dạng phẳng của `ObjectView`. Cố ý: kéo một thư viện YAML
 * vào bundle để in ra bảy field là một đánh đổi tồi, và một bộ tổng quát tự viết
 * sẽ sai ở đúng những chỗ YAML khó (khối nhiều dòng, neo, kiểu ngầm định). Cần
 * YAML thật cho `apply` sau này thì đó là việc của lane B ở tầng logic, không
 * phải của lớp trình bày.
 *
 * ⚠ Không in `uid`: nó là chuyện nội bộ của renderer để tra scene graph, và hợp
 * đồng nói rõ khoá tự nhiên của K8s là bộ ba (kind, namespace, name). In `uid`
 * ra sẽ dạy người học một khoá không tồn tại trong `kubectl` thật.
 */

import type { ObjectView } from '@devops-platform/games';

/**
 * YAML để trần được khi chuỗi không thể bị đọc nhầm thành kiểu khác.
 *
 * Tên tài nguyên K8s theo RFC 1123 (chữ thường, số, `-`, `.`) nên gần như luôn
 * an toàn — nhưng `no`, `yes`, `on`, `off`, `null`, `~`, và mọi thứ trông như số
 * thì KHÔNG: YAML 1.1 đọc chúng thành boolean/số. Một namespace tên `no` in ra
 * không có ngoặc là một dòng nói dối.
 */
const NEEDS_QUOTE =
  /^$|^[-?:,[\]{}#&*!|>'"%@`]|[\s:#]|^(?:y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF|null|Null|NULL|~)$|^[+-]?(?:\d|\.\d)/;

export function yamlScalar(value: string): string {
  if (!NEEDS_QUOTE.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function line(indent: number, key: string, value: string): string {
  return `${' '.repeat(indent)}${key}: ${value}`;
}

/**
 * Bố cục theo đúng thứ tự người ta quen thấy khi gõ `kubectl get -o yaml`:
 * `kind` → `metadata` → `spec`/`status`. Đổi thứ tự sẽ làm người học phải dịch
 * lại giữa game và công cụ thật — đúng thứ một game dạy K8s không được phép làm.
 */
export function objectToYaml(object: ObjectView): string {
  const lines: string[] = [line(0, 'kind', yamlScalar(object.kind)), 'metadata:'];
  lines.push(line(2, 'name', yamlScalar(object.name)));
  lines.push(line(2, 'namespace', yamlScalar(object.namespace)));
  if (object.ownerUid !== null) {
    lines.push(line(2, 'ownerReferences', ''));
    lines.push(`    - uid: ${yamlScalar(object.ownerUid)}`);
  }

  const status: string[] = [];
  if (object.phase !== undefined) {
    status.push(line(2, 'phase', yamlScalar(object.phase)));
  }
  if (object.reason !== undefined) {
    status.push(line(2, 'reason', yamlScalar(object.reason)));
  }
  if (object.nodeName !== null) {
    status.push(line(2, 'nodeName', yamlScalar(object.nodeName)));
  }
  if (status.length > 0) {
    lines.push('status:');
    lines.push(...status);
  }

  return lines.join('\n');
}

/**
 * Nhãn ngắn hiện trong danh sách và trên lớp phủ canvas.
 *
 * `kind/name` là cách `kubectl` tự viết một tài nguyên, nên nó không cần dạy
 * thêm gì. Namespace bỏ đi ở đây vì danh sách đã nhóm theo namespace.
 */
export function shortLabel(object: ObjectView): string {
  return `${object.kind.toLowerCase()}/${object.name}`;
}
