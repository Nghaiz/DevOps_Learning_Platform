import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { mintSandboxTokenFor } from '../auth/jwt';
import { SANDBOX_COOKIE_NAME } from '../auth/sandbox-cookie';
import { gatewayInternalUrl } from '../env';

/**
 * Chấm một step: chạy `verifyScript` TRONG pod session qua endpoint exec
 * one-shot của terminal-gateway (P2 / 2.C — `docs/scenario-format.md` §4).
 *
 * ## Vì sao BFF tự mint token thay vì forward cookie của người dùng
 *
 * `docs/scenario-format.md` §4 viết "auth bằng chính cookie `dlp_sandbox` do BFF
 * mint server-side". Câu đó chỉ có MỘT nghĩa hiện thực được, và không phải nghĩa
 * hiển nhiên: cookie `dlp_sandbox` mang thuộc tính `Path=/ws`
 * (`server/auth/sandbox-cookie.ts`), nên **trình duyệt không bao giờ gửi nó tới
 * `/api/trpc/*`** — BFF không có gì để forward. Nó phải mint một token mới.
 *
 * Hệ quả tốt, không phải nhượng bộ: `sub` của token là `ctx.user.id` từ session
 * cookie Better Auth, tức danh tính đã xác thực ở BFF. Chuỗi authz chín bước của
 * gateway sau đó vẫn chạy đủ, trong đó có bước g (`hash.userId == token.sub`) và
 * việc `podName`/`namespace` đọc từ REDIS. Không có đường nào để một scenarioId
 * hay stepIndex của client chọn được pod.
 *
 * ## Vì sao cần `expiresAtSeconds`
 *
 * `mintSandboxTokenFor` fail-fast nếu `exp <= now` — nó từ chối phát một token
 * chết sẵn. Nên caller phải hỏi orchestrator `GetSession` trước. Một lượt gọi
 * thêm, và nó cũng là vế authz đầu tiên (orchestrator tự kiểm chủ sở hữu).
 */

/** Shape gateway trả về ở 200 — xem `internal/execroute`. */
const execOkSchema = z
  .object({
    exitCode: z.number().int(),
    output: z.string(),
    truncated: z.boolean(),
  })
  .strict();

/** Shape gateway trả ở mọi mã lỗi. */
const execErrorSchema = z.object({ code: z.string(), message: z.string() }).strict();

export interface VerifyOutcome {
  /**
   * Contract Killercoda: **pass khi exit code = 0** (`docs/scenario-format.md`
   * §1). Không có ngưỡng nào khác, không đọc stdout để đoán.
   */
  passed: boolean;
  exitCode: number;
  output: string;
  truncated: boolean;
}

export interface VerifyRequest {
  sessionId: string;
  userId: string;
  expiresAtSeconds: number;
  /**
   * Nội dung script, đọc từ `Scenario.steps[i].verifyScript`.
   *
   * ⛔ TUYỆT ĐỐI KHÔNG nhận chuỗi này từ input của người dùng. Gateway không có
   * cách nào phân biệt một script đến từ đĩa với một script đến từ form — ranh
   * giới đó được giữ ở ĐÂY, bằng việc caller duy nhất (`lessons.checkStep`) tra
   * script theo `(scenarioId, stepIndex)` trong catalog.
   */
  script: string;
}

/**
 * Trần thời gian phía BFF cho một lượt chấm.
 *
 * Rộng hơn `GATEWAY_EXEC_TIMEOUT` (30s) một cách CÓ CHỦ Ý: nếu BFF cắt trước thì
 * gateway vẫn đang chạy script trong pod và ta mất luôn câu trả lời của nó — người
 * học nhận "lỗi mạng" cho một lượt chấm đã hoàn thành. Để gateway cắt trước thì
 * lỗi mang đúng mã `EXEC_FAILED` và đúng nguyên nhân.
 */
const BFF_TIMEOUT_MS = 45_000;

