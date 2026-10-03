import { DIFFICULTIES, type Difficulty } from '@devops-platform/games';

/**
 * Sự thật về một game, SUY RA từ chính dữ liệu màn của nó.
 *
 * Trang `/games` cũ in "Từ cơ bản" trên mọi thẻ và mượn chữ của K8s cho thẻ
 * CI/CD: những con số và nhãn chép tay không có gì giữ chúng khớp với game thật.
 * Ở đây số màn, số chương và dải độ khó đều tính từ mảng màn, nên thêm một màn
 * là con số đổi theo mà không ai phải nhớ.
 *
 * Hàm thuần, chạy được ở máy chủ: `app/games/page.tsx` gọi nó rồi chỉ truyền
 * xuống client mảng id và vài con số, không kéo dữ liệu màn vào bundle.
 */

export const PLAYABLE_GAME_IDS = ['k8s', 'git', 'cicd'] as const;
export type PlayableGameId = (typeof PLAYABLE_GAME_IDS)[number];

/** Phần tối thiểu của một màn mà phép tính cần. Ba game đều có đủ ba trường. */
export interface LevelLike {
  readonly id: string;
  readonly chapter: number | string;
  readonly difficulty: Difficulty;
}

export interface GameFacts {
  readonly id: PlayableGameId;
  /** Id màn theo ĐÚNG thứ tự chơi. Tiến độ và "màn tiếp" đọc theo thứ tự này. */
  readonly levelIds: readonly string[];
  readonly chapters: number;
  readonly easiest: Difficulty;
  readonly hardest: Difficulty;
}

function rank(difficulty: Difficulty): number {
  return DIFFICULTIES.indexOf(difficulty);
}

export function factsOf(id: PlayableGameId, levels: readonly LevelLike[]): GameFacts {
  const first = levels[0];
  if (first === undefined) {
    throw new Error(`Game ${id} không có màn nào: trang /games không có gì để giới thiệu.`);
  }
  let easiest = first.difficulty;
  let hardest = first.difficulty;
  for (const level of levels) {
    if (rank(level.difficulty) < rank(easiest)) easiest = level.difficulty;
    if (rank(level.difficulty) > rank(hardest)) hardest = level.difficulty;
  }
  return {
    id,
    levelIds: levels.map((level) => level.id),
    chapters: new Set(levels.map((level) => level.chapter)).size,
    easiest,
    hardest,
  };
}

/** Màn đầu tiên chưa qua, theo thứ tự chơi. `null` khi đã qua hết. */
export function nextLevelId(
  levelIds: readonly string[],
  completed: ReadonlySet<string>,
): string | null {
  return levelIds.find((id) => !completed.has(id)) ?? null;
}

/** Số màn đã qua, CHỈ đếm id còn tồn tại trong game (bản lưu cũ có thể giữ id đã bỏ). */
export function countCompleted(
  levelIds: readonly string[],
  completed: ReadonlySet<string>,
): number {
  return levelIds.filter((id) => completed.has(id)).length;
}

/** Campaign của từng game: trang danh sách màn. */
export const CAMPAIGN_HREF: Readonly<Record<PlayableGameId, string>> = {
  k8s: '/games/k8s',
  git: '/games/git',
  cicd: '/games/cicd',
};

/**
 * Đường vào thẳng một màn. Ba game giữ màn đang chơi ở URL theo ba cách khác
 * nhau vì ba lý do khác nhau: CI/CD có đoạn con thật (màn chơi immersive theo
 * `pathname`), Git và K8s giữ `?level=` trên trang campaign của mình.
 */
export function levelHref(game: PlayableGameId, levelId: string): string {
  const encoded = encodeURIComponent(levelId);
  return game === 'cicd' ? `/games/cicd/${encoded}` : `${CAMPAIGN_HREF[game]}?level=${encoded}`;
}
