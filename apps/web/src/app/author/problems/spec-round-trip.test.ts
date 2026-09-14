import { describe, expect, it } from 'vitest';
import { PROBLEM_PLUGINS, type AuthorField } from '@devops-platform/games';
import { moveObjective, type ObjectiveFormState } from './problem-form';
import { specFromText, specToText } from './spec-text';

/**
 * Hai hàm THUẦN mà §18.D.1 nửa sau và §18.D.2 dựng ra, đo không cần DOM.
 *
 * Chúng được viết ra ngoài JSX đúng để đo được ở đây — một phép hoán vị sai chỗ
 * hay một phép đọc ngược đánh rơi trường thì chỉ lộ ra khi có người bấm đúng nút
 * ở đúng vị trí, hoặc khi một bài đã lưu mở lại thành biểu mẫu trống.
 */

function objective(id: string): ObjectiveFormState {
  return { key: `k-${id}`, id, label: id, check: '', args: {}, visible: true };
}

describe('moveObjective — đổi thứ tự testcase (§18.D.2)', () => {
  const list = [objective('a'), objective('b'), objective('c')];

  it('đổi chỗ với hàng xóm, giữ nguyên phần còn lại', () => {
    expect(moveObjective(list, 1, -1).map((o) => o.id)).toEqual(['b', 'a', 'c']);
    expect(moveObjective(list, 1, 1).map((o) => o.id)).toEqual(['a', 'c', 'b']);
  });

  it('`key` đi THEO phần tử, không theo vị trí', () => {
    /*
     * Đây là bất biến làm React không nhầm ô đang gõ dở. Nếu `key` ở lại vị trí
     * cũ thì React giữ nguyên DOM tại mỗi chỗ và giá trị người soạn đang gõ nhảy
     * sang mục tiêu khác — cùng lớp lỗi mà `problem-json.ts` đã ghi lại cho
     * `clusterFromSpec`, và nó KHÔNG đỏ ở bất kỳ phép so nội dung nào.
     */
    const moved = moveObjective(list, 0, 1);
    expect(moved[0]?.key).toBe('k-b');
    expect(moved[1]?.key).toBe('k-a');
  });

  it('nước đi ra biên trả về CHÍNH mảng cũ, không phải bản sao', () => {
    // So bằng `toBe` chứ không `toEqual`: React so theo tham chiếu, nên một bản
    // sao đồng nội dung vẫn làm cả tab render lại và bật `hasUnsavedChanges` sau
    // một cú bấm không đổi gì. `toEqual` sẽ xanh với cả hai và không gác được gì.
    expect(moveObjective(list, 0, -1)).toBe(list);
    expect(moveObjective(list, 2, 1)).toBe(list);
  });
});

