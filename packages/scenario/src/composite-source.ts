import type { Scenario, ScenarioSummary } from '@devops-platform/shared-types/scenario';
import type { Lab, LabSummary } from '@devops-platform/shared-types/lab';
import type { Playground, PlaygroundSummary } from '@devops-platform/shared-types/playground';
import { ContentSourcesUnavailableError, InvalidCursorError } from './errors.ts';
import {
  compareContent,
  compareCursors,
  decodeContentCursor,
  encodeContentCursor,
  type ContentOrderKey,
  type ContentPage,
  type ContentSource,
  type ContentSortable,
  type ListPageOptions,
} from './source.ts';
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
 * ## Lỗi của một nguồn: `list()` SUY BIẾN, `list*Page()` NÉM
 *
 * Hai luật khác nhau cho hai method nghe rất giống nhau, và điểm khác nhau nằm
 * đúng ở `nextCursor` chứ không ở khẩu vị.
 *
 * `list()` không phát ra mốc nào. Một danh sách thiếu là một ẢNH CHỤP thiếu:
 * lượt sau hỏi lại TOÀN BỘ mọi nguồn, nên nguồn hồi phục là dữ liệu quay về —
 * không mất gì vĩnh viễn. Giữ nguyên kỷ luật cũ mà `filesystemScenarioSource`
 * đã áp: nguồn DB ném (Postgres sập) thì `list()` vẫn trả nội dung trên đĩa kèm
 * WARN, chứ không làm `/lessons` trắng trang.
 *
 * `list*Page()` thì phát ra `nextCursor`, và cursor là một KHẲNG ĐỊNH gửi cho
 * client: *"mọi mục có khoá ≤ mốc này đã được giao"*. Một trang lắp ráp thiếu
 * một nguồn không còn cơ sở cho khẳng định đó ở BẤT KỲ mốc nào — phần chưa đọc
 * được của nguồn hỏng bắt đầu ngay sau cursor vào, và ta không biết trong đó có
 * gì. Client tin mốc ấy, đi tiếp, và KHÔNG BAO GIỜ quay lại.
 *
 * Đã ĐO, không phải suy luận (`composite-source.test.ts` § "một nguồn hỏng MỘT
 * NHỊP"): đĩa giữ `d1,d3,d5,d7,d9`, DB giữ `d2,d4,d6,d8`, `limit=2`, DB timeout
 * đúng ở trang 2 ⇒ `d4` KHÔNG xuất hiện lại ở bất kỳ trang nào sau đó.
 *
 * Và không tồn tại một mốc vừa suy biến vừa trung thực: mốc duy nhất chắc chắn
 * không bỏ sót gì là CHÍNH cursor vào, mà trả lại nó là một vòng lặp đứng yên.
 * Nên `list*Page()` NÉM `ContentSourcesUnavailableError`. Đắt về khả dụng
 * (`/lessons` 5xx dù đĩa vẫn phục vụ được) — đó là cái giá ĐÃ BIẾT, đổi lấy
 * việc không mất dòng trong im lặng. Muốn `/lessons` vẫn hiện phần đọc được thì
 * quyết định đó thuộc về CALLER (bắt lỗi, dựng lại composite chỉ-đĩa, và NÓI
 * với người dùng rằng đang hiện một phần), không thuộc về tầng này — tầng này
 * không có cách nào nói điều đó qua một `ContentPage`.
 *
 * ⛔ MỌI nguồn cùng hỏng thì cả hai đều NÉM, cùng lý do `firstHit` đã ném:
 * `{ items: [], nextCursor: null }` nói "kho rỗng, và hết rồi" — đúng hai khẳng
 * định ta vừa mất sạch cơ sở để đưa ra. Cùng một sự cố hạ tầng mà `/lessons/[id]`
 * trả 5xx còn `/lessons` nói "chưa có bài nào" là một sự bất nhất tự nó đã sai.
 *
 * ⚠ Đánh đổi CÒN LẠI, ghi thẳng ra: với `list()`, một danh sách THIẾU vẫn trông
 * y hệt một danh sách ĐỦ. Người học không phân biệt được "hôm nay ít bài" với
 * "một nguồn đang chết". Đó là lý do WARN ở đây phải mang `kind` của nguồn hỏng
 * và phải đi vào log — nó là tín hiệu duy nhất của chế độ hỏng này.
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
 * Gọi cùng một method trên mọi nguồn, bỏ qua nguồn ném lỗi — TRỪ khi hỏng hết.
 *
 * Trả về cặp `(kind, giá trị)` để bước gộp phía sau nêu được đích danh nguồn
 * trong WARN trùng id — không có `kind` thì thông điệp chỉ nói "trùng id" và
 * người đọc vẫn phải tự đi tìm hai nguồn đó là ai.
 *
 * ⛔ MỌI nguồn hỏng ⇒ NÉM, không trả `[]`. Đây là cùng một chốt mà `firstHit`
 * đã có, chỉ khác vế: `[]` ở đây thành một `/lessons` nói "chưa có bài nào" kèm
 * HTTP 200, trong khi `/lessons/[id]` của cùng sự cố đó trả 5xx.
 */
async function collect<T>(
  sources: readonly ContentSource[],
  method: string,
  call: (source: ContentSource) => Promise<readonly T[]>,
  logger: ContentSourceLogger,
): Promise<readonly (readonly [string, readonly T[]])[]> {
  const settled = await Promise.allSettled(sources.map(async (source) => call(source)));
  const out: (readonly [string, readonly T[]])[] = [];
  let failures = 0;
  for (const [index, result] of settled.entries()) {
    const source = sources[index];
    if (source === undefined) {
      continue;
    }
    if (result.status === 'rejected') {
      failures += 1;
      logger.warn('[content:composite] một nguồn lỗi — danh sách trả về đang THIẾU', {
        method,
        sourceKind: source.kind,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      continue;
    }
    out.push([source.kind, result.value]);
  }
  if (failures > 0 && failures === sources.length) {
    throw new ContentSourcesUnavailableError(method, failures, sources.length);
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
async function firstHitWithFailures<T>(
  sources: readonly ContentSource[],
  method: string,
  call: (source: ContentSource) => Promise<T | null>,
  logger: ContentSourceLogger,
): Promise<{ readonly value: T | null; readonly failures: number }> {
  let failures = 0;
  for (const source of sources) {
    try {
      const found = await call(source);
      if (found !== null) {
        return { value: found, failures };
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
  return { value: null, failures };
}

async function firstHit<T>(
  sources: readonly ContentSource[],
  method: string,
  call: (source: ContentSource) => Promise<T | null>,
  logger: ContentSourceLogger,
): Promise<T | null> {
  const { value, failures } = await firstHitWithFailures(sources, method, call, logger);
  if (value === null && failures > 0 && failures === sources.length) {
    // MỌI nguồn đều hỏng: đây KHÔNG phải "không tìm thấy". Trả `null` ở đây sẽ
    // thành 404, và 404 nói rằng bài không tồn tại — một khẳng định ta vừa mất
    // hết cơ sở để đưa ra. Ném để router dịch thành 5xx.
    throw new ContentSourcesUnavailableError(method, failures, sources.length);
  }
  return value;
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
 * ## Vì sao MỘT nguồn hỏng ở đây là NÉM, khác hẳn `collect`
 *
 * Vì trang này phát ra `nextCursor`, và cursor là khẳng định "mọi mục ≤ mốc này
 * đã được giao" — thứ mà một trang thiếu nguồn không có cơ sở để nói ở BẤT KỲ
 * mốc nào (luật đầy đủ + kịch bản `d4` đã đo: đầu file). Không có mốc suy biến
 * nào trung thực, nên lựa chọn chỉ là NÉM hoặc mất dòng vĩnh viễn trong im lặng.
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
  let failures = 0;
  for (const [index, result] of settled.entries()) {
    const source = sources[index];
    if (source === undefined) {
      continue;
    }
    if (result.status === 'rejected') {
      failures += 1;
      // WARN vẫn ghi cho TỪNG nguồn hỏng dù sắp ném: đây là chỗ DUY NHẤT còn
      // biết nguồn nào hỏng vì lý do gì, và lỗi ném ra cố ý KHÔNG mang những
      // chi tiết đó (nó đi thẳng ra client).
      logger.warn('[content:composite] một nguồn lỗi khi phân trang — KHÔNG trả trang thiếu', {
        method,
        sourceKind: source.kind,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      continue;
    }
    out.push([source.kind, result.value]);
  }
  if (failures > 0) {
    throw new ContentSourcesUnavailableError(method, failures, sources.length);
  }
  return out;
}

/** Gộp N trang đã-sắp (mỗi nguồn tự sắp theo cùng `orderBy`) thành MỘT trang, đĩa thắng khi trùng id. */
function mergePages<T extends ContentSortable>(
  pages: readonly (readonly [string, ContentPage<T>])[],
  limit: number,
  method: string,
  logger: ContentSourceLogger,
  orderBy: ContentOrderKey,
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
  // Sắp bằng CHÍNH comparator mà mỗi nguồn đã dùng. Một `.sort(id)` cứng ở đây
  // là cách âm thầm nhất để mất dòng: mỗi nguồn trả trang đúng theo `orderBy`,
  // composite xếp lại theo `id`, rồi phát `nextCursor` từ mục cuối của thứ tự
  // SAI — lượt sau bỏ qua tất cả những gì nằm giữa hai mốc.
  const merged = [...winners.values()].map((entry) => entry.value).sort(compareContent(orderBy));

  const page = merged.slice(0, limit);
  // Còn trang sau khi: (a) hợp nhất ra nhiều hơn `limit` mục (một vài mục bị
  // cắt bớt ở đây), HOẶC (b) BẤT KỲ nguồn nào tự báo nó còn (`nextCursor` khác
  // null) — kể cả khi trang của riêng nguồn đó không đóng góp mục nào vào top
  // `limit` (mọi mục của nó bị đĩa che), vì nguồn đó vẫn còn dữ liệu ở phía sau.
  const sourceCursors = pages
    .map(([, p]) => p.nextCursor)
    .filter((cursor): cursor is string => cursor !== null);
  const hasMore = merged.length > limit || sourceCursors.length > 0;
  const last = page[page.length - 1];
  if (!hasMore) {
    return { items: page, nextCursor: null };
  }
  if (last !== undefined) {
    return { items: page, nextCursor: encodeContentCursor(orderBy, last) };
  }

  /**
   * Trang hợp nhất RỖNG nhưng có nguồn báo còn dữ liệu — không phải ca giả
   * định: `dbContentSource.pageOf` trả `items: []` kèm `nextCursor` khác null
   * khi MỌI dòng của trang đó rớt schema (`summarize*` trả `null`, ví dụ một
   * lesson đã publish mà 0 bước). Lấy `last.id` là bất khả (không có `last`),
   * và trả `null` ở đây sẽ nói với client "hết rồi" trong khi phía sau còn
   * nguyên dữ liệu HỢP LỆ — mất mát IM LẶNG, đúng chế độ hỏng mà D9 tồn tại
   * để chặn.
   *
   * Lấy cursor NHỎ NHẤT trong các nguồn: mọi nguồn cùng một thứ tự toàn phần
   * `(khoá sắp xếp, id)` tăng dần, nên "sau min" không thể bỏ qua mục nào của
   * bất kỳ nguồn nào. Nó là một cursor THẬT do một nguồn vừa phát ra, nên vòng
   * lặp vẫn tiến (lượt sau bắt đầu sau nó), không quay lại.
   *
   * ⛔ So sánh bằng KHOÁ ĐÃ GIẢI MÃ, không bằng chuỗi. Với `orderBy` khác
   * `'id'` cursor có dạng `'d:2:abc'`, và `'d:10:abc' < 'd:2:abc'` theo chuỗi —
   * tức "min" theo chuỗi có thể là mốc LỚN hơn, và lượt sau nhảy qua dữ liệu.
   */
  const smallest = sourceCursors.reduce((a, b) => (compareCursors(orderBy, a, b) <= 0 ? a : b));
  logger.warn('[content:composite] trang hợp nhất RỖNG nhưng nguồn còn dữ liệu — đi tiếp bằng cursor nhỏ nhất', {
    method,
    nextCursor: smallest,
  });
  return { items: page, nextCursor: smallest };
}

/**
 * Giải mã cursor MỘT LẦN, ở composite, TRƯỚC khi phát tán cho các nguồn — rồi
 * khẳng định `id` của nó tồn tại ở đâu đó.
 *
 * ⛔ Thứ tự hai bước này quan trọng. `collectPages` chạy `Promise.allSettled`,
 * nên một `InvalidCursorError` ném ra TỪ BÊN TRONG một nguồn sẽ bị nuốt thành
 * WARN "một nguồn lỗi — trang trả về đang THIẾU" và client nhận một trang vơi
 * kèm 200 thay vì 400. Giải mã ở đây làm cursor sai định dạng (hoặc cursor của
 * một `orderBy` khác) nổ ra đúng chỗ nó là lỗi của người gọi.
 *
 * Trả về `id` để bước kiểm-tồn-tại dùng — với `orderBy` khác `'id'`, cursor
 * KHÔNG phải một id nên `get(cursor)` sẽ luôn trả `null` và mọi lượt sang trang
 * hai thành 400.
 */
function decodeCursorForPage(
  options: ListPageOptions,
  orderBy: ContentOrderKey,
): string | undefined {
  if (options.cursor === undefined) {
    return undefined;
  }
  return decodeContentCursor(options.cursor, orderBy).id;
}

async function validateCursorExists<T>(
  sources: readonly ContentSource[],
  cursor: string,
  existsCall: (source: ContentSource) => Promise<T | null>,
  method: string,
  logger: ContentSourceLogger,
): Promise<void> {
  const { value, failures } = await firstHitWithFailures(
    sources,
    `${method}:cursorExists`,
    existsCall,
    logger,
  );
  if (value !== null) {
    return;
  }
  if (failures > 0) {
    // Không nguồn nào NHẬN RA cursor, nhưng có nguồn KHÔNG TRẢ LỜI ĐƯỢC — và
    // cursor này hoàn toàn có thể đang nằm đúng ở nguồn đó. `InvalidCursorError`
    // ở đây thành một 400 đổ lỗi cho người gọi về một sự cố hạ tầng, và bảo họ
    // vứt mốc phân trang đi (`catalog-error.tsx`: "thử lại bao nhiêu lần cũng ra
    // đúng lỗi") — trong khi thử lại chính là việc đúng cần làm.
    throw new ContentSourcesUnavailableError(`${method}:cursorExists`, failures, sources.length);
  }
  throw new InvalidCursorError(cursor);
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
      const orderBy = options.orderBy ?? 'id';
      const cursorId = decodeCursorForPage(options, orderBy);
      if (options.cursor !== undefined && cursorId !== undefined) {
        await validateCursorExists(sources, options.cursor, async (s) => s.get(cursorId), 'listPage', logger);
      }
      const pages = await collectPages(sources, 'listPage', async (s, o) => s.listPage(o), options, logger);
      return mergePages(pages, options.limit, 'listPage', logger, orderBy);
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
      const orderBy = options.orderBy ?? 'id';
      const cursorId = decodeCursorForPage(options, orderBy);
      if (options.cursor !== undefined && cursorId !== undefined) {
        await validateCursorExists(sources, options.cursor, async (s) => s.getLab(cursorId), 'listLabsPage', logger);
      }
      const pages = await collectPages(sources, 'listLabsPage', async (s, o) => s.listLabsPage(o), options, logger);
      return mergePages(pages, options.limit, 'listLabsPage', logger, orderBy);
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
      const orderBy = options.orderBy ?? 'id';
      const cursorId = decodeCursorForPage(options, orderBy);
      if (options.cursor !== undefined && cursorId !== undefined) {
        await validateCursorExists(
          sources,
          options.cursor,
          async (s) => s.getPlayground(cursorId),
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
      return mergePages(pages, options.limit, 'listPlaygroundsPage', logger, orderBy);
    },
  };
}
