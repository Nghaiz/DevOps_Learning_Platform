'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@devops-platform/ui';
import { CONTENT_KINDS, type ContentKind } from '@devops-platform/shared-types/authoring';
import { scenarioIdSchema } from '@devops-platform/shared-types/scenario';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { DraftFormView } from '../../../components/author/draft-form-view';
import { emptyDraft, toDraftInput, type DraftFormState, type FieldIssue } from '../../../components/author/draft-form';
import { KIND_LABELS } from '../../../components/author/content-state';
import { TextField } from '../../../components/author/field';

/**
 * `/author/new` — tạo bài mới. Luôn ra một bản **nháp**.
 *
 * Hai field chỉ có ở đây và không bao giờ sửa được nữa:
 *
 * - **`id`** đi thẳng vào `progress.lesson_id` / `lab_attempts.lab_id` (cột text
 *   KHÔNG có khoá ngoại). Đổi nó sau khi có người học nghĩa là mọi dòng tiến độ
 *   cũ thành mồ côi trong im lặng. Nên router không có đường đổi id, và form
 *   nói thẳng điều đó trước khi người soạn gõ.
 * - **`kind`** quyết định schema xuất bản. `authoring.update` không nhận field
 *   này, nên loại nội dung là vĩnh viễn.
 *
 * ⛔ Không dựng `<main>` (C6bis).
 */
export function AuthorNewClient() {
  const router = useRouter();
  const { toast } = useToast();
  const utils = api.useUtils();

  const [kind, setKind] = useState<ContentKind>('lesson');
  const [id, setId] = useState('');
  const [form, setForm] = useState<DraftFormState>(() => emptyDraft());
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const keyCounter = useRef(0);
  const nextKey = useCallback(() => {
    keyCounter.current += 1;
    return `new-${String(keyCounter.current)}`;
  }, []);

  const create = api.authoring.create.useMutation({
    onSuccess: (result) => {
      void utils.authoring.list.invalidate();
      toast({ title: 'Đã tạo bản nháp', description: 'Người học chưa thấy bài này cho tới khi bạn xuất bản.' });
      router.push(`/author/${encodeURIComponent(result.id)}`);
    },
    onError: (error) => {
      setServerError(describeTrpcError(error));
    },
  });

  const onSubmit = (): void => {
    setServerError(null);

    const collected: FieldIssue[] = [];
    const parsedId = scenarioIdSchema.safeParse(id.trim());
    if (!parsedId.success) {
      collected.push({ path: 'id', message: parsedId.error.issues[0]?.message ?? 'id không hợp lệ' });
    }

    const payload = toDraftInput(kind, form);
    if (!payload.ok) {
      collected.push(...payload.issues);
    }

    if (collected.length > 0 || !payload.ok || !parsedId.success) {
      setIssues(collected);
      return;
    }

    setIssues([]);
    create.mutate({ ...payload.value, id: parsedId.data, kind } as Parameters<typeof create.mutate>[0]);
  };

  const idIssue = issues.find((issue) => issue.path === 'id')?.message ?? null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href="/author" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Về danh sách bài
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tạo bài mới</h1>
        <p className="text-sm text-muted-foreground">
          Bài mới luôn ở trạng thái Nháp. Bạn lưu được một bản viết dở — kiểm tra định dạng chỉ diễn ra lúc xuất
          bản.
        </p>
      </header>

      <section className="flex flex-col gap-5">
        <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">
          Định danh — không sửa lại được
        </h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-kind">Loại nội dung</Label>
          <Select
            value={kind}
            onValueChange={(next) => {
              setKind(next as ContentKind);
            }}
          >
            <SelectTrigger id="content-kind" aria-describedby="content-kind-hint">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_KINDS.map((value) => (
                <SelectItem key={value} value={value}>
                  {KIND_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id="content-kind-hint" className="text-xs text-muted-foreground">
            Bài học dẫn từng bước · Lab giao việc rồi chấm · Playground là sandbox trống. Không đổi được sau khi
            tạo.
          </p>
        </div>

        <TextField
          label="Id"
          value={id}
          onChange={setId}
          error={idIssue}
          placeholder="dlp-chan-doan-cpu"
          hint="Chỉ [a-z0-9-], 3–63 ký tự. Id đi vào bảng tiến độ và điểm của người học, nên nó là vĩnh viễn — đổi id sau này sẽ làm tiến độ cũ mồ côi."
        />
      </section>

      <DraftFormView
        kind={kind}
        value={form}
        onChange={setForm}
        issues={issues}
        disabled={create.isPending}
        nextKey={nextKey}
      />

      {issues.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Còn {issues.length} ô cần sửa</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {issues.map((issue) => (
                <li key={issue.path}>
                  <code className="font-mono">{issue.path}</code> — {issue.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {serverError !== null && (
        <Alert variant="destructive">
          <AlertTitle>Không tạo được bài</AlertTitle>
          <AlertDescription>
            {serverError}
            <p className="mt-2">Sửa theo thông báo trên rồi bấm lại. Nếu id đã có người dùng, hãy đổi id.</p>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3">
        <Button onClick={onSubmit} loading={create.isPending}>
          Tạo bản nháp
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/author">Huỷ</Link>
        </Button>
      </div>
    </div>
  );
}
