import { t, type CopyRef, type StaticTextKey } from '@devops-platform/copy';
import type { ContentTopic, SandboxTierName, ScenarioDifficulty } from '@devops-platform/shared-types/scenario';

/**
 * Quyết định BIÊN TẬP của trang danh mục: nói câu nào, mở lối nào.
 *
 * Chữ nằm ở `packages/copy/src/surfaces/catalog.ts`. Thứ ở lại đây là các hàm
 * CHỌN, và chúng trả về `CopyRef` (`{ key, params }`) chứ không trả về câu đã
 * ghép: mọi nhánh là một khoá tĩnh trong bản đồ, nên cổng chữ quét được toàn bộ
 * thay vì chỉ nhánh mà test gọi tới.
 *
 * Các hàm nhận kiểu MIỀN của ứng dụng (`SandboxTierName`, `ScenarioDifficulty`),
 * nên chúng ở `apps/web` chứ không ở `packages/copy`.
 */

/** Loại danh mục. Tập cố định, đúng 5 giá trị. */
export type CatalogKind = 'lessons' | 'labs' | 'playgrounds' | 'paths' | 'quiz';

const NOUN_KEY = {
  lessons: 'catalog.noun.lessons',
  labs: 'catalog.noun.labs',
  playgrounds: 'catalog.noun.playgrounds',
  paths: 'catalog.noun.paths',
  quiz: 'catalog.noun.quiz',
} as const satisfies Record<CatalogKind, StaticTextKey>;

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
} as const satisfies Record<CatalogKind, StaticTextKey>;

const LEAD_KEY = {
  lessons: 'catalog.lead.lessons',
  labs: 'catalog.lead.labs',
  playgrounds: 'catalog.lead.playgrounds',
  paths: 'catalog.lead.paths',
  quiz: 'catalog.lead.quiz',
} as const satisfies Record<CatalogKind, StaticTextKey>;

const ERROR_TITLE_KEY = {
  lessons: 'catalog.error-title.lessons',
  labs: 'catalog.error-title.labs',
  playgrounds: 'catalog.error-title.playgrounds',
  paths: 'catalog.error-title.paths',
  quiz: 'catalog.error-title.quiz',
} as const satisfies Record<CatalogKind, StaticTextKey>;

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
} as const satisfies Record<ScenarioDifficulty, StaticTextKey>;

/**
 * Ba mức độ khó đọc từ `common.`, KHÔNG từ `catalog.`: chúng xuất hiện ở nhiều
 * surface, và chép một bản sang đây là dựng nguồn sự thật thứ hai.
 */
export function difficultyLabel(level: ScenarioDifficulty): string {
  return t(DIFFICULTY_KEY[level]);
}

const TIER_KEY = {
  sysbox: 'catalog.tier.sysbox',
  gvisor: 'catalog.tier.gvisor',
  kata: 'catalog.tier.kata',
} as const satisfies Record<SandboxTierName, StaticTextKey>;

export function tierLabel(tier: SandboxTierName): string {
  return t(TIER_KEY[tier]);
}

const TOPIC_KEY = {
  linux: 'catalog.topic.linux',
  bash: 'catalog.topic.bash',
  git: 'catalog.topic.git',
  docker: 'catalog.topic.docker',
  kubernetes: 'catalog.topic.kubernetes',
  observability: 'catalog.topic.observability',
  networking: 'catalog.topic.networking',
} as const satisfies Record<ContentTopic, StaticTextKey>;

export function topicLabel(topic: ContentTopic): string {
  return t(TOPIC_KEY[topic]);
}

export const PROGRESS_STATUS_KEY: Readonly<Record<string, StaticTextKey>> = {
  'not-started': 'catalog.status.not-started',
  'in-progress': 'catalog.status.in-progress',
  completed: 'catalog.status.completed',
};

/**
 * Nhãn trạng thái tiến độ. `null` khi miền dữ liệu trả về một giá trị chưa
 * biết, và nơi gọi hiện GIÁ TRỊ THÔ thay vì bỏ trống: một trạng thái lạ là dấu
 * hiệu server đã thêm giá trị mới, và giấu nó đi làm mất luôn dấu hiệu đó.
 */
export function progressStatusLabel(status: string): string | null {
  const key = PROGRESS_STATUS_KEY[status];
  return key === undefined ? null : t(key);
}

// ─── Hình thức: ánh xạ miền dữ liệu → hệ thiết kế ───────────────────────────
//
// Không có class Tailwind nào và không có chữ hiển thị nào ở đây. Thứ còn lại
// đúng bằng phần `packages/ui` CỐ Ý không làm: nối tên miền vào tên primitive.

/**
 * `beginner` (miền) → `basic` (primitive `Difficulty`). Hai từ vựng lệch nhau,
 * và cả hai bên cố ý không đổi tên: `ScenarioDifficulty` là hợp đồng dữ liệu,
 * `DifficultyLevel` là hợp đồng hình. Việc nối thuộc về NƠI GỌI, tức là đây.
 */
export const DIFFICULTY_LEVEL = {
  beginner: 'basic',
  intermediate: 'intermediate',
  advanced: 'advanced',
} as const satisfies Record<ScenarioDifficulty, 'basic' | 'intermediate' | 'advanced' | 'expert'>;

/**
 * Trạng thái tiến độ → trạng thái ga trên dấu tuyến của dòng.
 *
 * ⚠ `not-started` → `todo`, KHÔNG phải `locked`. Ga khoá nói với người học rằng
 * họ không được vào: sai nghĩa, và sai theo hướng chặn người ta lại.
 */
