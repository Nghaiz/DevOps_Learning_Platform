import type { CicdLevel } from '../contract.ts';

import { c08 } from './c08-khoa-cache-qua-hep.ts';
import { c09 } from './c09-mot-luot-xanh-khong-chung-minh-gi.ts';
import { c10 } from './c10-retry-khong-cuu-duoc-do-that.ts';
import { c11 } from './c11-chay-lai-che-mat-loi-that.ts';
import { c12 } from './c12-ma-tran-quat-ra.ts';
import { c13 } from './c13-gom-ket-qua-nhieu-nhanh.ts';
import { c14 } from './c14-toi-uu-ba-truc.ts';

/**
 * Bảy level **sau** của chương CI — C08 tới C14.
 *
 * ## Vì sao chương CI có HAI mảng chứ không một
 *
 * `ci-som.ts` (C01–C07) và file này được viết SONG SONG bởi hai lane trong cùng
 * một cây làm việc. Một `index.ts` gộp sẵn sẽ là một file thuộc về không lane
 * nào, và kho này đã trả giá cho đúng hình dạng đó một lần rồi:
 * `packages/copy/src/registry.ts` ghi thẳng rằng hai lượt ghi vào một file
 * không ai sở hữu sẽ **đè nhau** — không dấu xung đột, không lỗi biên dịch, chỉ
 * mất một nửa công việc trong im lặng.
 *
 * Nên mỗi lane sở hữu đúng một mảng, và **lead** ghép hai mảng trong `index.ts`
 * sau khi cả hai xong. Test của lane này import thẳng từ đây, không qua index —
 * nhờ vậy nó chạy được và có nghĩa trước khi file gộp tồn tại.
 *
 * ## Thứ tự trong mảng LÀ thứ tự chơi
 *
 * Và nó không tuỳ tiện: C09 phải đứng trước C10 và C11 vì cả hai level sau đều
 * dựng trên kết luận "thử lại là công cụ tốt" mà C09 vừa dạy — C10 cho thấy nó
 * vô dụng với đỏ thật, C11 cho thấy nó nguy hiểm với lỗi tiềm ẩn. Đảo thứ tự
 * thì hai level sau mất mất cái phản xạ mà chúng tồn tại để bẻ.
 *
 * C12 (quạt ra) phải đứng trước C13 (gom lại) vì không có ma trận thì không có
 * gì để gom. C14 là level cuối và là level duy nhất không ghim lời giải vào một
 * hình dạng nào.
 *
 * ⛔ Số trong `id` là ĐỊNH DANH, không phải vị trí. Đánh số lại một level là mồ
 * côi toàn bộ tiến độ đã lưu của mọi người đang chơi — không lỗi, không cảnh
 * báo, chỉ là lịch sử biến mất.
 */
export const CI_LEVELS_MUON: readonly CicdLevel[] = [c08, c09, c10, c11, c12, c13, c14];
