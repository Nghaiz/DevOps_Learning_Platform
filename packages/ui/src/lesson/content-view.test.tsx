import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ContentBlock } from '@devops-platform/scenario/content-blocks';
import { ContentView } from './content-view.tsx';

/**
 * Test ở đây dùng `fireEvent` + khẳng định trên DOM API thuần. Đó là ĐỦ cho
 * click, không phải một hạn chế.
 *
 * ⚠ Bản đầu của khối chú thích này nói `@testing-library/jest-dom` "không có
 * trong devDependencies" và `userEvent` không typecheck được. Cả hai câu ĐÃ HẾT
 * ĐÚNG trong cùng nhánh: `jest-dom` nay là devDependency và được nạp ở
 * `vitest.setup.ts` (`@testing-library/jest-dom/vitest` — đường `/vitest` là
 * bắt buộc, bản bare đăng ký vào `expect` của Jest và im lặng không gắn matcher
 * nào). `userEvent` dùng được với import CÓ TÊN: `import { userEvent } from
 * '@testing-library/user-event'` — bản default import mới là bản không
 * typecheck dưới `moduleResolution: NodeNext`.
 */

/**
 * jsdom KHÔNG cài `navigator.clipboard` mặc định — phải tự định nghĩa lại
 * trước mỗi test cần copy. `configurable: true` để định nghĩa lại được ở
 * test sau (thành công) so với test trước (thất bại) mà không đụng cấu hình
 * global vĩnh viễn.
 */
function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

const noResolve = (): string | null => null;

