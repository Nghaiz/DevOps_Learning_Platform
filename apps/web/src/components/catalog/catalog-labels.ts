import { t, type Params, type TextKey } from '@devops-platform/copy';
import type { BadgeVariant } from '@devops-platform/ui';
import type { SandboxTierName, ScenarioDifficulty } from '@devops-platform/shared-types/scenario';

/**
 * Quyết định BIÊN TẬP của trang danh mục: nói câu nào, mở lối nào.
 *
 * ## Chữ không còn ở đây, chỉ còn nhánh
 *
 * Mọi chuỗi hiển thị đã chuyển sang `packages/copy/src/surfaces/catalog.ts`.
 * Thứ ở lại là các hàm CHỌN, và chúng trả về `CopyRef` (`{ key, params }`) chứ
 * không trả về câu đã ghép, theo §1.6 của `contracts/p16-copy.md`:
 *
 *     // SAI: bộ dò chỉ nhìn thấy nhánh mà probe đi vào.
 *     export function describeCatalogEmpty(args): string;
 *
 *     // ĐÚNG: mọi nhánh là một khoá tĩnh, bộ dò quét được toàn bộ.
 *     export function describeCatalogEmpty(args): { key, params };
 *
 * Đây không phải chuyện phong cách. Một hàm ghép câu tại chỗ thì cổng gạch
 * ngang dài và cổng mất dấu chỉ soi được nhánh mà test gọi tới, còn nhánh kia
 * đi thẳng ra người dùng không qua cổng nào.
 *
 * ## Vì sao các hàm này KHÔNG nằm trong `packages/copy`
 *
 * Hợp đồng §1.6 nói chúng đi cùng sang đó. Chúng không sang được:
 * `packages/copy/package.json` khai đúng bốn lối vào (`.`, `./types`,
 * `./registry`, `./scan`) và không lối nào chở được một hàm khai trong
 * `surfaces/`; mở thêm một lối phải sửa `package.json` hoặc `t.ts`, hai file mà
 * §6.1 khoá cho L0. Thứ §1.6 thật sự mua là "mọi nhánh là một mục tĩnh trong
 * bản đồ", và điều đó đạt đủ khi bản đồ ở bên kia còn nhánh ở bên này: bộ dò
 * đọc bản đồ, không đọc bộ chọn.
 */

/**
 * Một tham chiếu tới bản đồ thông điệp: khoá cộng tham số, chưa dựng thành câu.
 *
 * ⚠ Kiểu này CỐ Ý mất phần kiểm tham số ở tầng biên dịch. `t('catalog.pager.page')`
 * viết thẳng thì TypeScript đòi đúng `{ page: number }`; đi qua `CopyRef` thì
 * `params` chỉ còn là `Params`. Đó là cái giá của việc một hàm chọn trả về
 * nhiều khoá có chữ ký khác nhau, và nó được bù bằng test: mỗi nhánh của mỗi bộ
 * chọn có một ca DỰNG RA CÂU và so với chữ thật, nên một tham số sai tên hiện
 * ra ngay dưới dạng chuỗi thiếu chỗ chứ không lọt.
 *
 * Khoá thì VẪN được kiểm: `TextKey` là union các khoá chữ có thật, nên gõ sai
 * tên khoá là lỗi biên dịch.
 */
export interface CopyRef {
  readonly key: TextKey;
  readonly params?: Params;
}

/**
 * Dựng một `CopyRef` thành câu.
 *
 * Một phép ép kiểu, ở đúng MỘT chỗ, và nó an toàn lúc chạy: `t()` tự phân biệt
 * mục tĩnh với mục động bằng `typeof entry === 'function'`, nên truyền thừa
 * tham số cho một mục tĩnh không gây gì, và truyền đúng tham số cho một mục
 * động thì chạy đúng.
 */
export function renderCopy(ref: CopyRef): string {
  const call = t as unknown as (key: TextKey, params?: Params) => string;
  return ref.params === undefined ? call(ref.key) : call(ref.key, ref.params);
}

