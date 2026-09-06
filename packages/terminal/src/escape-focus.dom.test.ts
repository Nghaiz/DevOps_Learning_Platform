// @vitest-environment jsdom
//
// File RIÊNG với `escape-focus.test.ts` có chủ ý: project `node` của
// `vitest.config.ts` khai `environment: 'node'` vì phần lớn logic ở đây KHÔNG
// cần DOM, và trộn một docblock jsdom vào file detector sẽ âm thầm biến bốn
// assertion thuần thành bốn assertion chạy trong một DOM giả — chậm hơn, và
// che mất việc chúng vốn không cần DOM.
import { afterEach, describe, expect, it } from 'vitest';
import { focusNextAfter } from './escape-focus.ts';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('focusNextAfter — nửa "rời đi đâu" của D10', () => {
  it('focus phần tử focus-được kế tiếp trong thứ tự tài liệu', () => {
    document.body.innerHTML = `
      <button id="truoc">Trước</button>
      <div id="term" tabindex="0"><textarea id="xterm-helper"></textarea></div>
      <button id="sau">Sau</button>
    `;
    const term = document.getElementById('term');
    expect(term).not.toBeNull();

    expect(focusNextAfter(term as HTMLElement)).toBe(true);
    expect(document.activeElement?.id).toBe('sau');
  });

  it('KHÔNG focus vào textarea nằm TRONG terminal — đó là chỗ vừa rời khỏi', () => {
    // Đây là ca hỏng thật nếu quên `element.contains(...)`: xterm dựng một
    // `<textarea>` ẩn bên trong container để nhận bàn phím, nó khớp selector
    // focus-được, và nó đứng SAU container trong thứ tự tài liệu. Không loại
    // thì "thoát terminal" focus lại đúng ô nhập của terminal — một no-op
    // trông y hệt tính năng chết.
    document.body.innerHTML = `
      <div id="term" tabindex="0"><textarea id="xterm-helper"></textarea></div>
      <button id="sau">Sau</button>
    `;
    focusNextAfter(document.getElementById('term') as HTMLElement);
    expect(document.activeElement?.id).not.toBe('xterm-helper');
    expect(document.activeElement?.id).toBe('sau');
  });

  it('bỏ qua phần tử ĐỨNG TRƯỚC terminal', () => {
    document.body.innerHTML = `
      <button id="truoc">Trước</button>
      <div id="term" tabindex="0"></div>
    `;
    const truoc = document.getElementById('truoc') as HTMLElement;
    truoc.focus();
    expect(focusNextAfter(document.getElementById('term') as HTMLElement)).toBe(false);
    expect(document.activeElement?.id).not.toBe('truoc');
  });

  it('bỏ qua nút disabled và phần tử aria-hidden', () => {
    document.body.innerHTML = `
      <div id="term" tabindex="0"></div>
      <button id="tat" disabled>Tắt</button>
      <button id="an" aria-hidden="true">Ẩn</button>
      <button id="that">Thật</button>
    `;
    focusNextAfter(document.getElementById('term') as HTMLElement);
    expect(document.activeElement?.id).toBe('that');
  });

  it('không còn gì phía sau ⇒ blur, trả false (vẫn thoát được bằng Tab)', () => {
    document.body.innerHTML = `<div id="term" tabindex="0"><textarea></textarea></div>`;
    const term = document.getElementById('term') as HTMLElement;
    term.focus();
    expect(focusNextAfter(term)).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });
});
