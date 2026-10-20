'use client';

import { useRef, useState, type ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Markdown } from '@devops-platform/ds/content';
import { contentLabels } from '../../../components/session/practice-labels';
import { TextAreaField, TextField, issueFor } from '../../../components/author/field';
import type { FieldIssue } from './cluster-form';
import type { ProblemFormState } from './problem-form';
import { STATEMENT_WORD_LIMIT, countWords, toSlug } from './text-tools';
import { Button, IconButton, ProgressLine, Tabs, TabsContent, TabsList, TabsTrigger, type IconName } from '@devops-platform/ds';

const LABELS = contentLabels();

const WRITE = 'viet';
const PREVIEW = 'xem';

/**
 * Tên, mã, slug và đề bài markdown.
 *
 * Bộ đếm từ không phải trang trí: trần 150 từ là hợp đồng, `problems.publish` từ
 * chối bài vượt trần. Thước đo đổi màu ở 80% chứ không đợi tới lúc vượt, vì người
 * đang viết cần biết mình sắp chạm trần khi còn đang nghĩ.
 */
export function StatementFields(props: {
  readonly form: ProblemFormState;
  readonly onChange: (patch: Partial<ProblemFormState>) => void;
  readonly issues: readonly FieldIssue[];
  /** `null` với bài chưa lưu: máy chủ cấp mã, client không đoán. */
  readonly code: string | null;
}): ReactElement {
  const [tab, setTab] = useState(WRITE);
  const editor = useRef<HTMLDivElement>(null);
  const { form } = props;
  const slugPreview = form.slug.trim() === '' ? toSlug(form.title) : toSlug(form.slug);

  const insert = (before: string, after: string, fallback: string): void => {
    const input = editor.current?.querySelector('textarea');
    const start = input?.selectionStart ?? form.statement.length;
    const end = input?.selectionEnd ?? start;
    const selection = form.statement.slice(start, end) || fallback;
    props.onChange({
      statement: form.statement.slice(0, start) + before + selection + after + form.statement.slice(end),
    });
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + before.length, start + before.length + selection.length);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <TextField
        label={t('problem.statement-fields-ten-bai')}
        value={form.title}
        path="title"
        onChange={(title) => {
          // Slug tự điền CHỈ khi còn trống. Không có cờ "đã chạm tay": trạng thái
          // đã nói đủ, và một cờ ẩn là một chỗ để lệch.
          props.onChange(form.slug.trim() === '' ? { title, slug: toSlug(title) } : { title });
        }}
        error={issueFor(props.issues, 'title')}
        placeholder={t('problem.statement-fields-pod-khong-khoi-dong-duoc-sau-khi-doi-image')}
      />

      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-semibold text-ink">{t('problem.statement-fields-ma-bai')}</p>
          {props.code === null ? (
            <p className="text-sm text-ink-2">
              {t(
                'problem.statement-fields-may-chu-cap-khi-ban-luu-lan-dau-ma-on-dinh-vinh-vien-khong-doi-ke-ca-khi-ba',
              )}
            </p>
          ) : (
            <>
              <code className="inline-flex h-10 w-fit items-center bg-well px-3 font-mono text-sm text-ink">
                {props.code}
              </code>
              <p className="text-xs text-ink-2">{t('author.problem.code-note')}</p>
            </>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <TextField
            label={t('problem.statement-fields-slug-trong-url')}
            value={form.slug}
            path="slug"
            onChange={(slug) => {
              props.onChange({ slug });
            }}
            error={issueFor(props.issues, 'slug')}
            hint={
              <>
                {t(
                  'problem.statement-fields-chu-thuong-so-va-gach-noi-slug-doi-duoc-khi-sua-ten-bai-khac-ma-bai-la-thu',
                )}{' '}
                <code className="font-mono text-ink">
                  {slugPreview === '' ? t('problem.statement-fields-trong') : slugPreview}
                </code>
              </>
            }
          />
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={form.title.trim() === ''}
              icon="refresh"
              onClick={() => {
                props.onChange({ slug: toSlug(form.title) });
              }}
            >
              {t('problem.statement-fields-sinh-lai-tu-ten-bai')}
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-3">
        <TabsList className="w-fit">
          <TabsTrigger value={WRITE}>{t('problem.statement-fields-viet-de')}</TabsTrigger>
          <TabsTrigger value={PREVIEW}>{t('problem.statement-fields-xem-truoc')}</TabsTrigger>
        </TabsList>
        <TabsContent value={WRITE} className="focus-visible:outline-none">
          <div ref={editor} className="flex flex-col gap-2">
            <div
              role="group"
              aria-label={t('author.problem.markdown.toolbar')}
              className="flex flex-wrap items-center gap-1 border-b border-rule pb-2"
            >
              <ToolButton icon="heading" label={t('author.problem.markdown.heading')} onClick={() => insert('\n## ', '\n', t('author.problem.markdown.seed-heading'))} />
              <ToolButton icon="bold" label={t('author.problem.markdown.bold')} onClick={() => insert('**', '**', t('author.problem.markdown.seed-bold'))} />
              <ToolButton icon="list" label={t('author.problem.markdown.list')} onClick={() => insert('\n- ', '\n', t('author.problem.markdown.seed-list'))} />
              <ToolButton icon="code" label={t('author.problem.markdown.code')} onClick={() => insert('\n```\n', '\n```\n', t('author.problem.markdown.seed-code'))} />
              <span className="ml-auto text-xs font-medium text-ink-3">{t('author.problem.markdown.badge')}</span>
            </div>
            <TextAreaField
              label={t('problem.statement-fields-de-bai-markdown')}
              value={form.statement}
              path="statement"
              onChange={(statement) => {
                props.onChange({ statement });
              }}
              rows={12}
              error={issueFor(props.issues, 'statement')}
              placeholder={t(
                'problem.statement-fields-namespace-thanh-toan-co-mot-deployment-khong-len-noi-replica-nao-tim-nguyen',
              )}
              hint={t('problem.statement-fields-bai-oj-khong-day-ly-thuyet-chi-noi-de-kien-thuc-nen-de-nguoi-lam-tu-tra')}
            />
          </div>
        </TabsContent>
        <TabsContent value={PREVIEW} className="focus-visible:outline-none">
          <div className="min-h-48 rounded-lg border border-rule bg-paper px-5 py-4">
            {form.statement.trim() === '' ? (
              <p className="text-sm text-ink-2">{t('problem.statement-fields-chua-co-gi-de-xem-truoc')}</p>
            ) : (
              <Markdown markdown={form.statement} labels={LABELS} resolveAssetUrl={() => null} />
            )}
          </div>
        </TabsContent>
        <WordMeter words={countWords(form.statement)} />
      </Tabs>
    </div>
  );
}

function ToolButton(props: { readonly icon: IconName; readonly label: string; readonly onClick: () => void }): ReactElement {
  return <IconButton type="button" icon={props.icon} label={props.label} size="icon-sm" onClick={props.onClick} />;
}

function WordMeter({ words }: { readonly words: number }): ReactElement {
  const remaining = STATEMENT_WORD_LIMIT - words;
  const over = remaining < 0;
  const near = !over && words >= STATEMENT_WORD_LIMIT * 0.8;
  const count = `${String(words)}/${String(STATEMENT_WORD_LIMIT)} ${t('problem.statement-fields-tu')}`;
  const tone = over ? 'text-bad-ink' : near ? 'text-warn-ink' : 'text-ink-2';
  return (
    <div className="flex flex-col gap-1.5">
      <ProgressLine
        value={Math.min(words, STATEMENT_WORD_LIMIT) / STATEMENT_WORD_LIMIT}
        role="meter"
        tone={over ? 'bad' : near ? 'warn' : 'acc'}
        label={count}
        className="max-w-sm"
      />
      <p className={`text-xs ${tone}`} aria-live="polite">
        {count}{' '}
        {over
          ? t('problem.statement-fields-vuot-tran-phai-cat-tu-moi-xuat-ban-duoc', { remaining: String(-remaining) })
          : near
            ? t('problem.statement-fields-con-tu-bai-oj-noi-de-khong-giang-bai', { remaining: String(remaining) })
            : t('problem.statement-fields-con-tu', { remaining: String(remaining) })}
      </p>
    </div>
  );
}
