import {
  toScenarioSummary,
  type Scenario,
  type ScenarioSummary,
} from '@devops-platform/shared-types/scenario';
import { loadScenarios } from './loader.ts';

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
}

/**
 * Nguồn đọc từ đĩa.
 *
 * Nạp MỘT LẦN rồi giữ trong bộ nhớ: nội dung được nướng vào image lúc build
 * (`apps/web/Dockerfile` copy `content/`), nên nó không đổi trong vòng đời tiến
 * trình. Đọc lại mỗi request là 4 lần `readdir` + hàng chục `readFile` cho một
 * trang danh sách.
 *
 * ⛔ Cache giữ **promise**, không giữ kết quả. Hai request tới cùng lúc lúc khởi
 * động sẽ cùng chờ MỘT lần nạp; giữ kết quả thì cả hai cùng thấy cache rỗng và
 * cùng nạp — trên một thư mục 4 bài thì vô hại, nhưng đó là đúng cái race mà
 * người ta không nghĩ tới khi thêm bài thứ 200.
 *
 * ⛔ Promise hỏng thì XOÁ khỏi cache. Giữ lại một promise reject nghĩa là một
 * lượt nạp lỗi tạm thời (đĩa bận, mount chưa sẵn sàng) sẽ đóng băng vĩnh viễn:
 * mọi request sau đó đều thấy đúng lỗi cũ và chỉ khởi động lại pod mới gỡ được.
 */
export function filesystemScenarioSource(rootDir: string): ScenarioSource {
  let pending: Promise<Map<string, Scenario>> | null = null;

  async function all(): Promise<Map<string, Scenario>> {
    pending ??= loadScenarios(rootDir)
      .then((scenarios) => new Map(scenarios.map((s) => [s.id, s])))
      .catch((cause: unknown) => {
        pending = null;
        throw cause;
      });
    return pending;
  }

  return {
    kind: `filesystem:${rootDir}`,
    async list() {
      // `loadScenarios` đã sắp theo tên thư mục, và loader ép `id === tên thư
      // mục`, nên thứ tự Map đã là thứ tự theo id. Sắp lại ở đây là công thừa
      // dựa trên một ràng buộc có thể trôi — nên khẳng định lại nó, rẻ hơn là
      // tin vào nó.
      return [...(await all()).values()]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(toScenarioSummary);
    },
    async get(id: string) {
      return (await all()).get(id) ?? null;
    },
  };
}
