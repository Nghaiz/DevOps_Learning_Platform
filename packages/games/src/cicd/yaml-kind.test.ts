/**
 * Ghim bảng tra `StageKind`.
 *
 * Ba thứ được đo ở đây, và chỉ thứ đầu là hiển nhiên:
 *
 *   1. Mỗi luật trong bảng BẮN ĐƯỢC. Một luật không bao giờ khớp là mã chết
 *      trông y như mã sống — nó vẫn biên dịch, vẫn nằm trong mảng, và không ô
 *      nào đỏ khi một luật đứng trước nuốt hết đầu vào của nó.
 *   2. Bảng PHỦ ĐỦ 16 giá trị của `STAGE_KINDS`, và phép kiểm đọc chính mảng
 *      runtime trong hợp đồng chứ không chép tay một danh sách thứ hai. Thêm
 *      một loại vào hợp đồng mà quên bảng này ⇒ đỏ ngay tại đây.
 *   3. Nhánh mặc định NÓI RA được (`rule === null`), không giả vờ là một phép
 *      tra trúng.
 */
import { describe, expect, it } from 'vitest';

import { STAGE_KINDS } from './contract.ts';
import { KIND_FALLBACK, KIND_RULES, suyRaKind } from './yaml-kind.ts';
import type { KindSignals } from './yaml-kind.ts';

function tinHieu(phan: Partial<KindSignals>): KindSignals {
  return { jobId: 'x', jobName: 'x', uses: [], run: [], ...phan };
}

/**
 * Một đầu vào cho MỖI luật, chọn sao cho không luật nào ĐỨNG TRƯỚC nó cũng
 * khớp — nếu chọn ẩu, phép đo chỉ chứng minh luật đứng trước còn sống.
 */
const MAU: readonly (readonly [string, KindSignals])[] = [
  ['clone', tinHieu({ jobId: 'clone' })],
  ['cache', tinHieu({ jobId: 'restore-cache' })],
  ['sast', tinHieu({ jobId: 'secret-scan' })],
  ['image-scan', tinHieu({ jobId: 'quet-anh', uses: ['aquasecurity/trivy-action@v0.36.0'] })],
  ['rollback', tinHieu({ jobId: 'rollback' })],
  ['promote', tinHieu({ jobId: 'promote' })],
  ['smoke', tinHieu({ jobId: 'smoke' })],
  ['deploy', tinHieu({ jobId: 'deploy' })],
  ['approval', tinHieu({ jobId: 'approval' })],
  ['publish', tinHieu({ jobId: 'publish' })],
  ['package', tinHieu({ jobId: 'package' })],
  ['integration-test', tinHieu({ jobId: 'integration-test' })],
  ['unit-test', tinHieu({ jobId: 'unit-test' })],
  ['lint', tinHieu({ jobId: 'lint' })],
  ['gate', tinHieu({ jobId: 'ci-ok' })],
  ['build', tinHieu({ jobId: 'build' })],
];

describe('bảng tra StageKind', () => {
  it('mỗi luật đều bắn được ít nhất một lần', () => {
    for (const [id, signals] of MAU) {
      const guess = suyRaKind(signals);
      expect({ id, rule: guess.rule }).toEqual({ id, rule: id });
    }
  });

  it('tập mẫu phủ đúng mọi luật khai trong bảng, không thiếu không thừa', () => {
    expect(MAU.map(([id]) => id).sort()).toEqual(KIND_RULES.map((r) => r.id).sort());
  });

  it('bảng cộng nhánh mặc định phủ đủ 16 giá trị của STAGE_KINDS', () => {
    const phu = new Set<string>([...KIND_RULES.map((r) => r.kind), KIND_FALLBACK.kind]);
    expect([...phu].sort()).toEqual([...STAGE_KINDS].sort());
  });

  it('mỗi luật trả về một loại nằm trong union đóng', () => {
    for (const rule of KIND_RULES) {
      expect(STAGE_KINDS).toContain(rule.kind);
    }
  });

  it('không regex nào mang cờ `g` — cờ đó giữ lastIndex giữa hai lần gọi', () => {
    // Một `RegExp` có cờ `g` nhớ `lastIndex` sau mỗi `.test()`, nên cùng một
    // chuỗi sẽ khớp rồi TRƯỢT ở lần gọi kế. Hỏng của nó phụ thuộc thứ tự job,
    // tức phụ thuộc thứ tự người chơi gõ — đúng loại lỗi tất định mà hợp đồng
    // §"TẤT ĐỊNH TUYỆT ĐỐI" cấm.
    for (const rule of KIND_RULES) {
      expect({ id: rule.id, global: rule.text?.global ?? false }).toEqual({ id: rule.id, global: false });
    }
  });

  it('gọi hai lần liên tiếp cho cùng kết quả', () => {
    const s = tinHieu({ jobId: 'lint' });
    expect(suyRaKind(s)).toEqual(suyRaKind(s));
  });
});