/** Loại danh mục. Tập cố định, đúng 5 giá trị. */
export type CatalogKind = 'lessons' | 'labs' | 'playgrounds' | 'paths' | 'quiz';

const NOUN_KEY = {
  lessons: 'catalog.noun.lessons',
  labs: 'catalog.noun.labs',
  playgrounds: 'catalog.noun.playgrounds',
  paths: 'catalog.noun.paths',
  quiz: 'catalog.noun.quiz',
} as const satisfies Record<CatalogKind, TextKey>;

/** Danh từ của một loại danh mục, đã dựng thành chữ (nó là THAM SỐ của câu khác). */
export function catalogNoun(kind: CatalogKind): string {
  return t(NOUN_KEY[kind]);
}

const TITLE_KEY = {
  lessons: 'catalog.title.lessons',
  labs: 'catalog.title.labs',
  playgrounds: 'catalog.title.playgrounds',
  paths: 'catalog.title.paths',
  quiz: 'catalog.title.quiz',
} as const satisfies Record<CatalogKind, TextKey>;

const LEAD_KEY = {
  lessons: 'catalog.lead.lessons',
  labs: 'catalog.lead.labs',
  playgrounds: 'catalog.lead.playgrounds',
  paths: 'catalog.lead.paths',
  quiz: 'catalog.lead.quiz',
} as const satisfies Record<CatalogKind, TextKey>;

const ERROR_TITLE_KEY = {
  lessons: 'catalog.error-title.lessons',
  labs: 'catalog.error-title.labs',
  playgrounds: 'catalog.error-title.playgrounds',
  paths: 'catalog.error-title.paths',
  quiz: 'catalog.error-title.quiz',
} as const satisfies Record<CatalogKind, TextKey>;

export function catalogTitle(kind: CatalogKind): string {
  return t(TITLE_KEY[kind]);
}

export function catalogLead(kind: CatalogKind): string {
  return t(LEAD_KEY[kind]);
}

export function catalogErrorTitle(kind: CatalogKind): string {
  return t(ERROR_TITLE_KEY[kind]);
}

const DIFFICULTY_KEY = {
  beginner: 'common.difficulty.beginner',
  intermediate: 'common.difficulty.intermediate',
  advanced: 'common.difficulty.advanced',
} as const satisfies Record<ScenarioDifficulty, TextKey>;

/**
 * Ba mức độ khó đọc từ `common.`, KHÔNG từ `catalog.`.
 *
 * Chúng xuất hiện ở nhiều surface (danh mục, khoang lab, trang soạn bài), và
 * §1.7 đặt chuỗi dùng từ hai surface trở lên vào `common.` với L0 là người
 * thêm. Chép một bản `catalog.difficulty.*` sang đây là dựng nguồn sự thật thứ
 * hai cho một hợp đồng dữ liệu.
 */
export function difficultyLabel(level: ScenarioDifficulty): string {
  return t(DIFFICULTY_KEY[level]);
}

const TIER_KEY = {
  sysbox: 'catalog.tier.sysbox',
  gvisor: 'catalog.tier.gvisor',
  kata: 'catalog.tier.kata',
} as const satisfies Record<SandboxTierName, TextKey>;

export function tierLabel(tier: SandboxTierName): string {
  return t(TIER_KEY[tier]);
}

export const PROGRESS_STATUS_KEY: Readonly<Record<string, TextKey>> = {
  'not-started': 'catalog.status.not-started',
  'in-progress': 'catalog.status.in-progress',
  completed: 'catalog.status.completed',
};

/**
 * Nhãn trạng thái tiến độ. `null` khi miền dữ liệu trả về một giá trị bản đồ
 * chưa biết, và nơi gọi hiện GIÁ TRỊ THÔ thay vì bỏ trống: một trạng thái lạ là
 * dấu hiệu server đã thêm giá trị mới, và giấu nó đi làm mất luôn dấu hiệu đó.
 */
export function progressStatusLabel(status: string): string | null {
  const key = PROGRESS_STATUS_KEY[status];
  return key === undefined ? null : t(key);
}

