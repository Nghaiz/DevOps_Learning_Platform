import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import type { ScenarioDifficulty } from '@devops-platform/shared-types/scenario';
import { t } from '@devops-platform/copy';
import { Icon, LevelBars, Pill, Row, RowMeta, TopicGlyph } from '@devops-platform/ds';
import { topicLook, type TopicInput } from '../../lib/topic-look';
import { DIFFICULTY_LEVEL, difficultyLabel, progressStatusLabel } from './catalog-labels';

/**
 * Một dòng của danh mục: biểu tượng chủ đề tô màu chủ đề, tên, mô tả, các cột phụ
 * thẳng hàng, rồi trạng thái học. Cả dòng bấm được.
 */
export function CatalogRow(props: {
  readonly href: string;
  readonly topic: TopicInput;
  readonly title: string;
  readonly description?: string | null | undefined;
  readonly below?: ReactNode;
  readonly meta?: ReactNode;
  readonly state?: ReactNode;
}): ReactElement {
  const look = topicLook(props.topic);
  return (
    <Row
      topic={look.topic}
      leading={<TopicGlyph topic={look.topic} icon={look.icon} size={30} />}
      title={props.title}
      link={<Link href={props.href}>{props.title}</Link>}
      description={props.description ?? undefined}
      below={props.below}
      meta={props.meta}
      trailing={props.state === null || props.state === undefined ? undefined : <div className="hidden sm:block">{props.state}</div>}
    />
  );
}

/** Đầu vào màu chủ đề của một mục nội dung: chủ đề khai trong nội dung, rồi tag, rồi id. */
export function contentTopic(item: {
  readonly id: string;
  readonly topic?: string | null | undefined;
  readonly capabilities?: readonly string[];
}): TopicInput {
  return { topic: item.topic ?? null, tags: item.capabilities ?? [], id: item.id };
}

/** Độ khó: ba vạch + chữ, trong một cột rộng cố định để các dòng thẳng nhau. */
export function RowDifficulty({ level }: { readonly level: ScenarioDifficulty }): ReactElement {
  return (
    <RowMeta width="w-28">
      <LevelBars level={DIFFICULTY_LEVEL[level]} label={difficultyLabel(level)} />
    </RowMeta>
  );
}

/** Một cột phụ có biểu tượng nhỏ đứng trước. */
export function RowFact({
  icon,
  children,
  width = 'w-24',
}: {
  readonly icon: Parameters<typeof Icon>[0]['name'];
  readonly children: ReactNode;
  readonly width?: string;
}): ReactElement {
  return (
    <RowMeta width={width}>
      {children === null || children === undefined ? null : (
        <>
          <Icon name={icon} size={15} className="shrink-0 text-ink-3" />
          {children}
        </>
      )}
    </RowMeta>
  );
}

/**
 * Trạng thái học của một bài. "Chưa bắt đầu" không in gì: đó là trạng thái của
 * hầu hết các dòng, in ra là lặp một chữ trên cả bảng. Trạng thái lạ in GIÁ TRỊ
 * THÔ, để một giá trị mới từ máy chủ không biến mất trong im lặng.
 */
export function ProgressState({ status }: { readonly status: string }): ReactElement | null {
  if (status === 'not-started') return null;
  const label = progressStatusLabel(status) ?? status;
  if (status === 'completed') {
    return (
      <Pill tone="ok" icon="check">
        {label}
      </Pill>
    );
  }
  if (status === 'in-progress') {
    return (
      <Pill tone="info" dot>
        {label}
      </Pill>
    );
  }
  return <Pill>{label}</Pill>;
}

/** Cờ "Có xếp hạng" của lab. */
export function LeaderboardFlag(): ReactElement {
  return (
    <RowFact icon="award" width="w-28">
      {t('catalog.flag.leaderboard')}
    </RowFact>
  );
}

/** Cờ "Học tuần tự" của lộ trình. */
export function SequentialFlag(): ReactElement {
  return (
    <RowFact icon="lock" width="w-28">
      {t('catalog.flag.sequential')}
    </RowFact>
  );
}
