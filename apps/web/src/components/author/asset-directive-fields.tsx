'use client';

import { t } from '@devops-platform/copy';
import { useId, type CSSProperties, type ReactElement } from 'react';
import type { AssetDirectiveFormState, FieldIssue } from './draft-form';
import { TextField, issueFor } from './field';
import { Button, Icon, Notice } from '@devops-platform/ds';

/**
 * `ScenarioAsset[]`: chỉ thị CHÉP FILE VÀO POD lúc dựng sandbox.
 *
 * ⚠ Đây KHÔNG phải tệp tải lên. Hai thứ trùng tên "asset" trong cùng một router
 * và chúng không liên quan gì tới nhau:
 *
 * | | Ở đâu | Dùng làm gì |
 * |---|---|---|
 * | `assets` (khối này) | cột `content_items.assets` | chép file có sẵn trong image vào pod |
 * | `content_assets` (tab Tệp) | bảng riêng, `uploadAsset` | ảnh nhúng trong markdown |
 *
 * Người soạn gõ nhầm khối này để mong tải ảnh lên là chuyện sẽ xảy ra, nên câu
 * cảnh báo nằm ngay trên đầu chứ không nằm trong tài liệu.
 *
 * Đường dữ liệu ô: `assets[N].host|file|target|chmod`, N là vị trí 0-based.
 */
export function AssetDirectiveFields(props: {
  readonly value: readonly AssetDirectiveFormState[];
  readonly onChange: (next: readonly AssetDirectiveFormState[]) => void;
  readonly onAdd: () => void;
  readonly issues: readonly FieldIssue[];
  readonly disabled?: boolean | undefined;
}): ReactElement {
  const { value, onChange, disabled } = props;
  const patchAt = (index: number, part: Partial<AssetDirectiveFormState>): void => {
    onChange(value.map((item, i) => (i === index ? { ...item, ...part } : item)));
  };

  return (
    <div className="flex flex-col gap-6">
      <Notice tone="info">
          {t('author.asset-directive-fields-khoi-nay-khong-tai-tep-len-no-khai-mot-file')}
        </Notice>

      {value.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <Icon name="upload" size={16} className="shrink-0" />
          {t('author.asset-directive-fields-chua-co-chi-thi')}
        </p>
      ) : (
        <ol className="flex flex-col">
          {value.map((asset, index) => (
            <li key={asset.key}>
              <DirectiveRow
                index={index}
                asset={asset}
                issues={props.issues}
                disabled={disabled}
                onPatch={(part) => {
                  patchAt(index, part);
                }}
                onRemove={() => {
                  onChange(value.filter((_, i) => i !== index));
                }}
              />
            </li>
          ))}
        </ol>
      )}

      <div>
        <Button variant="secondary" icon="plus" onClick={props.onAdd} disabled={disabled}>
          {t('author.asset-directive-fields-them-chi-thi')}
        </Button>
      </div>
    </div>
  );
}

function DirectiveRow(props: {
  readonly index: number;
  readonly asset: AssetDirectiveFormState;
  readonly issues: readonly FieldIssue[];
  readonly disabled?: boolean | undefined;
  readonly onPatch: (part: Partial<AssetDirectiveFormState>) => void;
  readonly onRemove: () => void;
}): ReactElement {
  const { index, asset, issues, disabled, onPatch } = props;
  const headingId = useId();
  const at = (field: keyof Omit<AssetDirectiveFormState, 'key'>): string => `assets[${String(index)}].${field}`;

  return (
    <section
      aria-labelledby={headingId}
      className="animate-enter border-t border-rule py-5"
      style={{ '--i': index } as CSSProperties}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 id={headingId} className="flex items-center gap-2 font-mono text-xs font-medium tracking-wide text-acc-ink">
          <span aria-hidden className="size-2.5 bg-acc-solid" />
          {t('author.asset-directive-fields-chi-thi')} {index + 1}
        </h3>
        <Button
          variant="danger"
          size="sm"
          icon="trash"
          disabled={disabled}
          onClick={props.onRemove}
        >
          {t('common.action.delete')}
        </Button>
      </div>
      <div className="@container">
        <div className="grid gap-5 @md:grid-cols-2 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)]">
          <TextField
            label={t('author.asset-directive-fields-host')}
            path={at('host')}
            error={issueFor(issues, at('host'))}
            value={asset.host}
            onChange={(host) => {
              onPatch({ host });
            }}
            disabled={disabled}
            placeholder={t('author.asset-directive-fields-host01')}
          />
          <TextField
            label={t('author.asset-directive-fields-file')}
            path={at('file')}
            error={issueFor(issues, at('file'))}
            value={asset.file}
            onChange={(file) => {
              onPatch({ file });
            }}
            disabled={disabled}
            placeholder={t('author.asset-directive-fields-start-sh')}
          />
          <TextField
            label={t('author.asset-directive-fields-dich-trong-pod')}
            path={at('target')}
            error={issueFor(issues, at('target'))}
            value={asset.target}
            onChange={(target) => {
              onPatch({ target });
            }}
            disabled={disabled}
            placeholder={t('author.asset-directive-fields-root')}
          />
          <TextField
            label={t('author.asset-directive-fields-chmod')}
            path={at('chmod')}
            error={issueFor(issues, at('chmod'))}
            value={asset.chmod}
            onChange={(chmod) => {
              onPatch({ chmod });
            }}
            disabled={disabled}
            placeholder={t('author.asset-directive-fields-0755')}
            hint={t('author.asset-directive-fields-bo-trong-thi-giu-quyen-mac-dinh')}
          />
        </div>
      </div>
    </section>
  );
}
