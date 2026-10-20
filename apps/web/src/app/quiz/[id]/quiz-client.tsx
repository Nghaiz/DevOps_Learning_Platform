'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type {
  QuizAttemptResult,
  QuizForLearner,
  QuizQuestionForLearner,
  QuizQuestionResult,
} from '@devops-platform/shared-types/quiz';
import {
  BackLink,
  Button,
  Checkbox,
  ErrorBlock,
  Icon,
  Notice,
  Page,
  PageHeader,
  Pill,
  ProgressLine,
  RadioGroup,
  RadioItem,
  RowsSkeleton,
  Skeleton,
  Stamp,
  cn,
} from '@devops-platform/ds';
import { Markdown } from '@devops-platform/ds/content';
import { renderCopy, t, type StaticTextKey } from '@devops-platform/copy';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { contentLabels } from '../../../components/session/practice-labels';
import { MULTIPLE_ANSWER_RULE_KEYS, choiceReveal, summarizeAnswers, type ChoiceReveal } from './answer-view';

/**
 * Làm một bộ câu hỏi: câu đánh số, lựa chọn là những hàng bấm được, phiếu trả lời
 * dính đáy trang, nộp xong thì điểm + từng lựa chọn được đánh dấu bằng biểu tượng VÀ
 * chữ (không chỉ màu) + giải thích.
 *
 * ## Hai tính chất của file này là ô AC, không phải lựa chọn giao diện
 *
 * 1. **Không có đáp án nào ở đây trước khi nộp.** `quiz.get` trả `QuizForLearner`,
 *    `isCorrect`/`explanation` khai `never`. Đúng/sai chỉ xuất hiện sau khi
 *    `quiz.submit` trả về, và đi qua `choiceReveal` (hàm thuần, có test).
 * 2. **Quy tắc chấm hiện TRƯỚC khi làm**, câu chữ lấy TỪ PAYLOAD
 *    (`quiz.multipleAnswerRule`).
 *
 * Câu hỏi, lựa chọn và giải thích là MARKDOWN. Quiz không có route phục vụ ảnh, nên
 * `resolveAssetUrl` trả `null` và khối nội dung tự vẽ ô "không tải được ảnh".
 */

const NO_ASSETS = (): string | null => null;
const LABELS = contentLabels();

/** Viền và nền của một lựa chọn sau khi nộp. */
const REVEAL_ROW: Record<ChoiceReveal, string> = {
  none: 'border-rule-2',
  correct: 'border-ok-mid bg-ok-wash',
  // Bỏ lỡ một đáp án đúng ≠ chọn sai: hai chuyện khác nhau, hai hình khác nhau.
  missed: 'border-dashed border-ok-mid',
  'wrong-pick': 'border-bad-mid bg-bad-wash',
};

const REVEAL_TONE: Record<ChoiceReveal, 'ok' | 'bad' | 'neutral'> = {
  none: 'neutral',
  correct: 'ok',
  missed: 'ok',
  'wrong-pick': 'bad',
};

const REVEAL_ICON = { none: null, correct: 'check', missed: 'circle', 'wrong-pick': 'close' } as const;

/**
 * Nhãn chữ của ba vai trò lộ ra SAU khi nộp. `none` không có nhãn, và đó là cổng chứ
 * không phải chỗ chưa viết: trước khi nộp mọi lựa chọn đều là `none`.
 */
const REVEAL_NOTE: Record<ChoiceReveal, StaticTextKey | null> = {
  none: null,
  correct: 'catalog.quiz.reveal.correct',
  missed: 'catalog.quiz.reveal.missed',
  'wrong-pick': 'catalog.quiz.reveal.wrong-pick',
};

function questionAnchor(question: QuizQuestionForLearner): string {
  return `quiz-q-${question.id}`;
}

