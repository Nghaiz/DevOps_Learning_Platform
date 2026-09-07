import { describe, expect, it } from 'vitest';
import {
  SANDBOX_TOOLS,
  isSandboxTool,
  parseToolsetColumn,
  sanitizeToolset,
} from './toolset.ts';

describe('SANDBOX_TOOLS — danh mục', () => {
  it('khớp đúng danh mục hợp đồng §C4', () => {
    // Khẳng định theo TÊN chứ không theo số lượng: một phép so độ dài sẽ xanh
    // khi ai đó đổi 'yq' thành 'jq' (`rules/pinned-baseline-test-companion.md`).
    expect([...SANDBOX_TOOLS]).toEqual([
      'btop',
      'tldr',
      'ripgrep',
      'fd',
      'duf',
      'ncdu',
      'delta',
      'yq',
    ]);
  });

  it('isSandboxTool phân biệt đúng trong/ngoài danh mục', () => {
    expect(isSandboxTool('btop')).toBe(true);
    expect(isSandboxTool('jq')).toBe(false);
    expect(isSandboxTool('')).toBe(false);
  });
});

describe('sanitizeToolset', () => {
  it('vắng mặt (undefined/null) ⇒ [] và KHÔNG cảnh báo', () => {
    expect(sanitizeToolset(undefined)).toEqual({ toolset: [], warnings: [] });
    expect(sanitizeToolset(null)).toEqual({ toolset: [], warnings: [] });
  });

  it('mảng rỗng ⇒ [] và không cảnh báo', () => {
    expect(sanitizeToolset([])).toEqual({ toolset: [], warnings: [] });
  });

  it('giữ nguyên thứ tự khai, KHÔNG sắp xếp lại', () => {
    expect(sanitizeToolset(['yq', 'btop', 'fd']).toolset).toEqual(['yq', 'btop', 'fd']);
  });

  it('KHÔNG khử trùng lặp — một hàm lặng lẽ đổi nội dung người soạn viết khó truy hơn một dòng thừa', () => {
    expect(sanitizeToolset(['btop', 'btop']).toolset).toEqual(['btop', 'btop']);
  });

  it('tên ngoài danh mục bị LOẠI kèm cảnh báo, phần còn lại vẫn qua', () => {
    const { toolset, warnings } = sanitizeToolset(['btop', 'jq', 'yq']);
    expect(toolset).toEqual(['btop', 'yq']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('jq');
    // Thông báo phải nói được cách viết ĐÚNG, không chỉ "sai".
    expect(warnings[0]).toContain('btop');
  });

  it('phần tử không phải chuỗi bị LOẠI kèm cảnh báo, không ném', () => {
    const { toolset, warnings } = sanitizeToolset([42, 'btop', null, { a: 1 }]);
    expect(toolset).toEqual(['btop']);
    expect(warnings).toHaveLength(3);
  });

  it('cảnh báo có CHỈ SỐ để truy được phần tử nào hỏng', () => {
    const { warnings } = sanitizeToolset(['btop', 'jq']);
    expect(warnings[0]).toContain('[1]');
  });
});

/**
 * Cột `content_items.toolset` — `text` chứa chuỗi JSON của một mảng (§C4).
 *
 * Vế sống-chết ở đây là KHÔNG NÉM: `dbContentSource` bọc mọi hàng trong
 * "bỏ qua kèm WARN", nên một exception thoát ra từ đây sẽ không dừng ở ô dữ
 * liệu xấu — nó làm rơi cả HÀNG, tức bài đó biến mất khỏi `/lessons`.
 */
describe('parseToolsetColumn', () => {
  it('mặc định của cột (\'[]\') ⇒ [] và không cảnh báo', () => {
    expect(parseToolsetColumn('[]')).toEqual({ toolset: [], warnings: [] });
  });

  it('null/undefined/chuỗi trắng ⇒ [] và không cảnh báo', () => {
    expect(parseToolsetColumn(null)).toEqual({ toolset: [], warnings: [] });
    expect(parseToolsetColumn(undefined)).toEqual({ toolset: [], warnings: [] });
    expect(parseToolsetColumn('   ')).toEqual({ toolset: [], warnings: [] });
  });

  it('JSON hợp lệ ⇒ lọc theo danh mục', () => {
    const { toolset, warnings } = parseToolsetColumn('["btop","jq","yq"]');
    expect(toolset).toEqual(['btop', 'yq']);
    expect(warnings).toHaveLength(1);
  });

  it('JSON HỎNG ⇒ [] kèm cảnh báo, KHÔNG ném', () => {
    const call = (): unknown => parseToolsetColumn('["btop",');
    expect(call).not.toThrow();
    const { toolset, warnings } = parseToolsetColumn('["btop",');
    expect(toolset).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it('JSON hợp lệ nhưng KHÔNG phải mảng ⇒ [] kèm cảnh báo, không ném', () => {
    for (const raw of ['{"a":1}', '"btop"', '7', 'null']) {
      const { toolset, warnings } = parseToolsetColumn(raw);
      expect(toolset).toEqual([]);
      expect(warnings).toHaveLength(1);
    }
  });
});
