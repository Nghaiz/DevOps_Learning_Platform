import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { MAX_CONTENT_ASSET_BYTES } from '@devops-platform/shared-types/authoring';
import type { Database } from '../db/client';
import { extensionOf, storeContentAsset } from './assets';

/**
 * Cổng upload (P9 9.E) — allowlist, trần cỡ, `storageKey` sinh ra, và chống
 * traversal.
 *
 * DB giả **NÉM nếu bị chạm**: mọi ca bị từ chối phải bị chặn TRƯỚC khi tới câu
 * `insert`. Một guard chạy sau khi đã ghi thì không phải guard — nó là một câu
 * xin lỗi. Ca hợp lệ dùng một DB giả khác, ghi lại hàng để kiểm `storageKey`.
 */

function dbThatMustNotBeTouched(): Database {
  return new Proxy({} as Database, {
    get() {
      throw new Error('guard đã để lọt: chạm tới DB cho một request đáng bị từ chối');
    },
  });
}

interface CapturedRow {
  storageKey: string;
  filename: string;
  contentType: string;
  sha256: string;
  bytes: Buffer;
  contentId: string;
}

function capturingDb(): { db: Database; rows: CapturedRow[] } {
  const rows: CapturedRow[] = [];
  const db = {
    insert() {
      return {
        values(row: CapturedRow) {
          rows.push(row);
          return {
            async returning() {
              return [{ ...row, uploadedAt: new Date('2026-09-04T00:00:00Z') }];
            },
          };
        },
      };
    },
  } as unknown as Database;
  return { db, rows };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('extensionOf', () => {
  it('lấy đuôi CUỐI, chữ thường', () => {
    expect(extensionOf('so-do.PNG')).toBe('.png');
    expect(extensionOf('archive.tar.gz')).toBe('.gz');
  });

  it('file ẩn không có đuôi — `.png` là TÊN, không phải đuôi', () => {
    expect(extensionOf('.png')).toBe('');
    expect(extensionOf('khong-duoi')).toBe('');
  });
});

describe('storeContentAsset — cổng từ chối, chạy TRƯỚC khi chạm DB', () => {
  it('từ chối kiểu file ngoài allowlist', async () => {
    await expect(
      storeContentAsset(dbThatMustNotBeTouched(), 'bai', {
        filename: 'payload.svg',
        bytes: PNG,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('từ chối .sh, .html — allowlist theo ĐUÔI, không blocklist', async () => {
    for (const filename of ['run.sh', 'x.html', 'a.js', 'b.exe']) {
      await expect(
        storeContentAsset(dbThatMustNotBeTouched(), 'bai', { filename, bytes: PNG }),
      ).rejects.toThrow(TRPCError);
    }
  });

  it('từ chối file vượt trần 2 MiB', async () => {
    await expect(
      storeContentAsset(dbThatMustNotBeTouched(), 'bai', {
        filename: 'to.png',
        bytes: Buffer.alloc(MAX_CONTENT_ASSET_BYTES + 1),
      }),
    ).rejects.toThrow(/vượt trần/);
  });

  it('từ chối file rỗng', async () => {
    await expect(
      storeContentAsset(dbThatMustNotBeTouched(), 'bai', {
        filename: 'rong.png',
        bytes: Buffer.alloc(0),
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('từ chối tên file mang đường dẫn — kể cả khi đuôi hợp lệ', async () => {
    // AC: `curl -F 'file=@../../etc/passwd'` phải bị từ chối. Ở đây kiểm cả biến
    // thể nguy hiểm hơn: đuôi ĐÚNG allowlist nhưng tên mang `../`.
    for (const filename of ['../../etc/passwd', '../secret.png', 'a/b.png', '..\\x.png']) {
      await expect(
        storeContentAsset(dbThatMustNotBeTouched(), 'bai', { filename, bytes: PNG }),
      ).rejects.toThrow(TRPCError);
    }
  });
});

describe('storeContentAsset — ca hợp lệ', () => {
  it('sinh storageKey 32-hex và KHÔNG dùng tên gốc làm khoá', async () => {
    const { db, rows } = capturingDb();
    const stored = await storeContentAsset(db, 'bai', { filename: 'so-do.png', bytes: PNG });

    expect(stored.storageKey).toMatch(/^[0-9a-f]{32}$/);
    // Tên gốc giữ ĐỂ HIỂN THỊ, và nó tuyệt đối không xuất hiện trong khoá lưu trữ.
    expect(stored.filename).toBe('so-do.png');
    expect(stored.storageKey).not.toContain('so-do');
    expect(rows[0]?.storageKey).toBe(stored.storageKey);
  });

  it('content-type lấy từ ĐUÔI, không từ thứ client khai', async () => {
    const { db } = capturingDb();
    const stored = await storeContentAsset(db, 'bai', { filename: 'anh.JPG', bytes: PNG });
    expect(stored.contentType).toBe('image/jpeg');
  });

  it('sha256 là của BYTE đã nhận', async () => {
    const { db } = capturingDb();
    const stored = await storeContentAsset(db, 'bai', { filename: 'a.png', bytes: PNG });
    // sha256 của 8 byte magic PNG — ghim để một thay đổi thuật toán không lặng lẽ đi qua.
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    const again = await storeContentAsset(db, 'bai', { filename: 'b.png', bytes: PNG });
    // Cùng bytes ⇒ cùng sha256, KHÁC storageKey. Đó là ranh giới giữa "nhân
    // chứng của nội dung" và "định danh của một lượt tải lên".
    expect(again.sha256).toBe(stored.sha256);
    expect(again.storageKey).not.toBe(stored.storageKey);
  });

  it('trần là bao gồm — đúng 2 MiB thì NHẬN', async () => {
    const { db } = capturingDb();
    await expect(
      storeContentAsset(db, 'bai', {
        filename: 'vua-du.png',
        bytes: Buffer.alloc(MAX_CONTENT_ASSET_BYTES),
      }),
    ).resolves.toMatchObject({ filename: 'vua-du.png' });
  });
});
