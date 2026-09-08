'use client';

import { useState, type ReactElement } from 'react';
import { Button, MarkdownView, Tabs, TabsContent, TabsList, TabsTrigger } from '@devops-platform/ui';
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
  const words = countWords(props.form.statement);
  const remaining = STATEMENT_WORD_LIMIT - words;
  const slugPreview = props.form.slug.trim() === '' ? toSlug(props.form.title) : props.form.slug;

  return (
    <section className="flex flex-col gap-5">
      <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">Mô tả</h2>

      <TextField
        label="Tên bài"
        value={props.form.title}
        onChange={(title) => {
          // Slug tự điền CHỈ khi còn trống. Không có cờ "đã chạm tay" nào cả:
          // trạng thái đã nói đủ, và một cờ ẩn là một chỗ để lệch. Khi người
          // soạn đã gõ slug thì gõ lại tên không bao giờ đè lên nữa.
          props.onChange(props.form.slug.trim() === '' ? { title, slug: toSlug(title) } : { title });
        }}
        error={issueFor(props.issues, 'title')}
        placeholder="Pod không khởi động được sau khi đổi image"
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">Mã bài</span>
        <p className="text-sm text-muted-foreground">
          {props.code === null ? (
            <>Máy chủ cấp khi bạn lưu lần đầu. Mã ổn định vĩnh viễn, không đổi kể cả khi bạn sửa đề.</>
          ) : (
            <code className="font-mono text-foreground">{props.code}</code>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <TextField
          label="Slug trong URL"
          value={props.form.slug}
          onChange={(slug) => {
            props.onChange({ slug });
          }}
          error={issueFor(props.issues, 'slug')}
          hint={
            <>
              Chữ thường, số và gạch nối. Slug đổi được khi sửa tên bài — khác mã bài, thứ không bao giờ đổi. Sẽ
              lưu thành <code className="font-mono">{slugPreview === '' ? '(trống)' : toSlug(slugPreview)}</code>.
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
            Sinh lại từ tên bài
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
            <TabsTrigger value="viet">Viết đề</TabsTrigger>
            <TabsTrigger value="xem">Xem trước</TabsTrigger>
          </TabsList>
          <TabsContent value="viet">
            <TextAreaField
              label="Đề bài (markdown)"
              value={props.form.statement}
              onChange={(statement) => {
                props.onChange({ statement });
              }}
              rows={10}
              error={issueFor(props.issues, 'statement')}
              placeholder={'Namespace `thanh-toan` có một Deployment không lên nổi replica nào.\n\nTìm nguyên nhân và đưa nó về đủ 3 replica sẵn sàng.'}
              hint="Bài OJ KHÔNG dạy lý thuyết — chỉ nói đề. Kiến thức nền để người làm tự tra."
            />
          </TabsContent>
          <TabsContent value="xem">
            <div className="rounded-md border border-border bg-card p-4">
              {props.form.statement.trim() === '' ? (
                <p className="text-sm text-muted-foreground">Chưa có gì để xem trước.</p>
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

function WordMeter({ words, remaining }: { readonly words: number; readonly remaining: number }): ReactElement {
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
      {String(words)}/{String(STATEMENT_WORD_LIMIT)} từ.{' '}
      {over
        ? `Vượt trần — phải cắt ${String(-remaining)} từ mới xuất bản được.`
        : near
          ? `Còn ${String(remaining)} từ. Bài OJ nói đề, không giảng bài.`
          : `Còn ${String(remaining)} từ.`}
    </p>
  );
}
