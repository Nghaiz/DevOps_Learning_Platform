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
