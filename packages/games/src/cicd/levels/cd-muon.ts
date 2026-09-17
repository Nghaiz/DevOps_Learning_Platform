/**
 * Chương CD, nửa sau — C22–C28. LANE 2 sở hữu file này và các file `c22-…` →
 * `c28-…`. Không lane nào khác ghi vào đây; `index.ts` do lead gộp.
 *
 * Thứ tự mảng LÀ thứ tự chơi (xem `index.ts`).
 */

import type { CicdLevel } from '../contract.ts';
import { LEVEL_C22 } from './c22-migration-khong-lui.ts';
import { LEVEL_C23 } from './c23-git-la-nguon-that.ts';
import { LEVEL_C24 } from './c24-drift-giua-hai-nhip.ts';
import { LEVEL_C25 } from './c25-tu-sua-va-quyen-so-huu.ts';
import { LEVEL_C26 } from './c26-che-chuoi-da-dang-ky.ts';
import { LEVEL_C27 } from './c27-hotfix-hai-gio-sang.ts';
import { LEVEL_C28 } from './c28-ca-truc-tong-hop.ts';

export const CD_LEVELS_MUON: readonly CicdLevel[] = [LEVEL_C22, LEVEL_C23, LEVEL_C24, LEVEL_C25, LEVEL_C26, LEVEL_C27, LEVEL_C28];