export function QuizClient({ quizId }: { quizId: string }): React.ReactElement {
  const query = api.quiz.get.useQuery({ quizId });
  const [selected, setSelected] = useState<Record<string, readonly string[]>>({});
  const [result, setResult] = useState<QuizAttemptResult | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  const submit = api.quiz.submit.useMutation({
    onSuccess: (data) => {
      setResult(data);
    },
  });

  // Nộp xong thì đưa focus (và mắt) lên khối kết quả: nó là thứ vừa thay đổi.
  useEffect(() => {
    if (result !== null) resultRef.current?.focus();
  }, [result]);

  const back = (
    <BackLink asChild>
      <Link href="/quiz">{t('catalog.quiz.back')}</Link>
    </BackLink>
  );

  if (query.isPending) {
    return (
      <Page width="text" className="pb-14">
        <PageHeader back={back} title={<Skeleton className="h-9 w-[20ch] max-w-full" />} />
        <RowsSkeleton rows={4} label={t('catalog.quiz.loading-sr')} />
      </Page>
    );
  }

  if (query.isError) {
    return (
      <Page width="text" className="pb-14">
        <PageHeader back={back} title={t('catalog.title.quiz')} />
        <ErrorBlock
          title={t('catalog.quiz.error-title')}
          retryLabel={t('common.action.retry')}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        >
          {describeTrpcError(query.error)}
        </ErrorBlock>
      </Page>
    );
  }

  const quiz: QuizForLearner = query.data.quiz;
  const progress = summarizeAnswers(quiz, selected);
  const graded = result !== null;
  const resultByQuestion = new Map((result?.questions ?? []).map((entry) => [entry.questionId, entry]));
  const answeredCount = quiz.questions.filter((question) => (selected[question.id] ?? []).length > 0).length;

  const toggle = (question: QuizQuestionForLearner, choiceId: string): void => {
    setSelected((previous) => {
      const current = previous[question.id] ?? [];
      if (question.kind === 'single') return { ...previous, [question.id]: [choiceId] };
      return {
        ...previous,
        [question.id]: current.includes(choiceId) ? current.filter((id) => id !== choiceId) : [...current, choiceId],
      };
    });
  };

  const onSubmit = (): void => {
    submit.mutate({
      quizId: quiz.id,
      answers: quiz.questions.map((question) => ({
        questionId: question.id,
        selectedChoiceIds: [...(selected[question.id] ?? [])],
      })),
    });
  };

  const onRestart = (): void => {
    setResult(null);
    setSelected({});
    submit.reset();
    window.scrollTo({ top: 0 });
  };

  return (
    <Page width="text" className="pb-0">
      <PageHeader
        back={back}
        title={quiz.title}
        {...(quiz.description === null ? {} : { lead: quiz.description })}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Pill icon="quiz">{t('catalog.meta.questions', { n: quiz.questions.length })}</Pill>
          <Pill icon="target">{t('catalog.meta.threshold', { percent: quiz.passThresholdPercent })}</Pill>
        </div>
      </PageHeader>

      {/* Quy tắc chấm đứng TRƯỚC câu hỏi đầu tiên, không phải sau khi nộp. */}
      <section aria-labelledby="quiz-grading" className="flex gap-3 rounded-md bg-acc-wash p-4">
        <Icon name="info" size={20} tint="acc" className="mt-0.5 shrink-0 text-acc-ink" />
        <div className="flex flex-col gap-1 text-sm text-ink-2">
          <h2 id="quiz-grading" className="font-medium text-ink">
            {t('catalog.quiz.grading-title')}
          </h2>
          <p>{renderCopy({ key: MULTIPLE_ANSWER_RULE_KEYS[quiz.multipleAnswerRule] })}</p>
          <p>{t('catalog.quiz.threshold', { percent: quiz.passThresholdPercent })}</p>
        </div>
      </section>

      {result === null ? null : (
        <ScoreBlock ref={resultRef} result={result} quiz={quiz} threshold={quiz.passThresholdPercent} onRestart={onRestart} />
      )}

      <ol className="mt-10 flex flex-col gap-12">
        {quiz.questions.map((question) => (
          <QuestionBlock
            key={question.id}
            question={question}
            selectedChoiceIds={selected[question.id] ?? []}
            outcome={resultByQuestion.get(question.id) ?? null}
            locked={graded}
            onToggle={(choiceId) => toggle(question, choiceId)}
          />
        ))}
      </ol>

      {submit.isError ? (
        <Notice tone="bad" role="alert" className="mt-8" title={t('catalog.quiz.submit-failed', { reason: describeTrpcError(submit.error) })}>
          {t('catalog.quiz.submit-failed-note')}
        </Notice>
      ) : null}

      {/*
        Phiếu trả lời: tiến độ TRẢ LỜI (không phải tiến độ đúng), một ô cho mỗi câu, và
        nút Nộp bài DUY NHẤT của trang. Chỉ có trước khi nộp; sau khi nộp khối kết quả
        ở trên thay chỗ nó.
      */}
      {!graded ? (
        <div
          role="region"
          aria-label={t('catalog.quiz.sheet')}
          className="sticky bottom-0 z-20 mt-12 -mx-4 border-t border-rule bg-canvas/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-col gap-2">
              <p role="status" className="text-sm tabular-nums text-ink-2">
                {renderCopy(progress.label)}
              </p>
              <ProgressLine
                value={quiz.questions.length === 0 ? 0 : answeredCount / quiz.questions.length}
                label={t('catalog.quiz.sheet')}
                size="xs"
                className="w-56 max-w-full"
              />
              <ol className="flex flex-wrap gap-1">
                {quiz.questions.map((question) => {
                  const answered = (selected[question.id] ?? []).length > 0;
                  return (
                    <li key={question.id}>
                      <a
                        href={`#${questionAnchor(question)}`}
                        aria-label={t('catalog.quiz.sheet-cell', {
                          n: question.ordinal + 1,
                          state: answered ? t('catalog.quiz.cell.answered') : t('catalog.quiz.cell.blank'),
                        })}
                        className={cn(
                          'grid size-8 place-items-center rounded-sm border text-xs font-medium tabular-nums transition-colors duration-150',
                          answered
                            ? 'border-acc-solid bg-acc-solid text-on-solid'
                            : 'border-rule-2 text-ink-3 hover:border-control hover:text-ink',
                        )}
                      >
                        {question.ordinal + 1}
                      </a>
                    </li>
                  );
                })}
              </ol>
              {progress.caveat === null ? null : <p className="text-xs text-ink-3">{renderCopy(progress.caveat)}</p>}
            </div>
            <Button size="lg" variant="primary" icon="send" onClick={onSubmit} loading={submit.isPending} className="shrink-0">
              {t('catalog.quiz.submit')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="h-16" />
      )}
    </Page>
  );
}

function QuestionBlock({
  question,
  selectedChoiceIds,
  outcome,
  locked,
  onToggle,
}: {
  question: QuizQuestionForLearner;
  selectedChoiceIds: readonly string[];
  outcome: QuizQuestionResult | null;
  locked: boolean;
  onToggle: (choiceId: string) => void;
}): React.ReactElement {
  const single = question.kind === 'single';
  const headingId = `${questionAnchor(question)}-title`;
  const promptId = `${questionAnchor(question)}-prompt`;

  const choices = question.choices.map((choice) => {
    const reveal = choiceReveal(outcome, choice.id, selectedChoiceIds);
    const note = REVEAL_NOTE[reveal];
    const icon = REVEAL_ICON[reveal];
    const checked = selectedChoiceIds.includes(choice.id);
    const controlId = `${question.id}--${choice.id}`;
    return (
      /*
        Cả hàng là `<label>` nên bấm vào đâu trên hàng cũng chọn đúng ô. Ô chọn là nút
        Radix có role, nên bấm thẳng vào nó không kích hoạt hai lần.
      */
      <label
        key={choice.id}
        htmlFor={controlId}
        className={cn(
          'flex items-start gap-3.5 rounded-md border bg-paper px-4 py-3.5 transition-[border-color,background-color] duration-150',
          locked ? 'cursor-default' : 'cursor-pointer hover:border-control',
          reveal === 'none' && checked ? 'border-acc-solid bg-acc-wash' : REVEAL_ROW[reveal],
        )}
      >
        <span className="pt-0.5">
          {single ? (
            <RadioItem
              value={choice.id}
              id={controlId}
              disabled={locked}
              className="grid size-[18px] place-items-center rounded-full border border-control bg-paper data-[state=checked]:border-acc-solid"
            >
              <span className={cn('size-2 rounded-full bg-acc-solid', checked ? 'block' : 'hidden')} />
            </RadioItem>
          ) : (
            <Checkbox id={controlId} checked={checked} disabled={locked} onCheckedChange={() => onToggle(choice.id)} />
          )}
        </span>
        <span className="min-w-0 flex-1 text-ink">
          <Markdown markdown={choice.markdown} labels={LABELS} resolveAssetUrl={NO_ASSETS} density="compact" />
        </span>
        {note === null ? null : (
          <Pill tone={REVEAL_TONE[reveal]} {...(icon === null ? {} : { icon })} className="shrink-0">
            {renderCopy({ key: note })}
          </Pill>
        )}
      </label>
    );
  });

  return (
    <li id={questionAnchor(question)} data-testid="quiz-question" className="scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 id={headingId} className="font-display text-lg font-semibold tabular-nums text-ink">
            {t('catalog.quiz.question', { n: question.ordinal + 1 })}
          </h2>
          <span className="text-sm text-ink-3">{single ? t('catalog.quiz.pick-one') : t('catalog.quiz.pick-many')}</span>
        </div>
        {outcome === null ? null : (
          <Pill tone={outcome.correct ? 'ok' : 'bad'} icon={outcome.correct ? 'check' : 'close'}>
            {outcome.correct ? t('catalog.quiz.answer-correct') : t('catalog.quiz.answer-wrong')}
          </Pill>
        )}
      </div>

      <div id={promptId} className="mt-3 text-md text-ink">
        <Markdown markdown={question.markdown} labels={LABELS} resolveAssetUrl={NO_ASSETS} />
      </div>

      {/*
        ⛔ KHÔNG chen `<ul>/<li>` giữa `RadioGroup` và các ô chọn: Radix đặt
        `role="radiogroup"`, và axe đòi con cháu mang `role="radio"`; một `<li>` chen
        vào giữa làm quan hệ đó gãy. `<label>` không mang role nên nó trong suốt với
        phép kiểm. Nhánh nhiều đáp án dùng cùng khuôn.
      */}
      {single ? (
        <RadioGroup
          value={selectedChoiceIds[0] ?? ''}
          disabled={locked}
          aria-labelledby={`${headingId} ${promptId}`}
          className="mt-4 flex flex-col gap-2"
          onValueChange={(value) => onToggle(value)}
        >
          {choices}
        </RadioGroup>
      ) : (
        <div role="group" aria-labelledby={`${headingId} ${promptId}`} className="mt-4 flex flex-col gap-2">
          {choices}
        </div>
      )}

      {/*
        Giải thích chỉ tới CÙNG kết quả: trước khi nộp nó không có trong payload, và nó
        thường tiết lộ đáp án nên đó là rào thứ hai chứ không phải chi tiết thừa.
      */}
      {outcome?.explanation == null ? null : (
        <div data-testid="quiz-explanation" className="mt-4 flex gap-3 rounded-md bg-well p-4 text-sm">
          <Icon name="lightbulb" size={18} className="mt-0.5 shrink-0 text-ink-3" />
          <div className="min-w-0">
            <p className="font-medium text-ink">{t('catalog.quiz.explanation')}</p>
            <div className="mt-1 text-ink-2">
              <Markdown markdown={outcome.explanation} labels={LABELS} resolveAssetUrl={NO_ASSETS} density="compact" />
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function ScoreBlock({
  ref,
  result,
  quiz,
  threshold,
  onRestart,
}: {
  ref: React.Ref<HTMLElement>;
  result: QuizAttemptResult;
  quiz: QuizForLearner;
  threshold: number;
  onRestart: () => void;
}): React.ReactElement {
  const passed = result.score.passed;
  const byQuestion = new Map(result.questions.map((entry) => [entry.questionId, entry]));
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="quiz-result"
      className="mt-8 flex flex-col gap-4 border-y border-rule py-6 outline-none animate-enter"
    >
      <div className="flex flex-wrap items-center gap-5">
        <Stamp tone={passed ? 'ok' : 'bad'} className="h-11 px-3.5 text-lg">
          {passed ? t('catalog.quiz.stamp-pass') : t('catalog.quiz.stamp-fail')}
        </Stamp>
        <div className="flex flex-col gap-1">
          <h2 id="quiz-result" className="text-sm text-ink-3">
            {t('catalog.quiz.result-title')}
          </h2>
          <p className="font-display text-3xl font-semibold tabular-nums text-ink">
            {t('catalog.quiz.score', {
              correct: result.score.correctCount,
              total: result.score.questionCount,
              percent: result.score.percent,
            })}
          </p>
          {/* Mốc đi kèm điểm: "60%" một mình không nói được đạt hay chưa. */}
          <p role="status" className={cn('font-medium', passed ? 'text-ok-ink' : 'text-warn-ink')}>
            {passed ? t('catalog.quiz.verdict-pass', { threshold }) : t('catalog.quiz.verdict-fail', { threshold })}
          </p>
          <p className="text-sm text-ink-3">{t('catalog.quiz.attempt-number', { n: result.attemptNumber })}</p>
        </div>
      </div>
      <ProgressLine
        value={result.score.questionCount === 0 ? 0 : result.score.correctCount / result.score.questionCount}
        label={t('catalog.quiz.score-meter')}
        tone={passed ? 'ok' : 'warn'}
        size="sm"
        className="max-w-md"
      />
      <ol aria-label={t('catalog.quiz.sheet')} className="flex flex-wrap gap-1">
        {quiz.questions.map((question) => {
          const correct = byQuestion.get(question.id)?.correct ?? false;
          return (
            <li key={question.id}>
              <a
                href={`#${questionAnchor(question)}`}
                aria-label={t('catalog.quiz.sheet-cell', {
                  n: question.ordinal + 1,
                  state: correct ? t('catalog.quiz.answer-correct') : t('catalog.quiz.answer-wrong'),
                })}
                className={cn(
                  'flex h-8 items-center gap-1 rounded-sm px-2 text-xs font-medium tabular-nums',
                  correct ? 'bg-ok-tint text-ok-ink' : 'bg-bad-tint text-bad-ink',
                )}
              >
                <Icon name={correct ? 'check' : 'close'} size={12} />
                {question.ordinal + 1}
              </a>
            </li>
          );
        })}
      </ol>
      <div>
        <Button variant="secondary" icon="undo" onClick={onRestart}>
          {t('catalog.quiz.restart')}
        </Button>
      </div>
    </section>
  );
}
