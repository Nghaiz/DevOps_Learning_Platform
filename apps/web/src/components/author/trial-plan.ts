import { t, type CopyRef } from '@devops-platform/copy';
import type { PreviewPayload } from './draft-from-preview';

/**
 * Kịch bản CHẠY THỬ của một lượt xuất bản, và kết quả từng bước (task 22).
 *
 * ## Vấn đề: server không kể lại lượt chạy thử
 *
 * `runPublishTrial` chạy `trialPlan(kind, body)` tuần tự trong sandbox, nhưng nó
 * chỉ lưu **một chuỗi** — `publish_error` — và chỉ khi TRƯỢT. Không có bảng kết
 * quả từng bước, không có procedure `authoring.status`, không có tiến độ trực
 * tiếp. Thứ duy nhất còn lại là:
 *
 * - trạng thái cuối (`published` / `draft`), và
 * - nhãn của bước đầu tiên trượt, nằm trong `publish_error`.
 *
 * Nên "hiện setup + verify từng bước" được dựng bằng cách **suy lại kịch bản**
 * từ chính nội dung bài, rồi ghép với dấu vết đó. Suy luận là hợp lệ vì lượt
 * chạy thử là TUẦN TỰ và DỪNG ở lỗi đầu tiên: mọi bước trước bước trượt đã chạy
 * xong, mọi bước sau nó chưa bao giờ chạy.
 *
 * ## ⚠ Đây là bản SAO của `publish.ts trialPlan` — và nó biết điều đó
 *
 * Hai bản sẽ trôi nếu ai đó đổi luật bên server. Cách chống đỡ KHÔNG phải là hy
 * vọng: khi `publishError` mang một nhãn **không có trong kịch bản suy ra**,
 * `mergeTrialOutcome` trả `null` và giao diện hiện nguyên văn lỗi thay vì vẽ một
 * bảng sai. Trôi thì xuống cấp thành "kém chi tiết", không thành "nói dối".
 *
 * SSOT thật vẫn là `apps/web/src/server/content/publish.ts`. Đã báo lead đề xuất
 * cho `authoring.check` trả kèm kịch bản để bỏ hẳn bản sao này.
 */

export interface TrialStepPlan {
  /** Nhãn PHẢI khớp từng ký tự với `TrialStep.label` của server. */
  readonly label: string;
  /** `true` = phải trả exit 0 thì lượt xuất bản mới đạt. */
  readonly mustPass: boolean;
  /**
   * Câu tiếng Việt cho người soạn; server chỉ có nhãn máy.
   *
   * `CopyRef` chứ không chuỗi đã dựng (§1.6): bốn nhánh mô tả bên dưới là bốn
   * mục tĩnh trong `surfaces/author.ts`, nên bộ dò soi được cả bốn chứ không
   * chỉ nhánh mà một test đi vào.
   *
   * `label` ngay trên KHÔNG đổi, và đó là cố ý: nó là định danh script của
   * server, phải khớp từng ký tự với `TrialStep.label`. Một khoá bản đồ ở đó
   * sẽ làm `mergeTrialOutcome` không ghép được kết quả nào.
   */
  readonly description: CopyRef;
}

function phaseSteps(
  label: string,
  phase: { setup: { foreground: string | null; background: string | null } } | null,
  human: string,
): TrialStepPlan[] {
  if (phase === null) {
    return [];
  }
  const out: TrialStepPlan[] = [];
  // Thứ tự background TRƯỚC foreground — giống `phaseScripts` của server. Đổi
  // thứ tự ở đây làm bảng kết quả gán nhầm "đã chạy"/"chưa chạy" quanh chỗ trượt.
  if (phase.setup.background !== null && phase.setup.background !== '') {
    out.push({
      label: `${label}.setup.background`,
      mustPass: false,
      description: {
        key: 'author.trial-plan-setup-chay-an',
        params: { human: String(human) },
      },
    });
  }
  if (phase.setup.foreground !== null && phase.setup.foreground !== '') {
    out.push({
      label: `${label}.setup.foreground`,
      mustPass: false,
      description: {
        key: 'author.trial-plan-setup-hien-trong-terminal',
        params: { human: String(human) },
      },
    });
  }
  return out;
}

export function trialPlanFor(payload: PreviewPayload): readonly TrialStepPlan[] {
  switch (payload.kind) {
    case 'lesson': {
      const lesson = payload.lesson;
      if (lesson === null) {
        return [];
      }
      const plan: TrialStepPlan[] = [
        ...phaseSteps('intro', lesson.intro, t('author.draft-form-view-mo-dau')),
      ];
      for (const step of lesson.steps) {
        const at = `steps[${String(step.index)}]`;
        const human = t('author.preview-phases-buoc', {
          stepIndex1: String(step.index + 1),
        });
        if (step.setup.background !== null && step.setup.background !== '') {
          plan.push({
            label: `${at}.setup.background`,
            mustPass: false,
            description: {
              key: 'author.trial-plan-setup-chay-an',
              params: { human: String(human) },
            },
          });
        }
        if (step.setup.foreground !== null && step.setup.foreground !== '') {
          plan.push({
            label: `${at}.setup.foreground`,
            mustPass: false,
            description: {
              key: 'author.trial-plan-setup-hien-trong-terminal',
              params: { human: String(human) },
            },
          });
        }
        if (step.verifyScript !== null && step.verifyScript !== '') {
          plan.push({
            label: `${at}.verifyScript`,
            // ⛔ Bước chấm của bài học PHẢI trả 0. Đây là toàn bộ điểm của lượt
            // chạy thử: một bài mà bước chấm không bao giờ đạt là một bài người
            // học không thể hoàn thành.
            mustPass: true,
            description: {
              key: 'author.trial-plan-script-cham-phai-dat',
              params: { human: String(human) },
            },
          });
        }
      }
      plan.push(...phaseSteps('finish', lesson.finish, t('author.draft-form-view-ket-thuc')));
      return plan;
    }
    case 'lab': {
      const lab = payload.lab;
      if (lab === null) {
        return [];
      }
      // Nhãn `setup.setup.*`: server gọi `phaseScripts('setup', { setup: body.setup })`,
      // và hàm đó tự nối `.setup.<kênh>`. Trông thừa nhưng nó là chuỗi THẬT nằm
      // trong `publish_error`, nên khớp đúng nó mới ghép được kết quả.
      const plan: TrialStepPlan[] = phaseSteps(
        'setup',
        { setup: lab.setup },
        t('author.draft-form-view-chuan-bi-moi-truong'),
      );
      for (const task of lab.tasks) {
        plan.push({
          label: `task[${task.id}].verifyScript`,
          // KHÁC bài học: task của lab được chấm trên môi trường CHƯA làm gì, nên
          // một verify đúng sẽ trượt ở đây. Lượt thử chỉ đòi script chạy được.
          mustPass: false,
          description: {
            key: 'author.trial-plan-task-script-cham-chi-can-chay-duoc',
            params: { taskTitle: String(task.title) },
          },
        });
      }
      return plan;
    }
    case 'playground':
      // Playground không có script nào; lượt thử của nó LÀ việc sandbox dựng lên
      // được với tier + capability đã khai.
      return [];
  }
}

