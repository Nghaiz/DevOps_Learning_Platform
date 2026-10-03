// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { t } from '@devops-platform/copy';
import type { FieldIssue } from './cluster-form';
import { ProblemEditor } from './problem-editor';
import { emptyForm } from './problem-form';

/**
 * Bất biến của trình soạn đề sau lượt dựng lại trên khung Xưởng soạn.
 *
 * Ô đầu chuyển từ `components/author/author-copy-ui.test.tsx` (khối
 * ProblemEditor): nhãn đi qua bản đồ chữ, ô Tên bài sửa được cả tên lẫn slug,
 * hai chế độ Cụm ban đầu và Mục tiêu mở ra đúng ô của chúng, và không khoá bản
 * đồ nào lọt ra màn hình. Ô thứ hai gác phần mới: một lỗi hiện CẠNH ô sinh ra
 * nó (nối bằng `aria-describedby`) VÀ trong cột kiểm dưới TÊN Ô người đọc được.
 */

afterEach(cleanup);

function renderEditor(onChange = vi.fn(), issues: readonly FieldIssue[] = []): void {
  let next = 0;
  const key = (): string => `key-${String(++next)}`;
  render(
    <ProblemEditor
      form={emptyForm(key)}
      onChange={onChange}
      nextKey={key}
      code={null}
      state="draft"
      title={t('author.problem.new.title')}
      issues={issues}
      saveStatus="new"
      toolbar={() => null}
      readiness={() => null}
    />,
  );
}

describe('trinh soan de tren khung xuong soan', () => {
  it('nhan, slug, cum ban dau va muc tieu di qua thao tac that', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    renderEditor(change);

    fireEvent.change(screen.getByRole('textbox', { name: 'Tên bài' }), { target: { value: 'Sửa Pod' } });
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Sửa Pod', slug: 'sua-pod' }));
    expect(screen.getByRole('checkbox', { name: 'Lập lịch' })).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: 'Cụm ban đầu' }));
    expect(screen.getByRole('textbox', { name: 'Nhãn' }).getAttribute('placeholder')).toBe('disktype=ssd\nzone=a');

    await user.click(screen.getByRole('tab', { name: /Mục tiêu/ }));
    expect(screen.getByRole('textbox', { name: /Nhãn tiếng Việt/ })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/(?:author|problem)\.[a-z]/);
  });

  it('loi hien canh o va trong cot kiem duoi ten o nguoi doc duoc', () => {
    const message = 'Bài phải có tên';
    renderEditor(vi.fn(), [{ path: 'title', message }]);

    // Cạnh ô: câu lỗi là mục CUỐI của `aria-describedby`, và ô báo `aria-invalid`.
    const title = screen.getByRole('textbox', { name: 'Tên bài' });
    expect(title.getAttribute('aria-invalid')).toBe('true');
    const errorId = title.getAttribute('aria-describedby')?.split(' ').at(-1);
    expect(errorId === undefined ? null : document.getElementById(errorId)?.textContent).toBe(message);

    // Trong cột kiểm: một nút mang TÊN Ô ("Tên bài"), không phải đường dữ liệu.
    const rail = screen.getByRole('complementary', { name: t('author.studio.rail.label') });
    const jump = within(rail).getByRole('button', { name: /Tên bài/ });
    expect(jump.textContent).toContain(message);
    expect(rail.textContent).not.toContain('title');
  });
});
