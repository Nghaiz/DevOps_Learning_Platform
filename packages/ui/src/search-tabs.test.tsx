import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ARIA_LABEL_VI, SearchTabs } from './search-tabs.tsx';

afterEach(cleanup);

const TABS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'labs', label: 'Phòng thực hành' },
];

function renderTabs(overrides: Partial<Parameters<typeof SearchTabs>[0]> = {}) {
  return render(<SearchTabs tabs={TABS} label="Tìm và lọc bài học" {...overrides} />);
}

describe('SearchTabs — seam quanh gói ngoài', () => {
  it('render đủ tab và phát `onTabChange` với `value`, không phải nhãn', () => {
    const onTabChange = vi.fn();
    renderTabs({ onTabChange });
    fireEvent.click(screen.getByRole('tab', { name: 'Phòng thực hành' }));
    expect(onTabChange).toHaveBeenCalledWith('labs');
  });

  /**
   * Mười biến `--gst-*` phải đi bằng INLINE STYLE, không bằng class.
   *
   * Luật của gói nằm trên `.gooey-search-tabs-wrapper` (độ đặc hiệu 0,1,0) —
   * đúng bằng một class tiện ích Tailwind. Ai thắng khi đó phụ thuộc thứ tự
   * nguồn giữa stylesheet của gói và layer của Tailwind, thứ không khai báo
   * được ở đây và sẽ trôi khi Next đổi thứ tự chunk. Inline style thắng vô điều
   * kiện, nên phép gác là "biến có mặt trong `style` của phần tử vỏ".
   */
  it.each([
    '--gst-bg',
    '--gst-bridge-bg',
    '--gst-text',
    '--gst-input-text',
    '--gst-placeholder',
    '--gst-shadow',
    '--gst-hover',
    '--gst-focus-ring',
    '--gst-tab-indicator-bg',
    '--gst-tab-active-text',
  ])('%s được ghi đè bằng token của hệ, qua inline style', (variable) => {
    const { container } = renderTabs();
    const host = container.querySelector('[data-slot="search-tabs"]') as HTMLElement;
    const value = host.style.getPropertyValue(variable);
    expect(value, `${variable} không được ghi đè ⇒ gói ngoài giữ hex mặc định của nó`).not.toBe('');
    expect(value, `${variable} phải trỏ về một token, không phải một giá trị tự đặt`).toMatch(
      /^var\(--[a-z0-9-]+\)$/,
    );
  });

  it('`font-family` cũng bị ghi đè — gói ghim một stack KHÔNG có Be Vietnam Pro', () => {
    const { container } = renderTabs();
    const host = container.querySelector('[data-slot="search-tabs"]') as HTMLElement;
    expect(host.style.fontFamily).toBe('var(--font-sans)');
  });

  /**
   * Đúng MỘT landmark `role="search"`, và nó mang tên tiếng Việt.
   *
   * Vỏ bọc CỐ Ý không tự đặt `role="search"`: gói đã render một vùng như vậy,
   * và hai landmark search lồng nhau là một khiếm khuyết a11y thật (axe
   * `landmark-unique`), không phải một lớp bảo hiểm. Tên được gắn vào vùng CỦA
   * GÓI trong cùng effect dịch nhãn.
   */
  it('có đúng một vùng `role="search"`, mang tên tiếng Việt do nơi gọi đặt', () => {
    const { container } = renderTabs();
    const regions = container.querySelectorAll('[role="search"]');
    expect(regions).toHaveLength(1);
    expect((regions[0] as HTMLElement).getAttribute('aria-label')).toBe('Tìm và lọc bài học');
  });
});

/**
 * Sổ dịch nhãn hỗ trợ tiếp cận — cổng HAI CHIỀU trên gói ngoài.
 *
 * `gooey-search-tabs@0.2.0` ghim bốn nhãn a11y bằng TIẾNG ANH và không có prop
 * nào đổi chúng. Một sản phẩm tiếng Việt để cây a11y đọc "Open search" là một
 * khiếm khuyết thật, và nó nhân lên năm lần vì năm trang danh mục cùng dùng.
 *
 * Vỏ bọc dịch chúng sau khi render. Rủi ro của cách đó là nó IM LẶNG khi gói
 * đổi chữ: bảng dịch trượt, nhãn tiếng Anh sống lại, không gì kêu. Nên sổ được
 * rà hai chiều ngay trên bundle của bản đang cài:
 *
 *   • chiều lên  — gói phát một nhãn KHÔNG có trong sổ ⇒ đỏ (nhãn mới, chưa dịch);
 *   • chiều xuống — sổ có một khoá gói KHÔNG còn phát ⇒ cũng đỏ (dòng chết).
 */
