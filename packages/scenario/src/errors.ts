/**
 * Lỗi nhập scenario — LUÔN ném, không bao giờ trả về một scenario "gần đúng".
 *
 * `rules/development-principles.md` § Errors Over Silent Fallbacks áp dụng đặc
 * biệt gắt ở đây: một scenario hỏng mà vẫn nạp được sẽ hiện ra ở FE dưới dạng
 * step trắng hoặc nút Check không bao giờ pass, và người đọc log sẽ đi tìm lỗi ở
 * validation engine (2.C) chứ không ở một field JSON sai tên.
 */
export class ScenarioError extends Error {
  /** Thư mục scenario gây lỗi — luôn có, vì thông báo trần không định vị được. */
  readonly scenarioDir: string;

  constructor(scenarioDir: string, message: string, options?: { cause?: unknown }) {
    super(`scenario ${scenarioDir}: ${message}`, options);
    this.name = 'ScenarioError';
    this.scenarioDir = scenarioDir;
  }
}

/**
 * Cursor phân trang (D9, phase-13) không trỏ tới bất kỳ mục nào — ở BẤT KỲ
 * nguồn nào đã được hỏi.
 *
 * ⛔ Chỉ `compositeContentSource` (và mọi caller gọi thẳng MỘT nguồn không qua
 * composite) được phép ném lỗi này. `listPage`/`listLabsPage`/`listPlaygroundsPage`
 * của TỪNG nguồn riêng lẻ (`filesystemScenarioSource`, `dbContentSource`)
 * KHÔNG được validate sự tồn tại của cursor — chúng chỉ lọc `id > cursor`
 * (keyset thuần, mạnh hơn "tìm-chỉ-số-rồi-+1" vì nó không cần cursor tồn tại
 * để vẫn cho ra kết quả đúng).
 *
 * Lý do bắt buộc tách validate ra khỏi từng nguồn: một cursor hợp lệ do NGUỒN
 * A phát ra (vd một scenario trên đĩa) hoàn toàn có thể không tồn tại ở NGUỒN B
 * (DB) — đó là chuyện BÌNH THƯỜNG của hai không-gian id độc lập, không phải một
 * cursor hỏng. Nếu từng nguồn tự ném khi không thấy id của mình, composite sẽ
 * 400 oan cho MỌI lượt phân trang bắc cầu qua ranh giới đĩa/DB. Composite là
 * chỗ DUY NHẤT biết "không nguồn nào nhận ra cursor này" — nó hỏi tất cả
 * (`get`/`getLab`/`getPlayground`) trước khi kết luận cursor thật sự vô nghĩa.
 */
export class InvalidCursorError extends Error {
  readonly cursor: string;

  constructor(cursor: string) {
    super(`Cursor không còn hợp lệ: ${cursor}`);
    this.name = 'InvalidCursorError';
    this.cursor = cursor;
  }
}

/**
 * KHÔNG ĐỌC ĐƯỢC kho nội dung — một khẳng định khác hẳn "kho đang trống".
 *
 * `compositeContentSource` ném lỗi này thay vì trả một câu trả lời rỗng/thiếu ở
 * ba tình huống, tất cả cùng một hình dạng: *ta sắp phát ra một khẳng định vừa
 * mất hết cơ sở để đưa ra*.
 *
 * 1. **Mọi nguồn hỏng ở `get*`** — `null` sẽ thành 404, và 404 nói "bài này
 *    không tồn tại".
 * 2. **Mọi nguồn hỏng ở `list*` / `list*Page`** — `[]` + `nextCursor: null` nói
 *    "kho rỗng, và hết rồi". Cùng một sự cố hạ tầng mà `/lessons/[id]` trả 5xx
 *    còn `/lessons` nói "chưa có bài nào" là một sự bất nhất tự nó đã sai.
 * 3. **MỘT nguồn hỏng ở `list*Page`** — `nextCursor` là khẳng định "mọi mục có
 *    khoá ≤ mốc này đã được giao". Một trang thiếu một nguồn không có cơ sở cho
 *    khẳng định đó ở bất kỳ mốc nào, và client tin mốc ấy rồi KHÔNG BAO GIỜ
 *    quay lại phần bị bỏ qua. Xem luật đầy đủ ở đầu `composite-source.ts`.
 *
 * ⛔ Thông điệp CỐ Ý không mang chi tiết tầng dưới (câu SQL, đường dẫn đĩa,
 * `kind` của nguồn) và CỐ Ý không đính `cause`: lỗi này đi thẳng ra client. Chi
 * tiết chẩn đoán đã nằm trong WARN mà composite ghi cho TỪNG nguồn hỏng ngay
 * trước khi ném — log có đủ, client không cần.
 */
export class ContentSourcesUnavailableError extends Error {
  /** Method của `ContentSource` (`list`, `listPage`, …) — từ vựng của chính lớp này. */
  readonly method: string;
  readonly failedSources: number;
  readonly totalSources: number;

  constructor(method: string, failedSources: number, totalSources: number) {
    super(
      failedSources >= totalSources
        ? `Mọi nguồn nội dung đều lỗi ở ${method} — không kết luận được đây là "kho đang trống" hay "đang mất kết nối". Vui lòng thử lại sau ít phút.`
        : `Một nguồn nội dung không trả lời ở ${method} — không trả về một trang thiếu dữ liệu, vì mốc phân trang phát ra từ nó sẽ bỏ qua VĨNH VIỄN phần chưa đọc được. Vui lòng thử lại sau ít phút.`,
    );
    this.name = 'ContentSourcesUnavailableError';
    this.method = method;
    this.failedSources = failedSources;
    this.totalSources = totalSources;
  }
}
