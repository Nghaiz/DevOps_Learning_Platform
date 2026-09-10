/**
 * Hai danh sách từ cho bộ dò tiếng Việt bị lột dấu (`scanStripped` ở `scan.ts`).
 *
 * Đây là bộ dò DUY NHẤT trong gói này chạy bằng heuristic. Nói trước phần dở thì
 * đúng hơn là để người sau tự phát hiện: nó CÓ dương tính giả, và con số đo được
 * nằm ở khối ĐO phía dưới.
 *
 * Vì sao cần: `content/labs/dlp-linux-triage/lab.json` đang gửi tới người học
 * nguyên văn `"docker: khong lien quan o buoc nay. Dung ps aux hoac pgrep -af
 * runaway-worker de tim PID..."` trong khi `title` ngay phía trên nó có đủ dấu.
 * Không có công cụ nào trong repo bắt được việc đó, và nó đã đi qua review.
 *
 * Luật gắn cờ: `strong >= 1` HOẶC `weak >= 4`.
 */

/**
 * ⛔ TIÊU CHÍ DUY NHẤT ĐỂ MỘT TỪ ĐƯỢC VÀO ĐÂY, và nó không phải "trông giống
 * tiếng Việt":
 *
 *   Dạng ASCII của từ phải KHÔNG PHẢI một âm tiết tiếng Việt hợp lệ.
 *
 * `khong` đạt, vì `không` luôn có dấu và `khong` tự nó không là từ nào. `trong`
 * KHÔNG đạt, vì `trong` vốn đã là chính tả đúng. Một từ vốn không có dấu thì sự
 * xuất hiện của nó không mang thông tin nào về việc văn bản có bị lột dấu hay
 * không, nên đưa nó vào đây chỉ sinh ra dương tính giả trên văn bản viết đúng.
 *
 * Tiêu chí này là kết quả của phép đo ở khối ĐO, không phải một suy luận. Bản
 * đầu của danh sách này thiếu nó và cho 259 hit trên 1.431 chuỗi.
 *
 * ⚠ SAI LỆCH SO VỚI §3.2 CỦA HỢP ĐỒNG, có bằng chứng. Hợp đồng liệt kê tường
 * minh 35 từ, và năm trong số đó vi phạm chính tiêu chí trên: `tuy` (tuy nhiên),
 * `nhanh` (nhanh), `dung` (nội dung, dung dịch), `cung` (cung cấp), `nay` (hôm
 * nay, hiện nay). Đo trên `content/**`, ba trong năm từ đó tự mình sinh ra 34
 * hit trên văn bản CÓ ĐỦ DẤU (`dung` 14, `nhanh` 5, cộng phần của `cung`/`nay`
 * trong các chuỗi khác). Chúng bị loại khỏi STRONG, và KHÔNG chuyển xuống WEAK:
 * một từ vốn không có dấu thì ở WEAK cũng chỉ làm nhiễu phép đếm bốn.
 *
 * Đã CỐ Ý loại vì dạng ASCII là từ tiếng Việt hợp lệ: `trong`, `khi`, `thay`,
 * `ngay`, `xong`, `mang`, `thanh`, `lam`, `giai` (giai đoạn), `trinh` (trinh),
 * `dinh` (dinh dưỡng), cộng năm từ của hợp đồng ở trên.
 *
 * Đã CỐ Ý loại vì trùng mặt chữ tiếng Anh: `mat`, `that`, `chat`, `bang`,
 * `them`, `tao`, `tat`, `dong`, `song`, `man`, `tin`, `pha`. Chúng không xuống
 * WEAK luôn, vì bốn từ loại đó trong một câu tiếng Anh là chuyện thường.
 *
 * ⚠ Rủi ro còn lại, đã biết và chấp nhận: `nguyen`, `viet`, `phuong`, `tuan` là
 * tên riêng người Việt viết ASCII. Trong văn xuôi chúng vẫn là bằng chứng lột
 * dấu; trong một danh sách tên tác giả thì không. Đường thoát là
 * `diacritic-allow.ts`, khoá theo cặp (khoá, token).
 */
export const STRONG_WORDS: readonly string[] = [
  // Từ hợp đồng liệt kê tường minh, đã bỏ năm từ vi phạm tiêu chí (xem trên).
  'khong',
  'duoc',
  'nguoi',
  'nhung',
  'cua',
  'voi',
  'mot',
  'dang',
  'phai',
  'hoac',
  'roi',
  'chua',
  'cang',
  'nghia',
  'quyen',
  'thuc',
  'tieu',
  'kiem',
  'nhom',
  'chinh',
  'truoc',
  'buoc',
  'lien',
  'huong',
  'thuong',
  'truong',
  'duong',
  'nhieu',
  'tiep',
  'viec',

  // Phần còn lại, chọn theo đúng tiêu chí trên.
  'bai',
  'hoc',
  'loi',
  'lenh',
  'hieu',
  'biet',
  'thich',
  'nen',
  'neu',
  'luc',
  'tich',
  'diem',
  'dieu',
  'dien',
  'kien',
  'khien',
  'mien',
  'tien',
  'chuyen',
  'nguyen',
  'luyen',
  'tuyen',
  'quyet',
  'viet',
  'thiet',
  'nghiep',
  'phuong',
  'luong',
  'xuong',
  'vuong',
  'chuong',
  'nuoc',
  'muon',
  'thuoc',
  'cuoc',
  'nguoc',
  'duoi',
  'nguon',
  'muc',
  'phuc',
  'chuc',
  'tuc',
  'nhap',
  'xuat',
  'thuat',
  'luat',
  'phat',
  'nhat',
  'cach',
  'hoi',
  'noi',
  'doi',
  'goi',
  'vao',
  'ngoai',
  'phut',
  'giay',
  'tuan',
  'sua',
  'xoa',
  'dau',
  'cuoi',
  'tren',
  'giup',
  'gio',
  'moc',
  'ket',
  'dam',
];

