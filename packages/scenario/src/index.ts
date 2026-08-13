// Specifier ".ts" — cùng lý do đã ghi ở packages/shared-types/src/index.ts.
export { ScenarioError } from './errors.ts';
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
  parseContentBlocks,
  type CodeAction,
  type ContentBlock,
} from './content-blocks.ts';
export { INDEX_FILENAME, SIDECAR_FILENAME, loadScenario, loadScenarios } from './loader.ts';
export { filesystemScenarioSource, type ScenarioSource } from './source.ts';
