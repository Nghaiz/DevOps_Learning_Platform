'use client';

import { t } from '@devops-platform/copy';
import type { ReactElement } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@devops-platform/ui';
import { SANDBOX_TIER_NAMES } from '@devops-platform/shared-types/scenario';
import type { DraftFormState } from './draft-form';
import { RADIX_UNSET, type DraftFieldGroupProps } from './draft-meta-fields';
import { CapabilityGroup, ToolsetGroup } from './draft-toolset-fields';
import { Field, TextField, issueFor } from './field';

/**
 * Mục "Sandbox": người học nhận môi trường nào khi mở bài.
 *
 * Tách khỏi "Thông tin chung" vì đây là nhóm quyết định CHI PHÍ: tier, công cụ
 * cài thêm, capability và (với sân chơi) thời hạn phiên đều đổi thứ cụm phải
 * dựng cho MỌI người học bài này. Gom chúng một chỗ để người soạn thấy hết giá
 * của một lựa chọn trước khi bấm lưu.
 *
 * Danh sách tier đọc từ `SANDBOX_TIER_NAMES`, không gõ lại.
 */
export function DraftSandboxFields(props: DraftFieldGroupProps): ReactElement {
  const { kind, value, onChange, issues, disabled } = props;
  const patch = (part: Partial<DraftFormState>): void => {
    onChange({ ...value, ...part });
  };
  const lock = disabled === true ? { disabled: true } : {};

  return (
    <>
      <div className="grid gap-6 @xl:grid-cols-2">
        <Field
          label={t('author.draft-meta-fields-tier-sandbox')}
          path="tier"
          error={issueFor(issues, 'tier')}
          hint={t('author.draft-meta-fields-cum-hien-chay-sysbox-hai-tier-con-lai-chua-co-node-nao-phuc-vu')}
        >
          {({ id, describedBy, invalid }) => (
            <Select
              value={value.tier}
              {...lock}
              onValueChange={(tier) => {
                patch({ tier: tier as DraftFormState['tier'] });
              }}
            >
              <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SANDBOX_TIER_NAMES.map((tier) => (
                  <SelectItem key={tier} value={tier}>
                    {tier}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field
          label={t('author.draft-meta-fields-giao-dien')}
          path="interfaceLayout"
          error={issueFor(issues, 'interfaceLayout')}
          hint={t('author.draft-meta-fields-ide-mo-them-khung-soan-thao-canh-terminal-layout-ide-cua-p6')}
        >
          {({ id, describedBy, invalid }) => (
            <Select
              value={value.interfaceLayout === '' ? RADIX_UNSET : 'ide'}
              {...lock}
              onValueChange={(next) => {
                patch({ interfaceLayout: next === 'ide' ? 'ide' : '' });
              }}
            >
              <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={RADIX_UNSET}>{t('author.draft-meta-fields-terminal-thuong')}</SelectItem>
                <SelectItem value="ide">{t('author.draft-meta-fields-ide-noi-dung-editor-terminal')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>

      <ToolsetGroup
        value={value.toolset}
        disabled={disabled}
        error={issueFor(issues, 'toolset')}
        onChange={(toolset) => {
          patch({ toolset });
        }}
      />

      <div className="grid gap-6 @xl:grid-cols-2">
        <TextField
          label={t('author.draft-meta-fields-backend-image-id')}
          path="backendImageId"
          value={value.backendImageId}
          onChange={(backendImageId) => {
            patch({ backendImageId });
          }}
          error={issueFor(issues, 'backendImageId')}
          hint={t(
            'author.draft-meta-fields-nguyen-van-imageid-cua-upstream-giu-de-truy-nguyen-no-khong-quyet-dinh-sand',
          )}
          disabled={disabled}
        />
        {kind === 'playground' && (
          <TextField
            label={t('author.draft-meta-fields-ttl-phien-giay')}
            path="ttlSeconds"
            value={value.ttlSeconds}
            inputMode="numeric"
            onChange={(ttlSeconds) => {
              patch({ ttlSeconds });
            }}
            error={issueFor(issues, 'ttlSeconds')}
            hint={t(
              'author.draft-meta-fields-300-toi-7200-con-so-nay-hien-cho-nguoi-hoc-truoc-khi-ho-bam-bat-dau-nen-dat',
            )}
            disabled={disabled}
          />
        )}
      </div>

      <CapabilityGroup
        value={value.capabilities}
        disabled={disabled}
        error={issueFor(issues, 'capabilities')}
        onChange={(capabilities) => {
          patch({ capabilities });
        }}
      />
    </>
  );
}
