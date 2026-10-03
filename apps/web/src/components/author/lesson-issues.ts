import { t, type StaticTextKey } from '@devops-platform/copy';
import type { ContentKind } from '@devops-platform/shared-types/authoring';
import type { StudioIssue } from './studio/inspector';

/**
 * Lỗi của trình soạn bài học/lab/sân chơi, đổi sang ngôn ngữ người soạn.
 *
 * ## Hai nguồn lỗi, hai khuôn đường dẫn
 *
 * - `toDraftInput` ở client sinh `steps[0].weight`, `task[1].taskId`, `title`.
 * - `authoring.check` ở máy chủ trả đường của Zod nối bằng dấu chấm:
 *   `steps.0.title`, `intro.setup.foreground`, `difficulty`.
 *
 * Hàm này đưa cả hai về MỘT khuôn chuẩn, đúng chuỗi mà các ô nhập rải lên
 * `data-field-path`: `steps[N].<ô>` cho bài học, `task[N].<ô>` cho lab,
 * `assets[N].<ô>`, `intro.<ô>`, `setup.foreground`. Nhờ vậy cùng một lỗi hiện
 * được ở hai nơi (dưới ô, và trong cột kiểm) và nút trong cột kiểm đưa focus về
 * đúng ô.
 *
 * Đường không nhận ra thì vẫn hiện, kèm nguyên văn đường dẫn, nhưng KHÔNG thành
 * nút: một nút không dẫn tới đâu tệ hơn một dòng chữ thường.
 */

const TOP_FIELD: Readonly<Record<string, StaticTextKey>> = {
  id: 'author.new.id.label',
  kind: 'author.new.kind.label',
  title: 'author.draft-meta-fields-tieu-de',
  description: 'author.draft-meta-fields-mo-ta',
  difficulty: 'author.draft-meta-fields-do-kho',
  estimatedMinutes: 'author.draft-meta-fields-thoi-luong-uoc-tinh-phut',
  tier: 'author.draft-meta-fields-tier-sandbox',
  interfaceLayout: 'author.draft-meta-fields-giao-dien',
  backendImageId: 'author.draft-meta-fields-backend-image-id',
  passThresholdPercent: 'author.draft-meta-fields-moc-dat',
  leaderboard: 'author.draft-meta-fields-bang-xep-hang',
  ttlSeconds: 'author.draft-meta-fields-ttl-phien-giay',
};

const PHASE_GROUP: Readonly<Record<string, StaticTextKey>> = {
  intro: 'author.draft-form-view-mo-dau',
  finish: 'author.draft-form-view-ket-thuc',
  setup: 'author.draft-form-view-chuan-bi-moi-truong',
};

const PHASE_FIELD: Readonly<Record<string, StaticTextKey>> = {
  title: 'author.phase-fields-tieu-de-phan',
  markdown: 'author.phase-fields-noi-dung-markdown',
  verifyScript: 'author.phase-fields-script-cham',
  'setup.foreground': 'author.draft-form-view-setup-foreground',
  'setup.background': 'author.draft-form-view-setup-background',
  foreground: 'author.draft-form-view-setup-foreground',
  background: 'author.draft-form-view-setup-background',
};

const STEP_FIELD: Readonly<Record<string, StaticTextKey>> = {
  title: 'author.draft-meta-fields-tieu-de',
  markdown: 'author.phase-fields-noi-dung-markdown',
  verifyScript: 'author.phase-fields-script-cham',
  setupForeground: 'author.draft-form-view-setup-foreground',
  setupBackground: 'author.draft-form-view-setup-background',
  weight: 'author.step-list-fields-trong-so',
  taskId: 'author.step-list-fields-id-task',
};

/** Tên khác nhau của cùng một ô ở hai nguồn lỗi, đưa về tên của biểu mẫu. */
const STEP_ALIAS: Readonly<Record<string, string>> = {
  'setup.foreground': 'setupForeground',
  'setup.background': 'setupBackground',
};

const ASSET_FIELD: Readonly<Record<string, StaticTextKey>> = {
  host: 'author.asset-directive-fields-host',
  file: 'author.asset-directive-fields-file',
  target: 'author.asset-directive-fields-dich-trong-pod',
  chmod: 'author.asset-directive-fields-chmod',
};

