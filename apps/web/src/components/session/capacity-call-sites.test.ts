import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MỌI trang dựng `SessionControls` phải truyền `profile` — phép kiểm TĨNH.
 *
 * ## Vì sao cần một phép kiểm riêng cho việc "có truyền tham số không"
 *
 * `capacity.test.ts` gác NGỮ NGHĨA con số; `session-controls.dom.test.tsx` gác
 * việc con số chảy tới DOM. Cả hai đều xanh với một trang QUÊN truyền `profile`,
 * vì prop đó **tuỳ chọn** (`profile?: string`, mặc định `DEFAULT_PROFILE`) —
 * trang thiếu nó biên dịch sạch, không lint nào kêu, và màn hình lặng lẽ đếm
 * chỗ cho "bài thường" trên một trang lab Kubernetes.
 *
 * Đó không phải giả thuyết. Ngày 2026-09-08, `lessons/[id]` được vá còn
 * `labs/[id]` và `playgrounds/[id]` thì không: hai trang đó nói sai suốt một
 * commit trong khi `pnpm --filter web typecheck` xanh và 1241 ô test xanh. Đúng
 * hạng lỗi đã cắn hai PR liên tiếp trong dự án này — hàm đúng, có test, mà
 * không call-site nào truyền đúng tham số.
 *
 * ## Vì sao TĨNH chứ không render từng trang
 *
 * Mệnh đề cần gác là *"KHÔNG trang nào trong repo dựng `SessionControls` mà
 * thiếu `profile`"* — một mệnh đề về toàn bộ cây `app/`, không về một component.
 * Render từng trang thì phải dựng tRPC provider, session hook, WebSocket giả cho
 * mỗi route; và một route MỚI quên thêm vào danh sách render sẽ lọt qua trong im
 * lặng — đúng lỗ hổng mà bản tĩnh không có. Cùng lý lẽ đã ghi ở
 * `landmark-contract.test.ts`.
 */

/**
 * Trang được phép dựng `SessionControls`, đường dẫn tương đối `apps/web/src`.
 *
 * Danh sách này gác HAI CHIỀU (xem ô "đúng ba trang"): một trang mới xuất hiện ⇒
 * ĐỎ, và việc phải làm là truyền `profile` rồi thêm tên vào đây; một trang trong
 * danh sách hết dựng `SessionControls` ⇒ CŨNG ĐỎ, vì lúc đó danh sách đang mô tả
 * một quá khứ không còn đúng.
 *
 * ⚠ `app/quiz/[id]/quiz-client.tsx` CỐ Ý không có mặt: quiz không mở sandbox nào
 * (xem chú thích đầu file đó). Nó nhắc tên `SessionControls` trong prose, và
 * phép kiểm bỏ chú thích trước khi đếm nên prose không tính.
 */
const TRANG_DUNG_SESSION_CONTROLS = [
  'app/labs/[id]/lab-client.tsx',
  'app/lessons/[id]/lesson-client.tsx',
  'app/playgrounds/[id]/playground-client.tsx',
] as const;

const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo']);

function collectTsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsxFiles(full, out);
    } else if (entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Bỏ chú thích TRƯỚC khi đếm — bắt buộc, không phải làm đẹp.
 *
 * Chính ba trang này viết chú thích giải thích vì sao `profile` tồn tại, và
 * `quiz-client.tsx` viết cả một đoạn về việc nó KHÔNG dựng `SessionControls`.
 * Đếm thô sẽ tính prose thành call-site và báo vi phạm ở đúng những file viết ra
 * luật — một phép kiểm luôn đỏ là một phép kiểm sẽ bị tắt.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Mỗi phần tử `<SessionControls … />` nguyên khối, để soi từng prop của nó. */
function sessionControlsElements(source: string): string[] {
  return stripComments(source).match(/<SessionControls\b[\s\S]*?\/>/g) ?? [];
}

describe('call-site — mọi trang dựng SessionControls đều truyền profile', () => {
  const srcRoot = path.resolve(import.meta.dirname, '..', '..');

  /*
    Đọc MỘT lượt ở pha thu thập chứ không trong thân `it`: quét hàng trăm file
    bằng `readFileSync` khi turbo chạy nhiều gói song song trên Windows đủ vượt
    `testTimeout` 5000ms, và ô đỏ khi đó là đỏ vì tranh I/O, không phải vì hợp
    đồng bị phá. Xem cùng chú thích ở `landmark-contract.test.ts`.
  */
  const trangCoCallSite = collectTsxFiles(path.join(srcRoot, 'app'))
    .map((file) => ({
      relative: path.relative(srcRoot, file).split(path.sep).join('/'),
      elements: sessionControlsElements(readFileSync(file, 'utf8')),
    }))
    .filter((f) => f.elements.length > 0);

  it('tìm được call-site thật (đối chứng: phép kiểm không chạy trên tập rỗng)', () => {
    // Nếu regex hỏng — đổi sang component bọc, đổi tên, viết nhiều dòng kiểu
    // khác — danh sách này về rỗng và ô dưới xanh vì không đo gì.
    expect(trangCoCallSite.flatMap((f) => f.elements).length).toBeGreaterThanOrEqual(3);
  });

  it('đúng ba trang, không hơn không kém', () => {
    expect(trangCoCallSite.map((f) => f.relative).sort()).toEqual([...TRANG_DUNG_SESSION_CONTROLS]);
  });

  it('không call-site nào thiếu prop `profile`', () => {
    const thieu = trangCoCallSite
      .filter((f) => f.elements.some((el) => !/\bprofile=/.test(el)))
      .map((f) => f.relative);
    expect(
      thieu,
      'thiếu `profile` ⇒ nhãn cạnh nút Bắt đầu đếm theo profile MẶC ĐỊNH. Trên một ' +
        'lab Kubernetes (1024Mi, trần 5) đó là con số của bài thường (256Mi, trần 23) — ' +
        'đúng lỗi 2026-09-07: "Còn 14 chỗ" trong lúc server trả 429. Nguồn đúng là ' +
        'field `profile` của `lessons.get`/`labs.get`/`playgrounds.get`.',
    ).toEqual([]);
  });

  it('`profile` lấy từ payload của router, không phải một chuỗi gõ tay', () => {
    // Một `profile="k8s"` chốt cứng ở trang sẽ nói đúng cho MỘT nội dung rồi nói
    // sai cho mọi nội dung khác cùng route — và nó sẽ đi qua ô ngay bên trên.
    const gotay = trangCoCallSite
      .filter((f) => f.elements.some((el) => /\bprofile=["']/.test(el)))
      .map((f) => f.relative);
    expect(gotay, 'profile phải là biểu thức lấy từ query, không phải hằng chuỗi').toEqual([]);
  });
});
