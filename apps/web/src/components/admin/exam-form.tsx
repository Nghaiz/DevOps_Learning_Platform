'use client';

import { useCallback, useId, useRef, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { t } from '@devops-platform/copy';
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Textarea,
  cn,
} from '@devops-platform/ui';
import type { ExamSeedStrategy } from '../../server/db/schema';
import { ClassPicker } from './class-picker';
import {
  EXAM_FORM_STEPS,
  EXAM_MAX_DURATION_MINUTES,
  EXAM_MAX_PROBLEMS,
  EXAM_TITLE_MAX_LENGTH,
  buildExamInput,
  parseProblemCodes,
  stepErrors,
  validateExamForm,
  type ExamComposeInput,
  type ExamFormField,
  type ExamFormStep,
  type ExamFormValues,
} from './exam-form-model';

const STRATEGIES: readonly ExamSeedStrategy[] = ['fixed', 'per-student'];

/**
 * Form ra đề nhiều bước (Thông tin · Thời gian · Đề), dùng chung cho tạo mới và
 * sửa. Không có cột điều hướng bên trái: thanh bước nằm ngang ở đầu form.
 *
 * ## Vì sao nhiều bước
 *
 * Ba nhóm ô phụ thuộc nhau theo đúng thứ tự máy chủ kiểm: lớp quyết định ai
 * được thi, giờ quyết định khi nào, đề quyết định thi gì. Bấm "Tiếp" chỉ kiểm
 * bước đang đứng (`stepErrors`), sai thì đứng lại và đưa tiêu điểm vào ô sai
 * đầu tiên. Lùi lại không mất gì đã điền.
 *
 * ## Các bước ẩn bằng thuộc tính `hidden`, KHÔNG gỡ khỏi cây
 *
 * Ô chọn lớp đã đọc hết các trang lớp; gỡ nó khi sang bước 2 là đọc lại khi
 * quay về. Khối bọc mang `hidden` và KHÔNG mang class display nào: một
 * `.flex` trên cùng phần tử thắng luật `[hidden]` của trình duyệt và bước ẩn
 * vẫn hiện.
 *
 * ## Luật vào bước
 *
 * Một bước bấm được khi mọi bước trước nó không còn lỗi. Ở chế độ sửa mọi bước
 * đã hợp lệ từ đầu, nên người sửa nhảy thẳng tới bước cần sửa.
 */