describe('specFromText — phép đọc ngược của specToText (§18.D.1)', () => {
  /*
   * Đi vòng TRÒN trên mô tả form THẬT của plugin K8s chứ không trên một mô tả
   * bịa: một bộ `AuthorField` tự chế sẽ chỉ chứng minh hai hàm hợp nhau, không
   * chứng minh chúng chở nổi thứ trang soạn bài thật sự gửi qua.
   */
  const plugin = PROBLEM_PLUGINS['k8s'];
  const fields: readonly AuthorField[] = plugin?.authorFields ?? [];
  const spec = (plugin?.initialSpec() ?? {}) as Readonly<Record<string, unknown>>;

  it('mô tả form của plugin không rỗng', () => {
    // T0: không có ô này thì mọi ô dưới cũng xanh trên một `fields` rỗng, tức
    // một phép đo không đo gì.
    expect(fields.length).toBeGreaterThan(0);
    expect(Object.keys(spec).length).toBeGreaterThan(0);
  });

  it('spec → text → spec giữ nguyên giá trị', () => {
    const back = specFromText(fields, specToText(fields, spec));
    expect(back.issues).toEqual([]);
    expect(back.value).toEqual(spec);
  });

  it('ô JSON hỏng thành issue có TÊN ô, không thành giá trị rác', () => {
    const jsonField = fields.find((f) => f.kind === 'json' || f.kind === 'list');
    expect(jsonField, 'plugin K8s phải có ít nhất một ô dạng JSON').toBeDefined();
    if (jsonField === undefined) return;
    const broken = { ...specToText(fields, spec), [jsonField.path]: '{ chua dong ngoac' };
    const back = specFromText(fields, broken);
    expect(back.issues.map((i) => i.path)).toEqual([jsonField.path]);
    // Và giá trị hỏng KHÔNG lọt vào `value`: nó phải vắng mặt, không phải nằm đó
    // dưới dạng chuỗi — một `string` ở chỗ đáng lẽ là mảng sẽ qua được cổng ghi
    // (biên chỉ đòi `initialState` là object) rồi làm engine đọc ra rác.
    expect(Object.hasOwn(back.value, jsonField.path)).toBe(false);
  });

  /*
   * ⚠ Ô dưới dùng mô tả form TỰ DỰNG, cố ý đi ngược quy ước của cả khối trên —
   * và lý do là một phép đo, không phải tiện tay.
   *
   * `K8S_AUTHOR_FIELDS` ở tầng ĐẦU không có ô vô hướng nào: ba khối của nó là
   * `list` (node, tài nguyên) và `string-list` (namespace). Ô `text`/`number`
   * chỉ tồn tại ở TRƯỜNG CON bên trong `list`, mà `specToText`/`specFromText`
   * cố ý chỉ đọc tầng đầu (cả danh sách nằm trong một ô JSON — xem `isJsonShaped`).
   * Bản đầu của ô này đi tìm ô vô hướng trong plugin thật và ĐỎ vì không có.
   *
   * Nên đây là ca chỉ với tới được bằng mô tả tự dựng, và nó vẫn đáng đo: luật
   * "vô hướng để trống thì bỏ hẳn khoá" là một nhánh THẬT của `specFromText`,
   * sẽ chạy ngay khi một plugin khai một ô vô hướng ở tầng đầu. Đo nó bây giờ rẻ
   * hơn phát hiện ra lúc bài đầu tiên của game đó lưu hỏng.
   */
  it('ô vô hướng để TRỐNG thì bỏ hẳn khoá, không gửi chuỗi rỗng', () => {
    // `''` gửi lên là một GIÁ TRỊ; khoá vắng mặt là "chưa điền". Hai thứ khác
    // nhau ở `exactOptionalPropertyTypes`, và khác nhau với engine.
    const synthetic: readonly AuthorField[] = [
      { kind: 'text', path: 'ten', label: 'Tên', required: false },
      { kind: 'number', path: 'so', label: 'Số', required: false, integer: true },
      { kind: 'boolean', path: 'co', label: 'Cờ' },
    ];
    const blank = specFromText(synthetic, { ten: '   ', so: '', co: '' });
    expect(Object.hasOwn(blank.value, 'ten')).toBe(false);
    expect(Object.hasOwn(blank.value, 'so')).toBe(false);
    // Đối chứng dương: ô CÓ điền thì khoá phải có mặt, nếu không thì một hàm
    // bỏ MỌI khoá cũng làm hai vế trên xanh.
    expect(specFromText(synthetic, { ten: ' web ', so: '3', co: '' }).value).toEqual({
      ten: 'web',
      so: 3,
      // Cờ luôn ghi, kể cả `false`: ô đánh dấu trên màn hình không có trạng thái
      // "chưa trả lời", nên một khoá vắng mặt sẽ là một trạng thái bịa.
      co: false,
    });
    // Số không đọc được thành issue, KHÔNG thành `NaN` lọt vào spec.
    const bad = specFromText(synthetic, { so: 'ba' });
    expect(bad.issues.map((i) => i.path)).toEqual(['so']);
    expect(Object.hasOwn(bad.value, 'so')).toBe(false);
  });
});
