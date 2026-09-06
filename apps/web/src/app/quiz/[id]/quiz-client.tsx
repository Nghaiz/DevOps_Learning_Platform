'use client';

import { useState } from 'react';
import Link from 'next/link';
import type {
  QuizAttemptResult,
  QuizForLearner,
  QuizQuestionForLearner,
  QuizQuestionResult,
} from '@devops-platform/shared-types/quiz';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  Checkbox,
  ErrorState,
  Label,
  RadioGroup,
  RadioGroupItem,
  Skeleton,
} from '@devops-platform/ui';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import {
  MULTIPLE_ANSWER_RULE_TEXT,
  choiceReveal,
  summarizeAnswers,
  type ChoiceReveal,
} from './answer-view';

/**
 * Trình học QUIZ (13.D task 14) — danh sách câu hỏi, chấm SAU khi nộp, hiện
 * giải thích.
 *
 * ## Hai tính chất của file này là ô AC, không phải lựa chọn giao diện
 *
 * 1. **Không có đáp án nào ở đây.** `quiz.get` trả `QuizForLearner`, một type
 *    mà `isCorrect`/`explanation` được khai `never` — nên kể cả muốn, file này
 *    cũng không đọc được đáp án để tô màu trước khi nộp. Đúng/sai chỉ xuất hiện
 *    sau khi `quiz.submit` trả về, và nó đi qua `choiceReveal` (hàm thuần, có
 *    test) chứ không qua một biểu thức nội suy giữa JSX. ⛔ Không nới kiểu, không
 *    `as`, không đọc field nào ngoài `outcome.*` để suy đúng/sai.
 * 2. **Quy tắc chấm hiện TRƯỚC khi làm** (AC #6), câu chữ lấy TỪ PAYLOAD
 *    (`quiz.multipleAnswerRule`) — xem `MULTIPLE_ANSWER_RULE_TEXT`.
 *
 * Quiz là loại nội dung DUY NHẤT không cần sandbox (`docs/quiz-format.md`), nên
 * trang này cố ý KHÔNG dùng khung phiên C5: không có phiên nào để bắt đầu, kết
 * thúc hay thêm giờ. Dựng một `SessionControls` chết ở đây sẽ là một khối điều
 * khiển không điều khiển gì.
 */

/** Màu của một lựa chọn sau khi nộp. Chỉ token C1. */
const REVEAL_CLASS: Record<ChoiceReveal, string> = {
  none: 'border-border',
  correct: 'border-success/50 bg-success/10',
  // Bỏ lỡ một đáp án đúng ≠ chọn sai. Hai màu khác nhau vì hai chuyện khác nhau.
  missed: 'border-success/50 bg-success/5 border-dashed',
  'wrong-pick': 'border-destructive/50 bg-destructive/10',
};

const REVEAL_NOTE: Record<ChoiceReveal, string | null> = {
  none: null,
  correct: 'Bạn chọn đúng',
  missed: 'Đáp án đúng — bạn chưa chọn',
  'wrong-pick': 'Bạn chọn nhưng không đúng',
};

export function QuizClient({ quizId }: { quizId: string }): React.ReactElement {
  const query = api.quiz.get.useQuery({ quizId });
  const [selected, setSelected] = useState<Record<string, readonly string[]>>({});
  const [result, setResult] = useState<QuizAttemptResult | null>(null);

  const submit = api.quiz.submit.useMutation({
    onSuccess: (data) => {
      setResult(data);
    },
  });

  if (query.isPending) {
    return (
      <PageShell title="Đang tải…">
        <div role="status" aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">Đang tải quiz…</span>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </PageShell>
    );
  }

  if (query.isError) {
    return (
      <PageShell title="Quiz">
        <ErrorState
          title="Không mở được quiz này"
          message={describeTrpcError(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </PageShell>
    );
  }

  const quiz: QuizForLearner = query.data.quiz;
  const progress = summarizeAnswers(quiz, selected);
  const graded = result !== null;

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

  const resultByQuestion = new Map(
    (result?.questions ?? []).map((entry) => [entry.questionId, entry]),
  );

  return (
    <PageShell title={quiz.title}>
      {quiz.description !== null && (
        <p className="text-sm text-muted-foreground">{quiz.description}</p>
      )}

      {/* AC #6 — quy tắc chấm đứng TRƯỚC câu hỏi đầu tiên, không phải sau khi nộp. */}
      <Card className="flex flex-col gap-1 p-4">
        <span className="text-sm font-medium text-foreground">Cách chấm</span>
        <span className="text-sm text-muted-foreground">
          {MULTIPLE_ANSWER_RULE_TEXT[quiz.multipleAnswerRule]}
        </span>
        <span className="text-sm text-muted-foreground">
          Đạt từ {quiz.passThresholdPercent}% số câu. Làm lại bao nhiêu lần cũng được.
        </span>
      </Card>

      {result !== null && <ScoreBanner result={result} threshold={quiz.passThresholdPercent} />}

      {/*
        Tiến độ TRẢ LỜI, chỉ trước khi nộp. Sau khi nộp nó vô nghĩa (mọi câu đã
        được chấm) và để lại sẽ là hai nhãn cùng nói về một bài — nhãn nào thắng
        thì người đọc phải tự đoán.
      */}
      {!graded && (
        <div role="status" className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-sm font-medium text-foreground">{progress.label}</p>
          {progress.caveat !== null && (
            <p className="mt-1 text-xs text-muted-foreground">{progress.caveat}</p>
          )}
        </div>
      )}

      <ol className="flex flex-col gap-4">
        {quiz.questions.map((question) => (
          <li key={question.id}>
            <QuestionCard
              question={question}
              selectedChoiceIds={selected[question.id] ?? []}
              outcome={resultByQuestion.get(question.id) ?? null}
              locked={graded}
              onToggle={(choiceId) => {
                toggle(question, choiceId);
              }}
            />
          </li>
        ))}
      </ol>

      {submit.isError && (
        <Alert variant="destructive">
          <AlertDescription className="text-foreground">
            Không nộp được bài: {describeTrpcError(submit.error)} — các lựa chọn của bạn vẫn còn
            trên màn hình, bấm Nộp bài để thử lại.
          </AlertDescription>
        </Alert>
      )}

      {result === null ? (
        <div className="flex flex-col gap-2">
          <Button onClick={onSubmit} loading={submit.isPending} className="self-start">
            Nộp bài
          </Button>
          {progress.unansweredCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Bạn vẫn nộp được khi còn câu bỏ trống — chúng sẽ tính là sai.
            </p>
          )}
        </div>
      ) : (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            setResult(null);
            setSelected({});
          }}
        >
          Làm lại từ đầu
        </Button>
      )}
    </PageShell>
  );
}

