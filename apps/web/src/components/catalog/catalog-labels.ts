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

// ─── Hình thức: token màu + icon ────────────────────────────────────────────
//
// ⚠ MỌI class ở dưới phải là CHUỖI HẰNG viết đủ, không ghép động. Tailwind quét
// mã nguồn bằng văn bản thuần: `bg-[var(--difficulty-${token})]` KHÔNG BAO GIỜ
// được biên dịch, và hỏng đúng kiểu im lặng đã ăn cả `packages/ui` một lần (xem
// khối `@source` ở `app/globals.css`). Nên bảng dưới lặp lại tên token đầy đủ ở
// từng dòng thay vì sinh ra chúng.
//
// ⚠ Dùng TIỆN ÍCH theme (`bg-difficulty-basic`), KHÔNG phải dạng arbitrary
// (`bg-[var(--difficulty-basic)]`). Hai dạng cho ra cùng một màu hôm nay, nên
// khác biệt chỉ lộ về sau: dạng arbitrary đi vòng qua bảng theme, nên nó không
// còn nằm trong tầm của bất cứ phép đổi tên hay phép đo tập trung nào — kể cả
// `tokens.contract.test.ts`, thứ khẳng định mọi token có mặt ở CẢ HAI theme và
// sinh được class Tailwind. Bản đầu của lane này viết dạng arbitrary kèm vế
// fallback vì lúc đó token chưa tồn tại (`95efe1f` chưa hạ cánh); giờ chúng có
// thật và fallback đã thành nhiễu, nên bỏ.

/**
 * Tên độ khó trong DỮ LIỆU là `beginner`, tên trong TOKEN là `basic`.
 *
 * Hai từ vựng này không khớp nhau và đó không phải lỗi đánh máy: `ScenarioDifficulty`
 * (`beginner|intermediate|advanced`) là hợp đồng dữ liệu đã chạy từ P2, còn
 * `--difficulty-{basic,intermediate,advanced}` là hợp đồng token của 13.A. Ánh
 * xạ phải nằm ở đúng MỘT chỗ — là đây — thay vì mỗi nơi dùng tự đoán; đoán sai
 * cho ra `var(--difficulty-beginner)`, một biến không tồn tại, và nó im lặng.
 */
/*
 * ⚠ Tên là `ACCENT`, KHÔNG phải `STRIPE`. "Dải màu" dịch tự nhiên ra "stripe",
 * nhưng `scripts/check-no-commerce.mjs` bắt chuỗi đó như tên một hãng thanh toán
 * và cổng cấm thương mại đỏ ngay (đã dính, 3 vi phạm). Cổng cố ý KHÔNG có lối
 * thoát inline, nên cách đúng là đổi định danh của mình chứ không phải nới mẫu
 * của cổng — nới mẫu để lọt một chữ vô hại cũng là mở đường cho chữ có hại.
 */
export const DIFFICULTY_ACCENT: Record<ScenarioDifficulty, string> = {
  beginner: 'bg-difficulty-basic',
  intermediate: 'bg-difficulty-intermediate',
  advanced: 'bg-difficulty-advanced',
};

/**
 * Chip độ khó — CẶP MÀU DO LANE NỀN BẢO ĐẢM.
 *
 * Cố ý chỉ ghép `--difficulty-X` với `--difficulty-X-foreground`, không bao giờ
 * với `--card`/`--foreground`. Cặp nền-với-chữ-của-chính-nó là thứ
 * `tokens.contract.test.ts` đo được; một cặp do lane này tự chế ra sẽ là cặp
 * KHÔNG ai đo, và ngưỡng 4.5:1 cho chữ sẽ không có cổng nào giữ.
 */
export const DIFFICULTY_CHIP: Record<ScenarioDifficulty, string> = {
  beginner: 'bg-difficulty-basic text-difficulty-basic-foreground',
  intermediate: 'bg-difficulty-intermediate text-difficulty-intermediate-foreground',
  advanced: 'bg-difficulty-advanced text-difficulty-advanced-foreground',
};

/**
 * Trạng thái học — phân biệt bằng CẢ màu LẪN hình.
 *
 * Người mù màu đỏ-lục (~8% nam giới) không tách được `--status-progress` khỏi
 * `--status-done` nếu hai thứ đó chỉ khác nhau ở sắc độ. Nên mỗi trạng thái
 * mang thêm một icon khác HÌNH (vòng rỗng / vòng có chấm / vòng có dấu tích) và
 * nhãn chữ luôn hiện — màu là lớp thứ ba, không phải lớp duy nhất.
 *
 * ⚠ `not-started` KHÔNG có token riêng: hợp đồng chỉ cấp
 * `--status-{progress,done,locked}`, và "chưa bắt đầu" không phải "bị khoá" —
 * dán `--status-locked` lên nó sẽ nói với người học rằng họ không được vào, một
 * lời nói dối. Nó dùng `--muted` đang có, đúng nghĩa: chưa nổi bật vì chưa xảy
 * ra. `--status-locked` để nguyên chưa dùng — trang danh mục không khoá mục nào.
 */
export const PROGRESS_STATUS_STYLE: Record<string, string> = {
  'in-progress': 'bg-status-progress text-status-progress-foreground',
  completed: 'bg-status-done text-status-done-foreground',
  'not-started': 'bg-muted text-muted-foreground',
};

/** Icon theo trạng thái — tên logic, `catalog-icons.tsx` dịch sang component. */
export const PROGRESS_STATUS_ICON: Record<string, 'statusNotStarted' | 'statusInProgress' | 'statusCompleted'> = {
  'not-started': 'statusNotStarted',
  'in-progress': 'statusInProgress',
  completed: 'statusCompleted',
};

/**
 * Số kết quả ĐANG HIỆN — và chỉ thế.
 *
 * ⛔ KHÔNG được thành "N/M mục". Server trả `nextCursor` (còn hay hết) chứ không
 * trả tổng, nên mọi mẫu số ở đây sẽ là số bịa — đúng hạng lỗi
 * nhãn-khẳng-định-quá-dữ-liệu mà `describePageScope` đã phải viết cả một khối
 * chú thích để tránh. Câu này vì vậy nói "trong trang này" khi còn trang sau, và
 * chỉ dám bỏ mệnh đề đó khi `hasNext` là false.
 */
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
