import { Code, ConnectError } from '@connectrpc/connect';
import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { callOrchestrator } from './orchestrator-client';

/**
 * Hồi quy cho P3/3.F — ánh xạ mã gRPC → mã tRPC ở biên BFF.
 *
 * ⛔ VÌ SAO TEST NÀY TỒN TẠI. Orchestrator đã có
 * `TestChamQuotaTraResourceExhausted` khẳng định chạm ResourceQuota thì trả
 * `codes.ResourceExhausted` kèm câu tiếng Việt cho người dùng. Test ấy **xanh**
 * suốt, và vẫn xanh trong khi người dùng thật nhận **HTTP 500** — vì nó dừng ở
 * biên gRPC, còn `CONNECT_TO_TRPC_CODE` thiếu đúng một dòng nên mã rơi xuống
 * `?? 'INTERNAL_SERVER_ERROR'`.
 *
 * Đây là hình dạng lỗi mà **không tầng test nào bắt được**: mỗi bên tự nhất
 * quán, chỉ đường đi XUYÊN QUA hai bên mới lộ. Nó chỉ lộ khi k6 của 3.F chạm
 * trần quota thật trên cụm. Test này kéo bằng chứng đó về suite thường, để lần
 * sau không cần một cụm đầy chỗ mới phát hiện được.
 */
describe('callOrchestrator — ánh xạ ConnectError → TRPCError', () => {
  async function codeFor(grpcCode: Code, message = 'x'): Promise<string> {
    try {
      await callOrchestrator(() => Promise.reject(new ConnectError(message, grpcCode)));
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      return (e as TRPCError).code;
    }
    throw new Error('callOrchestrator KHÔNG ném — test vô nghĩa nếu vế này chạy');
  }

  it('ResourceExhausted (chạm trần quota) → TOO_MANY_REQUESTS, KHÔNG phải 500', async () => {
    expect(await codeFor(Code.ResourceExhausted)).toBe('TOO_MANY_REQUESTS');
  });

  it('giữ nguyên câu dành cho người dùng, không nuốt vào cause', async () => {
    // Ngữ nghĩa "hết chỗ, thử lại" là thứ orchestrator cố ý phát ra; mất câu này
    // thì mã đúng cũng vô dụng với người đang ngồi trước màn hình.
    const msg = 'đã đạt trần số sandbox đồng thời của cluster; thử lại sau ít phút';
    try {
      await callOrchestrator(() => Promise.reject(new ConnectError(msg, Code.ResourceExhausted)));
      throw new Error('không ném');
    } catch (e) {
      expect((e as TRPCError).message).toContain('trần số sandbox đồng thời');
    }
  });

  it.each([
    [Code.InvalidArgument, 'BAD_REQUEST'],
    [Code.NotFound, 'NOT_FOUND'],
    [Code.PermissionDenied, 'FORBIDDEN'],
    [Code.Unauthenticated, 'UNAUTHORIZED'],
    [Code.AlreadyExists, 'CONFLICT'],
    [Code.DeadlineExceeded, 'TIMEOUT'],
  ])('%s giữ nguyên ánh xạ cũ', async (grpc, want) => {
    expect(await codeFor(grpc as Code)).toBe(want);
  });

  it('mã LẠ vẫn rơi về INTERNAL_SERVER_ERROR — đối chứng âm cho nhánh mặc định', async () => {
    // Thiếu vế này thì "ResourceExhausted → 429" không phân biệt được với "mọi
    // thứ → 429": một bảng map hỏng theo chiều ngược lại cũng làm ca trên xanh.
    expect(await codeFor(Code.DataLoss)).toBe('INTERNAL_SERVER_ERROR');
  });

  it('lỗi KHÔNG phải ConnectError được ném nguyên trạng', async () => {
    const boom = new Error('không phải lỗi gRPC');
    await expect(callOrchestrator(() => Promise.reject(boom))).rejects.toBe(boom);
  });
});
