'use client';

import { t } from '@devops-platform/copy';
import { useRef, useState, type ReactElement } from 'react';
import { Bold, Code2, List, Heading2 } from 'lucide-react';
import {
  Button,
  MarkdownView,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@devops-platform/ui';
import { TextAreaField, TextField, issueFor } from '../../../components/author/field';
import type { FieldIssue } from './cluster-form';
import type { ProblemFormState } from './problem-form';
import { STATEMENT_WORD_LIMIT, countWords, toSlug } from './text-tools';

/**
 * Phần mô tả: tên, mã, slug, đề bài markdown.
 *
 * ## Bộ đếm từ không phải trang trí
 *
 * Trần 150 từ là hợp đồng, và `problems.publish` từ chối bài vượt trần. Không có
 * bộ đếm, người soạn viết xong 300 từ rồi mới biết — và phải tự đoán phải cắt
 * bao nhiêu. Nên bộ đếm hiện SỐ TỪ CÒN LẠI, và khi vượt thì nói thẳng phải cắt
 * bao nhiêu từ.
 *
 * Cảnh báo bật ở 80% chứ không đợi tới lúc vượt: một người đang viết cần biết
 * mình sắp chạm trần trong lúc còn đang nghĩ, chứ không phải sau khi đã viết
 * xong đoạn cuối.
 */
export function StatementFields(props: {
  readonly form: ProblemFormState;
  readonly onChange: (patch: Partial<ProblemFormState>) => void;
  readonly issues: readonly FieldIssue[];
  /** `null` với bài chưa lưu — máy chủ cấp mã, client không đoán. */
  readonly code: string | null;
}): ReactElement {
  const [tab, setTab] = useState('viet');
  const editor = useRef<HTMLDivElement>(null);
  const insert = (before: string, after: string, fallback: string) => {
    const input = editor.current?.querySelector('textarea');
    const start = input?.selectionStart ?? props.form.statement.length;
    const end = input?.selectionEnd ?? start;
    const selection = props.form.statement.slice(start, end) || fallback;
    props.onChange({
      statement:
        props.form.statement.slice(0, start) +
        before +
        selection +
        after +
        props.form.statement.slice(end),
    });
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + before.length, start + before.length + selection.length);
    });
  };
  const words = countWords(props.form.statement);
  const remaining = STATEMENT_WORD_LIMIT - words;
  const slugPreview = props.form.slug.trim() === '' ? toSlug(props.form.title) : props.form.slug;

  return (
    <section className="flex flex-col gap-5">
      <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">
        {t('problem.statement-fields-mo-ta')}
      </h2>

      <TextField
        label={t('problem.statement-fields-ten-bai')}
        value={props.form.title}
        onChange={(title) => {
          // Slug tự điền CHỈ khi còn trống. Không có cờ "đã chạm tay" nào cả:
          // trạng thái đã nói đủ, và một cờ ẩn là một chỗ để lệch. Khi người
          // soạn đã gõ slug thì gõ lại tên không bao giờ đè lên nữa.
          props.onChange(
            props.form.slug.trim() === '' ? { title, slug: toSlug(title) } : { title },
          );
        }}
        error={issueFor(props.issues, 'title')}
        placeholder={t('problem.statement-fields-pod-khong-khoi-dong-duoc-sau-khi-doi-image')}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {t('problem.statement-fields-ma-bai')}
        </span>
        <p className="text-sm text-muted-foreground">
          {props.code === null ? (
            <>
              {t(
                'problem.statement-fields-may-chu-cap-khi-ban-luu-lan-dau-ma-on-dinh-vinh-vien-khong-doi-ke-ca-khi-ba',
              )}
            </>
          ) : (
            <code className="font-mono text-foreground">{props.code}</code>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <TextField
          label={t('problem.statement-fields-slug-trong-url')}
          value={props.form.slug}
          onChange={(slug) => {
            props.onChange({ slug });
          }}
          error={issueFor(props.issues, 'slug')}
          hint={
            <>
              {t(
                'problem.statement-fields-chu-thuong-so-va-gach-noi-slug-doi-duoc-khi-sua-ten-bai-khac-ma-bai-la-thu',
              )}{' '}
              <code className="font-mono">
                {slugPreview === '' ? t('problem.statement-fields-trong') : toSlug(slugPreview)}
              </code>
              .
            </>
          }
        />
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={props.form.title.trim() === ''}
            onClick={() => {
              props.onChange({ slug: toSlug(props.form.title) });
            }}
          >
            {t('problem.statement-fields-sinh-lai-tu-ten-bai')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value);
          }}
        >
          <TabsList>
            <TabsTrigger value="viet">{t('problem.statement-fields-viet-de')}</TabsTrigger>
            <TabsTrigger value="xem">{t('problem.statement-fields-xem-truoc')}</TabsTrigger>
          </TabsList>
          <TabsContent value="viet">
            <div ref={editor}>
              <div
                className="practice-markdown-tools"
                role="group"
                aria-label={t('author.problem.markdown.toolbar')}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t('author.problem.markdown.heading')}
                  onClick={() => insert('\n## ', '\n', t('author.problem.markdown.seed-heading'))}
                >
                  <Heading2 size={17} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t('author.problem.markdown.bold')}
                  onClick={() => insert('**', '**', t('author.problem.markdown.seed-bold'))}
                >
                  <Bold size={17} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t('author.problem.markdown.list')}
                  onClick={() => insert('\n- ', '\n', t('author.problem.markdown.seed-list'))}
                >
                  <List size={17} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t('author.problem.markdown.code')}
                  onClick={() =>
                    insert('\n```\n', '\n```\n', t('author.problem.markdown.seed-code'))
                  }
                >
                  <Code2 size={17} />
                </Button>
                <span>{t('author.problem.markdown.badge')}</span>
              </div>
              <TextAreaField
                label={t('problem.statement-fields-de-bai-markdown')}
                value={props.form.statement}
                onChange={(statement) => {
                  props.onChange({ statement });
                }}
                rows={10}
                error={issueFor(props.issues, 'statement')}
                placeholder={t(
                  'problem.statement-fields-namespace-thanh-toan-co-mot-deployment-khong-len-noi-replica-nao-tim-nguyen',
                )}
                hint={t(
                  'problem.statement-fields-bai-oj-khong-day-ly-thuyet-chi-noi-de-kien-thuc-nen-de-nguoi-lam-tu-tra',
                )}
              />
            </div>
          </TabsContent>
          <TabsContent value="xem">
            <div className="rounded-md border border-border bg-card p-4">
              {props.form.statement.trim() === '' ? (
                <p className="text-sm text-muted-foreground">
                  {t('problem.statement-fields-chua-co-gi-de-xem-truoc')}
                </p>
              ) : (
                <MarkdownView markdown={props.form.statement} resolveAssetUrl={() => null} />
              )}
            </div>
          </TabsContent>
        </Tabs>
        <WordMeter words={words} remaining={remaining} />
      </div>
    </section>
  );
}

