'use client';

import { useEffect, useRef, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { GooeySearchTabs } from 'gooey-search-tabs';
import 'gooey-search-tabs/styles.css';
import { cn } from './cn.ts';

export interface SearchTabItem {
  /** Khoá định danh, trả về nguyên văn qua `onTabChange`. */
  readonly value: string;
  /** Nhãn hiện ra. Tiếng Việt, đi qua `packages/copy` ở phía nơi gọi. */
  readonly label: string;
  /** Icon TRANG TRÍ đứng trước nhãn — node truyền vào tự mang `aria-hidden`. */
  readonly icon?: ReactNode;
}

export interface SearchTabsProps {
  readonly tabs: readonly SearchTabItem[];
  /** Tab đang chọn (có kiểm soát). Bỏ trống ⇒ dùng `defaultActiveTab`. */
  readonly activeTab?: string;
  readonly defaultActiveTab?: string;
  readonly onTabChange?: (value: string) => void;
  /** Người dùng bấm Enter trong ô tìm. */
  readonly onSearch?: (value: string) => void;
  /** Mỗi lần gõ. Đổi tên khỏi `onChange` của gói ngoài để không lẫn với `onChange` của DOM. */
  readonly onSearchChange?: (value: string) => void;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly placeholder?: string;
  /**
   * Tên vùng tìm kiếm cho trình đọc màn hình — BẮT BUỘC, và bắt buộc là tiếng
   * Việt. Năm trang danh mục đều có một vùng `role="search"`, nên không đặt tên
   * thì cây hỗ trợ tiếp cận có năm vùng "search" không phân biệt được.
   */
  readonly label: string;
  readonly className?: string;
}

/**
 * Vỏ bọc `gooey-search-tabs@0.2.0` — 5 trang danh mục đi qua đây, không import
 * thẳng gói ngoài (`p16-tokens.md` không có token nào cho gói này, và
 * `phase-16.md` 16.A.5 đặt seam ở đúng chỗ này).
 *
 * ── Vì sao màu đi bằng inline style chứ không bằng class ───────────────────
 * Gói này lái toàn bộ màu qua mười biến CSS `--gst-*` khai trên
 * `.gooey-search-tabs-wrapper`, với giá trị mặc định là hex CỨNG (`#ffffff`,
 * `#374151`, `#6366f1`, …) cộng một khối `[data-theme=dark]` do prop `theme`
 * bật. Hai cách bịt, và chỉ một cách đúng:
 *
 *   • lái prop `theme` theo theme của ta  ⇒ vẫn là bảng màu CỦA HỌ, chỉ là
 *     bảng tối thay bảng sáng. Xanh tím `#6366f1` của vòng focus vẫn còn.
 *   • ghi đè mười biến bằng token của ta ⇒ gói không còn quyết định màu nào.
 *
 * Ghi đè phải là INLINE STYLE, không phải một class Tailwind: luật của gói nằm
 * trên `.gooey-search-tabs-wrapper` (độ đặc hiệu 0,1,0) đúng bằng độ đặc hiệu
 * của một class tiện ích, nên ai thắng lại phụ thuộc thứ tự nguồn giữa
 * stylesheet của gói và layer của Tailwind — một thứ không khai báo được ở đây
 * và sẽ trôi khi Next đổi thứ tự chunk. Inline style thắng vô điều kiện.
 *
 * `font-family` cũng vậy: gói ghim một stack `-apple-system, …` KHÔNG có Be
 * Vietnam Pro, nên chữ trong ô tìm sẽ khác chữ của cả trang — và với tiếng
 * Việt thì khác font còn kéo theo khác cách dựng dấu.
 */
const TOKEN_VARS: Readonly<Record<string, string>> = {
  // Mặt nổi của thanh tìm: cùng bậc với `Card` (§1.4 `--card`), viền lo bởi
  // `--gst-shadow` bên dưới vì gói không có biến viền riêng.
  '--gst-bg': 'var(--card)',
  '--gst-bridge-bg': 'var(--card)',
  '--gst-text': 'var(--muted-foreground)',
  '--gst-input-text': 'var(--foreground)',
  '--gst-placeholder': 'var(--muted-foreground)',
  // §6 bậc 1 — thanh tìm là một mặt nổi LÚC NGHỈ, không phải popover.
  '--gst-shadow': 'var(--elevation-1)',
  '--gst-hover': 'var(--accent)',
  '--gst-focus-ring': 'var(--ring)',
  '--gst-tab-indicator-bg': 'var(--muted)',
  '--gst-tab-active-text': 'var(--foreground)',
  fontFamily: 'var(--font-sans)',
};

/**
 * Nhãn hỗ trợ tiếp cận của gói ngoài là TIẾNG ANH CỨNG, và gói KHÔNG có prop
 * nào đổi chúng (đọc `dist/index.js@0.2.0`: bốn chuỗi dưới đây là literal).
 * Một sản phẩm tiếng Việt để cây a11y đọc "Open search" là một khiếm khuyết
 * thật, không phải chuyện thẩm mỹ — và nó nhân lên năm lần vì năm trang danh
 * mục cùng dùng.
 *
 * Vì vậy vỏ bọc dịch chúng sau khi render. Bảng này được gác HAI CHIỀU ở
 * `search-tabs.test.tsx`: nó đọc chính `dist/index.js` của bản đang cài và đòi
 * tập chuỗi tiếng Anh ở đó KHỚP TUYỆT ĐỐI với các khoá dưới đây. Gói đổi chữ
 * hoặc thêm nhãn mới ⇒ test ĐỎ, thay vì một nhãn tiếng Anh lặng lẽ sống lại.
 */
export const ARIA_LABEL_VI: Readonly<Record<string, string>> = {
  Search: 'Tìm kiếm',
  'Open search': 'Mở ô tìm kiếm',
  'Close search': 'Đóng ô tìm kiếm',
  'Search input': 'Ô nhập từ khoá',
};

export function SearchTabs(props: SearchTabsProps): ReactElement {
  const {
    tabs,
    activeTab,
    defaultActiveTab,
    onTabChange,
    onSearch,
    onSearchChange,
    value,
    defaultValue,
    placeholder,
    label,
    className,
  } = props;
  const host = useRef<HTMLDivElement>(null);

  /*
   * `MutationObserver`, KHÔNG phải một effect chạy mỗi lượt render.
   *
   * ⚠ Bản đầu dùng `useEffect` không mảng phụ thuộc, với lập luận "gói render
   * lại mỗi lần mở/đóng nên effect chạy lại theo". Lập luận đó SAI, và
   * `search-tabs.test.tsx` bắt được: state mở/đóng nằm bên TRONG
   * `GooeySearchTabs`, nên khi nó đổi thì chỉ CON render lại — `SearchTabs`
   * không render, và effect của `SearchTabs` không chạy.
   *
   * Đo được sau một lượt bấm mở (bản cũ):
   *   ["DIV=Tìm", "BUTTON=Search", "INPUT=Search input", "BUTTON=Đóng ô tìm kiếm"]
   *
   * Nút đóng còn tiếng Việt vì React KHÔNG ghi lại thuộc tính khi giá trị ảo
   * của nó không đổi — bản dịch lượt đầu sống sót. Nút bật/tắt thì có
   * (`expanded ? "Search" : "Open search"`), nên nó bị ghi đè về tiếng Anh; và
   * ô nhập là phần tử MỚI mount. Tức lượt đầu đúng, mọi lượt sau sai — đúng
   * hình dạng hỏng-im-lặng mà chú thích cũ tuyên bố đã chặn.
   *
   * Observer không tự lặp vô hạn: lượt ghi của ta kích hoạt callback thêm một
   * lần, lần đó thấy giá trị hiện tại KHÔNG còn là khoá trong bảng nên không
   * ghi gì, và chuỗi dừng sau đúng một vòng thừa.
   */
  useEffect(() => {
    const root = host.current;
    if (root === null) return;

    const translate = (): void => {
      for (const node of root.querySelectorAll('[aria-label]')) {
        const current = node.getAttribute('aria-label');
        if (current === null) continue;
        const translated = ARIA_LABEL_VI[current];
        if (translated !== undefined) node.setAttribute('aria-label', translated);
      }
      /*
       * Tên của vùng `role="search"` đặt ở ĐÂY chứ không phải bằng một
       * `role="search"` thứ hai trên vỏ bọc: gói đã tự render một vùng như vậy,
       * và hai landmark search lồng nhau là một khiếm khuyết a11y thật (axe
       * `landmark-unique`), không phải một lớp bảo hiểm.
       */
      const searchRegion = root.querySelector('[role="search"]');
      if (searchRegion !== null && searchRegion.getAttribute('aria-label') !== label) {
        searchRegion.setAttribute('aria-label', label);
      }
      // The vendor fades both panels but leaves their buttons in the Tab order.
      // Opacity and pointer-events do not hide controls from keyboard or AT.
      const expanded = searchRegion?.getAttribute('data-expanded') === 'true';
      for (const [selector, inactive] of [
        ['.gooey-search-tabs-tabs-content', expanded],
        ['.gooey-search-tabs-close-content', !expanded],
        ['.gooey-search-tabs-input-wrapper', !expanded],
      ] as const) {
        const panel = root.querySelector<HTMLElement>(selector);
        if (!panel) continue;
        if (inactive && panel.contains(document.activeElement)) {
          root
            .querySelector<HTMLElement>(expanded ? 'input' : '.gooey-search-tabs-trigger')
            ?.focus();
        }
        panel.toggleAttribute('inert', inactive);
        if (inactive) panel.setAttribute('aria-hidden', 'true');
        else panel.removeAttribute('aria-hidden');
      }
    };

    translate();
    const observer = new MutationObserver(translate);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-label', 'data-expanded'],
    });
    return () => {
      observer.disconnect();
    };
  }, [label]);

  return (
    <div
      ref={host}
      data-slot="search-tabs"
      style={TOKEN_VARS as CSSProperties}
      className={cn('inline-flex', className)}
    >
      <GooeySearchTabs
        tabs={tabs.map((tab) =>
          tab.icon === undefined
            ? { value: tab.value, label: tab.label }
            : { value: tab.value, label: tab.label, icon: tab.icon },
        )}
        {...(activeTab === undefined ? {} : { activeTab })}
        {...(defaultActiveTab === undefined ? {} : { defaultActiveTab })}
        {...(onTabChange === undefined ? {} : { onTabChange })}
        {...(onSearch === undefined ? {} : { onSearch })}
        {...(onSearchChange === undefined ? {} : { onChange: onSearchChange })}
        {...(value === undefined ? {} : { value })}
        {...(defaultValue === undefined ? {} : { defaultValue })}
        {...(placeholder === undefined ? {} : { placeholder })}
      />
    </div>
  );
}
