import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DIAGRAM_SRC_PATTERN,
  type DiagramMap,
  type DiagramSvg,
} from '@devops-platform/shared-types/scenario';

import { parseContentBlocks } from './content-blocks.ts';

/**
 * Đọc sơ đồ TikZ đã dựng sẵn (`diagrams/<tên>.svg`) cho loader bài học + lab.
 *
 * Hợp đồng: `plans/labs-rebuild/contracts.md` §C4. Nguồn `.tex` và công cụ dựng
 * ở `scripts/diagrams/`; CI chạy `pnpm diagrams:check` để chứng minh SVG khớp
 * nguồn và chỉ mang phần tử trong danh sách cho phép.
 *
 * ## Vì sao loader vẫn tự soi nội dung dù CI đã kiểm
 *
 * FE chèn chuỗi này INLINE vào trang (`dangerouslySetInnerHTML`), tức một SVG
 * mang `<script>` là XSS trên mọi trang bài học. Cổng CI chặn ở PR, nhưng chủ
 * repo vẫn đẩy thẳng được lên `main`. Ba phép soi rẻ dưới đây là lớp thứ hai:
 * không thay danh sách cho phép đầy đủ của CI, chỉ chặn đúng những thứ biến một
 * hình vẽ thành mã chạy được.
 */

const HEADER = /^<!-- dlp-diagram v1 src=[0-9a-f]{64} out=[0-9a-f]{64} -->\r?\n/;
const EXECUTABLE = /<script|<foreignObject|\son[a-z]+\s*=|javascript:|<iframe|<object|<embed/i;
const EXTERNAL_REF = /(?:xlink:)?href\s*=\s*["'](?!#)/i;
const SVG_OPEN = /^<svg\b[^>]*>/;

export class DiagramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiagramError';
  }
}

/** Mọi `src` sơ đồ mà các đoạn markdown này tham chiếu, không trùng, giữ thứ tự gặp. */
export function diagramRefs(markdowns: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const markdown of markdowns) {
    for (const block of parseContentBlocks(markdown)) {
      if (block.kind === 'diagram') {
        seen.add(block.src);
      }
    }
  }
  return [...seen];
}

function readDimension(openTag: string, name: 'width' | 'height', where: string): number {
  const match = new RegExp(`\\s${name}=["']([0-9]+(?:\\.[0-9]+)?)(?:px)?["']`).exec(openTag);
  const value = match === null ? Number.NaN : Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new DiagramError(
      `${where}: thẻ <svg> thiếu ${name} dương (px). File phải do scripts/diagrams/build.mjs sinh ra.`,
    );
  }
  return value;
}

/** Hàm THUẦN: kiểm + tách một file SVG đã dựng thành DTO. */
export function parseDiagramFile(text: string, where: string): DiagramSvg {
  if (!HEADER.test(text)) {
    throw new DiagramError(
      `${where}: thiếu dòng đầu "<!-- dlp-diagram v1 src=… out=… -->". ` +
        `SVG viết tay hoặc xuất từ công cụ khác không được nhận — dựng bằng pnpm diagrams:build.`,
    );
  }
  const svg = text.replace(HEADER, '').trim();
  const open = SVG_OPEN.exec(svg);
  if (open === null) {
    throw new DiagramError(`${where}: sau dòng đầu phải là thẻ <svg>.`);
  }
  if (EXECUTABLE.test(svg) || EXTERNAL_REF.test(svg)) {
    throw new DiagramError(
      `${where}: SVG mang phần tử/thuộc tính chạy được hoặc tham chiếu ra ngoài. ` +
        `Sơ đồ được chèn inline vào trang, nên đây là lỗi bảo mật chứ không phải lỗi hiển thị.`,
    );
  }
  return {
    svg,
    width: readDimension(open[0], 'width', where),
    height: readDimension(open[0], 'height', where),
  };
}

/**
 * Nạp mọi sơ đồ được tham chiếu, từ thư mục của bài.
 *
 * Tham chiếu tới file không tồn tại ⇒ NÉM (bài hỏng thì cả mẻ hỏng, cùng kỷ
 * luật mọi loader). Trả `undefined` khi bài không có sơ đồ nào — giữ đúng nghĩa
 * "vắng" của field `diagrams?` trong DTO thay vì một `{}` mà mọi bài đều mang.
 */
export async function loadDiagramMap(
  contentDir: string,
  refs: readonly string[],
): Promise<DiagramMap | undefined> {
  if (refs.length === 0) {
    return undefined;
  }
  const map: DiagramMap = {};
  for (const ref of refs) {
    // Mẫu chặt (chỉ `diagrams/<a-z0-9->.svg`) nên không có `..` nào lọt qua —
    // kiểm lại ở đây vì đây là chỗ đường dẫn chạm đĩa.
    if (!DIAGRAM_SRC_PATTERN.test(ref)) {
      throw new DiagramError(`tham chiếu sơ đồ "${ref}" không đúng dạng diagrams/<tên>.svg`);
    }
    const file = path.join(contentDir, ...ref.split('/'));
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (cause) {
      throw new DiagramError(
        `markdown tham chiếu ${ref} nhưng không đọc được ${file} (${(cause as Error).message}). ` +
          `Dựng nó bằng: pnpm diagrams:build ${path.join(contentDir, 'diagrams')}`,
      );
    }
    map[ref] = parseDiagramFile(text, ref);
  }
  return map;
}