export function ExamForm(props: {
  readonly initial: ExamFormValues;
  /** Số lượt đã vào làm; > 0 ⇒ khoá cách sinh đề (máy chủ cũng từ chối đổi). */
  readonly attemptCount: number;
  readonly submitLabel: string;
  readonly pending: boolean;
  /** Câu lỗi máy chủ của lượt lưu gần nhất, đã ghép hai nửa. */
  readonly serverError: string | null;
  readonly onSubmit: (input: ExamComposeInput) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const [values, setValues] = useState<ExamFormValues>(props.initial);
  const [current, setCurrent] = useState<number>(0);
  const [attempted, setAttempted] = useState<ReadonlySet<ExamFormStep>>(new Set());
  const headingRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const baseId = useId();
  const fieldId = (field: ExamFormField): string => `${baseId}-${field}`;

  const errors = validateExamForm(values);
  const step = EXAM_FORM_STEPS[current] as ExamFormStep;
  const isLast = current === EXAM_FORM_STEPS.length - 1;
  const strategyLocked = props.attemptCount > 0;

  /** Lỗi chỉ hiện ở bước đã bấm "Tiếp"/"Lưu" ít nhất một lần, không hiện từ phím đầu tiên. */
  const shownError = (field: ExamFormField): string | undefined => {
    const owner = EXAM_FORM_STEPS.find((candidate) => stepErrors(errors, candidate).includes(field));
    return owner !== undefined && attempted.has(owner) ? errors[field] : undefined;
  };

  const update = useCallback(<K extends keyof ExamFormValues>(key: K, value: ExamFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const goTo = useCallback((index: number) => {
    setCurrent(index);
    // Sang bước khác thì đưa tiêu điểm lên tiêu đề bước: trình đọc màn hình đọc
    // tên bước mới, và ở màn hẹp trang về đầu bước thay vì đứng ở hàng nút.
    requestAnimationFrame(() => headingRefs.current[index]?.focus());
  }, []);

  const focusFirstError = useCallback(
    (target: ExamFormStep) => {
      const field = stepErrors(validateExamForm(values), target)[0];
      if (field !== undefined) {
        requestAnimationFrame(() => document.getElementById(fieldId(field))?.focus());
      }
    },
    // `fieldId` chỉ phụ thuộc `baseId`, ổn định suốt vòng đời form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, baseId],
  );

  const reachable = (index: number): boolean =>
    EXAM_FORM_STEPS.slice(0, index).every((candidate) => stepErrors(errors, candidate).length === 0);

  const next = useCallback(() => {
    setAttempted((prev) => new Set(prev).add(step));
    if (stepErrors(errors, step).length > 0) {
      focusFirstError(step);
      return;
    }
    goTo(current + 1);
  }, [current, errors, focusFirstError, goTo, step]);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isLast) {
        // Enter ở bước giữa nghĩa là "Tiếp", không phải "lưu cả form".
        next();
        return;
      }
      setAttempted(new Set(EXAM_FORM_STEPS));
      const firstBad = EXAM_FORM_STEPS.findIndex((candidate) => stepErrors(errors, candidate).length > 0);
      if (firstBad !== -1) {
        if (firstBad !== current) {
          goTo(firstBad);
        }
        focusFirstError(EXAM_FORM_STEPS[firstBad] as ExamFormStep);
        return;
      }
      const input = buildExamInput(values);
      if (input !== null) {
        props.onSubmit(input);
      }
    },
    // `props.onSubmit` là hàm của nơi gọi; đọc qua `props` để không bắt bản cũ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, errors, focusFirstError, goTo, isLast, next, values, props.onSubmit],
  );

  const codes = parseProblemCodes(values.problems);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <StepBar
        current={current}
        attempted={attempted}
        hasErrors={(candidate) => stepErrors(errors, candidate).length > 0}
        reachable={reachable}
        disabled={props.pending}
        onPick={goTo}
      />

      {/* ── Bước 1 · Thông tin ─────────────────────────────────────────── */}
      <div hidden={current !== 0}>
        <StepFrame
          index={0}
          headingRef={(node) => {
            headingRefs.current[0] = node;
          }}
          lead={t('admin.exams.form.lead.info')}
        >
          <Field id={fieldId('title')} label={t('admin.exams.form.title-label')} error={shownError('title')}>
            <Input
              id={fieldId('title')}
              value={values.title}
              onChange={(event) => update('title', event.target.value)}
              placeholder={t('admin.exams.form.title-placeholder')}
              maxLength={EXAM_TITLE_MAX_LENGTH}
              aria-invalid={shownError('title') === undefined ? undefined : true}
              aria-describedby={shownError('title') === undefined ? undefined : `${fieldId('title')}-note`}
            />
          </Field>
          <ClassPicker
            inputId={fieldId('classId')}
            value={values.classId}
            onChange={(classId) => update('classId', classId)}
            error={shownError('classId')}
          />
        </StepFrame>
      </div>

      {/* ── Bước 2 · Thời gian ─────────────────────────────────────────── */}
      <div hidden={current !== 1}>
        <StepFrame
          index={1}
          headingRef={(node) => {
            headingRefs.current[1] = node;
          }}
          lead={t('admin.exams.form.lead.time')}
        >
          <Field
            id={fieldId('duration')}
            label={t('admin.exams.form.duration-label')}
            hint={t('admin.exams.form.duration-hint', { max: EXAM_MAX_DURATION_MINUTES })}
            error={shownError('duration')}
          >
            <Input
              id={fieldId('duration')}
              type="number"
              inputMode="numeric"
              min={1}
              max={EXAM_MAX_DURATION_MINUTES}
              value={values.duration}
              onChange={(event) => update('duration', event.target.value)}
              className="max-w-40"
              aria-invalid={shownError('duration') === undefined ? undefined : true}
              aria-describedby={`${fieldId('duration')}-note`}
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              id={fieldId('opensAt')}
              label={t('admin.exams.form.opens-label')}
              hint={t('admin.exams.form.opens-hint')}
              error={shownError('opensAt')}
            >
              <Input
                id={fieldId('opensAt')}
                type="datetime-local"
                value={values.opensAt}
                onChange={(event) => update('opensAt', event.target.value)}
                aria-invalid={shownError('opensAt') === undefined ? undefined : true}
                aria-describedby={`${fieldId('opensAt')}-note`}
              />
            </Field>
            <Field
              id={fieldId('closesAt')}
              label={t('admin.exams.form.closes-label')}
              hint={t('admin.exams.form.closes-hint')}
              error={shownError('closesAt')}
            >
              <Input
                id={fieldId('closesAt')}
                type="datetime-local"
                value={values.closesAt}
                onChange={(event) => update('closesAt', event.target.value)}
                aria-invalid={shownError('closesAt') === undefined ? undefined : true}
                aria-describedby={`${fieldId('closesAt')}-note`}
              />
            </Field>
          </div>
        </StepFrame>
      </div>

      {/* ── Bước 3 · Đề ────────────────────────────────────────────────── */}
      <div hidden={current !== 2}>
        <StepFrame
          index={2}
          headingRef={(node) => {
            headingRefs.current[2] = node;
          }}
          lead={t('admin.exams.form.lead.problems')}
        >
          <Field
            id={fieldId('problems')}
            label={t('admin.exams.form.problems-label')}
            hint={t('admin.exams.form.problems-hint', { count: codes.length, max: EXAM_MAX_PROBLEMS })}
            error={shownError('problems')}
          >
            <Textarea
              id={fieldId('problems')}
              value={values.problems}
              onChange={(event) => update('problems', event.target.value)}
              placeholder={t('admin.exams.form.problems-placeholder')}
              rows={6}
              className="font-mono"
              spellCheck={false}
              aria-invalid={shownError('problems') === undefined ? undefined : true}
              aria-describedby={`${fieldId('problems')}-note`}
            />
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-foreground">
              {t('admin.exams.form.strategy-label')}
            </legend>
            <RadioGroup
              value={values.strategy}
              onValueChange={(value) => update('strategy', value as ExamSeedStrategy)}
              disabled={strategyLocked}
              className="flex flex-col gap-2"
            >
              {STRATEGIES.map((value) => (
                <div key={value} className="flex items-center gap-2">
                  <RadioGroupItem id={`${baseId}-strategy-${value}`} value={value} />
                  <Label htmlFor={`${baseId}-strategy-${value}`} className="font-normal">
                    {value === 'fixed'
                      ? t('admin.exams.strategy-fixed')
                      : t('admin.exams.strategy-per-student')}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <p className="max-w-prose text-xs text-muted-foreground">
              {strategyLocked
                ? t('admin.exams.form.strategy-locked', { count: props.attemptCount })
                : t('admin.exams.strategy-note')}
            </p>
          </fieldset>
        </StepFrame>
      </div>

      {props.serverError === null ? null : (
        // Lỗi không gắn với ô nào (cổng soạn đề của máy chủ gộp mọi vấn đề vào
        // một câu): một dòng banner, đúng một ca mà banner được dùng.
        <Alert variant="destructive">
          <AlertDescription>{props.serverError}</AlertDescription>
        </Alert>
      )}

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-5">
        {current === 0 ? (
          <Button type="button" variant="ghost" onClick={props.onCancel} disabled={props.pending}>
            {t('admin.exams.form.cancel')}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => goTo(current - 1)} disabled={props.pending}>
            {t('admin.exams.form.back')}
          </Button>
        )}
        {isLast ? (
          <Button
            type="submit"
            loading={props.pending}
            onClick={(event) => {
              // Bấm đúp "Tiếp" ở bước áp chót thì cú thứ hai rơi đúng vào nút
              // này khi người dùng chưa kịp đọc bước cuối. Enter có `detail = 0`.
              if (event.detail > 1) {
                event.preventDefault();
              }
            }}
          >
            {props.submitLabel}
          </Button>
        ) : (
          <Button type="button" variant="ink" onClick={next}>
            {t('admin.exams.form.next')}
          </Button>
        )}
      </div>
    </form>
  );
}

function stepLabel(step: ExamFormStep): string {
  return t(`admin.exams.form.step.${step}`);
}

/**
 * Thanh bước. Bước đang làm = khối mực đặc (luật "active = filled block"),
 * bước đã xong có dấu tích và bấm được để quay lại, bước có lỗi viền đỏ và chữ
 * "!". Màn hẹp chỉ còn "Bước 2/3" + thước mảnh chia đoạn.
 */
function StepBar(props: {
  readonly current: number;
  readonly attempted: ReadonlySet<ExamFormStep>;
  readonly hasErrors: (step: ExamFormStep) => boolean;
  readonly reachable: (index: number) => boolean;
  readonly disabled: boolean;
  readonly onPick: (index: number) => void;
}): ReactElement {
  const total = EXAM_FORM_STEPS.length;
  const badSteps = EXAM_FORM_STEPS.filter((step) => props.attempted.has(step) && props.hasErrors(step));

  return (
    <div>
      {/* Màn hẹp */}
      <div className="flex flex-col gap-2 sm:hidden">
        <p className="font-mono text-sm tabular-nums">
          {t('admin.exams.form.progress', { current: props.current + 1, total })}
        </p>
        <div aria-hidden="true" className="flex h-1 gap-0.5">
          {EXAM_FORM_STEPS.map((step, index) => (
            <span
              key={step}
              className={cn(
                'flex-1',
                props.attempted.has(step) && props.hasErrors(step)
                  ? 'bg-destructive'
                  : index < props.current
                    ? 'bg-ink'
                    : index === props.current
                      ? 'bg-ink/40'
                      : 'bg-muted',
              )}
            />
          ))}
        </div>
        {badSteps.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => props.onPick(EXAM_FORM_STEPS.indexOf(step))}
            className="w-fit text-left text-xs text-destructive underline-offset-4 hover:underline"
          >
            {t('admin.exams.form.step-error', { step: stepLabel(step) })}
          </button>
        ))}
      </div>

      {/* Màn rộng */}
      <ol aria-label={t('admin.exams.form.steps-label')} className="hidden sm:flex">
        {EXAM_FORM_STEPS.map((step, index) => {
          const isCurrent = index === props.current;
          const isBad = props.attempted.has(step) && props.hasErrors(step);
          const isDone = index < props.current && !isBad;
          const canPick = !isCurrent && !props.disabled && props.reachable(index);
          return (
            <li
              key={step}
              aria-current={isCurrent ? 'step' : undefined}
              className={cn('flex items-center', index === total - 1 ? 'flex-none' : 'flex-1')}
            >
              <button
                type="button"
                disabled={!canPick}
                onClick={() => props.onPick(index)}
                className={cn(
                  'flex h-10 items-center gap-2 px-3 text-sm font-semibold transition-colors duration-(--motion-fast)',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  isCurrent
                    ? 'bg-ink text-ink-foreground'
                    : isBad
                      ? 'border border-destructive text-destructive'
                      : isDone
                        ? 'text-foreground hover:bg-muted'
                        : 'text-muted-foreground',
                  canPick ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                <span aria-hidden="true" className="font-mono text-xs tabular-nums">
                  {isBad ? '!' : isDone ? <Check className="size-3.5" /> : String(index + 1).padStart(2, '0')}
                </span>
                {stepLabel(step)}
              </button>
              {index === total - 1 ? null : (
                <span aria-hidden="true" className={cn('mx-2 h-0.5 flex-1', isDone ? 'bg-ink' : 'bg-border')} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepFrame(props: {
  readonly index: number;
  readonly headingRef: (node: HTMLHeadingElement | null) => void;
  readonly lead: string;
  readonly children: ReactNode;
}): ReactElement {
  const step = EXAM_FORM_STEPS[props.index] as ExamFormStep;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        {/* `h3`: tiêu đề của Sheet bao ngoài (`SheetTitle`) đã là `h2`. */}
        <h3 ref={props.headingRef} tabIndex={-1} className="type-title outline-hidden">
          {stepLabel(step)}
        </h3>
        <p className="max-w-prose text-sm text-muted-foreground">{props.lead}</p>
      </div>
      {props.children}
    </div>
  );
}

function Field(props: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly error: string | undefined;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      {props.children}
      {props.error === undefined ? (
        props.hint === undefined ? null : (
          <p id={`${props.id}-note`} className="text-xs text-muted-foreground">
            {props.hint}
          </p>
        )
      ) : (
        <p id={`${props.id}-note`} className="text-sm text-destructive">
          {props.error}
        </p>
      )}
    </div>
  );
}
