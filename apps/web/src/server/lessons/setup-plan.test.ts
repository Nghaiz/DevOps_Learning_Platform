import { describe, expect, it } from 'vitest';
import { setupFailureDetail, setupScriptPlan, type SetupStepKind } from './setup-plan';

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
    const messages = plan.map((step) => step.failureMessage({ exitCode: 3, output: '' }));
    expect(new Set(messages).size).toBe(3);
    expect(messages[0]).toContain('bộ công cụ');
    expect(messages[1]).toContain('Đẩy file');
    expect(messages[2]).toContain('Script chuẩn bị môi trường');
  });

  it('mã thoát đi vào câu lỗi — người đọc log truy được', () => {
    const plan = setupScriptPlan({ tools: 'a', assets: null, background: null });
    expect(plan[0]?.failureMessage({ exitCode: 127, output: '' })).toContain('127');
  });
});

describe('setupScriptPlan — câu lỗi nói ra NGUYÊN NHÂN, không chỉ mã thoát (P15 / 15.B)', () => {
  it('stderr của bước setup đi vào câu người học đọc', () => {
    /*
      Đây là ô AC 15.B. Bản trước dựng câu CHỈ từ mã thoát, nên dòng duy nhất nói
      ra nguyên nhân — `Cum Kubernetes con khong san sang sau 90s`, ghi ra stderr
      bởi `content/labs/dlp-k8s-broken-deploy/setup/background.sh` — là mã chết:
      người học nhận "Script chuẩn bị môi trường thất bại (exit 1)" và không phân
      biệt được "cụm con chưa lên" (chờ thêm là được) với "script của bài hỏng"
      (chờ vô ích).

      ⚠ Một phép kiểm chỉ khẳng định "có ném lỗi" sẽ XANH NGUYÊN với bug đó. Vế
      phải khẳng định là NỘI DUNG câu.
    */
    const [step] = setupScriptPlan({ tools: null, assets: null, background: 'c' });
    const message = step!.failureMessage({
      exitCode: 1,
      output: 'mkdir: ok\nCum Kubernetes con khong san sang sau 90s — khong dung duoc lab nay\n',
    });

    expect(message).toContain('Cum Kubernetes con khong san sang sau 90s');
    expect(message).toContain('exit 1');
  });

  it('script hỏng mà không nói gì ⇒ vẫn có câu dự phòng, KHÔNG phải dấu hai chấm rỗng', () => {
    const [step] = setupScriptPlan({ tools: null, assets: null, background: 'c' });
    const message = step!.failureMessage({ exitCode: 1, output: '   \n\n' });

    expect(message).toContain('Hãy khởi động lại phiên.');
    expect(message).not.toMatch(/:\s*$/);
  });
});

describe('setupFailureDetail', () => {
  it('giữ ĐUÔI, không giữ đầu — nguyên nhân nằm ở dòng cuối', () => {
    /*
      Script thoát NGAY sau dòng nó tự giải thích. Giữ phần đầu là giữ lại những
      dòng tiến triển vô hại và bỏ đúng dòng cần đọc.
    */
    const detail = setupFailureDetail(
      ['buoc 1 xong', 'buoc 2 xong', 'buoc 3 xong', 'buoc 4 xong', 'LY DO THAT SU'].join('\n'),
    );
    expect(detail).toContain('LY DO THAT SU');
    expect(detail).not.toContain('buoc 1');
  });

  it('bỏ ANSI — màu của kubectl không được thành rác trong chuỗi UI', () => {
    const detail = setupFailureDetail('\x1b[31mError from server\x1b[0m: not found\n');
    expect(detail).toBe('Error from server: not found');
  });

  it('bỏ dòng rỗng và CR', () => {
    expect(setupFailureDetail('a\r\n\r\n\r\nb\r\n')).toBe('a · b');
  });

  it('rỗng / chỉ khoảng trắng ⇒ null, để caller dùng câu dự phòng', () => {
    expect(setupFailureDetail('')).toBeNull();
    expect(setupFailureDetail('  \n\t\n')).toBeNull();
  });

  it('chặn trần byte, và cắt ở biên UTF-8 an toàn', () => {
    /*
      Nội dung là tiếng Việt (dấu là ký tự đa-byte). Một lát cắt byte thô rơi
      giữa hai byte của MỘT ký tự sẽ thành U+FFFD — người học nhận một ký tự vô
      nghĩa ở cuối câu lỗi. `truncateUtf8` (dùng chung với `truncateLabOutput`)
      lùi điểm cắt về biên gần nhất.
    */
    const detail = setupFailureDetail('à'.repeat(500));
    expect(detail).not.toBeNull();
    expect(detail).not.toContain('�');
    expect(Buffer.byteLength(detail!, 'utf8')).toBeLessThan(500);
  });
});
