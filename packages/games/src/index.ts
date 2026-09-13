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

/*
 * Nhật ký hành động dùng chung — CHUYỂN từ `k8s/contract.ts` lên `core/` ngày
 * 2026-09-14 (P17 §17.A.2). Lý do đầy đủ ở đầu `core/run-log.ts`.
 *
 * Ba tên `GameAction` / `GameActionKind` / `RunLog` giữ NGUYÊN ở barrel này dù
 * đổi nhà: chúng đã có chỗ dùng ngoài package (`apps/web/src/server/problems/`,
 * `components/k8s-arena/`), và đổi tên ở barrel là một thay đổi phá vỡ không
 * mua được gì.
 */
export type {
  GameAction,
  GameActionBase,
  GameActionKind,
  GitGameAction,
  K8sActionShape,
  ResourceRefLike,
  RunLog,
} from './core/run-log.ts';

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
  K8sGameAction,
  K8sGameActionKind,
  K8sRunLog,
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
  SessionPhase,
  SessionStatus,
} from './k8s/contract.ts';

export type { PredicateName } from './k8s/predicate-names.ts';
export { PREDICATE_NAMES } from './k8s/predicate-names.ts';

// ── Game Git (P17) ──────────────────────────────────────────────────────────
/*
 * Mở export ngay khi tầng giao diện cần, và đó là bài học rút từ `CHALLENGES`
 * của game K8s: 10 bài tập nằm trong package suốt một thời gian dài, chạy được,
 * có test tham chiếu, mà KHÔNG bao giờ được thêm vào barrel — nên không
 * component nào import được, và người dùng cuối chưa từng nhìn thấy bài nào.
 * Mã chết không đỏ ở đâu cả.
 *
 * Lane renderer 2D đã đo được đúng khoảng hở này lần thứ hai: `exports` của
 * package chỉ có subpath `"."`, nên deep import bị chặn, và họ phải dựng một
 * shim cấu trúc thay vì import `GitView`/`DagLayout` thật. Ba dòng dưới đây là
 * thứ gỡ shim đó.
 */
export type {
  BisectState,
  BlobObject,
  BotAction,
  CommitNodeView,
  CommitObject,
  CommitSpec,
  ConflictFile,
  EdgeKind,
  FileCellView,
  FilePath,
  GitEdgeView,
  GitError,
  GitErrorCode,
  GitLevel,
  GitObject,
  GitObjective,
  GitPredicateName,
  GitTeaching,
  GitView,
  GitWorld,
  Head,
  Lines,
  MergeHunk,
  Oid,
  OriginSpec,
  OutputLine,
  OutputTone,
  PendingOp,
  PullRequest,
  RefBadgeView,
  RefName,
  Repo,
  TreeObject,
  WorldSpec,
} from './git/contract.ts';

export { GIT_LEVELS, findGitLevel, gitLevelsOfChapter } from './git/levels/index.ts';
export { GIT_LEVEL_IDS, GIT_THEORY_IDS, theoryIdForLevel } from './git/level-ids.ts';
export type { GitEngineSession } from './git/engine.ts';
export { createGitSession, replayGitLog, runCommands } from './git/engine.ts';
export { buildView } from './git/view.ts';
export type { ViewHints } from './git/view.ts';
export { buildWorld } from './git/world-spec.ts';
export { shortOid } from './git/hash.ts';

/*
 * Sandbox (§17.Q). Mở export NGAY vì bài học của `CHALLENGES`: một kiểu mà không
 * ai ngoài package với tới được là một kiểu chưa tồn tại, và nó không đỏ ở đâu
 * cả — qua typecheck, qua lint, có cả test tham chiếu nên trông vẫn sống.
 *
 * `worldToSpec` là thứ Level Builder của P18 cần: dựng cây trong sandbox rồi
 * lấy làm trạng thái đầu hoặc trạng thái đích.
 */
export type { SandboxExport, SandboxScenario } from './git/sandbox.ts';
export {
  SANDBOX_SCENARIOS,
  SANDBOX_SCENARIO_LABEL,
  exportSandbox,
  exportSandboxJson,
  importSandboxJson,
  sandboxLevel,
  sandboxSpec,
  sandboxStateHash,
  withOrigin,
  withoutOrigin,
  worldToSpec,
} from './git/sandbox.ts';
export { GIT_PREDICATE_NAMES, evaluateObjectives, verdictOf } from './git/predicates.ts';
export type { ObjectiveResult, Verdict } from './git/predicates.ts';
export { GIT_VERBS, isGitVerb } from './git/command-table.ts';
export type { GitVerb } from './git/command-table.ts';
export { parseGitCommand } from './git/parser.ts';
export { suggest } from './git/suggest.ts';
export type { SuggestContext } from './git/suggest.ts';
export type { TheoryDoc, TheoryFrontmatter, TheoryIssue } from './git/theory.ts';
export { countProseWords, expectedReadMinutes, validateTheoryDocs } from './git/theory.ts';

// Tầng bố cục dùng chung — renderer SVG 2D và renderer 3D (P17b) cùng gọi.
export type { DagLayout, DagNode, LaidOutEdge, LaidOutNode } from './core/layout/index.ts';
export { layoutDag } from './core/layout/index.ts';

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

/*
 * `K8sEngineSession` là kiểu THẬT mà `createSession` trả về; `K8sSession` trong
 * hợp đồng là phần tối thiểu. Tầng giao diện cần cả `runCommand` (thanh lệnh)
 * lẫn `describe` (tab Mô tả của bảng thông số), và cả hai chỉ có ở kiểu đầy đủ.
 */
