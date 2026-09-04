import type { UserPreferencesRow } from '../db/schema';
import type { Database } from '../db/client';
import { readUserPreferences } from '../me/preferences';
import { runScriptInSession } from '../lessons/validate';

/**
 * D7 (phase-13) — áp tuỳ chọn shell mặc định lúc mở sandbox, TRƯỚC khi trả kết
 * quả `startSession`/`startAttempt`/`start` về FE.
 *
 * ⚠ Client KHÔNG bao giờ chọn lệnh chạy trong pod (hợp đồng bảo mật §3c, xem
 * `server/lessons/validate.ts` § "KHÔNG nhận script từ input"). Đường vào DUY
 * NHẤT là: người dùng chọn MỘT trong ba giá trị enum ở `/settings` → server tra
 * enum đó qua `SHELL_PATHS` (BẢNG TĨNH, không nhận chuỗi tuỳ ý) → script chạy
 * là một HẰNG SỐ phía server ghép đúng một đường dẫn từ bảng đó. Không có chỗ
 * nào trên đường đi client tự gõ được một lệnh.
 *
 * ⚠ Vì sao GHI LẠI CẢ BA giá trị, kể cả `bash` — hợp đồng exec plan D7 viết "chỉ
 * áp khi `defaultShell !== 'bash'`" với giả định pod mặc định là bash. Đo trực
 * tiếp: `images/sandbox-base/skel/.tmux.conf` dòng 15 đặt
 * `set -g default-shell /usr/bin/zsh` — **pod mặc định ZSH, không phải bash**.
 * Nếu chỉ bỏ qua khi `=== 'bash'` theo đúng chữ hợp đồng, một người dùng CHỌN
 * bash tường minh ở hồ sơ sẽ bị bỏ qua và vẫn nhận zsh — đúng NGƯỢC lại ý định
 * của họ. Ghi cho cả ba giá trị (idempotent) loại bỏ hẳn giả định "shell nào là
 * mặc định của pod" khỏi tầng này; script viết ĐÈ lên dòng skel bằng cách nối
 * sau nó (tmux áp dòng SAU CÙNG khi có hai `set default-shell`).
 *
 * Idempotent: chạy lại với CÙNG giá trị là no-op (dòng đã có, script thoát sớm
 * khi thấy dòng khớp hệt); đổi giá trị thì dòng dlp cũ (nếu có) bị xoá trước
 * khi ghi dòng mới — file không phình theo số lần start.
 */
const SHELL_PATHS: Readonly<Record<UserPreferencesRow['defaultShell'], string>> = {
  bash: '/bin/bash',
  zsh: '/usr/bin/zsh',
  pwsh: '/usr/bin/pwsh',
};

export interface SessionPreferencesResult {
  readonly preferencesApplied: boolean;
}

/** Đúng shape tối thiểu mà `applySessionPreferences` cần từ session vừa tạo/hiện có. */
export interface SessionForPreferences {
  readonly id?: string;
  readonly podName?: string;
  readonly expiresAt?: { readonly seconds: bigint } | undefined;
}

interface PreferencesLogger {
  warn(message: string, detail: Record<string, unknown>): void;
}

const defaultLogger: PreferencesLogger = {
  warn(message, detail) {
    console.warn(message, detail);
  },
};

function buildShellScript(path: string): string {
  // `sed -i` bên trong image (E1: `sed` là phần của `coreutils`, luôn có sẵn).
  // Dòng đích khớp CHÍNH XÁC (`grep -qxF`) trước khi ghi — chạy lại với cùng
  // `path` là no-op thật, không chỉ "không lỗi".
  return [
    'set -euo pipefail',
    'CONF="$HOME/.tmux.conf"',
    'touch "$CONF"',
    `LINE='set-option -g default-shell ${path}'`,
    'if grep -qxF "$LINE" "$CONF"; then exit 0; fi',
    'sed -i \'/^set-option -g default-shell /d\' "$CONF"',
    'printf \'%s\\n\' "$LINE" >> "$CONF"',
  ].join('\n');
}

/**
 * Áp tuỳ chọn phiên (hiện chỉ có shell mặc định — D7) cho một sandbox VỪA MỞ.
 *
 * `ctx.user.id` LÀ chủ sở hữu — hàm này chỉ được gọi ngay sau khi CHÍNH người
 * gọi vừa tạo session cho mình (`lessons.startSession`/`labs.startAttempt`/
 * `playgrounds.start` không có đường "tạo hộ user khác", cùng ràng buộc mà
 * `attachSandboxCookie` đã ghi).
 *
 * Pod chưa được cấp (`podName` rỗng/vắng — cold path lúc `startSession` trả
 * response, tmux server chưa tồn tại) ⇒ KHÔNG có gì để chỉnh: log warn rồi trả
 * `false`, không ném — một tuỳ chọn hồ sơ áp được hay không không được phép làm
 * hỏng luồng mở bài học.
 */
export async function applySessionPreferences(
  ctx: { db: Database; user: { id: string; role: string } },
  session: SessionForPreferences | undefined,
  logger: PreferencesLogger = defaultLogger,
): Promise<SessionPreferencesResult> {
  const sessionId = session?.id;
  const podName = session?.podName;
  const expiresAt = session?.expiresAt;

  if (sessionId === undefined || sessionId === '' || podName === undefined || podName === '') {
    logger.warn('[sessions:preferences] pod chưa được cấp — bỏ qua áp tuỳ chọn shell', {
      sessionId: sessionId ?? null,
    });
    return { preferencesApplied: false };
  }
  if (expiresAt === undefined) {
    logger.warn('[sessions:preferences] session thiếu expiresAt — bỏ qua áp tuỳ chọn shell', {
      sessionId,
    });
    return { preferencesApplied: false };
  }

  const prefs = await readUserPreferences(ctx.db, ctx.user.id);
  const path = SHELL_PATHS[prefs.defaultShell];

  const outcome = await runScriptInSession({
    sessionId,
    userId: ctx.user.id,
    expiresAtSeconds: Number(expiresAt.seconds),
    script: buildShellScript(path),
  });

  if (!outcome.passed) {
    logger.warn('[sessions:preferences] script áp shell mặc định thất bại', {
      sessionId,
      exitCode: outcome.exitCode,
    });
    return { preferencesApplied: false };
  }
  return { preferencesApplied: true };
}
