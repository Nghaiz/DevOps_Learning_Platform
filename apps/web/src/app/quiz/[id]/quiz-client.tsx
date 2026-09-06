'use client';

import { useState } from 'react';
import Link from 'next/link';
import type {
  QuizAttemptResult,
  QuizForLearner,
  QuizMultipleAnswerRule,
  QuizQuestionForLearner,
} from '@devops-platform/shared-types/quiz';
import { Button, Card } from '@devops-platform/ui';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';

/**
 * Làm quiz — GIÀN GIÁO (P10 10.C). Bản đầy đủ ở P13 (13.D task 14).
 *
 * ## Hai tính chất của file này là ô AC, không phải lựa chọn giao diện
 *
 * 1. **Không có đáp án nào ở đây.** `quiz.get` trả `QuizForLearner`, một type
 *    mà `isCorrect`/`explanation` được khai `never` — nên kể cả muốn, file này
 *    cũng không đọc được đáp án để tô màu trước khi nộp. Đúng/sai chỉ xuất hiện
 *    sau khi `quiz.submit` trả về.
 * 2. **Quy tắc chấm hiện TRƯỚC khi làm** (AC #6), và câu chữ lấy TỪ PAYLOAD
 *    (`quiz.multipleAnswerRule`) chứ không viết cứng ở FE. Viết cứng là dựng
 *    nguồn thứ hai cho một luật server sở hữu, và nó sẽ trôi khỏi cách chấm
 *    thật ở lần đầu tiên server đổi luật.
 */

const RULE_TEXT: Record<QuizMultipleAnswerRule, string> = {
  'all-or-nothing':
    'Câu nhiều đáp án: phải chọn ĐÚNG và ĐỦ mọi đáp án đúng mới được tính điểm — không có điểm một phần.',
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
        <p className="text-sm text-slate-500">Đang tải quiz…</p>
      </PageShell>
    );
  }

  if (query.isError) {
    return (
      <PageShell title="Quiz">
        <p className="text-sm text-red-700" role="alert">
          {describeTrpcError(query.error)}
        </p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Thử lại
        </Button>
      </PageShell>
    );
  }

  const quiz: QuizForLearner = query.data.quiz;

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
      {quiz.description !== null && <p className="text-sm text-slate-600">{quiz.description}</p>}

      {/* AC #6 — quy tắc chấm đứng TRƯỚC câu hỏi đầu tiên, không phải sau khi nộp. */}
      <Card className="flex flex-col gap-1 border-sky-200 bg-sky-50">
        <span className="text-sm font-medium text-sky-900">Cách chấm</span>
        <span className="text-sm text-sky-900">{RULE_TEXT[quiz.multipleAnswerRule]}</span>
        <span className="text-sm text-sky-900">
          Đạt từ {quiz.passThresholdPercent}% số câu. Làm lại bao nhiêu lần cũng được.
        </span>
      </Card>

      {result !== null && <ScoreBanner result={result} />}

      <ol className="flex flex-col gap-4">
        {quiz.questions.map((question) => {
          const outcome = resultByQuestion.get(question.id);
          return (
            <li key={question.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium text-slate-900">
                    {question.ordinal + 1}. {question.markdown}
                  </span>
                  {outcome !== undefined && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                        outcome.correct
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {outcome.correct ? 'Đúng' : 'Sai'}
                    </span>
                  )}
                </div>

                <span className="text-xs text-slate-500">
                  {question.kind === 'single' ? 'Chọn một đáp án' : 'Chọn nhiều đáp án'}
                </span>

                <ul className="flex flex-col gap-2">
                  {question.choices.map((choice) => {
                    const checked = (selected[question.id] ?? []).includes(choice.id);
                    // `outcome` chỉ tồn tại SAU khi nộp — trước đó không có gì
                    // ở client nói lựa chọn nào đúng.
                    const isAnswer = outcome?.correctChoiceIds.includes(choice.id) ?? false;
                    return (
                      <li key={choice.id}>
                        <label
                          className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm ${
                            outcome !== undefined && isAnswer
                              ? 'border-emerald-300 bg-emerald-50'
                              : 'border-slate-200'
                          }`}
                        >
                          <input
                            type={question.kind === 'single' ? 'radio' : 'checkbox'}
                            name={question.id}
                            checked={checked}
                            disabled={result !== null}
                            onChange={() => {
                              toggle(question, choice.id);
                            }}
                          />
                          <span>{choice.markdown}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                {/* Giải thích chỉ tới cùng kết quả — trước khi nộp nó không có trong payload. */}
                {outcome?.explanation != null && (
                  <p className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {outcome.explanation}
                  </p>
                )}
              </Card>
            </li>
          );
        })}
      </ol>

      {submit.isError && (
        <p className="text-sm text-red-700" role="alert">
          {describeTrpcError(submit.error)}
        </p>
      )}

      {result === null ? (
        <Button onClick={onSubmit} disabled={submit.isPending}>
          {submit.isPending ? 'Đang chấm…' : 'Nộp bài'}
        </Button>
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            setResult(null);
            setSelected({});
          }}
        >
          Làm lại
        </Button>
      )}
    </PageShell>
  );
}

function ScoreBanner({ result }: { result: QuizAttemptResult }): React.ReactElement {
  return (
    <Card
      className={`flex flex-wrap items-center gap-3 ${
        result.score.passed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
      }`}
    >
      <span className="text-lg font-semibold text-slate-900">
        {result.score.correctCount}/{result.score.questionCount} câu — {result.score.percent}%
      </span>
      <span className="text-sm text-slate-700">{result.score.passed ? 'Đạt' : 'Chưa đạt'}</span>
      <span className="text-sm text-slate-500">Lần làm thứ {result.attemptNumber}</span>
    </Card>
  );
}

function PageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link href="/paths" className="text-sm text-slate-500 hover:underline">
          ← Lộ trình
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      </header>
      {children}
    </div>
  );
}
