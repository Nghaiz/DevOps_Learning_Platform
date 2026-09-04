import type {
  ContentKind,
  ContentState,
  ContentVisibility,
} from '@devops-platform/shared-types/authoring';
import {
  scenarioSchema,
  scenarioSummarySchema,
  type Scenario,
  type ScenarioSummary,
} from '@devops-platform/shared-types/scenario';
import {
  labSchema,
  labSummarySchema,
  type Lab,
  type LabSummary,
} from '@devops-platform/shared-types/lab';
import {
  playgroundSchema,
  type Playground,
  type PlaygroundSummary,
} from '@devops-platform/shared-types/playground';
import type { ContentPage, ContentSource, ListPageOptions } from './source.ts';

/**
 * Hiện thực THỨ HAI của `ContentSource` — nội dung SOẠN TRÊN UI, nằm trong
 * Postgres (P9).
 *
 * Đây là ngày mà chú thích cấm ở `source.ts` nói tới: *"bảng đó thuộc về ngày
 * có UI soạn bài, và ngày đó nó là NGUỒN chứ không phải bản sao."* Bảng
 * `content_items` ở đây không chép lại `index.json` của ai cả — nó là nơi duy
 * nhất bài đó tồn tại.
 *
 * ## Vì sao file này không import Drizzle
 *
 * `packages/scenario` không có, và không được có, dependency vào ORM hay vào
 * `apps/web` (`rules/library-third-party-decoupling.md`: core library không
 * hard-reference third-party). Nên nguồn DB nhận một **port** —
 * `ContentRepository` — trả về hàng THÔ; câu SQL thật sống ở
 * `apps/web/src/server/content/repository.ts`.
 *
 * Việc chia đôi như vậy đặt ba thứ vào đúng chỗ:
 * - *luật nhìn thấy gì* (`visibleStates`) là dữ liệu thuần, kiểm được không cần DB;
 * - *ánh xạ hàng → DTO* + validate nằm ở đây, dùng chung cho mọi backend;
 * - *câu WHERE* nằm ở nơi có Drizzle.
 *
 * ## Vì sao KHÔNG cache
 *
 * `filesystemScenarioSource` cache promise cả vòng đời tiến trình, và đúng: nội
 * dung của nó được nướng vào image lúc build, không đổi được. Nguồn này thì
 * đổi bất cứ lúc nào — task 11 của phase-9 nói thẳng cái giá: *"một bài vừa sửa
 * mà 5 phút sau mới thấy là một lỗi người soạn sẽ báo là 'mất bài'"*. Nên mỗi
 * lời gọi là một truy vấn. `list()` chỉ đọc cột metadata (không chạm markdown),
 * nên cái giá đó là một `SELECT` hẹp trên vài chục dòng, không phải một lần
 * đọc toàn bộ nội dung.
 */

/** Hàng metadata cho `list*()` — KHÔNG chứa markdown/script/bytes. */
export interface ContentItemRow {
  readonly id: string;
  readonly kind: ContentKind;
  readonly state: ContentState;
  readonly authorId: string;
  readonly title: string;
  readonly description: string | null;
  readonly difficulty: string | null;
  readonly estimatedMinutes: number | null;
  readonly tier: string;
  readonly capabilities: readonly string[];
  readonly backendImageId: string;
  readonly interfaceLayout: string | null;
  /** Lab. */
  readonly passThresholdPercent: number | null;
  /** Lab. */
  readonly leaderboard: boolean | null;
  /** Playground. */
  readonly ttlSeconds: number | null;
  /**
   * `count(content_steps)` — TÍNH ở câu truy vấn, không phải một cột.
   *
   * Đây chính là lý do phase-9 task 6 cấm cột `stepCount`, và lý do nó vẫn có
   * mặt ở đây: nó là kết quả của một phép đếm chạy lúc đọc, không phải một giá
   * trị lưu sẵn có thể lệch khỏi số bước thật.
   */
  readonly stepCount: number;
}

/** Một bước (lesson) hoặc một task (lab) — cùng một bảng, cùng một hàng. */
export interface ContentStepRow {
  readonly ordinal: number;
  /** Lab: `LabTask.id` bền. Lesson: `null` (vị trí LÀ định danh, khớp `progress.step_index`). */
  readonly taskId: string | null;
  readonly title: string | null;
  readonly markdown: string;
  readonly setupForeground: string | null;
  readonly setupBackground: string | null;
  readonly verifyScript: string | null;
  /** Lab. */
  readonly weight: number | null;
  /** Lab. */
  readonly hint: string | null;
}

