/**
 * Ghim thứ tự ưu tiên nhãn (19.D.3.5).
 *
 * Bài học chép từ arena: không có bước này thì node khoẻ mạnh chiếm hết 64 chỗ
 * và node đang đỏ — thứ duy nhất người chơi cần đọc tên — bị đẩy ra ngoài. Ô
 * quan trọng nhất dưới đây dựng đúng cảnh đó và khẳng định node đỏ vẫn vào được.
 */
import { describe, expect, it } from 'vitest';
import { STATE_ENCODING, type StageRunState } from '@devops-platform/games';

import {
  MAX_CICD_LABELS,
  MAX_CICD_LABEL_CANDIDATES,
  MAX_LABEL_TEXT,
  PRIORITY_HOVERED,
  PRIORITY_SELECTED,
  isPrimaryLabelPass,
  labelPriority,
  labelText,
  shortenLabel,
} from './label-priority';

const ALL_STATES = Object.keys(STATE_ENCODING) as readonly StageRunState[];

function priorityOf(state: StageRunState): number {
  return labelPriority({ id: 'n', state, selectedId: null, hoveredId: null });
}

describe('labelPriority', () => {
  it('đang chọn và đang rê thắng MỌI trạng thái', () => {
    for (const state of ALL_STATES) {
      expect(labelPriority({ id: 'n', state, selectedId: 'n', hoveredId: null })).toBe(
        PRIORITY_SELECTED,
      );
      expect(labelPriority({ id: 'n', state, selectedId: null, hoveredId: 'n' })).toBe(
        PRIORITY_HOVERED,
      );
      expect(priorityOf(state)).toBeLessThan(PRIORITY_HOVERED);
    }
  });

  it('đang chọn thắng đang rê', () => {
    expect(PRIORITY_SELECTED).toBeGreaterThan(PRIORITY_HOVERED);
  });

  it('xếp thứ tự theo "cần hành động đến mức nào"', () => {
    expect(priorityOf('failed')).toBeGreaterThan(priorityOf('retrying'));
    expect(priorityOf('retrying')).toBeGreaterThan(priorityOf('running'));
    expect(priorityOf('running')).toBeGreaterThan(priorityOf('queued'));
    expect(priorityOf('queued')).toBeGreaterThan(priorityOf('skipped'));
    expect(priorityOf('skipped')).toBeGreaterThan(priorityOf('passed'));
    expect(priorityOf('passed')).toBeGreaterThan(priorityOf('pending'));
  });

  it('cho mọi trạng thái một điểm hữu hạn — không trạng thái nào rơi ra ngoài bảng', () => {
    for (const state of ALL_STATES) {
      expect(Number.isFinite(priorityOf(state))).toBe(true);
    }
  });
});

describe('isPrimaryLabelPass', () => {
  it('node đỏ vào lượt đầu kể cả khi bị 200 node đã-xong vây quanh', () => {
    const crowd: StageRunState[] = Array.from({ length: 200 }, () => 'passed');
    const primary = [...crowd, 'failed' as StageRunState].filter((state, index) =>
      isPrimaryLabelPass({
        id: `n${index}`,
        state,
        selectedId: null,
        hoveredId: null,
      }),
    );
    expect(primary).toEqual(['failed']);
  });

  it('bốn trạng thái đòi hành động đều ở lượt đầu', () => {
    for (const state of ['failed', 'running', 'retrying', 'queued'] as const) {
      expect(isPrimaryLabelPass({ id: 'n', state, selectedId: null, hoveredId: null })).toBe(true);
    }
  });

  it('ba trạng thái còn lại ở lượt sau', () => {
    for (const state of ['passed', 'pending', 'skipped'] as const) {
      expect(isPrimaryLabelPass({ id: 'n', state, selectedId: null, hoveredId: null })).toBe(false);
    }
  });

  it('node đang chọn vào lượt đầu dù trạng thái nào', () => {
    expect(isPrimaryLabelPass({ id: 'n', state: 'passed', selectedId: 'n', hoveredId: null })).toBe(
      true,
    );
  });
});

describe('trần nhãn', () => {
  it('trần ứng viên rộng hơn trần hiển thị — bước giãn cần chỗ để lựa', () => {
    expect(MAX_CICD_LABEL_CANDIDATES).toBeGreaterThan(MAX_CICD_LABELS);
  });

  it('trần hiển thị đúng 64 như kế hoạch D.3.5 chốt', () => {
    expect(MAX_CICD_LABELS).toBe(64);
  });
});

describe('shortenLabel', () => {
  it('giữ nguyên chuỗi đủ ngắn', () => {
    expect(shortenLabel('build')).toBe('build');
  });

  it('cắt và đánh dấu đã cắt', () => {
    const long = 'a'.repeat(MAX_LABEL_TEXT + 10);
    const short = shortenLabel(long);
    expect(short).toHaveLength(MAX_LABEL_TEXT);
    expect(short.endsWith('…')).toBe(true);
  });

  it('không cắt đúng ở ngưỡng', () => {
    const exact = 'a'.repeat(MAX_LABEL_TEXT);
    expect(shortenLabel(exact)).toBe(exact);
  });
});

describe('labelText', () => {
  it('đặt icon TRƯỚC tên — kênh duy nhất còn đọc được ở thang xám, không chuyển động', () => {
    expect(labelText(STATE_ENCODING.failed.icon, 'test')).toBe(
      `${STATE_ENCODING.failed.icon} test`,
    );
  });

  it('mỗi trạng thái cho một chữ đầu khác nhau', () => {
    const icons = new Set(ALL_STATES.map((state) => STATE_ENCODING[state].icon));
    expect(icons.size).toBe(ALL_STATES.length);
  });
});
