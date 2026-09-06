import type { BadgeVariant } from '@devops-platform/ui';
import type { SandboxTierName, ScenarioDifficulty } from '@devops-platform/shared-types/scenario';

export const DIFFICULTY_LABEL: Record<ScenarioDifficulty, string> = {
  beginner: 'Cơ bản',
  intermediate: 'Trung cấp',
  advanced: 'Nâng cao',
};

/**
 * Tier giữ NGUYÊN tên kỹ thuật, không dịch và không kèm lời hứa ("nhẹ hơn",
 * "an toàn hơn"). Ba runtime này khác nhau ở thứ đo được trên hạ tầng cụ thể,
 * và một tính từ dán ở đây sẽ là một khẳng định mà trang danh mục không có dữ
 * liệu để bảo vệ.
 */
export const TIER_LABEL: Record<SandboxTierName, string> = {
  sysbox: 'Sysbox',
  gvisor: 'gVisor',
  kata: 'Kata',
};

export const PROGRESS_STATUS_LABEL: Record<string, string> = {
  'not-started': 'Chưa bắt đầu',
  'in-progress': 'Đang học',
  completed: 'Đã xong',
};

/** Loại danh mục — quyết định danh từ và gợi ý trong trạng thái rỗng. */
export type CatalogKind = 'lessons' | 'labs' | 'playgrounds' | 'paths' | 'quiz';

const NOUN: Record<CatalogKind, string> = {
  lessons: 'bài học',
  labs: 'lab',
  playgrounds: 'sân chơi',
  paths: 'lộ trình',
  quiz: 'bộ câu hỏi',
};

/**
 * Câu nói ra rằng danh sách CÒN TIẾP — kỷ luật "kho nội dung vượt một trang thì
 * NÓI RA, không cắt im lặng" đã có từ 2.D, viết lại cho thời điểm giao diện
 * phân trang đã tồn tại.
 *
 * ⚠ Câu này KHÔNG được khẳng định tổng số mục trong kho. Server trả `nextCursor`
 * (còn hay hết) chứ không trả tổng — một dòng kiểu "5/42 bài" sẽ là con số bịa,
 * đúng hạng lỗi nhãn-khẳng-định-quá-dữ-liệu mà P2 đã trả giá.
 *
 * Trang 1 mà không còn trang sau ⇒ `null`: danh sách trước mắt CHÍNH LÀ toàn bộ
 * kết quả, không có gì để đính chính.
 */
export function describePageScope(args: {
  readonly kind: CatalogKind;
  readonly page: number;
  readonly shown: number;
  readonly hasNext: boolean;
}): string | null {
  const noun = NOUN[args.kind];
  if (args.hasNext) {
    return `Trang ${args.page} · ${args.shown} ${noun}. Danh sách còn tiếp — bấm “Tiếp” để xem phần sau.`;
  }
  if (args.page > 1) {
    return `Trang ${args.page} · ${args.shown} ${noun}. Đây là trang cuối.`;
  }
  return null;
}

/**
 * Cảnh báo phạm vi của SẮP XẾP.
 *
 * Server phân trang keyset theo `id` và KHÔNG nhận tham số sắp xếp (xem báo cáo
 * lane C). Nên mọi thứ tự người dùng chọn chỉ xếp lại đúng những mục **đã tải
 * về trang này**. Khi còn trang sau, im lặng về điều đó sẽ để người dùng tin
 * rằng "bài ngắn nhất" đang nằm ở đầu danh sách trong khi nó có thể ở trang 3.
 *
 * Còn đúng một trang thì sắp xếp trang = sắp xếp toàn bộ kết quả ⇒ không có gì
 * để cảnh báo.
 */
export function describeSortScope(args: {
  readonly sortKey: string;
  readonly shown: number;
  readonly hasNext: boolean;
}): string | null {
  if (args.sortKey === 'default' || !args.hasNext) {
    return null;
  }
  return `Sắp xếp chỉ áp dụng cho ${args.shown} mục của trang này. Máy chủ trả theo thứ tự kho, nên trang sau có thể chứa mục lẽ ra đứng trước.`;
}

export type CatalogEmptyAction =
  | { readonly kind: 'clear-filter' }
  | { readonly kind: 'first-page' }
  | { readonly kind: 'author' }
  | { readonly kind: 'browse'; readonly href: string; readonly label: string };

export interface CatalogEmpty {
  readonly title: string;
  readonly description: string;
  readonly action: CatalogEmptyAction;
}

