import { readFileSync } from 'node:fs';
import { createClient, ConnectError, Code, type Client } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { TRPCError } from '@trpc/server';
import { SessionService } from '@devops-platform/shared-types';
import { grpcMtls, orchestratorGrpcAddr } from '../env';

/**
 * Kênh gRPC tới services/orchestrator.
 *
 * connect-es v2: transport gRPC LUÔN là HTTP/2 (không còn option httpVersion).
 * Scheme của `baseUrl` quyết định có TLS hay không — `http://` là h2c cleartext,
 * `https://` mới bắt tay TLS.
 *
 * ⛔ SCHEME LÀ THỨ QUYẾT ĐỊNH, KHÔNG PHẢI `nodeOptions`. Truyền ca/cert/key mà
 * để nguyên `http://` thì connect-node dựng kênh h2c và BỎ QUA toàn bộ chỗ cert
 * đó — không lỗi, không cảnh báo, và mọi RPC vẫn chạy vì server ở nấc
 * `permissive` nhận cả client không cert. Triệu chứng duy nhất là apps/web bị
 * từ chối nhánh system_component, thứ hôm nay nó không dùng. Nói cách khác: cấu
 * hình sai ở đây KHÔNG lộ ra cho tới ngày siết sang `require`, và khi đó nó lộ
 * ra dưới dạng toàn bộ trang session hỏng. Vì thế scheme được suy ra TỪ mode,
 * không phải viết tay ở hai chỗ.
 */
let cachedClient: Client<typeof SessionService> | null = null;

function client(): Client<typeof SessionService> {
  if (cachedClient === null) {
    const mtls = grpcMtls();
    const scheme = mtls === null ? 'http' : 'https';
    const transport = createGrpcTransport({
      baseUrl: `${scheme}://${orchestratorGrpcAddr()}`,
      ...(mtls === null
        ? {}
        : {
            nodeOptions: {
              ca: readFileSync(mtls.caFile),
              cert: readFileSync(mtls.certFile),
              key: readFileSync(mtls.keyFile),
              // Tên trên cert server, KHÔNG suy từ baseUrl: cùng lý lẽ với
              // GRPC_TLS_SERVER_NAME của gateway — địa chỉ dial và tên trên cert
              // trùng nhau hôm nay nhưng không buộc phải trùng.
              servername: mtls.serverName,
            },
          }),
    });
    cachedClient = createClient(SessionService, transport);
  }
  return cachedClient;
}

export function orchestratorClient(): Client<typeof SessionService> {
  return client();
}

const CONNECT_TO_TRPC_CODE: Partial<Record<Code, TRPCError['code']>> = {
  [Code.Unimplemented]: 'NOT_IMPLEMENTED',
  [Code.InvalidArgument]: 'BAD_REQUEST',
  [Code.NotFound]: 'NOT_FOUND',
  [Code.PermissionDenied]: 'FORBIDDEN',
  [Code.Unauthenticated]: 'UNAUTHORIZED',
  [Code.AlreadyExists]: 'CONFLICT',
  [Code.DeadlineExceeded]: 'TIMEOUT',
  [Code.Unavailable]: 'INTERNAL_SERVER_ERROR',
  // ⛔ THÊM Ở P3/3.F sau khi k6 ĐO ĐƯỢC hậu quả của việc thiếu dòng này.
  //
  // Orchestrator trả `codes.ResourceExhausted` kèm câu tiếng Việt dành cho người
  // dùng ("đã đạt trần số sandbox đồng thời của cluster; thử lại sau ít phút" —
  // `lifecycle/service.go`), và có hẳn test khẳng định điều đó
  // (`TestChamQuotaTraResourceExhausted`). Nhưng mã ấy KHÔNG có trong bảng này,
  // nên nó rơi xuống `?? 'INTERNAL_SERVER_ERROR'` ⇒ người dùng nhận **HTTP 500**.
  // Test phía orchestrator vẫn xanh vì nó dừng ở biên gRPC; không tầng nào đo
  // đường XUYÊN QUA BFF cho tới khi 3.F chạm trần thật trên cụm.
  //
  // Vì sao 429 chứ không 503: "nền tảng đầy chỗ" là trạng thái BÌNH THƯỜNG của
  // một hệ có quota, không phải sự cố — 5xx sẽ kéo alert error-rate của 3.D nổ
  // mỗi lần cluster đầy. Đây cũng là ánh xạ chuẩn gRPC ResourceExhausted→HTTP 429.
  // Trùng mã với hai lớp rate-limit (biên Traefik, per-user tRPC) là đánh đổi đã
  // biết: ba nguồn nằm ở ba tầng khác nhau và phân biệt được bằng `message`.
  [Code.ResourceExhausted]: 'TOO_MANY_REQUESTS',
};

/**
 * Bọc một lời gọi gRPC → surface lỗi thành TRPCError sạch thay vì để ConnectError
 * (nội bộ connect-node) rò ra tới client. `Unimplemented` từ orchestrator (P0 cố ý
 * trả nó cho mọi RPC — xem services/orchestrator) → `NOT_IMPLEMENTED`, ĐÚNG ý đồ
 * acceptance criteria "tRPC session.* gọi được orchestrator gRPC (mock)".
 */
export async function callOrchestrator<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ConnectError) {
      throw new TRPCError({
        code: CONNECT_TO_TRPC_CODE[error.code] ?? 'INTERNAL_SERVER_ERROR',
        message: `orchestrator gRPC: ${error.rawMessage || error.message}`,
        cause: error,
      });
    }
    throw error;
  }
}
