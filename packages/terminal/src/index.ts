export {
  SUBPROTOCOL,
  CloseCode,
  CLOSE_ABNORMAL,
  MIN_DIMENSION,
  MAX_DIMENSION,
  clampDimension,
  encodeClientControl,
  isRetryableCloseCode,
  parseServerControl,
} from './protocol.ts';
export type {
  ClientControl,
  CloseCodeValue,
  ErrorMessage,
  ExitMessage,
  ExpiringMessage,
  ReadyMessage,
  ServerControl,
} from './protocol.ts';

export { MAX_BACKOFF_MS, backoffDelayMs, decideRetry } from './backoff.ts';
export type { RetryDecision, RetryDecisionInput } from './backoff.ts';

export { initialState, reduce } from './session-machine.ts';
export type {
  CreatedSession,
  SessionEvent,
  SessionPhase,
  SessionState,
} from './session-machine.ts';

export { buildSessionWsUrl, openConnection } from './connection.ts';
export type { Connection, ConnectionHandlers, ConnectionOptions } from './connection.ts';

export {
  RESIZE_DEBOUNCE_MS,
  TERMINAL_FONT_FAMILY,
  createTerminalCore,
  waitForFonts,
} from './terminal-core.ts';
export type { TerminalCore, TerminalCoreOptions, TerminalDimensions } from './terminal-core.ts';

export { DEFAULT_THEME, THEMES, THEME_NAMES, loadThemeName, saveThemeName } from './themes.ts';
export type { ThemeName } from './themes.ts';

export { TerminalSurface } from './terminal-surface.tsx';
export type { TerminalHandle, TerminalSurfaceProps } from './terminal-surface.tsx';
