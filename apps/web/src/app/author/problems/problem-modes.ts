/**
 * Các chế độ của trình soạn đề, và ô nào thuộc chế độ nào.
 *
 * Hàm thuần, tách khỏi component, vì nó là luật mà bảng kiểm bên phải dựa vào:
 * bấm một lỗi thì trình soạn phải mở ĐÚNG chế độ đang chứa ô đó rồi mới đưa
 * focus vào được. Radix chỉ dựng nội dung của tab đang mở, nên mở sai chế độ là
 * ô không có trong DOM và focus rơi vào hư không.
 *
 * Giá trị của từng chế độ là slug ổn định, không phải nhãn: nhãn tab "Trạng thái
 * ban đầu" đổi theo game (K8s gọi là "Cụm ban đầu"), giá trị thì không.
 */
export const PROBLEM_MODES = {
  statement: 'mo-ta',
  spec: 'trang-thai',
  objectives: 'muc-tieu',
  hints: 'goi-y',
  arena: 'thu',
  json: 'json',
  publish: 'xuat-ban',
} as const;

export type ProblemMode = (typeof PROBLEM_MODES)[keyof typeof PROBLEM_MODES];

/** Ô cấp bài, cùng nằm ở chế độ Mô tả. Khoá là phần ĐẦU của `FieldIssue.path`. */
const STATEMENT_HEADS: ReadonlySet<string> = new Set([
  'gameId',
  'title',
  'slug',
  'statement',
  'difficulty',
  'topics',
  'tags',
  'timeLimitSec',
  'parMoves',
  'seedable',
  'allowedResources',
]);

/** Ba nhóm của biểu mẫu cụm K8s viết tay. */
const CLUSTER_HEADS: ReadonlySet<string> = new Set(['nodes', 'namespaces', 'resources']);

/**
 * Chế độ chứa ô của `path`, hoặc `null` khi đường đó không ứng với ô nào trên
 * biểu mẫu (lỗi cấp bài từ máy chủ, một trường lạ của bài nhập từ JSON).
 *
 * `specPaths` là đường của các ô plugin khai (`authorFields`), vì tên ô trạng
 * thái ban đầu của Git hay CI/CD không đoán được từ một bảng viết tay ở đây.
 */
export function modeForIssuePath(path: string, specPaths: readonly string[]): ProblemMode | null {
  const head = path.split('.')[0] ?? '';
  if (STATEMENT_HEADS.has(head)) return PROBLEM_MODES.statement;
  if (head === 'objectives') return PROBLEM_MODES.objectives;
  if (head === 'hints') return PROBLEM_MODES.hints;
  if (CLUSTER_HEADS.has(head) || specPaths.includes(path) || specPaths.includes(head)) {
    return PROBLEM_MODES.spec;
  }
  return null;
}
