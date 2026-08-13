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