describe('thứ tự ưu tiên', () => {
  it('`uses` thắng chữ — hành động dựng sẵn nói rõ hơn tên job', () => {
    // Tên job nói "deploy"; hành động nói "khôi phục cache". Lượt 1 (uses) chạy
    // trước toàn bộ lượt 2 (chữ), nên cache thắng dù luật deploy đứng sau nó.
    const guess = suyRaKind(tinHieu({ jobId: 'deploy-prod', uses: ['actions/cache@v4'] }));
    expect(guess).toMatchObject({ kind: 'restore-cache', rule: 'cache' });
  });

  it('luật hẹp thắng luật rộng — `build & push` là publish, không phải build', () => {
    const guess = suyRaKind(tinHieu({ jobId: 'images', jobName: 'Build & push: web' }));
    expect(guess).toMatchObject({ kind: 'publish', rule: 'publish' });
  });

  it('thứ tự LUẬT thắng vị trí tín hiệu — không phải id thắng name thắng run', () => {
    // Đây là một hệ quả dễ đọc nhầm của cấu trúc hai vòng lặp, nên nó được đo
    // chứ không để suy: vòng NGOÀI duyệt luật, vòng TRONG duyệt tín hiệu. Job
    // dưới đây tên `smoke` (luật thứ 7) nhưng có một dòng `run` nhắc
    // `rollback` (luật thứ 5) — và luật 5 thắng, dù tín hiệu của nó đến sau.
    //
    // Đổi hai vòng cho nhau sẽ cho `smoke`, và không phép đo nào khác trong
    // file này phân biệt được hai cách cài đặt.
    const guess = suyRaKind(tinHieu({ jobId: 'smoke', jobName: 'smoke', run: ['rollback.sh'] }));
    expect(guess).toMatchObject({ kind: 'rollback', rule: 'rollback' });
  });

  it('dòng `run` cũng là tín hiệu khi id và tên không nói gì', () => {
    const guess = suyRaKind(tinHieu({ jobId: 'b1', jobName: 'b1', run: ['git clone --depth 1 .'] }));
    expect(guess).toMatchObject({ kind: 'clone', rule: 'clone' });
  });

  it('job nào cũng có bước lấy mã nguồn KHÔNG kéo cả workflow về `clone`', () => {
    // Đây là quyết định thu hẹp ghi trong luật `clone`: nếu nó nhận diện theo
    // `uses`, mọi job của một workflow thật đều thành `clone` và bảng tra sập
    // về một giá trị. Xoá dòng test này là mất phép đo chứng minh điều đó.
    const guess = suyRaKind(
      tinHieu({ jobId: 'ts', jobName: 'TypeScript (lint + build + test)', uses: ['actions/checkout@v5'] }),
    );
    expect(guess.kind).toBe('lint');
  });
});

describe('nhánh mặc định', () => {
  it('không tín hiệu nào khớp ⇒ fallback, và nó tự nhận là fallback', () => {
    const guess = suyRaKind(tinHieu({ jobId: 'proto', jobName: 'Contract (buf)' }));
    expect(guess.rule).toBeNull();
    expect(guess.kind).toBe(KIND_FALLBACK.kind);
    expect(guess.why).not.toBe('');
  });

  it('mọi luật đều mang một câu giải thích không rỗng', () => {
    for (const rule of KIND_RULES) {
      expect({ id: rule.id, rong: rule.why.trim() === '' }).toEqual({ id: rule.id, rong: false });
    }
  });
});
