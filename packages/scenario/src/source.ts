import path from 'node:path';
import type { ScenarioDifficulty, SandboxTierName } from '@devops-platform/shared-types/scenario';
import {
  toScenarioSummary,
  type Scenario,
  type ScenarioSummary,
} from '@devops-platform/shared-types/scenario';
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
}

export interface ContentPage<T> {
  readonly items: readonly T[];
  /** `null` = hết trang. */
  readonly nextCursor: string | null;
}

/** Cắt một danh sách ĐÃ SẮP theo `id` thành một trang keyset (`id > cursor`). */
export function paginateSorted<T extends { readonly id: string }>(
  sortedAscById: readonly T[],
  options: Pick<ListPageOptions, 'limit' | 'cursor'>,
): ContentPage<T> {
  const from =
    options.cursor === undefined
      ? sortedAscById
      : sortedAscById.filter((item) => item.id > (options.cursor as string));
  const page = from.slice(0, options.limit);
  const hasMore = from.length > options.limit;
  const last = page[page.length - 1];
  return { items: page, nextCursor: hasMore && last !== undefined ? last.id : null };
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
  item: { readonly difficulty?: string | null; readonly tier?: string },
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
  /** D9 — cùng khuôn `listPage`. `filter.difficulty` bị BỎ QUA (playground không có field đó). */
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
      const sorted = [...(await allScenarios()).values()]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(toScenarioSummary)
        .filter((s) => matchesContentFilter(s, options.filter));
      return paginateSorted(sorted, options);
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
      const sorted = [...(await allLabs()).values()]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(toLabSummary)
        .filter((l) => matchesContentFilter(l, options.filter));
      return paginateSorted(sorted, options);
    },
    async listPlaygrounds() {
      return [...(await allPlaygrounds()).values()].sort((a, b) => a.id.localeCompare(b.id));
    },
    async getPlayground(id: string) {
      return (await allPlaygrounds()).get(id) ?? null;
    },
    async listPlaygroundsPage(options: ListPageOptions) {
      const sorted = [...(await allPlaygrounds()).values()]
        .sort((a, b) => a.id.localeCompare(b.id))
        .filter((p) => matchesContentFilter(p, options.filter));
      return paginateSorted(sorted, options);
    },
  };
}
