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

  /**
   * S2 — thêm ở lượt bịt rò, KHÔNG thay ô nào ở trên.
   *
   * Ô "giữ nguyên câu dành cho người dùng" phía trên vẫn xanh, nhưng nay vì một
   * lý do KHÁC và cần nói rõ: ta không còn CHUYỂN TIẾP chuỗi trên dây nữa — ta
   * tự viết một câu mang cùng nghĩa ("đã đạt trần số sandbox đồng thời"). Ràng
   * buộc mà ô ấy gác (người dùng phải biết là hết chỗ và nên chờ) vẫn được giữ;
   * đường tin cậy thì không còn. Hai ô dưới đây gác nửa còn lại.
   */
  async function messageFor(grpcCode: Code, rawMessage: string): Promise<string> {
    try {
      await callOrchestrator(() => Promise.reject(new ConnectError(rawMessage, grpcCode)));
    } catch (e) {
      return (e as TRPCError).message;
    }
    throw new Error('callOrchestrator KHÔNG ném — test vô nghĩa nếu vế này chạy');
  }

  it('KHÔNG chuyển tiếp chuỗi chẩn đoán của tầng dưới ra thông điệp client', async () => {
    // Hình dạng thật của một `Unavailable` từ connect-node: địa chỉ dial + errno.
    const raw = 'connect ECONNREFUSED 10.42.0.7:9090 (orchestrator.dlp-system.svc)';
    const message = await messageFor(Code.Unavailable, raw);

    expect(message).not.toContain('ECONNREFUSED');
    expect(message).not.toContain('10.42.0.7');
    expect(message).not.toContain('dlp-system');
    expect(message).not.toContain('orchestrator gRPC:');
    // Không phải rỗng: `describeTrpcError` hiển thị thẳng chuỗi này cho người dùng.
    expect(message.length).toBeGreaterThan(10);
  });

  it('câu gốc KHÔNG bị mất — nó nằm trong `cause` cho log/điều tra', async () => {
    // "Errors Over Silent Fallbacks": cắt đường ra trình duyệt, không cắt đường
    // tới người vận hành. Mất hẳn câu gốc thì sự cố mạng thành không chẩn đoán được.
    const raw = 'connect ECONNREFUSED 10.42.0.7:9090';
    try {
      await callOrchestrator(() => Promise.reject(new ConnectError(raw, Code.Unavailable)));
      throw new Error('không ném');
    } catch (e) {
      const cause = (e as TRPCError).cause;
      expect(cause).toBeInstanceOf(ConnectError);
      expect((cause as ConnectError).rawMessage).toContain('ECONNREFUSED');
    }
  });

  it('lỗi KHÔNG phải ConnectError được ném nguyên trạng', async () => {
    const boom = new Error('không phải lỗi gRPC');
    await expect(callOrchestrator(() => Promise.reject(boom))).rejects.toBe(boom);
  });
});
