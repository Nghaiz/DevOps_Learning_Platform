// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { RunRecord, StageNodeView } from '@devops-platform/games';

import { CicdInspector } from './cicd-inspector.tsx';

/**
 * Bảng thông số job (19.D.4.5).
 *
 * Ô ở đây đo đúng một điều, và đó là điều duy nhất bảng này tồn tại để làm:
 * **nó đọc `StageInstanceRecord`, không đọc lại `StageNodeView`**. Bốn số của
 * D.4.5 — thời lượng, chờ máy, số lần thử, nguyên nhân đỏ — không có cái nào nằm
 * trong view; một bản dựng lại chỉ đọc view sẽ vẫn render đẹp và vẫn thiếu sạch
 * bốn thứ đó.
 */

afterEach(cleanup);

const NODE: StageNodeView = {
  instance: 'test#node20',
  stageId: 'test',
  kind: 'test',
  name: 'test (node20)',
  state: 'failed',
  attempt: 1,
  readyTick: 10,
  startedTick: 14,
  finishedTick: 20,
  cacheHit: false,
  environment: null,
  statusToken: 'destructive',
  ariaLabel: 'test (node20): đỏ',
} as StageNodeView;

/** Một `RunRecord` tối thiểu — chỉ thực thể đang chọn. */
const RUN = {
  commitId: 'c1',
  arrivalTick: 0,
  finishedTick: 20,
  changedInputs: [],
  instances: [
    {
      instance: 'test#node20',
      stageId: 'test',
      fanOutIndex: 0,
      readyTick: 10,
      // Chờ máy 4 tick = 40 giây.
      startedTick: 14,
      finishedTick: 20,
      blockedBy: { kind: 'dependency', instance: 'build' },
      runnerTicks: 12,
      suppliers: [],
      attempts: [
        {
          attempt: 0,
          startedTick: 14,
          finishedTick: 17,
          outcome: 'failed',
          cause: { kind: 'stale-cache', cache: 'npm', step: 'cai-dat' },
          failedStep: 'cai-dat',
          steps: [
            { id: 'cai-dat', durationTicks: 3, outcome: 'failed', cacheHit: true, flakeNature: null },
          ],
        },
        {
          attempt: 1,
          startedTick: 17,
          finishedTick: 20,
          outcome: 'failed',
          cause: { kind: 'stale-cache', cache: 'npm', step: 'cai-dat' },
          failedStep: 'cai-dat',
          steps: [
            { id: 'cai-dat', durationTicks: 3, outcome: 'failed', cacheHit: true, flakeNature: null },
          ],
        },
      ],
    },
  ],
} as unknown as RunRecord;

describe('bảng thông số job', () => {
  it('đọc bốn số của D.4.5 từ bản ghi, không từ view', () => {
    render(<CicdInspector node={NODE} run={RUN} selectedId="test#node20" />);

    // Thời lượng = finished − started = 6 tick × 10 giây.
    expect(screen.getByText('1m')).toBeTruthy();
    // Chờ máy = started − ready = 4 tick × 10 giây. Không có trong view.
    expect(screen.getByText('40s')).toBeTruthy();
    // Số lần thử: hai — và nói rõ là CÓ thử lại.
    expect(screen.getByText(/2 \(có thử lại\)/)).toBeTruthy();
    // Chờ AI, không chỉ "có chờ". `blockedBy` không suy ra được từ hai tick.
    expect(screen.getByText(/Chờ "build" xong/)).toBeTruthy();
  });

  it('nguyên nhân đỏ nói CẢ HAI sự thật của cache ôi', () => {
    render(<CicdInspector node={NODE} run={RUN} selectedId="test#node20" />);
    const text = screen.getByText(/Trúng khoá cache/).textContent ?? '';
    // Khoá vẫn trúng…
    expect(text).toContain('Trúng khoá cache');
    // …nhưng nội dung ôi. Thiếu vế này thì người chơi đi nới khoá — sai chiều.
    expect(text).toContain('ôi');
    expect(text).toContain('quá hẹp');
  });

  it('chưa chạy lượt nào thì nói ra, không vẽ một bảng đầy dấu gạch', () => {
    render(<CicdInspector node={NODE} run={null} selectedId="test#node20" />);
    expect(screen.getByText(/Chưa có số liệu cho job này/)).toBeTruthy();
    expect(screen.queryByText(/Chờ máy/)).toBeNull();
  });

  it('chưa chọn gì thì chỉ đường chọn bằng bàn phím', () => {
    render(<CicdInspector node={null} run={RUN} selectedId={null} />);
    expect(screen.getByText(/phím Tab/)).toBeTruthy();
  });
});
