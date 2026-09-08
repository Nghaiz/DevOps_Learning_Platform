import type { FieldIssue } from './cluster-form';
import { clusterToSpec } from './cluster-to-spec';
import type { ProblemFormState } from './problem-form';
import { toProblemDraft } from './problem-draft';
import { PREDICATE_SPECS, isPredicateName } from './predicate-spec';
import { SLUG_PATTERN, STATEMENT_WORD_LIMIT, countWords, toSlug } from './text-tools';

/**
 * Cổng XUẤT BẢN — chặn trước khi gọi `problems.publish`, và nói rõ hỏng ở đâu.
 *
 * ## Vì sao chặn ở client khi máy chủ đã gác
 *
 * Không phải để thay máy chủ. `problems.publish` gác cùng bộ điều kiện và đó là
 * lớp cuối — một lời gọi API viết tay không đi qua file này. Cái file này thêm
 * vào là ĐỊA CHỈ: máy chủ trả `ZodError` phẳng theo tên field, còn người soạn
 * cần biết "mục tiêu thứ 3 thiếu tham số `namespace`". Một câu "không hợp lệ" là
 * thứ brief nói thẳng là không chấp nhận.
 *
 * ## Thứ tự lỗi là thứ tự người soạn đọc
 *
 * Trả về theo thứ tự các mục trong biểu mẫu (mô tả → phân loại → cụm → mục tiêu
 * → gợi ý), không theo mức nghiêm trọng: người soạn sửa từ trên xuống, và một
 * danh sách sắp theo mức độ bắt họ nhảy lên nhảy xuống.
 */
export function publishIssues(form: ProblemFormState): readonly FieldIssue[] {
  const issues: FieldIssue[] = [];

  if (form.title.trim() === '') {
    issues.push({ path: 'title', message: 'Bài phải có tên.' });
  }

  const slug = form.slug.trim() === '' ? toSlug(form.title) : toSlug(form.slug);
  if (!SLUG_PATTERN.test(slug)) {
    issues.push({
      path: 'slug',
      message: 'Slug phải là chữ thường, số và gạch nối — ví dụ "pod-khong-khoi-dong".',
    });
  }

  const words = countWords(form.statement);
  if (words === 0) {
    issues.push({ path: 'statement', message: 'Đề bài không được để trống.' });
  } else if (words > STATEMENT_WORD_LIMIT) {
    issues.push({
      path: 'statement',
      message: `Đề bài dài ${String(words)} từ, vượt trần ${String(STATEMENT_WORD_LIMIT)} từ. Cắt ${String(words - STATEMENT_WORD_LIMIT)} từ.`,
    });
  }

  if (form.topics.length === 0) {
    issues.push({ path: 'topics', message: 'Chọn ít nhất một chủ đề.' });
  } else if (form.topics.length > 3) {
    issues.push({ path: 'topics', message: 'Tối đa ba chủ đề — nhiều hơn nghĩa là bài đang làm quá nhiều việc.' });
  }

  if (form.restrictResources && form.allowedResources.length === 0) {
    issues.push({
      path: 'allowedResources',
      message: 'Đã bật giới hạn loại tài nguyên nhưng chưa chọn loại nào — người làm sẽ không tạo được gì.',
    });
  }

  const cluster = clusterToSpec(form.cluster);
  if (!cluster.ok) {
    issues.push(...cluster.issues);
  } else if (cluster.value.nodes.length === 0) {
    issues.push({ path: 'nodes', message: 'Cụm phải có ít nhất một node.' });
  }

  issues.push(...objectiveIssues(form));
  issues.push(...hintIssues(form));

  // Lỗi cấu trúc (JSON hỏng, ô số không phải số) không nằm trong các phép kiểm
  // ở trên. Gộp vào đây thay vì để `publish` ném ra một 400 — nhưng chỉ những
  // lỗi CHƯA được báo, vì `clusterToSpec` đã chạy một lượt phía trên.
  const draft = toProblemDraft(form);
  if (!draft.ok) {
    for (const issue of draft.issues) {
      if (!issues.some((existing) => existing.path === issue.path)) {
        issues.push(issue);
      }
    }
  }

  return issues;
}

