import type { ContentKind } from '@devops-platform/shared-types/authoring';
import { labTaskIdSchema } from '@devops-platform/shared-types/lab';
import type {
  SandboxTierName,
  SandboxTool,
  ScenarioCapability,
  ScenarioDifficulty,
} from '@devops-platform/shared-types/scenario';

/**
 * Mô hình FORM của `contentDraftInput` (router `authoring`).
 *
 * ## Vì sao form giữ chuỗi, không giữ số
 *
 * Ô nhập trả `''` khi trống và cũng trả `''` khi người dùng gõ dở. Ép sang số
 * ngay lúc gõ nghĩa là `Number('')` ra `0` và `Number('abc')` ra `NaN` — và
 * `NaN` **serialise thành `null` trong JSON**, nên một ô gõ sai sẽ tới server
 * dưới dạng "không khai", im lặng. Nên form giữ chuỗi thô, và một chỗ DUY NHẤT
 * (`toDraftInput`) đổi sang số kèm lỗi tường minh khi không đổi được.
 *
 * ## Vì sao mapper biết `kind`
 *
 * `contentDraftInput` là MỘT schema cho cả ba loại, nhưng ba schema xuất bản thì
 * không: `scenarioSchema` không có `passThresholdPercent`, `labSchema` không có
 * `intro`/`finish`, `playgroundSchema` không có bước nào. Gửi field của loại
 * khác không làm hỏng gì (cột vẫn ghi được), nhưng nó để lại trong DB những giá
 * trị không ai đọc và làm người đọc hàng sau tưởng chúng có nghĩa.
 */

export interface PhaseFormState {
  title: string;
  markdown: string;
  setupForeground: string;
  setupBackground: string;
  verifyScript: string;
}

export interface StepFormState {
  /** Khoá React ổn định khi chèn/xoá giữa danh sách. KHÔNG gửi lên server. */
  readonly key: string;
  taskId: string;
  title: string;
  markdown: string;
  setupForeground: string;
  setupBackground: string;
  verifyScript: string;
  weight: string;
  hint: string;
}

export interface AssetDirectiveFormState {
  readonly key: string;
  host: string;
  file: string;
  target: string;
  chmod: string;
}

export interface DraftFormState {
  title: string;
  description: string;
  difficulty: '' | ScenarioDifficulty;
  estimatedMinutes: string;
  tier: SandboxTierName;
  capabilities: readonly ScenarioCapability[];
  backendImageId: string;
  interfaceLayout: '' | 'ide';
  /**
   * Bộ công cụ bật thêm trong pod cho riêng bài này (C4).
   *
   * `SandboxTool[]` chứ không `string[]`: ô chọn dựng TỪ `SANDBOX_TOOLS`, nên
   * một giá trị ngoài danh mục không có đường vào form — và kiểu ở đây là thứ
   * giữ cho điều đó đúng khi ai đó thêm một đường nạp thứ hai.
   */
  toolset: readonly SandboxTool[];
  assets: readonly AssetDirectiveFormState[];
  hasIntro: boolean;
  intro: PhaseFormState;
  hasFinish: boolean;
  finish: PhaseFormState;
  setupForeground: string;
  setupBackground: string;
  passThresholdPercent: string;
  leaderboard: boolean;
  ttlSeconds: string;
  steps: readonly StepFormState[];
}

/** Một ô sai, cùng hình dạng `ContentIssue` của server để UI chỉ có MỘT cách vẽ lỗi. */
export interface FieldIssue {
  readonly path: string;
  readonly message: string;
}

export function emptyPhase(): PhaseFormState {
  return { title: '', markdown: '', setupForeground: '', setupBackground: '', verifyScript: '' };
}

export function emptyStep(key: string): StepFormState {
  return {
    key,
    taskId: '',
    title: '',
    markdown: '',
    setupForeground: '',
    setupBackground: '',
    verifyScript: '',
    weight: '',
    hint: '',
  };
}