function QuestionCard({
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

  const choices = question.choices.map((choice) => {
    const reveal = choiceReveal(outcome, choice.id, selectedChoiceIds);
    const checked = selectedChoiceIds.includes(choice.id);
    const controlId = `${question.id}--${choice.id}`;
    return (
      <div
        key={choice.id}
        className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${REVEAL_CLASS[reveal]}`}
      >
          {/*
            Radix `RadioGroupItem`/`Checkbox` + `Label htmlFor` — bấm vào chữ
            chọn đúng ô, và ô nhận focus bằng bàn phím. `<input>` trần trước đây
            không đi theo token C1 nên nó là ô duy nhất trên trang không đổi màu
            khi bật dark mode.
          */}
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
          <Label htmlFor={controlId} className="flex-1 cursor-pointer font-normal">
            {choice.markdown}
          </Label>
        {REVEAL_NOTE[reveal] !== null && (
          <span className="shrink-0 text-xs text-muted-foreground">{REVEAL_NOTE[reveal]}</span>
        )}
      </div>
    );
  });

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">
          {question.ordinal + 1}. {question.markdown}
        </h2>
        {outcome != null && (
          <Badge variant={outcome.correct ? 'success' : 'warning'}>
            {outcome.correct ? 'Đúng' : 'Chưa đúng'}
          </Badge>
        )}
      </div>

      <span className="text-xs text-muted-foreground">
        {single ? 'Chọn một đáp án' : 'Chọn nhiều đáp án'}
      </span>

      {/*
        ⛔ KHÔNG bọc lựa chọn trong `<ul>/<li>`. Radix `RadioGroup.Root` đặt
        `role="radiogroup"`, và axe `aria-required-children` đòi con cháu mang
        `role="radio"` — một `<li>` chen vào giữa làm quan hệ đó gãy, tức một ô
        AC a11y của 13.H đỏ vì một thẻ trang trí. `<div>` không mang role nên nó
        trong suốt với phép kiểm đó. Nhánh nhiều-đáp-án dùng cùng khuôn để hai
        kiểu câu hỏi không trôi khỏi nhau về mặt markup.
      */}
      {single ? (
        <RadioGroup
          value={selectedChoiceIds[0] ?? ''}
          disabled={locked}
          onValueChange={(value) => {
            onToggle(value);
          }}
        >
          {choices}
        </RadioGroup>
      ) : (
        <div className="flex flex-col gap-2">{choices}</div>
      )}

      {/*
        Giải thích chỉ tới CÙNG kết quả — trước khi nộp nó không có trong payload
        (`QuizQuestionForLearner.explanation?: never`), và nó thường tiết lộ đáp
        án nên đó là rào thứ hai chứ không phải một chi tiết thừa.
      */}
      {outcome?.explanation != null && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">
          {outcome.explanation}
        </p>
      )}
    </Card>
  );
}

function ScoreBanner({
  result,
  threshold,
}: {
  result: QuizAttemptResult;
  threshold: number;
}): React.ReactElement {
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ${
        result.score.passed
          ? 'border-success/30 bg-success/10'
          : 'border-warning/30 bg-warning/10'
      }`}
    >
      <span className="text-lg font-semibold text-foreground">
        {result.score.correctCount}/{result.score.questionCount} câu — {result.score.percent}%
      </span>
      {/* Mốc đi kèm điểm: "60%" một mình không nói được đạt hay chưa. */}
      <span className="text-sm text-foreground">
        {result.score.passed ? 'Đạt' : 'Chưa đạt'} (mốc {threshold}%)
      </span>
      <span className="text-sm text-muted-foreground">Lần làm thứ {result.attemptNumber}</span>
    </div>
  );
}

function PageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  // ⛔ KHÔNG `<main>` ở đây (C6bis): vỏ ứng dụng sở hữu landmark đó, và hai
  // `<main>` lồng nhau làm axe của 13.H đỏ `landmark-unique`.
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link href="/quiz" className="text-sm text-muted-foreground hover:text-foreground">
          ← Quiz
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      </header>
      {children}
    </div>
  );
}
