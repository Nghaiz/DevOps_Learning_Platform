'use client';

import { t } from '@devops-platform/copy';
import type { ReactElement } from 'react';
import { Alert, AlertDescription, Button, Card, CardContent } from '@devops-platform/ui';
import type { AssetDirectiveFormState } from './draft-form';
import { TextField } from './field';

/**
 * `ScenarioAsset[]` — chỉ thị CHÉP FILE VÀO POD lúc dựng sandbox.
 *
 * ⚠ Đây KHÔNG phải tệp tải lên. Hai thứ trùng tên "asset" trong cùng một router
 * và chúng không liên quan gì tới nhau:
 *
 * | | Ở đâu | Dùng làm gì |
 * |---|---|---|
 * | `assets` (khối này) | cột `content_items.assets` | chép file có sẵn trong image vào pod |
 * | `content_assets` (tab Tệp đính kèm) | bảng riêng, `uploadAsset` | ảnh nhúng trong markdown |
 *
 * Người soạn gõ nhầm khối này để mong tải ảnh lên là chuyện sẽ xảy ra, nên câu
 * cảnh báo nằm ngay trên đầu chứ không nằm trong tài liệu.
 */
export function AssetDirectiveFields(props: {
  readonly value: readonly AssetDirectiveFormState[];
  readonly onChange: (next: readonly AssetDirectiveFormState[]) => void;
  readonly onAdd: () => void;
  readonly disabled?: boolean | undefined;
}): ReactElement {
  const { value, onChange, disabled } = props;
  const patchAt = (index: number, part: Partial<AssetDirectiveFormState>): void => {
    onChange(value.map((item, i) => (i === index ? { ...item, ...part } : item)));
  };

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>
          {t('author.asset-directive-fields-khoi-nay-khong-tai-tep-len-no-khai-mot-file')}{' '}
          <em>{t('author.asset-directive-fields-da-co-trong-image-sandbox')}</em>{' '}
          {t(
            'author.asset-directive-fields-va-cho-can-chep-toi-trong-pod-muon-nhung-anh-vao-bai-thi-dung-tab',
          )}{' '}
          <strong>{t('author.edit.tab.assets')}</strong>.
        </AlertDescription>
      </Alert>

      {value.map((asset, index) => (
        <Card key={asset.key}>
          <CardContent className="flex flex-col gap-4 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {t('author.asset-directive-fields-chi-thi')} {index + 1}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  onChange(value.filter((_, i) => i !== index));
                }}
              >
                {t('common.action.delete')}
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={t('author.asset-directive-fields-host')}
                value={asset.host}
                onChange={(host) => {
                  patchAt(index, { host });
                }}
                disabled={disabled}
                placeholder={t('author.asset-directive-fields-host01')}
              />
              <TextField
                label={t('author.asset-directive-fields-file')}
                value={asset.file}
                onChange={(file) => {
                  patchAt(index, { file });
                }}
                disabled={disabled}
                placeholder={t('author.asset-directive-fields-start-sh')}
              />
              <TextField
                label={t('author.asset-directive-fields-dich-trong-pod')}
                value={asset.target}
                onChange={(target) => {
                  patchAt(index, { target });
                }}
                disabled={disabled}
                placeholder={t('author.asset-directive-fields-root')}
              />
              <TextField
                label={t('author.asset-directive-fields-chmod')}
                value={asset.chmod}
                onChange={(chmod) => {
                  patchAt(index, { chmod });
                }}
                disabled={disabled}
                placeholder={t('author.asset-directive-fields-0755')}
                hint={t('author.asset-directive-fields-bo-trong-thi-giu-quyen-mac-dinh')}
              />
            </div>
          </CardContent>
        </Card>
      ))}

      <div>
        <Button variant="outline" onClick={props.onAdd} disabled={disabled}>
          {t('author.asset-directive-fields-them-chi-thi')}
        </Button>
      </div>
    </div>
  );
}
