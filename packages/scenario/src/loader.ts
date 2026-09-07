import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  scenarioSchema,
  type Scenario,
  type ScenarioAsset,
  type ScenarioPhase,
  type ScenarioStep,
} from '@devops-platform/shared-types/scenario';
import { mapBackendImage, KNOWN_BACKEND_IMAGE_IDS } from './backend.ts';
import { ScenarioError } from './errors.ts';
import { parseKillercodaIndex, type KillercodaIndex, type KillercodaPhase } from './killercoda.ts';
import { scenarioSidecarSchema, type ScenarioSidecar } from './sidecar.ts';
import { sanitizeToolset } from './toolset.ts';

export const SIDECAR_FILENAME = 'dlp.json';
export const INDEX_FILENAME = 'index.json';

/**
 * Nạp một scenario từ thư mục trên đĩa.
 *
 * Thứ tự các phép kiểm là có chủ ý: sidecar TRƯỚC (nó khai `acknowledgedUnknownFields`
 * mà `index.json` cần), rồi index, rồi mới chạm tới file nội dung. Đọc 12 file
 * markdown xong mới phát hiện `dlp.json` thiếu license là lãng phí, và thông báo
 * lỗi cuối cùng sẽ nói về file cuối cùng đọc được chứ không về nguyên nhân.
 */
export async function loadScenario(scenarioDir: string): Promise<Scenario> {
  const dir = path.resolve(scenarioDir);
  const dirName = path.basename(dir);

  const sidecar = await readSidecar(dir);
  if (sidecar.id !== dirName) {
    throw new ScenarioError(
      dir,
      `dlp.json khai id="${sidecar.id}" nhưng thư mục tên "${dirName}". ` +
        `id đi thẳng vào progress.lesson_id nên hai giá trị này phải trùng — ` +
        `đổi một bên mà quên bên kia sẽ làm mồ côi tiến độ đã lưu của người học.`,
    );
  }
  if (sidecar.acknowledgedUnknownFields.length > 0 && sidecar.notes === null) {
    throw new ScenarioError(
      dir,
      `dlp.json bỏ qua field upstream (${sidecar.acknowledgedUnknownFields.join(', ')}) ` +
        `nhưng "notes" để trống. Một lời khai không kèm lý do thì lần review sau không ai ` +
        `biết nó đã được xem xét hay chỉ được dán vào cho hết lỗi.`,
    );
  }

  const indexRaw = await readJson(dir, INDEX_FILENAME);
  let parsed;
  try {
    parsed = parseKillercodaIndex(indexRaw, sidecar.acknowledgedUnknownFields);
  } catch (cause) {
    throw new ScenarioError(dir, (cause as Error).message, { cause });
  }
  const { index, ignoredFields } = parsed;

  const backend = mapBackendImage(index.backend.imageid);
  if (backend === null) {
    throw new ScenarioError(
      dir,
      `backend.imageid="${index.backend.imageid}" chưa có trong BACKEND_IMAGE_MAPPING. ` +
        `Đã biết: ${KNOWN_BACKEND_IMAGE_IDS.join(', ')}. ` +
        `Thêm một dòng vào packages/scenario/src/backend.ts sau khi xác nhận sandbox của ta chạy được nó.`,
    );
  }

  // Đòi thứ image không cung cấp = một bài KHÔNG CHẠY ĐƯỢC. Bắt ở biên nhập,
  // vì chỗ còn lại để phát hiện nó là terminal của người học giữa step 3.
  const requires = sidecar.requiresCapabilities;
  if (requires !== null) {
    const provided = new Set<string>(backend.capabilities);
    const missing = requires.filter((c) => !provided.has(c));
    if (missing.length > 0) {
      throw new ScenarioError(
        dir,
        `dlp.json khai requiresCapabilities=[${requires.join(', ')}] nhưng ` +
          `backend.imageid="${index.backend.imageid}" chỉ cung cấp ` +
          `[${backend.capabilities.join(', ')}] — thiếu: ${missing.join(', ')}. ` +
          `requiresCapabilities phải là TẬP CON của thứ image cung cấp.`,
      );
    }
  }

  const upstreamSteps = index.details?.steps ?? [];
  if (upstreamSteps.length === 0) {
    throw new ScenarioError(
      dir,
      `index.json không có step nào. Killercoda chấp nhận điều đó (playground), ` +
        `nhưng một bài học không có bước nào chỉ là một trang trắng ở FE.`,
    );
  }

  const steps: ScenarioStep[] = [];
  for (const [i, upstream] of upstreamSteps.entries()) {
    const phase = await readPhase(dir, upstream, `details.steps.${i}`);
    steps.push({ ...phase, index: i });
  }

  const scenario: Scenario = {
    id: sidecar.id,
    title: index.title,
    description: index.description ?? null,
    difficulty: sidecar.difficulty,
    estimatedMinutes: sidecar.estimatedMinutes,
    tier: backend.tier,
    capabilities: [...backend.capabilities],
    requiresCapabilities: requires,
    backendImageId: index.backend.imageid,
    interfaceLayout: index.interface?.layout ?? null,
    // Thu hẹp NGAY TẠI BIÊN dựng DTO, không tin pipeline phía trên đã lọc:
    // `sanitizeToolset` thuần và idempotent, nên gọi thừa là vô hại, còn thiếu
    // một lượt gọi thì một tên lạ đi thẳng tới `dlp-tools enable` và hỏng trước
    // mặt người học lúc setup phiên.
    toolset: [...sanitizeToolset(index.toolset).toolset],
    intro:
      index.details?.intro === undefined
        ? null
        : await readPhase(dir, index.details.intro, 'details.intro'),
    finish:
      index.details?.finish === undefined
        ? null
        : await readPhase(dir, index.details.finish, 'details.finish'),
    steps,
    assets: flattenAssets(index.details?.assets),
    source: sidecar.source,
    ignoredUpstreamFields: ignoredFields,
  };

  // Kiểm lại DTO bằng chính schema mà 2.B/2.D sẽ tin. Không thừa: nó bắt lỗi
  // của HÀM NÀY (một field quên gán, một index lệch), thứ mà không phép kiểm nào
  // ở trên nhìn thấy vì chúng chỉ soi dữ liệu upstream.
  const validated = scenarioSchema.safeParse(scenario);
  if (!validated.success) {
    throw new ScenarioError(
      dir,
      `DTO dựng ra không hợp lệ (lỗi của loader, không phải của nội dung): ` +
        validated.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
    );
  }
  return validated.data;
}

