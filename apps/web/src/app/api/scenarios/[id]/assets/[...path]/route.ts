import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { scenarioIdSchema } from '@devops-platform/shared-types/scenario';
import { contentStorageKeySchema } from '@devops-platform/shared-types/authoring';
import { getAuth } from '../../../../../../server/auth/config';
import { readContentAsset } from '../../../../../../server/content/assets';
import { getDb } from '../../../../../../server/db/client';
import { scenarioDir } from '../../../../../../server/lessons/catalog';

/**
 * Phục vụ asset TĨNH của scenario (ảnh trong nội dung bài) — P2 / 2.D task 0.5.
 *
 * ## Vì sao cần một route thay vì để Next lo
 *
 * `content/scenarios/**` nằm NGOÀI `apps/web/public`, và cố ý: nó được
 * `vendor-scenarios.mjs` ghim byte-với-byte theo commit upstream, nên chép nó
 * vào `public/` sẽ tạo ra bản sao thứ hai trôi khỏi bản đã ghim. Nhưng nội dung
 * đã vendored lại tham chiếu ảnh bằng đường dẫn TƯƠNG ĐỐI
 * (`content/scenarios/loxilb-tcp-load-balancing/step1.md` viết
 * `![diagram](./assets/topology.png)`), nên phải có ai đó phát byte đó qua HTTP.
 *
 * ## Vì sao gác đăng nhập
 *
 * Nội dung bài học là tài sản của nền tảng; ảnh trong bài cũng vậy. Route này
 * nằm dưới `/api/` nên KHÔNG được `PROTECTED_PATHS` của `proxy.ts` che (danh
 * sách đó chỉ gác trang), và kể cả có che thì proxy chỉ kiểm SỰ TỒN TẠI của
 * cookie. Kiểm session thật ở đây là lớp duy nhất có thật.
 *
 * ## Vì sao chỉ ảnh
 *
 * Thư mục `assets/` chứa cả `start.sh`, `common.sh`, `server1.js` — script để
 * ĐẨY VÀO SANDBOX, không phải để tải về trình duyệt. Phát chúng qua HTTP không
 * lộ bí mật nào (nội dung đã công khai trên GitHub upstream), nhưng nó biến một
 * route phục vụ ảnh thành một route phục vụ file tuỳ ý — và cái sau là thứ mà
 * lần mở rộng tiếp theo sẽ vô tình dựa vào. Allowlist theo ĐUÔI, không blocklist.
 *
 * ## P9 — nguồn DB, và vì sao nó KHÔNG dùng lại đường dẫn ở trên
 *
 * Bài soạn trên UI không có thư mục nào. Asset của nó nằm trong
 * `content_assets`, tra bằng `storageKey` — 32 hex ký tự do server sinh.
 * `scenarioDir()` đã ghi sẵn món nợ này: *"bản DB-backed sẽ không có thư mục nào
 * để trả về."*
 *
 * Hai đường được phân biệt bằng HÌNH DẠNG của path, không bằng một tham số:
 * một segment duy nhất khớp `^[0-9a-f]{32}$` là nguồn DB; mọi thứ khác là đĩa.
 * Không có giao nhau — tên file trên đĩa upstream đều có đuôi, nên không tên
 * nào khớp 32-hex-không-đuôi.
 *
 * ⛔ Kiểm quyền GIỮ NGUYÊN (task 17): cùng một `getSession` gác cả hai đường,
 * chạy TRƯỚC khi phân nhánh. Thêm một nguồn không được là thêm một đường vòng
 * quanh cổng.
 */

const CONTENT_TYPES = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; path: string[] }> },
): Promise<NextResponse> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (session === null) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { id, path: segments } = await context.params;

  const parsedId = scenarioIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }

  // ── Nguồn DB: một segment, 32 hex ────────────────────────────────────────
  // Tra theo CẢ `(contentId, storageKey)` — xem `readContentAsset`: khoá unique
  // toàn cục không đủ, vì URL mang contentId và bỏ nó khỏi câu tra sẽ phục vụ
  // được asset của bài khác.
  const onlySegment = segments.length === 1 ? segments[0] : undefined;
  if (onlySegment !== undefined && contentStorageKeySchema.safeParse(onlySegment).success) {
    const asset = await readContentAsset(getDb(), parsedId.data, onlySegment);
    if (asset === null) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(asset.bytes), {
      status: 200,
      headers: {
        'content-type': asset.contentType,
        // KHÁC nội dung vendored: bài soạn trên UI sửa được bất cứ lúc nào, nên
        // không có `max-age` dài. Nhưng byte của MỘT `storageKey` thì bất biến
        // (sửa ảnh = tải lên khoá mới), nên `ETag` cho phép 304 mà không cần
        // đoán thời hạn.
        etag: `"${asset.sha256}"`,
        'cache-control': 'private, no-cache',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'x-content-type-options': 'nosniff',
      },
    });
  }

  // ── Nguồn đĩa: đường dẫn tương đối trong `assets/` ────────────────────────
  const relative = segments.join('/');
  const extension = relative.slice(relative.lastIndexOf('.')).toLowerCase();
  const contentType = CONTENT_TYPES.get(extension);
  if (contentType === undefined) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // Guard traversal. Next đã giải mã `%2e%2e` TRƯỚC khi điền `params`, nên kiểm
  // chuỗi thô (`segments.includes('..')`) là kiểm sau khi kẻ tấn công đã đi qua
  // — đúng nhưng không đủ để dựa vào một mình. Phép kiểm thật là so tiền tố trên
  // đường dẫn ĐÃ chuẩn hoá: `resolve` triệt tiêu mọi `..` còn sót, và kết quả
  // phải vẫn nằm trong `assets/` của đúng scenario đó.
  const assetsRoot = resolve(scenarioDir(parsedId.data), 'assets');
  const full = resolve(assetsRoot, relative);
  if (!full.startsWith(assetsRoot + sep)) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(full);
  } catch {
    // Không phân biệt ENOENT với EACCES ra ngoài: chênh lệch phản hồi giữa hai
    // ca cho phép dò sự tồn tại của file nằm ngoài allowlist.
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'content-type': contentType,
      // Nội dung ghim theo commit nên bất biến trong vòng đời một image; nhưng
      // `private` vì route có gác đăng nhập — một proxy chung không được giữ
      // bản sao dùng lại cho người chưa đăng nhập.
      'cache-control': 'private, max-age=3600',
      // Ảnh SVG có thể mang script. `img-src` của CSP không chặn script bên
      // trong SVG khi nó được mở TRỰC TIẾP bằng URL, nên chặn ở đây.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'x-content-type-options': 'nosniff',
    },
  });
}
