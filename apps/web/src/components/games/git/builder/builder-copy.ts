/**
 * Cầu nối giữa hai union đóng của `packages/games` và bản đồ chữ của
 * `packages/copy` — §18.E.
 *
 * ## Vì sao là một bảng chứ không phải một chuỗi ghép
 *
 * Viết `` t(`author.builder.issue.${code}`) `` ngắn hơn bảng này đúng mười sáu
 * dòng, và nó vứt đi cả lý do bảng tồn tại: một mã thứ mười bảy thêm vào
 * `DraftIssueCode` sẽ dựng một khoá không có trong bản đồ, `t()` trả
 * `undefined`, và người soạn nhận một dòng TRỐNG ở chỗ đáng lẽ là câu giải
 * thích. Không cổng nào đỏ, vì không có gì sai về kiểu.
 *
 * `satisfies Record<DraftIssueCode, TextKey>` biến đúng lỗi đó thành lỗi biên
 * dịch ở hai chiều: thiếu một mã là đỏ, và một khoá gõ sai cũng đỏ vì `TextKey`
 * chỉ nhận khoá có thật trong `MESSAGES`.
 *
 * ⚠ Cổng này sống ở tầng KIỂU, nên nó ĐỎ Ở `tsc` VÀ XANH Ở `vitest`. Đó là lý do
 * `phase-18-exec.md` §3.1 bắt chạy `typecheck` riêng chứ không chỉ chạy `test`.
 */

import type { TextKey } from '@devops-platform/copy';
import type { BuilderLimit, DraftIssueCode } from '@devops-platform/games';

import type { ProblemSaveIssueCode } from './draft-to-problem';

export const ISSUE_TEXT = {
  'id-trong': 'author.builder.issue.id-trong',
  'id-sai-dinh-dang': 'author.builder.issue.id-sai-dinh-dang',
  'tieu-de-trong': 'author.builder.issue.tieu-de-trong',
  'nhiem-vu-trong': 'author.builder.issue.nhiem-vu-trong',
  'de-bai-trong': 'author.builder.issue.de-bai-trong',
  'khong-co-muc-tieu': 'author.builder.issue.khong-co-muc-tieu',
  'khong-co-muc-tieu-bat-buoc': 'author.builder.issue.khong-co-muc-tieu-bat-buoc',
  'muc-tieu-trung-id': 'author.builder.issue.muc-tieu-trung-id',
  'vi-tu-khong-ton-tai': 'author.builder.issue.vi-tu-khong-ton-tai',
  'thieu-cay-dich': 'author.builder.issue.thieu-cay-dich',
  'khong-co-loi-giai': 'author.builder.issue.khong-co-loi-giai',
  'tap-lenh-rong': 'author.builder.issue.tap-lenh-rong',
  'loi-giai-dung-lenh-ngoai-tap': 'author.builder.issue.loi-giai-dung-lenh-ngoai-tap',
  'par-am': 'author.builder.issue.par-am',
  'trang-thai-dau-hong': 'author.builder.issue.trang-thai-dau-hong',
  'cay-dich-hong': 'author.builder.issue.cay-dich-hong',
} as const satisfies Record<DraftIssueCode, TextKey>;

/**
 * Hai giới hạn mà `phase-18.md` §18.E dặn phải hiện TRÊN MÀN.
 *
 * Nguồn của danh sách là `BUILDER_CANNOT_EXPRESS` bên `packages/games`, không
 * phải một mảng chép tay ở đây — nên câu trên giao diện không trôi khỏi thứ lõi
 * thật sự không diễn đạt được.
 */
export const LIMIT_TEXT = {
  'bot-dong-doi': 'author.builder.limit.bot-dong-doi',
  'nhieu-luot-chay-co-seed': 'author.builder.limit.nhieu-luot-chay-co-seed',
} as const satisfies Record<BuilderLimit, TextKey>;

/**
 * Cầu nối thứ hai: mã lỗi của ĐƯỜNG LƯU (§18.E.5) sang bản đồ chữ.
 *
 * Tách khỏi `ISSUE_TEXT` chứ không gộp, vì hai tập trả lời hai câu khác nhau:
 * `DraftIssueCode` hỏi *"bản nháp đã thành một level chưa"*, còn tập này hỏi
 * *"phần thêm của bài tập đã đủ chưa"*. Gộp làm một sẽ làm danh sách lỗi của
 * đường xuất JSON mọc thêm những câu không liên quan tới nó.
 *
 * Cùng lý do `satisfies` như bảng trên: một mã thứ mười thêm vào
 * `ProblemSaveIssueCode` mà quên câu cho nó là lỗi BIÊN DỊCH, không phải một dòng
 * trống trên màn. Ô gác này sống ở tầng KIỂU nên nó đỏ ở `tsc` và xanh ở `vitest`.
 */
export const SAVE_ISSUE_TEXT = {
  'nhap-con-loi': 'author.builder.save.issue.nhap-con-loi',
  'chua-chon-chu-de': 'author.builder.save.issue.chua-chon-chu-de',
  'qua-nhieu-chu-de': 'author.builder.save.issue.qua-nhieu-chu-de',
  'chu-de-la': 'author.builder.save.issue.chu-de-la',
  'gia-goi-y-lech-so-luong': 'author.builder.save.issue.gia-goi-y-lech-so-luong',
  'gia-goi-y-ngoai-khoang': 'author.builder.save.issue.gia-goi-y-ngoai-khoang',
  'co-hien-lech-so-luong': 'author.builder.save.issue.co-hien-lech-so-luong',
  'slug-rong': 'author.builder.save.issue.slug-rong',
  'slug-qua-dai': 'author.builder.save.issue.slug-qua-dai',
} as const satisfies Record<ProblemSaveIssueCode, TextKey>;
