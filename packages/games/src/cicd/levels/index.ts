/**
 * Chương CI — 14 level, gộp từ hai nửa.
 *
 * ## Vì sao file này do LEAD viết, không lane nào
 *
 * Hai lane viết C01–C07 và C08–C14 song song trong cùng một worktree. Một file
 * gộp mà cả hai cùng ghi là đúng cái bẫy `packages/copy/src/registry.ts` đã ghi
 * thành văn trong chính nó: hai lượt ghi thì lượt sau ĐÈ lượt trước, không dấu
 * xung đột, không lỗi biên dịch, và bảy level biến mất trong im lặng cho tới khi
 * ai đó tình cờ nhận ra chương này ngắn đi một nửa.
 *
 * Nên mỗi lane chỉ ghi mảng của mình (`ci-som.ts` / `ci-muon.ts`) và không lane
 * nào chạm file này. Thêm một nửa thứ ba là việc của lead, và phải làm cùng lúc
 * ba thứ: tạo file mảng, thêm vào `CI_LEVELS` dưới đây, và nới ô ghim số lượng
 * trong `index.test.ts`. Bỏ sót bước nào cũng ĐỎ chứ không im lặng.
 *
 * ## Thứ tự mảng LÀ thứ tự chơi
 *
 * Khác với `WorkflowSpec.stages` (thứ tự mảng chỉ để trình bày), ở đây thứ tự
 * mang nghĩa: người chơi đi từ C01 tới C14, và mỗi level dựng trên khái niệm
 * của level trước. C07 (khoá quá rộng) và C08 (khoá quá hẹp) là một cặp dạy hai
 * hướng sai ngược nhau, nên chúng phải cạnh nhau và đúng thứ tự đó.
 */

import type { CicdLevel } from '../contract.ts';
import { CI_LEVELS_SOM } from './ci-som.ts';
import { CI_LEVELS_MUON } from './ci-muon.ts';
import { CD_LEVELS_SOM } from './cd-som.ts';
import { CD_LEVELS_MUON } from './cd-muon.ts';

export { CI_LEVELS_SOM } from './ci-som.ts';
export { CI_LEVELS_MUON } from './ci-muon.ts';
export { CD_LEVELS_SOM } from './cd-som.ts';
export { CD_LEVELS_MUON } from './cd-muon.ts';

/** Cả chương CI, theo thứ tự chơi. */
export const CI_LEVELS: readonly CicdLevel[] = [...CI_LEVELS_SOM, ...CI_LEVELS_MUON];

/** Cả chương CD (19.G), theo thứ tự chơi. Hai nửa do hai lane viết, cùng luật gộp như chương CI. */
export const CD_LEVELS: readonly CicdLevel[] = [...CD_LEVELS_SOM, ...CD_LEVELS_MUON];

/**
 * Cả game, CI trước CD. Màn chơi và danh mục đọc cái NÀY — đọc `CI_LEVELS` ở tầng
 * giao diện là giấu chương CD mà không lỗi nào báo.
 */
export const CICD_LEVELS: readonly CicdLevel[] = [...CI_LEVELS, ...CD_LEVELS];
