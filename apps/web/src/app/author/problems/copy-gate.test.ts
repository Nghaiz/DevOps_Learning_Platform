import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanLatinLiteral } from '@devops-platform/copy/scan';

/**
 * **T4 cho lane 16.G2** — `p16-copy.md` §6.2 mục 1: "T4 xanh trên glob của lane.
 * Đây là cổng, không phải lời hứa."
 *
 * Cùng khuôn `components/session/copy-gate.test.ts` của lane 16.D: bộ dò là hàm
 * THUẦN của `packages/copy`, không phải một bản chép ở đây. Đọc chú thích đầu
 * file đó cho phần "cái nó bắt và cái nó KHÔNG bắt" cùng lý do file test bị loại
 * khỏi phạm vi quét; không lặp lại ở đây.
 *
 * ## ⚠ `jsx-text` bị LOẠI trên file `.ts` thuần, và đây là lý do
 *
 * Mẫu `jsx-text` của bộ dò là `>([^<>]*)<`. Trong một file `.tsx` nó khớp phần
 * chữ giữa hai thẻ. Trong một file `.ts` KHÔNG có JSX nào, nó vẫn khớp: đoạn
 * giữa mũi tên hàm `=>` và dấu mở generic `<`, tức một mảng mã dài vài chục
 * dòng chẳng liên quan gì tới chữ người dùng đọc. Lane 16.E đã đo đúng chuyện
 * này trên `catalog-stats.server.ts` (một "vi phạm" dài 18 dòng, không chứa một
 * ký tự JSX nào), và glob của lane này có mười file `.ts` thuần nên nó chắc
 * chắn sẽ cắn.
 *
 * Loại `jsx-text` theo ĐUÔI FILE là phép lọc hẹp nhất đúng: `.ts` không dựng
 * được JSX ở dự án này (`tsconfig` chỉ bật `jsx` cho `.tsx`), nên mọi hit
 * `jsx-text` trên `.ts` là báo động giả theo định nghĩa. `string-literal` vẫn
 * quét đủ trên cả hai đuôi, và đó là kênh mà một chuỗi người dùng đọc thật sự
 * đi qua trong file logic.
 *
 * Đối chứng dương cho chính phép lọc đó nằm ở ô cuối cùng: nếu bộ dò một ngày
 * thôi sinh `jsx-text` trên `.ts`, ô đó đỏ và phép lọc này thành thừa.
 */

/** Gốc glob của lane, suy từ vị trí file này. */
const LANE_DIR = import.meta.dirname;

/**
 * File CHƯA chuyển sang `packages/copy`, khai từng cái kèm ngày và lý do.
 *
 * Đây là một **pinned baseline** theo `rules/pinned-baseline-test-companion.md`,
 * nên nó đi kèm hai vế chứ không một:
 *
 * 1. Không file nào NGOÀI bảng này được vi phạm (vế chống phình).
 * 2. Không dòng nào TRONG bảng này được sạch (vế chống nghĩa địa) — xem ô
 *    `khong con dong mien tru nao het han`. Một file đã chuyển xong mà vẫn nằm
 *    đây là một dòng không ai dám dọn, và bảng chỉ lớn lên.
 *
 * ⛔ Khi một dòng ở đây đỏ vì file đã sạch, XOÁ DÒNG ĐÓ. Không thêm dòng mới để
 * bảng lại xanh, và tuyệt đối không đổi bảng thành "danh sách hiện tại" bằng
 * cách chép lại thứ lượt chạy vừa in ra. Bảng rỗng là đích, và lúc rỗng thì cả
 * hai vế trên vẫn chạy đúng.
 */
const DEFERRED: Readonly<Record<string, string>> = {
  'allowed-resources-fields.tsx': '2026-09-10: nhóm trường, lane 16.G2 hết ngân sách lượt và dừng ở ranh giới sạch thay vì chuyển nửa vời',
  'classify-fields.tsx': '2026-09-10: nhóm trường, cùng lý do',
  'cluster-fields.tsx': '2026-09-10: nhóm trường, cùng lý do',
  'cluster-json-fields.tsx': '2026-09-10: nhóm trường, cùng lý do',
  'hint-fields.tsx': '2026-09-10: nhóm trường, cùng lý do',
  'node-fields.tsx': '2026-09-10: nhóm trường, cùng lý do',
  'objective-arg-field.tsx': '2026-09-10: nhóm trường, cùng lý do',
  'objective-fields.tsx': '2026-09-10: nhóm trường, cùng lý do',
  'resource-fields.tsx': '2026-09-10: nhóm trường, cùng lý do',
  'statement-fields.tsx': '2026-09-10: nhóm trường, cùng lý do',
  'cluster-to-spec.ts': '2026-09-10: cùng lý do tầng logic thuần',
  'predicate-arg-types.ts': '2026-09-10: cùng lý do tầng logic thuần',
  'predicate-spec.ts': '2026-09-10: cùng lý do tầng logic thuần',
  'problem-draft.ts': '2026-09-10: cùng lý do tầng logic thuần',
  'problem-json.ts': '2026-09-10: cùng lý do tầng logic thuần',
  'problem-test-fixture.ts': '2026-09-10: dữ liệu mẫu cho test, chữ trong đó là RUỘT bài mẫu chứ không phải vỏ màn hình',
  'problem-validate.ts': '2026-09-10: cùng lý do tầng logic thuần',
  'vocabulary.ts': '2026-09-10: bảng từ vựng vị từ, chặn bởi số VỊ TỪ chứ không bởi số màn hình, cần lead chốt vỏ hay ruột trước khi chuyển',
};

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FILES: readonly string[] = collect(LANE_DIR);