/**
 * Trạng thái rỗng CÓ ÍCH (13.C task 11) — "một ô trắng là lỗi, không phải một
 * trạng thái".
 *
 * Bốn ca, và chúng KHÁC NHAU ở việc người đọc phải làm gì tiếp:
 *
 * 1. **Đang ở trang > 1** — kho không rỗng, chỉ là trang này vừa hết mục (nội
 *    dung đổi giữa hai lượt tải). Bảo họ về đầu, đừng bảo họ đi soạn bài.
 * 2. **Có bộ lọc bật** — cũng không kết luận được kho rỗng, vì ta chỉ hỏi
 *    server về phần đã lọc. Bảo họ bỏ lọc.
 * 3. **Không lọc + soạn được bài** — kho THẬT SỰ rỗng và người này có quyền sửa
 *    điều đó.
 * 4. **Không lọc + người học** — kho rỗng và họ không làm gì được ở đây; đưa
 *    một đường đi tiếp thay vì một lời xin lỗi.
 *
 * Thứ tự kiểm là một phần của hợp đồng: đảo ca 1 xuống dưới ca 3 sẽ khiến một
 * author ở trang 2 bị mời đi tạo bài mới trong khi kho đầy bài.
 */
export function describeCatalogEmpty(args: {
  readonly kind: CatalogKind;
  readonly page: number;
  readonly hasActiveFilter: boolean;
  readonly canAuthor: boolean;
}): CatalogEmpty {
  const noun = NOUN[args.kind];

  if (args.page > 1) {
    return {
      title: `Trang ${args.page} không còn ${noun} nào`,
      description: 'Nội dung có thể vừa thay đổi kể từ lúc bạn mở trang. Quay về đầu danh sách để xem lại.',
      action: { kind: 'first-page' },
    };
  }

  if (args.hasActiveFilter) {
    return {
      title: `Không có ${noun} nào khớp bộ lọc`,
      description: 'Kho vẫn có thể còn mục khác — bỏ bớt điều kiện lọc để xem rộng hơn.',
      action: { kind: 'clear-filter' },
    };
  }

  if (args.canAuthor) {
    return {
      title: `Chưa có ${noun} nào`,
      description: `Bạn có quyền soạn bài — mở trang Soạn bài để tạo ${noun} đầu tiên, rồi xuất bản để người học thấy nó ở đây.`,
      action: { kind: 'author' },
    };
  }

  return {
    title: `Chưa có ${noun} nào`,
    description: LEARNER_SUGGESTION[args.kind].description,
    action: LEARNER_SUGGESTION[args.kind].action,
  };
}

/**
 * Gợi ý cho người học khi một trụ cột còn trống. Mỗi gợi ý trỏ sang một trụ cột
 * KHÁC — trỏ về chính trang đang rỗng là một vòng lặp, không phải một lối ra.
 */
const LEARNER_SUGGESTION: Record<
  CatalogKind,
  { readonly description: string; readonly action: CatalogEmptyAction }
> = {
  lessons: {
    description: 'Chưa có bài nào được xuất bản. Trong lúc chờ, mở một sân chơi để luyện lệnh trong sandbox trống.',
    action: { kind: 'browse', href: '/playgrounds', label: 'Mở sân chơi' },
  },
  labs: {
    description: 'Chưa có lab nào được xuất bản. Bài học có sẵn phần thực hành từng bước — bắt đầu ở đó trước.',
    action: { kind: 'browse', href: '/lessons', label: 'Xem bài học' },
  },
  playgrounds: {
    description: 'Chưa có sân chơi nào. Bài học cũng mở sandbox riêng, nên bạn vẫn gõ lệnh thật được ở đó.',
    action: { kind: 'browse', href: '/lessons', label: 'Xem bài học' },
  },
  paths: {
    description: 'Chưa có lộ trình nào được xuất bản. Bạn vẫn chọn được từng bài lẻ theo ý mình.',
    action: { kind: 'browse', href: '/lessons', label: 'Xem bài học' },
  },
  quiz: {
    description: 'Chưa có bộ câu hỏi nào được xuất bản. Làm một lab để tự kiểm bằng thao tác thật trước đã.',
    action: { kind: 'browse', href: '/labs', label: 'Xem lab' },
  },
};