/**
 * Bản nháp trống.
 *
 * `tier: 'sysbox'` và `backendImageId: 'ubuntu'` là mặc định CÓ CƠ SỞ, không
 * phải chỗ trống điền bừa: `sysbox` là tier duy nhất cụm đang chạy được (P12),
 * và `ubuntu` là imageid mà phần lớn nội dung upstream khai. Người soạn đổi
 * được cả hai; mục đích là một bản nháp mới đã chạy thử được ngay.
 */
export function emptyDraft(): DraftFormState {
  return {
    title: '',
    description: '',
    difficulty: '',
    estimatedMinutes: '',
    tier: 'sysbox',
    capabilities: [],
    backendImageId: 'ubuntu',
    interfaceLayout: '',
    // ⛔ RỖNG là mặc định, không phải "bật hết". Mỗi công cụ là một lượt cài
    // gói thật trong pod lúc setup phiên; bật sẵn cả tám cho mọi bài là bắt
    // MỌI người học trả thời gian khởi động cho thứ bài họ mở không dùng.
    // Người soạn chọn theo bài — đó là chính điểm của field này.
    toolset: [],
    assets: [],
    hasIntro: false,
    intro: emptyPhase(),
    hasFinish: false,
    finish: emptyPhase(),
    setupForeground: '',
    setupBackground: '',
    passThresholdPercent: '60',
    leaderboard: false,
    ttlSeconds: '1800',
    steps: [],
  };
}

const DIGITS_ONLY = /^[0-9]+$/;

/** `''` cho `null`; số nguyên hợp lệ trong khoảng cho số; còn lại cho lỗi kèm tên ô. */
function optionalInt(
  raw: string,
  path: string,
  bounds: { min: number; max: number },
): { ok: true; value: number | null } | { ok: false; issue: FieldIssue } {
  const text = raw.trim();
  if (text === '') {
    return { ok: true, value: null };
  }
  // Khớp chuỗi chữ số chứ không `Number.isInteger(Number(x))`: `Number(' 12 ')`
  // ra 12, `Number('1e3')` ra 1000, và `Number('')` ra 0 — cả ba đều nhận vào
  // những chuỗi mà người gõ không hề định nghĩa như vậy.
  if (!DIGITS_ONLY.test(text)) {
    return { ok: false, issue: { path, message: 'Chỉ nhận số nguyên dương' } };
  }
  const value = Number(text);
  if (value < bounds.min || value > bounds.max) {
    return {
      ok: false,
      issue: { path, message: `Phải nằm trong khoảng ${String(bounds.min)}–${String(bounds.max)}` },
    };
  }
  return { ok: true, value };
}

function nullIfBlank(raw: string): string | null {
  return raw.trim() === '' ? null : raw;
}

function phaseInput(phase: PhaseFormState) {
  return {
    title: nullIfBlank(phase.title),
    markdown: phase.markdown,
    setup: {
      foreground: nullIfBlank(phase.setupForeground),
      background: nullIfBlank(phase.setupBackground),
    },
    verifyScript: nullIfBlank(phase.verifyScript),
  };
}

/** Kết quả `toDraftInput` — hoặc payload gửi được, hoặc danh sách ô phải sửa. */
export type DraftInputResult =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly issues: readonly FieldIssue[] };

/**
 * Form thành payload `contentDraftInput`.
 *
 * Chỉ kiểm những thứ CHẮC CHẮN sai ở client (số không parse được, ô bắt buộc
 * trống, id task sai khuôn). Mọi luật còn lại để nguyên cho Zod `.strict()` ở
 * server phán — nhân đôi luật ở đây là cách chắc chắn để hai bản lệch nhau, và
 * bản ở client sẽ là bản sai vì nó không được chạy trên đường xuất bản.
 */