export async function runVerifyScript(req: VerifyRequest): Promise<VerifyOutcome> {
  const token = await mintSandboxTokenFor(req.userId, req.sessionId, req.expiresAtSeconds);
  const url = `${gatewayInternalUrl().replace(/\/+$/, '')}/exec/session/${encodeURIComponent(req.sessionId)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Cookie đặt bằng TAY vì đây là lời gọi server-to-server: không có
        // cookie jar nào, và cookie của người dùng thì không tới được BFF
        // (Path=/ws) — xem chú thích đầu file.
        cookie: `${SANDBOX_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({ script: req.script }),
      signal: AbortSignal.timeout(BFF_TIMEOUT_MS),
    });
  } catch (cause) {
    // Không nối `cause` vào message: nó mang URL nội bộ của gateway, và message
    // của TRPCError đi thẳng ra trình duyệt.
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Không gọi được dịch vụ chấm bài',
      cause,
    });
  }

  const raw: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw gatewayError(response.status, raw);
  }

  const parsed = execOkSchema.safeParse(raw);
  if (!parsed.success) {
    // Gateway trả 200 mà sai shape là contract vỡ. Đoán bừa (`exitCode ?? 1`) sẽ
    // báo "fail" cho người học vì một lỗi của chúng ta.
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Dịch vụ chấm bài trả về dữ liệu không hợp lệ',
    });
  }

  return {
    passed: parsed.data.exitCode === 0,
    exitCode: parsed.data.exitCode,
    output: parsed.data.output,
    truncated: parsed.data.truncated,
  };
}

/**
 * Dịch mã lỗi của gateway sang TRPCError.
 *
 * ⛔ KHÔNG có nhánh nào biến lỗi thành `passed: false`. Một session hết hạn, một
 * pod đã bị reap, một apiserver trục trặc — cả ba đều KHÔNG phải "bài làm sai", và
 * hiện chúng ra dưới dạng dấu X đỏ sẽ bắt người học đi sửa một bài vốn đã đúng.
 * FE phân biệt được hai thứ đó vì tRPC ném lỗi có mã, còn `passed:false` thì trả
 * về bình thường.
 */
function gatewayError(status: number, raw: unknown): TRPCError {
  const parsed = execErrorSchema.safeParse(raw);
  const code = parsed.success ? parsed.data.code : 'UNKNOWN';

  switch (code) {
    case 'SESSION_NOT_FOUND':
      return new TRPCError({
        code: 'NOT_FOUND',
        message: 'Phiên sandbox đã kết thúc — hãy khởi động lại bài học',
      });
    case 'SESSION_NOT_ACTIVE':
      return new TRPCError({
        code: 'CONFLICT',
        message: 'Phiên sandbox chưa sẵn sàng — đợi provisioning xong rồi thử lại',
      });
    case 'FORBIDDEN':
    case 'UNAUTHENTICATED':
      // BFF vừa tự mint token cho chính chủ session, nên nhánh này KHÔNG phải
      // "người dùng thiếu quyền" — nó là lệch cấu hình giữa BFF và gateway
      // (JWKS sai, `iss` lệch, đồng hồ lệch). Trả FORBIDDEN ra FE sẽ gửi người
      // ta đi đăng nhập lại cho một sự cố đăng nhập không sửa được.
      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Cấu hình xác thực giữa web và gateway không khớp',
      });
    default:
      // Gồm `EXEC_FAILED` (502 — pod/apiserver hỏng, hoặc script quá hạn),
      // `BAD_REQUEST` (400 — lỗi lập trình phía BFF), và mọi mã chưa biết. Tất cả
      // đều là "hệ thống", không phải "bài sai", nên chúng đi chung một nhánh;
      // `status` chỉ vào log của gateway chứ không đổi được điều đó.
      void status;
      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Không chạy được script chấm bài trong sandbox',
      });
  }
}
