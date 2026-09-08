import { describe, expect, it } from 'vitest';
import { tokenizeDescribe, tokenizeDescribeLine, type DescribeToken } from './describe-highlight';

function rejoin(tokens: readonly DescribeToken[]): string {
  return tokens.map((t) => t.text).join('');
}

function kindOf(tokens: readonly DescribeToken[], text: string): string | undefined {
  return tokens.find((t) => t.text === text)?.kind;
}

describe('tokenizeDescribeLine', () => {
  /**
   * BẤT BIẾN TRUNG TÂM, và ở đây nó gắt hơn cả bên YAML: `describe` là nội dung
   * CĂN CỘT bằng khoảng trắng (`padEnd(24)` trong `describe.ts`). Nuốt hay thêm
   * một khoảng trắng là gãy cả cột từ dòng đó xuống.
   */
  it('nối lại ra đúng dòng ban đầu, từng ký tự', () => {
    const lines = [
      'Name:         web-abc',
      'Namespace:    default',
      'Containers:',
      '  main:',
      '    Image:        nginx:1.27-alpine',
      '    Ports:        <none>',
      '      Reason:     CrashLoopBackOff',
      'Events:',
      '  FailedScheduling         không node nào đủ CPU',
      '',
      '   ',
      'Không có dấu hai chấm nào ở đây',
    ];
    for (const line of lines) {
      expect(rejoin(tokenizeDescribeLine(line)), line).toBe(line);
    }
  });

  it('nhãn và giá trị tách đúng, giữ nguyên khoảng căn cột', () => {
    const tokens = tokenizeDescribeLine('Name:         web-abc');
    expect(kindOf(tokens, 'Name')).toBe('label');
    expect(kindOf(tokens, 'web-abc')).toBe('value');
    // Khoảng căn cột phải còn nguyên, và nó là một mẩu riêng.
    expect(tokens.some((t) => t.kind === 'punctuation' && t.text === '         ')).toBe(true);
  });

  it('nhãn đứng một mình là tiêu đề khối', () => {
    expect(kindOf(tokenizeDescribeLine('Events:'), 'Events')).toBe('heading');
    expect(kindOf(tokenizeDescribeLine('  main:'), 'main')).toBe('heading');
  });

  it('trạng thái hỏng đọc ra là lỗi', () => {
    expect(kindOf(tokenizeDescribeLine('    Reason:  CrashLoopBackOff'), 'CrashLoopBackOff')).toBe(
      'error',
    );
    expect(kindOf(tokenizeDescribeLine('Status:  Failed'), 'Failed')).toBe('error');
  });

  it('trạng thái đang chờ đọc ra là cảnh báo', () => {
    expect(kindOf(tokenizeDescribeLine('Status:  Pending'), 'Pending')).toBe('warning');
  });

  it('<none> là giá trị mờ, không phải giá trị thường', () => {
    expect(kindOf(tokenizeDescribeLine('Ports:  <none>'), '<none>')).toBe('muted');
  });

  /**
   * So theo TỪ, không phải `includes` trên cả chuỗi. Một câu tiếng Việt nhắc tới
   * trạng thái không được làm cả dòng đỏ lên — nếu không thì mọi dòng giải thích
   * đều đỏ và màu đỏ hết còn nghĩa.
   */
  it('không tô đỏ một câu chỉ vì nó chứa chữ giống tên trạng thái', () => {
    const tokens = tokenizeDescribeLine('Ghi chú:  ImagePullBackOffXYZ là tên khác');
    expect(tokens.every((t) => t.kind !== 'error')).toBe(true);
  });

  it('dòng sự kiện không có dấu hai chấm vẫn soi được từ khoá', () => {
    const tokens = tokenizeDescribeLine('  FailedScheduling         không node nào đủ CPU');
    expect(tokens.some((t) => t.kind === 'error')).toBe(true);
  });

  /**
   * Đúng cái bẫy `yaml-highlight.ts` đã gác, chỉ đổi chỗ: dòng sự kiện chứa tên
   * image, và tên image chứa dấu hai chấm. Đo ở level 09 — cả hai dòng `Failed`
   * hiện ra xanh như thể nửa câu tiếng Việt là một cái nhãn.
   */
  it('không đọc nửa câu thành nhãn chỉ vì trong câu có tên image', () => {
    const line = '  Failed          Không kéo được image "ghcr.io/dlp/api:khong-ton-tai"';
    const tokens = tokenizeDescribeLine(line);
    expect(rejoin(tokens)).toBe(line);
    expect(tokens.every((t) => t.kind !== 'label')).toBe(true);
    // `Failed` vẫn phải đỏ — đó là lý do người ta đọc dòng này.
    expect(tokens.some((t) => t.kind === 'error')).toBe(true);
  });

  it('nhãn hai từ vẫn là nhãn', () => {
    expect(kindOf(tokenizeDescribeLine('Restart Count: 3'), 'Restart Count')).toBe('label');
  });

  it('dòng rỗng không sinh mẩu nào', () => {
    expect(tokenizeDescribeLine('')).toEqual([]);
  });
});

describe('tokenizeDescribe', () => {
  it('giữ nguyên số dòng và nội dung', () => {
    const source = 'Name:  a\n\nEvents:\n  Normal   ok\n';
    const lines = tokenizeDescribe(source);
    expect(lines).toHaveLength(5);
    expect(lines.map(rejoin).join('\n')).toBe(source);
  });
});
