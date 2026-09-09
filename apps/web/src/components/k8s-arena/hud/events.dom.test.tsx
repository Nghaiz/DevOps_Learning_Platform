// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { EventView, ObjectView } from '@devops-platform/games';
import { EventLog } from './event-log.tsx';
import { InspectorEvents } from './inspector-events.tsx';
import { IncidentsPanel } from './incidents-panel.tsx';

afterEach(cleanup);
const events: readonly EventView[] = [
  { tick: 1, level: 'info', message: 'Pod đã khởi động', involvedUid: 'pod-1' },
  { tick: 2, level: 'warning', message: 'Pod thiếu bộ nhớ', involvedUid: 'pod-1' },
  { tick: 3, level: 'error', message: 'Không tải được image', involvedUid: 'pod-1' },
];

describe('learner event history', () => {
  it('shows newest first and combines severity with text search', () => {
    render(<InspectorEvents events={events} tick={6} />);
    const list = screen.getByRole('list', { name: 'Sự kiện của tài nguyên' });
    expect(within(list).getAllByRole('listitem')[0]?.textContent).toContain('Không tải được image');
    fireEvent.click(screen.getByRole('button', { name: 'Cảnh báo 1' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list.textContent).toContain('Pod thiếu bộ nhớ');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'image' } });
    expect(list.textContent).toContain('Không có sự kiện phù hợp');
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả 3' }));
    expect(list.textContent).toContain('Không tải được image');
    expect(list.textContent).not.toContain('Pod đã khởi động');
  });

  it('keeps the newest 60 entries without a second live region', () => {
    const many = Array.from({ length: 65 }, (_, tick) => ({
      ...events[0]!,
      tick,
      message: `Hoạt động ${tick}`,
    }));
    const { container, rerender } = render(<EventLog events={many} onClose={() => {}} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(60);
    expect(screen.queryByText('Hoạt động 0')).toBeNull();
    rerender(
      <EventLog
        events={[...many, { ...many[0]!, tick: 65, message: 'Mới nhất' }]}
        onClose={() => {}}
      />,
    );
    expect(screen.getAllByRole('listitem')[0]?.textContent).toContain('Mới nhất');
    expect(container.querySelector('[role="log"], [aria-live]')).toBeNull();
  });

  it('focuses existing incident resources and explains removed resources', () => {
    const onSelect = vi.fn();
    render(
      <IncidentsPanel
        incidents={[
          { kind: 'node-het-memory', targetUid: 'node-1', startedTick: 2, resolvedTick: null },
          { kind: 'thieu-secret', targetUid: 'gone', startedTick: 1, resolvedTick: 4 },
        ]}
        objects={[{ uid: 'node-1', name: 'worker-1', kind: 'Node' } as ObjectView]}
        tick={8}
        onSelect={onSelect}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xem tài nguyên' }));
    expect(onSelect).toHaveBeenCalledWith('node-1');
    fireEvent.click(screen.getByRole('button', { name: 'Đã xử lý 1' }));
    expect(screen.getByText('Tài nguyên đã bị xoá')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xem tài nguyên' })).toBeNull();
  });
});
