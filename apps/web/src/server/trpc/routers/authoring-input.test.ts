import { describe, expect, it } from 'vitest';
import { appRouter } from './app-router';

/**
 * Biên GHI của trang soạn phải chuẩn hoá xuống dòng về `\n`.
 *
 * ⛔ Đây KHÔNG phải chuyện thẩm mỹ, và nó là nửa mà bản vá trong
 * `parseContentBlocks` **không** che: `verifyScript` / `setup.*` không đi qua
 * parser nào — chúng đi thẳng tới `GATEWAY_EXEC_SHELL` (mặc định `bash`). Một
 * script CRLF chạy bằng bash báo `$'\r': command not found` ở MỖI dòng.
 *
 * Test đọc CHÍNH schema đã đăng ký trên router, không đọc mã nguồn: thêm một
 * field text mới mà quên chuẩn hoá sẽ bị bắt ở đây.
 */

/** Schema input tầng ngoài của một procedure, lấy từ router đã dựng. */
function inputSchemaOf(name: string): { parse(value: unknown): unknown } {
  const procedures = (appRouter._def as { procedures: Record<string, unknown> }).procedures;
  const procedure = procedures[`authoring.${name}`];
  const inputs = (procedure as { _def?: { inputs?: unknown[] } } | undefined)?._def?.inputs ?? [];
  const schema = inputs[0];
  if (schema === undefined) {
    throw new Error(`authoring.${name} không có input schema`);
  }
  return schema as { parse(value: unknown): unknown };
}

const CRLF_MD = '# tiêu đề\r\n\r\n```bash\r\nls\r\n```{{exec}}\r\n';
const CRLF_SCRIPT = 'set -euo pipefail\r\ntest -f /tmp/x\r\n';

function createInput(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'bai-thu',
    kind: 'lesson',
    title: 'Bài thử',
    tier: 'sysbox',
    backendImageId: 'ubuntu',
    ...over,
  };
}

describe('authoring.create — chuẩn hoá xuống dòng lúc lưu', () => {
  it('markdown của bước về LF', () => {
    const parsed = inputSchemaOf('create').parse(
      createInput({ steps: [{ markdown: CRLF_MD }] }),
    ) as { steps: { markdown: string }[] };

    expect(parsed.steps[0]?.markdown).not.toContain('\r');
    expect(parsed.steps[0]?.markdown).toContain('```{{exec}}');
  });

  it('verifyScript về LF — đây là chuỗi chạy bằng BASH', () => {
    const parsed = inputSchemaOf('create').parse(
      createInput({ steps: [{ markdown: '#', verifyScript: CRLF_SCRIPT }] }),
    ) as { steps: { verifyScript: string | null }[] };

    expect(parsed.steps[0]?.verifyScript).not.toContain('\r');
    expect(parsed.steps[0]?.verifyScript).toBe('set -euo pipefail\ntest -f /tmp/x\n');
  });

  it('setup foreground/background của bước về LF', () => {
    const parsed = inputSchemaOf('create').parse(
      createInput({
        steps: [{ markdown: '#', setupForeground: CRLF_SCRIPT, setupBackground: CRLF_SCRIPT }],
      }),
    ) as { steps: { setupForeground: string | null; setupBackground: string | null }[] };

    expect(parsed.steps[0]?.setupForeground).not.toContain('\r');
    expect(parsed.steps[0]?.setupBackground).not.toContain('\r');
  });

  it('intro/finish — cả markdown lẫn script trong phase', () => {
    const parsed = inputSchemaOf('create').parse(
      createInput({
        intro: {
          markdown: CRLF_MD,
          setup: { foreground: CRLF_SCRIPT, background: CRLF_SCRIPT },
          verifyScript: CRLF_SCRIPT,
        },
      }),
    ) as {
      intro: {
        markdown: string;
        setup: { foreground: string | null; background: string | null };
        verifyScript: string | null;
      };
    };

    expect(parsed.intro.markdown).not.toContain('\r');
    expect(parsed.intro.setup.foreground).not.toContain('\r');
    expect(parsed.intro.setup.background).not.toContain('\r');
    expect(parsed.intro.verifyScript).not.toContain('\r');
  });

  it('setup cấp lab về LF', () => {
    const parsed = inputSchemaOf('create').parse(
      createInput({ kind: 'lab', setup: { foreground: CRLF_SCRIPT, background: null } }),
    ) as { setup: { foreground: string | null } };

    expect(parsed.setup.foreground).not.toContain('\r');
  });

  it('`\\r` đơn cũng được chuẩn hoá', () => {
    const parsed = inputSchemaOf('create').parse(
      createInput({ steps: [{ markdown: 'a\rb' }] }),
    ) as { steps: { markdown: string }[] };

    expect(parsed.steps[0]?.markdown).toBe('a\nb');
  });

  it('ĐỐI CHỨNG: chuỗi vốn đã LF đi qua KHÔNG đổi', () => {
    // Không có vế này thì một `transform` trả về hằng '' cũng làm mọi
    // `not.toContain('\r')` ở trên xanh.
    const lf = '# tiêu đề\n\n```bash\nls\n```{{exec}}\n';
    const parsed = inputSchemaOf('create').parse(
      createInput({ steps: [{ markdown: lf }] }),
    ) as { steps: { markdown: string }[] };

    expect(parsed.steps[0]?.markdown).toBe(lf);
  });
});

describe('authoring.update — cùng biên, cùng luật', () => {
  it('update cũng chuẩn hoá (không chỉ create)', () => {
    // `update` dùng chung `contentDraftInput`, nhưng "dùng chung" là một chi
    // tiết hiện thực có thể đổi. Khẳng định nó ở mức hành vi.
    const parsed = inputSchemaOf('update').parse({
      id: 'bai-thu',
      title: 'Bài thử',
      tier: 'sysbox',
      backendImageId: 'ubuntu',
      steps: [{ markdown: '#', verifyScript: CRLF_SCRIPT }],
    }) as { steps: { verifyScript: string | null }[] };

    expect(parsed.steps[0]?.verifyScript).not.toContain('\r');
  });
});
