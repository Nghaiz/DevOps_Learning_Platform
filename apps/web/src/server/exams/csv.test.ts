import { describe, expect, it } from 'vitest';

import { UTF8_BOM, csvFileName, scoreboardToCsv } from './csv';
import type { ExamScoreboard, ExamScoreRow } from './scoreboard';

const row = (over: Partial<ExamScoreRow> = {}): ExamScoreRow => ({
  userId: over.userId ?? 'u1',
  name: over.name ?? 'Nguyễn Văn Đức',
  email: over.email ?? 'duc@example.com',
  startedAt: over.startedAt ?? '2026-09-15T08:00:00.000Z',
  submittedAt: over.submittedAt === undefined ? '2026-09-15T08:45:00.000Z' : over.submittedAt,
  autoSubmitted: over.autoSubmitted === undefined ? false : over.autoSubmitted,
  cells: over.cells ?? [
    { problemCode: 'K8S-0001', passed: 5, total: 5, solved: true, failCode: null },
    { problemCode: 'K8S-0002', passed: 3, total: 5, solved: false, failCode: null },
  ],
  solvedCount: over.solvedCount ?? 1,
  passedTotal: over.passedTotal ?? 8,
  caseTotal: over.caseTotal ?? 10,
});

const board = (over: Partial<ExamScoreboard> = {}): ExamScoreboard => ({
  examId: over.examId ?? 'e1',
  title: over.title ?? 'Giữa kỳ DevOps',
  className: over.className ?? 'K18-CNTT',
  problemCodes: over.problemCodes ?? ['K8S-0001', 'K8S-0002'],
  rows: over.rows ?? [row()],
});

describe('scoreboardToCsv', () => {
  /*
   * ⛔ AC-9 nằm gọn trong ô này. Không có BOM, Excel trên Windows đọc file theo
   * code page của máy và "Nguyễn" hiện ra là "Nguyá»…n" — không lỗi, file vẫn
   * mở, nên cách duy nhất phát hiện là có người nhìn vào.
   */
  it('bắt đầu bằng BOM UTF-8', () => {
    expect(scoreboardToCsv(board()).startsWith(UTF8_BOM)).toBe(true);
  });

  it('BOM đúng ba byte EF BB BF khi mã hoá UTF-8', () => {
    const bytes = Buffer.from(scoreboardToCsv(board()), 'utf8');
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('giữ nguyên dấu tiếng Việt trong nội dung', () => {
    expect(scoreboardToCsv(board())).toContain('Nguyễn Văn Đức');
  });

  it('mỗi bài trong đề là MỘT cột, đúng thứ tự người ra đề xếp', () => {
    const [header] = scoreboardToCsv(board()).split('\r\n');
    expect(header).toContain('"K8S-0001","K8S-0002"');
  });

  it('verdict đọc được: AC, WA (n/m), và ô trống khi chưa nộp bài đó', () => {
    const csv = scoreboardToCsv(
      board({
        problemCodes: ['A', 'B', 'C'],
        rows: [
          row({
            cells: [
              { problemCode: 'A', passed: 5, total: 5, solved: true, failCode: null },
              { problemCode: 'B', passed: 3, total: 5, solved: false, failCode: null },
              { problemCode: 'C', passed: null, total: null, solved: false, failCode: null },
            ],
          }),
        ],
      }),
    );
    expect(csv).toContain('"AC","WA (3/5)",""');
  });

  it('lượt hỏng mang mã lý do hiện CE, không hiện WA 0/n', () => {
    const csv = scoreboardToCsv(
      board({
        problemCodes: ['A'],
        rows: [
          row({
            cells: [{ problemCode: 'A', passed: 0, total: 5, solved: false, failCode: 'CE' }],
          }),
        ],
      }),
    );
    expect(csv).toContain('"CE"');
    expect(csv).not.toContain('WA (0/5)');
  });

  /*
   * Ba trạng thái, không phải hai. Ghi "không" cho một lượt CHƯA khoá là khẳng
   * định rằng người này đã nộp tay, trong khi họ vẫn đang làm bài.
   */
  it('cột "Tự nộp" phân biệt được có / không / chưa khoá', () => {
    const one = (autoSubmitted: boolean | null) =>
      scoreboardToCsv(board({ rows: [row({ autoSubmitted })] })).split('\r\n')[1] ?? '';
    expect(one(true)).toContain('"có"');
    expect(one(false)).toContain('"không"');
    expect(one(null)).not.toContain('"không"');
  });

  // ── Thoát ký tự ───────────────────────────────────────────────────────────

  /*
   * Một cái tên có dấu phẩy mà không bọc sẽ đẩy mọi cột sau nó sang phải MỘT ô,
   * và bảng vẫn mở được — điểm của người đó rơi vào cột của người khác.
   */
  it('dấu phẩy trong tên không làm lệch cột', () => {
    const csv = scoreboardToCsv(board({ rows: [row({ name: 'Trần, Văn A' })] }));
    expect(csv).toContain('"Trần, Văn A"');
  });

  it('dấu nháy kép nhân đôi theo RFC 4180, không thoát bằng backslash', () => {
    const csv = scoreboardToCsv(board({ rows: [row({ name: 'Ng "Bé" A' })] }));
    expect(csv).toContain('"Ng ""Bé"" A"');
    expect(csv).not.toContain('\\"');
  });

  it('xuống dòng trong một ô vẫn nằm trong ô đó', () => {
    const csv = scoreboardToCsv(board({ rows: [row({ name: 'A\nB' })] }));
    expect(csv).toContain('"A\nB"');
  });

  it('kết thúc dòng bằng CRLF theo RFC 4180', () => {
    expect(scoreboardToCsv(board())).toContain('\r\n');
  });

  it('bảng rỗng vẫn có dòng tiêu đề', () => {
    const csv = scoreboardToCsv(board({ rows: [] }));
    expect(csv.split('\r\n').filter((line) => line !== '')).toHaveLength(1);
  });
});

describe('csvFileName', () => {
  it('bỏ dấu tiếng Việt vì tên file đi qua Content-Disposition', () => {
    expect(csvFileName('Giữa kỳ DevOps')).toBe('diem-thi-giua-ky-devops.csv');
  });

  it('chữ đ hoa và thường đều thành d', () => {
    expect(csvFileName('Đề Đức')).toBe('diem-thi-de-duc.csv');
  });

  it('bỏ ký tự Windows cấm trong tên file', () => {
    expect(csvFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('diem-thi-a-b-c-d-e-f-g-h-i-j.csv');
  });

  it('tên toàn ký tự lạ vẫn ra một tên file dùng được', () => {
    expect(csvFileName('***')).toBe('diem-thi-khong-ten.csv');
  });
});
