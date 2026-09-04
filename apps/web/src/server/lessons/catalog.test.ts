import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  RUNTIME_SUPPORTED_CAPABILITIES,
  profileForCapabilities,
} from './catalog';

/**
 * `profileForCapabilities` là MẮT XÍCH khiến một dòng trong
 * `RUNTIME_SUPPORTED_CAPABILITIES` không phải một lời hứa suông: nó dịch "bài
 * này cần gì" thành "pod phải mang profile tài nguyên nào".
 *
 * Trước P7-bis hàm này không có test nào. Nó vừa nhận thêm một nhánh và một bẫy
 * thứ tự, nên chú thích trong `catalog.ts` một mình không còn đủ — một chú thích
 * không đỏ khi ai đó hoán vị hai dòng if.
 */
describe('profileForCapabilities', () => {
  it('multi-node ⇒ k8s-multinode, KỂ CẢ khi kèm kubernetes', () => {
    // ⛔ Đây là ca gác BẪY THỨ TỰ, không phải một ca lặp lại ca dưới.
    //
    // Mọi bài multi-node đều mang KÈM `kubernetes` (xem BACKEND_IMAGE_MAPPING:
    // `kubernetes-kubeadm-2nodes` → ['kubernetes', 'multi-node']). Nên nếu ai
    // đó xét `kubernetes` trước, hàm trả 'k8s' và bài hai node nhận một pod
    // 1Gi vừa đủ cho MỘT node. Node phụ đội trần rồi bị kubelet đuổi, và triệu
    // chứng — "thỉnh thoảng chỉ thấy một node" — không trỏ về hàm này ở đâu cả.
    expect(profileForCapabilities(['kubernetes', 'multi-node'])).toBe('k8s-multinode');
    // Và thứ tự trong mảng đầu vào cũng không được ảnh hưởng tới kết quả.
    expect(profileForCapabilities(['multi-node', 'kubernetes'])).toBe('k8s-multinode');
  });

  it('chỉ kubernetes ⇒ k8s', () => {
    expect(profileForCapabilities(['kubernetes'])).toBe('k8s');
  });

  it('không đòi k8s ⇒ profile mặc định (chuỗi rỗng)', () => {
    // Rỗng có nghĩa CỐ ĐỊNH là "profile mặc định của namespace" (LimitRange lo),
    // không phải "chưa biết" — orchestrator TỪ CHỐI một tên lạ nhưng CHẤP NHẬN
    // chuỗi rỗng, nên trả nhầm một tên ở đây sẽ hỏng, còn trả rỗng thì không.
    expect(profileForCapabilities([])).toBe('');
    expect(profileForCapabilities(['docker'])).toBe('');
  });
});

/**
 * Cổng CHÉO ARTIFACT: mọi tên profile mà TypeScript có thể trả về phải TỒN TẠI
 * trong Helm values.
 *
 * Vì sao cần: orchestrator từ chối (`InvalidArgument`) một tên profile lạ thay
 * vì lặng lẽ rơi về mặc định — kỷ luật fail-closed đúng đắn, nhưng nó đẩy chế
 * độ hỏng ra RUNTIME. Một lỗi gõ ở đây (`k8s-multi-node` chẳng hạn) qua được
 * typecheck, qua được mọi unit test, và chỉ lộ khi một người học thật bấm Bắt
 * đầu — lúc đó thông điệp lỗi nói về gRPC, không nói về values.yaml.
 *
 * Đọc values.yaml bằng quét văn bản chứ không parse YAML: repo không có thư
 * viện YAML nào, và thêm một dependency chỉ để chạy một test là cái giá sai.
 * Phép quét này đủ để bắt đúng chế độ hỏng cần bắt — tên có mặt hay không.
 */
describe('tên profile khớp giữa TypeScript và Helm values', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const valuesPath = join(here, '..', '..', '..', '..', '..', 'infra', 'helm', 'platform', 'values.yaml');
  const values = readFileSync(valuesPath, 'utf8');

  it('đối chứng: đọc được values.yaml và nó có khối sandbox.profiles', () => {
    // Thiếu đối chứng này thì một đường dẫn sai làm `values` rỗng, và MỌI phép
    // `toContain` bên dưới trượt — nhưng suite vẫn có thể được đọc thành "đã
    // kiểm". Một file rỗng phải hỏng ở ĐÂY, ồn ào, chứ không hỏng lặng lẽ ở đó.
    expect(values.length).toBeGreaterThan(1000);
    expect(values).toMatch(/^ {2}profiles:$/m);
  });

  it('mọi profile TypeScript trả về đều có key trong values.yaml', () => {
    // Duyệt MỌI tập con của các năng lực đã hỗ trợ, không chỉ vài ca gõ tay:
    // một năng lực thứ tư thêm vào sau này sẽ tự động được phủ.
    const caps = RUNTIME_SUPPORTED_CAPABILITIES;
    const names = new Set<string>();
    for (let mask = 0; mask < 1 << caps.length; mask++) {
      const subset = caps.filter((_, i) => (mask & (1 << i)) !== 0);
      const profile = profileForCapabilities(subset);
      if (profile !== '') names.add(profile);
    }

    // Đối chứng dương: phép duyệt phải thật sự sinh ra tên nào đó. Nếu
    // `profileForCapabilities` bị sửa thành luôn trả rỗng, `names` rỗng và vòng
    // lặp bên dưới không khẳng định gì — xanh vì không kiểm, đúng loại xanh giả.
    expect(names.size).toBeGreaterThan(0);

    for (const name of names) {
      expect(values, `values.yaml thiếu key profile "${name}"`).toMatch(
        new RegExp(`^ {4}${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:$`, 'm'),
      );
    }
  });
});
