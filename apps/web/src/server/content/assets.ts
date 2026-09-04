import { createHash, randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import {
  CONTENT_ASSET_TYPES,
  MAX_CONTENT_ASSET_BYTES,
  contentAssetFilenameSchema,
} from '@devops-platform/shared-types/authoring';
import type { Database } from '../db/client';
import { contentAssets, type ContentAssetRecord } from '../db/schema';

/**
 * Asset của bài soạn trên UI — tải lên và phục vụ (P9 9.E).
 *
 * ## Mô hình chống path traversal ở đây
 *
 * Không phải "lọc `..` cho khéo". Là: **không có đường dẫn nào để traverse**.
 * Tên file người soạn nhập chỉ đi vào cột `filename` (hiển thị); thứ đi vào URL
 * là `storageKey` do server sinh, 32 hex ký tự, không có đuôi, không có dấu
 * phân cách. Một tên file `../../etc/passwd` lưu được — và vô hại, vì nó không
 * bao giờ được nối vào bất cứ đường dẫn nào.
 *
 * So với route asset đã có (`/api/scenarios/[id]/assets/[...path]`), vốn PHẢI
 * xử lý đường dẫn vì nội dung vendored tham chiếu ảnh bằng đường tương đối:
 * ở đó phòng thủ là `resolve` + so tiền tố. Ở đây cửa đó không tồn tại. Tầng
 * web không được yếu hơn `E8` của image sandbox, và cách chắc chắn nhất để
 * không yếu hơn là không có cùng cái cửa.
 *
 * ## Content-type lấy từ ĐUÔI, không từ header client gửi
 *
 * `Content-Type` trong multipart là do client đặt. Tin nó nghĩa là một file
 * `.png` khai `text/html` sẽ được phục vụ dưới dạng HTML — XSS trên chính
 * origin của nền tảng. Allowlist theo đuôi, và content-type là GIÁ TRỊ TRA
 * ĐƯỢC từ đuôi đó.
 */

export interface StoredAsset {
  readonly storageKey: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sha256: string;
  readonly uploadedAt: string;
}

function toStored(record: ContentAssetRecord): StoredAsset {
  return {
    storageKey: record.storageKey,
    filename: record.filename,
    contentType: record.contentType,
    sha256: record.sha256,
    uploadedAt: record.uploadedAt.toISOString(),
  };
}

/**
 * Đuôi của một tên file, chữ thường, kèm dấu chấm. `''` khi không có đuôi.
 *
 * `lastIndexOf` chứ không phải tách theo `.` rồi lấy phần cuối: `archive.tar.gz`
 * có đuôi `.gz`, và một tên bắt đầu bằng dấu chấm (`.png`) là một file ẩn không
 * có đuôi — `lastIndexOf` trả 0 và nhánh `<= 0` bắt đúng ca đó.
 */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot <= 0 ? '' : filename.slice(dot).toLowerCase();
}

/**
 * Nhận một file tải lên, kiểm mọi cổng, ghi vào DB.
 *
 * Thứ tự kiểm là CỐ Ý: cỡ trước, kiểu sau. Một file 900 MB bị từ chối vì cỡ
 * không nên phải qua bước tra bảng nào trước đó.
 */
export async function storeContentAsset(
  db: Database,
  contentId: string,
  input: { filename: string; bytes: Buffer },
): Promise<StoredAsset> {
  if (input.bytes.byteLength === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'File rỗng' });
  }
  if (input.bytes.byteLength > MAX_CONTENT_ASSET_BYTES) {
    throw new TRPCError({
      code: 'PAYLOAD_TOO_LARGE',
      message: `File vượt trần ${String(MAX_CONTENT_ASSET_BYTES)} byte`,
    });
  }

  const parsedName = contentAssetFilenameSchema.safeParse(input.filename);
  if (!parsedName.success) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tên file không hợp lệ' });
  }
  const contentType = CONTENT_ASSET_TYPES.get(extensionOf(parsedName.data));
  if (contentType === undefined) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Chỉ nhận ${[...CONTENT_ASSET_TYPES.keys()].join(', ')}`,
    });
  }

  const storageKey = randomUUID().replaceAll('-', '');
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');

  const [record] = await db
    .insert(contentAssets)
    .values({
      id: randomUUID(),
      contentId,
      storageKey,
      filename: parsedName.data,
      contentType,
      sha256,
      bytes: input.bytes,
    })
    .returning();

  if (record === undefined) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Không ghi được asset' });
  }
  return toStored(record);
}

/** Danh sách asset của một bài — KHÔNG kéo `bytes` lên. */
export async function listContentAssets(
  db: Database,
  contentId: string,
): Promise<readonly StoredAsset[]> {
  const rows = await db
    .select({
      storageKey: contentAssets.storageKey,
      filename: contentAssets.filename,
      contentType: contentAssets.contentType,
      sha256: contentAssets.sha256,
      uploadedAt: contentAssets.uploadedAt,
    })
    .from(contentAssets)
    .where(eq(contentAssets.contentId, contentId));
  return rows.map((row) => ({ ...row, uploadedAt: row.uploadedAt.toISOString() }));
}

export interface AssetBytes {
  readonly bytes: Buffer;
  readonly contentType: string;
  readonly sha256: string;
}

/**
 * Byte của một asset, tra theo `(contentId, storageKey)`.
 *
 * ⚠ Cả HAI khoá, dù `storageKey` đã unique toàn cục: route phục vụ biết
 * `contentId` từ URL và đã kiểm quyền trên bài đó. Tra chỉ theo `storageKey` sẽ
 * phục vụ được asset của bài KHÁC qua URL của một bài mình có quyền — một lỗ
 * IDOR mở ra bởi việc "khoá đã unique rồi mà".
 */
export async function readContentAsset(
  db: Database,
  contentId: string,
  storageKey: string,
): Promise<AssetBytes | null> {
  const rows = await db
    .select({
      bytes: contentAssets.bytes,
      contentType: contentAssets.contentType,
      sha256: contentAssets.sha256,
    })
    .from(contentAssets)
    .where(and(eq(contentAssets.contentId, contentId), eq(contentAssets.storageKey, storageKey)))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteContentAsset(
  db: Database,
  contentId: string,
  storageKey: string,
): Promise<boolean> {
  const deleted = await db
    .delete(contentAssets)
    .where(and(eq(contentAssets.contentId, contentId), eq(contentAssets.storageKey, storageKey)))
    .returning({ storageKey: contentAssets.storageKey });
  return deleted.length > 0;
}
