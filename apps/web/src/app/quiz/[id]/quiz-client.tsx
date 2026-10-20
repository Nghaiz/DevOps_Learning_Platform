'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CircleDashed, RotateCcw, X } from 'lucide-react';
import type {
  QuizAttemptResult,
  QuizForLearner,
  QuizQuestionForLearner,
  QuizQuestionResult,
} from '@devops-platform/shared-types/quiz';
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  ErrorState,
  MarkdownView,
  Meter,
  RadioGroup,
  RadioGroupItem,
  Skeleton,
  cn,
} from '@devops-platform/ui';
import { renderCopy, t, type StaticTextKey } from '@devops-platform/copy';
import { PageContainer, ToolHeader } from '../../../components/kit';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import {
  MULTIPLE_ANSWER_RULE_KEYS,
  choiceReveal,
  summarizeAnswers,
  type ChoiceReveal,
} from './answer-view';

/**
 * Làm một bộ câu hỏi, bố cục đề thi: câu đánh số, lựa chọn là những hàng vuông
 * lớn bấm được, phiếu trả lời dính đáy trang, nộp xong thì điểm + từng lựa chọn
 * được đánh dấu bằng icon VÀ chữ (không chỉ màu) + giải thích.
 *
 * ## Hai tính chất của file này là ô AC, không phải lựa chọn giao diện
 *
 * 1. **Không có đáp án nào ở đây trước khi nộp.** `quiz.get` trả `QuizForLearner`,
 *    `isCorrect`/`explanation` khai `never`. Đúng/sai chỉ xuất hiện sau khi
 *    `quiz.submit` trả về, và đi qua `choiceReveal` (hàm thuần, có test).
 * 2. **Quy tắc chấm hiện TRƯỚC khi làm**, câu chữ lấy TỪ PAYLOAD
 *    (`quiz.multipleAnswerRule`).
 *
 * Câu hỏi, lựa chọn và giải thích là MARKDOWN và đi qua `MarkdownView` (bản cũ in
 * thô ra chữ, nên `**pod**` hiện nguyên hai dấu sao). Quiz không có route phục vụ
 * ảnh, nên `resolveAssetUrl` trả `null` và `MarkdownView` tự vẽ ô "không tải được
 * ảnh" thay vì một ảnh vỡ.
 *
 * Quiz không cần sandbox, nên trang này không có khung phiên: không có phiên nào
 * để bắt đầu, kết thúc hay thêm giờ.
 */

const NO_ASSETS = (): string | null => null;

/** Viền và nền của một lựa chọn sau khi nộp. Chỉ token. */
const REVEAL_ROW: Record<ChoiceReveal, string> = {
  none: 'border-border',
  correct: 'border-success bg-success/10',
  // Bỏ lỡ một đáp án đúng ≠ chọn sai: hai chuyện khác nhau, hai hình khác nhau.
  missed: 'border-dashed border-success',
  'wrong-pick': 'border-destructive bg-destructive/10',
};

const REVEAL_TONE: Record<ChoiceReveal, string> = {
  none: '',
  correct: 'text-success',
  missed: 'text-success',
  'wrong-pick': 'text-destructive',
};

/**
 * Nhãn chữ của ba vai trò lộ ra SAU khi nộp. `none` không có nhãn, và đó là cổng
 * chứ không phải chỗ chưa viết: trước khi nộp mọi lựa chọn đều là `none`.
 */
const REVEAL_NOTE: Record<ChoiceReveal, StaticTextKey | null> = {
  none: null,
  correct: 'catalog.quiz.reveal.correct',
  missed: 'catalog.quiz.reveal.missed',
  'wrong-pick': 'catalog.quiz.reveal.wrong-pick',
};

