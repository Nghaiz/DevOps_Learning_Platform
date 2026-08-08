import { createClient, ConnectError, Code, type Client } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { TRPCError } from '@trpc/server';
import { SessionService } from '@devops-platform/shared-types';
import { orchestratorGrpcAddr } from '../env';

/**
 * gRPC thuần (KHÔNG TLS) tới services/orchestrator — cùng mạng nội bộ, chưa cần
 * mTLS ở P0 (design §8, siết ở P3). connect-es v2: transport gRPC LUÔN là HTTP/2
 * (không còn option httpVersion); baseUrl `http://` nghĩa là h2c (cleartext).
 */
let cachedClient: Client<typeof SessionService> | null = null;

function client(): Client<typeof SessionService> {
  if (cachedClient === null) {
    const transport = createGrpcTransport({
      baseUrl: `http://${orchestratorGrpcAddr()}`,
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
