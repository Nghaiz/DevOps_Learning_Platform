import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import type { ContentKind } from '@devops-platform/shared-types/authoring';
import { scenarioSchema } from '@devops-platform/shared-types/scenario';
import { labSchema } from '@devops-platform/shared-types/lab';
import { playgroundSchema } from '@devops-platform/shared-types/playground';
import type { ContentBodyRow } from '@devops-platform/scenario';
import { shellcheckScript, type ShellcheckReport } from './shellcheck';

/**
 * Validate NỘI DUNG SOẠN, dùng **đúng** schema mà nội dung trên đĩa phải qua
 * (P9 9.D task 12).
 *
 * Đây là luật 12 ở dạng thi hành được. Cám dỗ là viết một schema "cho trang
 * soạn" nới lỏng hơn một chút — cho phép `verifyScript` rỗng, cho phép 0 bước
 * — và mỗi lần nới là một bước tới **format thứ hai**: một bài lưu được nhưng
 * chạy hỏng. Nên ở đây không có schema nào mới; chỉ có `scenarioSchema`,
 * `labSchema`, `playgroundSchema`.
 *
 * ## Nháp thì sao?
 *
 * Bản nháp KHÔNG đi qua hàm này. Nháp được lưu tự do (0 bước, thiếu field, viết
 * dở) — bắt một bản nháp phải hợp lệ là bắt người soạn viết xong mới được lưu.
 * Hàm này là cổng của **`publish`**: chỗ nội dung rời khỏi tay tác giả và bắt
 * đầu là hợp đồng với người học.
 */

/** Một field sai, kèm ĐƯỜNG DẪN tới nó — AC đòi "từ chối kèm tên field". */
export interface ContentIssue {
  readonly path: string;
  readonly message: string;
}

export interface ContentValidation {
  readonly issues: readonly ContentIssue[];
  /** Cảnh báo shellcheck theo từng script. KHÔNG chặn (task 13). */
  readonly scriptWarnings: readonly ScriptWarning[];
}

export interface ScriptWarning {
  /** Ví dụ `steps[2].verifyScript`, `intro.setup.background` — chỉ đúng ô người soạn phải sửa. */
  readonly path: string;
  readonly report: ShellcheckReport;
}

function issuesOf(error: z.ZodError): readonly ContentIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length === 0 ? '(gốc)' : issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Dựng ứng viên DTO từ hàng DB rồi parse.
 *
 * ⚠ Ánh xạ hàng → DTO đã có MỘT bản trong `packages/scenario/src/db-source.ts`,
 * và bản đó là bản dùng lúc ĐỌC. Ở đây ta cần cùng phép ánh xạ lúc GHI, nên
 * hàm này gọi lại chính nguồn DB thay vì chép phép ánh xạ ra bản thứ hai —
 * hai bản sẽ lệch ở lần đầu tiên ai đó thêm một field, và triệu chứng là "lưu
 * được nhưng đọc ra thì hỏng".
 */
export function validateContentBody(kind: ContentKind, body: ContentBodyRow): readonly ContentIssue[] {
  const { item } = body;
  const common = {
    id: item.id,
    title: item.title,
    description: item.description,
    tier: item.tier,
    capabilities: item.capabilities,
    backendImageId: item.backendImageId,
    interfaceLayout: item.interfaceLayout,
  };

  switch (kind) {
    case 'lesson': {
      const parsed = scenarioSchema.safeParse({
        ...common,
        difficulty: item.difficulty,
        estimatedMinutes: item.estimatedMinutes,
        assets: body.assets ?? [],
        source: null,
        intro: body.intro ?? null,
        finish: body.finish ?? null,
        steps: body.steps.map((step) => ({
          index: step.ordinal,
          title: step.title,
          markdown: step.markdown,
          setup: { foreground: step.setupForeground, background: step.setupBackground },
          verifyScript: step.verifyScript,
        })),
        ignoredUpstreamFields: [],
      });
      return parsed.success ? [] : issuesOf(parsed.error);
    }
    case 'lab': {
      const parsed = labSchema.safeParse({
        ...common,
        difficulty: item.difficulty,
        estimatedMinutes: item.estimatedMinutes,
        assets: body.assets ?? [],
        source: null,
        setup: body.setup ?? { foreground: null, background: null },
        passThresholdPercent: item.passThresholdPercent,
        leaderboard: item.leaderboard,
        tasks: body.steps.map((step) => ({
          id: step.taskId,
          title: step.title,
          markdown: step.markdown,
          verifyScript: step.verifyScript,
          weight: step.weight,
          hint: step.hint,
        })),
      });
      return parsed.success ? [] : issuesOf(parsed.error);
    }
    case 'playground': {
      const parsed = playgroundSchema.safeParse({ ...common, ttlSeconds: item.ttlSeconds });
      return parsed.success ? [] : issuesOf(parsed.error);
    }
  }
}

