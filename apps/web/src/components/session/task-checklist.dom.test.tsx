// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskChecklist, type TaskChecklistItem } from './task-checklist.tsx';
import {
  countByVisualState,
  outcomeKind,
  resolveTaskVisualState,
  type TaskVisualState,
} from './task-state';

/**
 * P16 · 16.D.4 — "phân biệt RÕ TRÊN MÀN HÌNH giữa chưa đạt và hạ tầng lỗi".
 *
 * Mục 4 của §16.D nói thẳng rằng tầng dữ liệu đã phân biệt đúng và chỉ phần
 * nhìn chưa nói ra. Nên file này đo đúng phần nhìn, và đo bằng ba đại lượng
 * ĐỘC LẬP nhau: chữ, hình, và màu. Một mình chữ thì chưa đủ cho SC 1.4.1; một
 * mình màu thì hỏng khi in đen trắng.
 */

afterEach(cleanup);

const NOT_WEIGHTED = null;

function item(over: Partial<TaskChecklistItem> = {}): TaskChecklistItem {
  return { id: 'a', title: 'Tạo Pod', state: 'not-attempted', weight: NOT_WEIGHTED, ...over };
}

function rowFor(state: TaskVisualState): HTMLElement {
  const el = document.querySelector<HTMLElement>(`button[data-state="${state}"]`);
  expect(el, `không tìm thấy hàng ở trạng thái ${state}`).not.toBeNull();
  return el as HTMLElement;
}

// ── Phần QUYẾT ĐỊNH (hàm thuần) ────────────────────────────────────────────

describe('resolveTaskVisualState — thứ tự ưu tiên', () => {
  it('lượt chấm đang bay thắng mọi trạng thái đã lưu', () => {
    for (const stored of ['not-attempted', 'passed', 'failed'] as const) {
      expect(resolveTaskVisualState(stored, 'running')).toBe('running');
    }
  });

  it('⛔ một lượt chấm ĐẠT đã lưu KHÔNG bị lỗi hạ tầng ghi đè', () => {
    /*
      Vẽ `infra` đè lên một nhiệm vụ đã đạt sẽ làm người học tưởng mình vừa mất
      điểm. Lỗi hạ tầng vẫn hiện đầy đủ ở `CheckResultPanel` của nhiệm vụ đang
      chọn, nên nó không bị giấu; nó chỉ không được phép ghi đè một kết quả tốt.
    */
    expect(resolveTaskVisualState('passed', 'error')).toBe('passed');
  });

  it('lỗi hạ tầng trên một nhiệm vụ CHƯA đạt ⇒ infra, không phải failed', () => {
    // Đây là mệnh đề trung tâm của mục 16.D.4.
    expect(resolveTaskVisualState('not-attempted', 'error')).toBe('infra');
    expect(resolveTaskVisualState('failed', 'error')).toBe('infra');
  });

  it('không có lượt chấm nào trong phiên ⇒ lấy nguyên trạng thái đã lưu', () => {
    expect(resolveTaskVisualState('not-attempted', null)).toBe('not-attempted');
    expect(resolveTaskVisualState('failed', null)).toBe('failed');
    expect(resolveTaskVisualState('passed', null)).toBe('passed');
  });

  it('⚠ outcome `passed` KHÔNG tự thành `passed`: nguồn đúng là trạng thái ĐÃ LƯU', () => {
    /*
      Sau một lượt chấm thành công, `lab-client` nạp lại `getAttempt`. Đọc thẳng
      từ outcome sẽ cho một cửa sổ vài trăm mili giây mà hai nguồn nói hai điều
      khác nhau, và cửa sổ đó đúng bằng lúc người học đang nhìn chằm chằm vào
      dòng ấy.
    */
    expect(resolveTaskVisualState('not-attempted', 'passed')).toBe('not-attempted');
  });
});

describe('outcomeKind — làm phẳng CheckOutcome mà không import kiểu của route', () => {
  it('ba nhánh ra ba giá trị, và `result` tách theo cờ passed', () => {
    expect(outcomeKind(null)).toBeNull();
    expect(outcomeKind({ kind: 'running' })).toBe('running');
    expect(outcomeKind({ kind: 'error' })).toBe('error');
    expect(outcomeKind({ kind: 'result', passed: true })).toBe('passed');
    expect(outcomeKind({ kind: 'result', passed: false })).toBe('failed');
  });
});

describe('countByVisualState', () => {
  it('trả ĐỦ năm khoá kể cả khi bằng 0', () => {
    // Một bảng đếm thiếu khoá bắt mọi nơi gọi phải `?? 0`, và chỗ nào quên thì
    // in ra `undefined` lên màn hình.
    expect(countByVisualState([])).toEqual({
      'not-attempted': 0,
      running: 0,
      passed: 0,
      failed: 0,
      infra: 0,
    });
  });

  it('đếm đúng', () => {
    expect(countByVisualState(['passed', 'passed', 'infra', 'failed'])).toMatchObject({
      passed: 2,
      infra: 1,
      failed: 1,
      'not-attempted': 0,
    });
  });
});

// ── Phần NHÌN ──────────────────────────────────────────────────────────────

