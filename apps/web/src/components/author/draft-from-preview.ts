import type { Lab } from '@devops-platform/shared-types/lab';
import type { Playground } from '@devops-platform/shared-types/playground';
import {
  SANDBOX_TIER_NAMES,
  SCENARIO_CAPABILITIES,
  SCENARIO_DIFFICULTIES,
  type Scenario,
  type ScenarioCapability,
  type ScenarioPhase,
} from '@devops-platform/shared-types/scenario';
import {
  emptyDraft,
  emptyPhase,
  type AssetDirectiveFormState,
  type DraftFormState,
  type PhaseFormState,
  type StepFormState,
} from './draft-form';

/**
 * Nội dung một bài thành trạng thái FORM — hai đường NẠP, cho hai câu hỏi khác nhau.
 *
 * ## `draftFromBody` nạp form soạn; `draftFromPreview` nạp bản xem trước
 *
 * `authoring.get` **đã tồn tại** (06510f6). Nó đọc bằng `loadBodyForWrite` —
 * cùng đường mà `check`/`publish` đi, KHÔNG qua schema xuất bản — nên nó trả về
 * thân của MỌI bản nháp ghi được. Đường nạp của form soạn vì thế đi qua nó, và
 * `draftFromBody` là mapper của đường đó: nó nhận `ContentBodyRow` (hàng thô),
 * không nhận DTO đã xuất bản.
 *
 * `preview` thì Ở LẠI, và `null-khi-không-hợp-lệ` là hành vi ĐÚNG của nó:
 * `preview` trả lời câu "người học sẽ thấy gì", và câu trả lời cho một bản nháp
 * chưa qua schema xuất bản là "không thấy gì". `preview-panel.tsx`,
 * `preview-phases.ts`, `publish-panel.tsx` và `trial-plan.ts` đều hỏi đúng câu
 * đó, nên `draftFromPreview` + `PreviewPayload` giữ nguyên. Chỉ đường nạp của
 * form soạn chuyển sang `get`.
 *
 * ⚠ Hai mapper KHÔNG gộp được: `preview` trả DTO lồng (`step.setup.foreground`,
 * `step.index`, `task.id`, `difficulty` không nullable), còn `get` trả hàng
 * phẳng (`setupForeground`, `ordinal`, `taskId`, và mọi field có thể `null` vì
 * đó chính là hình dạng của một bản nháp còn dở). Gộp lại nghĩa là một trong
 * hai phía phải nói dối về kiểu của mình.
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

/**
 * Hàng `content_items` như `authoring.get` trả về nó.
 *
 * Khai theo CẤU TRÚC, không `import type { ContentBodyRow } from
 * '@devops-platform/scenario'` — cùng lý do đã ghi ở `content-state.ts`, cộng
 * một lý do nặng hơn: subpath `.` của gói đó kéo theo loader đọc đĩa
 * (`node:fs`), và `packages/scenario/package.json` ghi rõ rằng import nó từ mã
 * chạy ở trình duyệt làm Turbopack lôi `node:fs/promises` vào bundle rồi ĐỔ
 * `next build` — trong khi `typecheck`/`lint`/`test` vẫn xanh. `import type`
 * hôm nay bị xoá lúc biên dịch, nhưng một dòng import giá trị thêm vào sau này
 * thì không, và tệp này chạy trong Client Component.
 *
 * Kiểu thật của `get` rộng hơn (còn `kind`/`state`/`authorId`/`stepCount`) và
 * vẫn gán được vào đây — TypeScript so cấu trúc, và mọi field dưới đây đều là
 * field mapper này thật sự đọc.
 */
export interface DraftBodyItem {
  readonly title: string;
  readonly description: string | null;
  /** `text` trong DB, KHÔNG phải enum — nên `string`, và mapper phải tự thu hẹp. */
  readonly difficulty: string | null;
  readonly estimatedMinutes: number | null;
  readonly tier: string;
  readonly capabilities: readonly string[];
  readonly backendImageId: string;
  readonly interfaceLayout: string | null;
  /** Lab. `null` trên một bản nháp còn dở — ĐÓ LÀ ĐIỂM của `get`, không phải lỗi. */
  readonly passThresholdPercent: number | null;
  /** Lab. */
  readonly leaderboard: boolean | null;
  /** Playground. */
  readonly ttlSeconds: number | null;
}

/**
 * Một hàng `content_steps` — PHẲNG, và đó là khác biệt hình dạng lớn nhất so
 * với DTO: `setupForeground`/`setupBackground` (không phải `setup.{…}`),
 * `ordinal` (không phải `index`), `taskId` (không phải `id`).
 */
export interface DraftBodyStep {
  readonly taskId: string | null;
  readonly title: string | null;
  readonly markdown: string;
  readonly setupForeground: string | null;
  readonly setupBackground: string | null;
  readonly verifyScript: string | null;
  readonly weight: number | null;
  readonly hint: string | null;
}

