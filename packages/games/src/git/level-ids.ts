/**
 * 32 ĐỊNH DANH LEVEL của game Git — **hợp đồng đóng băng**.
 *
 * ⛔ LEAD SỞ HỮU. Năm lane đọc file này cùng lúc: ba lane viết level (chương 1,
 * 2, 3), hai lane viết bài lý thuyết. Một id đổi lén = bài lý thuyết trỏ vào
 * khoảng không, và phép kiểm chéo §17.M.2 đỏ ở chiều mà không ai ngờ.
 *
 * ⛔ **Con số trong id là ĐỊNH DANH, không phải VỊ TRÍ chơi.** Thứ tự chơi là
 * thứ tự mảng `GIT_LEVELS` trong `levels/index.ts`. Đánh số lại một level là
 * **mồ côi toàn bộ tiến độ đã lưu** của mọi người đang chơi —
 * `RunResult.levelId` nằm trong `localStorage` và không có bảng tra nào dịch
 * ngược được. Không lỗi, không cảnh báo, chỉ là lịch sử biến mất. Chèn level mới
 * thì đặt nó ở CUỐI dãy số (`git-33-…`) rồi chèn vào đúng chỗ trong mảng.
 *
 * Bản đồ chủ đề: `plans/reports/2026-09-11-brainstorm-git-cicd-games.md` §3.4.
 *
 * Quy ước id bài lý thuyết: bỏ tiền tố `git-`, giữ nguyên phần còn lại. File
 * nằm ở `content/games/git/theory/<theoryId>.md`. Ánh xạ một-một này cố ý —
 * một bảng tra thứ hai giữa level và bài đọc là một chỗ nữa để lệch.
 */

/** Chương 1 — Nắn lịch sử. Một kho. Trục Y chưa dùng đến. */
export const CHAPTER_1_LEVEL_IDS = [
  'git-01-commit-la-object',
  'git-02-ba-vung',
  'git-03-add-khong-phai-tao-file',
  'git-04-nhanh-la-con-tro',
  'git-05-head-va-detached',
  'git-06-tham-chieu-tuong-doi',
  'git-07-merge-hai-cha',
  'git-08-rebase-viet-lai',
  'git-09-reset-ba-kieu',
  'git-10-revert-khac-reset',
  'git-11-cherry-pick-mat-gi',
  'git-12-rebase-tuong-tac',
] as const;

/** Chương 2 — Làm việc nhóm. Hai kho, nội dung file thật, bot đồng đội. */
export const CHAPTER_2_LEVEL_IDS = [
  'git-13-clone-kho-thu-hai',
  'git-14-origin-main-hay-origin-main',
  'git-15-fetch-khac-pull',
  'git-16-push-bi-tu-choi',
  'git-17-conflict-dau-tien',
  'git-18-conflict-khong-phai-loi',
  'git-19-rebase-truoc-khi-push',
  'git-20-force-push-huy-viec',
  'git-21-force-with-lease',
  'git-22-stash-khi-chuyen-nhanh',
  'git-23-vong-pr',
  'git-24-ba-nut-merge',
] as const;

/** Chương 3 — Cứu hộ. Sống nhờ `ObjectStore` không bao giờ xoá. */
export const CHAPTER_3_LEVEL_IDS = [
  'git-25-reflog-nhat-ky-dich-chuyen',
  'git-26-cuu-sau-reset-hard',
  'git-27-cuu-nhanh-da-xoa',
  'git-28-thoat-detached-head',
  'git-29-rebase-do-dang',
  'git-30-stash-that-lac',
  'git-31-cuu-viec-bi-force-push',
  'git-32-bisect-tim-commit-hong',
] as const;

/** Toàn bộ 32 id, theo THỨ TỰ CHƠI. */
export const GIT_LEVEL_IDS = [
  ...CHAPTER_1_LEVEL_IDS,
  ...CHAPTER_2_LEVEL_IDS,
  ...CHAPTER_3_LEVEL_IDS,
] as const;

export type GitLevelId = (typeof GIT_LEVEL_IDS)[number];

/**
 * id bài lý thuyết tương ứng một level.
 *
 * Hàm chứ không phải bảng: một bảng 32 dòng là 32 cơ hội gõ nhầm, và phép chiếu
 * ở đây là thuần cú pháp nên không có gì để tra.
 */
export function theoryIdForLevel(levelId: string): string {
  return levelId.startsWith('git-') ? levelId.slice('git-'.length) : levelId;
}

/** 32 id bài lý thuyết, cùng thứ tự với `GIT_LEVEL_IDS`. */
export const GIT_THEORY_IDS: readonly string[] = GIT_LEVEL_IDS.map(theoryIdForLevel);
