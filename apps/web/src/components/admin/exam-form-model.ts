import { t } from '@devops-platform/copy';
import type { ExamSeedStrategy } from '../../server/db/schema';
import { isExamOpen } from '../../server/exams/clock';
import { EXAM_MAX_DURATION_MINUTES } from '../../server/exams/compose-gate';

/**
 * Phần QUYẾT ĐỊNH của form ra đề (tạo và sửa dùng chung) và của dòng "giờ thi",
 * tách khỏi JSX để test được trong vitest node thuần.
 *
 * ## Hai hằng số đọc thẳng từ máy chủ, ba hằng số chép có ghi nguồn
 *
 * `EXAM_MAX_DURATION_MINUTES` và `isExamOpen` là mã thuần của
 * `server/exams/*` (chỉ import kiểu từ `db/schema`), nên client import thẳng:
 * trần thời lượng và luật "đang mở" chỉ có MỘT nơi định nghĩa. Ba trần dưới
 * đây nằm trong schema Zod `composeInput` của `server/trpc/routers/exams.ts`,
 * vốn không export; chúng được chép với tên riêng và trỏ về nguồn. Máy chủ vẫn
 * là cổng thật, bản ở đây chỉ để người ra đề biết TRƯỚC khi bấm lưu.
 */

/** `title: z.string().trim().min(1).max(200)` */
export const EXAM_TITLE_MAX_LENGTH = 200;
/** `problemCodes: z.array(...).min(1).max(50)` */
export const EXAM_MAX_PROBLEMS = 50;
/** `z.string().trim().min(1).max(64)` cho từng mã */
export const EXAM_CODE_MAX_LENGTH = 64;
export { EXAM_MAX_DURATION_MINUTES };

/** Thời lượng gợi ý khi mở form tạo mới. Một tiết thực hành ở PTIT là 60 phút. */
export const EXAM_DEFAULT_DURATION_MINUTES = 60;

export const EXAM_FORM_STEPS = ['info', 'time', 'problems'] as const;
export type ExamFormStep = (typeof EXAM_FORM_STEPS)[number];

export type ExamFormField = 'title' | 'classId' | 'duration' | 'opensAt' | 'closesAt' | 'problems';

/** Ô nào thuộc bước nào. Bấm "Tiếp" chỉ kiểm các ô của bước đang đứng. */
export const FIELD_STEP: Readonly<Record<ExamFormField, ExamFormStep>> = {
  title: 'info',
  classId: 'info',
  duration: 'time',
  opensAt: 'time',
  closesAt: 'time',
  problems: 'problems',
};

/** Giá trị THÔ của form, đúng như người dùng gõ. Chưa ép kiểu gì cả. */
export interface ExamFormValues {
  readonly title: string;
  readonly classId: string;
  readonly duration: string;
  /** `datetime-local`, không múi giờ (`2026-10-03T09:00`), hoặc rỗng. */
  readonly opensAt: string;
  readonly closesAt: string;
  /** Mỗi dòng một mã. */
  readonly problems: string;
  readonly strategy: ExamSeedStrategy;
}

export type ExamFormErrors = Partial<Readonly<Record<ExamFormField, string>>>;

/**
 * Hai ô ngày giờ mà trình duyệt đang giữ một giá trị gõ DỞ.
 *
 * ⚠ `datetime-local` gõ dở (có ngày mà chưa có giờ) trả `value === ""`, y hệt ô
 * để trống. Chỉ `input.validity.badInput` phân biệt được hai ca. Không có cờ
 * này thì một mốc gõ hỏng đi thẳng vào `toIsoOrNull("")` thành `null`, tức là
 * "mở ngay" / "không hạn chung": kỳ thi mở sớm mà không ai được báo.
 */
export type ExamBadDates = Partial<Readonly<Record<'opensAt' | 'closesAt', boolean>>>;

/** Input của `exams.create`; `exams.update` là cái này cộng `examId`. */
export interface ExamComposeInput {
  readonly classId: string;
  readonly title: string;
  readonly problemCodes: string[];
  readonly durationMinutes: number;
  readonly seedStrategy: ExamSeedStrategy;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
}

export function emptyExamForm(): ExamFormValues {
  return {
    title: '',
    classId: '',
    duration: String(EXAM_DEFAULT_DURATION_MINUTES),
    opensAt: '',
    closesAt: '',
    problems: '',
    strategy: 'fixed',
  };
}

