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
  return truncateUtf8(output, LAB_OUTPUT_MAX_BYTES, TRUNCATION_SUFFIX);
}

/**
 * Cắt theo BYTE ở biên UTF-8 an toàn, thêm `suffix` nếu thật sự phải cắt.
 *
 * Tách ra khỏi `truncateLabOutput` ở P15: câu báo lỗi của một lượt setup hỏng
 * (`lessons/setup-plan.ts`) cũng phải cắt đúng biên, nhưng ở một trần KHÁC hẳn
 * (vài trăm byte cho một câu người đọc, không phải 8 KiB cho một dòng lưu). Hai
 * trần, MỘT phép cắt — nhân bản vòng lùi biên là cách nó trôi đi, và triệu chứng
 * của bản trôi là một ký tự U+FFFD ở cuối câu lỗi chứ không phải một test đỏ.
 */
export function truncateUtf8(value: string, maxBytes: number, suffix: string): string {
  const buf = Buffer.from(value, 'utf8');
  if (buf.byteLength <= maxBytes) {
    return value;
  }

  let end = maxBytes;
  while (end > 0 && isUtf8ContinuationByte(buf[end]!)) {
    end -= 1;
  }

  return buf.subarray(0, end).toString('utf8') + suffix;
}