describe('sổ dịch nhãn a11y — rà hai chiều trên chính bundle đang cài', () => {
  const require_ = createRequire(join(process.cwd(), 'package.json'));
  const bundle = readFileSync(
    join(dirname(require_.resolve('gooey-search-tabs')), 'index.js'),
    'utf8',
  );

  /** Mọi chuỗi literal đứng sau `"aria-label":` trong bundle đã build. */
  const emitted = new Set(
    [...bundle.matchAll(/"aria-label":\s*"([^"]+)"/g)].map((m) => m[1] as string),
  );
  /** Dạng ba ngôi `expanded ? "Search" : "Open search"` — hai nhánh, một chỗ khai. */
  for (const match of bundle.matchAll(/"aria-label":\s*[^,}]*\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g)) {
    emitted.add(match[1] as string);
    emitted.add(match[2] as string);
  }

  it('bộ đọc bundle tìm được ít nhất một nhãn (nếu 0, cả khối này xanh khống)', () => {
    expect(emitted.size).toBeGreaterThan(0);
  });

  it('CHIỀU LÊN — không nhãn nào của gói thiếu bản dịch', () => {
    const untranslated = [...emitted].filter((label) => ARIA_LABEL_VI[label] === undefined);
    expect(
      untranslated,
      'gói phát nhãn tiếng Anh chưa có trong ARIA_LABEL_VI ⇒ nó sẽ đi thẳng vào cây a11y. ' +
        'Thêm bản dịch vào bảng ở search-tabs.tsx.',
    ).toEqual([]);
  });

  it('CHIỀU XUỐNG — không dòng nào trong sổ đã chết', () => {
    const stale = Object.keys(ARIA_LABEL_VI).filter((label) => !emitted.has(label));
    expect(
      stale,
      'sổ còn khoá mà gói KHÔNG còn phát (đổi chữ, hoặc gói đã bỏ phần tử đó). ' +
        'Xoá dòng — một sổ dịch chứa khoá không tồn tại là chỗ để nhãn mới lọt qua trong im lặng.',
    ).toEqual([]);
  });

  it('mọi bản dịch là tiếng Việt CÓ DẤU, không phải chuỗi ASCII chép lại', () => {
    for (const [english, vietnamese] of Object.entries(ARIA_LABEL_VI)) {
      expect(vietnamese, `${english} chưa được dịch thật`).not.toBe(english);
      expect(vietnamese, `"${vietnamese}" không có ký tự tiếng Việt nào`).toMatch(
        /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i,
      );
    }
  });
});

describe('nhãn tiếng Anh KHÔNG còn sống sót trong DOM', () => {
  it('loại control đang ẩn khỏi bàn phím và trả focus về nút mở khi đóng', async () => {
    const { container } = renderTabs();
    const opener = container.querySelector('.gooey-search-tabs-trigger') as HTMLElement;
    const close = container.querySelector('.gooey-search-tabs-close-content') as HTMLElement;
    const tabs = container.querySelector('[role="tablist"]') as HTMLElement;
    expect(close.hasAttribute('inert')).toBe(true);
    expect(close.getAttribute('aria-hidden')).toBe('true');
    expect(tabs.hasAttribute('inert')).toBe(false);

    fireEvent.click(opener);
    await waitFor(() => {
      expect(tabs.hasAttribute('inert')).toBe(true);
      expect(tabs.getAttribute('aria-hidden')).toBe('true');
      expect(close.hasAttribute('inert')).toBe(false);
      expect(close.hasAttribute('aria-hidden')).toBe(false);
    });
    close.focus();
    fireEvent.click(close);
    await waitFor(() => {
      expect(close.hasAttribute('inert')).toBe(true);
      expect(tabs.hasAttribute('inert')).toBe(false);
      expect(document.activeElement).toBe(opener);
    });
  });

  it('nhãn lúc thu gọn đã được dịch, và bản tiếng Anh biến mất', () => {
    const { container } = renderTabs();
    const labels = [...container.querySelectorAll('[aria-label]')].map((n) =>
      n.getAttribute('aria-label'),
    );
    for (const english of Object.keys(ARIA_LABEL_VI)) {
      expect(labels, `"${english}" còn trong DOM ⇒ effect dịch nhãn không chạy`).not.toContain(
        english,
      );
    }
    // Đối chứng dương: phải có ÍT NHẤT một nhãn đã dịch, nếu không thì khẳng
    // định "không còn tiếng Anh" cũng đúng với một cây rỗng.
    const translated = Object.values(ARIA_LABEL_VI).filter((vi) => labels.includes(vi));
    expect(translated.length, 'không nhãn nào được dịch — cây có thể đang rỗng').toBeGreaterThan(0);
  });

  /**
   * Ô này là ô ĐÃ BẮT ĐƯỢC một lỗi thật, nên nó ở lại đúng hình dạng này.
   *
   * Bản đầu của `SearchTabs` dịch nhãn bằng `useEffect` không mảng phụ thuộc,
   * tin rằng gói render lại thì effect chạy lại. State mở/đóng nằm bên TRONG
   * `GooeySearchTabs`, nên chỉ CON render — `SearchTabs` không, và effect không
   * chạy. Đo được ngay sau một lượt bấm mở:
   *
   *   ["DIV=Tìm", "BUTTON=Search", "INPUT=Search input", "BUTTON=Đóng ô tìm kiếm"]
   *
   * Hai nhãn tiếng Anh sống lại, một nhãn còn tiếng Việt — tức "lượt đầu đúng,
   * lượt sau sai", thứ không lộ ra nếu chỉ kiểm trạng thái ban đầu.
   *
   * `waitFor` là bắt buộc: callback của `MutationObserver` chạy ở microtask,
   * không đồng bộ với `fireEvent`.
   */
  it('sau khi MỞ ô tìm, nhãn mới cũng được dịch (observer bắt cả render của CON)', async () => {
    const { container } = renderTabs();
    const opener = container.querySelector('button[aria-label]') as HTMLElement;
    fireEvent.click(opener);
    await waitFor(() => {
      const labels = [...container.querySelectorAll('[aria-label]')].map((n) =>
        n.getAttribute('aria-label'),
      );
      // Đối chứng dương của chính ô này: ô nhập PHẢI đã mount, nếu không thì
      // "không còn tiếng Anh" cũng đúng với một cây chưa mở.
      expect(container.querySelector('input')).not.toBeNull();
      for (const english of Object.keys(ARIA_LABEL_VI)) {
        expect(
          labels,
          `"${english}" xuất hiện SAU khi mở ⇒ observer không bắt được render của con`,
        ).not.toContain(english);
      }
    });
  });
});
