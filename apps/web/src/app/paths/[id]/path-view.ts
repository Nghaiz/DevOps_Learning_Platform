import { t, type StaticTextKey } from '@devops-platform/copy';
import type {
  LearningPathDetail,
  LearningPathItemView,
  PathItemKind,
} from '@devops-platform/shared-types/path';
import type { SegmentState } from '@devops-platform/ds';
import type { IconName } from '@devops-platform/ds/icons';
import { topicLook, type TopicName } from '../../../lib/topic-look';

/**
 * Mô hình hiển thị của một lộ trình: hàm THUẦN, có test (`path-view.test.ts`).
 *
 * ⚠ Ổ khoá ở đây là HÌNH ẢNH của một luật chạy ở server. `state` tới từ
 * `paths.get` và cổng thi hành là `paths.openItem`; không nhánh nào ở file này
 * quyết định mở hay khoá, nó chỉ quyết định VẼ gì.
 */

const KIND_KEY = {
  lesson: 'catalog.path.kind.lesson',
  lab: 'catalog.path.kind.lab',
  quiz: 'catalog.path.kind.quiz',
} as const satisfies Record<PathItemKind, StaticTextKey>;

export function pathItemKindLabel(kind: PathItemKind): string {
  return t(KIND_KEY[kind]);
}

const PATH_ITEM_KIND_BASE_HREF: Record<PathItemKind, string> = {
  lesson: '/lessons',
  lab: '/labs',
  quiz: '/quiz',
};

const STATE_KEY = {
  passed: 'catalog.path.state.passed',
  available: 'catalog.path.state.available',
  locked: 'catalog.path.state.locked',
} as const satisfies Record<LearningPathItemView['state'], StaticTextKey>;

export type ItemOpenability = 'open' | 'locked' | 'missing';

export interface PathItemViewModel {
  readonly key: string;
  readonly item: LearningPathItemView;
  /** Số thứ tự hiển thị, đếm từ 1. */
  readonly number: number;
  readonly kindLabel: string;
  readonly title: string;
  /** Màu chủ đề và biểu tượng, suy từ mã nội dung (`dlp-docker-basics` ⇒ docker). */
  readonly topic: TopicName;
  readonly icon: IconName;
  readonly openability: ItemOpenability;
  readonly stateLabel: string;
  /** Ô của dải tiến độ: đã đạt, nên làm tiếp, hay chưa tới. */
  readonly segment: SegmentState;
  readonly isNext: boolean;
  readonly missingContent: boolean;
  readonly note: string | null;
  readonly href: string | null;
}

/**
 * `locked` xét TRƯỚC `missing`: một mắt xích vừa khoá vừa thủng thì cổng là
 * "khoá", nhưng cảnh báo thủng cho người soạn vẫn hiện (`missingContent`).
 */
export function itemOpenability(item: LearningPathItemView): ItemOpenability {
  if (item.state === 'locked') {
    return 'locked';
  }
  if (item.title === null) {
    return 'missing';
  }
  return 'open';
}

export function pathItemHref(item: Pick<LearningPathItemView, 'kind' | 'itemId'>): string {
  return `${PATH_ITEM_KIND_BASE_HREF[item.kind]}/${encodeURIComponent(item.itemId)}`;
}

function segmentOf(item: LearningPathItemView, isNext: boolean): SegmentState {
  if (item.state === 'passed') return 'done';
  return isNext ? 'current' : 'todo';
}

export function buildPathItemViews(
  items: readonly LearningPathItemView[],
  nextItemId: string | null = null,
): PathItemViewModel[] {
  return items.map((item) => {
    const openability = itemOpenability(item);
    const isNext = nextItemId !== null && item.itemId === nextItemId;
    const look = topicLook({ id: item.itemId });
    return {
      key: `${item.kind}:${item.itemId}`,
      item,
      number: item.ordinal + 1,
      kindLabel: pathItemKindLabel(item.kind),
      title: item.title ?? item.itemId,
      topic: look.topic,
      icon: look.icon,
      openability,
      stateLabel: t(STATE_KEY[item.state]),
      segment: segmentOf(item, isNext),
      isNext,
      missingContent: item.title === null,
      note:
        openability === 'locked'
          ? t('catalog.path.note-locked')
          : openability === 'missing'
            ? t('catalog.path.note-missing')
            : null,
      href: openability === 'open' ? pathItemHref(item) : null,
    };
  });
}

export interface PathProgressSummary {
  readonly label: string;
  readonly nextLabel: string | null;
  readonly finished: boolean;
}

/**
 * Nhãn chỉ nói thứ hệ thống biết. ⛔ BẪY P2: `nextItemId === null` mà CHƯA đạt
 * hết (mọi phần còn lại đều khoá hoặc thủng) thì KHÔNG được chúc mừng; lộ trình
 * rỗng cũng không phải lộ trình đã xong.
 */
export function summarizePathProgress(
  detail: Pick<LearningPathDetail, 'passedCount' | 'itemCount' | 'nextItemId' | 'items'>,
): PathProgressSummary {
  const finished = detail.itemCount > 0 && detail.passedCount >= detail.itemCount;
  const label = t('catalog.path.progress', { passed: detail.passedCount, total: detail.itemCount });

  if (detail.nextItemId !== null) {
    const next = detail.items.find((item) => item.itemId === detail.nextItemId);
    const name = next?.title ?? detail.nextItemId;
    return { label, nextLabel: t('catalog.path.next', { name }), finished };
  }

  return {
    label,
    nextLabel: finished ? t('catalog.path.all-done') : null,
    finished,
  };
}
