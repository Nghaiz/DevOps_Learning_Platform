/**
 * Barrel của `@devops-platform/games`.
 *
 * ⛔ Lead sở hữu. CHỈ re-export, không logic. Lane cần thêm một dòng ở đây thì
 * báo lead — đây là file mà cả bốn lane cùng chạm, tức là chỗ dễ đua nhất.
 *
 * ⛔ Không file nào truy được từ đây được phép `import` `node:*`. Barrel này đi
 * thẳng vào bundle trình duyệt; một `node:fs` lạc vào sẽ chỉ làm `next build` đỏ
 * trong khi typecheck, lint và test đều xanh (bài học của `packages/scenario`,
 * 2026-09-04).
 */

export type {
  Achievement,
  Difficulty,
  GameId,
  GameSave,
  GameSettings,
  RunResult,
} from './core/types.ts';
export { STORAGE_KEY_PREFIX, storageKey } from './core/types.ts';

export type {
  ChaosWave,
  Challenge,
  CheatSheetEntry,
  ClusterSpec,
  ClusterView,
  EdgeView,
  EventView,
  CreateSession,
  CreateSessionOptions,
  GameAction,
  GameActionKind,
  K8sSession,
  IncidentKind,
  Level,
  LevelTeaching,
  NodeSpec,
  NodeView,
  ObjectView,
  Objective,
  PodPhase,
  PodReason,
  ResourceKind,
  ResourceSpec,
  ResourceRef,
  RunLog,
  SessionPhase,
  SessionStatus,
} from './k8s/contract.ts';

export type { PredicateName } from './k8s/predicate-names.ts';
export { PREDICATE_NAMES } from './k8s/predicate-names.ts';

// ── Chống gian lận (lane G) ─────────────────────────────────────────────────
export type { ReplayEngine, RunTally, VerifyResult, VerifyStatus } from './core/verify.ts';
export {
  COMMAND_KINDS,
  checkDeterminism,
  isVerified,
  sessionReplayEngine,
  tallyLog,
  verifyLabel,
  verifyRun,
} from './core/verify.ts';

export { SCORE_MAX, checkPlausibility, checkSave, checksum, stampSave } from './core/integrity.ts';

// ── Nội dung level ──────────────────────────────────────────────────────────
/*
 * Mở export 2026-09-08. Lane đo lường đo được rằng `/games/k8s` không có màn
 * chọn level và cụm luôn rỗng, vì `page.tsx` render `<K8sGame />` không có
 * `levels` — mà package cũng chưa export danh sách nào để truyền vào.
 *
 * Đây là NỬA của chỗ hổng đó. Nửa còn lại là `createSession`, đang chờ
 * `k8s/session.ts` của lane B.
 */
export { LEVELS } from './k8s/levels/index.ts';
