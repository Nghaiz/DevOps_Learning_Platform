import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { decodeClassCursor, encodeClassCursor } from './cursor';

/**
 * Con trỏ keyset của `classes.list`. Thuần, không đụng DB.
 *
 * Ô đáng giá nhất ở đây là ô CHUỖI LẠ: không có nó, một cursor do client bịa
 * sẽ đi thẳng vào `WHERE id > $1` và Postgres ném `22P02` ở tầng kiểu, tức một
 * input hỏng của client đọc ra như sự cố máy chủ và câu SQL kèm tham số đi vào
 * thông điệp lỗi. Đó là bẫy đã ghi ở `assertUuidCursor` trong `trpc/init.ts`.
 */

const UUID = '0f8e7d6c-5b4a-4938-a271-6c5d4e3f2a1b';

function isBadRequest(error: unknown): boolean {
  return error instanceof TRPCError && error.code === 'BAD_REQUEST';
}

describe('con trỏ lớp học', () => {
  it('đi vòng tròn: mã hoá rồi giải mã ra đúng cặp khoá', () => {
    const createdAt = new Date('2026-09-14T03:04:05.678Z');
    const decoded = decodeClassCursor(encodeClassCursor({ createdAt, id: UUID }));
    expect(decoded).toEqual({ createdAtMs: createdAt.getTime(), id: UUID });
  });

  it('giữ nguyên phần mili giây', () => {
    // `created_at` khai `precision: 3`, nên mili giây là phần thật của khoá
    // sắp xếp. Một con trỏ cắt mất nó sẽ so sai ở đúng những dòng tạo gần nhau
    // nhất, tức là chỗ keyset dễ mất dòng nhất.
    const createdAt = new Date(1_789_000_000_123);
    expect(decodeClassCursor(encodeClassCursor({ createdAt, id: UUID })).createdAtMs).toBe(
      1_789_000_000_123,
    );
  });

  it.each([
    ['rỗng', ''],
    ['thiếu nửa sau', '1789000000123'],
    ['thừa một đoạn', `1789000000123:${UUID}:x`],
    ['nửa sau không phải uuid', '1789000000123:khong-phai-uuid'],
    ['nửa đầu không phải số', `abc:${UUID}`],
    ['nửa đầu âm', `-1:${UUID}`],
    ['nửa đầu vượt số nguyên an toàn', `9007199254740993:${UUID}`],
    ['con trỏ của một danh sách khác', UUID],
  ])('từ chối con trỏ %s bằng 400, không để nó xuống tầng SQL', (_label, cursor) => {
    expect(() => decodeClassCursor(cursor)).toThrowError(expect.toSatisfy(isBadRequest));
  });

  it('ĐỐI CHỨNG ÂM: một con trỏ hợp lệ KHÔNG bị bộ kiểm trên bắt', () => {
    // Không có ô này thì một `decodeClassCursor` luôn ném cũng làm mọi ô trên
    // xanh, tức xanh vì mù chứ không phải vì đúng.
    expect(() => decodeClassCursor(`1789000000123:${UUID}`)).not.toThrow();
  });
});
