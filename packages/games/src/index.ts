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
export { DIFFICULTIES, GAME_IDS, STORAGE_KEY_PREFIX, storageKey } from './core/types.ts';

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
  CicdActionShape,
  CicdCdPoliciesLike,
  CicdOverridesLike,
  GitGameAction,
  K8sActionShape,
  ResourceRefLike,
  RunLog,
} from './core/run-log.ts';

/**
 * ⚠ `CicdGameAction` ra khỏi khối trên ở 19.J và KHÔNG phải một lần dọn tên.
 *
 * `core/run-log.ts` nay chỉ khai dạng MỞ (`CicdActionShape`); bản đóng — dạng
 * mang `CicdPlayerOverrides` + `CicdCdPolicies` thật — sống ở `cicd/action.ts`,
 * vì `core/` không được nhập từ thư mục game. Tên xuất ra ngoài barrel giữ
 * NGUYÊN, nên không consumer nào phải sửa import.
 */
export type { CicdGameAction, CicdRunLog } from './cicd/action.ts';

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

/**
 * Level Builder — §18.E.
 *
 * `checkSolvable` là cỗ máy của AC-8/AC-9 (chạy lời giải của cả 32 level đang
 * phát hành) dùng lại nguyên vẹn cho §18.E.7, nên level bạn tự dựng đi qua đúng
 * phép kiểm mà hàng phát hành đi qua. Nó chứng minh "đường NÀY đi được", KHÔNG
 * chứng minh "không có đường nào" — xem khối đầu `git/solvability.ts`.
 */
export { checkSolvable } from './git/solvability.ts';
export type { RejectedCommand, SolvabilityReport, UnmetObjective } from './git/solvability.ts';
export {
  BUILDER_CANNOT_EXPRESS,
  CUSTOM_LEVEL_ID_PREFIX,
  draftFromLevel,
  draftToLevel,
  emptyDraft,
  isCustomLevelId,
  levelDraftIssues,
  levelFromJson,
  levelToJson,
} from './git/level-draft.ts';
export type {
  BuilderLimit,
  DraftIssue,
  DraftIssueCode,
  LevelDraft,
  LevelExport,
} from './git/level-draft.ts';
export { GIT_COMMANDS, GIT_VERBS, isGitVerb } from './git/command-table.ts';
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
  MAX_REPLAY_TICK,
  checkDeterminism,
  isVerified,
  tallyLog,
  verifyLabel,
  verifyRun,
} from './core/verify.ts';

/*
 * `sessionReplayEngine` CHUYỂN NHÀ 2026-09-14 (18.A): `core/verify.ts` →
 * `k8s/replay-engine.ts`. Tên export giữ NGUYÊN, và đó là điều làm bước này an
 * toàn — `apps/web/src/server/problems/{replay,submit}.ts` import qua gốc
 * package (`exports` chỉ mở đúng subpath `"."`), nên chúng không phải sửa một
 * dòng nào.
 *
 * Vì sao phải chuyển: hàm này là ADAPTER của riêng game K8s — nó là chỗ duy
 * nhất trong cả `core/verify.ts` chạm `CreateSession`/`K8sSession`/`Level`. Để
 * nó ở `core/` thì bộ phát lại chống gian lận bị trói về đúng một game, và một
 * bài Git không có đường đi qua bộ xác minh. Chính `core/verify.ts` đã tự dặn
 * điều đó ở đầu file từ 17.A.2; nửa còn lại của lời dặn mới trả xong hôm nay.
 *
 * Ô đo: `grep -rn "from '../k8s\|from '../git" packages/games/src/core/` trả
 * rỗng. Đây là bản ĐÃ SỬA của AC-A — bản trong plan đếm cả văn xuôi nên đo nhầm.
 */
export { sessionReplayEngine } from './k8s/replay-engine.ts';

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

