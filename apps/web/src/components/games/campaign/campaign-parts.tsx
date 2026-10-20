import type { MouseEvent, ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { t } from '@devops-platform/copy';
import {
  BackLink,
  GameArt,
  Icon,
  InlineText,
  LevelBars,
  Page,
  PageHeader,
  Pill,
  ProgressLine,
  Row,
  RowList,
  cn,
} from '@devops-platform/ds';
import type { Difficulty } from '@devops-platform/games';
import { topicLook } from '../../../lib/topic-look';
import type { PlayableGameId } from '../hub/game-facts';

/**
 * Khung chung của ba trang chọn màn (K8s, Git, CI/CD): đầu trang có tiến độ và nút
 * chơi tiếp, dải nhảy nhanh tới từng chương, rồi từng chương với danh sách màn.
 *
 * Ba trang khác nhau ở DỮ LIỆU (màn, chương, cách vào màn), giống nhau ở hình. Mỗi
 * trang tự tính trạng thái từng màn từ kho tiến độ của game đó rồi đưa vào đây.
 */

export type LevelStatus = 'done' | 'playing' | 'next' | 'new';

const DIFFICULTY_LEVEL: Readonly<Record<Difficulty, 1 | 2 | 3>> = {
  basic: 1,
  intermediate: 2,
  advanced: 3,
};

const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = {
  basic: t('common.difficulty.beginner'),
  intermediate: t('common.difficulty.intermediate'),
  advanced: t('common.difficulty.advanced'),
};

const STATUS_LABEL: Readonly<Record<LevelStatus, string>> = {
  done: t('games.state.done'),
  playing: t('games.state.playing'),
  next: t('games.state.next'),
  new: t('games.state.new'),
};

/** Độ khó của một màn: vạch cao dần + chữ. */
export function LevelDifficulty({ value }: { readonly value: Difficulty }): ReactElement {
  return <LevelBars level={DIFFICULTY_LEVEL[value]} label={DIFFICULTY_LABEL[value]} className="text-sm text-ink-2" />;
}

export interface CampaignHeaderProps {
  readonly game: PlayableGameId;
  readonly title: string;
  readonly lead: string;
  readonly levels: number;
  readonly chapters: number;
  readonly done: number;
  /** Nút chơi tiếp, hoặc `null` khi đã qua hết (lúc đó `allDone` hiện thay). */
  readonly cta: ReactNode | null;
  readonly allDone: string;
  /** Lối phụ (bàn thử tự do) đứng cạnh nút chính. */
  readonly extra?: ReactNode;
}

export function CampaignHeader(props: CampaignHeaderProps): ReactElement {
  const look = topicLook({ gameId: props.game });
  return (
    <div data-topic={look.topic} className="border-b border-rule bg-tp-wash">
      <Page className="relative">
        <PageHeader
          size="lg"
          className="pb-8 lg:pr-72"
          back={
            <BackLink asChild>
              <Link href="/games">{t('games.k8s.campaign.back')}</Link>
            </BackLink>
          }
          title={props.title}
          lead={props.lead}
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <Icon name={look.icon} size={18} tint="topic" className="text-tp-ink" />
                {t('games.campaign.summary', { levels: props.levels, chapters: props.chapters })}
              </span>
              <ProgressLine
                value={props.levels === 0 ? 0 : props.done / props.levels}
                tone="topic"
                size="md"
                label={t('games.band.progress.aria', { name: props.title })}
                caption={t('games.campaign.progress', { done: props.done, total: props.levels })}
                className="w-full max-w-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              {props.cta ?? <p className="text-sm font-medium text-ok-ink">{props.allDone}</p>}
              {props.extra}
            </div>
          </div>
        </PageHeader>
        <GameArt
          kind={props.game}
          width={248}
          className="pointer-events-none absolute bottom-6 right-8 hidden animate-enter lg:block"
        />
      </Page>
    </div>
  );
}

export interface ChapterLink {
  readonly anchor: string;
  readonly label: string;
  readonly done: number;
  readonly total: number;
}

/** Dải nhảy nhanh tới từng chương, nằm ngang dưới đầu trang. */
export function ChapterStrip({ chapters }: { readonly chapters: readonly ChapterLink[] }): ReactElement {
  return (
    <nav aria-label={t('games.k8s.campaign.chapters')} className="border-b border-rule">
      <Page>
        <ul className="relative -mx-1 flex gap-1 overflow-x-auto py-3 [scrollbar-width:none]">
          {chapters.map((chapter) => {
            const complete = chapter.done === chapter.total && chapter.total > 0;
            return (
              <li key={chapter.anchor} className="shrink-0">
                <a
                  href={`#${chapter.anchor}`}
                  className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm text-ink-2 outline-none transition-colors hover:bg-tp-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
                >
                  {complete ? <Icon name="success" size={16} className="text-ok-ink" /> : null}
                  {chapter.label}
                  <span className="text-xs tabular-nums text-ink-3">
                    {chapter.done}/{chapter.total}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </Page>
    </nav>
  );
}

export function ChapterBlock(props: {
  readonly anchor: string;
  readonly title: string;
  readonly blurb: string | null;
  readonly done: number;
  readonly total: number;
  readonly listLabel: string;
  readonly children: ReactNode;
}): ReactElement {
  const headingId = `${props.anchor}-title`;
  return (
    <section id={props.anchor} aria-labelledby={headingId} className="scroll-mt-24 flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex max-w-[64ch] flex-col gap-1">
          <h2 id={headingId} className="font-display text-xl font-semibold text-ink">
            {props.title}
          </h2>
          {props.blurb === null ? null : <p className="text-sm text-ink-2">{props.blurb}</p>}
        </div>
        <p className="text-sm tabular-nums text-ink-3">{t('games.chapter.progress', { done: props.done, total: props.total })}</p>
      </div>
      <RowList label={props.listLabel} className="border-t border-rule">
        {props.children}
      </RowList>
    </section>
  );
}

export interface LevelRowProps {
  readonly index: number;
  readonly title: string;
  readonly href: string;
  /**
   * Vào màn mà không tải lại trang (K8s, Git ghi `?level=` bằng `history.pushState`).
   * Thiếu thì liên kết chạy như liên kết thường (CI/CD có route riêng cho từng màn).
   */
  readonly onPlay?: (() => void) | undefined;
  readonly description: ReactNode;
  readonly meta: ReactNode;
  readonly status: LevelStatus;
}

/**
 * Một màn trong danh sách. Cả dòng là một liên kết thật (mở tab mới, chép đường dẫn
 * đều đúng); khi có `onPlay` thì cú bấm thường được chặn lại để vào màn tại chỗ.
 */
export function LevelRow(props: LevelRowProps): ReactElement {
  const onClick =
    props.onPlay === undefined
      ? undefined
      : (event: MouseEvent<HTMLAnchorElement>) => {
          // Giữ hành vi của trình duyệt cho Ctrl/Cmd/Shift + bấm và chuột giữa.
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          props.onPlay?.();
        };
  return (
    <Row
      current={props.status === 'next'}
      leading={<LevelNumber index={props.index} status={props.status} />}
      title={props.title}
      link={
        onClick === undefined ? (
          <Link href={props.href}>
            <InlineText text={props.title} />
          </Link>
        ) : (
          <a href={props.href} onClick={onClick}>
            <InlineText text={props.title} />
          </a>
        )
      }
      description={typeof props.description === 'string' ? <InlineText text={props.description} /> : props.description}
      meta={props.meta}
      // Cột trạng thái rộng cố định: pill "Màn tiếp" rộng hơn chữ "Chưa chơi", và một cột co
      // theo nội dung đẩy cả hàng meta lệch so với các dòng dưới.
      trailing={
        <span className="flex w-28 justify-end">
          <LevelStatusMark status={props.status} />
        </span>
      }
    />
  );
}

function LevelNumber({ index, status }: { readonly index: number; readonly status: LevelStatus }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-9 place-items-center rounded-full text-sm font-semibold tabular-nums transition-transform duration-200 group-hover:scale-105',
        status === 'done' && 'bg-ok-solid text-on-solid',
        status === 'next' && 'bg-tp-solid text-on-solid ring-4 ring-tp-tint',
        status === 'playing' && 'bg-tp-soft text-tp-ink',
        status === 'new' && 'bg-well-2 text-ink-2',
      )}
    >
      {status === 'done' ? <Icon name="check" size={16} strokeWidth={3} /> : index}
    </span>
  );
}

function LevelStatusMark({ status }: { readonly status: LevelStatus }): ReactElement {
  if (status === 'done') {
    return (
      <Pill tone="ok" icon="success">
        {STATUS_LABEL.done}
      </Pill>
    );
  }
  if (status === 'next') {
    return (
      <Pill tone="topic" icon="play">
        {STATUS_LABEL.next}
      </Pill>
    );
  }
  if (status === 'playing') {
    return (
      <Pill tone="acc" icon="circle-dot">
        {STATUS_LABEL.playing}
      </Pill>
    );
  }
  return <span className="text-xs text-ink-3">{STATUS_LABEL.new}</span>;
}
