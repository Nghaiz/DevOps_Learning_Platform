import path from 'node:path';
import type {
  ScenarioCapability,
  ScenarioDifficulty,
  SandboxTierName,
} from '@devops-platform/shared-types/scenario';
import {
  SCENARIO_DIFFICULTIES,
  toScenarioSummary,
  type Scenario,
  type ScenarioSummary,
} from '@devops-platform/shared-types/scenario';
import { InvalidCursorError } from './errors.ts';
import { toLabSummary, type Lab, type LabSummary } from '@devops-platform/shared-types/lab';
import type { Playground, PlaygroundSummary } from '@devops-platform/shared-types/playground';
import { loadLabs } from './lab-loader.ts';
import { loadScenarios } from './loader.ts';
import { loadPlaygrounds } from './playground-loader.ts';

/**
 * Tham số phân trang ở TẦNG NGUỒN (D9, phase-13) — thay cho việc router nạp
 * `list()` đầy đủ rồi tự cắt lát bằng TS.
 *
 * `filter` là tham số SERVER: áp trước khi merge/paginate, không phải một điều
 * kiện client tự thêm sau khi đã có trang. `difficulty` không có ý nghĩa với
 * playground (nó không có field đó — xem `playgroundSchema`); một nguồn không
 * có field tương ứng bỏ qua field filter đó thay vì lỗi — lọc theo một field
 * không tồn tại trên loại nội dung đó luôn trả tập rỗng nếu áp cứng, và đó
 * không phải hành vi hữu ích hơn việc bỏ qua nó.
 */
/**
 * `| undefined` tường minh trên cả hai field, KHÔNG chỉ `?:` — tsconfig của cả
 * hai package tiêu thụ (`apps/web`, đây) bật `exactOptionalPropertyTypes`, và
 * caller phổ biến nhất (router tRPC) build object này từ input Zod
 * `.optional()`, tức luôn có dạng `{ difficulty: input.difficulty, tier:
 * input.tier }` — hai field CÓ THỂ mang giá trị `undefined` tường minh (không
 * phải vắng mặt). Thiếu `| undefined` ở đây thì MỌI router gọi `listPage` phải
 * tự lọc key `undefined` ra khỏi object trước khi truyền, một việc thừa lặp ở
 * ba router.
 */
export interface ContentListFilter {
  readonly difficulty?: ScenarioDifficulty | undefined;
  readonly tier?: SandboxTierName | undefined;
  /**
   * Lọc theo NĂNG LỰC sandbox (phase-13 13.C task 9). `capabilities` là một
   * MẢNG, nên đây là phép **chứa** (`'docker' ∈ item.capabilities`), không phải
   * so bằng — DB dịch nó thành `capabilities @> '["docker"]'::jsonb`, đĩa dịch
   * thành `Array.includes`. Áp TRƯỚC khi phân trang, cùng lý do như hai field
   * trên: `limit` phải đếm số dòng SAU lọc.
   *
   * Khác `difficulty`: field này có mặt trên CẢ BA loại nội dung
   * (`scenarioSummarySchema`, `labSummarySchema`, `playgroundSchema` đều khai
   * `capabilities`), nên không có ca "bỏ qua vì không áp dụng được".
   */
  readonly capability?: ScenarioCapability | undefined;
}

/**
 * Thứ tự phân trang (phase-13, mở rộng D9).
 *
 * ⛔ **`title` KHÔNG có trong danh sách này, và đó là một kết luận đã đo, không
 * phải một việc chưa làm.** Một keyset chỉ đúng khi MỌI nguồn xếp cùng một thứ
 * tự toàn phần. Đo trên chính Postgres của repo (2026-09-06, `datcollate =
 * en_US.utf8`) với sáu tiêu đề tiếng Việt:
 *
 * ```
 * PG default / PG COLLATE "C" / JS a<b : ["Bình thường","Docker cơ bản","Zoom","Ánh sáng","Đường ống","Ổ đĩa"]
 * JS localeCompare(...,'vi')          : ["Ánh sáng","Bình thường","Docker cơ bản","Đường ống","Ổ đĩa","Zoom"]
 * ```
 *
 * Hai thứ tự khác nhau, và cái mà Postgres cho ta đẩy `ORDER BY title` xuống
 * chính là cái đẩy MỌI tiêu đề có dấu xuống sau chữ Z — đúng chế độ hỏng mà
 * `compareTitle` (`components/catalog/catalog-sort.ts`) đã cấm bằng chữ. Muốn
 * server sắp theo bảng chữ tiếng Việt thì cần một trong hai thứ ta KHÔNG có:
 * một collation ICU `vi` cài trên cụm VÀ trùng phiên bản ICU với Node (hai
 * engine đồng ý về collation là điều repo không khẳng định được), hoặc một cột
 * khoá-sắp-xếp lưu sẵn — tức derived field, thứ repo đã bác bốn lần.
 *
 * Nên `title` ở lại phía client, sắp TRONG TRANG, với nhãn nói đúng phạm vi.
 * Ship một `orderBy: 'title'` keyset ở đây sẽ vừa sai bảng chữ vừa mất dòng ở
 * biên trang khi trang đi qua ranh giới đĩa/DB.
 */