// ── Nhãn chủ đề theo game (§18.D) ───────────────────────────────────────────
/*
 * Mở ra vì `/problems` phải gọi được nó, và nó là đường DUY NHẤT tra nhãn chủ
 * đề không kéo engine — `PROBLEM_PLUGINS` kéo cả hai. Lý do đầy đủ nằm trong
 * chính file đó.
 */
export { problemTopicLabels } from './problem-topic-labels.ts';

// ── Hợp đồng OJ đa-game (18.A.2 / 18.A.3) ───────────────────────────────────
/*
 * ⚠ TRẠNG THÁI TRUNG GIAN CÓ CHỦ Ý — đọc trước khi "dọn cho gọn".
 *
 * Khối này chỉ mở những tên CHỈ CÓ ở `core/`. Chín tên nữa (`ProblemDifficulty`,
 * `PROBLEM_DIFFICULTIES`, `PROBLEM_DIFFICULTY_LABELS`, `ProblemState`,
 * `PROBLEM_STATES`, `ProblemHint`, `ProblemHintTeaser`, `ProblemForSolver`,
 * `isProblemCode`) hiện TỒN TẠI Ở CẢ HAI chỗ — `core/problem.ts` và
 * `k8s/problem.ts` — nên re-export cả hai ở đây là lỗi trùng tên, không phải
 * một lựa chọn.
 *
 * Hợp nhất chúng là bước dịch chuyển KẾ TIẾP của 18.A: `k8s/problem.ts` bỏ bản
 * khai của mình và re-export từ `core/`. Tách làm hai commit là cố ý (§6 của
 * plan: mỗi commit một bước lùi lại được) — commit này thuần thêm mới, không
 * một dòng mã đang chạy nào đổi nghĩa.
 *
 * ⚠ `isProblemCode` KHÔNG phải cùng một hàm ở hai nơi: bản `core/` nhận thêm
 * tham số tiền tố. Lúc hợp nhất phải sửa mọi chỗ gọi, không chỉ đổi đường import.
 */
export type {
  AuthorField,
  GameProblemPlugin,
  ProblemPluginMeta,
  ProblemPluginRegistry,
} from './core/problem-plugin.ts';
export type {
  GradeResult,
  ProblemBase,
  ProblemRunLog,
  ProblemTopicId,
  ProblemTopicOption,
  ReplayRequest,
  ProblemFailureCode,
  ProblemVerdict,
  Submission,
  Testcase,
  TestcaseTeaser,
} from './core/problem.ts';
export {
  PROBLEM_CODE_SUFFIX_DIGITS,
  PROBLEM_FAILURE_CODES,
  PROBLEM_VERDICTS,
  problemCodePattern,
  problemVerdictOf,
} from './core/problem.ts';

/*
 * Bảng đăng ký plugin (18.A.4 / 18.A.5). Đây là đường DUY NHẤT để tầng máy chủ
 * và tầng giao diện chấm một lượt nộp — cả hai phía gọi cùng `gradeProblemRun`.
 *
 * ⚠ Vì sao phải mở NGAY chứ không đợi "khi nào cần": bài học `CHALLENGES` của
 * game K8s, đã ghi ở khối đầu phần Game Git bên trên — 10 bài nằm trong package
 * rất lâu, chạy được, có test tham chiếu, mà KHÔNG bao giờ vào barrel, nên không
 * component nào import được và người dùng chưa từng thấy bài nào. Mã chết không
 * đỏ ở đâu cả.
 *
 * `UnknownProblemGameError` mở cùng, và đó không phải thừa: `gradeProblemRun`
 * NÉM khi `gameId` chưa có plugin thay vì trả một `GradeResult` rỗng. Phía gọi
 * cần bắt được đúng lớp đó để trả một câu nói được cho người dùng — không có nó
 * thì chỗ gọi chỉ còn cách so chuỗi thông điệp, và một lần sửa chính tả sẽ làm
 * nhánh bắt lỗi im lặng ngừng khớp.
 */
