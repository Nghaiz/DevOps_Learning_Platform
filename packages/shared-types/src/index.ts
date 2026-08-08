// Specifier ".ts" (không phải ".js"): package này source-only (exports trỏ thẳng
// .ts, noEmit) nên file được webpack của Next bundle trực tiếp — webpack không
// resolve được specifier ".js" khi trên đĩa chỉ có ".ts". tsc chấp nhận nhờ
// allowImportingTsExtensions (chỉ hợp lệ vì noEmit).
export * from './redis-keys.ts';

// Type sinh từ proto/orchestrator/v1/session.proto — SSOT của contract Next↔Go.
export type {
  ClaimSessionRequest,
  ClaimSessionResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  GetSessionRequest,
  GetSessionResponse,
  ReapSessionRequest,
  ReapSessionResponse,
  Session,
} from '../gen/orchestrator/v1/session_pb.ts';
export { SandboxTier, SessionStatus, SessionService } from '../gen/orchestrator/v1/session_pb.ts';