export type TrialStepStatus = 'passed' | 'ran' | 'failed' | 'skipped' | 'pending';

export interface TrialStepResult {
  readonly plan: TrialStepPlan;
  readonly status: TrialStepStatus;
}

/** Lỗi xuất bản đã tách nghĩa. */
export type PublishFailure =
  | {
      readonly kind: 'step';
      readonly label: string;
      readonly exitCode: string;
      readonly output: string;
    }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'other'; readonly message: string };

// Nhóm bắt theo SỐ chứ không theo tên: `target` của tsconfig thấp hơn ES2018 và
// nhóm có tên là một lỗi biên dịch ở đó (TS1503).
const STEP_FAILURE = /^(.+?) trượt \(exit ([^)]*)\):\n?([\s\S]*)$/;

/**
 * `publish_error` thô thành một hình dạng đọc được.
 *
 * Khuôn tới từ `runTrial`: `` `${step.label} trượt (exit ${exitCode}):\n${tail}` ``.
 * Hai khuôn còn lại là `Nội dung không hợp lệ: …` (validate lại trước khi dựng
 * sandbox) và một `Error.message` bất kỳ (không dựng được sandbox, tier lạ…).
 */
export function parsePublishFailure(error: string): PublishFailure {
  const match = STEP_FAILURE.exec(error);
  if (match !== null) {
    return {
      kind: 'step',
      label: match[1] ?? '',
      exitCode: match[2] ?? '?',
      output: match[3] ?? '',
    };
  }
  if (error.startsWith(t('author.trial-plan-noi-dung-khong-hop-le'))) {
    return { kind: 'invalid', message: error };
  }
  return { kind: 'other', message: error };
}

/**
 * Ghép kịch bản với kết quả thật.
 *
 * @param failure `null` = lượt xuất bản ĐẠT (mọi bước đã chạy xong).
 * @returns `null` khi không ghép được — caller phải hiện lỗi thô thay vì đoán.
 */
export function mergeTrialOutcome(
  plan: readonly TrialStepPlan[],
  failure: PublishFailure | null,
): readonly TrialStepResult[] | null {
  if (failure === null) {
    return plan.map((step) => ({ plan: step, status: step.mustPass ? 'passed' : 'ran' }));
  }
  if (failure.kind !== 'step') {
    // Trượt trước khi chạy bước nào (validate lại, hoặc không dựng được sandbox).
    return plan.map((step) => ({ plan: step, status: 'skipped' }));
  }

  const index = plan.findIndex((step) => step.label === failure.label);
  if (index < 0) {
    // Nhãn không có trong kịch bản suy ra ⇒ bản sao đã trôi khỏi server, HOẶC
    // nội dung đã đổi sau lượt xuất bản. Không vẽ bảng nào cả.
    return null;
  }

  return plan.map((step, i) => ({
    plan: step,
    // Chạy TUẦN TỰ và DỪNG ở lỗi đầu tiên, nên vị trí nói đủ: trước là đã chạy,
    // đúng chỗ là trượt, sau là chưa bao giờ chạy.
    status: i < index ? (step.mustPass ? 'passed' : 'ran') : i === index ? 'failed' : 'skipped',
  }));
}

/**
 * Nhãn trạng thái: KHOÁ chứ không chữ.
 *
 * Đổi tên khỏi `TRIAL_STATUS_LABELS` vì giá trị không còn là nhãn. Một cái tên
 * nói "labels" trong khi chở khoá là một cái bẫy đọc, và ở đây nó là bẫy có
 * thật: cả hai đều là chuỗi, nên in nhầm khoá ra màn hình không làm tsc đỏ.
 *
 * Bảng nằm ở file này vì `TrialStepStatus` là union của chính nó; nơi vẽ chỉ
 * việc dựng bằng `renderCopy`.
 */
export const TRIAL_STATUS_KEYS: Readonly<Record<TrialStepStatus, CopyRef>> = {
  passed: { key: 'author.trial-plan-dat' },
  ran: { key: 'author.trial-plan-da-chay' },
  failed: { key: 'author.trial-plan-truot' },
  skipped: { key: 'author.trial-plan-chua-chay' },
  pending: { key: 'author.trial-plan-dang-cho' },
};
