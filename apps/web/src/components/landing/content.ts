/**
 * Dữ liệu cấu trúc của landing: ga nào, tuyến màu gì, thẻ nào dẫn tới đâu. Chữ hiển thị KHÔNG
 * nằm ở đây mà ở `packages/copy` (surface `home`); file này chỉ giữ định danh để nơi gọi ghép
 * khoá kiểu `home.station.${id}.name`.
 *
 * Màu tuyến là tên biến CSS (`--l-<line>`, khai trong `landing.module.css`). Cảnh 3D đọc đúng
 * các biến đó lúc mount, nên DOM và WebGL không bao giờ lệch màu nhau.
 */

export const STATION_IDS = ['linux', 'git', 'docker', 'k8s', 'cicd', 'prod'] as const;
export type StationId = (typeof STATION_IDS)[number];

/** Tuyến đỏ là trục chính (màu PTIT); mỗi ga có một tuyến riêng tách ra từ bó tuyến. */
export const LINE_IDS = ['red', ...STATION_IDS, 'observe', 'obs', 'iac', 'star'] as const;
export type LineId = (typeof LINE_IDS)[number];

export const lineVar = (line: LineId): string => `var(--l-${line})`;

export const MODE_IDS = ['lesson', 'lab', 'playground', 'game'] as const;
export type ModeId = (typeof MODE_IDS)[number];

export interface ModeEntry {
  readonly id: ModeId;
  readonly href: string;
  readonly line: LineId;
}

export const MODES: readonly ModeEntry[] = [
  { id: 'lesson', href: '/lessons', line: 'docker' },
  { id: 'lab', href: '/labs', line: 'git' },
  { id: 'playground', href: '/playgrounds', line: 'cicd' },
  { id: 'game', href: '/games', line: 'k8s' },
];

export const GAME_IDS = ['k8s', 'git', 'cicd', 'maze', 'forge'] as const;
export type GameId = (typeof GAME_IDS)[number];

export interface GameCard {
  readonly id: GameId;
  /** `null`: game chưa mở, thẻ hiện nhãn "Đang làm" và không bấm được. */
  readonly href: string | null;
  readonly line: LineId;
}

export const GAMES: readonly GameCard[] = [
  { id: 'k8s', href: '/games/k8s', line: 'k8s' },
  { id: 'git', href: '/games/git', line: 'git' },
  { id: 'cicd', href: '/games/cicd', line: 'cicd' },
  { id: 'maze', href: null, line: 'prod' },
  { id: 'forge', href: null, line: 'docker' },
];

export const SECTION_IDS = {
  hero: 'dau-trang',
  journey: 'hanh-trinh',
  terminal: 'terminal',
  modes: 'cach-hoc',
  paths: 'lo-trinh',
  games: 'tro-choi',
  closing: 'ket',
} as const;
