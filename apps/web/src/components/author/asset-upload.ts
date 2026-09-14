import { errText } from '@devops-platform/copy';
import {
  CONTENT_ASSET_TYPES,
  MAX_CONTENT_ASSET_BYTES,
} from '@devops-platform/shared-types/authoring';

/**
 * Cổng kiểm phía client cho tệp đính kèm, và cách nhúng nó vào markdown.
 *
 * ## Đây là cổng THỨ HAI, không phải cổng duy nhất
 *
 * `storeContentAsset` ở server kiểm lại y hệt (rỗng → cỡ → tên → đuôi) và nó là
 * cổng thật. Bản ở đây tồn tại để người soạn biết ngay thay vì tải xong 2 MB rồi
 * mới nhận từ chối — nên nó đọc CÙNG hai hằng số (`CONTENT_ASSET_TYPES`,
 * `MAX_CONTENT_ASSET_BYTES`) chứ không gõ lại danh sách đuôi. Gõ lại là dựng một
 * allowlist thứ hai, và nó sẽ lệch ở lần đầu tiên ai đó thêm một định dạng.
 *
 * ⛔ Không có `.svg` trong allowlist, và đó là chủ ý của server: SVG tải lên là
 * XML người lạ nhập, mang script được.
 */

export interface AssetFileIssue {
  readonly message: string;
}

/**
 * Đuôi của tên file, chữ thường, kèm dấu chấm. `''` khi không có đuôi.
 *
 * `lastIndexOf` chứ không tách theo `.` rồi lấy phần cuối: `archive.tar.gz` có
 * đuôi `.gz`, còn một tên bắt đầu bằng dấu chấm (`.png`) là file ẩn KHÔNG có
 * đuôi — nhánh `<= 0` bắt đúng ca đó. Cùng phép tính với `extensionOf` của
 * `server/content/assets.ts`; test dưới ghim cả hai ca đó.
 */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot <= 0 ? '' : filename.slice(dot).toLowerCase();
}

export function validateAssetFile(file: { name: string; size: number }): AssetFileIssue | null {
  if (file.size === 0) {
    return { message: errText('author.asset-upload-tep-rong-chon-lai-mot-tep-co-noi-dung') };
  }
  if (file.size > MAX_CONTENT_ASSET_BYTES) {
    return {
      message: errText('author.asset-upload-tep-vuot-tran-nen-anh-lai-roi-thu-lai', {
        formatbytesFileSize: String(formatBytes(file.size)),
        formatbytesMaxContentAssetBytes: String(formatBytes(MAX_CONTENT_ASSET_BYTES)),
      }),
    };
  }
  if (!CONTENT_ASSET_TYPES.has(extensionOf(file.name))) {
    return {
      message: errText('author.asset-upload-chi-nhan-doi-dinh-dang-roi-thu-lai', {
        contentAssetTypesKeysJoin: String([...CONTENT_ASSET_TYPES.keys()].join(', ')),
      }),
    };
  }
  return null;
}

/** Cỡ tệp cho người đọc. KB/MB là 1024, khớp cách trần được khai. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Bytes thành base64 — tRPC là JSON, không phải multipart.
 *
 * Chia khối 8 KB chứ không `String.fromCharCode(...bytes)` một phát: trải một
 * `Uint8Array` 2 MB vào tham số hàm là ~2 triệu đối số và trình duyệt ném
 * `RangeError: Maximum call stack size exceeded`. Lỗi đó chỉ xuất hiện với tệp
 * lớn, nên nó qua được mọi lượt thử bằng ảnh nhỏ.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 8 * 1024;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

/**
 * Đoạn markdown nhúng ảnh đã tải lên.
 *
 * `./assets/<storageKey>` — đúng hình dạng mà `resolveContentAssetUrl` (và
 * `lesson-client.tsx`) giải được, và đúng hình dạng route asset nhận ra là
 * nguồn DB (một segment khớp 32 ký tự hex). Tên file gốc đi vào ALT, không vào
 * đường dẫn: `storageKey` do server sinh và là thứ DUY NHẤT được vào URL.
 */
export function assetMarkdownSnippet(asset: { filename: string; storageKey: string }): string {
  return `![${asset.filename}](./assets/${asset.storageKey})`;
}