/**
 * `authoring.get().body` — bốn field jsonb là `unknown` THẬT, không phải kiểu bị lười.
 *
 * ⚠ Bốn field đó là **optional (`?`), không phải bắt buộc**, và đó là hình dạng
 * tRPC suy ra chứ không phải một lựa chọn ở đây: `unknown` gồm cả `undefined`,
 * nên kiểu output của procedure đánh dấu khoá là có thể VẮNG MẶT. Khai chúng
 * bắt buộc làm `typecheck` đỏ ngay tại chỗ gọi — đo 2026-09-06, TS2345
 * *"Property 'intro' is optional … but required in type 'DraftBody'"*.
 *
 * Đây chính là chỗ một phép `as ContentBodyRow` sẽ nuốt: nó biên dịch được, rồi
 * mọi hàm đọc bốn field này chạy trên một khoá không tồn tại. Mấy hàm parse
 * dưới đây nhận `undefined` y như nhận `null` nên hành vi lúc chạy không đổi —
 * cái đổi là trình biên dịch được nói thật.
 */
export interface DraftBody {
  readonly item: DraftBodyItem;
  readonly steps: readonly DraftBodyStep[];
  readonly intro?: unknown;
  readonly finish?: unknown;
  readonly setup?: unknown;
  readonly assets?: unknown;
}

/**
 * jsonb đã parse thành object thuần, hay `null`.
 *
 * ⛔ Mảng bị loại cùng với `null`: `typeof [] === 'object'`, nên đọc
 * `record.foreground` trên một mảng vẫn chạy và trả `undefined` — im lặng,
 * đúng chế độ hỏng mà một phép `as` sẽ tạo ra.
 */
