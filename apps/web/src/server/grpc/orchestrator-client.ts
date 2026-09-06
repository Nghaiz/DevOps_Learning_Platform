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
/**
 * S2 — câu cho người dùng theo mã tRPC, do CHÍNH tầng này soạn.
 *
 * ⛔ Vì sao không chuyển tiếp `error.rawMessage`. Câu trên dây là do một dịch vụ
 * KHÁC viết, và ta không kiểm soát nội dung của nó: `Unavailable` mang chuỗi của
 * connect-node (địa chỉ dial, cổng, `ECONNREFUSED`), `Internal` mang lỗi Go
 * nguyên văn, và những thứ đó đi THẲNG ra trình duyệt của mọi user đã đăng nhập
 * qua `capacity.get` / `me.activeSessions`. Đây là cùng lớp lỗ với `errorFormatter`,
 * nhưng bộ lọc bên đó KHÔNG bắt được nó: câu này được ghép bằng tay nên nó là
 * "do ta soạn" theo mọi phép kiểm cấu trúc. Hai biên, hai bản vá.
 *
 * ⚠ `TOO_MANY_REQUESTS` giữ NGUYÊN NGHĨA câu mà orchestrator phát ra khi chạm
 * trần quota ("đã đạt trần số sandbox đồng thời… thử lại sau ít phút" —
 * `lifecycle/service.go`). Ngữ nghĩa ấy là thứ `orchestrator-client.test.ts`
 * đang gác và nó ĐÁNG được gác: mã 429 mà không có câu này thì người ngồi trước
 * màn hình không biết phải chờ. Khác biệt là ta TỰ VIẾT lại câu đó thay vì tin
 * chuỗi trên dây — cùng thông tin cho người dùng, không cùng đường tin cậy.
 */
const ORCHESTRATOR_MESSAGE_BY_CODE: Partial<Record<TRPCError['code'], string>> = {
  BAD_REQUEST: 'Yêu cầu gửi tới dịch vụ sandbox không hợp lệ. Hãy tải lại trang rồi thử lại.',
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi thử lại.',
  FORBIDDEN: 'Bạn không có quyền trên phiên sandbox này.',
  NOT_FOUND: 'Không tìm thấy phiên sandbox — có thể nó đã hết hạn hoặc bị thu hồi. Hãy tạo phiên mới.',
  CONFLICT: 'Phiên sandbox này đã tồn tại. Hãy tải lại trang để xem phiên đang chạy.',
  TIMEOUT: 'Dịch vụ sandbox phản hồi quá lâu. Hãy thử lại sau giây lát.',
  TOO_MANY_REQUESTS:
    'Nền tảng đã đạt trần số sandbox đồng thời. Hãy chờ ít phút rồi thử lại — phiên của người khác kết thúc là có chỗ.',
  NOT_IMPLEMENTED: 'Chức năng này của dịch vụ sandbox chưa sẵn sàng.',
};

const ORCHESTRATOR_FALLBACK_MESSAGE =
  'Không liên lạc được với dịch vụ sandbox. Hãy thử lại sau ít phút; nếu vẫn lỗi, báo quản trị viên.';

export async function callOrchestrator<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ConnectError) {
      const code = CONNECT_TO_TRPC_CODE[error.code] ?? 'INTERNAL_SERVER_ERROR';
      // Câu gốc KHÔNG mất — nó về log server, nơi người vận hành cần nó. Chỉ
      // đường đi ra trình duyệt bị cắt.
      console.error('[grpc:orchestrator] RPC thất bại', {
        connectCode: Code[error.code] ?? error.code,
        trpcCode: code,
        rawMessage: error.rawMessage,
      });
      throw new TRPCError({
        code,
        message: ORCHESTRATOR_MESSAGE_BY_CODE[code] ?? ORCHESTRATOR_FALLBACK_MESSAGE,
        cause: error,
      });
    }
    throw error;
  }
}
