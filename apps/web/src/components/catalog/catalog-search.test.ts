import { describe, expect, it } from 'vitest';
import {
  foldSearchText,
  matchesSearchQuery,
  normalizeSearchQuery,
  searchPage,
} from './catalog-search';

/**
 * Ô tìm của trang danh mục (16.C).
 *
 * Thứ đáng kiểm ở đây KHÔNG phải "có lọc được không" — mà là bốn chỗ một ô tìm
 * tiếng Việt hỏng IM LẶNG:
 *
 * 1. `đ` không tách được bằng NFD, nên bản "bỏ dấu" viết vội chỉ đúng với 28
 *    trong 29 chữ cái.
 * 2. `null` nối vào template literal cho ra bốn chữ cái người dùng gõ được.
 * 3. Từ khoá nhiều từ khớp theo HOẶC thì gõ thêm chữ lại ra nhiều kết quả hơn.
 * 4. Trả về mảng mới khi không tìm gì thì mọi `useMemo` phía dưới mất tác dụng.
 */

describe('foldSearchText', () => {
  it('bỏ dấu thanh và dấu mũ', () => {
    expect(foldSearchText('Bài học')).toBe('bai hoc');
    expect(foldSearchText('Triển khai ứng dụng')).toBe('trien khai ung dung');
    expect(foldSearchText('Kiểm tra sức khoẻ')).toBe('kiem tra suc khoe');
  });

  it('gập `đ` và `Đ` về `d`', () => {
    expect(foldSearchText('Đóng gói')).toBe('dong goi');
    expect(foldSearchText('điều phối')).toBe('dieu phoi');
  });

  /**
   * ĐỐI CHỨNG DƯƠNG cho dòng `D_STROKE` của `catalog-search.ts`.
   *
   * Không có ca này thì việc gập `đ` trông như một hệ quả miễn phí của NFD, và
   * người đọc sau sẽ xoá dòng đó khi dọn dẹp. Ca này khẳng định thẳng rằng NFD
   * MỘT MÌNH không làm được: `đ` là một ký tự Latin độc lập trong Unicode
   * (U+0111), không có phân rã chính tắc.
   */
  it('NFD một mình KHÔNG gập được `đ` — nên dòng D_STROKE là bắt buộc', () => {
    const dStroke = String.fromCharCode(0x111);
    expect(dStroke.normalize('NFD')).toBe(dStroke);
    expect(dStroke.normalize('NFD').length).toBe(1);

    // Đối chiếu: một chữ CÓ phân rã thì NFD tách ra thật.
    const eAcuteCircumflex = 'ế';
    expect(eAcuteCircumflex.normalize('NFD').length).toBe(3);
  });

  it('thường hoá trước khi bỏ dấu, nên chữ hoa có dấu cũng gập đúng', () => {
    expect(foldSearchText('ĐIỀU PHỐI')).toBe(foldSearchText('điều phối'));
    expect(foldSearchText('Ế')).toBe('e');
  });

  it('không đụng tới chữ và số không dấu', () => {
    expect(foldSearchText('K8S-0042 nginx v1.29')).toBe('k8s-0042 nginx v1.29');
  });
});

describe('normalizeSearchQuery', () => {
  it('cắt khoảng trắng hai đầu và gộp khoảng trắng giữa', () => {
    expect(normalizeSearchQuery('  pod   treo ')).toBe('pod treo');
    expect(normalizeSearchQuery('pod\ttreo')).toBe('pod treo');
  });

  it('trả chuỗi rỗng khi không có gì để tìm', () => {
    expect(normalizeSearchQuery('')).toBe('');
    expect(normalizeSearchQuery('    ')).toBe('');
  });

  it('gập dấu luôn, nên nơi gọi chỉ cần so một lần', () => {
    expect(normalizeSearchQuery(' Đóng Gói ')).toBe('dong goi');
  });
});

