import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { PROBLEM_ORDER_KEYS, type ProblemOrderKey } from '@devops-platform/games';
import { decodeProblemCursor, encodeProblemCursor } from './cursor';

const ROW = {
  code: 'K8S-0042',
  difficulty: 'medium' as const,
  createdAt: new Date('2026-09-08T01:02:03.456Z'),
  solverCount: 17,
};

describe('con trỏ keyset của danh sách bài', () => {
  it('mã hoá rồi giải mã lại ra đúng giá trị, ở CẢ BỐN khoá', () => {
    // Duyệt chính `PROBLEM_ORDER_KEYS` chứ không liệt kê tay: thêm một khoá vào
    // hợp đồng mà quên hiện thực sẽ làm ô này đỏ, thay vì đi qua trong im lặng.
    for (const orderBy of PROBLEM_ORDER_KEYS) {
      const cursor = encodeProblemCursor(orderBy, ROW);
      const decoded = decodeProblemCursor(cursor, orderBy);
      expect(decoded.code, orderBy).toBe(ROW.code);
      if (orderBy === 'code') {
        expect(decoded.sortValue, orderBy).toBeNull();
      } else {
        expect(decoded.sortValue, orderBy).not.toBeNull();
      }
    }
  });

  it('giữ nguyên MILI GIÂY của createdAt qua vòng mã hoá', () => {
    // Đây là vế JS của lý do cột khai `precision: 3`. Mất phần mili giây thì con
    // trỏ trỏ vào một mốc NHỎ HƠN mốc thật, và `created_at > $cursor` nhận lại
    // đúng dòng đã trả — dòng LẶP, im lặng.
    const decoded = decodeProblemCursor(encodeProblemCursor('createdAt', ROW), 'createdAt');
    expect(decoded.sortValue).toBe(ROW.createdAt.getTime());
    expect(new Date(decoded.sortValue as number).toISOString()).toBe('2026-09-08T01:02:03.456Z');
  });

  it('mã hoá difficulty bằng GIÁ TRỊ enum, không bằng thứ hạng số', () => {
    // Thứ hạng số buộc `WHERE` phải dựng lại thang bằng `CASE`, tức hai bộ so
    // sánh phải luôn đồng ý với nhau. Giá trị enum thì để một mình Postgres so.
    expect(encodeProblemCursor('difficulty', ROW)).toBe('d:medium:K8S-0042');
  });

  it('từ chối con trỏ của một thứ tự KHÁC thay vì đọc bừa theo khoá mới', () => {
    const asDifficulty = encodeProblemCursor('difficulty', ROW);
    // Đọc con trỏ `difficulty` bằng khoá `solverCount` sẽ ra một `sortValue` vô
    // nghĩa nếu không kiểm tiền tố — và trang sau khi đó nhảy cóc, không lỗi.
    expect(() => decodeProblemCursor(asDifficulty, 'solverCount')).toThrow(TRPCError);
    expect(() => decodeProblemCursor(asDifficulty, 'code')).toThrow(TRPCError);
  });

  it.each([
    ['chuỗi rỗng', ''],
    ['thiếu phần tử', 'd:medium'],
    ['thừa phần tử', 'd:medium:K8S-0042:x'],
    ['mã bài sai khuôn', 'd:medium:K8S-42'],
    ['độ khó không có trong thang', 'd:impossible:K8S-0042'],
    ['giá trị số không phải số nguyên', 's:1.5:K8S-0042'],
    ['giá trị số rỗng', 's::K8S-0042'],
  ])('từ chối con trỏ hỏng: %s', (_label, cursor) => {
    const orderBy: ProblemOrderKey = cursor.startsWith('s:') ? 'solverCount' : 'difficulty';
    expect(() => decodeProblemCursor(cursor, orderBy)).toThrow(TRPCError);
  });

  it('BAD_REQUEST chứ không phải lỗi máy chủ — con trỏ hỏng là input của client', () => {
    // 500 ở đây nghĩa là một input hỏng đọc ra như một sự cố hạ tầng: nó vào log
    // lỗi, vào cảnh báo, và không nói cho ai biết phải sửa gì.
    try {
      decodeProblemCursor('rác', 'difficulty');
      expect.unreachable('phải ném');
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe('BAD_REQUEST');
    }
  });
});