export {
  PROBLEM_PLUGINS,
  UnknownProblemGameError,
  gradeProblemRun,
  problemPluginMeta,
} from './problem-plugins.ts';

/*
 * Seed mặc định LÚC CHƠI của từng game — và đây là dòng gấp nhất của cả khối.
 *
 * Sau `ae7ed23`, `Submission.seed` luôn mang số THẬT: client chơi bằng seed nào
 * thì gửi lên seed đó, server phát lại bằng đúng số đó. Điều đó gỡ hẳn chỗ cho
 * phép hai bên tự chọn LÚC CHẤM.
 *
 * Nhưng nó dời câu hỏi chứ không xoá: **client lấy số ở đâu khi mở một bài
 * `seedable: false`?** Client sống ở `apps/web`, ngoài package này, và
 * `packages/games/package.json` chỉ mở đúng một subpath `"."` — nên không export
 * ở đây thì `apps/web` **sẽ tự đặt một hằng của riêng nó**. Lúc đó lỗ hổng vừa
 * bịt quay lại nguyên vẹn, chỉ dời từ giữa-hai-plugin sang giữa-client-và-server,
 * và nó vẫn hiện ra dưới đúng hình dạng cũ: mọi lượt nộp hợp lệ bị từ chối, nhìn
 * như hệ thống từ chối người chơi ngẫu nhiên.
 *
 * ⚠ Hai số CỐ Ý khác nhau (K8s `0`, Git `1`). Đừng "dọn" thành một hằng chung:
 * `1` của Git khớp mặc định của `createGitSession` (`git/engine.ts:99`), và đổi
 * nó nghĩa là lượt chấm OJ dựng thế giới khác mọi đường git còn lại của repo.
 * Lý do đầy đủ ghi tại chỗ khai của từng hằng.
 */
export { K8S_UNSEEDED_REPLAY_SEED } from './k8s/problem-plugin.ts';
export { GIT_UNSEEDED_REPLAY_SEED } from './git/problem-plugin.ts';
export { CICD_UNSEEDED_REPLAY_SEED } from './cicd/problem-plugin.ts';

/**
 * Bộ chấm CI/CD, xuất thẳng cho adapter PHÁT LẠI phía máy chủ
 * (`apps/web/src/server/problems/replay.ts`) — 19.J.
 *
 * ⚠ Đường CHẤM đã gọi nó gián tiếp qua `gradeProblemRun` → bảng plugin. Đường
 * XÁC MINH cần chính hàm đó, và phải là CHÍNH nó chứ không phải một bản diễn
 * giải thứ hai của cùng nhật ký: hai bản sẽ trôi, và chỗ trôi là "máy chủ chấm
 * ra một verdict, máy chủ xác minh ra một verdict khác" — người giải đúng bị từ
 * chối và không lệnh nào nói vì sao.
 */
export { gradeCicdProblem } from './cicd/problem-plugin.ts';

/*
 * Hình dạng đề bài CI/CD — 19.J. Trang soạn bài (`app/author/problems/`) và màn
 * làm bài (`components/games/cicd/cicd-problem.tsx`) đều dựng đúng bộ này, nên
 * không bên nào được gõ lại hình dạng của nó.
 */
export type { CicdProblemCd, CicdProblemSpec } from './cicd/problem-plugin.ts';

/*
 * Bảng "vị từ CD nào cần khối kịch bản nào". Xuất ra vì cổng lúc LƯU
 * (`server/problems/validate.ts`, 19.J.2.2) phải hỏi đúng câu mà bộ chấm hỏi —
 * hai bản chép tay của cùng một bảng sẽ trôi, và chỗ trôi sẽ là một bài lưu
 * được nhưng không chấm được.
 */
export { CD_PREDICATE_NEEDS } from './cicd/predicates.ts';
export type { CdSimulatorKind } from './cicd/predicates.ts';

/*
 * `ProblemPluginRegistry` đã ở trên; không có tên phần tử thì consumer cầm được
 * bảng mà không gọi tên được thứ trong bảng.
 */