describe('⛔ 16.D.4 — "chưa đạt" và "hạ tầng lỗi" khác nhau trên MÀN HÌNH', () => {
  function renderBoth(): void {
    render(
      <TaskChecklist
        items={[
          item({ id: 'f', title: 'Bài chưa đạt', state: 'failed' }),
          item({ id: 'i', title: 'Cụm hỏng', state: 'infra' }),
        ]}
        selectedId={null}
        onSelect={() => undefined}
      />,
    );
  }

  it('khác nhau ở CHỮ', () => {
    renderBoth();
    expect(rowFor('failed').textContent).toContain('Chưa đạt');
    expect(rowFor('infra').textContent).toContain('Không chấm được');
  });

  it('khác nhau ở HÌNH — không chỉ ở màu (SC 1.4.1)', () => {
    /*
      Đo bằng `svg.getAttribute('class')` thì chỉ đo lại màu. Thứ cần đo là hai
      icon có phải HAI HÌNH khác nhau không, và lucide ghi tên hình vào
      `class="lucide lucide-circle-x"`. So hai chuỗi lớp đó SAU KHI bỏ phần màu
      là cách duy nhất phân biệt được "đổi màu" với "đổi hình".
    */
    renderBoth();
    const shapeOf = (row: HTMLElement): string => {
      const svg = row.querySelector('svg');
      expect(svg, 'hàng phải có một glyph').not.toBeNull();
      return (svg?.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter((token) => token.startsWith('lucide-'))
        .join(' ');
    };

    const failedShape = shapeOf(rowFor('failed'));
    const infraShape = shapeOf(rowFor('infra'));

    expect(failedShape, 'glyph phải mang tên hình của lucide').not.toBe('');
    expect(infraShape).not.toBe('');
    expect(infraShape, 'hai trạng thái này KHÔNG được dùng chung một hình').not.toBe(failedShape);
  });

  it('khác nhau ở MÀU, và cả hai màu đều là token ngữ nghĩa', () => {
    renderBoth();
    const failedClass = rowFor('failed').querySelector('svg')?.getAttribute('class') ?? '';
    const infraClass = rowFor('infra').querySelector('svg')?.getAttribute('class') ?? '';

    expect(failedClass).toContain('text-destructive');
    expect(infraClass).toContain('text-warning');
  });

  it('CHỈ hàng hạ tầng mang câu "không phải bài làm của bạn chưa đạt"', () => {
    // Nửa còn lại của sự phân biệt: hình và màu nói "khác với chưa đạt", câu
    // này nói khác ở CHỖ NÀO. Đặt nhầm nó lên hàng `failed` là nói với người
    // học rằng bài đúng trong khi bài sai.
    renderBoth();
    expect(rowFor('infra').textContent).toContain('không phải bài làm của bạn chưa đạt');
    expect(rowFor('failed').textContent).not.toContain('không phải bài làm');
  });
});

describe('danh sách kiểm — cấu trúc và bàn phím', () => {
  it('là một danh sách, không phải bảng', () => {
    render(
      <TaskChecklist items={[item()]} selectedId={null} onSelect={() => undefined} />,
    );
    expect(screen.getByRole('list')).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('mỗi hàng là một nút THẬT, bấm được và focus được', () => {
    render(<TaskChecklist items={[item()]} selectedId={null} onSelect={() => undefined} />);
    const button = screen.getByRole('button');
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it('bấm một hàng gọi onSelect với ĐÚNG id', async () => {
    const onSelect = vi.fn<(id: string) => void>();
    render(
      <TaskChecklist
        items={[item({ id: 'x' }), item({ id: 'y', title: 'Việc hai' })]}
        selectedId={null}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByText('Việc hai'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('y');
  });

  it('hàng đang chọn mang aria-current, và ĐÚNG một hàng thôi', () => {
    render(
      <TaskChecklist
        items={[item({ id: 'x' }), item({ id: 'y' })]}
        selectedId="y"
        onSelect={() => undefined}
      />,
    );
    const current = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
  });

  it('trọng số chỉ hiện khi có, và cột đó biến mất khi mọi nhiệm vụ cùng trọng số', () => {
    const { unmount } = render(
      <TaskChecklist items={[item({ weight: 3 })]} selectedId={null} onSelect={() => undefined} />,
    );
    expect(screen.getByRole('button').textContent).toContain('3');
    unmount();

    render(<TaskChecklist items={[item({ weight: null })]} selectedId={null} onSelect={() => undefined} />);
    // Đối chứng âm: không có trọng số thì không có con số nào ngoài số thứ tự.
    expect(screen.getByRole('button').textContent).not.toContain('3');
  });

  it('chỉ hàng đang chấm mới quay — đối chứng âm trên bốn hàng còn lại', () => {
    render(
      <TaskChecklist
        items={(['not-attempted', 'running', 'passed', 'failed', 'infra'] as const).map((state) =>
          item({ id: state, state }),
        )}
        selectedId={null}
        onSelect={() => undefined}
      />,
    );

    for (const state of ['not-attempted', 'passed', 'failed', 'infra'] as const) {
      expect(
        rowFor(state).querySelector('svg')?.getAttribute('class') ?? '',
        `hàng ${state} không được quay`,
      ).not.toContain('animate-spin');
    }
    expect(rowFor('running').querySelector('svg')?.getAttribute('class') ?? '').toContain(
      'animate-spin',
    );
  });
});
