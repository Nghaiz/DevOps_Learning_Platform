/**
 * Giới hạn của Builder, hiện TRÊN MÀN ở khối đầu (`phase-18.md` §18.E: "không
 * giấu trong tài liệu").
 *
 * Danh sách đọc từ `BUILDER_CANNOT_EXPRESS`, không từ một mảng chép tay, nên
 * câu trên màn không trôi khỏi thứ lõi thật sự không diễn đạt được. Ô gác:
 * `builder-promises.test.ts` § "Builder giữ hai lời hứa về chữ".
 */

import type { ReactElement } from 'react';

import { t } from '@devops-platform/copy';
import { BUILDER_CANNOT_EXPRESS } from '@devops-platform/games';

import { LIMIT_TEXT } from './builder-copy';

export function BuilderLimits(): ReactElement {
  return (
    <section
      aria-labelledby="builder-gioi-han"
      data-testid="git-builder-limits"
      className="flex animate-enter flex-col gap-3 border-t-4 border-tp-mid bg-well p-4"
    >
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-tp-ink">{t('author.builder.intro.kicker')}</p>
        <h2 id="builder-gioi-han" className="font-display text-lg font-semibold text-ink">
          {t('author.builder.intro.title')}
        </h2>
      </div>
      <ul className="flex flex-col gap-2">
        {BUILDER_CANNOT_EXPRESS.map((limit) => (
          <li key={limit} className="flex gap-2.5 text-sm leading-relaxed text-ink">
            <span aria-hidden className="mt-2 size-2 shrink-0 bg-tp-solid" />
            <span>{t(LIMIT_TEXT[limit])}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
