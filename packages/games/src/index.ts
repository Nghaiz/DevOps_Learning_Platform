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
 * Nửa còn lại — `createSession` — mở export 2026-09-08 khi `k8s/session.ts` và
 * `k8s/incidents.ts` cùng landed, tức package hết đỏ.
 *
 * ⚠ `K8sGame` phải TỰ IMPORT cả hai. Không truyền được từ `page.tsx` xuống dưới
 * dạng prop: đó là server component, và hàm không serialize qua ranh giới
 * server-client.
 */
export { LEVELS } from './k8s/levels/index.ts';
export { createSession } from './k8s/session.ts';

// ── Hệ bài tập kiểu OJ ──────────────────────────────────────────────────────
/*
 * Mở export ngay từ commit đầu của hệ này, và đó là bài học rút từ `CHALLENGES`
 * ngay bên trên: 10 challenge nằm trong `k8s/challenges.ts` từ lâu, đầy đủ
 * `initialState` và `objectives` chạy được, nhưng KHÔNG bao giờ được thêm vào
 * barrel — nên không component nào import được, và người dùng cuối chưa từng
 * nhìn thấy chúng. Mã chết không hề đỏ ở đâu cả: nó qua typecheck, qua lint, và
 * còn có ba file test tham chiếu tới nên trông vẫn "sống".
 *
 * Một kiểu mà không ai ngoài package này với tới được là một kiểu chưa tồn tại.
 */
export type {
  Problem,
  ProblemDifficulty,
  ProblemFilter,
  ProblemForSolver,
  ProblemHint,
  ProblemHintTeaser,
  ProblemListOptions,
  ProblemOrderKey,
  ProblemPage,
  ProblemState,
  ProblemStats,
  ProblemSubmission,
  ProblemTopic,
  ProblemViewerStatus,
  ProblemWithStats,
} from './k8s/problem.ts';
export {
  PROBLEM_CODE_PATTERN,
  PROBLEM_DIFFICULTIES,
  PROBLEM_DIFFICULTY_LABELS,
  PROBLEM_ORDER_KEYS,
  PROBLEM_STATES,
  PROBLEM_TOPICS,
  PROBLEM_TOPIC_LABELS,
  isProblemCode,
} from './k8s/problem.ts';

// ── Chấm điểm ───────────────────────────────────────────────────────────────
/*
 * Mở export 2026-09-08 theo yêu cầu của tầng máy chủ OJ, và lý do đáng ghi lại.
 *
 * `sessionReplayEngine(createSession, level, scoreRun)` nhận hàm chấm điểm dưới
 * dạng tham số tiêm vào, nhưng trong cả package KHÔNG có adapter nào nối
 * `computeScore` vào chỗ đó — ngoài `scoring.test.ts` thì `computeScore` không
 * có một chỗ gọi nào. Máy chủ phải tự dựng `scoreRun` khi phát lại nhật ký để
 * chấm, và nếu nó không với tới được `computeScore` thì lựa chọn duy nhất còn
 * lại là chép công thức sang `apps/web`. Lúc đó có hai nơi cùng định nghĩa cách
 * tính điểm, và chúng sẽ lệch nhau — người chơi thấy một số lúc chơi, một số
 * khác sau khi máy chủ chấm lại.
 */
export type { ScoreInput } from './k8s/scoring.ts';
export { MAX_SCORE, computeScore, scoreCeiling } from './k8s/scoring.ts';

/*
 * Chấm điểm bài OJ. Một hàm, hai phía dùng chung — và đó là toàn bộ lý do nó
 * tồn tại tách khỏi `computeScore`.
 *
 * Máy chủ phát lại nhật ký hành động rồi chỉ ghi nhận khi con số nó tính khớp
 * con số client khai. Nếu hai bên tính bằng hai đoạn mã khác nhau thì mọi lượt
 * nộp HỢP LỆ đều bị từ chối và không ai được điểm — một lỗi trông không giống
 * lỗi công thức, mà giống hệ thống từ chối người chơi ngẫu nhiên.
 */
export type { ProblemScoreInput } from './k8s/problem-scoring.ts';
export { scoreProblemRun } from './k8s/problem-scoring.ts';

/*
 * `ALL_KINDS` mở theo yêu cầu lane D, và lý do đáng ghi lại vì nó là một cái bẫy
 * ngữ nghĩa chứ không phải thiếu tiện ích.
 *
 * Để phát lại nhật ký, một `Problem` phải bọc thành `Level` cho `createSession`.
 * `Level.allowedResources` không nhận `null`, còn `Problem.allowedResources` thì
 * có, và `null` ở đó nghĩa là "cho dùng MỌI loại". Không có `ALL_KINDS` thì chỗ
 * bọc buộc phải viết `[]` — mà `[]` mang nghĩa NGƯỢC LẠI: "cấm mọi loại".
 *
 * Hôm nay chưa gây hại vì engine không đọc trường đó khi phát lại. Nhưng ngày
 * nào engine bắt đầu chặn theo `allowedResources`, mọi lượt phát lại của mọi bài
 * "không giới hạn" sẽ trượt, và trượt trong im lặng — một hành động bị chặn
 * không phải một lỗi.
 *
 * Công dụng thứ hai: `ResourceKind` là kiểu liên hợp, không phải hằng mảng, nên
 * Zod ở biên ghi không có gì để dựng `z.enum`. Thiếu nó thì `kind` chỉ kiểm được
 * là chuỗi khác rỗng, và một `Deploymnet` gõ nhầm lọt qua cổng xuất bản rồi chỉ
 * lộ ra khi có người vào làm bài.
 */
export { ALL_KINDS } from './k8s/resources.ts';
