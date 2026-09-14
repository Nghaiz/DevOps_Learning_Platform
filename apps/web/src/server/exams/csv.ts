import type { ExamScoreboard } from './scoreboard';

/**
 * Xuất bảng điểm ra CSV (§18.G.7).
 *
 * ## ⛔ BOM UTF-8 là bắt buộc, và đó là toàn bộ nội dung của AC-9
 *
 * Excel trên Windows KHÔNG đoán UTF-8 cho file `.csv`: không có BOM thì nó đọc
 * theo code page của máy (1252 ở đa số máy Việt Nam) và mọi chữ có dấu vỡ
 * thành ký tự lạ. Không có lỗi nào, file vẫn mở — nên cách duy nhất phát hiện
 * là có người nhìn vào và thấy "Nguyễn" thành "Nguyá»…n".
 *
 * Ba byte `EF BB BF` ở đầu file sửa hẳn chuyện đó, và chúng vô hại với mọi thứ
 * khác đọc CSV (LibreOffice, pandas, `csv` của Python đều nuốt BOM).
 *
 * ## Vì sao G.7 không phải một tiện ích
 *
 * `schema.ts` § `exams` ghi rõ: xoá lớp là xoá luôn điểm thi của lớp đó, và
 * thứ bù lại KHÔNG phải một khoá ngoại mà là chính hàm này. Đây là đường duy
 * nhất để điểm rời khỏi hệ thống trước khi dữ liệu biến mất.
 */

/** `\ufeff` — ba byte `EF BB BF` khi mã hoá UTF-8. Viết dạng thoát vì chính ký tự đó vô hình trong nguồn. */
export const UTF8_BOM = '\ufeff';

/**
 * Bọc một ô CSV.
 *
 * Luôn bọc trong ngoặc kép thay vì chỉ bọc khi cần: quy tắc "chỉ khi cần" phải
 * liệt kê đúng tập ký tự cần thoát, và tập đó khác nhau giữa các bản cài đặt
 * (dấu phẩy, dấu chấm phẩy, xuống dòng, tab, khoảng trắng đầu/cuối). Bọc hết
 * là một luật không có ca biên, và mọi bộ đọc CSV đều chấp nhận.
 *
 * Dấu nháy kép bên trong nhân đôi — đó là cách thoát của chính RFC 4180, không
 * phải backslash.
 */
function cell(value: string): string {
  return `"${value.split('"').join('""')}"`;
}

function verdictOf(cellData: {
  readonly passed: number | null;
  readonly total: number | null;
  readonly solved: boolean;
  readonly failCode: string | null;
}): string {
  if (cellData.passed === null || cellData.total === null) {
    return '';
  }
  if (cellData.failCode !== null) {
    return 'CE';
  }
  if (cellData.solved) {
    return 'AC';
  }
  return `WA (${String(cellData.passed)}/${String(cellData.total)})`;
}

/**
 * Cả bảng điểm dưới dạng một chuỗi CSV, đã kèm BOM.
 *
 * Mỗi bài trong đề là MỘT cột, đúng thứ tự người ra đề xếp. Một cột gộp kiểu
 * `"AC, WA (3/5), ..."` sẽ không lọc được trong Excel, và lọc theo bài chính là
 * việc người chấm làm nhiều nhất.
 */
export function scoreboardToCsv(board: ExamScoreboard): string {
  const header = [
    'Họ tên',
    'Email',
    'Bắt đầu',
    'Nộp lúc',
    'Tự nộp',
    ...board.problemCodes,
    'Số bài AC',
    'Testcase qua',
    'Tổng testcase',
  ];

  const lines = [header.map(cell).join(',')];

  for (const row of board.rows) {
    lines.push(
      [
        row.name,
        row.email,
        row.startedAt,
        row.submittedAt ?? '',
        // Ba trạng thái, không phải hai. `null` = lượt chưa khoá, và một ô
        // trống nói đúng điều đó; ghi "không" ở đó sẽ khẳng định rằng người
        // này đã nộp tay, trong khi họ vẫn đang làm bài.
        row.autoSubmitted === null ? '' : row.autoSubmitted ? 'có' : 'không',
        ...row.cells.map(verdictOf),
        String(row.solvedCount),
        String(row.passedTotal),
        String(row.caseTotal),
      ]
        .map(cell)
        .join(','),
    );
  }

  /*
   * CRLF: RFC 4180 quy định thế, và Excel bản cũ trên Windows là bộ đọc kén
   * nhất trong số những bộ đọc file này sẽ gặp.
   */
  return UTF8_BOM + lines.join('\r\n') + '\r\n';
}

/**
 * Tên file tải về.
 *
 * Bỏ mọi ký tự mà Windows cấm trong tên file, và bỏ luôn dấu tiếng Việt —
 * không phải vì sợ Unicode, mà vì tên file đi qua header `Content-Disposition`,
 * nơi ký tự ngoài ASCII cần mã hoá RFC 5987 và không phải trình duyệt nào cũng
 * làm đúng. Nội dung bên trong thì vẫn giữ nguyên dấu.
 */
export function csvFileName(title: string): string {
  const ascii = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D')
    .replace(/[^a-zA-Z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase();
  return `diem-thi-${ascii === '' ? 'khong-ten' : ascii}.csv`;
}
