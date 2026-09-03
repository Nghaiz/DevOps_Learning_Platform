import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';
import { labSchema, type Lab, type LabTask } from '@devops-platform/shared-types/lab';
import { mapBackendImage, KNOWN_BACKEND_IMAGE_IDS } from './backend.ts';
import { labFileSchema, type LabFile, type LabTaskFile } from './lab.ts';

export const LAB_FILENAME = 'lab.json';

/** Lỗi nhập lab — cùng kỷ luật `ScenarioError`: LUÔN ném, không trả bản "gần đúng". */
export class LabError extends Error {
  readonly labDir: string;

  constructor(labDir: string, message: string, options?: { cause?: unknown }) {
    super(`lab ${labDir}: ${message}`, options);
    this.name = 'LabError';
    this.labDir = labDir;
  }
}

/**
 * Định dạng lỗi Zod thành các dòng NÊU RÕ ĐƯỜNG DẪN CHẤM tới field gây lỗi —
 * cùng kỷ luật `parseKillercodaIndex`/`formatIssues` của `killercoda.ts`. Một
 * field lạ (`unrecognized_keys`) được khai triển thành MỘT dòng cho MỖI key lạ,
 * vì `issue.path` của chính issue đó chỉ trỏ tới OBJECT chứa field lạ, không
 * trỏ tới field lạ đó.
 *
 * Xuất ra để `playground-loader.ts` dùng LẠI — cả hai file đọc nội dung phẳng
 * theo cùng kỷ luật `.strict()`, và một bản chép ở mỗi loader sẽ lệch nhau ở
 * lần đầu tiên ai đó sửa cách trình bày lỗi chỉ ở một chỗ.
 */
export function formatContentIssues(issues: readonly z.core.$ZodIssue[], filename: string): string {
  const lines: string[] = [];
  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        const where = [...issue.path.map(String), key].join('.');
        lines.push(`  - ${where}: field lạ, không có trong ${filename}`);
      }
    } else {
      const where = issue.path.length === 0 ? '(gốc)' : issue.path.map(String).join('.');
      lines.push(`  - ${where}: ${issue.message}`);
    }
  }
  return lines.join('\n');
}

/**
 * Đọc một file mà `lab.json` trỏ tới (qua tên quy ước, không phải qua field
 * tường minh), ép nó nằm TRONG thư mục lab — cùng guard `readRelative` của
 * `loader.ts`. Trùng lặp có chủ ý: `loader.ts` không xuất hàm này, và rào chắn
 * rẻ tới mức không đáng phải sửa một file không thuộc sở hữu của lane này để
 * dùng chung nó.
 */
async function readRelative(dir: string, relative: string, where: string): Promise<string> {
  const resolved = path.resolve(dir, relative);
  if (resolved !== dir && !resolved.startsWith(dir + path.sep)) {
    throw new LabError(dir, `${where}="${relative}" trỏ ra ngoài thư mục lab.`);
  }
  try {
    return await readFile(resolved, 'utf8');
  } catch (cause) {
    throw new LabError(dir, `${where}="${relative}": không đọc được file`, { cause });
  }
}

async function readTaskMarkdown(dir: string, taskId: string): Promise<string> {
  const relative = `task-${taskId}.md`;
  return readRelative(dir, relative, `tasks[id=${taskId}].markdown (${relative})`);
}

/**
 * `verifyScript` KHÔNG nullable ở DTO — một task chấm không được là một task
 * không có cách nào đạt (xem `labTaskSchema.verifyScript` trong shared-types).
 * Nên loader từ chối ở BIÊN NHẬP hai ca: file vắng mặt (readRelative đã ném), và
 * file có mặt nhưng RỖNG (chỉ khoảng trắng) — một `verify.sh` rỗng thoát mã 0
 * (shell không có lệnh nào để chạy), tức nó LUÔN "đạt", đúng khiếm khuyết
 * `docs/scenario-format.md` đã cảnh báo cho `prolug` (`/bin/true` không kiểm
 * gì) nhưng còn tệ hơn: nó thậm chí không phải một lệnh trung thực.
 */
async function readTaskVerifyScript(dir: string, taskId: string): Promise<string> {
  const relative = `task-${taskId}/verify.sh`;
  const content = await readRelative(dir, relative, `tasks[id=${taskId}].verify (${relative})`);
  if (content.trim() === '') {
    throw new LabError(
      dir,
      `${relative} rỗng. Một verify.sh rỗng thoát mã 0 vô điều kiện — task sẽ LUÔN "đạt" mà ` +
        `không kiểm gì. Viết grader thật hoặc bỏ task này khỏi lab.`,
    );
  }
  return content;
}

/**
 * Nạp MỘT lab từ thư mục trên đĩa.
 *
 * Thứ tự: đọc + kiểm `lab.json` TRƯỚC, rồi mới chạm file nội dung của từng task
 * — cùng lý do `loader.ts` đọc sidecar trước `index.json`: một `lab.json` sai
 * cấu trúc phải báo lỗi về CHÍNH `lab.json`, không phải về file markdown cuối
 * cùng đọc được.
 */
