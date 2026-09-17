/** Local campaign milestones; a replay always starts a fresh engine session. */
export interface GitMilestone {
  readonly completed: boolean;
  readonly moves: number;
}
export type GitProgress = Record<string, GitMilestone>;
const KEY = 'git-odyssey-progress-v1';
export function readGitProgress(): GitProgress {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, entry]) =>
          entry !== null &&
          typeof entry === 'object' &&
          typeof entry.completed === 'boolean' &&
          typeof entry.moves === 'number' &&
          Number.isFinite(entry.moves) &&
          entry.moves >= 0,
      ),
    );
  } catch {
    return {};
  }
}
export function saveGitMilestone(id: string, completed: boolean, moves: number): void {
  try {
    const progress = readGitProgress();
    const previous = progress[id];
    progress[id] = {
      completed: completed || previous?.completed === true,
      moves: previous?.completed
        ? completed
          ? Math.min(previous.moves, moves)
          : previous.moves
        : moves,
    };
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* Storage may be unavailable; the current game remains playable. */
  }
}
