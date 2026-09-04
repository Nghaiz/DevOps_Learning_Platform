import type { Scenario, ScenarioSummary } from '@devops-platform/shared-types/scenario';
import type { Lab, LabSummary } from '@devops-platform/shared-types/lab';
import type { Playground, PlaygroundSummary } from '@devops-platform/shared-types/playground';
import { InvalidCursorError } from './errors.ts';
import type { ContentPage, ContentSource, ListPageOptions } from './source.ts';
import type { ContentSourceLogger } from './db-source.ts';

/**
 * Hợp nhất nhiều `ContentSource` thành một (P9 task 10).
 *
 * Đây là điều mà seam ở `source.ts` **chưa** nói: nó mô tả cách thay MỘT nguồn
 * bằng một nguồn khác, không phải cách để hai nguồn cùng sống. Phase 9 làm
 * chuyện thứ hai — nội dung vendored trên đĩa không đi đâu cả khi trang soạn
 * bài xuất hiện — nên luật gộp phải được viết ra ở một chỗ thay vì được đoán
 * lại ở mỗi call-site.
 *
 * SSOT của luật + bốn câu trả lời bắt buộc: `docs/content-sources.md`.
 *
 * ## Luật ưu tiên: nguồn ĐỨNG TRƯỚC thắng
 *
 * Caller dựng `compositeContentSource([filesystem, db])`, nên **đĩa thắng**.
 * Hai lý do, và cả hai đều là về việc *không đánh mất một khẳng định đã có*:
 *
 * 1. Nội dung trên đĩa ghim byte-với-byte theo commit upstream
 *    (`vendor-scenarios.mjs --check`) và mang license upstream. Một bài trong DB
 *    che được nó nghĩa là `--check` vẫn xanh trong khi thứ người học thật sự
 *    nhận đã khác — đúng chế độ hỏng mà việc ghim tồn tại để chặn.
 * 2. Chiều ngược lại (DB thắng) biến bảng nội dung thành một cơ chế ghi đè
 *    ngầm: sửa một bài vendored bằng cách tạo một bài DB trùng id, không để lại
 *    dấu vết nào trong repo.
 *
 * ⛔ Trùng `id` **KHÔNG BAO GIỜ im lặng**: mỗi lần phát hiện là một WARN nêu
 * ĐÍCH DANH cả hai nguồn (`kind` của chúng). Một va chạm id là hoặc một tai nạn
 * (hai người đặt trùng tên) hoặc một mưu toan ghi đè; cả hai đều cần người
 * nhìn thấy. Người soạn bài bị che sẽ báo "bài của tôi không hiện" và WARN này
 * là thứ duy nhất trả lời được vì sao.
 *
 * ## Thứ tự
 *
 * `list*()` trả về đã sắp theo `id` — không phải "đĩa trước rồi DB sau". Phân
 * trang bằng cursor của router (`listInputSchema.cursor`) dựa vào một thứ tự
 * TOÀN PHẦN và ỔN ĐỊNH; nối hai danh sách đã-sắp-riêng lại cho ra một dãy không
 * đơn điệu, và cursor trên dãy đó sẽ bỏ sót hoặc lặp mục ở đúng chỗ nối. Nên
 * gộp xong sắp lại toàn bộ, một lần.
 *
 * ## Lỗi của một nguồn không được giết cả danh sách
 *
 * Cùng kỷ luật mà `filesystemScenarioSource` đã áp cho ba loại nội dung: nếu
 * nguồn DB ném (Postgres sập), `list()` vẫn trả nội dung trên đĩa kèm WARN,
 * chứ không làm `/lessons` trắng trang. Chiều ngược lại cũng vậy.
 *
 * ⚠ Đánh đổi, ghi thẳng ra: một danh sách THIẾU trông y hệt một danh sách ĐỦ.
 * Người học không phân biệt được "hôm nay ít bài" với "một nguồn đang chết".
 * Đó là lý do WARN ở đây phải mang `kind` của nguồn hỏng và phải đi vào log —
 * nó là tín hiệu duy nhất của chế độ hỏng này.
 */

