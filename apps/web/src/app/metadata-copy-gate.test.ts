import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_DIR = join(import.meta.dirname);

/**
 * Cổng cho tiêu đề tài liệu của mọi route.
 *
 * ## Vì sao nó phải tồn tại riêng, ngoài sáu cổng `copy-gate.test.ts` kia
 *
 * Sáu cổng đó gác theo glob của từng lane — `components/{shell,session,admin,me,
 * marketing}` và `app/author/problems`. Không cái nào phủ `app/**` nói chung,
 * nên `export const metadata` của các file route rơi qua khe: tám tiêu đề còn
 * chuỗi viết thẳng kèm gạch ngang dài đã sống qua trọn bảy lane của P16 mà
 * không ô nào đỏ, và chúng chỉ lộ ra khi có người đọc tay.
 *
 * Cổng T1 của `packages/copy` không thấy chúng được: nó quét
 * `packages/copy/src/**`, mà chuỗi viết thẳng thì theo định nghĩa nằm ngoài đó.
 * Một chuỗi ngoài bản đồ là chuỗi mà MỌI cổng của bản đồ đều mù.
 */
function walk(dir: string): readonly string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (name === 'page.tsx' || name === 'layout.tsx') {
      out.push(full);
    }
  }
  return out;
}

/**
 * Trích đúng thân `export const metadata = { … }` và thân `generateMetadata`.
 *
 * Quét cả file thì `title:` trong một mảng lựa chọn hay một prop cũng đỏ, và
 * một cổng báo động giả là một cổng sẽ bị gỡ. Thu hẹp về đúng vùng khai báo
 * metadata giữ cho ô đỏ luôn là ô đáng sửa.
 */
function metadataRegions(source: string): readonly string[] {
  const regions: string[] = [];
  const markers = [/export const metadata\b/g, /export async function generateMetadata\b/g];
  for (const marker of markers) {
    for (const hit of source.matchAll(marker)) {
      const from = hit.index ?? 0;
      let depth = 0;
      let started = false;
      for (let i = from; i < source.length; i += 1) {
        const ch = source[i];
        if (ch === '{') {
          depth += 1;
          started = true;
        } else if (ch === '}') {
          depth -= 1;
          if (started && depth === 0) {
            regions.push(source.slice(from, i + 1));
            break;
          }
        }
      }
    }
  }
  return regions;
}

/**
 * Dấu phân cách đường dẫn của Windows, dựng bằng mã ký tự thay vì viết thẳng.
 *
 * Không phải để làm dáng: tầng công cụ ghi file của phiên dựng cổng này nuốt
 * dấu gạch chéo ngược trong nội dung, nên một literal viết thẳng hạ cánh trên
 * đĩa thiếu mất một ký tự và file không phân tích được. Dựng bằng mã thì không
 * có gì để nuốt.
 */
const WIN_SEP = String.fromCharCode(92);

const HARDCODED_FIELD = /\b(?:title|description):\s*['"`]/;

export function hardcodedMetaOffenders(source: string): readonly string[] {
  return metadataRegions(source).filter((region) => HARDCODED_FIELD.test(region));
}

describe('tiêu đề tài liệu đi qua packages/copy', () => {
  it('không route nào viết thẳng title hay description trong metadata', () => {
    const offenders: string[] = [];
    for (const file of walk(APP_DIR)) {
      if (hardcodedMetaOffenders(readFileSync(file, 'utf8')).length > 0) {
        offenders.push(file.slice(APP_DIR.length + 1).split(WIN_SEP).join('/'));
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * Đối chứng DƯƠNG. Không có nó, ô trên xanh y hệt khi `metadataRegions` trả
   * rỗng vì một lỗi cắt vùng — tức một cổng không thể đỏ, thứ tệ hơn không có
   * cổng vì nó kết thúc việc điều tra thay vì mở ra.
   */
  it('bắt được chuỗi viết thẳng ở cả title lẫn description', () => {
    expect(
      hardcodedMetaOffenders("export const metadata = {\n  title: 'Bài học',\n};"),
    ).toHaveLength(1);
    expect(
      hardcodedMetaOffenders(
        'export async function generateMetadata() {\n  return { description: `x` };\n}',
      ),
    ).toHaveLength(1);
  });

  /**
   * Đối chứng ÂM ở hai phía: dạng đúng không được kêu, VÀ `title:` nằm ngoài
   * vùng metadata cũng không được kêu. Vế thứ hai là vế giữ cổng khỏi bị gỡ.
   */
  it('không kêu trên dạng đúng, và không kêu trên title ngoài vùng metadata', () => {
    expect(
      hardcodedMetaOffenders("export const metadata = {\n  title: t('catalog.meta-title.labs'),\n};"),
    ).toEqual([]);
    expect(
      hardcodedMetaOffenders("const options = [{ title: 'không phải metadata' }];"),
    ).toEqual([]);
  });
});
