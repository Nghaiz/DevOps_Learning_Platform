// Specifier ".ts" — cùng lý do đã ghi ở packages/shared-types/src/index.ts.
export { ContentSourcesUnavailableError, InvalidCursorError, ScenarioError } from './errors.ts';
export {
  BACKEND_IMAGE_MAPPING,
  KNOWN_BACKEND_IMAGE_IDS,
  mapBackendImage,
  type BackendMapping,
} from './backend.ts';
export {
  KillercodaFormatError,
  killercodaIndexSchema,
  parseKillercodaIndex,
  type KillercodaIndex,
  type KillercodaParseResult,
  type KillercodaPhase,
} from './killercoda.ts';
export { scenarioSidecarSchema, type ScenarioSidecar } from './sidecar.ts';
export {
  CODE_ACTIONS,
  ContentBlockError,
  executableCommands,
  normalizeNewlines,
  parseContentBlocks,
  type CodeAction,
  type ContentBlock,
} from './content-blocks.ts';
export { INDEX_FILENAME, SIDECAR_FILENAME, loadScenario, loadScenarios } from './loader.ts';
export {
  CONTENT_ORDER_KEYS,
  NO_DURATION_SORT_VALUE,
  UNKNOWN_DIFFICULTY_RANK,
  compareContent,
  compareCursors,
  contentSortValue,
  decodeContentCursor,
  encodeContentCursor,
  filesystemScenarioSource,
  isAfterCursor,
  matchesContentFilter,
  paginateSorted,
  type ContentListFilter,
  type ContentOrderKey,
  type ContentPage,
  type ContentSortable,
  type ContentSource,
  type DecodedContentCursor,
  type ListPageOptions,
  type ScenarioSource,
} from './source.ts';

// Nguồn nội dung SOẠN TRÊN UI (P9) — hiện thực thứ hai của cùng `ContentSource`,
// cộng luật gộp hai nguồn. Luật + bốn câu trả lời: `docs/content-sources.md`.
export {
  dbContentSource,
  type ContentBodyRow,
  type ContentItemRow,
  type ContentRepository,
  type ContentSourceLogger,
  type ContentStepRow,
  type DbContentSourceOptions,
} from './db-source.ts';
export { compositeContentSource, type CompositeOptions } from './composite-source.ts';
export {
  MAX_TOTAL_ASSET_BYTES,
  ScenarioAssetError,
  resolveScenarioAssets,
  type ResolvedAsset,
} from './assets.ts';

// Lab (P8 8.A) — file-format schema + loader + hàm tính điểm thuần.
export {
  contentBackendRefSchema,
  contentInterfaceRefSchema,
  labFileSchema,
  labSetupFileSchema,
  labTaskFileSchema,
  type ContentBackendRef,
  type ContentInterfaceRef,
  type LabFile,
  type LabSetupFile,
  type LabTaskFile,
} from './lab.ts';
export {
  LAB_FILENAME,
  LabError,
  formatContentIssues,
  loadLab,
  loadLabs,
} from './lab-loader.ts';
export {
  computeAttemptDurationSeconds,
  computeLabScore,
  computeLabStatus,
  latestResultPerTask,
} from './lab-score.ts';

// Playground (P8 8.E) — file-format schema + loader.
export { playgroundFileSchema, type PlaygroundFile } from './playground.ts';
export {
  PLAYGROUND_EXTENSION,
  PlaygroundError,
  loadPlayground,
  loadPlaygrounds,
} from './playground-loader.ts';
