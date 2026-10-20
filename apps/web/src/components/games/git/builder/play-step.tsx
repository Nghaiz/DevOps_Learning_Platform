'use client';

/**
 * E.6, chơi thử. Nhận một `GitLevel` đã qua `draftToLevel` (hoặc `null` khi bản
 * nháp còn lỗi), nên "chơi thử một level còn lỗi" không diễn đạt được ở tầng
 * kiểu. Màn chơi thử là ĐÚNG `GitLevelScreen` người chơi thật sẽ thấy.
 */

import type { ReactElement } from 'react';
import { ArrowRight } from 'lucide-react';

import { t } from '@devops-platform/copy';
import type { GitLevel } from '@devops-platform/games';
import { Button } from '@devops-platform/ui';

import { BuilderStep, GIT_FILL } from './builder-step';

export interface PlayStepProps {
  readonly index: number;
  readonly level: GitLevel | null;
  readonly onPlayTest: (level: GitLevel) => void;
}

export function PlayStep({ index, level, onPlayTest }: PlayStepProps): ReactElement {
  return (
    <BuilderStep
      index={index}
      id="builder-choi-thu"
      title={t('author.builder.step.play')}
      lead={t('author.builder.lead.play')}
    >
      <div>
        <Button
          className={GIT_FILL}
          iconRight={<ArrowRight aria-hidden />}
          data-testid="git-builder-play-test"
          disabled={level === null}
          onClick={() => {
            if (level !== null) onPlayTest(level);
          }}
        >
          {t('author.builder.play.run')}
        </Button>
      </div>
    </BuilderStep>
  );
}
