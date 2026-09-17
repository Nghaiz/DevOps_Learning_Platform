// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { CicdAxesPanel } from './cicd-axes-panel.tsx';
import { CICD_SCENE_TESTIDS } from '../scene-props.ts';
import type { CicdRunOutcome } from '../cicd-run.ts';

/**
 * Bảng ba trục — 19.E.4 là hợp đồng: **ba số hiện CÙNG LÚC, không sau nút**.
 *
 * ⚠ Ô quan trọng nhất ở đây không phải "ba số đúng" mà là "ba số cùng hiện, và
 * KHÔNG có nút nào trong bảng". Một bản dựng lại vô tình gói một trục vào
 * accordion sẽ vẫn qua mọi ô kiểm giá trị — và làm hỏng đúng bài học mà ba trục
 * tồn tại để dạy (chúng đánh đổi lẫn nhau, nên phải thấy trong cùng một cái
 * liếc).
 */

afterEach(cleanup);

/** Một outcome `scored` tối thiểu — chỉ ba trục là thứ bảng này đọc. */
function scored(): CicdRunOutcome {
  return {
    kind: 'scored',
    workflow: { name: 'w', stages: [] },
    record: { baseSeed: 1, error: null, passes: [] },
    axes: { leadTimeSeconds: 125, throughputPerHour: 7.5, runnerMinutes: 12.25, greenRate: 0.8 },
    summary: {},
    failingRequired: [],
    failingOptional: [],
    cd: null,
    won: true,
  } as unknown as CicdRunOutcome;
}

describe('bảng ba trục', () => {
  it('hiện đủ ba trục cùng lúc, không nút nào che', () => {
    render(<CicdAxesPanel outcome={scored()} />);
    const panel = screen.getByTestId(CICD_SCENE_TESTIDS.axesPanel);

    expect(within(panel).getByText(/Lead time/)).toBeTruthy();
    expect(within(panel).getByText(/Thông lượng/)).toBeTruthy();
    expect(within(panel).getByText(/Runner-phút/)).toBeTruthy();

    expect(within(panel).getByText('2m 5s')).toBeTruthy();
    expect(within(panel).getByText('7.5')).toBeTruthy();
    expect(within(panel).getByText('12.3')).toBeTruthy();

    /*
     * Không `<button>` nào trong bảng. Đây là vế "không giấu sau nút" của hợp
     * đồng, và là thứ duy nhất ở ô này mà một bản dựng lại có thể phá mà vẫn
     * giữ đúng ba con số.
     */
    expect(within(panel).queryAllByRole('button')).toHaveLength(0);
    expect(within(panel).queryAllByRole('tab')).toHaveLength(0);
  });

  it('chưa chạy lượt nào vẫn giữ đủ ba ô, và KHÔNG vẽ số 0', () => {
    render(<CicdAxesPanel outcome={null} />);
    const panel = screen.getByTestId(CICD_SCENE_TESTIDS.axesPanel);

    // Ba ô vẫn ở đúng chỗ — bảng không mọc ra sau lượt chạy đầu tiên.
    expect(within(panel).getAllByText('—')).toHaveLength(3);
    /*
     * `0 giây / 0 runner-phút` đọc ra thành "cực nhanh, chẳng tốn gì". Cùng lý
     * lẽ khiến `cicd-run.ts` tách bốn nhánh lỗi ra khỏi `scored`.
     */
    expect(within(panel).queryByText('0.0')).toBeNull();
    expect(within(panel).getByText(/Chưa chạy lượt nào/)).toBeTruthy();
  });

  it('đồ thị hỏng thì nói ra, thay vì hiện ba số bịa', () => {
    render(
      <CicdAxesPanel
        outcome={{ kind: 'engine-error', error: null, workflow: {} as never }}
      />,
    );
    const panel = screen.getByTestId(CICD_SCENE_TESTIDS.axesPanel);
    expect(within(panel).getByText(/không chạy được/)).toBeTruthy();
    expect(within(panel).getAllByText('—')).toHaveLength(3);
  });
});