/** Phần thân chỉ `get*()` mới đọc. */
export interface ContentBodyRow {
  readonly item: ContentItemRow;
  readonly steps: readonly ContentStepRow[];
  /** `intro`/`finish` của lesson và `setup` của lab — jsonb đã parse, chưa validate. */
  readonly intro: unknown;
  readonly finish: unknown;
  readonly setup: unknown;
  /** `ScenarioAsset[]` (file đẩy vào sandbox) — jsonb đã parse, chưa validate. */
  readonly assets: unknown;
}

/**
 * Port giữa nguồn nội dung và kho lưu trữ.
 *
 * `visibility` đi vào TỪNG lời gọi chứ không được chốt lúc dựng repository: một
 * tiến trình phục vụ nhiều người xem cùng lúc, và một repository "đã biết mình
 * phục vụ ai" là đúng hình dạng của lỗi rò dữ liệu giữa các request.
 */
export interface ContentRepository {
  listItems(
    kind: ContentKind,
    visibility: ContentVisibility,
  ): Promise<readonly ContentItemRow[]>;
  getItem(
    id: string,
    kind: ContentKind,
    visibility: ContentVisibility,
  ): Promise<ContentBodyRow | null>;
  /**
   * D9 (phase-13) — trang metadata, đẩy `WHERE id > cursor … LIMIT n+1` xuống
   * Postgres thay vì đọc hết bảng rồi cắt lát ở TS. `items` có thể dài tới
   * `options.limit + 1` dòng — dòng thừa (nếu có) là tín hiệu "còn trang sau",
   * KHÔNG được trả cho caller của `dbContentSource`; `hasMore` đã nói thay cho
   * caller nên `db-source.ts` không cần tự đếm lại.
   *
   * `filter.difficulty` bị BỎ QUA khi `kind === 'playground'` — cột đó luôn
   * `NULL` cho playground (`content_items.difficulty`, xem `schema.ts`), nên áp
   * cứng điều kiện đó vào WHERE sẽ luôn trả 0 dòng thay vì hành vi "bỏ qua điều
   * kiện không áp dụng được" mà nguồn đĩa đã chọn (`matchesContentFilter`) — hai
   * nguồn phải khớp nhau, không thì kết quả composite phụ thuộc bài nằm ở đĩa
   * hay ở DB.
   */
  listItemsPage(
    kind: ContentKind,
    visibility: ContentVisibility,
    options: ListPageOptions,
  ): Promise<{ readonly items: readonly ContentItemRow[]; readonly hasMore: boolean }>;
}

/** Nơi nhận cảnh báo. Cố ý là một field chứ không phải `console` chôn cứng — test phải đọc được. */
export interface ContentSourceLogger {
  warn(message: string, detail: Record<string, unknown>): void;
}

const defaultLogger: ContentSourceLogger = {
  warn(message, detail) {
    console.warn(message, detail);
  },
};

export interface DbContentSourceOptions {
  readonly visibility?: ContentVisibility;
  readonly logger?: ContentSourceLogger;
}

/**
 * Ánh xạ một hàng + thân thành DTO, rồi **validate bằng đúng schema mà nội dung
 * trên đĩa phải qua**.
 *
 * Đây là luật 12 của phase-9 ở dạng thi hành được: nếu nguồn DB được phép trả
 * về một hình dạng mà `scenarioSchema` từ chối, thì format thứ hai đã hình
 * thành — và nó sẽ hình thành ở đây, âm thầm, chứ không ở trang soạn.
 *
 * Hàng hỏng bị **BỎ QUA kèm WARN**, không ném. Lý do là kỷ luật đã có ở
 * `filesystemScenarioSource` (ba cache tách rời "vì ba loại nội dung có thể
 * hỏng ĐỘC LẬP"): một bài soạn sai không được phép làm `/lessons` ngừng phục
 * vụ. Ném ở đây biến một dòng dữ liệu xấu thành một sự cố toàn nền tảng.
 */