// ─── Hình thức: ánh xạ miền dữ liệu → hệ thiết kế ───────────────────────────
//
// Ở đây KHÔNG còn chuỗi class Tailwind nào. Bản đầu của lane này tự dựng chip
// độ khó và huy hiệu trạng thái bằng `bg-*`/`text-*` viết tay, vì lúc đó
// `packages/ui` chưa có gì để dùng. Lane primitive đã hạ cánh (`d636356` badge,
// `c3b92c4` card) và nay SỞ HỮU cả màu lẫn hình của hai thứ đó: `Badge` có bảy
// biến thể ngữ nghĩa kèm icon mặc định, `Card` có `accent` cho dải độ khó.
//
// Giữ bản viết tay song song với chúng là dựng hai nguồn sự thật cho cùng một
// quyết định thị giác, rồi hai cái trôi khác nhau ở lần sửa đầu tiên. Nên thứ
// còn lại dưới đây đúng bằng phần lane primitive CỐ Ý không làm: nối tên miền
// dữ liệu vào tên token.

/**
 * `beginner` (miền) → `basic` (token). Hai từ vựng lệch nhau, và cả hai lane
 * đều cố ý không đổi tên bên mình: `ScenarioDifficulty` là hợp đồng dữ liệu
 * chạy từ P2, `--difficulty-basic` là hợp đồng token 13.A. `badge.tsx` ghi rõ
 * việc nối hai tên đó thuộc về NƠI GỌI — tức là đây, đúng một chỗ.
 *
 * ⚠ Tên là `ACCENT`, KHÔNG phải `STRIPE`. "Dải màu" dịch tự nhiên ra "stripe",
 * nhưng `scripts/check-no-commerce.mjs` bắt chuỗi đó như tên một hãng thanh
 * toán và cổng cấm thương mại đỏ ngay (đã dính, 3 vi phạm). Cổng cố ý không có
 * lối thoát inline, nên đổi định danh của mình chứ không nới mẫu của cổng.
 *
 * ⚠ `satisfies` chứ không phải `Record<ScenarioDifficulty, CardAccent>`:
 * `CardAccent` KHÔNG được `packages/ui/src/index.ts` export (chỉ có
 * `BadgeProps`/`BadgeVariant`). Dạng này giữ được kiểu chữ nghĩa đen, nên nếu
 * lane primitive đổi tên một mức thì lỗi vẫn nổ — ở chỗ gọi `accent={...}`,
 * không phải im lặng.
 */
export const DIFFICULTY_ACCENT = {
  beginner: 'basic',
  intermediate: 'intermediate',
  advanced: 'advanced',
} as const satisfies Record<ScenarioDifficulty, string>;

/** `beginner` → biến thể badge `difficulty-basic`. Cùng chỗ lệch tên như trên. */
export const DIFFICULTY_BADGE: Record<ScenarioDifficulty, BadgeVariant> = {
  beginner: 'difficulty-basic',
  intermediate: 'difficulty-intermediate',
  advanced: 'difficulty-advanced',
};

/**
 * Trạng thái tiến độ → biến thể badge.
 *
 * `Badge` đã gắn sẵn icon riêng cho từng biến thể (vòng rỗng → nút play → dấu
 * tích → ổ khoá), nên bảng này KHÔNG chọn icon: yêu cầu "phân biệt bằng cả màu
 * lẫn hình" được bảo đảm ở tầng primitive, mặc định chứ không opt-in. Chọn lại
 * icon ở đây là lấy một bảo đảm-theo-mặc-định đổi lấy một bảo đảm-nếu-nhớ.
 *
 * ⚠ `not-started` → `status-todo`, KHÔNG phải `status-locked`. Hợp đồng token
 * chỉ có progress/done/locked trong khi miền có bốn giá trị; `status-todo` là
 * biến thể trung tính (`--muted`) mà `badge.tsx` dựng riêng cho ca này. Dán
 * `locked` lên "chưa bắt đầu" là nói với người học rằng họ không được vào — sai
 * nghĩa, và sai theo hướng chặn người ta lại.
 *
 * `status-locked` để nguyên chưa dùng: trang danh mục không khoá mục nào. Nó
 * dành cho lộ trình tuần tự, thuộc `app/paths/[id]` — ngoài lane này.
 */
export const PROGRESS_STATUS_BADGE: Record<string, BadgeVariant> = {
  'not-started': 'status-todo',
  'in-progress': 'status-progress',
  completed: 'status-done',
};

export function describeResultCount(args: {
  readonly kind: CatalogKind;
  readonly shown: number;
  readonly hasNext: boolean;
  readonly hasActiveFilter: boolean;
}): string {
  const noun = NOUN[args.kind];
  const scope = args.hasNext ? ' trong trang này' : '';
  const filtered = args.hasActiveFilter ? ' khớp bộ lọc' : '';
  return `${args.shown} ${noun}${filtered}${scope}`;
}