// ─── Hình thức: ánh xạ miền dữ liệu → hệ thiết kế ───────────────────────────
//
// Ở đây KHÔNG có chuỗi class Tailwind nào và KHÔNG có chữ hiển thị nào. Thứ
// còn lại đúng bằng phần `packages/ui` CỐ Ý không làm: nối tên miền dữ liệu vào
// tên token.

/**
 * `beginner` (miền) → `basic` (token). Hai từ vựng lệch nhau, và cả hai bên đều
 * cố ý không đổi tên: `ScenarioDifficulty` là hợp đồng dữ liệu chạy từ P2,
 * `--difficulty-basic` là hợp đồng token. `badge.tsx` ghi rõ việc nối hai tên
 * đó thuộc về NƠI GỌI, tức là đây, đúng một chỗ.
 *
 * ⚠ Tên là `ACCENT`, KHÔNG phải `STRIPE`. "Dải màu" dịch tự nhiên ra "stripe",
 * nhưng `scripts/check-no-commerce.mjs` bắt chuỗi đó như tên một hãng thanh
 * toán và cổng cấm thương mại đỏ ngay (đã dính, 3 vi phạm). Cổng cố ý không có
 * lối thoát inline, nên đổi định danh của mình chứ không nới mẫu của cổng.
 *
 * ⚠ `satisfies` chứ không phải `Record<ScenarioDifficulty, CardAccent>`:
 * `CardAccent` KHÔNG được `packages/ui/src/index.ts` export. Dạng này giữ được
 * kiểu chữ nghĩa đen, nên nếu lane primitive đổi tên một mức thì lỗi vẫn nổ ở
 * chỗ gọi `accent={...}`, không phải im lặng.
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
 * `Badge` đã gắn sẵn icon riêng cho từng biến thể, nên bảng này KHÔNG chọn
 * icon: yêu cầu "phân biệt bằng cả màu lẫn hình" được bảo đảm ở tầng primitive,
 * mặc định chứ không opt-in.
 *
 * ⚠ `not-started` → `status-todo`, KHÔNG phải `status-locked`. Dán `locked` lên
 * "chưa bắt đầu" là nói với người học rằng họ không được vào: sai nghĩa, và sai
 * theo hướng chặn người ta lại.
 */
export const PROGRESS_STATUS_BADGE: Record<string, BadgeVariant> = {
  'not-started': 'status-todo',
  'in-progress': 'status-progress',
  completed: 'status-done',
};

// ─── Bộ chọn biên tập ───────────────────────────────────────────────────────

/**
 * Câu nói ra rằng danh sách CÒN TIẾP.
 *
 * ⚠ Câu này KHÔNG được khẳng định tổng số mục trong kho. Server trả `nextCursor`
 * (còn hay hết) chứ không trả tổng; một dòng kiểu "5/42 bài" sẽ là con số bịa,
 * đúng hạng lỗi nhãn khẳng định quá dữ liệu mà P2 đã trả giá.
 *
 * Trang 1 mà không còn trang sau ⇒ `null`: danh sách trước mắt CHÍNH LÀ toàn bộ
 * kết quả, không có gì để đính chính.
 */
export function describePageScope(args: {
  readonly kind: CatalogKind;
  readonly page: number;
  readonly shown: number;
  readonly hasNext: boolean;
}): CopyRef | null {
  const params = { page: args.page, shown: args.shown, noun: catalogNoun(args.kind) };
  if (args.hasNext) {
    return { key: 'catalog.scope.page-more', params };
  }
  if (args.page > 1) {
    return { key: 'catalog.scope.page-last', params };
  }
  return null;
}

/**
 * Cảnh báo phạm vi của SẮP XẾP.
 *
 * Server phân trang keyset theo `id` và KHÔNG nhận tham số sắp xếp, nên mọi thứ
 * tự người dùng chọn chỉ xếp lại những mục đã tải về trang này. Khi còn trang
 * sau, im lặng về điều đó sẽ để người dùng tin rằng "bài ngắn nhất" đang nằm ở
 * đầu danh sách trong khi nó có thể ở trang 3.
 *
 * Còn đúng một trang thì sắp xếp trang = sắp xếp toàn bộ kết quả ⇒ `null`.
 */
