/**
 * Danh sách NÚM mà bảng điều khiển ngoài YAML được phép hiện — retries và cache.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO LÀ HÀM THUẦN Ở ĐÂY CHỨ KHÔNG NẰM TRONG COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Câu "lời giải mẫu đi qua màn chơi và vẫn thắng" chỉ đo được đường người chơi
 * đi nếu ô test dựng `CicdPlayerOverrides` bằng ĐÚNG thứ bảng điều khiển dựng.
 * Bản trước để logic ấy trong JSX, nên ô test phải tự chép một bản — và bản chép
 * nạp nguyên `CacheSpec` của lời giải, thứ bảng điều khiển không bao giờ phát ra
 * được. Đo 2026-09-16: bốn trên hai mươi tám lời giải (C06 cả hai, C09 alt, C14
 * alt) KHÔNG dựng được bằng giao diện, trong khi ô đó xanh.
 *
 * Nên bảng điều khiển và ô test cùng gọi hai hàm dưới đây. Núm không có trong
 * danh sách thì người chơi không vặn được, và ô test cũng không vặn được.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TẬP STAGE LẤY TỪ `hydrateWorkflow`, KHÔNG TỰ SUY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Stage nào đang có mặt" phụ thuộc `editable`: level không cho sửa `stages` thì
 * stage lạ trong YAML bị bỏ và stage thiếu được trả lại. Viết lại luật đó ở đây
 * là một bản thứ hai sẽ trôi — nên hàm gọi chính `hydrateWorkflow` để lấy tập
 * stage, rồi mới dựng núm. Hiện một núm cho stage mà tầng ghép sẽ bỏ là một núm
 * vặn không tác dụng, thứ tệ hơn không có núm.
 */

import type { CacheSpec, EditablePart, InputId, StageId, StepId, WorkflowSpec } from './contract.ts';
import {
  cacheOverrideKey,
  hydrateWorkflow,
  type CicdCacheChoice,
  type CicdHydrateSources,
  type CicdPlayerOverrides,
} from './hydrate.ts';

export interface CicdRetryControl {
  readonly stageId: StageId;
  readonly stageName: string;
  /** Giá trị khi người chơi chưa đụng tới: của bản chuẩn, hoặc 0 cho stage tự thêm. */
  readonly defaultRetries: number;
}

export interface CicdCacheControl {
  /** Khoá trong `CicdPlayerOverrides.cache`. */
  readonly key: string;
  readonly stageId: StageId;
  readonly stageName: string;
  readonly stepId: StepId;
  readonly stepName: string;
  /** Sự thật của bước — hiện `savesTicks` cho người chơi đọc, KHÔNG cho sửa. */
  readonly template: CacheSpec;
  readonly defaultOn: boolean;
  readonly defaultKeyParts: readonly InputId[];
}

/** Núm retries: một núm mỗi stage có mặt. Rỗng khi level không cho sửa `retries`. */
export function retryControls(
  current: WorkflowSpec,
  sources: CicdHydrateSources,
  editable: readonly EditablePart[],
): readonly CicdRetryControl[] {
  if (!editable.includes('retries')) {
    return [];
  }
  const chuan = new Map(sources.baseline.stages.map((stage) => [stage.id, stage]));
  return hydrateWorkflow(current, sources, editable).stages.map((stage) => ({
    stageId: stage.id,
    stageName: stage.name,
    defaultRetries: chuan.get(stage.id)?.retries ?? 0,
  }));
}

/**
 * Núm cache: một núm mỗi bước có mặt MÀ catalogue có khuôn cache.
 *
 * Bước không có khuôn thì không có núm — level chưa nói cache ở đó tiết kiệm
 * được bao nhiêu, và người chơi không được bịa con số ấy.
 */
export function cacheControls(
  current: WorkflowSpec,
  sources: CicdHydrateSources,
  editable: readonly EditablePart[],
): readonly CicdCacheControl[] {
  if (!editable.includes('cache')) {
    return [];
  }
  const khuon = new Map<string, CacheSpec>();
  for (const stage of sources.catalogue.stages) {
    for (const step of stage.steps) {
      if (step.cache !== undefined) {
        khuon.set(cacheOverrideKey(stage.id, step.id), step.cache);
      }
    }
  }
  const chuan = new Map<string, CacheSpec | undefined>();
  for (const stage of sources.baseline.stages) {
    for (const step of stage.steps) {
      chuan.set(cacheOverrideKey(stage.id, step.id), step.cache);
    }
  }

  return hydrateWorkflow(current, sources, editable).stages.flatMap((stage) =>
    stage.steps.flatMap((step): CicdCacheControl[] => {
      const key = cacheOverrideKey(stage.id, step.id);
      const template = khuon.get(key);
      if (template === undefined) {
        return [];
      }
      const macDinh = chuan.get(key);
      return [
        {
          key,
          stageId: stage.id,
          stageName: stage.name,
          stepId: step.id,
          stepName: step.name,
          template,
          defaultOn: macDinh !== undefined,
          defaultKeyParts: macDinh?.keyParts ?? template.keyParts,
        },
      ];
    }),
  );
}

/**
 * `CicdPlayerOverrides` mà một người chơi đặt BẰNG CÁC NÚM Ở TRÊN để đi tới
 * `target`.
 *
 * Chỉ vặn núm có trong danh sách — núm vắng mặt thì giá trị của `target` ở đó
 * bị bỏ, đúng như người chơi không có cách nào đặt nó. Nên chấm kết quả của hàm
 * này và so với chấm `target` trực tiếp là phép đo "lời giải có đi tới được
 * bằng giao diện không", chứ không phải phép đo "engine chấm lời giải ra sao".
 *
 * `current` là workflow đọc từ YAML người chơi đã gõ (thường là chính `target`
 * đi qua vòng ghi-đọc), vì danh sách núm phụ thuộc tập stage đang có mặt.
 */
export function overridesToReach(
  target: WorkflowSpec,
  current: WorkflowSpec,
  sources: CicdHydrateSources,
  editable: readonly EditablePart[],
): CicdPlayerOverrides {
  const buoc = new Map<string, CacheSpec | undefined>();
  const retriesDich = new Map<string, number>();
  for (const stage of target.stages) {
    retriesDich.set(stage.id, stage.retries);
    for (const step of stage.steps) {
      buoc.set(cacheOverrideKey(stage.id, step.id), step.cache);
    }
  }

  const retries: Record<string, number> = {};
  for (const control of retryControls(current, sources, editable)) {
    const dich = retriesDich.get(control.stageId);
    if (dich !== undefined) {
      retries[control.stageId] = dich;
    }
  }

  const cache: Record<string, CicdCacheChoice | null> = {};
  for (const control of cacheControls(current, sources, editable)) {
    const dich = buoc.get(control.key);
    cache[control.key] = dich === undefined ? null : { keyParts: dich.keyParts };
  }
  return { retries, cache };
}