export async function loadLab(labDir: string): Promise<Lab> {
  const dir = path.resolve(labDir);
  const dirName = path.basename(dir);

  const raw: unknown = await readJson(dir);
  const parsed = labFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new LabError(
      dir,
      `${LAB_FILENAME} sai cấu trúc:\n${formatContentIssues(parsed.error.issues, LAB_FILENAME)}`,
    );
  }
  const file: LabFile = parsed.data;

  if (file.id !== dirName) {
    throw new LabError(
      dir,
      `${LAB_FILENAME} khai id="${file.id}" nhưng thư mục tên "${dirName}". id đi thẳng vào ` +
        `lab_attempts.lab_id nên hai giá trị này phải trùng — đổi một bên mà quên bên kia sẽ làm ` +
        `mồ côi mọi lần thử đã lưu của người học.`,
    );
  }

  const backend = mapBackendImage(file.backend.imageid);
  if (backend === null) {
    throw new LabError(
      dir,
      `backend.imageid="${file.backend.imageid}" chưa có trong BACKEND_IMAGE_MAPPING. ` +
        `Đã biết: ${KNOWN_BACKEND_IMAGE_IDS.join(', ')}. ` +
        `Thêm một dòng vào packages/scenario/src/backend.ts sau khi xác nhận sandbox của ta chạy được nó.`,
    );
  }

  const taskIds = new Set<string>();
  for (const task of file.tasks) {
    if (taskIds.has(task.id)) {
      throw new LabError(
        dir,
        `hai task cùng id="${task.id}". id đi thẳng vào lab_task_results.task_id nên phải duy nhất ` +
          `trong một lab.`,
      );
    }
    taskIds.add(task.id);
  }

  const tasks = await Promise.all(file.tasks.map((task: LabTaskFile) => buildTask(dir, task)));

  const setup = {
    foreground:
      file.setup?.foreground === undefined
        ? null
        : await readRelative(dir, file.setup.foreground, 'setup.foreground'),
    background:
      file.setup?.background === undefined
        ? null
        : await readRelative(dir, file.setup.background, 'setup.background'),
  };

  const lab: Lab = {
    id: file.id,
    title: file.title,
    description: file.description ?? null,
    difficulty: file.difficulty,
    estimatedMinutes: file.estimatedMinutes,
    tier: backend.tier,
    capabilities: [...backend.capabilities],
    backendImageId: file.backend.imageid,
    interfaceLayout: file.interface?.layout ?? null,
    // Không lab first-party nào trong repo này cần asset ngoài — xem docstring
    // `labFileSchema` trong lab.ts. `[]` là hình dạng DUY NHẤT loader này sinh ra.
    assets: [],
    source: file.source,
    tasks,
    setup,
    passThresholdPercent: file.passThresholdPercent ?? 100,
    leaderboard: file.leaderboard ?? false,
  };

  // Kiểm lại DTO bằng chính schema mà router (P8/P9) sẽ tin — bắt lỗi của HÀM
  // NÀY (một field quên gán), không phải lỗi của nội dung.
  const validated = labSchema.safeParse(lab);
  if (!validated.success) {
    throw new LabError(
      dir,
      `DTO dựng ra không hợp lệ (lỗi của loader, không phải của nội dung): ` +
        validated.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
    );
  }
  return validated.data;
}

async function buildTask(dir: string, task: LabTaskFile): Promise<LabTask> {
  const [markdown, verifyScript] = await Promise.all([
    readTaskMarkdown(dir, task.id),
    readTaskVerifyScript(dir, task.id),
  ]);
  return {
    id: task.id,
    title: task.title,
    markdown,
    verifyScript,
    weight: task.weight ?? 1,
    hint: task.hint ?? null,
  };
}

async function readJson(dir: string): Promise<unknown> {
  const text = await readRelative(dir, LAB_FILENAME, LAB_FILENAME);
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new LabError(dir, `${LAB_FILENAME} không phải JSON hợp lệ: ${(cause as Error).message}`, {
      cause,
    });
  }
}

/**
 * Nạp mọi lab dưới `rootDir` (mỗi thư mục con là một lab).
 *
 * MỘT lab hỏng làm HỎNG CẢ MẺ — cùng lý do `loadScenarios`: bỏ qua trong im
 * lặng làm trang `/labs` chỉ đơn giản thiếu một bài, và CI vẫn xanh.
 */
export async function loadLabs(rootDir: string): Promise<Lab[]> {
  const root = path.resolve(rootDir);
  const entries = await readdir(root, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const labs: Lab[] = [];
  for (const name of dirs) {
    labs.push(await loadLab(path.join(root, name)));
  }
  return labs;
}