export function describeSortScope(args: {
  readonly sortKey: string;
  readonly shown: number;
  readonly hasNext: boolean;
}): CopyRef | null {
  if (args.sortKey === 'default' || !args.hasNext) {
    return null;
  }
  return { key: 'catalog.scope.sort', params: { shown: args.shown } };
}

/**
 * Cảnh báo phạm vi của Ô TÌM (16.C).
 *
 * Cùng ràng buộc như sắp xếp và mạnh hơn một bậc: không procedure danh mục nào
 * nhận tham số tìm kiếm (`listInputSchema` là `.strict()`), nên ô tìm soi đúng
 * những mục server đã trả về trang này.
 *
 * ⚠ `loaded` là số mục TRƯỚC khi lọc theo từ khoá, không phải số kết quả. Câu
 * này nói về PHẠM VI SOI, và phạm vi đó là cả trang; dùng số kết quả ở đây sẽ
 * cho ra "Ô tìm chỉ soi 0 mục" đúng lúc người đọc cần biết nó đã soi 20 mục.
 *
 * `null` khi không tìm gì, hoặc khi đây là trang cuối và không còn trang sau,
 * vì lúc đó trang đang xem CHÍNH LÀ toàn bộ kết quả và ô tìm không hụt gì.
 */
export function describeSearchScope(args: {
  readonly query: string;
  readonly loaded: number;
  readonly hasNext: boolean;
}): CopyRef | null {
  if (args.query === '' || !args.hasNext) {
    return null;
  }
  return { key: 'catalog.scope.search', params: { loaded: args.loaded } };
}

export type CatalogEmptyAction =
  | { readonly kind: 'clear-filter' }
  | { readonly kind: 'clear-search' }
  | { readonly kind: 'first-page' }
  | { readonly kind: 'author' }
  | { readonly kind: 'browse'; readonly href: string; readonly labelKey: TextKey };

export interface CatalogEmpty {
  readonly title: CopyRef;
  readonly description: CopyRef;
  readonly action: CatalogEmptyAction;
}

/**
 * Trạng thái rỗng CÓ ÍCH: "một ô trắng là lỗi, không phải một trạng thái".
 *
 * Năm ca, và chúng KHÁC NHAU ở việc người đọc phải làm gì tiếp:
 *
 * 1. **Ô tìm đang bật mà trang có mục** ⇒ không phải kho rỗng, cũng không phải
 *    trang hết mục: server đã trả về `loaded` mục và chính ô tìm lọc sạch
 *    chúng. Ca này là ca MỚI của 16.C và nó phải đứng TRƯỚC mọi ca khác, vì bốn
 *    ca kia đều giả định server trả về 0 mục.
 * 2. **Đang ở trang > 1** ⇒ kho không rỗng, chỉ là trang này vừa hết mục (nội
 *    dung đổi giữa hai lượt tải). Bảo họ về đầu, đừng bảo họ đi soạn bài.
 * 3. **Có bộ lọc bật** ⇒ cũng không kết luận được kho rỗng, vì ta chỉ hỏi server
 *    về phần đã lọc. Bảo họ bỏ lọc.
 * 4. **Không lọc + soạn được bài** ⇒ kho THẬT SỰ rỗng và người này có quyền sửa
 *    điều đó.
 * 5. **Không lọc + người học** ⇒ kho rỗng và họ không làm gì được ở đây; đưa một
 *    đường đi tiếp thay vì một lời xin lỗi.
 *
 * Thứ tự kiểm là một phần của hợp đồng: đảo ca 2 xuống dưới ca 4 sẽ khiến một
 * author ở trang 2 bị mời đi tạo bài mới trong khi kho đầy bài; đảo ca 1 xuống
 * dưới ca 3 sẽ nói "không khớp bộ lọc" khi thứ không khớp là từ khoá.
 */