function RevealIcon({ reveal }: { readonly reveal: ChoiceReveal }): React.ReactElement | null {
  if (reveal === 'correct') return <Check aria-hidden="true" className="size-4" strokeWidth={3} />;
  if (reveal === 'missed') return <CircleDashed aria-hidden="true" className="size-4" />;
  if (reveal === 'wrong-pick') return <X aria-hidden="true" className="size-4" strokeWidth={3} />;
  return null;
}

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
    if (result !== null) {
      resultRef.current?.focus();
    }
  }, [result]);

  if (query.isPending) {
    return (
      <>
        <ToolHeader crumbs={[{ href: '/quiz', label: t('catalog.quiz.back') }]} title={t('catalog.quiz.loading-title')} />
        <PageContainer width="read" className="py-10">
          <div role="status" aria-busy="true" className="flex flex-col gap-4">
            <span className="sr-only">{t('catalog.quiz.loading-sr')}</span>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </PageContainer>
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        <ToolHeader crumbs={[{ href: '/quiz', label: t('catalog.quiz.back') }]} title={t('catalog.title.quiz')} />
        <PageContainer width="read" className="py-10">
          <ErrorState
            title={t('catalog.quiz.error-title')}
            message={describeTrpcError(query.error)}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        </PageContainer>
      </>
    );
  }

  const quiz: QuizForLearner = query.data.quiz;
  const progress = summarizeAnswers(quiz, selected);
  const graded = result !== null;
  const resultByQuestion = new Map((result?.questions ?? []).map((entry) => [entry.questionId, entry]));

  const toggle = (question: QuizQuestionForLearner, choiceId: string): void => {
    setSelected((previous) => {
      const current = previous[question.id] ?? [];
      if (question.kind === 'single') {
        return { ...previous, [question.id]: [choiceId] };
      }
      return {
        ...previous,
        [question.id]: current.includes(choiceId)
          ? current.filter((id) => id !== choiceId)
          : [...current, choiceId],
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

  const kicker = [
    t('catalog.meta.questions', { n: quiz.questions.length }),
    t('catalog.meta.threshold', { percent: quiz.passThresholdPercent }),
  ].join(' · ');

  return (
    <>
      <ToolHeader crumbs={[{ href: '/quiz', label: t('catalog.quiz.back') }]} kicker={kicker} title={quiz.title} />

      <PageContainer width="read" className="pt-8 pb-0">
        {quiz.description !== null && <p className="type-lead text-muted-foreground">{quiz.description}</p>}

        {/* Quy tắc chấm đứng TRƯỚC câu hỏi đầu tiên, không phải sau khi nộp. */}
        <section aria-labelledby="quiz-grading" className="mt-6 border-y border-border py-5">
          <h2 id="quiz-grading" className="type-label text-muted-foreground">
            {t('catalog.quiz.grading-title')}
          </h2>
          <p className="mt-2 text-sm">{renderCopy({ key: MULTIPLE_ANSWER_RULE_KEYS[quiz.multipleAnswerRule] })}</p>
          <p className="mt-1 text-sm">{t('catalog.quiz.threshold', { percent: quiz.passThresholdPercent })}</p>
        </section>

        {result !== null && (
          <ScoreBlock
            ref={resultRef}
            result={result}
            quiz={quiz}
            threshold={quiz.passThresholdPercent}
            onRestart={onRestart}
          />
        )}

        <ol className="mt-10 flex flex-col gap-12">
          {quiz.questions.map((question) => (
            <QuestionBlock
              key={question.id}
              question={question}
              selectedChoiceIds={selected[question.id] ?? []}
              outcome={resultByQuestion.get(question.id) ?? null}
              locked={graded}
              onToggle={(choiceId) => {
                toggle(question, choiceId);
              }}
            />
          ))}
        </ol>

        {submit.isError && (
          <Alert variant="destructive" className="mt-8">
            <AlertDescription className="text-foreground">
              {t('catalog.quiz.submit-failed', { reason: describeTrpcError(submit.error) })}{' '}
              {t('catalog.quiz.submit-failed-note')}
            </AlertDescription>
          </Alert>
        )}

        {/*
          Phiếu trả lời: tiến độ TRẢ LỜI (không phải tiến độ đúng), một ô cho mỗi
          câu, và nút Nộp bài DUY NHẤT của trang. Chỉ có trước khi nộp; sau khi nộp
          nó vô nghĩa, và khối kết quả ở trên thay chỗ nó.
        */}
        {!graded ? (
          <div
            role="region"
            aria-label={t('catalog.quiz.sheet')}
            className="sticky bottom-0 z-20 mt-12 -mx-5 border-t-2 border-foreground bg-background px-5 py-4 md:-mx-8 md:px-8"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p role="status" className="font-mono text-sm tabular-nums">
                  {renderCopy(progress.label)}
                </p>
                <ol className="mt-2 flex flex-wrap gap-1">
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
                            'grid size-8 place-items-center border font-mono text-xs tabular-nums transition-colors',
                            answered
                              ? 'border-foreground bg-ink text-ink-foreground'
                              : 'border-border text-muted-foreground hover:border-foreground',
                          )}
                        >
                          {question.ordinal + 1}
                        </a>
                      </li>
                    );
                  })}
                </ol>
                {progress.caveat !== null && (
                  <p className="mt-2 text-xs text-muted-foreground">{renderCopy(progress.caveat)}</p>
                )}
              </div>
              <Button size="lg" onClick={onSubmit} loading={submit.isPending} className="shrink-0">
                {t('catalog.quiz.submit')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="h-16" />
        )}
      </PageContainer>
    </>
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
    const checked = selectedChoiceIds.includes(choice.id);
    const controlId = `${question.id}--${choice.id}`;
    return (
      /*
        Cả hàng là `<label>` nên bấm vào đâu trên hàng cũng chọn đúng ô. Ô chọn
        là Radix `RadioGroupItem`/`Checkbox` (nút có role), nên bấm thẳng vào nó
        không kích hoạt hai lần.
      */
      <label
        key={choice.id}
        htmlFor={controlId}
        className={cn(
          'flex items-start gap-4 border px-4 py-4 text-base transition-[border-color,background-color] duration-(--motion-fast)',
          locked ? 'cursor-default' : 'cursor-pointer hover:border-foreground',
          reveal === 'none' && checked ? 'border-foreground bg-muted' : REVEAL_ROW[reveal],
        )}
      >
        <span className="pt-0.5">
          {single ? (
            <RadioGroupItem value={choice.id} id={controlId} disabled={locked} />
          ) : (
            <Checkbox
              id={controlId}
              checked={checked}
              disabled={locked}
              onCheckedChange={() => {
                onToggle(choice.id);
              }}
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <MarkdownView markdown={choice.markdown} resolveAssetUrl={NO_ASSETS} />
        </span>
        {note !== null && (
          <span className={cn('inline-flex shrink-0 items-center gap-1.5 type-label', REVEAL_TONE[reveal])}>
            <RevealIcon reveal={reveal} />
            {renderCopy({ key: note })}
          </span>
        )}
      </label>
    );
  });

  return (
    <li id={questionAnchor(question)} data-testid="quiz-question" className="scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 id={headingId} className="type-title tabular-nums">
            {t('catalog.quiz.question', { n: question.ordinal + 1 })}
          </h2>
          <span className="type-label text-muted-foreground">
            {single ? t('catalog.quiz.pick-one') : t('catalog.quiz.pick-many')}
          </span>
        </div>
        {outcome !== null && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 type-label',
              outcome.correct ? 'text-success' : 'text-destructive',
            )}
          >
            {outcome.correct ? (
              <Check aria-hidden="true" className="size-4" strokeWidth={3} />
            ) : (
              <X aria-hidden="true" className="size-4" strokeWidth={3} />
            )}
            {outcome.correct ? t('catalog.quiz.answer-correct') : t('catalog.quiz.answer-wrong')}
          </span>
        )}
      </div>

      <div id={promptId} className="mt-3 text-lg">
        <MarkdownView markdown={question.markdown} resolveAssetUrl={NO_ASSETS} />
      </div>

      {/*
        ⛔ KHÔNG chen `<ul>/<li>` giữa `RadioGroup` và các ô chọn: Radix đặt
        `role="radiogroup"`, và axe đòi con cháu mang `role="radio"`; một `<li>`
        chen vào giữa làm quan hệ đó gãy. `<label>` không mang role nên nó trong
        suốt với phép kiểm. Nhánh nhiều đáp án dùng cùng khuôn.
      */}
      {single ? (
        <RadioGroup
          value={selectedChoiceIds[0] ?? ''}
          disabled={locked}
          aria-labelledby={`${headingId} ${promptId}`}
          className="mt-5 flex flex-col gap-2"
          onValueChange={(value) => {
            onToggle(value);
          }}
        >
          {choices}
        </RadioGroup>
      ) : (
        <div role="group" aria-labelledby={`${headingId} ${promptId}`} className="mt-5 flex flex-col gap-2">
          {choices}
        </div>
      )}

      {/*
        Giải thích chỉ tới CÙNG kết quả: trước khi nộp nó không có trong payload,
        và nó thường tiết lộ đáp án nên đó là rào thứ hai chứ không phải chi tiết
        thừa.
      */}
      {outcome?.explanation != null && (
        <div data-testid="quiz-explanation" className="mt-4 bg-muted p-4 text-sm">
          <p className="type-label text-muted-foreground">{t('catalog.quiz.explanation')}</p>
          <div className="mt-2">
            <MarkdownView markdown={outcome.explanation} resolveAssetUrl={NO_ASSETS} />
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
      className="animate-rise mt-8 border-2 border-foreground p-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <h2 id="quiz-result" className="type-label text-muted-foreground">
        {t('catalog.quiz.result-title')}
      </h2>
      <p className="mt-3 type-display tabular-nums">
        {t('catalog.quiz.score', {
          correct: result.score.correctCount,
          total: result.score.questionCount,
          percent: result.score.percent,
        })}
      </p>
      <Meter
        value={result.score.correctCount}
        max={result.score.questionCount}
        segments={Math.min(Math.max(result.score.questionCount, 1), 30)}
        tone={passed ? 'success' : 'warning'}
        label={t('catalog.quiz.score-meter')}
        className="mt-4 h-3"
      />
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {/* Mốc đi kèm điểm: "60%" một mình không nói được đạt hay chưa. */}
        <span
          role="status"
          className={cn('inline-flex items-center gap-1.5 font-semibold', passed ? 'text-success' : 'text-warning')}
        >
          {passed ? (
            <Check aria-hidden="true" className="size-4" strokeWidth={3} />
          ) : (
            <X aria-hidden="true" className="size-4" strokeWidth={3} />
          )}
          {passed ? t('catalog.quiz.verdict-pass', { threshold }) : t('catalog.quiz.verdict-fail', { threshold })}
        </span>
        <span className="type-label text-muted-foreground">
          {t('catalog.quiz.attempt-number', { n: result.attemptNumber })}
        </span>
      </div>

      <ol aria-label={t('catalog.quiz.sheet')} className="mt-5 flex flex-wrap gap-1">
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
                  'flex h-8 items-center gap-1 border px-2 font-mono text-xs tabular-nums',
                  correct ? 'border-success text-success' : 'border-destructive text-destructive',
                )}
              >
                {correct ? (
                  <Check aria-hidden="true" className="size-3" strokeWidth={3} />
                ) : (
                  <X aria-hidden="true" className="size-3" strokeWidth={3} />
                )}
                {question.ordinal + 1}
              </a>
            </li>
          );
        })}
      </ol>

      <Button variant="outline" className="mt-6" onClick={onRestart} iconLeft={<RotateCcw aria-hidden="true" className="size-4" />}>
        {t('catalog.quiz.restart')}
      </Button>
    </section>
  );
}
