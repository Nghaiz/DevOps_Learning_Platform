import { describe, expect, it } from 'vitest';
import { parseYaml } from './yaml.ts';
import type { YamlPositionIndex, YamlValue } from './yaml.ts';

function parseOk(source: string): {
  readonly documents: readonly YamlValue[];
  readonly positions: YamlPositionIndex;
} {
  const result = parseYaml(source);
  if (!result.ok) {
    throw new Error(`Đáng lẽ phải quét được, nhưng bị từ chối: ${result.error}`);
  }
  return result;
}

function parseFail(source: string): { readonly error: string; line: number; column: number } {
  const result = parseYaml(source);
  if (result.ok) {
    throw new Error('Đáng lẽ phải bị từ chối, nhưng lại quét được.');
  }
  return result;
}

/** Tài liệu đầu tiên, đã khẳng định là map — để mỗi ô test khỏi lặp phép thu hẹp kiểu. */
function firstMap(source: string): {
  readonly doc: Record<string, YamlValue>;
  readonly positions: YamlPositionIndex;
} {
  const { documents, positions } = parseOk(source);
  const doc = documents[0];
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('Tài liệu đầu tiên không phải một map.');
  }
  return { doc, positions };
}

function asMap(value: YamlValue | undefined): Record<string, YamlValue> {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Giá trị không phải một map.');
  }
  return value;
}

function asList(value: YamlValue | undefined): YamlValue[] {
  if (!Array.isArray(value)) {
    throw new Error('Giá trị không phải một dãy.');
  }
  return value;
}

describe('core/yaml — quét', () => {
  it('map phẳng ra đúng khoá và kiểu vô hướng', () => {
    const { doc } = firstMap(
      ['name: web', 'replicas: 3', 'ratio: 1.5', 'enabled: true', 'off: false', 'extra: null'].join(
        '\n',
      ),
    );
    expect(doc).toEqual({
      name: 'web',
      replicas: 3,
      ratio: 1.5,
      enabled: true,
      off: false,
      extra: null,
    });
  });

  it('`~` cũng là null', () => {
    expect(firstMap('a: ~').doc).toEqual({ a: null });
  });

  it('map lồng theo thụt lề', () => {
    const { doc } = firstMap(['metadata:', '  name: web', '  labels:', '    app: web'].join('\n'));
    expect(doc).toEqual({ metadata: { name: 'web', labels: { app: 'web' } } });
  });

  it('khoá không có giá trị và không có khối con là null', () => {
    expect(firstMap(['a:', 'b: 1'].join('\n')).doc).toEqual({ a: null, b: 1 });
  });

  it('dãy vô hướng', () => {
    const { doc } = firstMap(['ports:', '  - 80', '  - 443'].join('\n'));
    expect(doc).toEqual({ ports: [80, 443] });
  });

  it('dãy các map mở ngay trên dòng gạch đầu dòng', () => {
    const { doc } = firstMap(
      ['containers:', '  - name: c1', '    image: nginx', '  - name: c2', '    image: redis'].join(
        '\n',
      ),
    );
    expect(doc).toEqual({
      containers: [
        { name: 'c1', image: 'nginx' },
        { name: 'c2', image: 'redis' },
      ],
    });
  });

  it('gạch đầu dòng trần mở khối con ở các dòng dưới', () => {
    const { doc } = firstMap(['items:', '  -', '    name: c1', '  -', '    name: c2'].join('\n'));
    expect(doc).toEqual({ items: [{ name: 'c1' }, { name: 'c2' }] });
  });

  it('`{}` và `[]` rỗng ở dạng dòng được nhận', () => {
    expect(firstMap(['podSelector: {}', 'ingress: []'].join('\n')).doc).toEqual({
      podSelector: {},
      ingress: [],
    });
  });
});

describe('core/yaml — nháy và chú thích', () => {
  it('nháy đơn và nháy kép đều bị bóc', () => {
    expect(firstMap(['a: "x y"', "b: 'z'"].join('\n')).doc).toEqual({ a: 'x y', b: 'z' });
  });

  it('nháy giữ nguyên thứ trông như số hoặc như boolean', () => {
    expect(firstMap(['a: "3"', 'b: "true"'].join('\n')).doc).toEqual({ a: '3', b: 'true' });
  });

  it('dấu hai chấm trong nháy không tách khoá', () => {
    expect(firstMap('image: "registry:5000/app"').doc).toEqual({ image: 'registry:5000/app' });
  });

  it('`#` sau dấu cách mở chú thích', () => {
    expect(firstMap('image: nginx # phiên bản mặc định').doc).toEqual({ image: 'nginx' });
  });

  it('`#` dính liền không phải chú thích', () => {
    expect(firstMap('image: nginx#1').doc).toEqual({ image: 'nginx#1' });
  });

  it('`#` trong nháy không phải chú thích', () => {
    expect(firstMap('image: "nginx#1"').doc).toEqual({ image: 'nginx#1' });
  });

  it('dòng chỉ có chú thích và dòng trống bị bỏ qua', () => {
    expect(firstMap(['# đầu file', '', 'a: 1', '', '# cuối'].join('\n')).doc).toEqual({ a: 1 });
  });
});

