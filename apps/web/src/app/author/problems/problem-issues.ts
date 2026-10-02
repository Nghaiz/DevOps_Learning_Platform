import { renderCopy, t, type CopyRef, type StaticTextKey } from '@devops-platform/copy';
import type { AuthorField } from '@devops-platform/games';
import type { StudioIssue } from '../../../components/author/studio';
import type { FieldIssue } from './cluster-form';
import { modeForIssuePath } from './problem-modes';

/**
 * Đổi `FieldIssue` (đường dữ liệu + câu lỗi) sang `StudioIssue` mà bảng kiểm bên
 * phải đọc: TÊN Ô người soạn nhìn thấy trên màn hình, và cờ "nhảy tới được".
 *
 * Trước đây phép dịch này nằm trong `publish-check.tsx` và chỉ chạy ở tab Xuất
 * bản. Nay cả lỗi chặn lưu lẫn lỗi chặn xuất bản đều đi qua đây, nên nó là hàm
 * thuần riêng, đo được mà không phải dựng DOM.
 *
 * ⚠ `issue.message` KHÔNG đi qua bản đồ chữ: câu đó do `toProblemDraft`,
 * `publishIssues` hay Zod sinh ra lúc chạy, nên nó là dữ liệu.
 */
export function toStudioIssues(
  issues: readonly FieldIssue[],
  specFields: readonly AuthorField[],
): readonly StudioIssue[] {
  const specPaths = specFields.map((field) => field.path);
  return issues.map((issue) => ({
    path: issue.path,
    field: fieldNameFor(issue.path, specFields),
    message: issue.message,
    jumpable: modeForIssuePath(issue.path, specPaths) !== null,
  }));
}

/**
 * Gộp hai danh sách lỗi, bỏ cặp (đường, câu) trùng.
 *
 * Lỗi chặn lưu đứng trước: `issueFor` lấy lỗi ĐẦU TIÊN của một ô, và một ô không
 * lưu nổi thì chuyện nó chưa đủ điều kiện xuất bản là chuyện thứ hai.
 */
export function mergeIssues(
  first: readonly FieldIssue[],
  second: readonly FieldIssue[],
): readonly FieldIssue[] {
  const seen = new Set<string>();
  const out: FieldIssue[] = [];
  for (const issue of [...first, ...second]) {
    const id = JSON.stringify([issue.path, issue.message]);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(issue);
  }
  return out;
}

/** Nhãn plugin khai cho ô của nó thắng: tên ô Git hay CI/CD không có trong bảng dưới. */
export function fieldNameFor(path: string, specFields: readonly AuthorField[]): string {
  const own = specFields.find((field) => field.path === path);
  return own === undefined ? renderCopy(describeIssuePath(path)) : own.label;
}

/**
 * `objectives.2.args.namespace` → `Mục tiêu 3 › tham số namespace`.
 *
 * Trả `CopyRef` chứ không trả câu đã ghép: bốn nhánh là bốn mục TĨNH trong bản
 * đồ, nên cổng gạch ngang dài và cổng mất dấu soi được cả bốn.
 *
 * Nhánh dự phòng KHÔNG trả thẳng đường dẫn: nó nói thêm một chữ ("ô …") để người
 * đọc biết đó là một ô chưa có tên tiếng Việt, không tưởng đó là tên ô.
 */
export function describeIssuePath(path: string): CopyRef {
  const parts = path.split('.');
  const head = parts[0] ?? '';
  const index = Number(parts[1]);
  const groupKey = GROUP_KEYS[head];

  if (groupKey === undefined || !Number.isInteger(index)) {
    const own = FIELD_KEYS[path];
    return own === undefined ? { key: 'author.problem.path-unknown', params: { path } } : { key: own };
  }

  const group = t(groupKey);
  const n = index + 1;
  const rest = parts.slice(2);

  if (rest.length === 0) {
    return { key: 'author.problem.path-group', params: { group, n } };
  }
  if (rest[0] === 'args') {
    return { key: 'author.problem.path-arg', params: { group, n, arg: rest.slice(1).join('.') } };
  }

  const tail = rest.join('.');
  const tailKey = FIELD_KEYS[tail];
  return {
    key: 'author.problem.path-field',
    params: { group, n, field: tailKey === undefined ? tail : t(tailKey) },
  };
}

/** Bốn nhóm có chỉ số trong `FieldIssue.path`. */
const GROUP_KEYS: Readonly<Record<string, StaticTextKey>> = {
  objectives: 'author.problem.group.objectives',
  hints: 'author.problem.group.hints',
  nodes: 'author.problem.group.nodes',
  resources: 'author.problem.group.resources',
};

/**
 * Tên ô nhập, khoá chứ không phải chữ.
 *
 * Khoá bảng là ĐƯỜNG DẪN máy đọc (`timeLimitSec`, camelCase), khoá bản đồ là
 * dạng gạch nối. Hai hệ tên không suy được từ nhau bằng một phép đổi chữ
 * (`timeLimitSec` ↔ `time-limit`), nên ánh xạ tường minh, không ghép chuỗi.
 */
const FIELD_KEYS: Readonly<Record<string, StaticTextKey>> = {
  gameId: 'author.problem.game.label',
  title: 'author.problem.field.title',
  slug: 'author.problem.field.slug',
  statement: 'author.problem.field.statement',
  topics: 'author.problem.field.topics',
  tags: 'author.problem.field.tags',
  timeLimitSec: 'author.problem.field.time-limit',
  parMoves: 'author.problem.field.par-moves',
  allowedResources: 'author.problem.field.allowed-resources',
  namespaces: 'author.problem.field.namespaces',
  nodes: 'author.problem.field.nodes',
  objectives: 'author.problem.field.objectives',
  hints: 'author.problem.field.hints',
  name: 'author.problem.field.name',
  namespace: 'author.problem.field.namespace',
  cpu: 'author.problem.field.cpu',
  memory: 'author.problem.field.memory',
  spec: 'author.problem.field.spec',
  id: 'author.problem.field.id',
  label: 'author.problem.field.label',
  check: 'author.problem.field.check',
  text: 'author.problem.field.text',
  penaltyPoints: 'author.problem.field.penalty-points',
};