const STEP_COLLECTIONS = new Set(['steps', 'step', 'tasks', 'task']);
const INDEX = /^\d+$/;

/** `steps[2].weight` và `steps.2.weight` đều thành `['steps', '2', 'weight']`. */
export function pathSegments(path: string): readonly string[] {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((segment) => segment !== '');
}

export interface LessonIssueTarget {
  /** Đường chuẩn, khớp `data-field-path` của ô. `null` khi không ứng với ô nào. */
  readonly path: string | null;
  /** Tên ô cho người đọc. */
  readonly field: string;
}

export function describeLessonPath(kind: ContentKind, raw: string): LessonIssueTarget {
  const segments = pathSegments(raw);
  const [head, second, ...rest] = segments;
  const unknown: LessonIssueTarget = {
    path: null,
    field: t('author.studio.field.unknown', { path: raw }),
  };
  if (head === undefined) return unknown;

  if (segments.length === 1 && STEP_COLLECTIONS.has(head)) {
    // Lỗi trên CẢ danh sách (ví dụ "cần ít nhất một bước"): không có một ô nào
    // để đưa focus tới, nên hiện tên khối mà không thành nút.
    return {
      path: null,
      field: t(kind === 'lab' ? 'author.draft-form-view-cac-task' : 'author.draft-form-view-cac-buoc'),
    };
  }

  if (segments.length === 1) {
    const key = TOP_FIELD[head];
    return key === undefined ? unknown : { path: head, field: t(key) };
  }

  if (STEP_COLLECTIONS.has(head) && second !== undefined && INDEX.test(second)) {
    const n = Number(second);
    const name = STEP_ALIAS[rest.join('.')] ?? rest.join('.');
    const key = STEP_FIELD[name];
    const group =
      kind === 'lab'
        ? t('author.studio.field.task', { n: n + 1 })
        : t('author.studio.field.step', { n: n + 1 });
    if (key === undefined) return { path: null, field: rest.length === 0 ? group : unknown.field };
    const collection = kind === 'lab' ? 'task' : 'steps';
    return {
      path: `${collection}[${String(n)}].${name}`,
      field: t('author.studio.field.joined', { group, field: t(key) }),
    };
  }

  if (head === 'assets' && second !== undefined && INDEX.test(second)) {
    const n = Number(second);
    const key = ASSET_FIELD[rest.join('.')];
    if (key === undefined) return unknown;
    return {
      path: `assets[${String(n)}].${rest.join('.')}`,
      field: t('author.studio.field.joined', {
        group: t('author.studio.field.asset', { n: n + 1 }),
        field: t(key),
      }),
    };
  }

  const groupKey = PHASE_GROUP[head];
  const fieldName = [second, ...rest].join('.');
  const fieldKey = PHASE_FIELD[fieldName];
  if (groupKey === undefined || fieldKey === undefined) return unknown;
  const canonical = head === 'setup' ? `setup.${fieldName.replace(/^setup\./, '')}` : `${head}.${fieldName}`;
  return {
    path: canonical,
    field: t('author.studio.field.joined', { group: t(groupKey), field: t(fieldKey) }),
  };
}

/** Lỗi thô (của client hoặc máy chủ) thành dòng của cột kiểm. */
export function toLessonIssues(
  kind: ContentKind,
  issues: readonly { readonly path: string; readonly message: string }[],
): readonly StudioIssue[] {
  return issues.map((issue) => {
    const target = describeLessonPath(kind, issue.path);
    return {
      path: target.path ?? issue.path,
      field: target.field,
      message: issue.message,
      jumpable: target.path !== null,
    };
  });
}

/** Lỗi máy chủ đưa về đường chuẩn, để ô nhập tự hiện được lỗi của mình. */
export function inlineServerIssues(
  kind: ContentKind,
  issues: readonly { readonly path: string; readonly message: string }[],
): readonly { readonly path: string; readonly message: string }[] {
  const out: { path: string; message: string }[] = [];
  for (const issue of issues) {
    const target = describeLessonPath(kind, issue.path);
    if (target.path !== null) out.push({ path: target.path, message: issue.message });
  }
  return out;
}