/** Mọi script của một bài, kèm đường dẫn để cảnh báo trỏ đúng ô. */
function scriptsOf(body: ContentBodyRow): readonly { path: string; script: string }[] {
  const out: { path: string; script: string }[] = [];
  const phase = (prefix: string, value: unknown): void => {
    if (value === null || typeof value !== 'object') {
      return;
    }
    const { foreground, background } = value as { foreground?: unknown; background?: unknown };
    if (typeof foreground === 'string' && foreground !== '') {
      out.push({ path: `${prefix}.foreground`, script: foreground });
    }
    if (typeof background === 'string' && background !== '') {
      out.push({ path: `${prefix}.background`, script: background });
    }
  };

  phase('intro.setup', (body.intro as { setup?: unknown } | null)?.setup);
  phase('finish.setup', (body.finish as { setup?: unknown } | null)?.setup);
  phase('setup', body.setup);

  for (const step of body.steps) {
    const at = `steps[${String(step.ordinal)}]`;
    if (step.setupForeground !== null && step.setupForeground !== '') {
      out.push({ path: `${at}.setup.foreground`, script: step.setupForeground });
    }
    if (step.setupBackground !== null && step.setupBackground !== '') {
      out.push({ path: `${at}.setup.background`, script: step.setupBackground });
    }
    if (step.verifyScript !== null && step.verifyScript !== '') {
      out.push({ path: `${at}.verifyScript`, script: step.verifyScript });
    }
  }
  return out;
}

/**
 * Validate đầy đủ: format (CHẶN) + shellcheck (CẢNH BÁO).
 *
 * Hai mức khác nhau một cách CÓ CHỦ Ý và chúng không được trộn: một bài sai
 * format sẽ chạy hỏng cho người học, còn một script `shellcheck` không thích
 * vẫn có thể chạy đúng. Trả về cả hai để caller quyết định — `publish` chặn
 * theo `issues`, hiện `scriptWarnings`.
 */
export async function validateForPublish(
  kind: ContentKind,
  body: ContentBodyRow,
): Promise<ContentValidation> {
  const issues = validateContentBody(kind, body);
  const scripts = scriptsOf(body);
  const reports = await Promise.all(scripts.map(async (s) => shellcheckScript(s.script)));
  const scriptWarnings: ScriptWarning[] = [];
  for (const [index, script] of scripts.entries()) {
    const report = reports[index];
    if (report === undefined) {
      continue;
    }
    // Chỉ báo cáo khi có gì để nói: sạch VÀ chạy được thì im lặng.
    if (!report.available || report.findings.length > 0) {
      scriptWarnings.push({ path: script.path, report });
    }
  }
  return { issues, scriptWarnings };
}

/** Ném BAD_REQUEST kèm ĐÚNG tên field sai — AC "từ chối kèm tên field". */
export function assertNoIssues(issues: readonly ContentIssue[]): void {
  if (issues.length === 0) {
    return;
  }
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `Nội dung không hợp lệ: ${issues.map((i) => `${i.path} — ${i.message}`).join('; ')}`,
  });
}