function objectOrNull(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Ô nhập chỉ chở được chuỗi, nên mọi thứ khác thành `''`.
 *
 * Đường GHI (`lfText` = `z.string()`) không sinh ra được số hay boolean ở những
 * khoá này, nên nhánh `''` chỉ chạy trên dữ liệu jsonb hỏng — và với dữ liệu
 * hỏng thì "ô trống, người soạn nhìn thấy và sửa" là câu trả lời duy nhất một
 * cái form đưa ra được.
 */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** `null` = jsonb không phải object ⇒ phase này coi như KHÔNG có (`hasIntro: false`). */
function phaseFromJson(value: unknown): PhaseFormState | null {
  const record = objectOrNull(value);
  if (record === null) {
    return null;
  }
  // `setup` vắng mặt hoặc hỏng ⇒ hai ô script trống, phần còn lại của phase vẫn
  // nạp được. Bỏ cả phase chỉ vì một khoá con là vứt markdown người ta đã viết.
  const setup = objectOrNull(record.setup);
  return {
    title: textOf(record.title),
    markdown: textOf(record.markdown),
    setupForeground: textOf(setup?.foreground),
    setupBackground: textOf(setup?.background),
    verifyScript: textOf(record.verifyScript),
  };
}

/** `setup` của lab — hai ô, không phải một phase (lab không có markdown setup). */
function labSetupFromJson(value: unknown): {
  readonly foreground: string;
  readonly background: string;
} {
  const record = objectOrNull(value);
  return { foreground: textOf(record?.foreground), background: textOf(record?.background) };
}

/**
 * `ScenarioAsset[]` từ jsonb.
 *
 * Phần tử KHÔNG phải object bị bỏ — nó không có ô nào để hiện, nên giữ lại
 * nghĩa là giữ một dòng vô hình mà lượt Lưu kế tiếp vẫn xoá. Phần tử là object
 * nhưng thiếu khoá thì Ở LẠI dưới dạng ô trống: người soạn thấy nó, và
 * `contentDraftInput` (`host`/`file`/`target` đều `min(1)`) chặn lượt lưu kèm
 * tên field thay vì nuốt.
 */
function assetsFromJson(value: unknown): readonly AssetDirectiveFormState[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const forms: AssetDirectiveFormState[] = [];
  value.forEach((entry: unknown, index: number) => {
    const record = objectOrNull(entry);
    if (record === null) {
      return;
    }
    forms.push({
      key: `loaded-asset-${String(index)}`,
      host: textOf(record.host),
      file: textOf(record.file),
      target: textOf(record.target),
      chmod: textOf(record.chmod),
    });
  });
  return forms;
}

/** `null` thành `''`, KHÔNG thành `'0'` — xem chú thích "giữ chuỗi" ở `draft-form.ts`. */
function numberText(value: number | null): string {
  return value === null ? '' : String(value);
}

/**
 * THÂN NHÁP THÔ thành trạng thái FORM — đường nạp của trang sửa bài.
 *
 * ## Không có nhánh `null`, và đó là toàn bộ mục đích
 *
 * `draftFromPreview` trả `null` khi nguồn từ chối bản nháp. Hàm này không có
 * nhánh đó: `authoring.get` trả thân của mọi bài tồn tại, nên "bài có tồn tại
 * không" đã được trả lời TRƯỚC khi tới đây (bằng `NOT_FOUND`), và mọi field
 * còn thiếu là một ô trống người soạn điền được — không phải một lý do để từ
 * chối mở form.
 *
 * ## `null` được GIỮ là `''`, không được thay bằng mặc định của form
 *
 * `emptyDraft()` đặt `passThresholdPercent: '60'` và `ttlSeconds: '1800'` cho
 * một bài MỚI. Áp chúng lên một bản nháp đang có `null` là bịa ra một ngưỡng
 * không ai gõ, và `update` thay TOÀN BỘ nên lượt Lưu kế tiếp ghi con số bịa đó
 * xuống DB. `''` đi ngược qua `optionalInt` thành `null` — tức là đúng thứ đang
 * nằm trong bảng.
 *
 * ⚠ Ngoại lệ DUY NHẤT, và nó có mất mát: `leaderboard`. Form là một checkbox
 * hai trạng thái nên `null` không biểu diễn được; nó nạp thành `false`, và một
 * lượt Lưu ghi `false` đè lên `null`. Chấp nhận được vì `labSchema` đòi
 * `boolean` (một lab `null` không xuất bản được), nhưng nó KHÔNG phải phép
 * đồng nhất — đừng dựa vào hàm này để chứng minh vòng tròn khép cho field đó.
 */
export function draftFromBody(body: DraftBody): DraftFormState {
  const base = emptyDraft();
  const { item } = body;
  const intro = phaseFromJson(body.intro);
  const finish = phaseFromJson(body.finish);
  const setup = labSetupFromJson(body.setup);

  return {
    ...base,
    title: item.title,
    description: item.description ?? '',
    // `.find` chứ không `.includes` + `as`: phép so trả về CHÍNH literal của
    // hằng, nên kiểu hẹp lại mà không cần một câu khẳng định nào.
    difficulty: SCENARIO_DIFFICULTIES.find((known) => known === item.difficulty) ?? '',
    estimatedMinutes: numberText(item.estimatedMinutes),
    // Cột DB là enum nên nhánh fallback không chạy hôm nay; nó tồn tại để một
    // tier mới thêm vào DB trước khi thêm vào `SANDBOX_TIER_NAMES` không làm
    // form nạp một giá trị không có trong ô chọn.
    tier: SANDBOX_TIER_NAMES.find((known) => known === item.tier) ?? base.tier,
    // Lọc theo hàng (không theo hằng) để GIỮ THỨ TỰ đã lưu: `update` ghi lại
    // đúng mảng này, và đảo thứ tự là một thay đổi byte trong DB mà không ai ra
    // lệnh. Giá trị lạ bị bỏ — ô chọn không có chỗ hiện nó.
    capabilities: item.capabilities.flatMap<ScenarioCapability>((raw) =>
      SCENARIO_CAPABILITIES.filter((known) => known === raw),
    ),
    backendImageId: item.backendImageId,
    interfaceLayout: item.interfaceLayout === 'ide' ? 'ide' : '',
    assets: assetsFromJson(body.assets),
    // `hasIntro`/`hasFinish` suy TỪ dữ liệu, giống `draftFromScenario`: một
    // phase vắng mặt là `null` trong cột, và đó đã là câu trả lời đầy đủ.
    hasIntro: intro !== null,
    intro: intro ?? base.intro,
    hasFinish: finish !== null,
    finish: finish ?? base.finish,
    setupForeground: setup.foreground,
    setupBackground: setup.background,
    passThresholdPercent: numberText(item.passThresholdPercent),
    leaderboard: item.leaderboard ?? false,
    ttlSeconds: numberText(item.ttlSeconds),
    // ⛔ KHÔNG lọc theo `kind` ở đây. Hàng phẳng chở cả field của lesson lẫn của
    // lab, và `toDraftInput(kind, …)` đã là chỗ DUY NHẤT quyết định field nào
    // gửi đi theo loại. Lọc lần thứ hai ở đây là hai bộ luật cho một câu hỏi.
    steps: body.steps.map((step, index) => ({
      key: `loaded-step-${String(index)}`,
      taskId: step.taskId ?? '',
      title: step.title ?? '',
      markdown: step.markdown,
      setupForeground: step.setupForeground ?? '',
      setupBackground: step.setupBackground ?? '',
      verifyScript: step.verifyScript ?? '',
      weight: numberText(step.weight),
      hint: step.hint ?? '',
    })),
  };
}
