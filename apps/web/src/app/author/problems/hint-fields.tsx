'use client';

import { t } from '@devops-platform/copy';
import type { ReactElement } from 'react';
import { Button } from '@devops-platform/ui';
import { TextAreaField, TextField, issueFor } from '../../../components/author/field';
import type { FieldIssue } from './cluster-form';
import { emptyHint, type HintFormState } from './problem-form';

/**
 * Gợi ý CÓ GIÁ — khác hẳn gợi ý miễn phí của `Level`.
 *
 * Ở một bài dạy, gợi ý là một phần của việc dạy nên nó miễn phí. Ở một OJ, mở
 * gợi ý là một đánh đổi có thật: được chỉ đường, mất điểm. Nên mỗi gợi ý mang
 * một số điểm bị trừ, và `0` là một lựa chọn hợp lệ cho gợi ý mở đầu.
 */
export function HintListFields(props: {
  readonly hints: readonly HintFormState[];
  readonly issues: readonly FieldIssue[];
  readonly nextKey: () => string;
  readonly onChange: (hints: readonly HintFormState[]) => void;
}): ReactElement {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">
        {t('problem.hint-fields-goi-y')}
      </h2>

      {props.hints.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t(
            'problem.hint-fields-chua-co-goi-y-nao-bai-khong-co-goi-y-van-xuat-ban-duoc-nhung-voi-bai-kho-tr',
          )}
        </p>
      )}

      {props.hints.map((hint, index) => (
        <div key={hint.key} className="flex flex-col gap-3 rounded-md border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-sm font-medium text-foreground">
              {t('problem.hint-fields-goi-y')} {String(index + 1)}
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                props.onChange(props.hints.filter((_, i) => i !== index));
              }}
            >
              {t('common.action.delete')}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={t('problem.hint-fields-dinh-danh')}
              value={hint.id}
              onChange={(id) => {
                props.onChange(
                  props.hints.map((item, i) => (i === index ? { ...item, id } : item)),
                );
              }}
              error={issueFor(props.issues, `hints.${String(index)}.id`)}
              hint={t(
                'problem.hint-fields-lich-su-mo-goi-y-luu-theo-id-nay-doi-la-mo-coi-du-lieu-cu',
              )}
            />
            <TextField
              label={t('problem.hint-fields-diem-bi-tru')}
              value={hint.penaltyPoints}
              onChange={(penaltyPoints) => {
                props.onChange(
                  props.hints.map((item, i) => (i === index ? { ...item, penaltyPoints } : item)),
                );
              }}
              inputMode="numeric"
              error={issueFor(props.issues, `hints.${String(index)}.penaltyPoints`)}
              hint={t('problem.hint-fields-0-mien-phi')}
            />
          </div>

          <TextAreaField
            label={t('problem.hint-fields-noi-dung')}
            value={hint.text}
            onChange={(text) => {
              props.onChange(
                props.hints.map((item, i) => (i === index ? { ...item, text } : item)),
              );
            }}
            rows={3}
            error={issueFor(props.issues, `hints.${String(index)}.text`)}
            hint={t('problem.hint-fields-goi-y-sau-nen-cu-the-hon-goi-y-truoc')}
          />
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const next = emptyHint(props.nextKey());
            props.onChange([
              ...props.hints,
              { ...next, id: `goi-y-${String(props.hints.length + 1)}` },
            ]);
          }}
        >
          {t('problem.hint-fields-them-goi-y')}
        </Button>
      </div>
    </section>
  );
}