describe('ContentView — code block hành động', () => {
  it('nút chạy của block exec gọi onExec đúng lệnh, interrupt=false', () => {
    const onExec = vi.fn();
    const blocks: ContentBlock[] = [
      { kind: 'code', code: 'kubectl get pods', language: null, action: 'exec', inline: false },
    ];

    render(<ContentView blocks={blocks} resolveAssetUrl={noResolve} onExec={onExec} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chạy' }));

    expect(onExec).toHaveBeenCalledTimes(1);
    expect(onExec).toHaveBeenCalledWith('kubectl get pods', false);
  });

  it('nút chạy của block exec-interrupt gọi onExec với interrupt=true', () => {
    const onExec = vi.fn();
    const blocks: ContentBlock[] = [
      { kind: 'code', code: 'tail -f app.log', language: 'bash', action: 'exec-interrupt', inline: false },
    ];

    render(<ContentView blocks={blocks} resolveAssetUrl={noResolve} onExec={onExec} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ngắt & chạy' }));

    expect(onExec).toHaveBeenCalledTimes(1);
    expect(onExec).toHaveBeenCalledWith('tail -f app.log', true);
  });

  it('onExec undefined ⇒ không render nút chạy nào', () => {
    const blocks: ContentBlock[] = [
      { kind: 'code', code: 'kubectl get pods', language: null, action: 'exec', inline: false },
    ];

    render(<ContentView blocks={blocks} resolveAssetUrl={noResolve} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('execEnabled=false ⇒ nút chạy vẫn hiện nhưng bị disable', () => {
    const blocks: ContentBlock[] = [
      { kind: 'code', code: 'kubectl get pods', language: null, action: 'exec', inline: false },
    ];

    render(<ContentView blocks={blocks} resolveAssetUrl={noResolve} onExec={vi.fn()} execEnabled={false} />);

    const button = screen.getByRole('button', { name: 'Chạy' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('title')).not.toBeNull();
  });

  it('nút chép ghi vào clipboard và hiện xác nhận', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const blocks: ContentBlock[] = [
      { kind: 'code', code: 'echo hello', language: null, action: 'copy', inline: false },
    ];

    render(<ContentView blocks={blocks} resolveAssetUrl={noResolve} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chép' }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('echo hello');
    // `writeText` resolve bất đồng bộ (Promise thật, kể cả khi mock) — state
    // "Đã chép" chỉ xuất hiện sau microtask kế tiếp, nên phải chờ bằng
    // `findByRole` thay vì `getByRole` ngay sau click.
    expect(await screen.findByRole('button', { name: 'Đã chép' })).toBeDefined();
  });

  it('clipboard reject ⇒ nút hiện trạng thái lỗi, không nuốt lỗi trong im lặng', async () => {
    stubClipboard(() => Promise.reject(new Error('permission denied')));
    const blocks: ContentBlock[] = [
      { kind: 'code', code: 'echo hello', language: null, action: 'copy', inline: false },
    ];

    render(<ContentView blocks={blocks} resolveAssetUrl={noResolve} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chép' }));

    expect(await screen.findByRole('button', { name: 'Chép thất bại' })).toBeDefined();
  });
});

describe('ContentView — ảnh markdown và CSP', () => {
  it('ảnh tương đối dùng URL từ resolveAssetUrl', () => {
    const blocks: ContentBlock[] = [{ kind: 'markdown', markdown: '![Sơ đồ topology](./assets/topology.png)' }];
    const resolveAssetUrl = vi.fn().mockReturnValue('blob:resolved-topology-url');

    render(<ContentView blocks={blocks} resolveAssetUrl={resolveAssetUrl} />);

    expect(resolveAssetUrl).toHaveBeenCalledTimes(1);
    expect(resolveAssetUrl).toHaveBeenCalledWith('./assets/topology.png');
    const img = screen.getByRole('img', { name: 'Sơ đồ topology' });
    expect(img.getAttribute('src')).toBe('blob:resolved-topology-url');
  });

  it('resolveAssetUrl trả null ⇒ vẽ placeholder, KHÔNG render <img>', () => {
    const blocks: ContentBlock[] = [{ kind: 'markdown', markdown: '![Sơ đồ topology](./assets/missing.png)' }];

    render(<ContentView blocks={blocks} resolveAssetUrl={() => null} />);

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/Không tải được ảnh/)).toBeDefined();
  });

  it('ảnh https tuyệt đối ⇒ placeholder KÈM link, KHÔNG render <img> (CSP img-src self)', () => {
    const remoteUrl = 'https://grafana.com/media/dashboard.png';
    const blocks: ContentBlock[] = [{ kind: 'markdown', markdown: `![Grafana panel](${remoteUrl})` }];

    render(<ContentView blocks={blocks} resolveAssetUrl={noResolve} />);

    expect(screen.queryByRole('img')).toBeNull();
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(remoteUrl);
    expect(link.getAttribute('target')).toBe('_blank');
  });
});

describe('ContentView — markdown thường', () => {
  it('render đoạn văn markdown như một khối, không vỡ nội dung', () => {
    const blocks: ContentBlock[] = [{ kind: 'markdown', markdown: '## Bước 1\n\nCài đặt **kubectl** trước.' }];

    const { container } = render(<ContentView blocks={blocks} resolveAssetUrl={noResolve} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Bước 1' })).toBeDefined();
    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe('kubectl');
  });

  it('placeholder {{TRAFFIC_HOST1_80}} giữ nguyên dạng text — không có tầng thay thế', () => {
    const blocks: ContentBlock[] = [
      { kind: 'markdown', markdown: 'Mở trình duyệt tới {{TRAFFIC_HOST1_80}} để kiểm tra.' },
    ];

    render(<ContentView blocks={blocks} resolveAssetUrl={noResolve} />);

    expect(screen.getByText(/\{\{TRAFFIC_HOST1_80\}\}/)).toBeDefined();
  });
});

/**
 * Cổng cho lỗi axe `scrollable-region-focusable` mức **serious** mà lượt e2e
 * ngày 2026-09-06 bắt được ở CẢ `/lessons/:id` lẫn `/labs/:id`.
 *
 * ⚠ Đây KHÔNG phải một lượt chạy axe. axe quyết định "có cuộn được không" bằng
 * `scrollHeight`/`clientHeight`, mà jsdom trả 0 cho mọi phép đo bố cục — chạy
 * axe ở đây sẽ XANH cả trước lẫn sau bản vá, tức chứng minh đúng con số không
 * (`green-that-proves-nothing`). Cái test này gác BIỆN PHÁP KHẮC PHỤC — ba
 * thuộc tính trên đúng phần tử có `overflow` — chứ không giả vờ gác luật axe.
 * Phép đo thật vẫn là lượt e2e trên cụm.
 *
 * Ba đường render đi qua đây: trang bài học, trang lab, và xem trước của trang
 * soạn bài. Cả ba dùng chung `ContentView`, nên cả ba được vá cùng lúc.
 */
describe('ContentView — vùng cuộn vào được bằng bàn phím', () => {
  function assertScrollRegion(el: Element | null, what: string): void {
    expect(el, `không tìm thấy ${what}`).not.toBeNull();
    expect(el?.getAttribute('tabindex'), `${what} thiếu tabindex ⇒ bàn phím không cuộn được`).toBe('0');
    // `tabIndex` một mình để lại một điểm dừng Tab KHÔNG TÊN. `role="group"`
    // (không phải `region` — xem `scroll-region.ts`) là thứ cho phép `aria-label`
    // mà không tạo landmark trùng tên.
    expect(el?.getAttribute('role'), `${what} thiếu role ⇒ aria-label bị cấm trên vai trò generic`).toBe(
      'group',
    );
    expect((el?.getAttribute('aria-label') ?? '').length, `${what} thiếu aria-label`).toBeGreaterThan(0);
  }

  it('khối mã CÓ hành động (CodeBlock) cuộn được bằng bàn phím', () => {
    const blocks: ContentBlock[] = [
      { kind: 'code', code: 'kubectl get pods -A', language: 'bash', action: 'copy', inline: false },
    ];
    const { container } = render(<ContentView blocks={blocks} resolveAssetUrl={noResolve} />);
    assertScrollRegion(container.querySelector('pre'), 'pre của CodeBlock');
  });

  it('fence markdown THƯỜNG (MarkdownView) cuộn được bằng bàn phím', () => {
    const blocks: ContentBlock[] = [{ kind: 'markdown', markdown: '```\nmot lenh rat dai\n```' }];
    const { container } = render(<ContentView blocks={blocks} resolveAssetUrl={noResolve} />);
    assertScrollRegion(container.querySelector('pre'), 'pre của MarkdownView');
  });

  it('bảng markdown (bọc overflow-x-auto) cuộn được bằng bàn phím', () => {
    const blocks: ContentBlock[] = [
      { kind: 'markdown', markdown: '| Cot A | Cot B |\n| --- | --- |\n| 1 | 2 |' },
    ];
    const { container } = render(<ContentView blocks={blocks} resolveAssetUrl={noResolve} />);
    assertScrollRegion(container.querySelector('div.overflow-x-auto'), 'bọc cuộn của bảng');
  });

  it('nội dung KHÔNG cuộn được thì KHÔNG có tabindex nào — không rải điểm dừng Tab vô nghĩa', () => {
    const blocks: ContentBlock[] = [{ kind: 'markdown', markdown: 'Mot doan van thuong.' }];
    const { container } = render(<ContentView blocks={blocks} resolveAssetUrl={noResolve} />);
    expect(container.querySelectorAll('[tabindex]').length).toBe(0);
  });
});
