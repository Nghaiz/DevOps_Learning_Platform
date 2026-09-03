/**
 * Trần kích thước output lưu vào `lab_task_results.output` (contract §3.7).
 *
 * `/exec` của gateway đã tự cắt ở `GATEWAY_EXEC_TIMEOUT`/kích thước riêng của nó
 * (`ScriptOutcome.truncated`), nhưng đó là trần của MỘT lượt gọi — cắt LẦN NỮA
 * ở đây là trần của một DÒNG LƯU VĨNH VIỄN, độc lập với gateway đổi cấu hình.
 */
export const LAB_OUTPUT_MAX_BYTES = 8192;

const TRUNCATION_SUFFIX = '\n…(đã cắt)';

/**
 * `(byte & 0xc0) === 0x80` ⇔ byte đó là CONTINUATION BYTE của một chuỗi UTF-8
 * đa-byte (dạng `10xxxxxx`) — tức cắt ngay TRƯỚC nó là cắt giữa chừng một ký tự.
 */
function isUtf8ContinuationByte(byte: number): boolean {
  return (byte & 0xc0) === 0x80;
}

/**
 * Cắt `output` về tối đa `LAB_OUTPUT_MAX_BYTES` BYTE, lùi điểm cắt về biên
 * UTF-8 an toàn gần nhất.
 *
 * Nội dung là tiếng Việt (dấu là ký tự đa-byte UTF-8). Một lát cắt byte thô
 * (`Buffer.subarray(0, N)` rồi `.toString('utf8')` không lùi biên) có thể rơi
 * giữa hai byte của MỘT ký tự — Node thay thế byte lẻ đó bằng U+FFFD
 * ("mojibake"), và người học nhận một dòng cuối vô nghĩa thay vì bị cắt gọn.
 *
 * Không đảm bảo `output.length <= LAB_OUTPUT_MAX_BYTES` sau khi cộng hậu tố —
 * hậu tố là phần THÊM VÀO sau lát cắt an toàn, đúng như contract mô tả ("cắt
 * theo byte ở biên UTF-8 an toàn, THÊM hậu tố"), không phải một trần thứ hai.
 */
export function truncateLabOutput(output: string): string {
  const buf = Buffer.from(output, 'utf8');
  if (buf.byteLength <= LAB_OUTPUT_MAX_BYTES) {
    return output;
  }

  let end = LAB_OUTPUT_MAX_BYTES;
  while (end > 0 && isUtf8ContinuationByte(buf[end]!)) {
    end -= 1;
  }

  return buf.subarray(0, end).toString('utf8') + TRUNCATION_SUFFIX;
}
