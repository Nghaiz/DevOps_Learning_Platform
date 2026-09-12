import { errText, t } from '@devops-platform/copy';
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
    issues.push({ path: 'title', message: errText('problem.problem-validate-bai-phai-co-ten') });
  }

  const slug = form.slug.trim() === '' ? toSlug(form.title) : toSlug(form.slug);
  if (!SLUG_PATTERN.test(slug)) {
    issues.push({
      path: 'slug',
      message: errText(
        'problem.problem-validate-slug-phai-la-chu-thuong-so-va-gach-noi-vi-du-pod-khong-khoi-dong',
      ),
    });
  }

  const words = countWords(form.statement);
  if (words === 0) {
    issues.push({
      path: 'statement',
      message: errText('problem.problem-validate-de-bai-khong-duoc-de-trong'),
    });
  } else if (words > STATEMENT_WORD_LIMIT) {
    issues.push({
      path: 'statement',
      message: errText('problem.problem-validate-de-bai-dai-tu-vuot-tran-tu-cat-tu', {
        words: String(words),
        statementWordLimit: String(STATEMENT_WORD_LIMIT),
        wordsStatementWordLimit: String(words - STATEMENT_WORD_LIMIT),
      }),
    });
  }

  if (form.topics.length === 0) {
    issues.push({
      path: 'topics',
      message: errText('problem.problem-validate-chon-it-nhat-mot-chu-de'),
    });
  } else if (form.topics.length > 3) {
    issues.push({
      path: 'topics',
      message: errText(
        'problem.problem-validate-toi-da-ba-chu-de-nhieu-hon-nghia-la-bai-dang-lam-qua-nhieu-viec',
      ),
    });
  }

  if (form.restrictResources && form.allowedResources.length === 0) {
    issues.push({
      path: 'allowedResources',
      message: errText(
        'problem.problem-validate-da-bat-gioi-han-loai-tai-nguyen-nhung-chua-chon-loai-nao-nen-nguoi-lam-se-k',
      ),
    });
  }

  const cluster = clusterToSpec(form.cluster);
  if (!cluster.ok) {
    issues.push(...cluster.issues);
  } else if (cluster.value.nodes.length === 0) {
    issues.push({
      path: 'nodes',
      message: errText('problem.problem-validate-cum-phai-co-it-nhat-mot-node'),
    });
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
    issues.push({
      path: 'objectives',
      message: errText('problem.problem-validate-bai-phai-co-it-nhat-mot-muc-tieu'),
    });
    return issues;
  }
  if (!form.objectives.some((objective) => objective.required)) {
    issues.push({
      path: 'objectives',
      message: errText(
        'problem.problem-validate-can-it-nhat-mot-muc-tieu-bat-buoc-bai-chi-toan-muc-tieu-thuong-thi-qua-ngay',
      ),
    });
  }

  const seen = new Set<string>();
  form.objectives.forEach((objective, index) => {
    const path = `objectives.${String(index)}`;
    const id = objective.id.trim();
    if (id !== '' && seen.has(id)) {
      issues.push({
        path: `${path}.id`,
        message: errText('problem.problem-validate-trung-dinh-danh-muc-tieu', { id: String(id) }),
      });
    }
    seen.add(id);

    if (objective.label.trim() === '') {
      issues.push({
        path: `${path}.label`,
        message: errText('problem.problem-draft-muc-tieu-phai-co-nhan-tieng-viet'),
      });
    }

    if (objective.check === '') {
      issues.push({
        path: `${path}.check`,
        message: errText('problem.problem-draft-chua-chon-vi-tu-kiem-tra'),
      });
      return;
    }
    if (!isPredicateName(objective.check)) {
      // Chỉ tới được đây với bài NHẬP từ JSON hoặc bài cũ trong DB: ô chọn không
      // cho gõ tay. Vẫn phải kiểm, vì một vị từ ngoài bảng làm bài KHÔNG BAO GIỜ
      // qua được, và lỗi đó chỉ lộ ra khi đã có người ngồi làm.
      issues.push({
        path: `${path}.check`,
        message: errText(
          'problem.problem-validate-vi-tu-khong-co-trong-bang-tra-nen-bai-nay-se-khong-bao-gio-qua-duoc',
          { objectiveCheck: String(objective.check) },
        ),
      });
      return;
    }

    const spec = PREDICATE_SPECS[objective.check];
    for (const argSpec of spec.args) {
      if (argSpec.required && (objective.args[argSpec.key] ?? '').trim() === '') {
        issues.push({
          path: `${path}.args.${argSpec.key}`,
          message: errText('problem.problem-validate-thieu-tham-so-bat-buoc', {
            argspecLabel: String(argSpec.label),
          }),
        });
      }
    }
    if (spec.requireOneOf !== undefined) {
      const filled = spec.requireOneOf.some((key) => (objective.args[key] ?? '').trim() !== '');
      if (!filled) {
        const labels = spec.requireOneOf
          .map((key) => spec.args.find((arg) => arg.key === key)?.label ?? key)
          .join(t('problem.objective-fields-hoac'));
        issues.push({
          path: `${path}.args.${spec.requireOneOf[0] ?? ''}`,
          message: errText(
            'problem.problem-validate-phai-dien-thieu-ca-hai-thi-vi-tu-luon-tra-sai',
            { labels: String(labels) },
          ),
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
      issues.push({
        path: `${path}.id`,
        message: errText('problem.problem-draft-goi-y-phai-co-dinh-danh'),
      });
    } else if (seen.has(id)) {
      issues.push({
        path: `${path}.id`,
        message: errText('problem.problem-validate-trung-dinh-danh-goi-y', { id: String(id) }),
      });
    }
    seen.add(id);

    if (hint.text.trim() === '') {
      issues.push({
        path: `${path}.text`,
        message: errText('problem.problem-draft-goi-y-phai-co-noi-dung'),
      });
    }
    const penalty = Number(hint.penaltyPoints.trim());
    if (!Number.isFinite(penalty) || penalty < 0) {
      issues.push({
        path: `${path}.penaltyPoints`,
        message: errText('problem.problem-validate-diem-bi-tru-phai-la-so-khong-am'),
      });
    }
  });

  return issues;
}
