import { t, type CopyRef } from '@devops-platform/copy';
import type { GameId } from '@devops-platform/games';
import type { ScenarioDifficulty } from '@devops-platform/shared-types/scenario';

/**
 * Dữ liệu của trụ cột Trò chơi (hợp đồng C4, `phase-14-exec.md` §4.1, §5).
 *
 * ## Vì sao là một hằng số trong mã, không phải một lời gọi API
 *
 * Ô nghiệm thu của phase là **0 lời gọi backend trong lúc chơi**, đo bằng
 * network trace của Playwright. Một `games.list` qua tRPC sẽ phá đúng ô đó ngay
 * ở trang danh mục, trước cả khi người chơi bấm vào game nào. Năm mục là dữ liệu
 * do lập trình viên viết ra, không phải nội dung do tác giả soạn.
 *
 * Hệ quả có chủ ý: thêm một game là một lần deploy, không phải một lần nhập
 * liệu. Mỗi game là một bó mã, không phải một bản ghi.
 *
 * ## Chữ đi qua `packages/copy`
 *
 * Tên và mô tả từng game đọc từ surface `games.` (đợt dựng lại PTIT, 2026-10-03).
 * Trước đó chúng là chuỗi viết thẳng ở đây và nằm ngoài tầm mọi cổng chữ; cổng
 * riêng `games-copy-quality.test.ts` vẫn quét GIÁ TRỊ của hằng này để một chuỗi
 * lọt khỏi bản đồ mai sau vẫn bị bắt.
 *
 * Số màn, số chương và dải độ khó KHÔNG nằm ở đây: chúng suy ra từ dữ liệu màn
 * thật (`components/games/hub/game-facts.ts`). Một con số chép tay ở đây sẽ là
 * một lời khai lệch ngay khi ai đó thêm một màn.
 */

export const GAME_TOPICS = ['kubernetes', 'cicd', 'network', 'container', 'git'] as const;
export type GameTopic = (typeof GAME_TOPICS)[number];

export const GAME_TOPIC_LABEL: Record<GameTopic, string> = {
  kubernetes: t('games.topic.kubernetes'),
  cicd: t('games.topic.cicd'),
  network: t('games.topic.network'),
  container: t('games.topic.container'),
  git: t('games.topic.git'),
};

export interface GameEntry {
  readonly id: string;
  /**
   * Tên game ở `@devops-platform/games`. Hai trục chỉ TRÙNG MỘT PHẦN: `maze` và
   * `forge` ứng với `netpol` và `dockerfile`. Màu và biểu tượng của game đọc qua
   * trường này (`topicLook({ gameId })`), không đoán từ chủ đề: `maze` mang cả
   * `kubernetes` lẫn `network`, và đoán theo chủ đề đầu tiên sẽ tô nó màu K8s.
   */
  readonly gameId: GameId;
  readonly title: string;
  /** `null` ⇒ **chưa chơi được**; mục hiện ở danh sách "đang dựng" và không bấm được. */
  readonly href: string | null;
  readonly description: string;
  /**
   * Độ khó **lúc bắt đầu**, chỉ dùng cho bộ lọc. Trang không in con số này: dải
   * độ khó in ra trên `/games` đọc từ chính dữ liệu màn của từng game.
   */
  readonly difficulty: ScenarioDifficulty;
  readonly topics: readonly GameTopic[];
}

/**
 * Năm mục: BA chơi được (P14 dựng K8s, P17 dựng Git, P19 dựng CI/CD), HAI còn ở
 * trạng thái "sắp có" (quyết định #4 của phase): chúng mới có thiết kế ở
 * `docs/games/`. Hiện chúng không bấm được là cách nói ra kế hoạch mà không hứa
 * một đường dẫn tới trang trắng.
 *
 * `id: 'cicd'` (đổi từ `pipeline` ở 19.H): cùng cái tên ấy là khoá tra ở
 * `PREVIEW_ROUTE_BY_GAME`, `GAME_NAMES` và `TOPIC_LABELS_BY_GAME`. `pipeline`
 * vẫn là một `GameId` hợp lệ, nhưng nay là tên của một game CHƯA có gì.
 */
export const GAMES: readonly GameEntry[] = [
  {
    id: 'k8s',
    gameId: 'k8s',
    title: t('games.k8s.name'),
    href: '/games/k8s',
    description: t('games.k8s.blurb'),
    difficulty: 'beginner',
    topics: ['kubernetes'],
  },
  {
    id: 'git',
    gameId: 'git',
    title: t('games.git.name'),
    href: '/games/git',
    description: t('games.git.blurb'),
    difficulty: 'beginner',
    topics: ['git'],
  },
  {
    id: 'cicd',
    gameId: 'cicd',
    title: t('games.cicd.name'),
    href: '/games/cicd',
    description: t('games.cicd.blurb'),
    difficulty: 'intermediate',
    topics: ['cicd'],
  },
  {
    id: 'maze',
    gameId: 'netpol',
    title: t('games.maze.name'),
    href: null,
    description: t('games.maze.blurb'),
    difficulty: 'advanced',
    topics: ['kubernetes', 'network'],
  },
  {
    id: 'forge',
    gameId: 'dockerfile',
    title: t('games.forge.name'),
    href: null,
    description: t('games.forge.blurb'),
    difficulty: 'beginner',
    topics: ['container'],
  },
];

/**
 * Hai điều MỌI game phải nói ra trước khi bấm (yêu cầu 14.B.6): không tốn
 * sandbox, không cần đăng nhập. Một hằng dùng chung chứ không phải một field ở
 * từng mục, nên không có đường nào để một game hiện ra mà thiếu hai câu này.
 *
 * Đối lập là CTF (P11): nó chạy trên hạ tầng thật nên tốn một sandbox và cần
 * đăng nhập.
 */
export const NO_SANDBOX_LABEL = t('games.fact.no-sandbox');
export const NO_LOGIN_LABEL = t('games.fact.no-login');

export interface GameMetaItem {
  readonly icon: 'sandbox' | 'login';
  readonly label: string;
}

export const GAME_META: readonly GameMetaItem[] = [
  { icon: 'sandbox', label: NO_SANDBOX_LABEL },
  { icon: 'login', label: NO_LOGIN_LABEL },
];

export interface GameFilterState {
  readonly topic: GameTopic | 'all';
  readonly difficulty: ScenarioDifficulty | 'all';
}

export const NO_GAME_FILTER: GameFilterState = { topic: 'all', difficulty: 'all' };

export function hasActiveGameFilter(filters: GameFilterState): boolean {
  return filters.topic !== 'all' || filters.difficulty !== 'all';
}

/**
 * Lọc theo chủ đề + độ khó, chạy ở client trên TOÀN BỘ danh sách: năm mục nằm
 * sẵn trong bundle, nên "khớp bộ lọc" là khớp toàn bộ kho, không phải một trang.
 */
export function filterGames(
  games: readonly GameEntry[],
  filters: GameFilterState,
): readonly GameEntry[] {
  return games.filter(
    (game) =>
      (filters.topic === 'all' || game.topics.includes(filters.topic)) &&
      (filters.difficulty === 'all' || game.difficulty === filters.difficulty),
  );
}

/**
 * Dòng đếm của `/games`, trả về KHOÁ chứ không trả về câu. Không có vế "trong
 * trang này": bộ lọc chạy trên toàn bộ kho.
 */
export function describeGameCount(shown: number, filtering: boolean): CopyRef {
  return filtering
    ? { key: 'games.hub.count-filtered', params: { shown } }
    : { key: 'games.hub.count', params: { shown } };
}
