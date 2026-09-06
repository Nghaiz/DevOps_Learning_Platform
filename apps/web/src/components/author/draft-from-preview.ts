import type { Lab } from '@devops-platform/shared-types/lab';
import type { Playground } from '@devops-platform/shared-types/playground';
import type { Scenario, ScenarioPhase } from '@devops-platform/shared-types/scenario';
import {
  emptyDraft,
  emptyPhase,
  type AssetDirectiveFormState,
  type DraftFormState,
  type PhaseFormState,
  type StepFormState,
} from './draft-form';

/**
 * DTO đã xuất bản/đã parse thành trạng thái FORM — đường NẠP của trang sửa bài.
 *
 * ## Vì sao nạp từ `authoring.preview` chứ không từ một `authoring.get`
 *
 * Vì `authoring.get` **không tồn tại**. Router soạn bài hôm nay có `list`
 * (tóm tắt: id/kind/state/title/stepCount/publishError/updatedAt/publishedAt) và
 * `preview` (DTO đầy đủ, đi qua nguồn nội dung hợp nhất) — không có procedure
 * nào trả THÂN NHÁP THÔ. `loadBodyForWrite` làm đúng việc đó nhưng chỉ dùng nội
 * bộ trong `check`/`publish`.
 *
 * ⚠ **Giới hạn thật, không giấu:** `preview` đi qua `dbContentSource`, và nguồn
 * đó `safeParse` bằng chính schema xuất bản rồi trả `null` khi trượt. Nên một
 * bản nháp CHƯA hợp lệ (bài học 0 bước, lab thiếu `verifyScript`, chưa chọn độ
 * khó) **không nạp lại được vào form**. Trang sửa bài phải nói thẳng điều đó và
 * không được lặng lẽ hiện một form trống — xem `author-edit-client.tsx`. Đã báo
 * lead kèm đề xuất thêm `authoring.get`.
 *
 * ## Vòng tròn phải khép
 *
 * Nạp rồi Lưu ngay mà không sửa gì thì payload gửi lên phải bằng payload đã tạo
 * ra bản đang xem. `update` là phép THAY TOÀN BỘ (`itemColumns` + xoá sạch
 * `content_steps` rồi chèn lại), nên mọi field rơi rụng ở tầng này là dữ liệu
 * bị xoá trong im lặng — đó là lý do tệp này có test đi cả vòng.
 */

function phaseForm(phase: ScenarioPhase | null): PhaseFormState {
  if (phase === null) {
    return emptyPhase();
  }
  return {
    title: phase.title ?? '',
    markdown: phase.markdown,
    setupForeground: phase.setup.foreground ?? '',
    setupBackground: phase.setup.background ?? '',
    verifyScript: phase.verifyScript ?? '',
  };
}

function assetForms(
  assets: readonly { host: string; file: string; target: string; chmod: string | null }[],
): readonly AssetDirectiveFormState[] {
  return assets.map((asset, index) => ({
    key: `loaded-asset-${String(index)}`,
    host: asset.host,
    file: asset.file,
    target: asset.target,
    chmod: asset.chmod ?? '',
  }));
}

export function draftFromScenario(scenario: Scenario): DraftFormState {
  const base = emptyDraft();
  const steps: StepFormState[] = scenario.steps.map((step, index) => ({
    key: `loaded-step-${String(index)}`,
    taskId: '',
    title: step.title ?? '',
    markdown: step.markdown,
    setupForeground: step.setup.foreground ?? '',
    setupBackground: step.setup.background ?? '',
    verifyScript: step.verifyScript ?? '',
    weight: '',
    hint: '',
  }));

  return {
    ...base,
    title: scenario.title,
    description: scenario.description ?? '',
    difficulty: scenario.difficulty,
    estimatedMinutes: scenario.estimatedMinutes === null ? '' : String(scenario.estimatedMinutes),
    tier: scenario.tier,
    capabilities: scenario.capabilities,
    backendImageId: scenario.backendImageId,
    interfaceLayout: scenario.interfaceLayout === 'ide' ? 'ide' : '',
    assets: assetForms(scenario.assets),
    // `hasIntro`/`hasFinish` suy TỪ dữ liệu, không phải một cờ lưu riêng: một
    // phase vắng mặt là `null` trong DTO, và đó đã là câu trả lời đầy đủ.
    hasIntro: scenario.intro !== null,
    intro: phaseForm(scenario.intro),
    hasFinish: scenario.finish !== null,
    finish: phaseForm(scenario.finish),
    steps,
  };
}

export function draftFromLab(lab: Lab): DraftFormState {
  const base = emptyDraft();
  const steps: StepFormState[] = lab.tasks.map((task, index) => ({
    key: `loaded-step-${String(index)}`,
    taskId: task.id,
    title: task.title,
    markdown: task.markdown,
    setupForeground: '',
    setupBackground: '',
    verifyScript: task.verifyScript,
    weight: String(task.weight),
    hint: task.hint ?? '',
  }));

  return {
    ...base,
    title: lab.title,
    description: lab.description ?? '',
    difficulty: lab.difficulty,
    estimatedMinutes: lab.estimatedMinutes === null ? '' : String(lab.estimatedMinutes),
    tier: lab.tier,
    capabilities: lab.capabilities,
    backendImageId: lab.backendImageId,
    interfaceLayout: lab.interfaceLayout === 'ide' ? 'ide' : '',
    assets: assetForms(lab.assets),
    setupForeground: lab.setup.foreground ?? '',
    setupBackground: lab.setup.background ?? '',
    passThresholdPercent: String(lab.passThresholdPercent),
    leaderboard: lab.leaderboard,
    steps,
  };
}

export function draftFromPlayground(playground: Playground): DraftFormState {
  const base = emptyDraft();
  return {
    ...base,
    title: playground.title,
    description: playground.description ?? '',
    tier: playground.tier,
    capabilities: playground.capabilities,
    backendImageId: playground.backendImageId,
    interfaceLayout: playground.interfaceLayout === 'ide' ? 'ide' : '',
    ttlSeconds: String(playground.ttlSeconds),
  };
}

/** Kết quả `authoring.preview`, ở dạng cấu trúc (xem ghi chú SSOT ở `content-state.ts`). */
export type PreviewPayload =
  | { readonly kind: 'lesson'; readonly lesson: Scenario | null }
  | { readonly kind: 'lab'; readonly lab: Lab | null }
  | { readonly kind: 'playground'; readonly playground: Playground | null };

/**
 * `null` = nguồn nội dung TỪ CHỐI bản nháp này (chưa qua schema xuất bản).
 *
 * Trả `null` chứ không trả `emptyDraft()`: một form trống trông y hệt một bài
 * mới, và người soạn sẽ bấm Lưu — `update` thay toàn bộ, nên bản nháp đang có
 * bị xoá trắng. Chế độ hỏng đó im lặng và không hoàn tác được.
 */
export function draftFromPreview(payload: PreviewPayload): DraftFormState | null {
  switch (payload.kind) {
    case 'lesson':
      return payload.lesson === null ? null : draftFromScenario(payload.lesson);
    case 'lab':
      return payload.lab === null ? null : draftFromLab(payload.lab);
    case 'playground':
      return payload.playground === null ? null : draftFromPlayground(payload.playground);
  }
}
