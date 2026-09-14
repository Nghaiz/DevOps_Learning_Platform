// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TerminalPanel } from './terminal-panel';
import { podView } from '../shared/test-fixtures';

afterEach(cleanup);
const objects = [podView('p', 'web')];
const listObjects = () => objects;

describe('terminal interaction', () => {
  it('keeps the shell mounted while closing so the exit transition can finish', () => {
    const props = { onClose: vi.fn(), onRun: vi.fn(() => 'Running'), listObjects, insert: null };
    const { rerender, container } = render(<TerminalPanel {...props} open />);
    const shell = container.querySelector('section')!;
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'kubectl get pods' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(props.onRun).toHaveBeenCalledTimes(1);
    rerender(<TerminalPanel {...props} open={false} />);
    expect(container.querySelector('section')).toBe(shell);
    expect(shell.getAttribute('data-open')).toBe('false');
    expect(shell.hasAttribute('inert')).toBe(true);
    rerender(<TerminalPanel {...props} open />);
    expect(screen.getByText('Running')).toBeTruthy();
  });
  it('completes with Tab, executes only on Enter, and recalls history', () => {
    const onRun = vi.fn(() => 'Running');
    render(
      <TerminalPanel
        open
        onClose={vi.fn()}
        onRun={onRun}
        listObjects={listObjects}
        insert={null}
      />,
    );
    const input = screen.getByRole('combobox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'kubectl get po' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input.value).toBe('kubectl get pods ');
    expect(onRun).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'ArrowUp', altKey: true });
    expect(input.value).toBe('kubectl get pods');
  });
});
