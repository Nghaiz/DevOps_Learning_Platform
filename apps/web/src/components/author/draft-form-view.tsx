'use client';

import { t } from '@devops-platform/copy';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Alert, AlertDescription } from '@devops-platform/ui';
import type { ContentKind } from '@devops-platform/shared-types/authoring';
import { Split } from '../kit';
import { AssetDirectiveFields } from './asset-directive-fields';
import { DraftMetaFields } from './draft-meta-fields';
import { DraftSandboxFields } from './draft-sandbox-fields';
import { emptyStep, type DraftFormState, type FieldIssue } from './draft-form';
import { issueFor, TextAreaField } from './field';
import { PhaseSection } from './phase-fields';
import { StepListFields } from './step-list-fields';

/**
 * Toàn bộ phần SOẠN của một bài: các mục xếp chồng, mỗi mục một `Split` đánh số.
 *
 * Số mục (`01`, `02`, ...) đếm từ danh sách mục THỰC SỰ hiện cho loại bài này,
 * không gõ tay: bài học có phần mở đầu/kết thúc, lab có phần chuẩn bị môi
 * trường, sân chơi chỉ có một ghi chú. Gõ số tay thì thêm một mục là lệch số
 * của mọi mục phía sau.
 *
 * Chia bằng mục có tiêu đề (`h2` của `Split`) chứ không bằng tab lồng nhau:
 * trang đã có hàng tab chế độ ở trên, và tab trong tab làm người dùng bàn phím
 * phải đoán mình đang ở lớp nào.
 *
 * Mọi ô mang `path` khớp `FieldIssue.path`, để cột kiểm bên phải đưa focus về
 * đúng ô khi người soạn bấm vào một lỗi. ⛔ KHÔNG `<main>`: vỏ ứng dụng giữ nó.
 */
export function DraftFormView(props: {
  readonly kind: ContentKind;
  readonly value: DraftFormState;
  readonly onChange: (next: DraftFormState) => void;
  readonly issues: readonly FieldIssue[];
  readonly disabled?: boolean | undefined;
  /** Bộ đếm khoá React cho phần tử mới: trang sở hữu, để khoá không trùng qua các lượt render. */
  readonly nextKey: () => string;
}): ReactElement {
  const sections = sectionsFor(props);
  return (
    <div className="flex flex-col">
      {sections.map((section, index) => (
        <div
          key={section.key}
          className="stagger animate-rise"
          style={{ '--i': index } as CSSProperties}
        >
          <Split index={String(index + 1).padStart(2, '0')} title={section.title} aside={section.note}>
            <div className="@container flex flex-col gap-6">{section.body}</div>
          </Split>
        </div>
      ))}
    </div>
  );
}

interface DraftSection {
  readonly key: string;
  readonly title: string;
  readonly note?: string;
  readonly body: ReactNode;
}