export function toDraftInput(kind: ContentKind, form: DraftFormState): DraftInputResult {
  const issues: FieldIssue[] = [];

  if (form.title.trim() === '') {
    issues.push({ path: 'title', message: 'Tiêu đề không được để trống' });
  }
  if (form.backendImageId.trim() === '') {
    issues.push({ path: 'backendImageId', message: 'Image id không được để trống' });
  }

  // Tách giá trị ra biến ngay tại chỗ kiểm thay vì đọc `x.value` ở cuối hàm:
  // TypeScript không thu hẹp được kiểu hợp qua một `issues.length > 0` ở giữa,
  // và cách duy nhất còn lại là `as` — thứ sẽ vẫn biên dịch sau khi ai đó gỡ
  // mất câu return sớm.
  const minutes = optionalInt(form.estimatedMinutes, 'estimatedMinutes', { min: 1, max: 100_000 });
  let minutesValue: number | null = null;
  if (minutes.ok) minutesValue = minutes.value;
  else issues.push(minutes.issue);

  const threshold = optionalInt(form.passThresholdPercent, 'passThresholdPercent', { min: 1, max: 100 });
  let thresholdValue: number | null = null;
  if (threshold.ok) thresholdValue = threshold.value;
  else issues.push(threshold.issue);

  const ttl = optionalInt(form.ttlSeconds, 'ttlSeconds', { min: 300, max: 7200 });
  let ttlValue: number | null = null;
  if (ttl.ok) ttlValue = ttl.value;
  else issues.push(ttl.issue);

  const steps = form.steps.map((step, index) => {
    const at = kind === 'lab' ? `task[${String(index)}]` : `steps[${String(index)}]`;
    const weight = optionalInt(step.weight, `${at}.weight`, { min: 1, max: 1000 });
    if (!weight.ok) issues.push(weight.issue);

    let taskId: string | null = null;
    if (kind === 'lab') {
      const parsed = labTaskIdSchema.safeParse(step.taskId.trim());
      if (parsed.success) {
        taskId = parsed.data;
      } else {
        issues.push({
          path: `${at}.taskId`,
          message: parsed.error.issues[0]?.message ?? 'id task không hợp lệ',
        });
      }
    }

    return {
      taskId,
      title: nullIfBlank(step.title),
      markdown: step.markdown,
      setupForeground: kind === 'lesson' ? nullIfBlank(step.setupForeground) : null,
      setupBackground: kind === 'lesson' ? nullIfBlank(step.setupBackground) : null,
      verifyScript: nullIfBlank(step.verifyScript),
      weight: weight.ok ? weight.value : null,
      hint: kind === 'lab' ? nullIfBlank(step.hint) : null,
    };
  });

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      title: form.title,
      description: nullIfBlank(form.description),
      difficulty: kind === 'playground' || form.difficulty === '' ? null : form.difficulty,
      estimatedMinutes: kind === 'playground' ? null : minutesValue,
      tier: form.tier,
      capabilities: [...form.capabilities],
      backendImageId: form.backendImageId,
      interfaceLayout: form.interfaceLayout === '' ? null : form.interfaceLayout,
      // Sao chép thành mảng ghi được: payload đi qua tRPC, và trả về CHÍNH mảng
      // trong state là để một chỗ khác sửa được state của form từ xa.
      toolset: [...form.toolset],
      assets:
        kind === 'playground'
          ? []
          : form.assets.map((asset) => ({
              host: asset.host,
              file: asset.file,
              target: asset.target,
              chmod: nullIfBlank(asset.chmod),
            })),
      intro: kind === 'lesson' && form.hasIntro ? phaseInput(form.intro) : null,
      finish: kind === 'lesson' && form.hasFinish ? phaseInput(form.finish) : null,
      setup:
        kind === 'lab'
          ? {
              foreground: nullIfBlank(form.setupForeground),
              background: nullIfBlank(form.setupBackground),
            }
          : null,
      passThresholdPercent: kind === 'lab' ? thresholdValue : null,
      leaderboard: kind === 'lab' ? form.leaderboard : null,
      ttlSeconds: kind === 'playground' ? ttlValue : null,
      steps: kind === 'playground' ? [] : steps,
    },
  };
}
