/**
 * Trạng thái lưu của một trình soạn, suy từ BỐN sự thật mà trang gọi nắm.
 *
 * Hàm thuần, tách khỏi ô hiển thị, vì thứ tự ưu tiên ở đây chính là luật: một
 * lượt lưu đang chạy thắng mọi thứ khác, một lượt lưu vừa bị từ chối thắng "chưa
 * lưu" (người soạn phải biết lượt bấm vừa rồi KHÔNG ăn), và "đã lưu" chỉ đúng
 * khi máy chủ đã trả lời thành công cho đúng nội dung đang có trên màn hình.
 *
 * ⛔ Không bao giờ suy "đã lưu" từ lúc BẤM nút. Bản cũ của
 * `/author/problems/[code]` ghi ảnh chụp "đã lưu" trước khi máy chủ trả lời, nên
 * một lượt lưu bị từ chối vẫn hiện "Đã lưu". `persisted` và `dirty` ở đây phải
 * do trang gọi cập nhật trong `onSuccess`, không phải trong `onClick`.
 */
export type SaveStatus = 'new' | 'saved' | 'unsaved' | 'saving' | 'error';

export interface SaveFacts {
  /** Bài đã có bản trên máy chủ chưa. `false` ở trang tạo mới. */
  readonly persisted: boolean;
  /** Nội dung trên màn hình khác bản máy chủ đã nhận lần cuối. */
  readonly dirty: boolean;
  /** Một lượt lưu đang chờ máy chủ trả lời. */
  readonly saving: boolean;
  /** Lượt lưu gần nhất bị từ chối và chưa có lượt nào thành công sau đó. */
  readonly failed: boolean;
}

export function saveStatusOf(facts: SaveFacts): SaveStatus {
  if (facts.saving) return 'saving';
  if (facts.failed) return 'error';
  if (!facts.persisted) return 'new';
  return facts.dirty ? 'unsaved' : 'saved';
}

/**
 * Nút Xuất bản phải khoá khi màn hình lệch bản đã lưu.
 *
 * Xuất bản đọc bản trên MÁY CHỦ, không đọc biểu mẫu. Một phép kiểm chạy trên
 * biểu mẫu rồi xuất bản bản máy chủ là kiểm một thứ, phát hành một thứ khác.
 */
export function mustSaveBeforePublish(status: SaveStatus): boolean {
  return status !== 'saved';
}
