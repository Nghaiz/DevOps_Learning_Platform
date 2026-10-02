// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { errText } from '@devops-platform/copy';
import { DraftFormView } from './draft-form-view';
import { emptyDraft } from './draft-form';

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
});