export const CONTENT_ORDER_KEYS = ['id', 'difficulty', 'duration'] as const;
export type ContentOrderKey = (typeof CONTENT_ORDER_KEYS)[number];

/**
 * Hình dạng TỐI THIỂU mà một mục phải có để sắp được. Cả ba DTO rút gọn lẫn
 * hàng thô `ContentItemRow` đều thoả — `difficulty`/`estimatedMinutes` khai
 * `?:` vì playground không có chúng.
 */
export interface ContentSortable {
  readonly id: string;
  readonly difficulty?: string | null;
  readonly estimatedMinutes?: number | null;
}

/**
 * Hạng của một độ khó lạ / vắng mặt. Bằng `SCENARIO_DIFFICULTIES.length` nên nó
 * luôn đứng SAU mọi độ khó thật — "chưa biết" xuống cuối, cùng quy ước với
 * `compareMinutes` ở FE ("chưa biết" không phải "bằng 0").
 */
export const UNKNOWN_DIFFICULTY_RANK = SCENARIO_DIFFICULTIES.length;

/**
 * Giá trị thay cho `estimatedMinutes === null` khi sắp theo thời lượng.
 *
 * `2147483647` = `int4` max, và nó phải là **cùng một hằng số ở cả hai nguồn**
 * (JS ở đây, `coalesce(estimated_minutes, 2147483647)` trong SQL) — nếu không
 * thì cursor do nguồn này phát ra vô nghĩa với nguồn kia. Không dùng
 * `Number.MAX_SAFE_INTEGER`: nó không nhét vừa `int4`, nên Postgres sẽ ném.
 *
 * ⚠ Một bài khai đúng 2147483647 phút (≈4084 năm) sẽ nằm lẫn với nhóm "chưa
 * khai". Đó KHÔNG phá keyset — thứ tự vẫn toàn phần vì `id` phá hoà — chỉ là
 * một vị trí lạ cho một dữ liệu vốn đã lạ.
 */
export const NO_DURATION_SORT_VALUE = 2_147_483_647;

/** Khoá sắp xếp dạng số của một mục. `null` = thứ tự `id` thuần (không có khoá phụ). */
export function contentSortValue(orderBy: ContentOrderKey, item: ContentSortable): number | null {
  if (orderBy === 'id') {
    return null;
  }
  if (orderBy === 'duration') {
    return item.estimatedMinutes ?? NO_DURATION_SORT_VALUE;
  }
  const index = SCENARIO_DIFFICULTIES.indexOf(item.difficulty as ScenarioDifficulty);
  return index === -1 ? UNKNOWN_DIFFICULTY_RANK : index;
}

/**
 * So sánh `id` theo **đơn vị mã**, KHÔNG `localeCompare`.
 *
 * Đây là điều kiện để `paginateSorted` đúng: nó sắp bằng comparator này rồi cắt
 * bằng vị từ `id > cursor` (toán tử `>` của JS, tức đơn vị mã). Sắp bằng một
 * thứ tự mà vị từ cắt không biết là cách chắc chắn để dãy không đơn điệu ở đúng
 * chỗ nối trang.
 *
 * Với bảng chữ của `scenarioIdSchema` (`[a-z0-9-]`) hai thứ tự này TRÙNG NHAU —
 * đo vét cạn 2026-09-06: 258 chuỗi dài 1–3 trên `{a,b,z,0,9,-}`, 66 564 cặp,
 * **0 bất đồng**. Postgres của repo cũng khớp (`a-b < a1 < aa < ab`). Nên đổi
 * sang `<` không đổi kết quả hôm nay; nó chỉ bỏ đi một giả định không cần thiết.
 */
