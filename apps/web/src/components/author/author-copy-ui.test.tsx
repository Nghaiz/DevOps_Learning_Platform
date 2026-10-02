// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { errText } from '@devops-platform/copy';
import { DraftFormView } from './draft-form-view';
import { emptyDraft, emptyStep } from './draft-form';

afterEach(cleanup);

describe('author fields after copy migration', () => {
  it.each(['lesson', 'lab', 'playground'] as const)(
    'keeps %s labels, errors and edits connected',
    (kind) => {
      const change = vi.fn();
      const message = errText('author.draft-form-tieu-de-khong-duoc-de-trong');
      render(
        <DraftFormView
          kind={kind}
          value={emptyDraft()}
          onChange={change}
          issues={[{ path: 'title', message }]}
          nextKey={() => 'new-step'}
        />,
      );

      const title = screen.getByRole('textbox', { name: 'Tiêu đề' });
      expect(title.getAttribute('aria-invalid')).toBe('true');
      const errorId = title.getAttribute('aria-describedby')?.split(' ').at(-1);
      expect(
        errorId === undefined ? undefined : document.getElementById(errorId)?.textContent,
      ).toBe(message);
      // Cột kiểm bên phải tìm ô theo `data-field-path`: mất thuộc tính này là bấm
      // vào lỗi "Tiêu đề" không đưa focus về đâu cả.
      expect(title.closest('[data-field-path]')?.getAttribute('data-field-path')).toBe('title');
      fireEvent.change(title, { target: { value: 'Kiểm tra tiến trình' } });
      expect(change).toHaveBeenLastCalledWith(
        expect.objectContaining({ title: 'Kiểm tra tiến trình' }),
      );
      expect(document.body.textContent).not.toMatch(/(?:author|problem)\.[a-z]/);
    },
  );

  /*
    Hai ô dưới ghim đúng mỏ neo e2e dùng (`e2e/flows/author.flow.spec.ts`): vùng
    tên `Bước 1` / `Task 1`, ba nhãn bên trong, và đường dữ liệu theo vị trí
    0-based mà `toDraftInput` dùng cho lỗi. Đổi một trong ba là e2e mất dấu ô.
  */
  it('names a lesson step region "Bước 1" with its fields and issue paths', () => {
    render(
      <DraftFormView
        kind="lesson"
        value={{ ...emptyDraft(), steps: [emptyStep('a'), emptyStep('b')] }}
        onChange={vi.fn()}
        issues={[]}
        nextKey={() => 'new-step'}
      />,
    );

    const step = screen.getByRole('region', { name: 'Bước 1' });
    expect(within(step).getByLabelText('Tiêu đề')).toBeTruthy();
    expect(within(step).getByLabelText('Nội dung (Markdown)')).toBeTruthy();
    const verify = within(step).getByLabelText('Script chấm');
    expect(verify.closest('[data-field-path]')?.getAttribute('data-field-path')).toBe('steps[0].verifyScript');
    const second = screen.getByRole('region', { name: 'Bước 2' });
    expect(
      within(second).getByLabelText('Tiêu đề').closest('[data-field-path]')?.getAttribute('data-field-path'),
    ).toBe('steps[1].title');
    expect(screen.getByRole('button', { name: 'Thêm bước' })).toBeTruthy();
  });

  it('keeps the lab task heading and task[N] paths', () => {
    const message = errText('author.draft-form-id-task-khong-hop-le');
    render(
      <DraftFormView
        kind="lab"
        value={{ ...emptyDraft(), steps: [emptyStep('a')] }}
        onChange={vi.fn()}
        issues={[{ path: 'task[0].taskId', message }]}
        nextKey={() => 'new-step'}
      />,
    );

    const task = screen.getByRole('region', { name: 'Task 1' });
    const taskId = within(task).getByRole('textbox', { name: 'Id task' });
    expect(taskId.getAttribute('aria-invalid')).toBe('true');
    expect(taskId.closest('[data-field-path]')?.getAttribute('data-field-path')).toBe('task[0].taskId');
  });
});
