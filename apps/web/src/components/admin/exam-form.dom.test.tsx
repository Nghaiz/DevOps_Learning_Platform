// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '@devops-platform/copy';
import { ExamForm } from './exam-form';
import { emptyExamForm, type ExamFormValues } from './exam-form-model';

/**
 * Ô chọn lớp đọc `classes.list` qua tRPC. Form ở đây chỉ cần một ô mang đúng
 * `inputId` để luật "đưa tiêu điểm vào ô sai đầu tiên" có chỗ trỏ tới.
 */
vi.mock('./class-picker', () => ({
  ClassPicker: (props: { readonly inputId: string; readonly value: string; readonly onChange: (id: string) => void }) => (
    <input
      id={props.inputId}
      aria-label="lớp"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
}));

const VALID: ExamFormValues = {
  ...emptyExamForm(),
  title: 'Giữa kỳ DevOps',
  classId: '11111111-2222-4333-8444-555555555555',
  problems: 'K8S-0001\nGIT-0001',
};

/**
 * Mô phỏng ĐÚNG thứ tự của trình duyệt thật.
 *
 * Trong trình duyệt, React xả cập nhật của một cú click ở microtask chạy giữa
 * listener của nó và hành vi kích hoạt của nút (lúc ấy ngăn xếp JS trống). Ở
 * jsdom, `fireEvent` được gọi TỪ mã test nên ngăn xếp không bao giờ trống trong
 * lượt dispatch, và microtask chỉ chạy sau khi nút đã kích hoạt xong. Không có
 * listener này thì bản lỗi cũ (một nút đổi `type` tại chỗ) vẫn XANH ở đây.
 *
 * Listener đặt ở `window`, pha nổi bọt: chạy SAU listener gốc của React (gắn ở
 * container), và `flushSync()` vẽ lại ngay trước hành vi kích hoạt, y như
 * trình duyệt.
 */
function flushLikeABrowser(): () => void {
  const listener = (): void => {
    flushSync(() => undefined);
  };
  window.addEventListener('click', listener);
  return () => window.removeEventListener('click', listener);
}

type ActGlobal = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

function renderForm(initial: ExamFormValues = VALID): { readonly onSubmit: ReturnType<typeof vi.fn> } {
  const onSubmit = vi.fn();
  render(
    <ExamForm
      initial={initial}
      attemptCount={0}
      submitLabel={t('admin.exams.form.submit-update')}
      pending={false}
      serverError={null}
      onSubmit={onSubmit}
      onCancel={() => undefined}
    />,
  );
  return { onSubmit };
}

function visibleStepHeading(): string | null {
  const headings = screen.getAllByRole('heading', { level: 3, hidden: true });
  const shown = headings.find((heading) => heading.closest('[hidden]') === null);
  return shown?.textContent ?? null;
}

let detach: () => void = () => undefined;
let actEnvironment: boolean | undefined;

// Radix `RadioGroup` (ô cách sinh đề) đo kích thước bằng ResizeObserver, thứ
// jsdom không có. Ở đây không đo gì cả, chỉ cần hàm tồn tại.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

beforeEach(() => {
  // Cú click đi ngoài `act` (đó là mục đích của `flushLikeABrowser`), nên tắt
  // cảnh báo "not wrapped in act" của React cho file này.
  actEnvironment = (globalThis as ActGlobal).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as ActGlobal).IS_REACT_ACT_ENVIRONMENT = false;
  detach = flushLikeABrowser();
});

afterEach(() => {
  detach();
  (globalThis as ActGlobal).IS_REACT_ACT_ENVIRONMENT = actEnvironment;
  cleanup();
});

describe('ExamForm, nút Tiếp và nút Lưu', () => {
  /**
   * Hồi quy review-1 #1: "Tiếp" và "Lưu" từng là một nút DOM đổi `type` tại
   * chỗ. Cú bấm "Tiếp" ở bước 2 vẽ lại bước 3 trước khi nút kích hoạt, nút đã
   * thành `submit`, và form bị nộp: ở chế độ sửa là một lượt `exams.update`
   * không ai bấm.
   */
  it('bấm Tiếp ở bước 2 sang bước 3 mà không nộp form', () => {
    const { onSubmit } = renderForm();
    const next = (): HTMLElement => screen.getByRole('button', { name: t('admin.exams.form.next') });

    fireEvent.click(next());
    expect(visibleStepHeading()).toBe(t('admin.exams.form.step.time'));

    fireEvent.click(next());
    expect(visibleStepHeading()).toBe(t('admin.exams.form.step.problems'));
    expect(onSubmit).not.toHaveBeenCalled();

    // Nút Lưu là một phần tử MỚI, và nó vẫn nộp được khi bấm thật.
    fireEvent.click(screen.getByRole('button', { name: t('admin.exams.form.submit-update') }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('nút Tiếp không phải nút submit ở bất kỳ bước giữa nào', () => {
    renderForm();
    const next = screen.getByRole('button', { name: t('admin.exams.form.next') });
    expect(next.getAttribute('type')).toBe('button');
    expect(screen.queryByRole('button', { name: t('admin.exams.form.submit-update') })).toBeNull();
  });
});

describe('ExamForm, phím Enter', () => {
  /** Hồi quy review-1 #8: ở bước giữa không có nút submit nên Enter từng không làm gì. */
  it('Enter trong một ô ở bước giữa là Tiếp, không phải Lưu', () => {
    const { onSubmit } = renderForm();
    const title = screen.getByLabelText(t('admin.exams.form.title-label'));

    fireEvent.keyDown(title, { key: 'Enter' });
    expect(visibleStepHeading()).toBe(t('admin.exams.form.step.time'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Enter ở bước còn lỗi thì đứng lại và hiện lỗi của ô', () => {
    const { onSubmit } = renderForm({ ...VALID, title: '' });
    const title = screen.getByLabelText(t('admin.exams.form.title-label'));

    fireEvent.keyDown(title, { key: 'Enter' });
    expect(visibleStepHeading()).toBe(t('admin.exams.form.step.info'));
    expect(screen.getByText(t('admin.exams.form.error.title'))).toBeDefined();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
