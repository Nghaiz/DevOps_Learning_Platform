'use client';

import { t } from '@devops-platform/copy';
import type { ReactElement, ReactNode } from 'react';
import { Alert, AlertDescription } from '@devops-platform/ui';
import type { ContentKind } from '@devops-platform/shared-types/authoring';
import { AssetDirectiveFields } from './asset-directive-fields';
import { DraftMetaFields } from './draft-meta-fields';
import { emptyStep, type DraftFormState, type FieldIssue } from './draft-form';
import { PhaseFields, PhaseToggle } from './phase-fields';
import { StepListFields } from './step-list-fields';
import { TextAreaField } from './field';

/**
 * Toàn bộ phần SOẠN của một bài, ghép từ các khối nhập.
 *
 * Chia bằng `<section>` + `<h2>` chứ không bằng tab lồng nhau: trang đã có một
 * hàng tab ở cấp trên (Soạn / Xem trước / Tệp / Xuất bản), và tab trong tab làm
 * người dùng bàn phím phải đoán mình đang ở lớp nào. `<section>` có tiêu đề
 * cũng cho 13.H một cây heading đọc được thay vì một mặt phẳng div.
 *
 * ⛔ KHÔNG `<main>` (C6bis).
 */
export function DraftFormView(props: {
  readonly kind: ContentKind;
  readonly value: DraftFormState;
  readonly onChange: (next: DraftFormState) => void;
  readonly issues: readonly FieldIssue[];
  readonly disabled?: boolean | undefined;
  /** Bộ đếm khoá React cho phần tử mới — trang sở hữu, để khoá không trùng qua các lượt render. */
  readonly nextKey: () => string;
}): ReactElement {
  const { kind, value, onChange, issues, disabled, nextKey } = props;
  const patch = (part: Partial<DraftFormState>): void => {
    onChange({ ...value, ...part });
  };

  return (
    <div className="flex flex-col gap-8">
      <Section title={t('author.draft-form-view-thong-tin-chung')}>
        <DraftMetaFields
          kind={kind}
          value={value}
          onChange={onChange}
          issues={issues}
          disabled={disabled}
        />
      </Section>

      {kind === 'playground' && (
        <Section title={t('author.draft-form-view-noi-dung')}>
          <Alert>
            <AlertDescription>
              {t(
                'author.draft-form-view-playground-la-mot-sandbox-trong-khong-co-buoc-khong-co-script-cham-nguoi-ho',
              )}
            </AlertDescription>
          </Alert>
        </Section>
      )}

      {kind === 'lesson' && (
        <>
          <Section title={t('author.draft-form-view-mo-dau')}>
            <PhaseToggle
              id="phase-intro"
              label={t('author.draft-form-view-bai-co-phan-mo-dau')}
              checked={value.hasIntro}
              disabled={disabled}
              onChange={(hasIntro) => {
                patch({ hasIntro });
              }}
            />
            {value.hasIntro && (
              <PhaseFields
                value={value.intro}
                disabled={disabled}
                onChange={(intro) => {
                  patch({ intro });
                }}
              />
            )}
          </Section>

          <Section title={t('author.draft-form-view-cac-buoc')}>
            <StepListFields
              kind="lesson"
              steps={value.steps}
              issues={issues}
              disabled={disabled}
              onChange={(steps) => {
                patch({ steps });
              }}
              onAdd={() => {
                patch({ steps: [...value.steps, emptyStep(nextKey())] });
              }}
            />
          </Section>

          <Section title={t('author.draft-form-view-ket-thuc')}>
            <PhaseToggle
              id="phase-finish"
              label={t('author.draft-form-view-bai-co-phan-ket-thuc')}
              checked={value.hasFinish}
              disabled={disabled}
              onChange={(hasFinish) => {
                patch({ hasFinish });
              }}
            />
            {value.hasFinish && (
              <PhaseFields
                value={value.finish}
                disabled={disabled}
                onChange={(finish) => {
                  patch({ finish });
                }}
              />
            )}
          </Section>
        </>
      )}

      {kind === 'lab' && (
        <>
          <Section title={t('author.draft-form-view-chuan-bi-moi-truong')}>
            <p className="text-sm text-muted-foreground">
              {t(
                'author.draft-form-view-chay-mot-lan-khi-dung-lab-lab-co-y-khong-co-setup-theo-tung-task-thu-tu-lam',
              )}
            </p>
            <TextAreaField
              label={t('author.draft-form-view-setup-foreground')}
              rows={3}
              mono
              value={value.setupForeground}
              disabled={disabled}
              onChange={(setupForeground) => {
                patch({ setupForeground });
              }}
            />
            <TextAreaField
              label={t('author.draft-form-view-setup-background')}
              rows={3}
              mono
              value={value.setupBackground}
              disabled={disabled}
              onChange={(setupBackground) => {
                patch({ setupBackground });
              }}
            />
          </Section>

          <Section title={t('author.draft-form-view-cac-task')}>
            <StepListFields
              kind="lab"
              steps={value.steps}
              issues={issues}
              disabled={disabled}
              onChange={(steps) => {
                patch({ steps });
              }}
              onAdd={() => {
                patch({ steps: [...value.steps, emptyStep(nextKey())] });
              }}
            />
          </Section>
        </>
      )}

      {kind !== 'playground' && (
        <Section title={t('author.draft-form-view-chep-file-vao-pod')}>
          <AssetDirectiveFields
            value={value.assets}
            disabled={disabled}
            onChange={(assets) => {
              patch({ assets });
            }}
            onAdd={() => {
              patch({
                assets: [
                  ...value.assets,
                  { key: nextKey(), host: 'host01', file: '', target: '', chmod: '' },
                ],
              });
            }}
          />
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className="practice-draft-section">
      <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}