function objectiveIssues(form: ProblemFormState): readonly FieldIssue[] {
  const issues: FieldIssue[] = [];

  if (form.objectives.length === 0) {
    issues.push({ path: 'objectives', message: 'Bài phải có ít nhất một mục tiêu.' });
    return issues;
  }
  if (!form.objectives.some((objective) => objective.required)) {
    issues.push({
      path: 'objectives',
      message: 'Cần ít nhất một mục tiêu BẮT BUỘC — bài chỉ toàn mục tiêu thưởng thì qua ngay khi vừa mở.',
    });
  }

  const seen = new Set<string>();
  form.objectives.forEach((objective, index) => {
    const path = `objectives.${String(index)}`;
    const id = objective.id.trim();
    if (id !== '' && seen.has(id)) {
      issues.push({ path: `${path}.id`, message: `Trùng định danh mục tiêu "${id}".` });
    }
    seen.add(id);

    if (objective.label.trim() === '') {
      issues.push({ path: `${path}.label`, message: 'Mục tiêu phải có nhãn tiếng Việt.' });
    }

    if (objective.check === '') {
      issues.push({ path: `${path}.check`, message: 'Chưa chọn vị từ kiểm tra.' });
      return;
    }
    if (!isPredicateName(objective.check)) {
      // Chỉ tới được đây với bài NHẬP từ JSON hoặc bài cũ trong DB: ô chọn không
      // cho gõ tay. Vẫn phải kiểm, vì một vị từ ngoài bảng làm bài KHÔNG BAO GIỜ
      // qua được, và lỗi đó chỉ lộ ra khi đã có người ngồi làm.
      issues.push({
        path: `${path}.check`,
        message: `Vị từ "${String(objective.check)}" không có trong bảng tra — bài này sẽ không bao giờ qua được.`,
      });
      return;
    }

    const spec = PREDICATE_SPECS[objective.check];
    for (const argSpec of spec.args) {
      if (argSpec.required && (objective.args[argSpec.key] ?? '').trim() === '') {
        issues.push({ path: `${path}.args.${argSpec.key}`, message: `Thiếu tham số bắt buộc "${argSpec.label}".` });
      }
    }
    if (spec.requireOneOf !== undefined) {
      const filled = spec.requireOneOf.some((key) => (objective.args[key] ?? '').trim() !== '');
      if (!filled) {
        const labels = spec.requireOneOf
          .map((key) => spec.args.find((arg) => arg.key === key)?.label ?? key)
          .join(' hoặc ');
        issues.push({
          path: `${path}.args.${spec.requireOneOf[0] ?? ''}`,
          message: `Phải điền ${labels} — thiếu cả hai thì vị từ luôn trả sai.`,
        });
      }
    }
  });

  return issues;
}

function hintIssues(form: ProblemFormState): readonly FieldIssue[] {
  const issues: FieldIssue[] = [];
  const seen = new Set<string>();

  form.hints.forEach((hint, index) => {
    const path = `hints.${String(index)}`;
    const id = hint.id.trim();
    if (id === '') {
      issues.push({ path: `${path}.id`, message: 'Gợi ý phải có định danh.' });
    } else if (seen.has(id)) {
      issues.push({ path: `${path}.id`, message: `Trùng định danh gợi ý "${id}".` });
    }
    seen.add(id);

    if (hint.text.trim() === '') {
      issues.push({ path: `${path}.text`, message: 'Gợi ý phải có nội dung.' });
    }
    const penalty = Number(hint.penaltyPoints.trim());
    if (!Number.isFinite(penalty) || penalty < 0) {
      issues.push({ path: `${path}.penaltyPoints`, message: 'Điểm bị trừ phải là số không âm.' });
    }
  });

  return issues;
}
