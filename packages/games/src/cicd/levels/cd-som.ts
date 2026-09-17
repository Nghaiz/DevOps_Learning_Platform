/**
 * Chương CD, nửa đầu — C15–C21. LANE 1 sở hữu file này và các file `c15-…` →
 * `c21-…`. Không lane nào khác ghi vào đây; `index.ts` do lead gộp.
 *
 * Thứ tự mảng LÀ thứ tự chơi (xem `index.ts`).
 */

import type { CicdLevel } from '../contract.ts';
import { LEVEL_C15 } from './c15-artifact-co-danh-tinh.ts';
import { LEVEL_C16 } from './c16-thang-hang-dung-dung-lai.ts';
import { LEVEL_C17 } from './c17-cong-duyet-prod.ts';
import { LEVEL_C18 } from './c18-rolling-tung-dot.ts';
import { LEVEL_C19 } from './c19-blue-green-doi-bo-chon.ts';
import { LEVEL_C20 } from './c20-canary-gioi-han-luu-luong.ts';
import { LEVEL_C21 } from './c21-doc-tin-hieu-canary.ts';

export const CD_LEVELS_SOM: readonly CicdLevel[] = [
  LEVEL_C15, LEVEL_C16, LEVEL_C17, LEVEL_C18, LEVEL_C19, LEVEL_C20, LEVEL_C21,
];
