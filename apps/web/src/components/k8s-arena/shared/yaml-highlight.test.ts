import { describe, expect, it } from 'vitest';
import { tokenizeYaml, tokenizeYamlLine, type YamlToken } from './yaml-highlight';

/** Nối lại — bất biến trung tâm của cả file. */
function rejoin(tokens: readonly YamlToken[]): string {
  return tokens.map((t) => t.text).join('');
}

function kindOf(tokens: readonly YamlToken[], text: string): string | undefined {
  return tokens.find((t) => t.text === text)?.kind;
}

describe('tokenizeYamlLine', () => {
  /**
   * BẤT BIẾN TRUNG TÂM. Lớp tô màu nằm CHỒNG KHÍT dưới một `<textarea>`; lệch
   * một ký tự là lệch cả phần còn lại của dòng, và mọi thứ dưới nó.
   */
  it('nối lại ra đúng dòng ban đầu, từng ký tự', () => {
    const lines = [
      'apiVersion: v1',
      '  - name: main',
      '    image: nginx:1.27-alpine',
      'metadata:',
      '  labels:',
      '    app: web',
      '# một chú thích',
      'replicas: 3  # ghi chú cuối dòng',
      'enabled: true',
      'nothing: null',
      'empty: []',
      '---',
      '',
      '      ',
      'weird::value',
      'quoted: "a: b"',
    ];
    for (const line of lines) {
      expect(rejoin(tokenizeYamlLine(line)), line).toBe(line);
    }
  });

  it('khoá và giá trị tách đúng', () => {
    const tokens = tokenizeYamlLine('apiVersion: v1');
    expect(kindOf(tokens, 'apiVersion')).toBe('key');
    expect(kindOf(tokens, ':')).toBe('punctuation');
    expect(kindOf(tokens, 'v1')).toBe('string');
  });

  /**
   * Tag image là chỗ bộ tô màu ngây thơ hỏng đầu tiên: cắt ở dấu hai chấm ĐẦU
   * TIÊN sẽ đọc `nginx` thành một khoá thứ hai. Luật YAML là dấu hai chấm phải
   * theo sau bởi khoảng trắng, và game này đầy tag image.
   */
  it('không cắt nhầm ở dấu hai chấm trong tag image', () => {
    const tokens = tokenizeYamlLine('    image: nginx:1.27-alpine');
    expect(kindOf(tokens, 'image')).toBe('key');
    expect(kindOf(tokens, 'nginx:1.27-alpine')).toBe('string');
    expect(tokens.filter((t) => t.kind === 'key')).toHaveLength(1);
  });

  it('nhận số, boolean và null', () => {
    expect(kindOf(tokenizeYamlLine('replicas: 3'), '3')).toBe('number');
    expect(kindOf(tokenizeYamlLine('replicas: -2'), '-2')).toBe('number');
    expect(kindOf(tokenizeYamlLine('ratio: 1.5'), '1.5')).toBe('number');
    expect(kindOf(tokenizeYamlLine('ready: true'), 'true')).toBe('boolean');
    expect(kindOf(tokenizeYamlLine('ready: false'), 'false')).toBe('boolean');
    expect(kindOf(tokenizeYamlLine('value: null'), 'null')).toBe('null');
  });

  /** `yes`/`no` đã bị YAML 1.2 bỏ khỏi tập boolean lõi — tô nó là dạy sai. */
  it('không coi yes/no là boolean', () => {
    expect(kindOf(tokenizeYamlLine('ready: yes'), 'yes')).toBe('string');
  });

  it('dấu gạch của danh sách là dấu câu, không phải giá trị', () => {
    const tokens = tokenizeYamlLine('  - name: main');
    expect(kindOf(tokens, '- ')).toBe('punctuation');
    expect(kindOf(tokens, 'name')).toBe('key');
  });

  it('chú thích cuối dòng tách khỏi giá trị', () => {
    const tokens = tokenizeYamlLine('replicas: 3  # ghi chú');
    expect(kindOf(tokens, '3')).toBe('number');
    expect(tokens.some((t) => t.kind === 'comment' && t.text.includes('ghi chú'))).toBe(true);
  });

  /** Dấu `#` trong một chuỗi có nháy KHÔNG mở chú thích. */
  it('không coi dấu thăng trong chuỗi là chú thích', () => {
    const tokens = tokenizeYamlLine('color: "#fff"');
    expect(tokens.some((t) => t.kind === 'comment')).toBe(false);
  });

  /** Dấu hai chấm trong chuỗi có nháy cũng không cắt khoá. */
  it('không cắt khoá bên trong chuỗi có nháy', () => {
    const tokens = tokenizeYamlLine('note: "a: b"');
    expect(tokens.filter((t) => t.kind === 'key')).toHaveLength(1);
    expect(kindOf(tokens, '"a: b"')).toBe('string');
  });

  it('dòng rỗng không sinh mẩu nào', () => {
    expect(tokenizeYamlLine('')).toEqual([]);
  });

  it('khoá không có giá trị vẫn là khoá', () => {
    const tokens = tokenizeYamlLine('metadata:');
    expect(kindOf(tokens, 'metadata')).toBe('key');
  });
});

describe('tokenizeYaml', () => {
  it('giữ nguyên số dòng, kể cả dòng trống', () => {
    const source = 'a: 1\n\nb: 2\n';
    const lines = tokenizeYaml(source);
    expect(lines).toHaveLength(4);
    expect(lines.map(rejoin).join('\n')).toBe(source);
  });
});