function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Comparator toàn phần `(khoá sắp xếp, id)` cho một thứ tự. */
export function compareContent(
  orderBy: ContentOrderKey,
): (a: ContentSortable, b: ContentSortable) => number {
  return (a, b) => {
    if (orderBy !== 'id') {
      const av = contentSortValue(orderBy, a) ?? 0;
      const bv = contentSortValue(orderBy, b) ?? 0;
      if (av !== bv) {
        return av - bv;
      }
    }
    return compareId(a.id, b.id);
  };
}

/**
 * Cursor cho thứ tự KHÁC `id` phải mang **cả hai** vế của khoá.
 *
 * Một cursor chỉ có `id` là đủ khi và chỉ khi `id` LÀ khoá sắp xếp. Sắp theo
 * `difficulty` mà cursor chỉ mang `id` thì trang sau không có cách nào biết
 * "sau `beginner/x`" nghĩa là gì — nó sẽ hoặc bỏ sót mọi mục `beginner` có `id`
 * nhỏ hơn, hoặc trả lại chúng lần thứ hai. Nên khoá là cặp `(sortValue, id)` và
 * cursor mang nguyên cặp đó.
 *
 * Định dạng: `'<tiền tố>:<sortValue>:<id>'`. `id` khớp
 * `^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$` nên KHÔNG chứa `:` — cắt hai dấu `:`
 * đầu là không nhập nhằng, và một cursor của thứ tự khác nhận ra được ngay ở
 * tiền tố thay vì âm thầm đọc sai.
 *
 * Thứ tự `id` giữ NGUYÊN dạng cũ (cursor = `id` trần): đổi nó sẽ là một thay
 * đổi phá vỡ cho mọi thứ đã dựng trên D9 mà không đổi lại được gì.
 */
const CURSOR_PREFIX: Record<Exclude<ContentOrderKey, 'id'>, string> = {
  difficulty: 'd',
  duration: 'm',
};

export interface DecodedContentCursor {
  /** `null` khi `orderBy === 'id'`. */
  readonly sortValue: number | null;
  readonly id: string;
}

export function encodeContentCursor(orderBy: ContentOrderKey, item: ContentSortable): string {
  if (orderBy === 'id') {
    return item.id;
  }
  const value = contentSortValue(orderBy, item) ?? 0;
  return `${CURSOR_PREFIX[orderBy]}:${String(value)}:${item.id}`;
}

/**
 * ⛔ Ném `InvalidCursorError` khi cursor SAI ĐỊNH DẠNG (hoặc thuộc một thứ tự
 * khác) — điều này KHÔNG mâu thuẫn với luật ghi ở `errors.ts` ("từng nguồn
 * không được validate cursor"). Luật đó nói về sự **tồn tại**: một id có thật ở
 * nguồn A và không có ở nguồn B là chuyện bình thường. Còn một chuỗi không phân
 * tích được thì vô nghĩa với MỌI nguồn, nên nó là 400 dù hỏi ai.
 *
 * `compositeContentSource` giải mã cursor MỘT LẦN trước khi phát tán cho các
 * nguồn, nên trên đường production lỗi này ném ra trước `Promise.allSettled` —
 * không bị nuốt thành "một nguồn lỗi, trang trả về đang THIẾU".
 */
export function decodeContentCursor(
  cursor: string,
  orderBy: ContentOrderKey,
): DecodedContentCursor {
  if (orderBy === 'id') {
    // `id` không bao giờ chứa `:`; có `:` nghĩa là cursor của một thứ tự khác
    // còn sót lại (người dùng đổi cách sắp giữa chừng). Nói ra, đừng đọc bừa.
    if (cursor.includes(':')) {
      throw new InvalidCursorError(cursor);
    }
    return { sortValue: null, id: cursor };
  }
  const parts = cursor.split(':');
  const [prefix, rawValue, id] = parts;
  if (parts.length !== 3 || prefix !== CURSOR_PREFIX[orderBy] || id === undefined || id === '') {
    throw new InvalidCursorError(cursor);
  }
  const value = Number(rawValue);
  if (rawValue === undefined || rawValue === '' || !Number.isInteger(value)) {
    throw new InvalidCursorError(cursor);
  }
  return { sortValue: value, id };
}

