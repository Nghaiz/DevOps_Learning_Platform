import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filesystemScenarioSource } from './source.ts';

const CONTENT_DIR = fileURLToPath(new URL('../../../content/scenarios', import.meta.url));

describe('filesystemScenarioSource', () => {
  it('liệt kê bản rút gọn của mọi scenario trong content/, sắp theo id', async () => {
    const items = await filesystemScenarioSource(CONTENT_DIR).list();

    // Danh sách ghim CỨNG có chủ ý: nó là cổng "kho nội dung vừa đổi" — thêm hoặc
    // mất một bài phải là một sửa đổi CÓ Ý THỨC ở đây, không phải một con số tự
    // trôi. Hai bài `dlp-*` là first-party (source: null), xen giữa các bài
    // vendored vì thứ tự là theo id chứ không theo xuất xứ.
    expect(items.map((s) => s.id)).toEqual([
      'ckad-configmap-as-files',
      'dlp-docker-basics',
      'dlp-sandbox-basics',
      'loki-quickstart',
      'loxilb-tcp-load-balancing',
      'prolug-linux-system-checking',
    ]);
    // Bản rút gọn KHÔNG mang nội dung step — đó là toàn bộ lý do nó tồn tại.
    for (const item of items) {
      expect(item).not.toHaveProperty('steps');
      expect(item.stepCount).toBeGreaterThan(0);
    }
  });

  it('get trả scenario đầy đủ kèm step', async () => {
    const scenario = await filesystemScenarioSource(CONTENT_DIR).get('ckad-configmap-as-files');

    expect(scenario).not.toBeNull();
    expect(scenario?.steps.length).toBeGreaterThan(0);
    expect(scenario?.steps[0]?.markdown).toContain('#');
  });

  it('get trả null cho id không có, KHÔNG ném', async () => {
    // "Không tìm thấy" là câu trả lời hợp lệ; chỉ tRPC mới biết nó phải thành
    // NOT_FOUND. Ném ở tầng này buộc mọi caller phải bắt lỗi để phân loại.
    await expect(filesystemScenarioSource(CONTENT_DIR).get('khong-ton-tai')).resolves.toBeNull();
  });

  it('nạp một lần rồi dùng lại — hai lượt list trả cùng dữ liệu', async () => {
    const source = filesystemScenarioSource(CONTENT_DIR);
    const [a, b] = await Promise.all([source.list(), source.list()]);
    expect(a).toEqual(b);
  });

  it('thư mục sai thì NÉM chứ không trả danh sách rỗng', async () => {
    // Rỗng-trong-im-lặng là chế độ hỏng tệ nhất ở đây: trang /lessons hiện ra
    // trống rỗng và không có gì nói rằng SCENARIOS_DIR đang trỏ sai chỗ.
    const source = filesystemScenarioSource(path.join(CONTENT_DIR, 'khong-co-thu-muc-nay'));
    await expect(source.list()).rejects.toThrow();
  });

  it('lượt nạp hỏng KHÔNG bị đóng băng trong cache', async () => {
    // Giữ lại một promise reject nghĩa là một lỗi tạm thời (mount chưa sẵn
    // sàng) sẽ dính vĩnh viễn cho tới khi restart pod.
    const source = filesystemScenarioSource(path.join(CONTENT_DIR, 'khong-co'));
    await expect(source.list()).rejects.toThrow();
    await expect(source.list()).rejects.toThrow();
  });
});