describe('matchesSearchQuery', () => {
  const fields = ['Triển khai ứng dụng đầu tiên', 'Dựng một Deployment rồi phơi nó ra ngoài'];

  it('từ khoá rỗng khớp mọi mục', () => {
    expect(matchesSearchQuery(fields, '')).toBe(true);
    expect(matchesSearchQuery([], '')).toBe(true);
  });

  it('khớp không cần dấu, không phân biệt hoa thường', () => {
    expect(matchesSearchQuery(fields, normalizeSearchQuery('trien khai'))).toBe(true);
    expect(matchesSearchQuery(fields, normalizeSearchQuery('TRIỂN KHAI'))).toBe(true);
    expect(matchesSearchQuery(fields, normalizeSearchQuery('deployment'))).toBe(true);
  });

  /**
   * Luật VÀ, không phải HOẶC. Đây là ca phân biệt một ô tìm THU HẸP dần với một
   * ô tìm mở rộng dần: `'trien'` khớp, `'trien deployment'` vẫn khớp vì cả hai
   * từ đều có mặt, còn `'trien nginx'` thì KHÔNG — dù `'trien'` một mình có.
   */
  it('nhiều từ khớp theo VÀ, ở bất kỳ trường nào', () => {
    expect(matchesSearchQuery(fields, normalizeSearchQuery('trien deployment'))).toBe(true);
    expect(matchesSearchQuery(fields, normalizeSearchQuery('trien nginx'))).toBe(false);
  });

  it('không khớp thì trả false', () => {
    expect(matchesSearchQuery(fields, normalizeSearchQuery('ingress'))).toBe(false);
  });

  /**
   * `description` của cả năm procedure là `string | null`. Một bản nối chuỗi
   * bằng template literal biến `null` thành bốn chữ cái mà người dùng gõ được,
   * nên gõ "null" sẽ "tìm ra" đúng những mục KHÔNG có mô tả — một kết quả đọc
   * ra như lỗi và không ai đoán được nguồn.
   */
  it('bỏ qua trường null/undefined thay vì nối chúng thành chữ', () => {
    expect(matchesSearchQuery([null, undefined], normalizeSearchQuery('null'))).toBe(false);
    expect(matchesSearchQuery([null, undefined], normalizeSearchQuery('undefined'))).toBe(false);
    expect(matchesSearchQuery(['Pod', null], normalizeSearchQuery('pod'))).toBe(true);
  });

  it('không khớp xuyên qua ranh giới trường', () => {
    // Hai trường nối bằng một dấu cách, nên "dung dung" (cuối trường 1 + đầu
    // trường 2) không được coi là một cụm liền.
    expect(matchesSearchQuery(['abc', 'def'], normalizeSearchQuery('abcdef'))).toBe(false);
  });
});

describe('searchPage', () => {
  interface Row {
    readonly title: string;
    readonly description: string | null;
  }

  const items: readonly Row[] = [
    { title: 'Triển khai ứng dụng đầu tiên', description: 'Dựng một Deployment.' },
    { title: 'Đóng gói image', description: null },
    { title: 'Ingress cơ bản', description: 'Phơi service ra ngoài cluster.' },
  ];

  const fieldsOf = (row: Row): readonly (string | null)[] => [row.title, row.description];

  /**
   * Trả về CHÍNH mảng đầu vào, không phải một bản sao. Đây là đường đi thường
   * gặp nhất (ô tìm rỗng), và một mảng mới mỗi lượt render sẽ phá mọi `useMemo`
   * phía dưới — hỏng theo kiểu chậm dần chứ không theo kiểu đỏ.
   */
  it('từ khoá rỗng trả về đúng tham chiếu cũ', () => {
    expect(searchPage(items, '', fieldsOf)).toBe(items);
  });

  it('lọc theo từ khoá đã gập dấu', () => {
    const found = searchPage(items, normalizeSearchQuery('dong goi'), fieldsOf);
    expect(found.map((row) => row.title)).toEqual(['Đóng gói image']);
  });

  it('tìm được cả trong mô tả, không chỉ trong tiêu đề', () => {
    const found = searchPage(items, normalizeSearchQuery('cluster'), fieldsOf);
    expect(found.map((row) => row.title)).toEqual(['Ingress cơ bản']);
  });

  it('không sửa mảng gốc', () => {
    const snapshot = items.map((row) => row.title);
    searchPage(items, normalizeSearchQuery('ingress'), fieldsOf);
    expect(items.map((row) => row.title)).toEqual(snapshot);
  });

  it('không khớp gì thì trả mảng rỗng, không trả cả trang', () => {
    expect(searchPage(items, normalizeSearchQuery('helm'), fieldsOf)).toEqual([]);
  });
});