/**
 * So sánh HAI CURSOR theo khoá của chúng.
 *
 * ⛔ Không so bằng chuỗi. `'d:10:abc' < 'd:2:abc'` theo thứ tự chuỗi, trong khi
 * hạng 10 đứng SAU hạng 2 — `compositeContentSource` dùng phép "cursor nhỏ
 * nhất" làm mốc đi tiếp, và một mốc lớn hơn ở đó nghĩa là nhảy qua dữ liệu.
 */
export function compareCursors(orderBy: ContentOrderKey, a: string, b: string): number {
  const da = decodeContentCursor(a, orderBy);
  const db = decodeContentCursor(b, orderBy);
  if (orderBy !== 'id') {
    const av = da.sortValue ?? 0;
    const bv = db.sortValue ?? 0;
    if (av !== bv) {
      return av - bv;
    }
  }
  return compareId(da.id, db.id);
}

/** Mục có đứng SAU cursor theo khoá `(sortValue, id)` không. */
export function isAfterCursor(
  orderBy: ContentOrderKey,
  item: ContentSortable,
  cursor: DecodedContentCursor,
): boolean {
  if (orderBy !== 'id') {
    const value = contentSortValue(orderBy, item) ?? 0;
    const cursorValue = cursor.sortValue ?? 0;
    if (value !== cursorValue) {
      return value > cursorValue;
    }
  }
  return item.id > cursor.id;
}

export interface ListPageOptions {
  readonly limit: number;
  /**
   * `undefined` = trang đầu. Cursor là `id` CUỐI của trang trước (D9).
   * `| undefined` tường minh — cùng lý do ở `ContentListFilter`:
   * `listInputSchema.cursor` là `z.string().optional()`, nên router build
   * object này từ `{ cursor: input.cursor }` với giá trị CÓ THỂ là `undefined`
   * tường minh dưới `exactOptionalPropertyTypes`.
   */
  readonly cursor?: string | undefined;
  readonly filter?: ContentListFilter;
  /**
   * Vắng mặt = `'id'` (hành vi D9 nguyên bản). Đổi `orderBy` giữa chừng làm
   * cursor cũ vô nghĩa — và `decodeContentCursor` NÓI RA điều đó (400) thay vì
   * đọc nó theo khoá mới.
   */
  readonly orderBy?: ContentOrderKey | undefined;
}

export interface ContentPage<T> {
  readonly items: readonly T[];
  /** `null` = hết trang. */
  readonly nextCursor: string | null;
}

/**
 * Cắt một danh sách thành một trang keyset theo khoá `(sortValue, id)`.
 *
 * Tên giữ nguyên (`paginateSorted`) vì nó là điểm nối của ba test double, nhưng
 * nó **tự sắp lại** thay vì tin caller đã sắp đúng: với `orderBy` khác `'id'`
 * thì "đã sắp theo id" là thứ tự SAI, và một helper nhận vào thứ tự sai rồi cắt
 * theo thứ tự khác là đúng cách để mất dòng ở biên trang. Sắp lại một mảng đã
 * sắp là O(n log n) trên vài chục mục — rẻ hơn nhiều so với một giả định.
 */
export function paginateSorted<T extends ContentSortable>(
  items: readonly T[],
  options: Pick<ListPageOptions, 'limit' | 'cursor' | 'orderBy'>,
): ContentPage<T> {
  const orderBy = options.orderBy ?? 'id';
  const sorted = [...items].sort(compareContent(orderBy));
  const cursor =
    options.cursor === undefined ? undefined : decodeContentCursor(options.cursor, orderBy);
  const from =
    cursor === undefined ? sorted : sorted.filter((item) => isAfterCursor(orderBy, item, cursor));
  const page = from.slice(0, options.limit);
  const hasMore = from.length > options.limit;
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor: hasMore && last !== undefined ? encodeContentCursor(orderBy, last) : null,
  };
}

/**
 * Lọc theo `difficulty`/`tier` khi item có field tương ứng — bỏ qua field
 * filter mà item không có.
 *
 * `item.difficulty`/`item.tier` gõ RỘNG (`string`), không hẹp theo
 * `ScenarioDifficulty`/`SandboxTierName`: một hàng metadata thô đọc từ DB
 * (`ContentItemRow`, trước khi qua `summarize*`/Zod validate) mang cột
 * `difficulty text` chưa được ép kiểu — hàm này chỉ so bằng `!==`, không cần
 * union hẹp để làm điều đó đúng.
 */