export interface CompositeOptions {
  readonly logger?: ContentSourceLogger;
}

const defaultLogger: ContentSourceLogger = {
  warn(message, detail) {
    console.warn(message, detail);
  },
};

/** Mục có `id` — mọi DTO nội dung đều thoả, nên không cần ba bản của cùng một hàm gộp. */
interface Identified {
  readonly id: string;
}

/**
 * Gọi cùng một method trên mọi nguồn, bỏ qua nguồn ném lỗi.
 *
 * Trả về cặp `(kind, giá trị)` để bước gộp phía sau nêu được đích danh nguồn
 * trong WARN trùng id — không có `kind` thì thông điệp chỉ nói "trùng id" và
 * người đọc vẫn phải tự đi tìm hai nguồn đó là ai.
 */
async function collect<T>(
  sources: readonly ContentSource[],
  method: string,
  call: (source: ContentSource) => Promise<readonly T[]>,
  logger: ContentSourceLogger,
): Promise<readonly (readonly [string, readonly T[]])[]> {
  const settled = await Promise.allSettled(sources.map(async (source) => call(source)));
  const out: (readonly [string, readonly T[]])[] = [];
  for (const [index, result] of settled.entries()) {
    const source = sources[index];
    if (source === undefined) {
      continue;
    }
    if (result.status === 'rejected') {
      logger.warn('[content:composite] một nguồn lỗi — danh sách trả về đang THIẾU', {
        method,
        sourceKind: source.kind,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      continue;
    }
    out.push([source.kind, result.value]);
  }
  return out;
}

/** Gộp theo luật "nguồn đứng trước thắng", sắp theo `id`, WARN mọi va chạm. */
function merge<T extends Identified>(
  batches: readonly (readonly [string, readonly T[]])[],
  method: string,
  logger: ContentSourceLogger,
): T[] {
  const winners = new Map<string, { readonly value: T; readonly sourceKind: string }>();
  for (const [sourceKind, items] of batches) {
    for (const item of items) {
      const existing = winners.get(item.id);
      if (existing === undefined) {
        winners.set(item.id, { value: item, sourceKind });
        continue;
      }
      logger.warn('[content:composite] trùng id giữa hai nguồn — nguồn sau bị CHE', {
        method,
        id: item.id,
        winnerSourceKind: existing.sourceKind,
        shadowedSourceKind: sourceKind,
      });
    }
  }
  return [...winners.values()]
    .map((entry) => entry.value)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * `get*()` — hỏi từng nguồn theo thứ tự, trả về kết quả ĐẦU TIÊN khác `null`.
 *
 * Cố ý KHÔNG hỏi song song rồi chọn: nguồn thắng thường là nguồn đầu, và một
 * truy vấn DB cho một bài chắc chắn bị che là công thừa trên mọi lượt xem bài
 * vendored.
 *
 * Một nguồn ném lỗi thì ghi WARN rồi HỎI TIẾP nguồn sau. `null` chỉ được trả về
 * khi mọi nguồn đều đã trả lời "không có" — đó là điều kiện mà router dịch
 * thành 404, và trả 404 vì Postgres sập là nói với người học rằng bài của họ
 * đã biến mất.
 */
async function firstHit<T>(
  sources: readonly ContentSource[],
  method: string,
  call: (source: ContentSource) => Promise<T | null>,
  logger: ContentSourceLogger,
): Promise<T | null> {
  let failures = 0;
  for (const source of sources) {
    try {
      const found = await call(source);
      if (found !== null) {
        return found;
      }
    } catch (cause) {
      failures += 1;
      logger.warn('[content:composite] một nguồn lỗi khi get — hỏi tiếp nguồn sau', {
        method,
        sourceKind: source.kind,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
  if (failures > 0 && failures === sources.length) {
    // MỌI nguồn đều hỏng: đây KHÔNG phải "không tìm thấy". Trả `null` ở đây sẽ
    // thành 404, và 404 nói rằng bài không tồn tại — một khẳng định ta vừa mất
    // hết cơ sở để đưa ra. Ném để router dịch thành 5xx.
    throw new Error(`Mọi nguồn nội dung đều lỗi ở ${method} — không kết luận được`);
  }
  return null;
}

/**
 * D9 (phase-13) — trang hợp nhất từ N nguồn phân trang độc lập.
 *
 * ## Vì sao validate cursor Ở ĐÂY, không ở từng nguồn
 *
 * Một `cursor` hợp lệ do NGUỒN A phát ra (đĩa) hoàn toàn có thể không tồn tại ở
 * NGUỒN B (DB) — hai không-gian id độc lập, chuyện bình thường. Nếu từng nguồn
 * tự ném khi không thấy id của MÌNH, mọi lượt phân trang bắc cầu qua ranh giới
 * đĩa/DB sẽ 400 oan. Composite là chỗ DUY NHẤT biết "không nguồn nào nhận ra
 * cursor này" — bằng cách hỏi `existsCall` (tái dùng `get`/`getLab`/
 * `getPlayground`, cùng khuôn `firstHit`) trên MỌI nguồn trước khi mở trang.
 * Chỉ khi TẤT CẢ đều trả `null`/lỗi thì cursor mới thật sự vô nghĩa.
 *
 * ## Vì sao KHÔNG over-fetch để xử lý tuyệt đối mọi ca trùng id ở biên trang
 *
 * Mỗi nguồn được hỏi ĐÚNG `options.limit` mục cho trang này (không hỏi thừa để
 * bù phần bị "che" bởi trùng id). Với hai không-gian id gần như rời nhau (đĩa
 * ghim theo commit upstream, DB là bài soạn trên UI — `docs/content-sources.md`)
 * trùng id là ca HIẾM, có cảnh báo (`merge`), không phải đường đi thường. Trường
 * hợp một trang bị trùng id đúng ở biên làm trang đó có ít hơn `limit` mục dù
 * vẫn còn dữ liệu là một giới hạn đã biết, chấp nhận được cho việc phân trang
 * catalog (không phải một luồng cần tính đúng số lượng tuyệt đối).
 */
async function collectPages<T extends { readonly id: string }>(
  sources: readonly ContentSource[],
  method: string,
  call: (source: ContentSource, options: ListPageOptions) => Promise<ContentPage<T>>,
  options: ListPageOptions,
  logger: ContentSourceLogger,
): Promise<readonly (readonly [string, ContentPage<T>])[]> {
  const settled = await Promise.allSettled(sources.map(async (source) => call(source, options)));
  const out: (readonly [string, ContentPage<T>])[] = [];
  for (const [index, result] of settled.entries()) {
    const source = sources[index];
    if (source === undefined) {
      continue;
    }
    if (result.status === 'rejected') {
      logger.warn('[content:composite] một nguồn lỗi khi phân trang — trang trả về đang THIẾU', {
        method,
        sourceKind: source.kind,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      continue;
    }
    out.push([source.kind, result.value]);
  }
  return out;
}

/** Gộp N trang đã-sắp-theo-id (mỗi nguồn tự sắp) thành MỘT trang, đĩa thắng khi trùng id. */
function mergePages<T extends { readonly id: string }>(
  pages: readonly (readonly [string, ContentPage<T>])[],
  limit: number,
  method: string,
  logger: ContentSourceLogger,
): ContentPage<T> {
  const winners = new Map<string, { readonly value: T; readonly sourceKind: string }>();
  for (const [sourceKind, page] of pages) {
    for (const item of page.items) {
      const existing = winners.get(item.id);
      if (existing === undefined) {
        winners.set(item.id, { value: item, sourceKind });
        continue;
      }
      logger.warn('[content:composite] trùng id giữa hai nguồn — nguồn sau bị CHE', {
        method,
        id: item.id,
        winnerSourceKind: existing.sourceKind,
        shadowedSourceKind: sourceKind,
      });
    }
  }
  const merged = [...winners.values()]
    .map((entry) => entry.value)
    .sort((a, b) => a.id.localeCompare(b.id));

  const page = merged.slice(0, limit);
  // Còn trang sau khi: (a) hợp nhất ra nhiều hơn `limit` mục (một vài mục bị
  // cắt bớt ở đây), HOẶC (b) BẤT KỲ nguồn nào tự báo nó còn (`nextCursor` khác
  // null) — kể cả khi trang của riêng nguồn đó không đóng góp mục nào vào top
  // `limit` (mọi mục của nó bị đĩa che), vì nguồn đó vẫn còn dữ liệu ở phía sau.
  const anySourceHasMore = pages.some(([, p]) => p.nextCursor !== null);
  const hasMore = merged.length > limit || anySourceHasMore;
  const last = page[page.length - 1];
  return { items: page, nextCursor: hasMore && last !== undefined ? last.id : null };
}

async function validateCursorExists<T>(
  sources: readonly ContentSource[],
  cursor: string,
  existsCall: (source: ContentSource) => Promise<T | null>,
  method: string,
  logger: ContentSourceLogger,
): Promise<void> {
  const found = await firstHit(sources, `${method}:cursorExists`, existsCall, logger);
  if (found === null) {
    throw new InvalidCursorError(cursor);
  }
}

export function compositeContentSource(
  sources: readonly ContentSource[],
  options: CompositeOptions = {},
): ContentSource {
  if (sources.length === 0) {
    // Errors over silent fallbacks: một composite rỗng trả danh sách rỗng ở mọi
    // lời gọi, và trang `/lessons` trắng trơn trông y hệt "chưa có bài nào".
    throw new Error('compositeContentSource cần ít nhất một nguồn');
  }
  const logger = options.logger ?? defaultLogger;

  return {
    kind: `composite:[${sources.map((s) => s.kind).join(',')}]`,

    async list(): Promise<ScenarioSummary[]> {
      return merge(
        await collect(sources, 'list', async (s) => s.list(), logger),
        'list',
        logger,
      );
    },

    async get(id: string): Promise<Scenario | null> {
      return firstHit(sources, 'get', async (s) => s.get(id), logger);
    },

    async listPage(options: ListPageOptions): Promise<ContentPage<ScenarioSummary>> {
      if (options.cursor !== undefined) {
        await validateCursorExists(sources, options.cursor, async (s) => s.get(options.cursor as string), 'listPage', logger);
      }
      const pages = await collectPages(sources, 'listPage', async (s, o) => s.listPage(o), options, logger);
      return mergePages(pages, options.limit, 'listPage', logger);
    },

    async listLabs(): Promise<LabSummary[]> {
      return merge(
        await collect(sources, 'listLabs', async (s) => s.listLabs(), logger),
        'listLabs',
        logger,
      );
    },

    async getLab(id: string): Promise<Lab | null> {
      return firstHit(sources, 'getLab', async (s) => s.getLab(id), logger);
    },

    async listLabsPage(options: ListPageOptions): Promise<ContentPage<LabSummary>> {
      if (options.cursor !== undefined) {
        await validateCursorExists(sources, options.cursor, async (s) => s.getLab(options.cursor as string), 'listLabsPage', logger);
      }
      const pages = await collectPages(sources, 'listLabsPage', async (s, o) => s.listLabsPage(o), options, logger);
      return mergePages(pages, options.limit, 'listLabsPage', logger);
    },

    async listPlaygrounds(): Promise<PlaygroundSummary[]> {
      return merge(
        await collect(sources, 'listPlaygrounds', async (s) => s.listPlaygrounds(), logger),
        'listPlaygrounds',
        logger,
      );
    },

    async getPlayground(id: string): Promise<Playground | null> {
      return firstHit(sources, 'getPlayground', async (s) => s.getPlayground(id), logger);
    },

    async listPlaygroundsPage(options: ListPageOptions): Promise<ContentPage<PlaygroundSummary>> {
      if (options.cursor !== undefined) {
        await validateCursorExists(
          sources,
          options.cursor,
          async (s) => s.getPlayground(options.cursor as string),
          'listPlaygroundsPage',
          logger,
        );
      }
      const pages = await collectPages(
        sources,
        'listPlaygroundsPage',
        async (s, o) => s.listPlaygroundsPage(o),
        options,
        logger,
      );
      return mergePages(pages, options.limit, 'listPlaygroundsPage', logger);
    },
  };
}
