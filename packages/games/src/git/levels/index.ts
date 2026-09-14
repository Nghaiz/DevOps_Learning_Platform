/**
 * 32 level của game **Phòng thí nghiệm Git**, theo THỨ TỰ CHƠI.
 *
 * ⛔ Thứ tự chơi là thứ tự của mảng `GIT_LEVELS` dưới đây, **không** phải thứ tự
 * con số trong `id`. Con số trong id là ĐỊNH DANH: đánh số lại một level là mồ
 * côi toàn bộ tiến độ đã lưu của mọi người đang chơi (`RunResult.levelId` nằm
 * trong `localStorage`, không có bảng tra nào dịch ngược được). Chèn level mới
 * thì đặt nó ở cuối dãy số (`git-33-…`) rồi chèn vào đúng chỗ trong mảng.
 *
 * Chia file theo chương để ba lane nội dung chạy song song không đụng nhau —
 * `rules/parallel-teammate-git-index-race.md`: hai người ghi một file trong cây
 * dùng chung thì người sau ĐÈ người trước, không conflict marker, không lỗi
 * staging, thường không cả lỗi biên dịch.
 */

import type { GitLevel } from '../contract.ts';

import { G01, G02, G03, G04, G05, G06 } from './c1-01-06.ts';
import { G07, G08, G09, G10, G11, G12 } from './c1-07-12.ts';
import {
  G13,
  G14,
  G15,
  G16,
  G17,
  G18,
  G19,
  G20,
  G21,
  G22,
  G23,
  G24,
} from './c2.ts';
import { G25, G26, G27, G28, G29, G30, G31, G32 } from './c3.ts';

export const GIT_LEVELS: readonly GitLevel[] = [
  G01, G02, G03, G04, G05, G06, G07, G08, G09, G10, G11, G12,
  G13, G14, G15, G16, G17, G18, G19, G20, G21, G22, G23, G24,
  G25, G26, G27, G28, G29, G30, G31, G32,
];

/**
 * Tra một level theo id. `null` khi không có — KHÔNG ném.
 *
 * Không ném vì chỗ gọi chính là một route động (`/games/git/[levelId]`), và một
 * id gõ sai trên thanh địa chỉ phải ra trang 404 chứ không phải một trang lỗi
 * 500. Ném ở đây sẽ biến một URL sai thành một sự cố máy chủ.
 */
export function findGitLevel(id: string): GitLevel | null {
  return GIT_LEVELS.find((level) => level.id === id) ?? null;
}

/** Level của một chương, giữ nguyên thứ tự chơi. */
export function gitLevelsOfChapter(chapter: 1 | 2 | 3): readonly GitLevel[] {
  return GIT_LEVELS.filter((level) => level.chapter === chapter);
}

/*
 * ⛔ KHÔNG khẳng định-lúc-nạp-module ở đây.
 *
 * File này TỪNG gọi `assertLevelsMatchContract()` ở tầng module để bắt lệch giữa
 * `GIT_LEVELS` và `level-ids.ts`. Ý định đúng, chỗ đặt sai, và cái giá chỉ lộ ra
 * khi đo bundle thật:
 *
 * Một lời gọi ở tầng module là **side effect**, và side effect làm cả module
 * không tree-shake được. Module này import cả 32 file level, mỗi file kéo theo
 * engine — nên `packages/games` trở thành một khối không chia được, và MỌI route
 * chạm vào barrel đều cõng nguyên game Git. Đo được 2026-09-14: chunk 369.938 B
 * chứa engine git nằm ở **7 route**, trong đó 6 route không liên quan gì tới game
 * Git (`/games/k8s` và 5 route `problems`). Nó đẩy `/games/k8s` vượt trần ngân
 * sách bundle và làm cổng CI đỏ.
 *
 * Phép kiểm đó **dư thừa hoàn toàn**: `levels.test.ts` đã khẳng định đúng cùng một
 * điều (`expect(GIT_LEVELS.map(l => l.id)).toEqual([...GIT_LEVEL_IDS])`) — cùng số
 * lượng, cùng thứ tự — và nó chạy ở CI. Docblock cũ của chính phép kiểm này cũng
 * đã viết "KHÔNG phải thay cho test".
 *
 * Nên: giữ phép kiểm ở tầng test, bỏ nó khỏi tầng import. Kèm theo đó,
 * `package.json` khai `"sideEffects": false` — lời khai ấy CHỈ đúng khi file này
 * không còn lời gọi nào ở tầng module. Thêm một cái vào đây là làm lời khai đó
 * thành lời nói dối, và bundler sẽ im lặng tin nó.
 */
