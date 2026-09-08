'use client';

import { useCallback, useRef, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle, Button, useToast } from '@devops-platform/ui';
import { api } from '../../../../lib/trpc-react';
import { describeTrpcError } from '../../../../lib/trpc';
import type { FieldIssue } from '../cluster-form';
import { emptyForm, type ProblemFormState } from '../problem-form';
import { toProblemDraft } from '../problem-draft';
import { ProblemEditor } from '../problem-editor';

/**
 * `/author/problems/new` — soạn một bài mới. Luôn ra một bản **nháp**.
 *
 * ## Vì sao trang này KHÔNG có cổng xuất bản
 *
 * Bài chưa tồn tại thì chưa có mã, mà `problems.publish` định vị bài bằng mã.
 * Nên đường duy nhất là: tạo nháp → máy chủ cấp mã → sang trang sửa → xuất bản.
 * Dựng một nút "tạo và xuất bản luôn" ở đây là ghép hai lời gọi API vào một nút
 * và bỏ mất trạng thái giữa chừng khi lời gọi thứ hai đỏ.
 *
 * ## Lưu nháp chỉ đòi bài CHUYỂN ĐƯỢC sang payload, không đòi bài đủ điều kiện
 *
 * `toProblemDraft` chỉ đỏ khi giá trị không serialise nổi (JSON hỏng, ô số không
 * phải số). "Chưa có mục tiêu bắt buộc", "đề bài quá dài" thì để dành cho cổng
 * xuất bản — bắt hoàn thiện bài trước khi được lưu lần đầu là mất hết công của
 * người đang viết dở.
 *
 * ⛔ Không dựng `<main>` (C6bis) — vỏ ứng dụng sở hữu landmark đó.
 */
export function ProblemNewClient(): ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const utils = api.useUtils();

  const keyCounter = useRef(0);
  const nextKey = useCallback(() => {
    keyCounter.current += 1;
    return `new-${String(keyCounter.current)}`;
  }, []);

  const [form, setForm] = useState<ProblemFormState>(() => emptyForm(nextKey));
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const create = api.problems.create.useMutation({
    onSuccess: (problem) => {
      void utils.problems.mine.invalidate();
      toast({
        title: `Đã tạo bản nháp ${problem.code}`,
        description: 'Người học chưa thấy bài này cho tới khi bạn xuất bản.',
      });
      router.push(`/author/problems/${encodeURIComponent(problem.code)}`);
    },
    onError: (error) => {
      setServerError(describeTrpcError(error));
    },
  });

  const submit = (): void => {
    setServerError(null);
    const draft = toProblemDraft(form);
    if (!draft.ok) {
      setIssues(draft.issues);
      return;
    }
    setIssues([]);
    create.mutate(draft.value);
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href="/author/problems" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Về danh sách bài tập
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Soạn bài tập mới</h1>
        <p className="text-sm text-muted-foreground">
          Bài OJ không dạy lý thuyết — nó ra đề, dựng sẵn một cụm, và chấm bằng vị từ chọn từ bảng tra. Không
          cần viết một dòng logic engine nào.
        </p>
      </header>

      {serverError !== null && (
        <Alert variant="destructive">
          <AlertTitle>Máy chủ từ chối</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      {issues.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Còn {String(issues.length)} ô chưa lưu được</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              {issues.map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <ProblemEditor
        form={form}
        onChange={setForm}
        issues={issues}
        code={null}
        state="draft"
        nextKey={nextKey}
        hasUnsavedChanges
        actions={
          <>
            <Button type="button" onClick={submit} loading={create.isPending}>
              Lưu bản nháp
            </Button>
            <span className="text-sm text-muted-foreground">
              Máy chủ cấp mã bài khi lưu. Xuất bản được làm ở trang sửa, sau khi có mã.
            </span>
          </>
        }
      />
    </div>
  );
}