function toScenario(body: ContentBodyRow, logger: ContentSourceLogger): Scenario | null {
  const { item } = body;
  const candidate = {
    id: item.id,
    title: item.title,
    description: item.description,
    difficulty: item.difficulty,
    estimatedMinutes: item.estimatedMinutes,
    tier: item.tier,
    capabilities: item.capabilities,
    // UI soạn bài (P9) chưa có ô này ⇒ `null` = "giống thứ image cung cấp",
    // đúng hành vi của mọi bài DB trước 2026-09-04.
    requiresCapabilities: null,
    backendImageId: item.backendImageId,
    interfaceLayout: item.interfaceLayout,
    assets: body.assets ?? [],
    // ⛔ KHÔNG có cột `source`, và đó là một khẳng định chứ không phải thiếu
    // sót: `scenarioSourceSchema` mô tả một bài NHẬP TỪ upstream (repo, commit
    // đã ghim, license). Bài soạn trên UI không có upstream — chú thích của
    // chính field đó đã nói trước điều này ("bản ScenarioSource chạy trên DB sẽ
    // sinh ra toàn bài không có upstream"). Một cột luôn NULL là một cột nói
    // dối về việc nó có thể khác NULL.
    source: null,
    intro: body.intro ?? null,
    finish: body.finish ?? null,
    steps: body.steps.map((step) => ({
      index: step.ordinal,
      title: step.title,
      markdown: step.markdown,
      setup: { foreground: step.setupForeground, background: step.setupBackground },
      verifyScript: step.verifyScript,
    })),
    // Cùng lý do như `source`: không có upstream thì không có field upstream nào
    // để bỏ qua. Hằng số, không phải cột.
    ignoredUpstreamFields: [],
  };

  const parsed = scenarioSchema.safeParse(candidate);
  if (!parsed.success) {
    logger.warn('[content:db] bỏ qua lesson không hợp lệ', {
      id: item.id,
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return null;
  }
  return parsed.data;
}

function toLab(body: ContentBodyRow, logger: ContentSourceLogger): Lab | null {
  const { item } = body;
  const candidate = {
    id: item.id,
    title: item.title,
    description: item.description,
    difficulty: item.difficulty,
    estimatedMinutes: item.estimatedMinutes,
    tier: item.tier,
    capabilities: item.capabilities,
    // UI soạn bài (P9) chưa có ô này ⇒ `null` = "giống thứ image cung cấp",
    // đúng hành vi của mọi bài DB trước 2026-09-04.
    requiresCapabilities: null,
    backendImageId: item.backendImageId,
    interfaceLayout: item.interfaceLayout,
    assets: body.assets ?? [],
    source: null,
    setup: body.setup ?? { foreground: null, background: null },
    passThresholdPercent: item.passThresholdPercent,
    leaderboard: item.leaderboard,
    tasks: body.steps.map((step) => ({
      // `taskId` là ĐỊNH DANH BỀN (xem `labTaskIdSchema`): nó KHÔNG suy từ
      // `ordinal`. Chèn một task vào giữa mà id suy từ vị trí thì mọi dòng
      // `lab_task_results` cũ trỏ nhầm task — không lỗi, chỉ là điểm gắn sai
      // việc. `null` ở đây sẽ trượt schema, và trượt là câu trả lời đúng.
      id: step.taskId,
      title: step.title,
      markdown: step.markdown,
      verifyScript: step.verifyScript,
      weight: step.weight,
      hint: step.hint,
    })),
  };

  const parsed = labSchema.safeParse(candidate);
  if (!parsed.success) {
    logger.warn('[content:db] bỏ qua lab không hợp lệ', {
      id: item.id,
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return null;
  }
  return parsed.data;
}

function toPlayground(body: ContentBodyRow, logger: ContentSourceLogger): Playground | null {
  const { item } = body;
  const candidate = {
    id: item.id,
    title: item.title,
    description: item.description,
    tier: item.tier,
    capabilities: item.capabilities,
    backendImageId: item.backendImageId,
    interfaceLayout: item.interfaceLayout,
    ttlSeconds: item.ttlSeconds,
  };

  const parsed = playgroundSchema.safeParse(candidate);
  if (!parsed.success) {
    logger.warn('[content:db] bỏ qua playground không hợp lệ', {
      id: item.id,
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return null;
  }
  return parsed.data;
}

/**
 * Nguồn nội dung đọc từ Postgres.
 *
 * `visibility` mặc định `published-only` — **fail-closed**. Một caller quên
 * truyền tầm nhìn sẽ thấy ÍT hơn nó được phép, không nhiều hơn; chiều ngược lại
 * là rò bài nháp của người khác ra trang công khai.
 */
export function dbContentSource(
  repo: ContentRepository,
  options: DbContentSourceOptions = {},
): ContentSource {
  const visibility: ContentVisibility = options.visibility ?? { kind: 'published-only' };
  const logger = options.logger ?? defaultLogger;

  /**
   * `list()` KHÔNG đi qua `get()`.
   *
   * Cám dỗ là gọi `getItem` cho từng dòng rồi `toScenarioSummary` — ngắn hơn,
   * và sai đúng cái sai mà ranh giới rút-gọn-vs-đầy-đủ của seam tồn tại để
   * chặn: nó đọc markdown của mọi bước của mọi bài chỉ để vẽ một lưới thẻ.
   * Nên bản rút gọn được dựng THẲNG từ hàng metadata.
   */
  function summarizeScenario(row: ContentItemRow): ScenarioSummary | null {
    const candidate = {
      id: row.id,
      title: row.title,
      description: row.description,
      difficulty: row.difficulty,
      estimatedMinutes: row.estimatedMinutes,
      tier: row.tier,
      capabilities: row.capabilities,
      stepCount: row.stepCount,
    };
    // Parse bằng CHÍNH schema mà `/lessons` phụ thuộc, để một bài 0 bước
    // (nháp) không lọt vào danh sách người học dưới dạng một thẻ bấm vào là
    // trang trắng — `scenarioSummarySchema` đòi `stepCount` dương.
    const parsed = scenarioSummarySchema.safeParse(candidate);
    if (!parsed.success) {
      logger.warn('[content:db] bỏ qua lesson không hợp lệ ở list()', {
        id: row.id,
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return null;
    }
    return parsed.data;
  }

  function summarizeLab(row: ContentItemRow): LabSummary | null {
    const candidate = {
      id: row.id,
      title: row.title,
      description: row.description,
      difficulty: row.difficulty,
      estimatedMinutes: row.estimatedMinutes,
      tier: row.tier,
      capabilities: row.capabilities,
      passThresholdPercent: row.passThresholdPercent,
      leaderboard: row.leaderboard,
      taskCount: row.stepCount,
    };
    const parsed = labSummarySchema.safeParse(candidate);
    if (!parsed.success) {
      logger.warn('[content:db] bỏ qua lab không hợp lệ ở listLabs()', {
        id: row.id,
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return null;
    }
    return parsed.data;
  }

  /**
   * D9 — vế chung của ba `list*Page`: gọi `repo.listItemsPage`, ánh xạ+validate
   * TỪNG dòng bằng đúng `summarize` (schema thật), rồi tính `nextCursor` từ
   * dòng RAW cuối (không phải dòng đã summarize — một dòng bị lọc vì hỏng vẫn
   * phải tính vào vị trí cursor, nếu không trang sau sẽ đọc lại đúng dòng hỏng
   * đó mãi mãi).
   */
  async function pageOf<T extends { readonly id: string }>(
    kind: ContentKind,
    options: ListPageOptions,
    summarize: (row: ContentItemRow) => T | null,
  ): Promise<ContentPage<T>> {
    const { items: rows, hasMore } = await repo.listItemsPage(kind, visibility, options);
    const page = hasMore ? rows.slice(0, options.limit) : rows;
    const lastRaw = page[page.length - 1];
    return {
      items: page.map(summarize).filter((s): s is T => s !== null),
      nextCursor: hasMore && lastRaw !== undefined ? lastRaw.id : null,
    };
  }

  return {
    kind: `db:${visibility.kind}`,

    async list() {
      const rows = await repo.listItems('lesson', visibility);
      return rows
        .map(summarizeScenario)
        .filter((s): s is ScenarioSummary => s !== null)
        .sort((a, b) => a.id.localeCompare(b.id));
    },

    async get(id: string) {
      const body = await repo.getItem(id, 'lesson', visibility);
      return body === null ? null : toScenario(body, logger);
    },

    async listPage(options: ListPageOptions) {
      return pageOf('lesson', options, summarizeScenario);
    },

    async listLabs() {
      const rows = await repo.listItems('lab', visibility);
      return rows
        .map(summarizeLab)
        .filter((s): s is LabSummary => s !== null)
        .sort((a, b) => a.id.localeCompare(b.id));
    },

    async getLab(id: string) {
      const body = await repo.getItem(id, 'lab', visibility);
      return body === null ? null : toLab(body, logger);
    },

    async listLabsPage(options: ListPageOptions) {
      return pageOf('lab', options, summarizeLab);
    },

    async listPlaygroundsPage(options: ListPageOptions) {
      return pageOf('playground', options, (row) =>
        toPlayground(
          { item: row, steps: [], intro: null, finish: null, setup: null, assets: [] },
          logger,
        ),
      );
    },

    async listPlaygrounds() {
      const rows = await repo.listItems('playground', visibility);
      const out: PlaygroundSummary[] = [];
      for (const row of rows) {
        // Playground không có thân riêng — mọi field của nó là metadata, nên
        // `list` và `get` trả cùng một hình dạng (`playgroundSummarySchema =
        // playgroundSchema`). Dựng qua `toPlayground` với thân rỗng để có ĐÚNG
        // một chỗ ánh xạ, thay vì hai bản dễ trôi khỏi nhau.
        const full = toPlayground(
          { item: row, steps: [], intro: null, finish: null, setup: null, assets: [] },
          logger,
        );
        if (full !== null) {
          out.push(full);
        }
      }
      return out.sort((a, b) => a.id.localeCompare(b.id));
    },

    async getPlayground(id: string) {
      const body = await repo.getItem(id, 'playground', visibility);
      return body === null ? null : toPlayground(body, logger);
    },
  };
}
