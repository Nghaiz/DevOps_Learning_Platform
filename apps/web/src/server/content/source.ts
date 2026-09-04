import {
  compositeContentSource,
  dbContentSource,
  filesystemScenarioSource,
  type ContentSource,
} from '@devops-platform/scenario';
import type { ContentVisibility } from '@devops-platform/shared-types/authoring';
import { getDb } from '../db/client';
import { scenariosDir } from '../env';
import { contentRepository } from './repository';

/**
 * Nguồn nội dung HỢP NHẤT của BFF — đĩa trước, DB sau (P9 9.C task 10).
 *
 * ## Vì sao chỉ một chỗ dựng nó
 *
 * Trước P9 có HAI chỗ tự dựng `filesystemScenarioSource`:
 * `server/lessons/catalog.ts` và `server/labs/catalog.ts` — mỗi cái một cache
 * riêng, chấp nhận được khi cả hai đọc cùng một thư mục bất biến. Với nguồn DB
 * thì không còn chấp nhận được: hai composite độc lập nghĩa là hai luật ưu tiên
 * có thể trôi khỏi nhau, và câu hỏi "bài này tới từ đâu" có hai câu trả lời.
 * Nên cả hai catalog giờ gọi vào đây.
 *
 * ## Cache: đĩa CÓ, DB KHÔNG
 *
 * `filesystemScenarioSource` giữ cache promise cả vòng đời tiến trình và điều
 * đó vẫn đúng — nội dung của nó nướng vào image lúc build. Nguồn DB thì không
 * cache gì (task 11: *"một bài vừa sửa mà 5 phút sau mới thấy là một lỗi người
 * soạn sẽ báo là 'mất bài'"*). Composite không thêm cache riêng, nên tính chất
 * này đi thẳng qua: sửa bài xong, lượt đọc kế tiếp thấy ngay.
 *
 * Vì thế chỉ **nguồn đĩa** là singleton; composite được dựng MỖI LẦN GỌI. Nó
 * chỉ là ba object nhỏ — không có I/O nào trong việc dựng.
 */

let filesystemSource: ContentSource | null = null;

function diskSource(): ContentSource {
  filesystemSource ??= filesystemScenarioSource(scenariosDir());
  return filesystemSource;
}

/**
 * Nguồn cho NGƯỜI HỌC — chỉ bài `published`.
 *
 * ⚠ Zero-arg, và đó là một ràng buộc chứ không phải sự tiện tay: ô AC của
 * phase-9 đòi router/`checkStep`/FE **không sửa một dòng nào** khi thêm nguồn
 * DB. `lessons.ts` gọi `scenarioSource()` không tham số; đổi chữ ký ở đây là
 * phá đúng ô AC đó.
 *
 * Hệ quả: nguồn này KHÔNG biết ai đang hỏi, nên nó không thể cho tác giả thấy
 * bài nháp của chính mình ở `/lessons`. Đó là hành vi ĐÚNG, không phải giới
 * hạn: một bản nháp hiện trong catalog người học — kể cả chỉ với tác giả — làm
 * câu hỏi "bài này đã lên chưa" không trả lời được từ màn hình. Bài nháp sống ở
 * trang soạn (`authoring.list`), nơi nguồn được dựng KÈM tầm nhìn.
 */
export function publishedContentSource(): ContentSource {
  return compositeContentSource([
    diskSource(),
    dbContentSource(contentRepository(getDb()), { visibility: { kind: 'published-only' } }),
  ]);
}

/**
 * Nguồn KÈM tầm nhìn — cho trang soạn và cho lượt chạy thử của `publish`.
 *
 * Luật ưu tiên giống hệt (đĩa trước): một tác giả tạo bài trùng id với bài
 * vendored phải thấy đúng thứ người học sẽ thấy, tức là bài vendored — chứ
 * không phải bài của mình. Nếu ở đây DB thắng thì tác giả xem trước một bài mà
 * người học không bao giờ nhận được, và không có gì nói cho họ biết.
 */
export function contentSourceFor(visibility: ContentVisibility): ContentSource {
  return compositeContentSource([
    diskSource(),
    dbContentSource(contentRepository(getDb()), { visibility }),
  ]);
}