/**
 * WEAK: trùng mặt chữ với tiếng Anh, nên một mình không đủ để kết luận gì. Cần
 * bốn từ trở lên trong cùng một chuỗi.
 *
 * ⚠ Danh sách này giữ NGUYÊN theo hợp đồng, và nó cố ý KHÔNG theo tiêu chí của
 * STRONG: phần lớn các mục ở đây (`ba`, `hai`, `tam`, `sang`, `ban`, `con`,
 * `cho`, `ma`) đúng là âm tiết tiếng Việt hợp lệ. Ngưỡng bốn là thứ gánh phần
 * đó, và phép đo ở khối ĐO nói ra nó gánh được tới đâu.
 *
 * Ngưỡng 4 tới từ một câu cụ thể, và câu đó là một đối chứng âm chạy mỗi lượt
 * CI: `'Do not close this tab so the session can stay open'` chứa đúng ba mục
 * của danh sách này (`do`, `so`, `can`). Ngưỡng 3 sẽ làm câu tiếng Anh đó đỏ.
 * Ai muốn siết xuống 3 thì phải trả lời câu đó trước.
 */
export const WEAK_WORDS_MEASUREMENT = `
ĐO NGÀY 2026-09-10, trên toàn bộ content/** cộng giá trị đã dựng của packages/copy.
Đây là việc §3.2 của hợp đồng giao cho L0 làm TRƯỚC khi merge. Không có con số này
thì §3.2 là một lời hứa chứ không phải một phép đo, và người sau không biết ngưỡng
weak >= 4 đến từ đâu.

  tổng số chuỗi quét      1431   (1392 đơn vị trong content/**, 39 giá trị của bản đồ)
  số hit                    48
  dương tính THẬT           43   (89,6% số hit)
  dương tính giả             5   (10,4% số hit, tức 0,35% số chuỗi)

Ba lớp dương tính giả điển hình, đọc tay từng cái:

  1. Siêu dữ liệu cố ý viết ASCII, 4 hit. content/scenarios/*/dlp.json trường
     'notes' là ghi chú cho người bảo trì, viết không dấu có chủ ý. Bộ dò đọc
     đúng (đó THẬT là tiếng Việt không dấu), nhưng nó không phải chữ người học
     đọc. Đây là dương tính giả về PHẠM VI, không phải về thuật toán, và nó biến
     mất khi cổng ở §5.3 chỉ chạy trên các trường đi vào DB.

  2. Luật weak >= 4 nổ trên tiếng Việt viết ĐÚNG, 1 hit.
     content/scenarios/dlp-ide-config-edit/finish.md đoạn 2 có đủ dấu nhưng chứa
     bốn từ WEAK vốn không mang dấu: ba, cho, do, hai. Đây là dương tính giả duy
     nhất do chính thuật toán sinh ra, và là cái giá đã biết của việc giữ WEAK
     theo hợp đồng. Một hit trên 1431 chuỗi.

  3. Định danh có chữ số, 0 hit SAU KHI SỬA. Khoá quiz 'quyen-600' từng bị đọc
     thành văn xuôi vì bước bóc kebab chỉ nhận chữ cái. Đã sửa trong scan.ts.

43 dương tính thật KHÔNG phải nhiễu, và chúng là lý do bộ dò này tồn tại: cả
scenario content/scenarios/dlp-k8s-multinode-scheduling (intro, step1..3, finish,
index.json) viết không dấu, cộng 10 hint trong hai lab.json. Toàn bộ số đó đang
hiển thị cho người học hôm nay và không cổng nào trong repo bắt được.

Chạy lại phép đo: dựng lại kịch bản đã dùng ở đây, quét mọi chuỗi JSON và mọi
đoạn markdown trong content/**, cộng renderMessages(MESSAGES).
`;

export const WEAK_WORDS: readonly string[] = [
  'la',
  'do',
  'no',
  'so',
  'can',
  'may',
  'hai',
  'ba',
  'tai',
  'den',
  'cho',
  'ma',
  'bat',
  'con',
  'sang',
  'tam',
  'ban',
  'hang',
  'cam',
  'gia',
  'tim',
  'de',
  'se',
  'va',
];
