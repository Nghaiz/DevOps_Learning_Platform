import { z } from 'zod';

import { scenarioIdSchema } from './scenario.ts';

/**
 * Từ vựng của nội dung SOẠN TRÊN UI (P9 — ràng buộc dài hạn #4 của chủ dự án:
 * "soạn bài trực tiếp trên UI, không hardcode vào repo").
 *
 * Vì sao nó nằm ở `shared-types` chứ không ở `packages/scenario`: cả hai phía
 * của seam cần nó. `packages/scenario` cần nó để `dbContentSource` biết đang
 * hỏi loại nội dung nào; `apps/web` cần nó để dựng `pgEnum` và router soạn bài.
 * Đặt nó ở một trong hai bên là ép bên kia import chéo qua một package vốn
 * không phải chỗ của nó.
 *
 * ⛔ Đây KHÔNG phải một cây DTO thứ tư. Nội dung soạn trên UI dùng LẠI nguyên
 * vẹn `scenarioSchema` / `labSchema` / `playgroundSchema` — đó là toàn bộ nội
 * dung của luật 12 trong `plans/devops-learning-platform/phase-9.md`: "một bài
 * lưu được nhưng chạy hỏng là format thứ hai đang hình thành". File này chỉ
 * thêm từ vựng cho *vòng đời* (nháp/xuất bản) và *quyền sở hữu*, hai thứ mà
 * nội dung trên đĩa không có vì nó không có tác giả và không có trạng thái.
 */

/**
 * Ba loại nội dung chạy được, khớp một-một với ba cặp method của `ContentSource`
 * (`list`/`get`, `listLabs`/`getLab`, `listPlaygrounds`/`getPlayground`).
 *
 * Thứ tự ở đây là thứ tự của `pgEnum('content_kind', …)`. Thêm giá trị chỉ được
 * phép NỐI VÀO CUỐI: Postgres không cho xoá/đổi chỗ giá trị enum mà không viết
 * lại kiểu, và một migration làm việc đó trên bảng đang có dữ liệu là một cuộc
 * khoá bảng.
 */