/**
 * Nạp mọi scenario dưới `rootDir` (mỗi thư mục con là một scenario).
 *
 * Một scenario hỏng làm HỎNG CẢ MẺ, không bị bỏ qua. Nếu bỏ qua thì trang
 * `/lessons` chỉ đơn giản là thiếu một bài, và không ai nhận ra cho tới khi có
 * người đi tìm nó — trong khi CI thì vẫn xanh.
 */
export async function loadScenarios(rootDir: string): Promise<Scenario[]> {
  const root = path.resolve(rootDir);
  const entries = await readdir(root, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  // KHÔNG có phép kiểm trùng id ở đây, và đó là chủ ý: `loadScenario` đã ép
  // `id === tên thư mục`, còn tên thư mục thì filesystem đã lo cho tính duy nhất.
  // Thêm một vòng kiểm trùng nữa là mã KHÔNG BAO GIỜ chạy tới — và mã chết kèm
  // một test không kích hoạt được nó là cách một ô AC xanh mà chẳng chứng minh gì.
  const scenarios: Scenario[] = [];
  for (const name of dirs) {
    scenarios.push(await loadScenario(path.join(root, name)));
  }
  return scenarios;
}

async function readSidecar(dir: string): Promise<ScenarioSidecar> {
  const raw = await readJson(dir, SIDECAR_FILENAME);
  const parsed = scenarioSidecarSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ScenarioError(
      dir,
      `${SIDECAR_FILENAME} sai cấu trúc:\n` +
        parsed.error.issues
          .map((issue) => `  - ${issue.path.map(String).join('.') || '(gốc)'}: ${issue.message}`)
          .join('\n'),
    );
  }
  return parsed.data;
}

async function readPhase(
  dir: string,
  phase: KillercodaPhase,
  where: string,
): Promise<ScenarioPhase> {
  return {
    title: phase.title ?? null,
    markdown: await readRelative(dir, phase.text, `${where}.text`),
    setup: {
      foreground:
        phase.foreground === undefined
          ? null
          : await readRelative(dir, phase.foreground, `${where}.foreground`),
      background:
        phase.background === undefined
          ? null
          : await readRelative(dir, phase.background, `${where}.background`),
    },
    verifyScript:
      phase.verify === undefined ? null : await readRelative(dir, phase.verify, `${where}.verify`),
  };
}

async function readJson(dir: string, filename: string): Promise<unknown> {
  const text = await readRelative(dir, filename, filename);
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new ScenarioError(
      dir,
      `${filename} không phải JSON hợp lệ: ${(cause as Error).message}`,
      {
        cause,
      },
    );
  }
}

/**
 * Đọc một file mà `index.json` trỏ tới, ép nó nằm TRONG thư mục scenario.
 *
 * Nội dung được vendor về và có review, nên đây không phải phòng thủ trước kẻ
 * tấn công — nó phòng thủ trước một `../` gõ nhầm, thứ sẽ đọc được file bất kỳ
 * của tiến trình web và nhét vào một bài học công khai. Rào rẻ, không có lý do
 * để thiếu.
 */
async function readRelative(dir: string, relative: string, where: string): Promise<string> {
  if (path.isAbsolute(relative)) {
    throw new ScenarioError(dir, `${where}="${relative}" là đường dẫn tuyệt đối — phải tương đối.`);
  }
  const resolved = path.resolve(dir, relative);
  if (resolved !== dir && !resolved.startsWith(dir + path.sep)) {
    throw new ScenarioError(dir, `${where}="${relative}" trỏ ra ngoài thư mục scenario.`);
  }
  try {
    return await readFile(resolved, 'utf8');
  } catch (cause) {
    throw new ScenarioError(dir, `${where}="${relative}": không đọc được file`, { cause });
  }
}

// Type LẤY TỪ schema chứ không gõ lại: một bản sao viết tay sẽ lệch với
// `exactOptionalPropertyTypes` ở đúng field optional (`chmod?: string` vs
// `string | undefined`), và tệ hơn là nó trôi khỏi schema mà không ai thấy.
type UpstreamAssets = NonNullable<KillercodaIndex['details']>['assets'];

function flattenAssets(assets: UpstreamAssets): ScenarioAsset[] {
  if (assets === undefined) {
    return [];
  }
  return Object.entries(assets)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([host, items]) =>
      items.map((item) => ({
        host,
        file: item.file,
        target: item.target,
        chmod: item.chmod ?? null,
      })),
    );
}
