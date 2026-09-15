/**
 * ⛔ CHỈ L0 SỬA FILE NÀY. Bảy lane 16.B..16.H không được chạm vào nó, kể cả để
 * thêm đúng một dòng.
 *
 * Lý do là cơ học chứ không phải thủ tục. `registry.ts` cùng hạng rủi ro với
 * `packages/ui/src/index.ts` và `e2e/routes.ts`: nó không thuộc về lane nào, và
 * bảy lane chạy ở bảy worktree khác nhau chia CHUNG một cây làm việc. Hai lượt
 * ghi thì lượt sau ĐÈ lượt trước, không dấu xung đột, không lỗi biên dịch, và
 * surface bị mất chỉ lộ ra khi ai đó nhận thấy chuỗi của mình không hiện.
 *
 * Vì vậy L0 đăng ký sẵn CẢ MƯỜI surface ngay từ đầu, kể cả tám cái còn rỗng.
 * Lane chỉ mở file surface của mình và ghi vào đó; không có thao tác nào của
 * lane cần tới file này.
 *
 * Thêm một surface thứ mười một là việc của L0, và phải làm ba thứ cùng lúc:
 * tạo file trong `surfaces/`, thêm vào `SURFACES` VÀ `MESSAGES` VÀ
 * `INTENTIONAL_THREE`, thêm tiền tố vào `SURFACE_PREFIXES`. Bỏ sót bất kỳ bước
 * nào là đỏ ở T0 hoặc T5, không phải im lặng.
 */

import type { IntentionalThree } from './types.ts';

import { admin, adminIntentionalThree } from './surfaces/admin.ts';
import { auth, authIntentionalThree } from './surfaces/auth.ts';
import { author, authorIntentionalThree } from './surfaces/author.ts';
import { catalog, catalogIntentionalThree } from './surfaces/catalog.ts';
import { common, commonIntentionalThree } from './surfaces/common.ts';
import { error, errorIntentionalThree } from './surfaces/error.ts';
import { exam, examIntentionalThree } from './surfaces/exam.ts';
import { home, homeIntentionalThree } from './surfaces/home.ts';
import { me, meIntentionalThree } from './surfaces/me.ts';
import { problem, problemIntentionalThree } from './surfaces/problem.ts';
import { session, sessionIntentionalThree } from './surfaces/session.ts';
import { shell, shellIntentionalThree } from './surfaces/shell.ts';

/**
 * Bản đồ surface, giữ TỪNG surface tách rời.
 *
 * T0 suy ra danh sách file mong đợi trong `surfaces/` từ đúng khoá của object
 * này, nên đổi tên thư mục hay quên tạo file là đỏ ngay, thay vì im lặng bỏ một
 * surface ra khỏi mọi cổng. T5 dùng nó để cộng số khoá từng phần và so với tổng.
 */
export const SURFACES = {
  common,
  error,
  shell,
  auth,
  catalog,
  session,
  home,
  admin,
  author,
  problem,
  me,
  exam,
} as const;

/**
 * Tiền tố hợp lệ của từng surface, khai tường minh thay vì suy ra từ tên file.
 *
 * Chín surface có đúng một tiền tố trùng tên file. `common` có hai, vì bảng sở
 * hữu §6.1 giao L0 ba tiền tố (`common.` `error.` `unit.`) nhưng chỉ hai file.
 * Khai ra ở đây để T5 kiểm được tính duy nhất trên TIỀN TỐ THẬT chứ không phải
 * trên tên file, và để `unit.` không trở thành một tiền tố lậu mà không cổng nào
 * biết tới.
 */
export const SURFACE_PREFIXES = {
  common: ['common', 'unit'],
  error: ['error'],
  shell: ['shell'],
  auth: ['auth'],
  catalog: ['catalog'],
  session: ['session'],
  home: ['home'],
  admin: ['admin'],
  author: ['author'],
  problem: ['problem'],
  me: ['me'],
  exam: ['exam'],
} as const satisfies Readonly<Record<keyof typeof SURFACES, readonly string[]>>;

/**
 * Bản đồ phẳng. `CopyKey` suy ra trực tiếp từ đây.
 *
 * Khoá trùng giữa hai surface là bất khả thi vì tiền tố duy nhất, nhưng nếu nó
 * xảy ra thì phép spread sẽ NUỐT một bên trong im lặng. Đó là lý do T5 cộng số
 * khoá từng surface rồi so với `Object.keys(MESSAGES).length`: phép cộng đó là
 * thứ duy nhất nói ra.
 */
export const MESSAGES = {
  ...common,
  ...error,
  ...shell,
  ...auth,
  ...catalog,
  ...session,
  ...home,
  ...admin,
  ...author,
  ...problem,
  ...me,
  ...exam,
} as const;

export type CopyKey = keyof typeof MESSAGES;

/**
 * Khai báo "đúng ba mục này là cố ý", gộp từ bảng riêng của từng surface.
 *
 * Gộp ở đây chứ không khai ở đây: một lane khai ngoại lệ của mình trong chính
 * file surface nó sở hữu, nên không lane nào phải mở `registry.ts`.
 */
export const INTENTIONAL_THREE: IntentionalThree = {
  ...commonIntentionalThree,
  ...errorIntentionalThree,
  ...shellIntentionalThree,
  ...authIntentionalThree,
  ...catalogIntentionalThree,
  ...sessionIntentionalThree,
  ...homeIntentionalThree,
  ...adminIntentionalThree,
  ...authorIntentionalThree,
  ...problemIntentionalThree,
  ...meIntentionalThree,
  ...examIntentionalThree,
};

/**
 * Bảng `<tên surface> -> <bảng intentionalThree của riêng nó>`, để T3 kiểm được
 * từng surface độc lập và để thông báo lỗi chỉ đúng file cần sửa.
 */
export const SURFACE_INTENTIONAL_THREE = {
  common: commonIntentionalThree,
  error: errorIntentionalThree,
  shell: shellIntentionalThree,
  auth: authIntentionalThree,
  catalog: catalogIntentionalThree,
  session: sessionIntentionalThree,
  home: homeIntentionalThree,
  admin: adminIntentionalThree,
  author: authorIntentionalThree,
  problem: problemIntentionalThree,
  me: meIntentionalThree,
  exam: examIntentionalThree,
} as const satisfies Readonly<Record<keyof typeof SURFACES, IntentionalThree>>;