export const CONTENT_KINDS = ['lesson', 'lab', 'playground'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/**
 * Vòng đời một bài soạn trên UI.
 *
 * `publishing` KHÔNG có trong bản phác của phase-9 (task 18 chỉ nói "chạy thử
 * thật rồi mới đổi state"). Nó được thêm vì lượt chạy thử đó KHÔNG vừa trong
 * một request: dựng sandbox mất tới ~49 s cho bài `kubernetes` (đo ở P7), rồi
 * còn setup + verify của TỪNG bước. Một mutation đồng bộ chờ hết chuỗi đó sẽ
 * chạm trần `BFF_TIMEOUT_MS` (135 s) ở bài nhiều bước, và người soạn nhận "lỗi
 * mạng" cho một lượt xuất bản có thể đã thành công.
 *
 * Nên `publish` đổi state sang `publishing` rồi trả ngay, và một tiến trình nền
 * chạy thử thật rồi đặt `published` (đạt) hoặc trả về `draft` kèm
 * `publishError` (trượt). Người soạn thấy trạng thái thật thay vì một cái quay
 * vòng không biết đã tới đâu.
 *
 * ⛔ `archived` thay cho XOÁ (task 19): bài đã có tiến độ của người học không
 * được biến mất — `progress.lesson_id` và `lab_attempts.lab_id` là cột text
 * KHÔNG có foreign key, nên xoá một bài không làm chúng lỗi, nó chỉ làm chúng
 * trỏ vào hư không trong im lặng.
 */
export const CONTENT_STATES = ['draft', 'publishing', 'published', 'archived'] as const;
export type ContentState = (typeof CONTENT_STATES)[number];

/**
 * Ai đang hỏi — và vì thế được thấy những state nào.
 *
 * Luật 9 của phase-9 ở dạng mạnh: **điều kiện này nằm trong NGUỒN, không rải ra
 * router.** `dbContentSource` nhận đúng một giá trị kiểu này và tự dịch nó
 * thành tập state được phép; không có procedure nào tự viết
 * `where(state = 'published')`.
 *
 * `author` mang `authorId` chứ không mang cả object user: nguồn nội dung không
 * có việc gì với email, tên, hay session của ai cả.
 */
export type ContentVisibility =
  /** Người học (và mọi khách chưa đăng nhập): CHỈ `published`. */
  | { readonly kind: 'published-only' }
  /** Tác giả: `published` của mọi người + MỌI state của CHÍNH MÌNH. */
  | { readonly kind: 'author'; readonly authorId: string }
  /** Quản trị: mọi state của mọi người. */
  | { readonly kind: 'admin' };

/**
 * State nào được nhìn thấy, cho một tầm nhìn.
 *
 * Hàm THUẦN, và cố ý tách khỏi cả nguồn lẫn repository: nó là *luật*, nên nó
 * phải kiểm được bằng một test không cần Postgres.
 *
 * `archived` KHÔNG nằm trong tập của `published-only`: một bài đã thu hồi phải
 * biến mất khỏi danh sách bài học, kể cả khi tiến độ cũ trỏ vào nó (task 19 giữ
 * *dữ liệu*, không giữ *chỗ trong catalog*).
 */
export function visibleStates(visibility: ContentVisibility): readonly ContentState[] {
  switch (visibility.kind) {
    case 'published-only':
      return ['published'];
    case 'author':
      // `publishing` có mặt để tác giả thấy bài đang chạy thử — không thấy nó
      // thì lượt xuất bản trông như đã nuốt mất bài.
      return ['draft', 'publishing', 'published', 'archived'];
    case 'admin':
      return ['draft', 'publishing', 'published', 'archived'];
  }
}

/**
 * Với một tầm nhìn `author`, các state ngoài `published` chỉ áp cho bài của
 * CHÍNH tác giả đó. `null` = không giới hạn theo tác giả.
 *
 * Tách khỏi `visibleStates` vì đây là hai vế của cùng một mệnh đề WHERE và
 * gộp chúng thành một hàm trả về SQL sẽ kéo Drizzle vào `packages/shared-types`.
 */
export function ownDraftsAuthorId(visibility: ContentVisibility): string | null {
  return visibility.kind === 'author' ? visibility.authorId : null;
}

/**
 * Trần cỡ MỘT asset tải lên.
 *
 * 2 MiB, và con số đó là hệ quả của việc chọn lưu bytes trong Postgres
 * (`content_assets.bytes`, `bytea`) thay vì trên PVC. Lý do chọn: `web` chạy
 * `replicaCount: 2` (`infra/helm/platform/values.yaml`) và storageclass duy
 * nhất trên cụm là `local-path`, vốn là **RWO** — chart đã ghi đúng điều đó cho
 * registry-mirror ("Recreate vì PVC là RWO: hai pod cùng mount một PV
 * local-path không lên"). Một asset ghi qua pod A sẽ 404 ở pod B trong nửa số
 * lượt. Postgres là kho DÙNG CHUNG duy nhất đang có.
 *
 * Cái giá phải trả, ghi thẳng ra để không ai tưởng đây là lựa chọn miễn phí:
 * mỗi lượt phục vụ ảnh là một truy vấn DB, và `pg_dump` phình theo nội dung.
 * Trần 2 MiB + allowlist ảnh giữ cái giá đó trong tầm; nội dung nặng hơn thế
 * là dấu hiệu cần một object store thật (MinIO), không phải cần nới trần.
 */
export const MAX_CONTENT_ASSET_BYTES = 2 * 1024 * 1024;

/**
 * Kiểu file được phép tải lên, ĐUÔI → content-type.
 *
 * Allowlist theo ĐUÔI, không blocklist — cùng kỷ luật với route phục vụ asset
 * đã có (`/api/scenarios/[id]/assets/[...path]`), và vì cùng một lý do: một
 * blocklist chỉ đúng với những đuôi người viết nó nghĩ ra được.
 *
 * ⛔ Cố ý KHÔNG có `.svg` dù route phục vụ có. Route đó phục vụ nội dung
 * vendored đã ghim byte theo commit upstream — ai đó đã review nó. Ảnh SVG tải
 * lên là XML người lạ nhập, mang script được, và lớp phòng thủ duy nhất là
 * header CSP của route. Hai lớp (không nhận + CSP) rẻ hơn một.
 */
export const CONTENT_ASSET_TYPES: ReadonlyMap<string, string> = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
]);