export const PROGRESS_STATUS_MARKER = {
  'not-started': 'todo',
  'in-progress': 'current',
  completed: 'done',
} as const satisfies Record<string, 'todo' | 'current' | 'done' | 'locked'>;

export function progressMarker(status: string): 'todo' | 'current' | 'done' {
  return (PROGRESS_STATUS_MARKER as Readonly<Record<string, 'todo' | 'current' | 'done'>>)[status] ?? 'todo';
}

// ─── Bộ chọn biên tập ───────────────────────────────────────────────────────

/**
 * Câu nhắc phạm vi đứng dưới ô tìm, đúng MỘT câu.
 *
 * Máy chủ không nhận từ khoá lẫn thứ tự tự chọn, nên ô tìm và ô sắp xếp chỉ
 * chạy trên phần đã tải. Câu này chỉ hiện khi nó mang tin: đang tìm hoặc đang
 * sắp xếp, VÀ danh sách còn phần chưa tải. Tải hết rồi thì phần đã tải CHÍNH LÀ
 * toàn bộ kết quả, không có gì để đính chính; luôn hiện thì nó thành nhiễu.
 *
 * ⚠ `loaded` là số mục TRƯỚC khi lọc theo từ khoá. Câu này nói về PHẠM VI, và
 * phạm vi là mọi thứ đã tải; dùng số kết quả ở đây sẽ in ra "trong 0 mục" đúng
 * lúc người đọc cần biết ô tìm đã soi 40 mục và không thấy gì.
 */
export function describeLoadedScope(args: {
  readonly kind: CatalogKind;
  readonly loaded: number;
  readonly hasNext: boolean;
  readonly searching: boolean;
  readonly sorting: boolean;
}): CopyRef | null {
  if (!args.hasNext || (!args.searching && !args.sorting)) {
    return null;
  }
  return { key: 'catalog.toolbar.scope', params: { loaded: args.loaded, noun: catalogNoun(args.kind) } };
}

export type CatalogEmptyAction =
  | { readonly kind: 'clear-filter' }
  | { readonly kind: 'clear-search' }
  | { readonly kind: 'first-page' }
  | { readonly kind: 'author' }
  | { readonly kind: 'browse'; readonly href: string; readonly labelKey: StaticTextKey };

export interface CatalogEmpty {
  readonly title: CopyRef;
  readonly description: CopyRef;
  readonly action: CatalogEmptyAction;
}

/**
 * Trạng thái rỗng CÓ ÍCH: một ô trắng là lỗi, không phải một trạng thái.
 *
 * Năm ca, và chúng KHÁC NHAU ở việc người đọc phải làm gì tiếp:
 *
 * 1. **Ô tìm đang bật mà đã tải được mục** ⇒ không phải kho rỗng: máy chủ đã trả
 *    `loaded` mục và chính ô tìm lọc sạch chúng. Ca này đứng TRƯỚC mọi ca khác,
 *    vì bốn ca kia đều giả định máy chủ trả về 0 mục.
 * 2. **Đã tải hơn một lượt** ⇒ kho không rỗng, chỉ là nội dung đổi giữa hai
 *    lượt tải. Bảo họ tải lại từ đầu, đừng bảo họ đi soạn bài.
 * 3. **Có bộ lọc bật** ⇒ cũng không kết luận được kho rỗng. Bảo họ bỏ lọc.
 * 4. **Không lọc + soạn được bài** ⇒ kho THẬT SỰ rỗng và người này sửa được.
 * 5. **Không lọc + người học** ⇒ kho rỗng; đưa một đường đi tiếp.
 *
 * Thứ tự kiểm là một phần của hợp đồng.
 */
export function describeCatalogEmpty(args: {
  readonly kind: CatalogKind;
  /** Số lượt tải đã yêu cầu, đếm từ 1. */
  readonly page: number;
  readonly hasActiveFilter: boolean;
  readonly canAuthor: boolean;
  /** Từ khoá ĐÃ CHUẨN HOÁ. `''` = ô tìm rỗng. */
  readonly query: string;
  /** Số mục máy chủ đã trả, TRƯỚC khi lọc theo từ khoá. */
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
      title: { key: 'catalog.empty.page.title' },
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
  { readonly descriptionKey: StaticTextKey; readonly action: CatalogEmptyAction }
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
 * Dòng đếm cạnh nút Xem thêm.
 *
 * Năm tổ hợp là năm KHOÁ, không phải một câu ghép từ mảnh. Câu KHÔNG khẳng định
 * tổng số mục trong kho: máy chủ trả `nextCursor` (còn hay hết) chứ không trả
 * tổng, nên khi còn nữa câu nói đúng "còn nữa" thay vì in một con số bịa.
 */
export function describeResultCount(args: {
  readonly kind: CatalogKind;
  /** Số mục đang hiện, SAU ô tìm. */
  readonly shown: number;
  /** Số mục đã tải, TRƯỚC ô tìm. */
  readonly loaded: number;
  readonly hasNext: boolean;
  readonly hasActiveFilter: boolean;
  readonly searching: boolean;
}): CopyRef {
  const noun = catalogNoun(args.kind);
  if (args.searching) {
    return { key: 'catalog.count.searched', params: { shown: args.shown, loaded: args.loaded, noun } };
  }
  const params = { shown: args.shown, noun };
  if (args.hasActiveFilter) {
    return { key: args.hasNext ? 'catalog.count.filtered-more' : 'catalog.count.filtered', params };
  }
  return { key: args.hasNext ? 'catalog.count.more' : 'catalog.count.plain', params };
}
