// Specifier ".ts" (không phải ".js"): package này source-only (exports trỏ thẳng
// .ts, noEmit) nên file được webpack của Next bundle trực tiếp — webpack không
// resolve được specifier ".js" khi trên đĩa chỉ có ".ts". tsc chấp nhận nhờ
// allowImportingTsExtensions (chỉ hợp lệ vì noEmit).
export * from './redis-keys.ts';

// DTO scenario (P2 — Lessons). Hình dạng SAU chuẩn hoá; schema upstream nằm ở
// packages/scenario và cố ý không xuất hiện ở đây.
export * from './scenario.ts';

// DTO lab + playground (P8 — trụ cột ②). Cả hai `extend`/`pick` từ
// `contentBaseSchema` của scenario.ts — cố ý KHÔNG phải cây DTO song song.
export * from './lab.ts';
export * from './playground.ts';

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