export type { ErasedProblemPlugin } from './core/problem-plugin.ts';

/*
 * Mô hình hiển thị verdict. CHUYỂN NHÀ 2026-09-14 từ
 * `apps/web/src/server/problems/verdict-view.ts` xuống đây.
 *
 * Vì sao phải chuyển: `use-problem-submit.ts` khai `'use client'` và import một
 * GIÁ TRỊ từ `src/server/`. Đã đo, đó là file DUY NHẤT trong cả `apps/web` làm
 * điều đó. `next build` xanh vì hàm thuần, nhưng nó mong manh theo nghĩa đen:
 * một dòng `import 'server-only'` thêm vào file kia là đỏ ngay, và đỏ ở phía
 * người khác chứ không phía người gõ dòng đó.
 *
 * Vì sao chỗ này là chỗ đúng chứ không phải chép sang client: §18.C.3 sẽ đem
 * verdict của client và của server ra SO. Hai bên phải suy bằng CÙNG một hàm —
 * chép ra hai bản là làm phép so đó mất nghĩa, vì lúc lệch nhau ta không biết
 * mình đang phát hiện engine sai hay hai hàm sai khác nhau.
 */
export type { FailedTestcaseView, VerdictView } from './core/verdict-view.ts';
export {
  compileErrorCode,
  compileErrorReason,
  gradeFromSubmission,
  gradeOf,
  problemFailureMessage,
  toVerdictView,
  verdictFromVerify,
} from './core/verdict-view.ts';

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

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * Game CI/CD (P19)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mở ra ngoài vì tầng giao diện (`/games/cicd`, 19.E/19.H) cần đúng ba thứ và
 * không thứ nào dựng lại được ở phía web: danh sách level, một lượt chạy engine
 * tất định, và cầu nối YAML ↔ `WorkflowSpec` kèm dòng-cột của mọi lỗi.
 *
 * ⚠ **SỬA LỜI KHAI 2026-09-16.** Đoạn này ban đầu viết "giao diện đọc kết quả
 * `evaluate()` trả về, không tự chấm". Câu đó KHÔNG THỰC HIỆN ĐƯỢC, và đo ra
 * mới biết: `EvaluationRecord` chỉ có `{ baseSeed, error, passes }` — không có
 * kết quả mục tiêu nào trong đó. Theo đúng câu cũ thì màn chơi không có điều
 * kiện THẮNG.
 *
 * Nên mở `failingObjectiveIds` — và chỉ nó. Nó vẫn là MỘT bộ chấm: giao diện
 * gọi đúng hàm mà level gọi, không dựng bản thứ hai. `CICD_PREDICATES`,
 * `checkObjective` và `validateObjectiveArgs` vẫn đóng, vì mở bảng vị từ ra là
 * mời tầng giao diện tự ghép luật — đúng thứ commit `824ee8b` vừa gộp lại làm
 * một.
 *
 * ⛔ `ScoreAxes` là kiểu TRẢ VỀ, không phải struct để lưu (xem `score.ts` §"No
 * Derived Fields"). Mở kiểu ra đây không biến nó thành thứ được phép cất vào
 * `GameSave`; ba con số phải tính lại từ `EvaluationRecord` mỗi lần.
 */
export type {
  ApprovalSpec,
  AttemptOutcome,
  AttemptRecord,
  CacheSpec,
  CicdCheatSheetEntry,
  CicdLevel,
  CicdObjective,
  BlockedBy,
  CicdThresholds,
  CicdView,
  DagEdgeView,
  EnvironmentId,
  EvaluationError,
  EvaluationRecord,
  EvaluationSpec,
  FailureCause,
  FlakeSpec,
  InstanceKey,
  PassRecord,
  RunnerPool,
  RunRecord,
  ScoreAxes,
  StageId,
  StageInstanceRecord,
  StageKind,
  StageNodeView,
  StageRunState,
  StageSpec,
  StepNodeView,
  StepRecord,
  StepSpec,
  WorkflowSpec,
  WorkloadSpec,
} from './cicd/contract.ts';
export { DEFAULT_EVALUATION_PASSES, RELEASE_STRATEGIES, SECONDS_PER_TICK, STAGE_KINDS } from './cicd/contract.ts';

/**
 * `EDITABLE_PARTS` — mở ra ở 19.J.3, và nó ĐÍNH CHÍNH một chú thích cũ.
 *
 * `components/games/cicd/cicd-run.ts` ghi (đo 2026-09-16) rằng barrel này không
 * xuất `EDITABLE_PARTS`, nên nó suy kiểu gián tiếp qua `CicdLevel['editable']`.
 * Cách suy kiểu đó vẫn đúng và vẫn nên giữ — nhưng màn LÀM BÀI cần chính GIÁ TRỊ,
 * không chỉ cái kiểu: `cicdOjLevel` phải khai `editable` đúng bằng tập mà
 * `gradeCicdProblem` truyền cho `hydrateWorkflow`. Hai bên lệch nhau thì người
 * làm gõ được thứ máy chủ lặng lẽ bỏ qua, và verdict không giải thích được.
 *
 * Xuất giá trị là cách duy nhất giữ chúng khớp; chép bảy chuỗi literal sang tầng
 * web sẽ tạo bản thứ hai của một tập đóng, và bản đó trôi trong im lặng.
 */
export { EDITABLE_PARTS } from './cicd/contract.ts';
export type { EditablePart } from './cicd/contract.ts';

export { CD_LEVELS, CI_LEVELS, CICD_LEVELS } from './cicd/levels/index.ts';

export { evaluate, validateWorkflow } from './cicd/engine.ts';

export type { AxisDistribution, EvaluationSummary } from './cicd/score.ts';
export { scoreAxes, summarizeEvaluation } from './cicd/score.ts';

export type { CriticalPath, CriticalPathEdge, CriticalPathNode } from './cicd/critical-path.ts';
export { criticalPath } from './cicd/critical-path.ts';

/*
 * ── Tầng cảnh (19.D) — view, mã hoá trạng thái, phép đặt chỗ ────────────────
 *
 * Ba file này là hợp đồng mà lane 2D và lane 3D CÙNG đọc. Toán thuần, không một
 * dòng `three`: chúng phải test được ở env `node`, và `bundle:check` gác việc
 * engine đồ hoạ rò sang route không-3D (tiền lệ `44f8e39`, P17).
 *
 * ⚠ `buildGraphView` trả `CicdGraphView` — phần ĐỒ THỊ của `CicdView`, không
 * phải cả nó. `runners` và `events` chưa dựng được từ đầu ra hiện tại của engine
 * (không có ảnh chụp máy bận theo tick, không có nhật ký sự kiện). Lý lẽ đầy đủ
 * ở đầu `cicd/scene-view.ts`.
 */
export type { CicdGraphView, GraphViewInput } from './cicd/scene-view.ts';
export { buildGraphView } from './cicd/scene-view.ts';
export type {
  CicdBounds,
  CicdPlacement,
  CicdPlacementEdge,
  CicdPlacementNode,
  ScenePoint,
} from './cicd/scene-contract.ts';
export { countNonAxialSegments, placeWorkflow } from './cicd/scene-contract.ts';
export type { NodeGeometry, NodeMotion, StateEncoding } from './cicd/scene-encoding.ts';
export { encodingOf, STATE_ENCODING } from './cicd/scene-encoding.ts';

/*
 * Cầu nối YAML. `YamlDiagnostic` mang dòng + cột THẬT (19.C.3) và ô soạn của
 * 19.E.2 gạch chân theo đúng hai số đó — đừng dựng lại phép tính vị trí ở phía
 * web, nó sẽ lệch với bộ quét ngay lần đầu có một chuỗi trong nháy.
 */
export type { KhoaBoQua, WorkflowReadResult, YamlDiagnostic } from './cicd/yaml-read.ts';
export { readWorkflowYaml } from './cicd/yaml-read.ts';
export type { TruongBiBo, WorkflowWriteResult } from './cicd/yaml-write.ts';
export { writeWorkflowYaml } from './cicd/yaml-write.ts';

/*
 * Tầng ghép YAML ↔ dữ liệu level (19.E). Không có nó, vòng "soạn YAML ⇒ chấm ba
 * trục" cho `leadTimeSeconds: 0` và `runnerMinutes: 0` trên MỌI level — YAML
 * không chở được chín trường của hợp đồng, và bộ đọc áp mặc định trung tính cho
 * tất cả. Lý lẽ đầy đủ + phép đo ở đầu `cicd/hydrate.ts`.
 */
export type { CicdCacheChoice, CicdHydrateSources, CicdPlayerOverrides } from './cicd/hydrate.ts';
export type { CicdCacheControl, CicdRetryControl } from './cicd/controls.ts';
export { cacheControls, overridesToReach, retryControls } from './cicd/controls.ts';
export type { JobShapeProblem } from './cicd/job-shapes.ts';
export { checkJobShapes } from './cicd/job-shapes.ts';
export { ownValue } from './cicd/id-dict.ts';
export { cacheOverrideKey, hydrateWorkflow, mergeStageCatalogue } from './cicd/hydrate.ts';

/*
 * Điều kiện THẮNG của một màn chơi. Xem lời khai đã sửa ở khối CI/CD phía trên:
 * `evaluate()` không trả kết quả mục tiêu, nên không có hàm này thì màn chơi
 * không kết luận được đạt hay trượt.
 */
export type { CicdCdRecords, CicdScoringContext } from './cicd/predicates.ts';
export { failingObjectiveIds } from './cicd/predicates.ts';

/*
 * Chương CD (19.B). Ba bộ mô phỏng thuần + phép chiếu của chúng, và danh tính
 * artifact trên bản ghi đường ống. Hợp đồng: `cicd/cd-contract.ts`.
 */
export type {
  BadReleaseResponse,
  CanaryIntervalRecord,
  CdPolicyPart,
  CicdCdPolicies,
  CicdLevelCd,
  CanaryPolicy,
  DriftRecord,
  GitOpsActor,
  GitOpsChange,
  GitOpsPolicy,
  GitOpsRecord,
  GitOpsScenario,
  LogLineTemplate,
  MaskingPolicy,
  MaskingRecord,
  MaskingScenario,
  MigrationKind,
  ReleaseEvaluationSpec,
  ReleaseOutcome,
  ReleasePassRecord,
  ReleasePolicy,
  ReleaseRecord,
  ReleaseScenario,
  RollingPolicy,
  SecretForm,
  SecretLeak,
  SecretSpec,
} from './cicd/cd-contract.ts';
export {
  BAD_RELEASE_RESPONSES,
  CD_POLICY_PARTS,
  GITOPS_ACTORS,
  MIGRATION_KINDS,
  RELEASE_OUTCOMES,
  SECRET_FORMS,
} from './cicd/cd-contract.ts';
export {
  badReleasePromotedCount,
  dataIncidentCount,
  goodReleaseAbortedCount,
  isBadCandidate,
  rollbackSeconds,
  simulateRelease,
} from './cicd/release.ts';
export {
  driftSeconds,
  longestDriftSeconds,
  selfHealFights,
  simulateGitOps,
  undetectedDriftCount,
} from './cicd/gitops.ts';
export { leakCount, leakedSecrets, renderMaskedLog, transformSecret } from './cicd/masking.ts';
export type { CdSimulatorName, LevelCdRun } from './cicd/cd-run.ts';
export { mergeCdPolicies, runLevelCd } from './cicd/cd-run.ts';
export type { ArtifactId, DeploymentView } from './cicd/artifacts.ts';
export { artifactIdOf, deploymentsOf } from './cicd/artifacts.ts';