export function matchesContentFilter(
  item: {
    readonly difficulty?: string | null;
    readonly tier?: string;
    readonly capabilities?: readonly string[];
  },
  filter: ContentListFilter | undefined,
): boolean {
  if (filter === undefined) {
    return true;
  }
  if (filter.difficulty !== undefined && 'difficulty' in item && item.difficulty !== filter.difficulty) {
    return false;
  }
  if (filter.tier !== undefined && 'tier' in item && item.tier !== filter.tier) {
    return false;
  }
  /**
   * CHỨA, không phải bằng — và không có nhánh "bỏ qua vì không áp dụng được"
   * như `difficulty`: cả ba loại nội dung đều khai `capabilities`. Một mục
   * KHÔNG mang năng lực được hỏi thì bị loại, kể cả khi mảng của nó rỗng — đó
   * là câu trả lời đúng, không phải một field vắng mặt.
   */
  if (filter.capability !== undefined && !(item.capabilities ?? []).includes(filter.capability)) {
    return false;
  }
  return true;
}

/**
 * Nguồn nội dung bài học — **seam** giữa "bài học tới từ đâu" và mọi thứ đọc nó.
 *
 * Hôm nay có đúng MỘT hiện thực: `filesystemScenarioSource`, đọc
 * `content/scenarios/**` do `vendor-scenarios.mjs` ghim theo commit. Interface
 * này tồn tại vì nền tảng sẽ cần một hiện thực THỨ HAI — soạn bài trực tiếp trên
 * UI, tức nội dung nằm trong DB thay vì trên đĩa.
 *
 * Vì sao dựng seam TRƯỚC khi có hiện thực thứ hai (và vì sao đó không phải vi
 * phạm YAGNI):
 *
 * 1. Nó KHÔNG thêm khả năng nào chưa dùng — nó chỉ đặt tên cho một ranh giới đã
 *    tồn tại. Không có nó, `loadScenarios(dir)` sẽ nằm rải trong router tRPC và
 *    trong FE, và "đổi nguồn" sẽ là sửa mọi call-site cùng lúc.
 * 2. Bản DB-backed cắm vào bằng cách hiện thực đúng hai method này. Router,
 *    `checkStep` và FE không biết khác biệt — chúng phụ thuộc DTO
 *    (`packages/shared-types/src/scenario.ts`), không phụ thuộc `node:fs`.
 *
 * ⛔ **KHÔNG dựng bảng `scenarios` trong Postgres ở chặng này** dù plan P2 task 6
 * có liệt kê nó. Metadata (title/difficulty/tier) đã có nguồn sự thật là
 * `index.json` + `dlp.json` trên đĩa, đã ghim byte-với-byte. Một bảng chép lại
 * chúng là derived field — cùng lỗi mà `markdownHtml` và `progress.status` đã bị
 * bác ở 2.A. Bảng đó thuộc về ngày có UI soạn bài, và ngày đó nó là NGUỒN chứ
 * không phải bản sao.
 *
 * Ranh giới của seam: `list()` trả bản RÚT GỌN, `get()` trả bản đầy đủ. Không
 * phải để gọn — với nguồn DB, `list()` sẽ là một câu SELECT không chạm nội dung
 * markdown, còn một `list()` trả `Scenario[]` sẽ ép nó đọc mọi step của mọi bài
 * chỉ để vẽ một cái lưới thẻ.
 */
export interface ScenarioSource {
  /** Nhãn để log/chẩn đoán biết nội dung đang tới từ đâu. */
  readonly kind: string;
  /** Danh sách rút gọn, đã sắp theo `id` — thứ tự ổn định là điều kiện để phân trang bằng cursor có nghĩa. */
  list(): Promise<ScenarioSummary[]>;
  /** `null` = không có bài đó. KHÔNG ném — "không tìm thấy" là câu trả lời hợp lệ, và caller (tRPC) mới biết nó phải thành 404 hay thành gì khác. */
  get(id: string): Promise<Scenario | null>;
  /**
   * D9 (phase-13) — phân trang Ở TẦNG NGUỒN, không phải `list()` rồi cắt lát ở
   * router. Hiện thực DB (`db-source.ts`) đẩy `WHERE id > cursor … LIMIT n+1`
   * xuống Postgres; hiện thực đĩa cắt lát trên mảng đã sắp trong bộ nhớ.
   *
   * KHÔNG validate sự tồn tại của `cursor` — xem `InvalidCursorError`. Chỉ
   * `compositeContentSource` (hoặc caller gọi thẳng một nguồn không qua
   * composite) mới ném khi cursor không tồn tại ở đâu cả.
   */
  listPage(options: ListPageOptions): Promise<ContentPage<ScenarioSummary>>;
}

