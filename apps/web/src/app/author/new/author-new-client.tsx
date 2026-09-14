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
import { count, renderCopy, t } from '@devops-platform/copy';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { DraftFormView } from '../../../components/author/draft-form-view';
import { emptyDraft, toDraftInput, type DraftFormState, type FieldIssue } from '../../../components/author/draft-form';
import { KIND_KEYS } from '../../../components/author/content-state';
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
      toast({ title: t('author.new.created.title'), description: t('author.new.created.body') });
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
      collected.push({ path: 'id', message: parsedId.error.issues[0]?.message ?? t('author.new.id.invalid') });
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
          {'← '}
          {t('author.nav.back-to-list')}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('author.new.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('author.new.lead')}</p>
      </header>

      <section className="flex flex-col gap-5">
        <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">
          {t('author.new.identity-heading')}
        </h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-kind">{t('author.new.kind.label')}</Label>
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
                  {t(KIND_KEYS[value])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id="content-kind-hint" className="text-xs text-muted-foreground">
            {t('author.new.kind.hint')}
          </p>
        </div>

        <TextField
          label={t('author.new.id.label')}
          value={id}
          onChange={setId}
          error={idIssue}
          placeholder={t('author.new.id.placeholder')}
          hint={t('author.new.id.hint')}
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
          <AlertTitle>{count('author.issues.title', issues.length)}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {issues.map((issue) => (
                <li key={issue.path}>
                  <code className="font-mono">{issue.path}</code>
                  {renderCopy({ key: 'author.issues.row', params: { message: issue.message } })}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {serverError !== null && (
        <Alert variant="destructive">
          <AlertTitle>{t('author.new.error.title')}</AlertTitle>
          <AlertDescription>
            {serverError}
            <p className="mt-2">{t('author.new.error.next')}</p>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3">
        <Button onClick={onSubmit} loading={create.isPending}>
          {t('author.new.submit')}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/author">{t('common.action.cancel')}</Link>
        </Button>
      </div>
    </div>
  );
}