function WordMeter({
  words,
  remaining,
}: {
  readonly words: number;
  readonly remaining: number;
}): ReactElement {
  const over = remaining < 0;
  const near = !over && words >= STATEMENT_WORD_LIMIT * 0.8;
  /*
   * `text-warning`, KHÔNG phải `text-warning-foreground`: cái thứ hai là màu chữ
   * dành để nằm TRÊN nền `--warning` (gần trắng ở nhánh sáng), nên đặt nó trên
   * nền trang là chữ trắng trên nền trắng. Cùng một bẫy tên với cặp
   * `--difficulty-*` / `-foreground`.
   */
  const tone = over ? 'text-destructive' : near ? 'text-warning' : 'text-muted-foreground';

  return (
    <p className={`text-xs ${tone}`} aria-live="polite">
      {String(words)}/{String(STATEMENT_WORD_LIMIT)} {t('problem.statement-fields-tu')}{' '}
      {over
        ? t('problem.statement-fields-vuot-tran-phai-cat-tu-moi-xuat-ban-duoc', {
            remaining: String(-remaining),
          })
        : near
          ? t('problem.statement-fields-con-tu-bai-oj-noi-de-khong-giang-bai', {
              remaining: String(remaining),
            })
          : t('problem.statement-fields-con-tu', { remaining: String(remaining) })}
    </p>
  );
}