/**
 * `ScenarioSource` mở rộng cho hai trụ cột P8 (Lab, Playground) — MỘT seam duy
 * nhất cho cả ba loại nội dung, để bản DB-backed (soạn bài trên UI) cắm vào
 * một chỗ chứ không ba. `ScenarioSource` vẫn được xuất NGUYÊN VẸN (không đổi
 * hình dạng) để `apps/web/src/server/lessons/catalog.ts` — vốn gõ biến của nó
 * là `ScenarioSource`, không phải `ContentSource` — tiếp tục biên dịch không
 * sửa gì: `ContentSource` là SUPERSET có cấu trúc, nên một giá trị
 * `ContentSource` gán được cho một biến `ScenarioSource` mà TypeScript không
 * phàn nàn.
 *
 * Cùng ranh giới rút-gọn-vs-đầy-đủ của `ScenarioSource`: `list*()` trả bản
 * RÚT GỌN (không nội dung task/markdown), `get*()` trả bản đầy đủ.
 */
export interface ContentSource extends ScenarioSource {
  /** Danh sách rút gọn, đã sắp theo `id`. */
  listLabs(): Promise<LabSummary[]>;
  /** `null` = không có lab đó — cùng quy ước `get()` ở trên, KHÔNG ném. */
  getLab(id: string): Promise<Lab | null>;
  /** Danh sách playground — bản ĐẦY ĐỦ (`PlaygroundSummary` = `Playground`, nó vốn đã bé). */
  listPlaygrounds(): Promise<PlaygroundSummary[]>;
  /** `null` = không có playground đó — KHÔNG ném. */
  getPlayground(id: string): Promise<Playground | null>;
  /** D9 — cùng khuôn `listPage`. */
  listLabsPage(options: ListPageOptions): Promise<ContentPage<LabSummary>>;
  /**
   * D9 — cùng khuôn `listPage`. `filter.difficulty` bị BỎ QUA (playground
   * không có field đó); `filter.capability` thì KHÔNG — playground CÓ
   * `capabilities`, nên bộ lọc đó áp bình thường.
   *
   * ⚠ `options.orderBy` khác `'id'` vẫn cho một keyset ĐÚNG ở đây (mọi mục
   * cùng một hạng, `id` phá hoà) nhưng VÔ NGHĨA — playground không có độ khó
   * lẫn thời lượng. Cổng nằm ở router: `playgrounds.list` không mở tham số đó
   * nên không caller nào chạm tới nhánh này. Nguồn cố ý không tự cấm, để
   * interface khỏi rẽ nhánh theo loại nội dung.
   */
  listPlaygroundsPage(options: ListPageOptions): Promise<ContentPage<PlaygroundSummary>>;
}

/**
 * Nguồn đọc từ đĩa — hiện thực DUY NHẤT của `ContentSource` (luật §5 của
 * contract: KHÔNG dựng nguồn thứ hai; bản DB-backed của P9 cắm vào bằng cách
 * hiện thực lại đúng interface này).
 *
 * Nạp MỘT LẦN rồi giữ trong bộ nhớ, MỖI LOẠI NỘI DUNG một cache riêng (ba
 * `pending` độc lập): nội dung được nướng vào image lúc build (`apps/web/Dockerfile`
 * copy `content/`), nên nó không đổi trong vòng đời tiến trình. Đọc lại mỗi
 * request là hàng chục `readFile` cho một trang danh sách. Ba cache tách biệt
 * — không phải một cache gộp — vì ba loại nội dung có thể hỏng ĐỘC LẬP: một
 * `lab.json` sai cấu trúc không được phép làm `/lessons` (đã nạp tốt) ngừng
 * phục vụ.
 *
 * ⛔ Mỗi cache giữ **promise**, không giữ kết quả — và promise hỏng thì XOÁ
 * khỏi cache. Cùng hai kỷ luật đã áp cho scenario ở trên, lặp lại cho lab và
 * playground vì đây là nơi race/đóng-băng-vĩnh-viễn có thể tái diễn nếu quên.
 *
 * `labsRootDir`/`playgroundsRootDir` mặc định là THƯ MỤC ANH EM của
 * `rootDir` (`<cha của rootDir>/labs`, `<cha của rootDir>/playgrounds`) — đúng
 * bố cục thật của `content/{scenarios,labs,playgrounds}`. Suy luận này chỉ để
 * caller HIỆN CÓ (`filesystemScenarioSource(scenariosDir())`, một tham số)
 * tiếp tục hoạt động mà không cần sửa; caller nào cần trỏ khác thư mục anh em
 * (test, hoặc `SCENARIOS_DIR` không theo bố cục này) truyền tường minh qua
 * `options`.
 */