export type { DispatchOutcome, K8sEngineSession } from './k8s/session.ts';

/*
 * Bộ tuần tự manifest. Mở export cho tầng giao diện KHÔNG phải để nó tự dựng
 * YAML — `K8sEngineSession.manifest(uid)` mới là đường dùng — mà để test và
 * công cụ soạn bài dựng được manifest từ một object rời.
 */
export { toManifestYaml } from './k8s/manifest-yaml.ts';

/*
 * Bộ ĐỌC manifest, cặp với `toManifestYaml` ở trên.
 *
 * Mở ra vì tầng trình bày cần đọc được `spec` — bảng Tổng quan hiện tên và
 * image của container, thứ `ObjectView` cố ý không mang (hợp đồng giữ view
 * mỏng: `ObjectView` chỉ có những gì `kubectl get` in ra).
 *
 * ⛔ Đây KHÔNG phải lời mời viết một bộ đọc YAML thứ hai ở tầng giao diện. Bảng
 * Tổng quan phải dùng ĐÚNG bộ đọc mà engine dùng để áp manifest; hai bộ đọc
 * khác nhau nghĩa là bảng có thể hiện một image mà engine không hề thấy.
 */
export { parseManifests } from './k8s/yaml.ts';
export type { Manifest, ManifestResult } from './k8s/yaml.ts';

/*
 * Lưu tiến độ trên máy người chơi.
 *
 * ⚠ Cả `core/progress.ts` là MÃ CHẾT cho tới bản này: barrel chỉ mở
 * `STORAGE_KEY_PREFIX`/`storageKey` và mấy cái type, nên không hàm nào trong đó
 * gọi được từ ngoài package. Hệ quả: tiến độ KHÔNG được lưu ở đâu cả — thắng
 * một màn rồi tải lại trang là mất sạch — trong khi cả trang `/games` lẫn
 * `layout.tsx` đều đang viết ra chữ *"tiến độ lưu ngay trên máy bạn"*. Một lời
 * hứa không có gì thực hiện.
 *
 * Mở đúng phần cần để tầng giao diện đọc/ghi, không mở `parseSave` (chi tiết
 * nội bộ của việc di trú phiên bản).
 */
export {
  appendRun,
  browserStorage,
  emptySave,
  loadSave,
  readSave,
  writeSave,
} from './core/progress.ts';
export type { SaveLoad, SaveStatus, StorageLike } from './core/progress.ts';

/*
 * Phân loại mục tiêu "phải làm" / "phải giữ".
 *
 * Mở export vì tầng giao diện KHÔNG được tự suy ra: nó sẽ phải gọi
 * `initialState` + `advance` + `evaluateObjectives` — tức dựng lại một phiên bản
 * thứ hai của cùng phép thử, chạy trên cùng dữ liệu, và lệch đi ngay lần đầu ai
 * đó đổi `SETTLE_TICKS`. Phép thử này là kiến thức của ENGINE (nó biết mô phỏng
 * tiến hoá thế nào), nên nó ở lại engine và giao diện chỉ đọc kết quả.
 */
export type { ObjectiveKinds } from './k8s/objective-kind.ts';
export { SETTLE_TICKS, classifyObjectives } from './k8s/objective-kind.ts';

/*
 * Mười bài OJ mẫu, chuyển từ `CHALLENGES` — và export ngay tại đây là chỗ mà
 * `CHALLENGES` đã trượt: nó nằm trong package suốt một thời gian dài, chạy được,
 * có test tham chiếu, mà không ai ngoài package với tới được, nên người dùng
 * cuối chưa từng nhìn thấy bài nào.
 */
export { PROBLEMS_SEED } from './k8s/problems-seed/index.ts';

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

/*
 * Bảng loại tài nguyên và bộ phân tích lệnh, mở cho tầng giao diện.
 *
 * Lý do là chống bản sao chép, không phải tiện tay. Bộ gợi ý lệnh của terminal
 * cần biết có những động từ nào, mỗi động từ nhận cờ gì, và một chuỗi người dùng
 * gõ (`netpol`, `deploy`, `po`) ứng với loại tài nguyên nào. Không mở thì tầng
 * giao diện buộc phải chép tay chín động từ, bảng cờ, và một phép đoán số nhiều
 * bằng cách bỏ hậu tố `s` — phép đoán đó đã trượt sẵn ở `networkpolicies`.
 *
 * Cái giá của bản chép không phải là gợi ý sai hôm nay (lệnh vẫn chạy đúng, vì
 * `parseKubectl` mới là bên phân tích lúc người dùng bấm Enter). Cái giá là
 * KHÔNG CÓ CỔNG NÀO đỏ khi `kubectl.ts` đổi — bản chép cứ lệch dần và không ai
 * biết. `KUBECTL_VERBS` có cặp kiểm tra hai chiều lúc biên dịch nên nó không thể
 * lệch với `KubectlCommand`.
 */
export type { KindInfo } from './k8s/resources.ts';
export { KINDS, resolveKind } from './k8s/resources.ts';
export type {
  KubectlCommand,
  KubectlOptions,
  KubectlVerb,
  ParseResult,
  RolloutSub,
} from './k8s/kubectl.ts';
export { KUBECTL_VERBS, parseKubectl } from './k8s/kubectl.ts';