function relative(file: string): string {
  return path.relative(LANE_DIR, file).split(path.sep).join('/');
}

/** Số vi phạm THẬT của một file, sau khi loại báo động giả `jsx-text` trên `.ts`. */
function violationCount(file: string): number {
  const source = readFileSync(file, 'utf8');
  const isTsx = file.endsWith('.tsx');
  return scanLatinLiteral(source).filter((v) => isTsx || v.kind === 'string-literal').length;
}

const DIRTY: readonly string[] = FILES.filter((f) => violationCount(f) > 0).map(relative);

describe('T4 · glob của lane 16.G2', () => {
  /*
    Ô "tập đầu vào không rỗng" chạy TRƯỚC mọi ô đếm, theo khuôn T0 của hợp đồng
    §3.0. Không có nó thì một lượt đổi tên thư mục, hay `import.meta.dirname`
    trỏ sai chỗ, biến cả cổng này thành một no-op xanh.
  */
  it('quét được một tập file không rỗng', () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  /*
    Đối chứng dương trên nguồn TỔNG HỢP, KHÔNG trên bảng hoãn.

    Bản đầu của ô này viết `expect(DIRTY.length).toBeGreaterThan(0)`, và đó là
    một cái bẫy: ngày lane chuyển xong file cuối cùng, DIRTY về 0 và ô đỏ với
    thông điệp "bộ dò hỏng" trong khi sự thật là "đã xong". Đúng bẫy "RED for
    the opposite reason" mà `pinned-baseline-test-companion.md` mô tả, và cách
    sửa hiển nhiên (hạ ngưỡng xuống 0) sẽ biến ô này thành no-op vĩnh viễn.

    Nguồn tổng hợp không bao giờ hết hạn: nó đo ĐÚNG thứ nó nói là đo, tức bộ dò
    còn phân biệt được chuỗi có dấu với chuỗi không dấu.
  */
  it('bộ dò còn phân biệt được chuỗi có dấu với chuỗi không', () => {
    expect(scanLatinLiteral("const a = 'Chưa có gợi ý nào';")).toHaveLength(1);
    expect(scanLatinLiteral("const a = 'no diacritics at all';")).toEqual([]);
  });

  it('không file nào ngoài bảng hoãn còn chuỗi người dùng nằm ngoài bản đồ', () => {
    const unexpected = DIRTY.filter((rel) => !(rel in DEFERRED));
    expect(unexpected).toEqual([]);
  });

  /*
    Vế thứ hai của cổng. Không có nó, bảng DEFERRED chỉ lớn lên: một file đã
    chuyển xong vẫn nằm trong bảng, và lần sau ai đó đọc bảng sẽ tưởng nó chưa
    làm. Đây là companion mà `pinned-baseline-test-companion.md` bắt buộc, và nó
    khẳng định theo TÊN chứ không theo số đếm: một bảng 21 dòng vẫn "đúng 21"
    kể cả khi 10 dòng đã hết hạn và 10 file khác vừa hỏng.
  */
  it('khong con dong mien tru nao het han', () => {
    const stale = Object.keys(DEFERRED).filter((rel) => !DIRTY.includes(rel));
    expect(stale).toEqual([]);
  });

  /*
    Đối chứng cho chính phép lọc `jsx-text` trên `.ts`. Nếu ô này đỏ thì bộ dò
    đã thôi sinh báo động giả và phép lọc ở `violationCount` thành thừa: xoá nó
    đi thay vì để lại một tấm lọc che mất vi phạm thật.
  */
  it('phep loc jsx-text tren .ts van con ly do ton tai', () => {
    // Nguồn tổng hợp, cùng lý do như ô đối chứng dương ở trên: đếm trên FILE
    // THẬT thì phép lọc "hết lý do" ngay khi glob sạch chữ tiếng Việt, dù cơ
    // chế sinh báo động giả (mũi tên hàm rồi dấu mở generic) không đổi gì.
    //
    // Đoạn dưới KHÔNG chứa một thẻ JSX nào. Dấu `>` là của `=>`, dấu `<` là của
    // `Array<`, và phần chữ nằm giữa hai dấu đó có ký tự tiếng Việt, nên bộ dò
    // ghi nó thành một vi phạm `jsx-text`.
    const tsShaped = "const f = () => ['Đã lưu'] as Array<string>;";
    expect(scanLatinLiteral(tsShaped).some((v) => v.kind === 'jsx-text')).toBe(true);
  });
});
