'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle, Button, ErrorState, Skeleton } from '@devops-platform/ui';
import { api } from '../../../../lib/trpc-react';
import { describeTrpcError } from '../../../../lib/trpc';
import { useProblemMutations } from './use-problem-mutations';
import type { FieldIssue } from '../cluster-form';
import { formFromProblem, type ProblemFormState } from '../problem-form';
import { toProblemDraft } from '../problem-draft';
import { publishIssues } from '../problem-validate';
import { ProblemEditor } from '../problem-editor';
import { PublishCheck } from '../publish-check';

/**
 * `/author/problems/[code]` — sửa một bài đã lưu.
 *
 * ## Nạp MỘT lần cho mỗi mã
 *
 * Cổng `form !== null` không phải tối ưu hoá: `byCode` được `invalidate` sau mỗi
 * lượt lưu, và nếu effect chạy lại thì nó ghi đè những gì người soạn đang gõ
 * bằng bản vừa lưu — mọi thay đổi sau lượt lưu biến mất khi query trả về. Đúng
 * cái bẫy `author/[id]` đã ghi lại.
 *
 * ## "Chưa lưu" so bằng payload, không so bằng state form
 *
 * `savedSnapshot` giữ payload đã gửi lên, không giữ `ProblemFormState`: state
 * mang khoá React (`key`) đổi mỗi lần thêm/xoá dòng, nên so state sẽ báo "chưa
 * lưu" ngay sau một lượt lưu thành công. So payload thì chỉ đổi khi NỘI DUNG
 * đổi — và đó mới là thứ cảnh báo ở tab Thử cần biết.
 *
 * ⛔ Không dựng `<main>` (C6bis). ⛔ Không `useInfiniteQuery`.
 */
export function ProblemEditClient({ code }: { readonly code: string }): ReactElement {

  const keyCounter = useRef(0);
  const nextKey = useCallback(() => {
    keyCounter.current += 1;
    return `k-${String(keyCounter.current)}`;
  }, []);

  // `forEdit`, KHÔNG `byCode`: `byCode` là đường của NGƯỜI XEM và nó CHE nội
  // dung gợi ý với người không phải chủ bài. Trình soạn phải đọc được đúng thứ
  // mình vừa viết, nên nó đi đường của người soạn.
  const query = api.problems.forEdit.useQuery({ code }, { retry: false });
  const [form, setForm] = useState<ProblemFormState | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);

  const loaded = query.data ?? null;

  useEffect(() => {
    if (form !== null || loaded === null) {
      return;
    }
    const next = formFromProblem(loaded, nextKey);
    setForm(next);
    const draft = toProblemDraft(next);
    setSavedSnapshot(draft.ok ? JSON.stringify(draft.value) : null);
  }, [loaded, form, nextKey]);

  const { update, publish, archive, remove, busy, serverError, setServerError } =
    useProblemMutations(code);

  const gateIssues = useMemo(() => (form === null ? [] : publishIssues(form)), [form]);
  const currentSnapshot = useMemo(() => {
    if (form === null) {
      return null;
    }
    const draft = toProblemDraft(form);
    return draft.ok ? JSON.stringify(draft.value) : null;
  }, [form]);
  const hasUnsavedChanges = savedSnapshot === null || currentSnapshot !== savedSnapshot;

  if (query.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-10" aria-hidden>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (query.isError || loaded === null || form === null) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-10">
        <ErrorState
          title="Không mở được bài này"
          message={query.error === null ? 'Không đọc được nội dung bài.' : describeTrpcError(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </div>
    );
  }

  const save = (): void => {
    setServerError(null);
    const draft = toProblemDraft(form);
    if (!draft.ok) {
      setIssues(draft.issues);
      return;
    }
    setIssues([]);
    setSavedSnapshot(JSON.stringify(draft.value));
    update.mutate({ code, ...draft.value });
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href="/author/problems" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Về danh sách bài tập
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {form.title === '' ? code : form.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          <code className="font-mono">{code}</code> · mã không đổi kể cả khi bạn sửa đề hay đổi slug.
        </p>
      </header>

      {serverError !== null && (
        <Alert variant="destructive">
          <AlertTitle>Máy chủ từ chối</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <ProblemEditor
        form={form}
        onChange={setForm}
        issues={issues}
        code={code}
        state={loaded.state}
        nextKey={nextKey}
        hasUnsavedChanges={hasUnsavedChanges}
        publishTab={
          <PublishCheck
            state={loaded.state}
            issues={gateIssues}
            busy={busy}
            onPublish={() => {
              setServerError(null);
              publish.mutate({ code });
            }}
            onArchive={() => {
              setServerError(null);
              archive.mutate({ code });
            }}
            onDelete={() => {
              setServerError(null);
              remove.mutate({ code });
            }}
          />
        }
        actions={
          <>
            <Button type="button" onClick={save} loading={update.isPending} disabled={busy}>
              Lưu
            </Button>
            <span className="text-sm text-muted-foreground">
              {hasUnsavedChanges ? 'Có thay đổi chưa lưu.' : 'Đã lưu mọi thay đổi.'}
            </span>
          </>
        }
      />
    </div>
  );
}
