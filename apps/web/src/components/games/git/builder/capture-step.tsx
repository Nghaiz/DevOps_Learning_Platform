'use client';

/**
 * E.1, chụp trạng thái. Sandbox là chỗ duy nhất dựng được một cây git bất kỳ
 * bằng lệnh thật; bước này không dựng lại khả năng đó, nó chỉ CHỤP kết quả
 * (`captureSpec`, gọi lúc bấm chứ không lúc render) vào một trong hai ô.
 */

import { useState, type ReactElement } from 'react';
import { Camera, Target, X } from 'lucide-react';

import { t } from '@devops-platform/copy';
import type { WorldSpec } from '@devops-platform/games';
import { Button, Num } from '@devops-platform/ui';

import { BuilderStep, GIT_FILL } from './builder-step';
import type { DraftPatch } from './draft-state';

/**
 * Số commit của một spec, để người soạn biết mình vừa chụp cái gì.
 *
 * KHÔNG gọi `buildWorld`: spec có thể đang hỏng (đó chính là một trong các issue
 * mà `levelDraftIssues` báo), và một component ném lúc render vì dữ liệu hỏng là
 * một trang trắng thay cho một dòng lỗi.
 */
function countCommits(spec: WorldSpec): number {
  return spec.commits?.length ?? 0;
}

export interface CaptureStepProps {
  readonly index: number;
  readonly setup: WorldSpec;
  readonly target: WorldSpec | null;
  readonly captureSpec: () => WorldSpec;
  readonly patch: DraftPatch;
}

export function CaptureStep({
  index,
  setup,
  target,
  captureSpec,
  patch,
}: CaptureStepProps): ReactElement {
  /*
   * Đếm số lần chụp để KHOÁ dòng giá trị theo nó: chụp lại một cây cùng số
   * commit vẫn phát lại hiệu ứng, nên người soạn thấy cú bấm của mình đã ăn.
   */
  const [shots, setShots] = useState({ setup: 0, target: 0 });

  return (
    <BuilderStep
      index={index}
      id="builder-chup"
      title={t('author.builder.step.capture')}
      lead={t('author.builder.lead.capture')}
    >
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className={GIT_FILL}
          iconLeft={<Camera aria-hidden />}
          data-testid="git-builder-set-setup"
          onClick={() => {
            patch({ setup: captureSpec() });
            setShots((s) => ({ ...s, setup: s.setup + 1 }));
          }}
        >
          {t('author.builder.capture.set-setup')}
        </Button>
        <Button
          size="sm"
          variant="ink"
          iconLeft={<Target aria-hidden />}
          data-testid="git-builder-set-target"
          onClick={() => {
            patch({ target: captureSpec() });
            setShots((s) => ({ ...s, target: s.target + 1 }));
          }}
        >
          {t('author.builder.capture.set-target')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconLeft={<X aria-hidden />}
          disabled={target === null}
          onClick={() => {
            patch({ target: null });
          }}
        >
          {t('author.builder.capture.clear-target')}
        </Button>
      </div>

      <dl
        data-testid="git-builder-capture-state"
        className="divide-y divide-border border-y border-border"
      >
        <div className="flex items-baseline justify-between gap-3 py-2.5">
          <dt className="type-label text-muted-foreground">{t('author.builder.capture.setup')}</dt>
          <dd key={`setup-${String(shots.setup)}`} className="animate-rise text-sm">
            <Num>{countCommits(setup)}</Num> {t('author.builder.capture.unit')}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2.5">
          <dt className="type-label text-muted-foreground">{t('author.builder.capture.target')}</dt>
          <dd key={`target-${String(shots.target)}`} className="animate-rise text-sm">
            {target === null ? (
              <span className="text-muted-foreground">{t('author.builder.capture.unset')}</span>
            ) : (
              <>
                <Num tone="git">{countCommits(target)}</Num> {t('author.builder.capture.unit')}
              </>
            )}
          </dd>
        </div>
      </dl>
    </BuilderStep>
  );
}
