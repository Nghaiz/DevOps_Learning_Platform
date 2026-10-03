import { describe, expect, it } from 'vitest';
import { t } from '@devops-platform/copy';
import {
  EXAM_FORM_STEPS,
  EXAM_MAX_DURATION_MINUTES,
  EXAM_MAX_PROBLEMS,
  buildExamInput,
  describeExamWindow,
  emptyExamForm,
  examToForm,
  examWindowState,
  isExamFormDirty,
  parseProblemCodes,
  stepErrors,
  toIsoOrNull,
  toLocalInput,
  validateExamForm,
  type ExamFormValues,
} from './exam-form-model';

const CLASS_ID = '11111111-2222-4333-8444-555555555555';

function filled(overrides: Partial<ExamFormValues> = {}): ExamFormValues {
  return {
    ...emptyExamForm(),
    title: 'Giữa kỳ DevOps',
    classId: CLASS_ID,
    problems: 'K8S-0001\nGIT-0001',
    ...overrides,
  };
}

describe('validateExamForm', () => {
  it('form đầy đủ: không lỗi nào', () => {
    expect(validateExamForm(filled())).toEqual({});
  });

  it('form trống báo đúng ba ô bắt buộc, câu nói cách sửa', () => {
    const errors = validateExamForm(emptyExamForm());
    expect(Object.keys(errors).sort()).toEqual(['classId', 'problems', 'title']);
    expect(errors.title).toContain('Đặt tên');
    expect(errors.classId).toContain('Chọn lớp');
  });

  /**
   * Lỗi gốc của bản trước: form gửi hai mốc ngược nhau lên và chỉ biết sai khi
   * máy chủ trả lời, ở bước cuối. Hai mốc ngược nhau là kỳ thi không bao giờ mở.
   */
  it('giờ đóng trước giờ mở: lỗi ở ô "Đóng lúc", ngay ở bước Thời gian', () => {
    const errors = validateExamForm(
      filled({ opensAt: '2026-10-05T09:00', closesAt: '2026-10-05T08:00' }),
    );
    expect(errors.closesAt).toContain('Giờ đóng phải sau giờ mở');
    expect(stepErrors(errors, 'time')).toEqual(['closesAt']);
  });

  it('giờ đóng bằng giờ mở cũng bị chặn (cửa sổ rỗng)', () => {
    const errors = validateExamForm(
      filled({ opensAt: '2026-10-05T09:00', closesAt: '2026-10-05T09:00' }),
    );
    expect(errors.closesAt).toBeDefined();
  });

  it('chỉ một mốc thì không so gì cả', () => {
    expect(validateExamForm(filled({ closesAt: '2026-10-05T08:00' }))).toEqual({});
    expect(validateExamForm(filled({ opensAt: '2026-10-05T08:00' }))).toEqual({});
  });

  it.each(['0', '-5', '1.5', 'abc', '', String(EXAM_MAX_DURATION_MINUTES + 1)])(
    'thời lượng %o bị từ chối',
    (duration) => {
      expect(validateExamForm(filled({ duration })).duration).toBeDefined();
    },
  );

  it('thời lượng đúng trần vẫn hợp lệ', () => {
    expect(validateExamForm(filled({ duration: String(EXAM_MAX_DURATION_MINUTES) }))).toEqual({});
  });

  it('mã trùng gọi đúng tên mã', () => {
    expect(validateExamForm(filled({ problems: 'A-1\nB-2\nA-1' })).problems).toContain('A-1');
  });

  it('quá trần số bài', () => {
    const many = Array.from({ length: EXAM_MAX_PROBLEMS + 1 }, (_, i) => `P-${String(i)}`).join('\n');
    expect(validateExamForm(filled({ problems: many })).problems).toBeDefined();
  });

  it('chỉ dòng trống thì coi là chưa nhập mã nào', () => {
    expect(validateExamForm(filled({ problems: '\n  \n' })).problems).toContain('ít nhất một');
  });
});

describe('stepErrors', () => {
  it('mỗi ô thuộc đúng một bước, theo thứ tự trên màn hình', () => {
    const errors = validateExamForm(emptyExamForm());
    expect(stepErrors(errors, 'info')).toEqual(['title', 'classId']);
    expect(stepErrors(errors, 'time')).toEqual([]);
    expect(stepErrors(errors, 'problems')).toEqual(['problems']);
  });

  it('ba bước, đúng thứ tự thiết kế', () => {
    expect(EXAM_FORM_STEPS).toEqual(['info', 'time', 'problems']);
  });
});

describe('parseProblemCodes', () => {
  it('bỏ dòng trống và khoảng trắng hai đầu, giữ thứ tự', () => {
    expect(parseProblemCodes('  K8S-0001 \n\nGIT-0001\n')).toEqual(['K8S-0001', 'GIT-0001']);
  });
});

