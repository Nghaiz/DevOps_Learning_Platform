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

  it('layout ide ⇒ profile ide', () => {
    // 6.E đo một pod có IDE đỉnh 660Mi (IDE + bài CÙNG LÚC), 783Mi qua ba lượt
    // tải lại. Không có nhánh này thì pod IDE nhận LimitRange mặc định
    // (256Mi requests) và kubelet đuổi nó khi node bị ép RAM — ngẫu nhiên, giữa
    // buổi học, không có gì trong log trỏ về đây.
    expect(profileForCapabilities([], 'ide')).toBe('ide');
    expect(profileForCapabilities(['docker'], 'ide')).toBe('ide');
  });

  it('ide + kubernetes ⇒ k8s, và đó là một chỗ CHƯA ĐO chứ không phải một lựa chọn', () => {
    // ⚠ Ô này ghim một GIỚI HẠN ĐÃ BIẾT, không ghim một hành vi mong muốn.
    //
    // `profiles.k8s` (1Gi) đo với cluster con + lab thật nhưng KHÔNG có IDE
    // trong pod. `profiles.ide` (768Mi) đo với IDE + bài nhưng KHÔNG có cluster
    // con. Cộng thẳng hai số là đúng phép tính đã sai 18% khi ước lượng trần
    // IDE (609 ước lượng vs 660 đo được), nên ta KHÔNG cộng.
    //
    // Chọn `k8s` vì nó lớn hơn — thiếu RAM thì bị đuổi, thừa thì chỉ tốn chỗ.
    // Điều kiện chấm dứt của ô này: có một bài vừa `ide` vừa `kubernetes` VÀ có
    // số đo cho tổ hợp đó. Ca `không nội dung nào vừa ide vừa kubernetes` bên
    // dưới là cái chuông báo lúc điều kiện ấy tới.
    expect(profileForCapabilities(['kubernetes'], 'ide')).toBe('k8s');
    expect(profileForCapabilities(['kubernetes', 'multi-node'], 'ide')).toBe('k8s-multinode');
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
    // Duyệt CẢ `interfaceLayout`, không chỉ capabilities: profile `ide` chỉ sinh
    // ra qua tham số thứ hai, nên một vòng lặp chỉ duyệt capabilities sẽ bỏ sót
    // đúng cái key vừa được thêm vào values.yaml — và cổng này im lặng.
    for (const layout of [null, 'ide'] as const) {
      for (let mask = 0; mask < 1 << caps.length; mask++) {
        const subset = caps.filter((_, i) => (mask & (1 << i)) !== 0);
        const profile = profileForCapabilities(subset, layout);
        if (profile !== '') names.add(profile);
      }
    }
    // Đối chứng: vòng lặp phải sinh ra ĐÚNG bộ tên ta biết, không chỉ "một số
    // tên nào đó" — thiếu vế này thì xoá nhánh `ide` khỏi hàm vẫn xanh.
    expect([...names].sort()).toEqual(['ide', 'k8s', 'k8s-multinode']);

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