export function describeCatalogEmpty(args: {
  readonly kind: CatalogKind;
  readonly page: number;
  readonly hasActiveFilter: boolean;
  readonly canAuthor: boolean;
  /** Từ khoá ĐÃ CHUẨN HOÁ. `''` = ô tìm rỗng. */
  readonly query: string;
  /** Số mục server trả về trang này, TRƯỚC khi lọc theo từ khoá. */
  readonly loaded: number;
  readonly hasNext: boolean;
}): CatalogEmpty {
  const noun = catalogNoun(args.kind);

  if (args.query !== '' && args.loaded > 0) {
    return args.hasNext
      ? {
          title: { key: 'catalog.empty.search.title', params: { noun } },
          description: { key: 'catalog.empty.search.body', params: { loaded: args.loaded } },
          action: { kind: 'clear-search' },
        }
      : {
          title: { key: 'catalog.empty.search-last.title', params: { noun } },
          description: { key: 'catalog.empty.search-last.body', params: { loaded: args.loaded } },
          action: { kind: 'clear-search' },
        };
  }

  if (args.page > 1) {
    return {
      title: { key: 'catalog.empty.page.title', params: { page: args.page, noun } },
      description: { key: 'catalog.empty.page.body' },
      action: { kind: 'first-page' },
    };
  }

  if (args.hasActiveFilter) {
    return {
      title: { key: 'catalog.empty.filter.title', params: { noun } },
      description: { key: 'catalog.empty.filter.body' },
      action: { kind: 'clear-filter' },
    };
  }

  if (args.canAuthor) {
    return {
      title: { key: 'catalog.empty.blank.title', params: { noun } },
      description: { key: 'catalog.empty.author.body', params: { noun } },
      action: { kind: 'author' },
    };
  }

  return {
    title: { key: 'catalog.empty.blank.title', params: { noun } },
    description: { key: LEARNER_SUGGESTION[args.kind].descriptionKey },
    action: LEARNER_SUGGESTION[args.kind].action,
  };
}

/**
 * Gợi ý cho người học khi một trụ cột còn trống. Mỗi gợi ý trỏ sang một trụ cột
 * KHÁC; trỏ về chính trang đang rỗng là một vòng lặp, không phải một lối ra.
 */
const LEARNER_SUGGESTION: Record<
  CatalogKind,
  { readonly descriptionKey: TextKey; readonly action: CatalogEmptyAction }
> = {
  lessons: {
    descriptionKey: 'catalog.empty.learner.lessons',
    action: { kind: 'browse', href: '/playgrounds', labelKey: 'catalog.action.browse-playgrounds' },
  },
  labs: {
    descriptionKey: 'catalog.empty.learner.labs',
    action: { kind: 'browse', href: '/lessons', labelKey: 'catalog.action.browse-lessons' },
  },
  playgrounds: {
    descriptionKey: 'catalog.empty.learner.playgrounds',
    action: { kind: 'browse', href: '/lessons', labelKey: 'catalog.action.browse-lessons' },
  },
  paths: {
    descriptionKey: 'catalog.empty.learner.paths',
    action: { kind: 'browse', href: '/lessons', labelKey: 'catalog.action.browse-lessons' },
  },
  quiz: {
    descriptionKey: 'catalog.empty.learner.quiz',
    action: { kind: 'browse', href: '/labs', labelKey: 'catalog.action.browse-labs' },
  },
};

/**
 * Dòng đếm kết quả.
 *
 * Bốn tổ hợp là bốn KHOÁ, không phải một câu ghép từ bốn mảnh. Ghép tại chỗ thì
 * ba trong bốn nhánh không đi qua cổng chữ nào.
 */
export function describeResultCount(args: {
  readonly kind: CatalogKind;
  readonly shown: number;
  readonly hasNext: boolean;
  readonly hasActiveFilter: boolean;
}): CopyRef {
  const params = { shown: args.shown, noun: catalogNoun(args.kind) };
  if (args.hasActiveFilter) {
    return {
      key: args.hasNext ? 'catalog.count.filtered-in-page' : 'catalog.count.filtered',
      params,
    };
  }
  return { key: args.hasNext ? 'catalog.count.in-page' : 'catalog.count.plain', params };
}