/**
 * Tên file người soạn tải lên — giữ ĐỂ HIỂN THỊ, không bao giờ để nối đường dẫn.
 *
 * Đường dẫn thật là `storageKey` do server sinh (task 16). Schema này vì thế
 * chỉ cần chặn những gì làm hỏng phần *hiển thị*: chuỗi rỗng, quá dài, ký tự
 * điều khiển, và dấu phân cách đường dẫn (một tên chứa `/` không sai về mặt
 * lưu trữ nữa, nhưng nó là dấu hiệu ai đó vẫn đang nghĩ tên file là đường dẫn).
 */
export const contentAssetFilenameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    // Kiểm theo CODE POINT, không bằng một regex chứa dải ký tự điều khiển thô:
    // dải đó đi vào file nguồn dưới dạng byte không nhìn thấy được, và không ai
    // review nổi một thứ không hiện ra trên màn hình (eslint `no-control-regex`
    // bắt đúng chuyện này).
    (name) => ![...name].some((ch) => ch < ' ' || ch === '\u007f' || ch === '/' || ch === '\\'),
    'tên file không được chứa ký tự điều khiển hay dấu / \\',
  )
  .refine((name) => name !== '.' && name !== '..', 'tên file không được là . hoặc ..');

/**
 * `storageKey` — định danh lưu trữ do SERVER sinh, và là thứ duy nhất đi vào URL.
 *
 * 32 hex ký tự (`randomUUID` bỏ dấu gạch). Không mang đuôi file: content-type
 * đã có cột riêng, và một đuôi trong key là một mẩu dữ liệu người dùng nhập
 * quay lại đường dẫn qua cửa sau.
 */
export const contentStorageKeySchema = z.string().regex(/^[0-9a-f]{32}$/, 'storageKey không hợp lệ');

/** Một asset đã tải lên, hình dạng TRẢ VỀ (không kèm bytes). */
export const contentAssetSchema = z
  .object({
    storageKey: contentStorageKeySchema,
    filename: contentAssetFilenameSchema,
    contentType: z.string().min(1),
    /**
     * ⛔ KHÔNG có `sizeBytes` dù phase-9 task 7 liệt kê nó: bytes nằm cùng
     * dòng, nên cỡ là `octet_length(bytes)` — tính được 100%, đúng thứ mà
     * `rules/code-conventions.md` § No Derived Fields cấm. Cỡ được TÍNH ở chỗ
     * dùng, cùng cách `stepCount` và `LabScore.percent` đã làm.
     *
     * ✅ `sha256` thì CÓ, và nó không phải cùng loại: nó là *nhân chứng của thứ
     * đã nhận lúc tải lên*, tính một lần ở biên nhập. Tính lại nó từ chính bytes
     * đang lưu để so với chính nó thì không chứng minh được gì; giữ lại giá trị
     * lúc nhận thì phát hiện được hỏng ngầm, và làm được ETag mà không phải đọc
     * cả blob.
     */
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    /** ISO 8601 — xem ghi chú `checkedAt` ở `lab.ts`. */
    uploadedAt: z.string(),
  })
  .strict();
export type ContentAsset = z.infer<typeof contentAssetSchema>;

/**
 * Một dòng trong danh sách của TRANG SOẠN — cố ý KHÁC `ScenarioSummary`.
 *
 * `ScenarioSummary` là hợp đồng của trang `/lessons` và nó đòi
 * `stepCount ≥ 1`; một bài nháp mới tạo có 0 bước và sẽ không qua nổi schema
 * đó. Ép bài nháp vào khuôn của người học là cách nhanh nhất để hoặc nới lỏng
 * hợp đồng của người học, hoặc làm trang soạn không hiện được bài vừa tạo.
 */
export const authoringItemSchema = z
  .object({
    id: scenarioIdSchema,
    kind: z.enum(CONTENT_KINDS),
    state: z.enum(CONTENT_STATES),
    authorId: z.string().min(1),
    title: z.string().min(1),
    /** TÍNH bằng `count(content_steps)` ở chỗ truy vấn — không phải cột. */
    stepCount: z.number().int().min(0),
    /** `null` khi lượt xuất bản gần nhất chưa chạy hoặc đã đạt. */
    publishError: z.string().nullable(),
    /** ISO 8601. */
    updatedAt: z.string(),
    /** ISO 8601, `null` khi chưa từng xuất bản. */
    publishedAt: z.string().nullable(),
  })
  .strict();
export type AuthoringItem = z.infer<typeof authoringItemSchema>;