export function filesystemScenarioSource(
  rootDir: string,
  options: { readonly labsRootDir?: string; readonly playgroundsRootDir?: string } = {},
): ContentSource {
  const labsRootDir = options.labsRootDir ?? path.join(path.dirname(rootDir), 'labs');
  const playgroundsRootDir =
    options.playgroundsRootDir ?? path.join(path.dirname(rootDir), 'playgrounds');

  let pendingScenarios: Promise<Map<string, Scenario>> | null = null;
  let pendingLabs: Promise<Map<string, Lab>> | null = null;
  let pendingPlaygrounds: Promise<Map<string, Playground>> | null = null;

  async function allScenarios(): Promise<Map<string, Scenario>> {
    pendingScenarios ??= loadScenarios(rootDir)
      .then((scenarios) => new Map(scenarios.map((s) => [s.id, s])))
      .catch((cause: unknown) => {
        pendingScenarios = null;
        throw cause;
      });
    return pendingScenarios;
  }

  async function allLabs(): Promise<Map<string, Lab>> {
    pendingLabs ??= loadLabs(labsRootDir)
      .then((labs) => new Map(labs.map((l) => [l.id, l])))
      .catch((cause: unknown) => {
        pendingLabs = null;
        throw cause;
      });
    return pendingLabs;
  }

  async function allPlaygrounds(): Promise<Map<string, Playground>> {
    pendingPlaygrounds ??= loadPlaygrounds(playgroundsRootDir)
      .then((playgrounds) => new Map(playgrounds.map((p) => [p.id, p])))
      .catch((cause: unknown) => {
        pendingPlaygrounds = null;
        throw cause;
      });
    return pendingPlaygrounds;
  }

  return {
    kind: `filesystem:${rootDir}`,
    async list() {
      // `loadScenarios` đã sắp theo tên thư mục, và loader ép `id === tên thư
      // mục`, nên thứ tự Map đã là thứ tự theo id. Sắp lại ở đây là công thừa
      // dựa trên một ràng buộc có thể trôi — nên khẳng định lại nó, rẻ hơn là
      // tin vào nó.
      return [...(await allScenarios()).values()]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(toScenarioSummary);
    },
    async get(id: string) {
      return (await allScenarios()).get(id) ?? null;
    },
    async listPage(options: ListPageOptions) {
      // KHÔNG `.sort(id)` ở đây nữa: `paginateSorted` SỞ HỮU thứ tự vì nó phải
      // sắp theo `options.orderBy`. Sắp trước bằng `id` rồi để nó sắp lại là
      // công thừa; tệ hơn, nó gợi ý rằng thứ tự do call-site quyết định.
      const matching = [...(await allScenarios()).values()]
        .map(toScenarioSummary)
        .filter((s) => matchesContentFilter(s, options.filter));
      return paginateSorted(matching, options);
    },
    async listLabs() {
      return [...(await allLabs()).values()]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(toLabSummary);
    },
    async getLab(id: string) {
      return (await allLabs()).get(id) ?? null;
    },
    async listLabsPage(options: ListPageOptions) {
      const matching = [...(await allLabs()).values()]
        .map(toLabSummary)
        .filter((l) => matchesContentFilter(l, options.filter));
      return paginateSorted(matching, options);
    },
    async listPlaygrounds() {
      return [...(await allPlaygrounds()).values()].sort((a, b) => a.id.localeCompare(b.id));
    },
    async getPlayground(id: string) {
      return (await allPlaygrounds()).get(id) ?? null;
    },
    async listPlaygroundsPage(options: ListPageOptions) {
      const matching = [...(await allPlaygrounds()).values()].filter((p) =>
        matchesContentFilter(p, options.filter),
      );
      return paginateSorted(matching, options);
    },
  };
}
