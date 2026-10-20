'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { TextAreaField, TextField, issueFor } from '../../../components/author/field';
import type { FieldIssue } from './cluster-form';
import { ItemBlock } from './item-block';
import { emptyHint, type HintFormState } from './problem-form';
import { Button } from '@devops-platform/ds';

/**
 * Gợi ý CÓ GIÁ, khác hẳn gợi ý miễn phí của bài học.
 *
 * Ở một bài dạy, gợi ý là một phần của việc dạy nên nó miễn phí. Ở một OJ, mở
 * gợi ý là một đánh đổi có thật: được chỉ đường, mất điểm. Nên mỗi gợi ý mang
 * một số điểm bị trừ, và `0` là lựa chọn hợp lệ cho gợi ý mở đầu.
 */
export function HintListFields(props: {
  readonly hints: readonly HintFormState[];
  readonly issues: readonly FieldIssue[];
  readonly nextKey: () => string;
  readonly onChange: (hints: readonly HintFormState[]) => void;
}): ReactElement {
  const patchAt = (index: number, part: Partial<HintFormState>): void => {
    props.onChange(props.hints.map((item, i) => (i === index ? { ...item, ...part } : item)));
  };

  return (
    <div className="flex flex-col gap-6">
      {props.hints.length === 0 && (
        <p className="text-sm text-ink-2">
          {t('problem.hint-fields-chua-co-goi-y-nao-bai-khong-co-goi-y-van-xuat-ban-duoc-nhung-voi-bai-kho-tr')}
        </p>
      )}

      {props.hints.map((hint, index) => {
        const base = `hints.${String(index)}`;
        return (
          <ItemBlock
            key={hint.key}
            index={index}
            path={base}
            title={`${t('problem.hint-fields-goi-y')} ${String(index + 1)}`}
            actions={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon="trash"
                onClick={() => {
                  props.onChange(props.hints.filter((_, i) => i !== index));
                }}
              >
                {t('common.action.delete')}
              </Button>
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label={t('problem.hint-fields-dinh-danh')}
                value={hint.id}
                path={`${base}.id`}
                onChange={(id) => {
                  patchAt(index, { id });
                }}
                error={issueFor(props.issues, `${base}.id`)}
                hint={t('problem.hint-fields-lich-su-mo-goi-y-luu-theo-id-nay-doi-la-mo-coi-du-lieu-cu')}
              />
              <TextField
                label={t('problem.hint-fields-diem-bi-tru')}
                value={hint.penaltyPoints}
                path={`${base}.penaltyPoints`}
                onChange={(penaltyPoints) => {
                  patchAt(index, { penaltyPoints });
                }}
                inputMode="numeric"
                error={issueFor(props.issues, `${base}.penaltyPoints`)}
                hint={t('problem.hint-fields-0-mien-phi')}
              />
            </div>
            <TextAreaField
              label={t('problem.hint-fields-noi-dung')}
              value={hint.text}
              path={`${base}.text`}
              onChange={(text) => {
                patchAt(index, { text });
              }}
              rows={3}
              error={issueFor(props.issues, `${base}.text`)}
              hint={t('problem.hint-fields-goi-y-sau-nen-cu-the-hon-goi-y-truoc')}
            />
          </ItemBlock>
        );
      })}

      <div>
        <Button
          type="button"
          variant="secondary"
          icon="plus"
          onClick={() => {
            const next = emptyHint(props.nextKey());
            props.onChange([...props.hints, { ...next, id: `goi-y-${String(props.hints.length + 1)}` }]);
          }}
        >
          {t('problem.hint-fields-them-goi-y')}
        </Button>
      </div>
    </div>
  );
}
