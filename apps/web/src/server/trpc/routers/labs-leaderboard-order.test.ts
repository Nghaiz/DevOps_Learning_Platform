import { describe, expect, it } from 'vitest';
import { compareLeaderboardEntries, type LeaderboardEntry } from './labs';

/**
 * F6 — hai lượt gọi `labs.leaderboard` giống hệt nhau phải ra CÙNG một thứ hạng.
 *
 * ## Vì sao hôm nay chúng có thể khác nhau
 *
 * Câu truy vấn nạp `lab_attempts` KHÔNG có `ORDER BY`, nên thứ tự dòng Postgres
 * trả về là không xác định (nó đổi theo plan, theo VACUUM, theo seq-scan song
 * song). `Array.prototype.sort` của V8 thì ỔN ĐỊNH — và tính ổn định đó, vốn
 * thường là điều tốt, ở đây lại đúng là cái làm lỗi lộ ra: hai dòng hoà nhau
 * tuyệt đối giữ nguyên thứ tự ĐẦU VÀO, tức thứ tự không xác định của Postgres
 * chảy thẳng vào `rank` mà người dùng đọc.
 *
 * Hai người hoà nhau đổi chỗ cho nhau giữa hai lần F5 là một bảng xếp hạng
 * không tin được — và `cursor` của phân trang là `attemptId` tra bằng
 * `findIndex` trên chính mảng này, nên thứ tự trôi còn làm trang 2 nhảy dòng.
 *
 * ## Phép kiểm: cùng tập, khác thứ tự đầu vào ⇒ cùng kết quả
 *
 * Đây là định nghĩa của "comparator là một thứ tự TOÀN PHẦN". Một comparator
 * trả `0` cho hai phần tử khác nhau thì không phải — và `expect(...).toEqual`
 * trên hai lần sắp xếp từ hai thứ tự đầu vào là cách rẻ nhất để nói điều đó.
 */

const LUC = Date.parse('2026-09-06T09:00:00.000Z');

function entry(attemptId: string, over: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    attemptId,
    percent: 100,
    durationSeconds: 300,
    submittedAt: new Date(LUC),
    ...over,
  };
}

/** Bốn dòng HOÀ NHAU tuyệt đối — chỉ khác `attemptId`. */
const HOA = [entry('att-c'), entry('att-a'), entry('att-d'), entry('att-b')];

function xepHang(rows: readonly LeaderboardEntry[]): string[] {
  return [...rows].sort(compareLeaderboardEntries).map((row) => row.attemptId);
}

describe('compareLeaderboardEntries — thứ hạng không phụ thuộc thứ tự Postgres trả về', () => {
  it('cùng tập, thứ tự đầu vào ĐẢO NGƯỢC ⇒ cùng thứ hạng', () => {
    expect(xepHang(HOA)).toEqual(xepHang([...HOA].reverse()));
  });

  it('cùng tập, ba hoán vị khác nhau ⇒ vẫn một thứ hạng', () => {
    const chuan = xepHang(HOA);
    const hoanVi = [
      [HOA[1], HOA[3], HOA[0], HOA[2]],
      [HOA[2], HOA[0], HOA[3], HOA[1]],
      [HOA[3], HOA[2], HOA[1], HOA[0]],
    ] as LeaderboardEntry[][];
    for (const cach of hoanVi) {
      expect(xepHang(cach)).toEqual(chuan);
    }
  });

  it('hoà tuyệt đối ⇒ comparator KHÔNG được trả 0 (0 nghĩa là "cùng một dòng")', () => {
    // Đây là mệnh đề mạnh hơn hai ca trên và là thứ khiến chúng đúng: chỉ khi
    // comparator phân biệt được MỌI cặp khác nhau thì kết quả mới độc lập với
    // đầu vào — dựa vào tính ổn định của `sort` là dựa vào thứ tự của Postgres.
    expect(compareLeaderboardEntries(HOA[0]!, HOA[1]!)).not.toBe(0);
    expect(compareLeaderboardEntries(HOA[0]!, HOA[0]!)).toBe(0);
  });

  it('phá hoà không được đá đổ ba khoá chính', () => {
    // Đối chứng: thêm khoá phụ mà làm sai thứ tự nghiệp vụ thì tất định cũng vô
    // nghĩa. `att-z` xếp sau theo id nhưng phải đứng TRƯỚC ở cả ba khoá thật.
    expect(xepHang([entry('att-a', { percent: 50 }), entry('att-z', { percent: 90 })])).toEqual([
      'att-z',
      'att-a',
    ]);
    expect(
      xepHang([entry('att-a', { durationSeconds: 900 }), entry('att-z', { durationSeconds: 60 })]),
    ).toEqual(['att-z', 'att-a']);
    expect(
      xepHang([
        entry('att-a', { submittedAt: new Date(LUC + 60_000) }),
        entry('att-z', { submittedAt: new Date(LUC) }),
      ]),
    ).toEqual(['att-z', 'att-a']);
  });
});
