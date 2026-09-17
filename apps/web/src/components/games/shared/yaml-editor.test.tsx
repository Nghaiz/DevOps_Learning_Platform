// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { YamlEditor } from './yaml-editor.tsx';

/**
 * Ô soạn YAML dùng chung — chuyển từ `k8s-arena/hud/` sang đây ngày 2026-09-16
 * để game CI/CD (19.E.1/E.2) dùng lại thay vì chép bản thứ hai.
 *
 * Hai nhóm ô đo hai chuyện khác nhau, và nhóm đầu quan trọng hơn:
 *
 * 1. **Bản của game k8s KHÔNG đổi hình dạng.** Hai prop mới đều tắt mặc định,
 *    nên chỗ gọi cũ phải render y hệt trước khi chuyển nhà. Không có ô này thì
 *    "đã chuyển, k8s vẫn xanh" chỉ là một lời khai.
 * 2. Máng số dòng và dòng lỗi (19.E.2) làm đúng việc của chúng.
 *
 * ⚠ KHÔNG đo được ở đây: hai lớp có chồng KHÍT nhau không. Ba bất biến căn lề ở
 * đầu `yaml-editor.tsx` là chuyện của bố cục THẬT — jsdom không dựng bố cục,
 * `getBoundingClientRect` trả 0 ở mọi phần tử, nên một ô "kiểm căn lề" viết ở
 * đây sẽ xanh kể cả khi phông của hai lớp khác hẳn nhau. Chỗ đo nó là Playwright.
 */

afterEach(cleanup);

/** Lớp màu và máng số dòng đều `aria-hidden`, nên phải lấy qua DOM chứ không qua vai trò. */
function gutter(container: HTMLElement): HTMLPreElement | null {
  return container.querySelector('pre.text-right');
}

function paintRows(container: HTMLElement): readonly Element[] {
  const paints = container.querySelectorAll('pre');
  const paint = paints[paints.length - 1];
  return paint === undefined ? [] : [...paint.querySelectorAll(':scope > span')];
}

describe('YamlEditor — hình dạng cũ không đổi', () => {
  it('không có máng số dòng khi không yêu cầu', () => {
    const { container } = render(<YamlEditor value={'a: 1\nb: 2'} onChange={vi.fn()} ariaLabel="YAML" />);
    expect(gutter(container)).toBeNull();
  });

  it('vẫn là một <textarea> thật, có nhãn, không bị soát chính tả', () => {
    render(<YamlEditor value="a: 1" onChange={vi.fn()} ariaLabel="Ô soạn YAML" />);
    const area = screen.getByLabelText('Ô soạn YAML');
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.getAttribute('spellcheck')).toBe('false');
  });

  it('gõ vào ô bắn onChange với nguyên văn giá trị mới', () => {
    const onChange = vi.fn();
    render(<YamlEditor value="a: 1" onChange={onChange} ariaLabel="YAML" />);
    fireEvent.change(screen.getByLabelText('YAML'), { target: { value: 'a: 2' } });
    expect(onChange).toHaveBeenCalledWith('a: 2');
  });

  it('lớp màu là aria-hidden — trình đọc màn hình chỉ thấy textarea', () => {
    const { container } = render(<YamlEditor value="a: 1" onChange={vi.fn()} ariaLabel="YAML" />);
    for (const pre of container.querySelectorAll('pre')) {
      expect(pre.getAttribute('aria-hidden')).not.toBeNull();
    }
  });
});

describe('YamlEditor — máng số dòng (19.E.2)', () => {
  it('một số cho mỗi dòng, và số khớp mảng đã tách của lớp màu', () => {
    const { container } = render(
      <YamlEditor value={'a: 1\nb: 2\nc: 3'} onChange={vi.fn()} ariaLabel="YAML" showLineNumbers />,
    );
    const g = gutter(container);
    expect(g).not.toBeNull();
    const so = [...(g?.querySelectorAll('span') ?? [])].map((s) => s.textContent?.trim());
    expect(so).toEqual(['1', '2', '3']);
    // Cùng số hàng với lớp màu — lệch là số dòng trỏ sai dòng.
    expect(paintRows(container)).toHaveLength(so.length);
  });

  it('máng cũng aria-hidden — số dòng không được đọc thành nội dung', () => {
    const { container } = render(
      <YamlEditor value={'a: 1'} onChange={vi.fn()} ariaLabel="YAML" showLineNumbers />,
    );
    expect(gutter(container)?.getAttribute('aria-hidden')).not.toBeNull();
  });
});

describe('YamlEditor — dòng lỗi (19.E.2)', () => {
  it('chỉ dòng được nêu mới đổi, các dòng khác giữ nguyên', () => {
    const { container } = render(
      <YamlEditor
        value={'a: 1\nb: 2\nc: 3'}
        onChange={vi.fn()}
        ariaLabel="YAML"
        showLineNumbers
        errorLines={new Set([2])}
      />,
    );
    const hang = paintRows(container);
    expect(hang[0]?.className).not.toContain('bg-destructive');
    expect(hang[1]?.className).toContain('bg-destructive');
    expect(hang[2]?.className).not.toContain('bg-destructive');

    const so = [...(gutter(container)?.querySelectorAll('span') ?? [])];
    expect(so[1]?.className).toContain('text-destructive');
    expect(so[0]?.className).not.toContain('text-destructive');
  });

  /*
   * ĐỐI CHỨNG DƯƠNG: cùng nội dung, không truyền `errorLines` ⇒ không dòng nào
   * đỏ. Thiếu ô này thì ô trên vẫn xanh nếu ai đó tô đỏ MỌI dòng.
   */
  it('không truyền errorLines ⇒ không dòng nào bị tô', () => {
    const { container } = render(
      <YamlEditor value={'a: 1\nb: 2\nc: 3'} onChange={vi.fn()} ariaLabel="YAML" showLineNumbers />,
    );
    for (const hang of paintRows(container)) {
      expect(hang.className).not.toContain('bg-destructive');
    }
  });

  it('số dòng ngoài phạm vi không làm vỡ gì', () => {
    const { container } = render(
      <YamlEditor value="a: 1" onChange={vi.fn()} ariaLabel="YAML" showLineNumbers errorLines={new Set([99])} />,
    );
    expect(paintRows(container)).toHaveLength(1);
    expect(paintRows(container)[0]?.className).not.toContain('bg-destructive');
  });

  it('axe 0 vi phạm ở trạng thái có lỗi', async () => {
    const { container } = render(
      <YamlEditor
        value={'a: 1\nb: 2'}
        onChange={vi.fn()}
        ariaLabel="Ô soạn YAML"
        showLineNumbers
        errorLines={new Set([2])}
      />,
    );
    const ket = await axe.run(container, { rules: { region: { enabled: false } } });
    expect(ket.violations.map((v) => v.id)).toEqual([]);
  });
});