describe('core/yaml — số chỉ nhận dạng thập phân thuần', () => {
  it('số nguyên và số thập phân thành number', () => {
    expect(firstMap(['a: 3', 'b: -2', 'c: 1.5'].join('\n')).doc).toEqual({ a: 3, b: -2, c: 1.5 });
  });

  it('tag image `1.27-alpine` VẪN là chuỗi', () => {
    // Bẫy đã ghi ở đầu bộ quét: `Number.parseFloat` sẽ trả 1.27 và nuốt mất
    // `-alpine`, biến một tag hợp lệ thành một con số — hỏng im lặng.
    expect(firstMap('image: nginx:1.27-alpine').doc).toEqual({ image: 'nginx:1.27-alpine' });
    expect(firstMap('tag: 1.27-alpine').doc).toEqual({ tag: '1.27-alpine' });
  });

  it('số có đuôi chữ vẫn là chuỗi', () => {
    expect(firstMap(['a: 500m', 'b: 128Mi', 'c: 1.2.3'].join('\n')).doc).toEqual({
      a: '500m',
      b: '128Mi',
      c: '1.2.3',
    });
  });
});

describe('core/yaml — nhiều tài liệu', () => {
  it('`---` tách tài liệu, thứ tự giữ nguyên', () => {
    const { documents } = parseOk(['a: 1', '---', 'b: 2'].join('\n'));
    expect(documents).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('tài liệu rỗng KHÔNG bị lọc — nó là `null` ở đúng chỗ của nó', () => {
    // Bộ quét trung lập không quyết thay tầng trên: "có hai tài liệu, cái đầu
    // rỗng" là thông tin mà một số tầng cần báo lại.
    expect(parseOk(['---', 'a: 1'].join('\n')).documents).toEqual([null, { a: 1 }]);
    expect(parseOk(['a: 1', '---'].join('\n')).documents).toEqual([{ a: 1 }, null]);
  });

  it('nguồn rỗng cho đúng một tài liệu rỗng', () => {
    expect(parseOk('').documents).toEqual([null]);
  });

  it('số dòng tiếp tục đếm qua dấu `---`', () => {
    const { documents, positions } = parseOk(['a: 1', '---', 'b: 2'].join('\n'));
    expect(positions.key(documents[1], 'b')).toEqual({ line: 3, column: 1 });
  });
});

describe('core/yaml — CRLF', () => {
  it('xuống dòng kiểu Windows không lọt vào giá trị', () => {
    const { doc } = firstMap('name: web\r\nkind: Pod');
    expect(doc).toEqual({ name: 'web', kind: 'Pod' });
  });

  it('CRLF không xê dịch dòng hay cột', () => {
    const { doc, positions } = firstMap('name: web\r\nkind: Pod');
    expect(positions.key(doc, 'kind')).toEqual({ line: 2, column: 1 });
    expect(positions.value(doc, 'kind')).toEqual({ line: 2, column: 7 });
  });
});

describe('core/yaml — lỗi mang cả dòng VÀ cột', () => {
  it('tab trỏ đúng vào ký tự tab đầu tiên', () => {
    const failure = parseFail(['a:', '  \tb: 1'].join('\n'));
    expect(failure.error).toContain('tab');
    expect(failure.line).toBe(2);
    expect(failure.column).toBe(3);
  });

  it('anchor/alias bị từ chối tại vị trí giá trị', () => {
    const failure = parseFail('a: &neo');
    expect(failure.error).toContain('anchor/alias');
    expect(failure).toMatchObject({ line: 1, column: 4 });
  });

  it('alias `*` cũng bị từ chối', () => {
    expect(parseFail('a: *neo').error).toContain('anchor/alias');
  });

  it('chuỗi nhiều dòng bị từ chối tại dấu `|`', () => {
    const failure = parseFail(['data:', '  script: |', '    echo hi'].join('\n'));
    expect(failure.error).toContain('nhiều dòng');
    expect(failure).toMatchObject({ line: 2, column: 11 });
  });

  it('`>` cũng bị từ chối', () => {
    expect(parseFail('a: > gấp dòng').error).toContain('nhiều dòng');
  });

  it('flow list CÓ nội dung bị từ chối tại dấu `[`', () => {
    const failure = parseFail('ports: [80, 443]');
    expect(failure.error).toContain('gạch đầu dòng');
    expect(failure).toMatchObject({ line: 1, column: 8 });
  });

  it('flow map CÓ nội dung bị từ chối', () => {
    expect(parseFail('labels: {app: web}').error).toContain('gạch đầu dòng');
  });

  it('dòng không phải cặp khoá:giá trị trỏ vào đầu nội dung', () => {
    const failure = parseFail(['a: 1', '  ', 'khong-co-hai-cham'].join('\n'));
    expect(failure.error).toContain('dấu hai chấm');
    expect(failure).toMatchObject({ line: 3, column: 1 });
  });

  it('thụt lề sâu hơn mức của map đang mở', () => {
    const failure = parseFail(['a: 1', '  b: 2'].join('\n'));
    expect(failure.error).toContain('thụt lề sâu hơn');
    expect(failure).toMatchObject({ line: 2, column: 3 });
  });

  it('dòng không phải gạch đầu dòng trong một dãy đang mở', () => {
    const failure = parseFail(['items:', '  - a', '    b: 1'].join('\n'));
    expect(failure.error).toContain('dãy đang mở');
    expect(failure).toMatchObject({ line: 3, column: 5 });
  });
});

describe('core/yaml — bản đồ vị trí', () => {
  const SOURCE = [
    'apiVersion: v1', // 1
    'kind: Pod', // 2
    'metadata:', // 3
    '  name: web', // 4
    '  labels:', // 5
    '    app: web', // 6
    'spec:', // 7
    '  containers:', // 8
    '    - name: c1', // 9
    '      image: nginx', // 10
    '    - name: c2', // 11
  ].join('\n');

  it('khoá và giá trị cùng dòng ở cấp cao nhất', () => {
    const { doc, positions } = firstMap(SOURCE);
    expect(positions.key(doc, 'apiVersion')).toEqual({ line: 1, column: 1 });
    expect(positions.value(doc, 'apiVersion')).toEqual({ line: 1, column: 13 });
    expect(positions.key(doc, 'kind')).toEqual({ line: 2, column: 1 });
    expect(positions.value(doc, 'kind')).toEqual({ line: 2, column: 7 });
  });

  it('khoá mở khối con có `value` là null, còn khối con tự có vị trí riêng', () => {
    const { doc, positions } = firstMap(SOURCE);
    expect(positions.key(doc, 'metadata')).toEqual({ line: 3, column: 1 });
    expect(positions.value(doc, 'metadata')).toBeNull();

    const metadata = asMap(doc['metadata']);
    expect(positions.node(metadata)?.self).toEqual({ line: 4, column: 3 });
    expect(positions.key(metadata, 'name')).toEqual({ line: 4, column: 3 });
    expect(positions.value(metadata, 'name')).toEqual({ line: 4, column: 9 });
  });

  it('khối con lồng hai tầng vẫn trỏ đúng cột thụt lề của nó', () => {
    const { doc, positions } = firstMap(SOURCE);
    const labels = asMap(asMap(doc['metadata'])['labels']);
    expect(positions.key(labels, 'app')).toEqual({ line: 6, column: 5 });
    expect(positions.value(labels, 'app')).toEqual({ line: 6, column: 10 });
  });

  it('dãy: `self` là gạch đầu dòng đầu tiên, mỗi phần tử tra bằng chỉ số', () => {
    const { doc, positions } = firstMap(SOURCE);
    const containers = asList(asMap(doc['spec'])['containers']);
    expect(positions.node(containers)?.self).toEqual({ line: 9, column: 5 });
    expect(positions.key(containers, 0)).toEqual({ line: 9, column: 5 });
    expect(positions.key(containers, 1)).toEqual({ line: 11, column: 5 });
  });

  it('chỉ số dãy nhận cả số lẫn chuỗi', () => {
    const { doc, positions } = firstMap(SOURCE);
    const containers = asList(asMap(doc['spec'])['containers']);
    expect(positions.key(containers, '1')).toEqual(positions.key(containers, 1));
  });

  it('map mở trên chính dòng gạch đầu dòng trỏ vào chỗ thật, không vào cột thụt lề giả', () => {
    // Dòng ảo `name: c1` có thụt lề LOGIC là indent+2, nhưng cột THẬT của nó là
    // ngay sau `- `. Trộn hai thứ này là cách con trỏ nhảy lệch 2 ô.
    const { doc, positions } = firstMap(SOURCE);
    const first = asMap(asList(asMap(doc['spec'])['containers'])[0]);
    expect(positions.node(first)?.self).toEqual({ line: 9, column: 7 });
    expect(positions.key(first, 'name')).toEqual({ line: 9, column: 7 });
    expect(positions.value(first, 'name')).toEqual({ line: 9, column: 13 });
    expect(positions.key(first, 'image')).toEqual({ line: 10, column: 7 });
    expect(positions.value(first, 'image')).toEqual({ line: 10, column: 14 });
  });

  it('phần tử dãy là vô hướng: vị trí giá trị nằm ngay sau gạch đầu dòng', () => {
    const { doc, positions } = firstMap(['ports:', '  - 80', '  - 443'].join('\n'));
    const ports = asList(doc['ports']);
    expect(positions.key(ports, 0)).toEqual({ line: 2, column: 3 });
    expect(positions.value(ports, 0)).toEqual({ line: 2, column: 5 });
    expect(positions.value(ports, 1)).toEqual({ line: 3, column: 5 });
  });

  it('gạch đầu dòng trần: phần tử không có giá trị cùng dòng', () => {
    const { doc, positions } = firstMap(['items:', '  -', '    name: c1'].join('\n'));
    const items = asList(doc['items']);
    expect(positions.key(items, 0)).toEqual({ line: 2, column: 3 });
    expect(positions.value(items, 0)).toBeNull();
    expect(positions.node(asMap(items[0]))?.self).toEqual({ line: 3, column: 5 });
  });

  it('`{}` và `[]` rỗng vẫn có vị trí của chính chúng', () => {
    const { doc, positions } = firstMap(['podSelector: {}', 'ingress: []'].join('\n'));
    expect(positions.node(doc['podSelector'])?.self).toEqual({ line: 1, column: 14 });
    expect(positions.node(doc['ingress'])?.self).toEqual({ line: 2, column: 10 });
  });

  it('dòng trống và chú thích không làm lệch số dòng', () => {
    const { doc, positions } = firstMap(['# ghi chú', '', 'a: 1'].join('\n'));
    expect(positions.key(doc, 'a')).toEqual({ line: 3, column: 1 });
  });

  it('khoá không có trong map trả null, không ném', () => {
    const { doc, positions } = firstMap('a: 1');
    expect(positions.key(doc, 'khong-ton-tai')).toBeNull();
    expect(positions.value(doc, 'khong-ton-tai')).toBeNull();
  });

  it('vô hướng không có danh tính riêng nên không tra được', () => {
    const { positions } = firstMap('a: 1');
    expect(positions.node('web')).toBeNull();
    expect(positions.node(3)).toBeNull();
    expect(positions.node(null)).toBeNull();
    expect(positions.node(undefined)).toBeNull();
  });

  it('SAO CHÉP cây là MẤT DẤU — hợp đồng này phải đỏ nếu ai đó đổi sang tra theo đường dẫn', () => {
    // Bản đồ tra theo THAM CHIẾU object. Một tầng trên làm phẳng rồi hỏi vị trí
    // sẽ nhận null chứ không nhận một vị trí sai — và null thì thấy ngay.
    const { doc, positions } = firstMap(['metadata:', '  name: web'].join('\n'));
    const metadata = asMap(doc['metadata']);
    expect(positions.key(metadata, 'name')).not.toBeNull();
    expect(positions.key({ ...metadata }, 'name')).toBeNull();
    expect(positions.node({ ...doc })).toBeNull();
  });

  it('cây của một lượt quét khác không nằm trong bản đồ này', () => {
    const a = firstMap('a: 1');
    const b = firstMap('a: 1');
    expect(a.positions.key(b.doc, 'a')).toBeNull();
  });
});

describe('core/yaml — quy ước dòng/cột', () => {
  it('cả dòng lẫn cột đều 1-based: ký tự đầu nguồn là {1,1}', () => {
    const { doc, positions } = firstMap('a: 1');
    expect(positions.key(doc, 'a')).toEqual({ line: 1, column: 1 });
  });

  it('cột đếm bằng mã đơn vị UTF-16 — dấu tiếng Việt dựng sẵn là MỘT ô', () => {
    // 'tên' ở dạng NFC là 3 mã đơn vị, nên `: ` đứng ở cột 4-5 và giá trị ở cột 6.
    const { doc, positions } = firstMap('tên: web');
    expect(positions.value(doc, 'tên')).toEqual({ line: 1, column: 6 });
  });

  it('cột đếm bằng mã đơn vị UTF-16 — ký tự ngoài BMP chiếm HAI ô', () => {
    // '🙂' là một cặp thay thế (2 mã đơn vị). Đếm theo ký tự sẽ ra cột 5;
    // ô nhập của trình duyệt đếm theo mã đơn vị nên đáp số đúng là 6.
    const source = 'a: "🙂"';
    expect(source.indexOf('"')).toBe(3);
    const { doc, positions } = firstMap(`${source}\nb: 1`);
    expect(positions.value(doc, 'a')).toEqual({ line: 1, column: 4 });
    expect(positions.key(doc, 'b')).toEqual({ line: 2, column: 1 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Khoá trùng (19.C.4) — đổi hành vi có chủ đích, 2026-09-16
// ═══════════════════════════════════════════════════════════════════════════

describe('core/yaml — khoá trùng', () => {
  /*
   * ĐỐI CHỨNG DƯƠNG cho cả khối. Trước 2026-09-16 nguồn này quét XONG và trả
   * `{build: {needs: ['lint']}}` — job `build` khai trước biến mất sạch, không
   * lỗi, không cảnh báo. Ô test này đỏ nếu ai đó gỡ phép kiểm ra.
   */
  it('hai khoá trùng trong cùng map bị TỪ CHỐI, không âm thầm đè nhau', () => {
    const { error, line, column } = parseFail(`jobs:
  build:
    needs:
      - lint
  build:
    needs:
      - test
`);
    expect(error).toContain('build');
    expect(error).toContain('đã được khai');
    expect(line).toBe(5);
    expect(column).toBe(3);
  });

  it('lỗi trỏ vào lần khai THỨ HAI — đó là dòng người viết phải xoá', () => {
    const { line } = parseFail('a: 1\nb: 2\na: 3\n');
    expect(line).toBe(3);
  });

  it('khoá trùng ở map lồng cũng bị bắt, không chỉ ở gốc', () => {
    const { error, line } = parseFail(`metadata:
  name: web
  name: api
`);
    expect(error).toContain('name');
    expect(line).toBe(3);
  });

  it('khoá trùng trong một mục của dãy cũng bị bắt', () => {
    const { line } = parseFail(`steps:
  - run: a
    run: b
`);
    expect(line).toBe(3);
  });

  /*
   * Hai map ANH EM khai cùng một tên khoá là hình dạng bình thường nhất của
   * YAML cấu hình. Phép kiểm phải theo từng map, không theo cả tài liệu — gộp
   * lại sẽ từ chối gần như mọi manifest thật.
   */
  it('cùng tên khoá ở HAI map khác nhau là hợp lệ', () => {
    const { doc } = firstMap(`build:
  runs-on: linux
test:
  runs-on: linux
`);
    expect(asMap(doc['build'])['runs-on']).toBe('linux');
    expect(asMap(doc['test'])['runs-on']).toBe('linux');
  });

  /*
   * `Object.hasOwn` chứ không `in`: `'constructor' in {}` là `true` qua
   * prototype, nên một phép kiểm viết bằng `in` sẽ báo trùng ngay ở lần khai
   * ĐẦU. Ghim cả bốn khoá hay va vào prototype.
   */
  it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
    'khoá "%s" khai MỘT lần vẫn hợp lệ — phép kiểm không đi qua prototype',
    (khoa) => {
      const { doc } = firstMap(`${khoa}: 1\nkhac: 2\n`);
      expect(doc[khoa]).toBe(1);
    },
  );

  it('khoá trên prototype khai HAI lần vẫn bị bắt', () => {
    const { line } = parseFail('toString: 1\ntoString: 2\n');
    expect(line).toBe(2);
  });

  it('khoá trùng nhau chỉ sau khi bỏ nháy vẫn là trùng', () => {
    const { line } = parseFail('"a": 1\na: 2\n');
    expect(line).toBe(2);
  });

  it('hai tài liệu ngăn bởi "---" không chia sẻ không gian khoá', () => {
    const { documents } = parseOk('a: 1\n---\na: 2\n');
    expect(documents).toHaveLength(2);
    expect(asMap(documents[0])['a']).toBe(1);
    expect(asMap(documents[1])['a']).toBe(2);
  });
});
