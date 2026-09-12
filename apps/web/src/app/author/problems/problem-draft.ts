import { errText, t } from '@devops-platform/copy';
import type { Objective, ProblemHint } from '@devops-platform/games';
import type { FieldIssue } from './cluster-form';
import { clusterToSpec } from './cluster-to-spec';
import type { ObjectiveFormState, ProblemDraftInput, ProblemFormState } from './problem-form';
import { PREDICATE_SPECS, isPredicateName } from './predicate-spec';
import type { PredicateArgSpec } from './predicate-arg-types';
import { parseTags, toSlug } from './text-tools';

/**
 * Form → payload của `problems.create` / `problems.update`.
 *
 * ## Đây là phép đổi CẤU TRÚC, không phải cổng xuất bản
 *
 * Hàm này chỉ đỏ khi giá trị không serialise nổi: JSON hỏng, ô số không phải số,
 * chưa chọn vị từ. Những thứ như "chưa có mục tiêu bắt buộc" hay "đề bài quá dài"
 * KHÔNG chặn ở đây — chúng thuộc `problem-validate.ts`, và bản nháp được phép
 * chưa đủ. Trộn hai việc lại là bắt người soạn hoàn thiện bài trước khi được lưu
 * lần đầu, đúng cái mà router `authoring` đã cố ý tránh.
 */

export type DraftResult =
  | { readonly ok: true; readonly value: ProblemDraftInput }
  | { readonly ok: false; readonly issues: readonly FieldIssue[] };

function readOptionalInt(
  raw: string,
  path: string,
  label: string,
  issues: FieldIssue[],
): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
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
 * Một tham số dạng chuỗi → giá trị đúng kiểu cho `Objective.args`.
 *
 * Bộ chọn nhãn giữ NGUYÊN dạng chuỗi `app=web` chứ không đổi thành map: đó là
 * dạng `argSelector` trong `predicates.ts` đọc trước tiên, và là dạng mọi level
 * đã viết dùng. Đổi sang map ở đây thì đúng về mặt kỹ thuật nhưng làm dữ liệu
 * bài mới khác dữ liệu bài cũ với cùng một ý — và diff trong review đọc ra như
 * hai thứ khác nhau.
 */
function readArg(spec: PredicateArgSpec, raw: string, path: string, issues: FieldIssue[]): unknown {
  const value = raw.trim();
  if (value === '') {
    return undefined;
  }
  if (spec.type !== 'number') {
    return value;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    issues.push({
      path,
      message: errText('problem.problem-draft-phai-la-so', { specLabel: String(spec.label) }),
    });
    return undefined;
  }
  return parsed;
}

function toObjective(
  form: ObjectiveFormState,
  index: number,
  issues: FieldIssue[],
): Objective | null {
  const path = `objectives.${String(index)}`;
  if (form.check === '' || !isPredicateName(form.check)) {
    issues.push({
      path: `${path}.check`,
      message: errText('problem.problem-draft-chua-chon-vi-tu-kiem-tra'),
    });
    return null;
  }

  const spec = PREDICATE_SPECS[form.check];
  const args: Record<string, unknown> = {};
  for (const argSpec of spec.args) {
    const value = readArg(
      argSpec,
      form.args[argSpec.key] ?? '',
      `${path}.args.${argSpec.key}`,
      issues,
    );
    if (value !== undefined) {
      args[argSpec.key] = value;
    }
  }

  const id = form.id.trim();
  const label = form.label.trim();
  if (id === '' || label === '') {
    issues.push({
      path: `${path}.${id === '' ? 'id' : 'label'}`,
      message:
        id === ''
          ? errText('problem.problem-draft-muc-tieu-phai-co-dinh-danh')
          : errText('problem.problem-draft-muc-tieu-phai-co-nhan-tieng-viet'),
    });
    return null;
  }

  return {
    id,
    label,
    check: form.check,
    // Bỏ hẳn `args` khi rỗng thay vì gửi `{}`: hợp đồng khai nó tuỳ chọn, và một
    // object rỗng trong dữ liệu bài đọc ra như "đã khai, không có gì" — hai ý
    // khác nhau khi so bài trong git.
    ...(Object.keys(args).length > 0 ? { args } : {}),
    required: form.required,
  };
}

export function toProblemDraft(form: ProblemFormState): DraftResult {
  const issues: FieldIssue[] = [];

  const cluster = clusterToSpec(form.cluster);
  if (!cluster.ok) {
    issues.push(...cluster.issues);
  }

  const objectives: Objective[] = [];
  form.objectives.forEach((objective, index) => {
    const built = toObjective(objective, index, issues);
    if (built !== null) {
      objectives.push(built);
    }
  });

  const hints: ProblemHint[] = [];
  form.hints.forEach((hint, index) => {
    const path = `hints.${String(index)}`;
    const id = hint.id.trim();
    if (id === '') {
      issues.push({
        path: `${path}.id`,
        message: errText('problem.problem-draft-goi-y-phai-co-dinh-danh'),
      });
    }
    const text = hint.text.trim();
    if (text === '') {
      issues.push({
        path: `${path}.text`,
        message: errText('problem.problem-draft-goi-y-phai-co-noi-dung'),
      });
    }
    const penalty = readOptionalInt(
      hint.penaltyPoints,
      `${path}.penaltyPoints`,
      t('problem.hint-fields-diem-bi-tru'),
      issues,
    );
    if (id !== '' && text !== '') {
      hints.push({ id, text, penaltyPoints: penalty ?? 0 });
    }
  });

  const timeLimitSec = form.hasTimeLimit
    ? readOptionalInt(
        form.timeLimitSec,
        'timeLimitSec',
        t('problem.classify-fields-han-gio-giay'),
        issues,
      )
    : null;
  if (form.hasTimeLimit && timeLimitSec === null) {
    issues.push({
      path: 'timeLimitSec',
      message: errText('problem.problem-draft-da-bat-han-gio-thi-phai-khai-so-giay'),
    });
  }
  const parMoves = readOptionalInt(
    form.parMoves,
    'parMoves',
    t('problem.problem-draft-so-nuoc-di-chuan'),
    issues,
  );

  if (issues.length > 0 || !cluster.ok) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      // Slug rỗng thì sinh từ tiêu đề: máy chủ gác `SLUG_PATTERN`, nên gửi `''`
      // chỉ đổi một lỗi đọc được ở đây lấy một lỗi 400 khó hiểu ở kia.
      slug: form.slug.trim() === '' ? toSlug(form.title) : toSlug(form.slug),
      title: form.title.trim(),
      statement: form.statement,
      difficulty: form.difficulty,
      topics: form.topics,
      tags: parseTags(form.tagsText),
      timeLimitSec,
      initialState: cluster.value,
      objectives,
      allowedResources: form.restrictResources ? form.allowedResources : null,
      hints,
      parMoves,
    },
  };
}
