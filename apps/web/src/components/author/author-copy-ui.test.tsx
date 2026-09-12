// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { errText } from '@devops-platform/copy';
import { DraftFormView } from './draft-form-view';
import { emptyDraft } from './draft-form';
import { ProblemEditor } from '../../app/author/problems/problem-editor';
import { emptyForm } from '../../app/author/problems/problem-form';

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
      fireEvent.change(title, { target: { value: 'Kiểm tra tiến trình' } });
      expect(change).toHaveBeenLastCalledWith(
        expect.objectContaining({ title: 'Kiểm tra tiến trình' }),
      );
      expect(document.body.textContent).not.toMatch(/(?:author|problem)\.[a-z]/);
    },
  );

  it('renders problem metadata, cluster and objective labels through real tab interactions', async () => {
    const user = userEvent.setup();
    let next = 0;
    const key = (): string => `key-${++next}`;
    const change = vi.fn();
    render(
      <ProblemEditor
        form={emptyForm(key)}
        onChange={change}
        issues={[]}
        code={null}
        state="draft"
        nextKey={key}
        hasUnsavedChanges={false}
        actions={null}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Tên bài' }), {
      target: { value: 'Sửa Pod' },
    });
    expect(change).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Sửa Pod', slug: 'sua-pod' }),
    );
    expect(screen.getByRole('checkbox', { name: 'Lập lịch' })).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Cụm ban đầu' }));
    expect(screen.getByRole('textbox', { name: 'Nhãn' }).getAttribute('placeholder')).toBe(
      'disktype=ssd\nzone=a',
    );
    await user.click(screen.getByRole('tab', { name: /Mục tiêu/ }));
    expect(screen.getByRole('textbox', { name: /Nhãn tiếng Việt/ })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/(?:author|problem)\.[a-z]/);
  });
});
