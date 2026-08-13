import { describe, expect, it } from 'vitest';
import { KillercodaFormatError, parseKillercodaIndex } from './killercoda.ts';

const minimal = {
  title: 'Bài mẫu',
  details: { steps: [{ title: 'Bước 1', text: 'step1.md' }] },
  backend: { imageid: 'ubuntu' },
};

describe('parseKillercodaIndex — đường xanh', () => {
  it('nhận scenario tối thiểu', () => {
    const { index, ignoredFields } = parseKillercodaIndex(minimal);
    expect(index.title).toBe('Bài mẫu');
    expect(index.details?.steps?.[0]?.text).toBe('step1.md');
    expect(ignoredFields).toEqual([]);
  });

  it('nhận đủ intro/finish/assets/interface', () => {
    const { index } = parseKillercodaIndex({
      title: 'Đầy đủ',
      description: 'mô tả',
      details: {
        intro: { text: 'intro.md', foreground: 'fg.sh', background: 'bg.sh', verify: 'v.sh' },
        steps: [{ text: 'step1.md', verify: 'step1/verify.sh' }],
        finish: { text: 'finish.md' },
        assets: { host01: [{ file: '*', target: '/all', chmod: '+x' }] },
      },
      backend: { imageid: 'kubernetes-kubeadm-2nodes' },
      interface: { layout: 'ide' },
    });
    expect(index.details?.intro?.verify).toBe('v.sh');
    expect(index.details?.assets?.['host01']).toHaveLength(1);
    expect(index.interface?.layout).toBe('ide');
  });

  it('step vắng title là hợp lệ (upstream `use-images` làm vậy)', () => {
    const { index } = parseKillercodaIndex({ ...minimal, details: { steps: [{ text: 'a.md' }] } });
    expect(index.details?.steps?.[0]?.title).toBeUndefined();
  });

  it('scenario không có details là hợp lệ Ở TẦNG NÀY (upstream `ubuntu-simple`) — loader mới từ chối', () => {
    const { index } = parseKillercodaIndex({
      title: 'Ubuntu simple',
      backend: { imageid: 'ubuntu' },
    });
    expect(index.details).toBeUndefined();
  });
});

describe('parseKillercodaIndex — luật 3, field lạ', () => {
  it('field lạ chưa khai thì NÉM và nêu đúng đường dẫn', () => {
    expect(() =>
      parseKillercodaIndex({
        ...minimal,
        details: { intro: { text: 'i.md', courseData: 'setup.sh' }, steps: minimal.details.steps },
      }),
    ).toThrow(/details\.intro\.courseData/);
  });

  it('field lạ ĐÃ khai thì cho qua và được ghi lại, không nuốt im lặng', () => {
    const { index, ignoredFields } = parseKillercodaIndex(
      {
        ...minimal,
        details: { intro: { text: 'i.md', courseData: 'setup.sh' }, steps: minimal.details.steps },
      },
      ['details.intro.courseData'],
    );
    expect(ignoredFields).toEqual(['details.intro.courseData']);
    expect(index.details?.intro?.text).toBe('i.md');
  });

  it('gom ĐỦ mọi field lạ trong một lần báo, không dừng ở cái đầu tiên', () => {
    let message = '';
    try {
      parseKillercodaIndex({ ...minimal, foo: 1, details: { ...minimal.details, bar: 2 } });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('foo');
    expect(message).toContain('details.bar');
  });

  it('lời khai đã cũ (upstream đã dọn field) cũng là LỖI, không phải chuyện vô hại', () => {
    expect(() => parseKillercodaIndex(minimal, ['details.intro.courseData'])).toThrow(
      /lời khai đã cũ/,
    );
  });

  it('KHÔNG làm biến đổi object của caller khi bỏ field đã khai', () => {
    const raw = {
      ...minimal,
      details: { intro: { text: 'i.md', courseData: 'setup.sh' }, steps: minimal.details.steps },
    };
    parseKillercodaIndex(raw, ['details.intro.courseData']);
    expect(raw.details.intro).toHaveProperty('courseData', 'setup.sh');
  });
});

describe('parseKillercodaIndex — sai cấu trúc thật', () => {
  it('thiếu title', () => {
    const { title: _drop, ...rest } = minimal;
    expect(() => parseKillercodaIndex(rest)).toThrow(KillercodaFormatError);
  });

  it('thiếu backend.imageid', () => {
    expect(() => parseKillercodaIndex({ ...minimal, backend: {} })).toThrow(/imageid/);
  });

  it('step thiếu text — một bước không có nội dung là trang trắng', () => {
    expect(() =>
      parseKillercodaIndex({ ...minimal, details: { steps: [{ title: 'x' }] } }),
    ).toThrow(/text/);
  });

  it('sai kiểu (steps là object thay vì mảng)', () => {
    expect(() => parseKillercodaIndex({ ...minimal, details: { steps: {} } })).toThrow(
      KillercodaFormatError,
    );
  });

  it('lỗi cấu trúc thắng lỗi field lạ — không cho khai để né một schema thật sự sai', () => {
    expect(() =>
      parseKillercodaIndex(
        { ...minimal, details: { steps: [{ text: 'a.md', nope: 1 }] }, backend: {} },
        ['details.steps.0.nope'],
      ),
    ).toThrow(/sai cấu trúc/);
  });
});