describe('toIsoOrNull', () => {
  it('rỗng là "không đặt mốc" (null)', () => {
    expect(toIsoOrNull('')).toBeNull();
    expect(toIsoOrNull('   ')).toBeNull();
  });

  /** `null` và `undefined` KHÁC nhau: gộp thì một ngày gõ hỏng âm thầm thành "mở ngay". */
  it('chuỗi không đọc được là undefined, không phải null', () => {
    expect(toIsoOrNull('hôm qua')).toBeUndefined();
    expect(validateExamForm(filled({ opensAt: 'hôm qua' })).opensAt).toBeDefined();
  });

  /**
   * `datetime-local` gõ dở trả `value === ""`, y như ô trống. Cờ `badInput` của
   * trình duyệt là thứ duy nhất phân biệt, và nó phải thành lỗi, không thành
   * `null` ("mở ngay").
   */
  it('ô ngày giờ gõ dở (badInput) là lỗi dù value rỗng', () => {
    expect(validateExamForm(filled({ opensAt: '' })).opensAt).toBeUndefined();
    expect(validateExamForm(filled({ opensAt: '' }), { opensAt: true }).opensAt).toBeDefined();
    expect(validateExamForm(filled({ closesAt: '' }), { closesAt: true }).closesAt).toBeDefined();
    expect(validateExamForm(filled(), { opensAt: false, closesAt: false })).toEqual({});
  });

  it('đi vòng qua toLocalInput không đổi mốc (theo giờ máy chạy test)', () => {
    const iso = toIsoOrNull('2026-10-05T09:30');
    expect(typeof iso).toBe('string');
    expect(toLocalInput(iso as string)).toBe('2026-10-05T09:30');
  });
});

describe('buildExamInput', () => {
  it('form còn lỗi thì không dựng input', () => {
    expect(buildExamInput(emptyExamForm())).toBeNull();
  });

  it('input đúng hình dạng `composeInput` của máy chủ', () => {
    const input = buildExamInput(filled({ title: '  Giữa kỳ  ', duration: '90' }));
    expect(input).toEqual({
      classId: CLASS_ID,
      title: 'Giữa kỳ',
      problemCodes: ['K8S-0001', 'GIT-0001'],
      durationMinutes: 90,
      seedStrategy: 'fixed',
      opensAt: null,
      closesAt: null,
    });
  });
});

describe('examToForm', () => {
  it('chế độ sửa: dựng lại form hợp lệ từ kỳ thi đã lưu', () => {
    const values = examToForm({
      title: 'Cuối kỳ',
      classId: CLASS_ID,
      durationMinutes: 45,
      opensAt: null,
      closesAt: null,
      problemCodes: ['A-1', 'B-2'],
      seedStrategy: 'per-student',
    });
    expect(values.problems).toBe('A-1\nB-2');
    expect(values.duration).toBe('45');
    expect(values.strategy).toBe('per-student');
    expect(validateExamForm(values)).toEqual({});
  });
});

describe('examWindowState', () => {
  const OPENS = '2026-10-05T02:00:00.000Z';
  const CLOSES = '2026-10-05T04:00:00.000Z';
  const at = (iso: string): number => new Date(iso).getTime();

  it('trước, trong, sau cửa sổ', () => {
    const span = { opensAt: OPENS, closesAt: CLOSES };
    expect(examWindowState(span, at('2026-10-05T01:59:59.000Z'))).toBe('upcoming');
    expect(examWindowState(span, at(OPENS))).toBe('open');
    // Mốc đóng là biên MỞ: đúng giây đóng là đã đóng, khớp `isExamOpen`.
    expect(examWindowState(span, at(CLOSES))).toBe('closed');
  });

  it('không mốc nào: luôn mở', () => {
    expect(examWindowState({ opensAt: null, closesAt: null }, at(OPENS))).toBe('open');
  });

  it('chỉ có giờ đóng: đã qua thì đóng, không bao giờ là "chưa mở"', () => {
    expect(examWindowState({ opensAt: null, closesAt: CLOSES }, at('2026-10-06T00:00:00.000Z'))).toBe('closed');
  });
});

describe('describeExamWindow', () => {
  const fmt = (iso: string): string => `[${iso}]`;

  it('bốn cách nói cho bốn tổ hợp mốc', () => {
    expect(describeExamWindow({ opensAt: null, closesAt: null }, fmt)).toBe('Mở bất cứ lúc nào');
    expect(describeExamWindow({ opensAt: 'a', closesAt: null }, fmt)).toBe('Mở từ [a]');
    expect(describeExamWindow({ opensAt: null, closesAt: 'b' }, fmt)).toBe('Đóng lúc [b]');
    expect(describeExamWindow({ opensAt: 'a', closesAt: 'b' }, fmt)).toBe('[a] đến [b]');
  });

  /** review-1 #28: giảng viên và sinh viên gọi một kỳ thi bằng cùng một lời. */
  it('cùng một câu với màn của sinh viên (exam.when.*)', () => {
    expect(describeExamWindow({ opensAt: 'a', closesAt: 'b' }, fmt)).toBe(
      t('exam.when.range', { from: '[a]', to: '[b]' }),
    );
    expect(describeExamWindow({ opensAt: null, closesAt: null }, fmt)).toBe(t('exam.when.any'));
  });
});

describe('isExamFormDirty', () => {
  it('chưa sửa gì thì không bẩn, sửa một ô thì bẩn, sửa rồi trả về như cũ thì hết bẩn', () => {
    const initial = filled();
    expect(isExamFormDirty({ ...initial }, initial)).toBe(false);
    expect(isExamFormDirty({ ...initial, title: 'Cuối kỳ' }, initial)).toBe(true);
    expect(isExamFormDirty({ ...initial, strategy: 'per-student' }, initial)).toBe(true);
    expect(isExamFormDirty({ ...initial, title: initial.title }, initial)).toBe(false);
  });
});