function sectionsFor(props: Parameters<typeof DraftFormView>[0]): readonly DraftSection[] {
  const { kind, value, onChange, issues, disabled, nextKey } = props;
  const patch = (part: Partial<DraftFormState>): void => {
    onChange({ ...value, ...part });
  };
  const shared = { kind, value, onChange, issues, disabled };
  const addStep = (): void => {
    patch({ steps: [...value.steps, emptyStep(nextKey())] });
  };

  const head: readonly DraftSection[] = [
    {
      key: 'meta',
      title: t('author.draft-form-view-thong-tin-chung'),
      note: t('author.draft-form-view-thong-tin-chung-ghi-chu'),
      body: <DraftMetaFields {...shared} />,
    },
    {
      key: 'sandbox',
      title: t('author.draft-form-view-sandbox'),
      note: t('author.draft-form-view-sandbox-ghi-chu'),
      body: <DraftSandboxFields {...shared} />,
    },
  ];

  if (kind === 'playground') {
    return [
      ...head,
      {
        key: 'playground',
        title: t('author.draft-form-view-noi-dung'),
        body: (
          <Alert>
            <AlertDescription>
              {t(
                'author.draft-form-view-playground-la-mot-sandbox-trong-khong-co-buoc-khong-co-script-cham-nguoi-ho',
              )}
            </AlertDescription>
          </Alert>
        ),
      },
    ];
  }

  const assets: DraftSection = {
    key: 'assets',
    title: t('author.draft-form-view-chep-file-vao-pod'),
    note: t('author.draft-form-view-chep-file-vao-pod-ghi-chu'),
    body: (
      <AssetDirectiveFields
        value={value.assets}
        issues={issues}
        disabled={disabled}
        onChange={(next) => {
          patch({ assets: next });
        }}
        onAdd={() => {
          patch({
            assets: [...value.assets, { key: nextKey(), host: 'host01', file: '', target: '', chmod: '' }],
          });
        }}
      />
    ),
  };

  const steps = (
    <StepListFields
      kind={kind}
      steps={value.steps}
      issues={issues}
      disabled={disabled}
      onChange={(next) => {
        patch({ steps: next });
      }}
      onAdd={addStep}
    />
  );

  if (kind === 'lab') {
    return [
      ...head,
      {
        key: 'setup',
        title: t('author.draft-form-view-chuan-bi-moi-truong'),
        note: t(
          'author.draft-form-view-chay-mot-lan-khi-dung-lab-lab-co-y-khong-co-setup-theo-tung-task-thu-tu-lam',
        ),
        body: (
          <div className="grid gap-6 @2xl:grid-cols-2">
            <TextAreaField
              label={t('author.draft-form-view-setup-foreground')}
              path="setup.foreground"
              error={issueFor(issues, 'setup.foreground')}
              rows={4}
              mono
              value={value.setupForeground}
              disabled={disabled}
              onChange={(setupForeground) => {
                patch({ setupForeground });
              }}
            />
            <TextAreaField
              label={t('author.draft-form-view-setup-background')}
              path="setup.background"
              error={issueFor(issues, 'setup.background')}
              rows={4}
              mono
              value={value.setupBackground}
              disabled={disabled}
              onChange={(setupBackground) => {
                patch({ setupBackground });
              }}
            />
          </div>
        ),
      },
      {
        key: 'tasks',
        title: t('author.draft-form-view-cac-task'),
        note: t('author.draft-form-view-cac-task-ghi-chu'),
        body: steps,
      },
      assets,
    ];
  }

  return [
    ...head,
    {
      key: 'intro',
      title: t('author.draft-form-view-mo-dau'),
      note: t('author.draft-form-view-mo-dau-ghi-chu'),
      body: (
        <PhaseSection
          path="intro"
          toggleLabel={t('author.draft-form-view-bai-co-phan-mo-dau')}
          enabled={value.hasIntro}
          value={value.intro}
          issues={issues}
          disabled={disabled}
          onToggle={(hasIntro) => {
            patch({ hasIntro });
          }}
          onChange={(intro) => {
            patch({ intro });
          }}
        />
      ),
    },
    {
      key: 'steps',
      title: t('author.draft-form-view-cac-buoc'),
      note: t('author.draft-form-view-cac-buoc-ghi-chu'),
      body: steps,
    },
    {
      key: 'finish',
      title: t('author.draft-form-view-ket-thuc'),
      note: t('author.draft-form-view-ket-thuc-ghi-chu'),
      body: (
        <PhaseSection
          path="finish"
          toggleLabel={t('author.draft-form-view-bai-co-phan-ket-thuc')}
          enabled={value.hasFinish}
          value={value.finish}
          issues={issues}
          disabled={disabled}
          onToggle={(hasFinish) => {
            patch({ hasFinish });
          }}
          onChange={(finish) => {
            patch({ finish });
          }}
        />
      ),
    },
    assets,
  ];
}