/** Giá trị form dựng lại từ một kỳ thi đã lưu, cho chế độ sửa. */
export function examToForm(exam: {
  readonly title: string;
  readonly classId: string;
  readonly durationMinutes: number;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly problemCodes: readonly string[];
  readonly seedStrategy: ExamSeedStrategy;
}): ExamFormValues {
  return {
    title: exam.title,
    classId: exam.classId,
    duration: String(exam.durationMinutes),
    opensAt: toLocalInput(exam.opensAt),
    closesAt: toLocalInput(exam.closesAt),
    problems: exam.problemCodes.join('\n'),
    strategy: exam.seedStrategy,
  };
}

/**
 * Tách dòng rồi bỏ dòng trống: người ta dán từ một file và gần như luôn có một
 * dòng trống ở cuối. Gửi nó lên sẽ thành một mã rỗng, và máy chủ sẽ báo
 * "không có bài nào mang mã ", một câu đúng nhưng vô nghĩa.
 */
export function parseProblemCodes(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * `datetime-local` → ISO, hoặc `null` khi để trống.
 *
 * ⚠ `datetime-local` trả chuỗi KHÔNG có múi giờ, và `new Date(...)` diễn giải
 * nó theo giờ ĐỊA PHƯƠNG của trình duyệt. Đó là hành vi đúng: giảng viên gõ
 * "9 giờ sáng" là 9 giờ sáng chỗ họ ngồi. `.toISOString()` quy về UTC trước khi
 * gửi, nên máy chủ không phải đoán múi giờ của ai.
 *
 * Chuỗi không đọc được trả `undefined`, KHÁC `null`: `null` là "không đặt mốc
 * này", `undefined` là "đặt rồi mà sai", và gộp hai cái thì một ngày gõ hỏng
 * âm thầm thành "mở ngay".
 */
export function toIsoOrNull(local: string): string | null | undefined {
  if (local.trim() === '') {
    return null;
  }
  const parsed = new Date(local);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** ISO (UTC) → `datetime-local` theo giờ địa phương, chiều ngược của `toIsoOrNull`. */
export function toLocalInput(iso: string | null): string {
  if (iso === null) {
    return '';
  }
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return '';
  }
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function parseDuration(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) {
    return null;
  }
  const minutes = Number(text.trim());
  return minutes >= 1 && minutes <= EXAM_MAX_DURATION_MINUTES ? minutes : null;
}

/**
 * Lỗi của TỪNG ô, câu nói cách sửa. Ô hợp lệ thì vắng khỏi kết quả.
 *
 * Luật "giờ đóng phải sau giờ mở" là bản sao có chủ ý của `composeIssues`:
 * hai mốc ngược nhau là một kỳ thi KHÔNG BAO GIỜ mở, và triệu chứng duy nhất
 * là sinh viên báo "em không vào thi được". Người ra đề nên thấy câu đó ngay
 * ở bước Thời gian, không phải sau khi bấm lưu ở bước cuối.
 */
export function validateExamForm(values: ExamFormValues, badDates: ExamBadDates = {}): ExamFormErrors {
  const errors: Partial<Record<ExamFormField, string>> = {};

  if (values.title.trim() === '') {
    errors.title = t('admin.exams.form.error.title');
  }
  if (values.classId === '') {
    errors.classId = t('admin.exams.form.error.class');
  }
  if (parseDuration(values.duration) === null) {
    errors.duration = t('admin.exams.form.error.duration', { max: EXAM_MAX_DURATION_MINUTES });
  }

  const opens = toIsoOrNull(values.opensAt);
  const closes = toIsoOrNull(values.closesAt);
  if (opens === undefined || badDates.opensAt === true) {
    errors.opensAt = t('admin.exams.form.error.date');
  }
  if (closes === undefined || badDates.closesAt === true) {
    errors.closesAt = t('admin.exams.form.error.date');
  } else if (
    typeof opens === 'string' &&
    typeof closes === 'string' &&
    new Date(closes).getTime() <= new Date(opens).getTime()
  ) {
    errors.closesAt = t('admin.exams.form.error.order');
  }

  const problemError = describeProblemCodesError(parseProblemCodes(values.problems));
  if (problemError !== null) {
    errors.problems = problemError;
  }

  return errors;
}

function describeProblemCodesError(codes: readonly string[]): string | null {
  if (codes.length === 0) {
    return t('admin.exams.form.error.problems');
  }
  if (codes.length > EXAM_MAX_PROBLEMS) {
    return t('admin.exams.form.error.problems-max', { max: EXAM_MAX_PROBLEMS });
  }
  const tooLong = codes.find((code) => code.length > EXAM_CODE_MAX_LENGTH);
  if (tooLong !== undefined) {
    return t('admin.exams.form.error.code-long', { code: tooLong, max: EXAM_CODE_MAX_LENGTH });
  }
  const seen = new Set<string>();
  for (const code of codes) {
    if (seen.has(code)) {
      return t('admin.exams.form.error.duplicate', { code });
    }
    seen.add(code);
  }
  return null;
}

/**
 * Form đã khác giá trị lúc mở chưa. Đóng tấm khi form đã khác thì phải hỏi
 * trước: Radix gỡ nội dung lúc đóng và bản nháp mất hẳn.
 */
export function isExamFormDirty(values: ExamFormValues, initial: ExamFormValues): boolean {
  return (Object.keys(initial) as (keyof ExamFormValues)[]).some((key) => values[key] !== initial[key]);
}

/** Các ô có lỗi thuộc một bước, theo thứ tự ô trên màn hình. */
export function stepErrors(errors: ExamFormErrors, step: ExamFormStep): readonly ExamFormField[] {
  return (Object.keys(FIELD_STEP) as ExamFormField[]).filter(
    (field) => FIELD_STEP[field] === step && errors[field] !== undefined,
  );
}

/**
 * Dựng input gửi lên. Trả `null` khi form còn lỗi: nơi gọi phải kiểm
 * `validateExamForm` trước, và một `null` ở đây là lỗi lập trình, không phải
 * một nhánh người dùng gặp.
 */
export function buildExamInput(values: ExamFormValues): ExamComposeInput | null {
  if (Object.keys(validateExamForm(values)).length > 0) {
    return null;
  }
  const duration = parseDuration(values.duration);
  const opensAt = toIsoOrNull(values.opensAt);
  const closesAt = toIsoOrNull(values.closesAt);
  if (duration === null || opensAt === undefined || closesAt === undefined) {
    return null;
  }
  return {
    classId: values.classId,
    title: values.title.trim(),
    problemCodes: parseProblemCodes(values.problems),
    durationMinutes: duration,
    seedStrategy: values.strategy,
    opensAt,
    closesAt,
  };
}

// ── Cửa sổ thi ──────────────────────────────────────────────────────────────

export type ExamWindowState = 'upcoming' | 'open' | 'closed';

/**
 * Kỳ thi đang ở vùng nào so với `now`. Luật "đang mở" là `isExamOpen` của máy
 * chủ, dùng lại nguyên hàm: một nhãn "Đang mở" lệch với cổng vào thi thật là
 * nhãn nói dối đúng lúc giảng viên cần tin nó nhất.
 */
export function examWindowState(
  span: { readonly opensAt: string | null; readonly closesAt: string | null },
  now: number,
): ExamWindowState {
  const opensAt = span.opensAt === null ? null : new Date(span.opensAt);
  const closesAt = span.closesAt === null ? null : new Date(span.closesAt);
  const at = new Date(now);
  if (isExamOpen({ opensAt, closesAt }, at)) {
    return 'open';
  }
  return opensAt !== null && now < opensAt.getTime() ? 'upcoming' : 'closed';
}

/**
 * Câu "giờ thi". `format` truyền từ nơi gọi (`formatMoment`): định dạng ngày
 * phụ thuộc locale và múi giờ của máy chạy, nhét nó vào đây là biến một test
 * xác định thành một test đỏ tuỳ máy.
 */
export function describeExamWindow(
  span: { readonly opensAt: string | null; readonly closesAt: string | null },
  format: (iso: string) => string,
): string {
  const { opensAt, closesAt } = span;
  if (opensAt === null) {
    return closesAt === null
      ? t('admin.exams.window.always')
      : t('admin.exams.window.until', { closes: format(closesAt) });
  }
  if (closesAt === null) {
    return t('admin.exams.window.from', { opens: format(opensAt) });
  }
  return t('admin.exams.window.between', { opens: format(opensAt), closes: format(closesAt) });
}
