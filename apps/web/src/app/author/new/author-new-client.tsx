'use client';

import { useCallback, useRef, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Label, Notice, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, toast } from '@devops-platform/ds';
import { CONTENT_KINDS, type ContentKind } from '@devops-platform/shared-types/authoring';
import { scenarioIdSchema } from '@devops-platform/shared-types/scenario';
import { t } from '@devops-platform/copy';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { DraftFormView } from '../../../components/author/draft-form-view';
import { emptyDraft, toDraftInput, type DraftFormState, type FieldIssue } from '../../../components/author/draft-form';
import { KIND_KEYS } from '../../../components/author/content-state';
import { TextField } from '../../../components/author/field';
import { toLessonIssues } from '../../../components/author/lesson-issues';
import {
  FormBlock,
  IssueList,
  RailSection,
  SaveState,
  StudioEditorFrame,
  fieldPathProps,
  focusFieldByPath,
  saveStatusOf,
} from '../../../components/author/studio';

/**
 * `/author/new`: tạo bài mới. Luôn ra một bản NHÁP.
 *
 * Hai field chỉ có ở đây và không bao giờ sửa được nữa:
 *
 * - **`id`** đi thẳng vào `progress.lesson_id` / `lab_attempts.lab_id` (cột text KHÔNG có
 *   khoá ngoại). Đổi nó sau khi có người học nghĩa là mọi dòng tiến độ cũ thành mồ côi
 *   trong im lặng, nên router không có đường đổi id.
 * - **`kind`** quyết định schema xuất bản. `authoring.update` không nhận field này, nên
 *   loại nội dung là vĩnh viễn.
 *
 * Không có hàng tab chế độ: Xem trước, Tệp và Xuất bản cần một bài đã có trên máy chủ,
 * nên trang này chỉ có một việc.
 *
 * ⛔ Không dựng `<main>`: vỏ ứng dụng sở hữu landmark đó.
 */
export function AuthorNewClient(): ReactElement {
  const router = useRouter();
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
      toast.success(t('author.new.created.title'), { description: t('author.new.created.body') });
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
  const railIssues = toLessonIssues(kind, issues);
  const status = saveStatusOf({ persisted: false, dirty: true, saving: create.isPending, failed: serverError !== null });

  return (
    <StudioEditorFrame
      crumbs={[{ href: '/author', label: t('shell.nav.author') }, { label: t('author.new.title') }]}
      title={t('author.new.title')}
      toolbar={
        <>
          <SaveState status={status} />
          {/* "Huỷ" đứng CÙNG nhóm với nút tạo, như trang sửa bài, chứ không tách lên đầu trang. */}
          <Button variant="ghost" asChild>
            <Link href="/author">{t('common.action.cancel')}</Link>
          </Button>
          <Button variant="primary" icon="plus" onClick={onSubmit} loading={create.isPending}>
            {t('author.new.submit')}
          </Button>
        </>
      }
      notice={
        serverError === null ? undefined : (
          <Notice tone="bad" title={t('author.new.error.title')}>
            {serverError}
            <p className="mt-2">{t('author.new.error.next')}</p>
          </Notice>
        )
      }
      rail={
        <>
          <RailSection title={t('author.studio.rail.issues')} tone={railIssues.length > 0 ? 'bad' : 'accent'}>
            {railIssues.length > 0 ? (
              <IssueList issues={railIssues} onJump={(path) => focusFieldByPath(path)} />
            ) : (
              <p>{t('author.studio.rail.issues-clean')}</p>
            )}
          </RailSection>
          <RailSection title={t('author.new.after-title')}>
            <p>{t('author.new.after-body')}</p>
          </RailSection>
        </>
      }
    >
      <div className="flex flex-col gap-12">
        <FormBlock title={t('author.new.identity-heading')}>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5" {...fieldPathProps('kind')}>
              <Label htmlFor="content-kind">{t('author.new.kind.label')}</Label>
              <Select
                value={kind}
                onValueChange={(next) => {
                  if ((CONTENT_KINDS as readonly string[]).includes(next)) setKind(next as ContentKind);
                }}
              >
                <SelectTrigger id="content-kind" aria-describedby="content-kind-hint" className="max-w-xs">
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
              <p id="content-kind-hint" className="text-xs leading-relaxed text-ink-3">
                {t('author.new.kind.hint')}
              </p>
            </div>

            <TextField
              label={t('author.new.id.label')}
              path="id"
              value={id}
              onChange={setId}
              error={idIssue}
              placeholder={t('author.new.id.placeholder')}
              hint={t('author.new.id.hint')}
            />
          </div>
        </FormBlock>

        <DraftFormView kind={kind} value={form} onChange={setForm} issues={issues} disabled={create.isPending} nextKey={nextKey} />
      </div>
    </StudioEditorFrame>
  );
}
