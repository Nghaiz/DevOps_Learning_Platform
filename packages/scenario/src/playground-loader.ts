import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { playgroundSchema, type Playground } from '@devops-platform/shared-types/playground';
import { mapBackendImage, KNOWN_BACKEND_IMAGE_IDS } from './backend.ts';
import { formatContentIssues } from './lab-loader.ts';
import { playgroundFileSchema, type PlaygroundFile } from './playground.ts';
import { sanitizeToolset } from './toolset.ts';

export const PLAYGROUND_EXTENSION = '.json';

/** Lỗi nhập playground — cùng kỷ luật `ScenarioError`/`LabError`: LUÔN ném. */
export class PlaygroundError extends Error {
  readonly playgroundFile: string;

  constructor(playgroundFile: string, message: string, options?: { cause?: unknown }) {
    super(`playground ${playgroundFile}: ${message}`, options);
    this.name = 'PlaygroundError';
    this.playgroundFile = playgroundFile;
  }
}

/**
 * Nạp MỘT playground từ ĐÚNG MỘT file JSON — không thư mục, không markdown,
 * không verify script. Đây là toàn bộ lý do playground là loại nội dung ĐƠN
 * GIẢN nhất trong ba loại: không có bài thì không có gì để dẫn giải hay để
 * chấm (xem docstring `playgroundSchema` trong shared-types).
 *
 * `id` BẮT BUỘC trong file và phải TRÙNG tên file (không phần mở rộng) — cùng
 * ràng buộc `labFileSchema.id`/`scenarioSidecarSchema.id`, vì lý do giống hệt:
 * `id` là định danh mà `playgrounds.start` dùng để mở phiên, đổi tên file mà
 * quên đổi field này sẽ làm route `/playgrounds/<id>` trỏ sai.
 */
export async function loadPlayground(filePath: string): Promise<Playground> {
  const file = path.resolve(filePath);
  const baseId = path.basename(file, PLAYGROUND_EXTENSION);

  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (cause) {
    throw new PlaygroundError(file, 'không đọc được file', { cause });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new PlaygroundError(file, `không phải JSON hợp lệ: ${(cause as Error).message}`, {
      cause,
    });
  }

  const parsed = playgroundFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PlaygroundError(
      file,
      `sai cấu trúc:\n${formatContentIssues(parsed.error.issues, path.basename(file))}`,
    );
  }
  const data: PlaygroundFile = parsed.data;

  if (data.id !== baseId) {
    throw new PlaygroundError(
      file,
      `khai id="${data.id}" nhưng tên file là "${baseId}${PLAYGROUND_EXTENSION}". Route ` +
        `/playgrounds/<id> và mutation playgrounds.start dùng đúng field này — hai giá trị lệch ` +
        `nhau nghĩa là một trong hai không mở được playground vừa đổi tên.`,
    );
  }

  const backend = mapBackendImage(data.backend.imageid);
  if (backend === null) {
    throw new PlaygroundError(
      file,
      `backend.imageid="${data.backend.imageid}" chưa có trong BACKEND_IMAGE_MAPPING. ` +
        `Đã biết: ${KNOWN_BACKEND_IMAGE_IDS.join(', ')}. ` +
        `Thêm một dòng vào packages/scenario/src/backend.ts sau khi xác nhận sandbox của ta chạy được nó.`,
    );
  }

  const playground: Playground = {
    id: data.id,
    title: data.title,
    description: data.description ?? null,
    tier: backend.tier,
    capabilities: [...backend.capabilities],
    backendImageId: data.backend.imageid,
    interfaceLayout: data.interface?.layout ?? null,
    // Thu hẹp NGAY TẠI BIÊN dựng DTO, không tin pipeline phía trên đã lọc:
    // `sanitizeToolset` thuần và idempotent, nên gọi thừa là vô hại, còn thiếu
    // một lượt gọi thì một tên lạ đi thẳng tới `dlp-tools enable` và hỏng trước
    // mặt người học lúc setup phiên.
    toolset: [...sanitizeToolset(data.toolset).toolset],
    ttlSeconds: data.ttlSeconds,
  };

  // Kiểm lại DTO bằng chính schema mà router sẽ tin — bắt lỗi của HÀM NÀY.
  const validated = playgroundSchema.safeParse(playground);
  if (!validated.success) {
    throw new PlaygroundError(
      file,
      `DTO dựng ra không hợp lệ (lỗi của loader, không phải của nội dung): ` +
        validated.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
    );
  }
  return validated.data;
}

/**
 * Nạp mọi playground dưới `rootDir` — mỗi file `*.json` NGAY TRONG thư mục (KHÔNG
 * đệ quy: `content/playgrounds/` là phẳng theo thiết kế, xem `docs/lab-format.md`).
 *
 * MỘT playground hỏng làm HỎNG CẢ MẺ — cùng lý do `loadScenarios`/`loadLabs`.
 */
export async function loadPlaygrounds(rootDir: string): Promise<Playground[]> {
  const root = path.resolve(rootDir);
  const entries = await readdir(root, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(PLAYGROUND_EXTENSION))
    .map((entry) => entry.name)
    .sort();

  const playgrounds: Playground[] = [];
  for (const name of files) {
    playgrounds.push(await loadPlayground(path.join(root, name)));
  }
  return playgrounds;
}
