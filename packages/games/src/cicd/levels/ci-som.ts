/**
 * Bảy level ĐẦU của chương CI (C01–C07) — nửa "sớm" của chương.
 *
 * ⛔ File này cố ý KHÔNG phải `levels/index.ts`. Hai lane viết nội dung chương CI
 * song song trong cùng một cây làm việc, và một file chung sẽ bị lượt ghi sau ĐÈ
 * lượt ghi trước: không dấu xung đột, không lỗi biên dịch, và một nửa số level
 * biến mất trong im lặng (`rules/parallel-teammate-git-index-race.md`; cùng bài
 * học mà `packages/copy/src/registry.ts` đã ghi lại cho chính nó).
 *
 * Nên mỗi lane giữ một mảng riêng trong file riêng — `ci-som.ts` cho C01–C07,
 * `ci-muon.ts` cho C08–C14 — và lead gộp hai mảng ở `levels/index.ts` sau khi cả
 * hai lane xong. Không lane nào chạm file gộp, nên không có gì để đè nhau.
 *
 * ## Thứ tự mảng LÀ thứ tự chơi
 *
 * Con số trong `id` là ĐỊNH DANH, không phải vị trí. Đánh số lại một level là mồ
 * côi toàn bộ tiến độ đã lưu của mọi người đang chơi (`RunResult.levelId` nằm
 * trong localStorage, không có bảng tra nào dịch ngược được). Chèn level mới thì
 * lấy số ở cuối dãy rồi đặt vào đúng chỗ trong mảng.
 *
 * ## Mạch dạy của bảy level
 *
 * | Level | Dạy gì | Người chơi sửa được |
 * |---|---|---|
 * | C01 | Stage và bước là hai tầng khác nhau | stage, cạnh |
 * | C02 | Cạnh phụ thuộc vừa là thứ tự vừa là đường đi của sản phẩm | cạnh |
 * | C03 | Song song trên giấy khác song song trên máy | cạnh, stage |
 * | C04 | Đường găng — cái gì đáng rút ngắn và cái gì không | cạnh, stage |
 * | C05 | Việc không chặn, ở hai tầng khác nhau | dấu chặn |
 * | C06 | Cache tiết kiệm đúng bằng bước nó đứng | cache |
 * | C07 | Khoá quá rộng ⇒ không bao giờ trúng, và hỏng im lặng | cache, stage |
 *
 * C06 → C07 là một cặp cố ý: C06 dạy rằng một phần khoá RỘNG mà ỔN ĐỊNH thì vô
 * hại (lời giải phụ của nó khoá thêm `cau-hinh` và vẫn trúng y nguyên), rồi C07
 * dạy rằng một phần khoá rộng mà ĐỔI MỖI COMMIT thì giết cache. Không có vế đầu,
 * người học rút ra bài "khoá càng hẹp càng tốt" — và bài đó sai, C08 (lane kia)
 * sẽ tính sổ với nó.
 *
 * ⚠ KHÔNG gọi hàm nào ở tầng module trong file này. `package.json` khai
 * `"sideEffects": false`, và một lời gọi ở tầng module biến lời khai đó thành lời
 * nói dối — bundler sẽ im lặng tin, rồi mọi route chạm vào barrel đều cõng cả
 * engine. Phép kiểm thuộc về `ci-som.test.ts`, không thuộc về đây
 * (`git/levels/index.ts` đã trả giá cho bài này ngày 2026-09-14).
 */

import type { CicdLevel } from '../contract.ts';

import { c01 } from './c01-mot-job-mot-step.ts';
import { c02 } from './c02-canh-phu-thuoc.ts';
import { c03 } from './c03-song-song-tren-may.ts';
import { c04 } from './c04-duong-gang.ts';
import { c05 } from './c05-viec-khong-chan.ts';
import { c06 } from './c06-cache-la-buffer.ts';
import { c07 } from './c07-khoa-cache-qua-rong.ts';

export const CI_LEVELS_SOM: readonly CicdLevel[] = [c01, c02, c03, c04, c05, c06, c07];
