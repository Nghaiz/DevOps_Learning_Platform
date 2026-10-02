import type { IntentionalThree } from '../types.ts';

/**
 * Chữ của trụ cột TRÒ CHƠI: trang chọn game, trang chọn màn của từng game, và
 * khung giao diện quanh màn chơi Git / CI-CD. Trong canvas game K8s thì không:
 * game đó giữ nguyên chữ của nó (yêu cầu của chủ dự án, 2026-10-03).
 */
export const games = {
  'games.meta-title': 'Trò chơi · PTIT DevOps Lab',
} as const;

export const gamesIntentionalThree: IntentionalThree = {};
