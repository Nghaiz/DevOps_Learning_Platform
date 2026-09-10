import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `error.`, sở hữu bởi L0.
 *
 * Bốn mục dưới đây thay bốn literal ở `apps/web/src/server/trpc/init.ts` (dòng
 * 153, 162, 176, 191, 206), và nội dung của chúng do §4 của hợp đồng chốt từng
 * chữ. Đừng viết lại cho gọn: mỗi câu đang trả lời một câu hỏi mà người dùng
 * thật sẽ hỏi, và §4 ghi rõ câu hỏi đó là gì.
 *
 * Khuôn chung:
 *   what:  chuyện gì đã xảy ra, nói về hành động của người đọc
 *   next:  <động từ mở đầu> việc làm được ngay. <đường thứ hai nếu việc đầu hỏng>
 *   code:  mã dán vào phiếu hỗ trợ, tuỳ chọn, không bao giờ đứng một mình
 *
 * `what` không nhắc tên hàm, tên bảng, tên biến, hay mã trạng thái HTTP. `next`
 * không được là "thử lại sau" nếu không nói được sau bao lâu.
 *
 * ⚠ Chuyển từ `init.ts:147-150`, nguyên văn vì nó là lý do trường `message`
 * không bao giờ được để trống:
 *
 *   `message` là BẮT BUỘC, không phải trang trí: constructor của tRPC v11 rơi
 *   về `opts.code` khi thiếu nó, nên người dùng nhận đúng chuỗi `UNAUTHORIZED`,
 *   tiếng Anh, viết hoa, không nói phải làm gì. Đây là chỗ DUY NHẤT trong 94
 *   lượt `new TRPCError` của repo từng thiếu `message`.
 *
 * Qua dây: server ném `new TRPCError({ code: 'FORBIDDEN', message:
 * errText('error.authz.need-author') })`. `errText` ghép hai nửa bằng một dấu
 * cách, nên người dùng nhận đủ cả hai dù tRPC chỉ chở được một chuỗi. Việc chở
 * KHOÁ qua dây để client tự dựng hai nửa là NGOÀI phạm vi P16: nó cần một
 * envelope lỗi có cấu trúc ở cả hai đầu. Ghi ra đây để không ai tưởng đã có.
 */
export const error = {
  /**
   * `init.ts:153` vốn đã thoả luật hai câu và vẫn phải chuyển vào bản đồ: một
   * literal đúng vẫn là một literal, và bộ dò T4 không phân biệt được đúng với
   * sai.
   */
  'error.auth.unauthenticated': {
    what: 'Bạn chưa đăng nhập, hoặc phiên đăng nhập đã hết hạn.',
    next: 'Đăng nhập lại rồi làm lại thao tác vừa rồi. Nếu bạn vừa đăng nhập xong mà vẫn thấy dòng này, tải lại trang một lần để lấy phiên mới.',
    code: 'UNAUTHORIZED',
  },

  /**
   * Nơi gọi truyền `TRPC_MUTATION_LIMIT_PER_MIN` và `RATE_LIMIT_WINDOW_MS /
   * 1000` vào. Con số KHÔNG BAO GIỜ gõ lại trong bản đồ: middleware là nơi thực
   * thi hạn mức, nên middleware là nguồn sự thật của con số, và một con số gõ
   * lại ở đây là nguồn sự thật thứ hai cho cùng một hằng.
   *
   * Câu thứ hai của `next` trả lời câu hỏi người dùng thật sẽ hỏi: bucket khoá
   * theo `(type, userId)`, nên nhiều tab cộng dồn vào một hạn mức.
   */
  'error.rate.trpc': (p: { limit: number; windowSec: number }) => ({
    what: `Bạn đã dùng hết ${p.limit} lượt thao tác cho ${p.windowSec} giây gần đây.`,
    next: `Chờ ${p.windowSec} giây rồi bấm lại. Nếu bạn không bấm liên tục, hãy đóng bớt tab đang mở cùng tài khoản này, vì mọi tab dùng chung một hạn mức.`,
    retryAfterSec: p.windowSec,
  }),

  /**
   * `next` chỉ nhắc thứ người dùng đang cầm trong tay, tức đường dẫn trên thanh
   * địa chỉ. Không nhắc id tài nguyên: `assertOwnerOrAdmin` không nhận id, nên
   * hứa hiện id ra là hứa một dữ liệu không có ở đó.
   */
  'error.authz.not-owner': {
    what: 'Mục này thuộc về một tài khoản khác nên bạn không mở được.',
    next: 'Mở danh sách của bạn ở trang Bài của tôi. Nếu bạn cho rằng đây là mục của mình, gửi đường dẫn trang này cho quản trị viên.',
    code: 'FORBIDDEN',
  },

  'error.authz.need-author': {
    what: 'Tài khoản của bạn đang ở vai trò Người học, mà trang soạn bài chỉ mở cho vai trò Tác giả và Quản trị.',
    next: 'Gửi yêu cầu nâng vai trò cho quản trị viên kèm email đăng nhập của bạn. Trong lúc chờ, bạn vẫn làm được mọi bài học và lab.',
    code: 'FORBIDDEN',
  },

  /**
   * Chuyển theo hiểu nhầm mà chú thích ở `init.ts:196-203` đã ghi: Tác giả
   * KHÔNG phải một nấc thấp hơn Quản trị trên cùng một thang. Quản trị là một
   * quyền riêng, nên câu `what` phải nói ra điều đó chứ không để người đọc suy.
   */
  'error.authz.need-admin': {
    what: 'Trang quản trị chỉ mở cho vai trò Quản trị. Vai trò Tác giả không bao gồm quyền này, kể cả khi bạn soạn được bài.',
    next: 'Quay lại trang chủ. Nếu bạn cần một thao tác quản trị cụ thể, nhắn cho quản trị viên kèm tên thao tác đó.',
    code: 'FORBIDDEN',
  },
} as const satisfies Surface<'error'>;

export const errorIntentionalThree = {
  'error.authz':
    '2026-09-10: đúng ba cổng phân quyền tồn tại trong apps/web/src/server/trpc/init.ts (assertOwnerOrAdmin, authorProcedure, adminProcedure), mỗi cổng một thông báo. Cổng thứ tư nào cũng phải thêm vào init.ts trước, và lúc đó nhóm này thôi là ba.',
} as const satisfies IntentionalThree;
