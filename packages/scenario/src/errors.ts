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
