import { describe, expect, it } from 'vitest';
import { setupScriptPlan, type SetupStepKind } from './setup-plan';

/**
 * Thứ tự setup: **công cụ → asset → background**.
 *
 * Đây là phép kiểm mà cả C4 dựa vào. Nó có thật được vì thứ tự nằm dưới dạng
 * dữ liệu; hồi nó còn là ba khối `if` nối tiếp trong `runSetup` thì không có
 * cách nào khẳng định ngoài việc đọc mã bằng mắt — và đọc bằng mắt vẫn "xanh"
 * sau khi ai đó đảo hai khối.
 */

function kinds(plan: readonly { readonly kind: SetupStepKind }[]): readonly SetupStepKind[] {
  return plan.map((step) => step.kind);
}

describe('setupScriptPlan — thứ tự', () => {
  it('đủ ba thứ ⇒ công cụ TRƯỚC asset, asset TRƯỚC background', () => {
    /*
      Vì sao từng vế là đúng-sai chứ không phải sở thích:
      - công cụ trước background: script `background` của bài được phép gõ
        `yq`/`rg` vừa bật. Đảo lại là `command not found` ở một dòng người soạn
        đã kiểm là chạy được.
      - asset trước background: `loxilb` chạy `sudo /bin/bash ./start.sh` ngay
        dòng đầu background. Đảo lại là script chạy trước khi file tới pod.
    */
    const plan = setupScriptPlan({
      tools: 'dlp-tools enable yq',
      assets: 'base64 -d > f',
      background: 'echo dung',
    });
    expect(kinds(plan)).toEqual(['tools', 'assets', 'background']);
  });

  it('thiếu công cụ ⇒ hai bước còn lại GIỮ nguyên thứ tự tương đối', () => {
    const plan = setupScriptPlan({ tools: null, assets: 'a', background: 'b' });
    expect(kinds(plan)).toEqual(['assets', 'background']);
  });

  it('chỉ có công cụ ⇒ đúng một bước', () => {
    const plan = setupScriptPlan({ tools: 'a', assets: null, background: null });
    expect(kinds(plan)).toEqual(['tools']);
  });

  it('công cụ + background, không asset ⇒ công cụ vẫn đi trước', () => {
    const plan = setupScriptPlan({ tools: 'a', assets: null, background: 'b' });
    expect(kinds(plan)).toEqual(['tools', 'background']);
  });
});

describe('setupScriptPlan — không có gì để làm thì KHÔNG tốn lượt exec', () => {
  it('cả ba null ⇒ kế hoạch rỗng', () => {
    /*
      `runSetup` đọc `steps.length === 0` để return SỚM, trước cả
      `sessionExpiry` — thứ tự đó có giá: `sessionExpiry` là một vòng gRPC tới
      orchestrator. Một bài không khai `toolset`, không có asset, và ở một phase
      không có `background` là trường hợp THƯỜNG (mọi step giữa bài), nên đây là
      đường đi thường xuyên nhất, không phải một ca biên.
    */
    expect(setupScriptPlan({ tools: null, assets: null, background: null })).toEqual([]);
  });

  it('toolset rỗng (buildToolsEnableScript trả null) ⇒ không sinh bước nào', () => {
    // Nối trực tiếp với `tools-enable.test.ts`: mảng rỗng ⇒ `null` ⇒ ở đây là
    // "không có bước tools". Hai phép kiểm cùng gác một câu: bài không khai
    // công cụ thì KHÔNG tốn một lượt `kubectl exec` nào cho việc bật công cụ.
    const plan = setupScriptPlan({ tools: null, assets: null, background: 'echo x' });
    expect(kinds(plan)).toEqual(['background']);
  });
});

describe('setupScriptPlan — câu lỗi nói ĐÚNG bước nào hỏng', () => {
  it('ba bước ba câu khác nhau, không gộp thành một câu chung', () => {
    /*
      "Chuẩn bị môi trường thất bại" cho cả ba là một ngõ cụt: công cụ chưa bật,
      file chưa tới pod, và script của bài hỏng là ba nguyên nhân với ba việc
      phải làm khác nhau.
    */
    const plan = setupScriptPlan({ tools: 'a', assets: 'b', background: 'c' });
    const messages = plan.map((step) => step.failureMessage(3));
    expect(new Set(messages).size).toBe(3);
    expect(messages[0]).toContain('bộ công cụ');
    expect(messages[1]).toContain('Đẩy file');
    expect(messages[2]).toContain('Script chuẩn bị môi trường');
  });

  it('mã thoát đi vào câu lỗi — người đọc log truy được', () => {
    const plan = setupScriptPlan({ tools: 'a', assets: null, background: null });
    expect(plan[0]?.failureMessage(127)).toContain('127');
  });
});
