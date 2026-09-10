import { t } from '@devops-platform/copy';
import type {
  LearningPathDetail,
  LearningPathItemView,
  PathItemKind,
} from '@devops-platform/shared-types/path';
import type { BadgeVariant } from '@devops-platform/ui';

/**
 * Mô hình hiển thị của trang chi tiết lộ trình — hàm THUẦN, có test.
 *
 * ## Ổ khoá ở đây là HÌNH ẢNH của một luật chạy ở server
 *
 * `state` tới từ `paths.get`, được server tính LẠI từ tiến độ thật ở mỗi lượt
 * đọc (`viewPathItems`), và cổng thi hành là `paths.openItem` — bỏ qua giao
 * diện mà gọi thẳng API vẫn nhận `FORBIDDEN` (AC #3, `docs/learning-path.md`
 * § "Luật chạy Ở SERVER"). Không hàm nào trong file này QUYẾT ĐỊNH mở hay khoá;
 * chúng chỉ dịch quyết định của server sang câu chữ.
 *
 * ## Hai lý do khác nhau khiến một mắt xích không mở được
 *
 * `locked` (chưa tới lượt) và `missing` (`title === null` — nội dung đã bị lưu
 * trữ hoặc id gõ sai) trông giống nhau với người học nhưng là hai chuyện khác
 * hẳn: cái đầu tự mở khi học tiếp, cái sau chỉ người soạn sửa được. `learning_
 * path_items.item_id` cố ý KHÔNG có foreign key (`docs/learning-path.md`
 * § "Mắt xích thủng hiện ra, không bị giấu"), nên hiện nó ra thay vì lọc đi là
 * một quyết định, không phải một thiếu sót.
 *
 * Một item vừa `locked` vừa `missing` thì cổng là `locked` (đó là thứ người học
 * hành động được), nhưng `missingContent` vẫn `true` để câu cảnh báo cho người
 * soạn không biến mất — gộp hai tín hiệu thành một nhánh sẽ giấu đúng thông tin
 * người soạn cần.
 */

export const PATH_ITEM_KIND_LABEL: Record<PathItemKind, string> = {
  lesson: t('catalog.path.kind-lesson'),
  lab: 'Lab',
  quiz: 'Quiz',
};

const PATH_ITEM_KIND_BASE_HREF: Record<PathItemKind, string> = {
  lesson: '/lessons',
  lab: '/labs',
  quiz: '/quiz',
};

/** Cổng mở của một item, theo thứ tự ưu tiên `locked` → `missing` → `open`. */
export type ItemOpenability = 'open' | 'locked' | 'missing';

export interface PathItemViewModel {
  readonly key: string;
  readonly item: LearningPathItemView;
  /** `"3. Lab"` — số thứ tự hiển thị (1-based) + loại nội dung. */
  readonly ordinalLabel: string;
  /** `title` khi nạp được; ngược lại chính `itemId`, để người soạn biết mắt xích nào thủng. */
  readonly title: string;
  readonly openability: ItemOpenability;
  readonly stateLabel: string;
  readonly stateVariant: BadgeVariant;
  /** `true` khi nội dung không nạp được — độc lập với `openability`. */
  readonly missingContent: boolean;
  /** Vì sao không mở được. `null` khi mở được. */
  readonly note: string | null;
  /** `null` khi không mở được — không có link nào để bấm nhầm. */
  readonly href: string | null;
}

const STATE_LABEL: Record<LearningPathItemView['state'], string> = {
  passed: t('catalog.path.state-passed'),
  available: t('catalog.path.state-available'),
  locked: t('catalog.path.state-locked'),
};

const STATE_VARIANT: Record<LearningPathItemView['state'], BadgeVariant> = {
  passed: 'success',
  available: 'secondary',
  // `secondary` chứ không `destructive`: còn khoá là trạng thái BÌNH THƯỜNG của
  // một lộ trình tuần tự, không phải một lỗi.
  locked: 'outline',
};

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

export function buildPathItemViews(
  items: readonly LearningPathItemView[],
): PathItemViewModel[] {
  return items.map((item) => {
    const openability = itemOpenability(item);
    return {
      key: `${item.kind}:${item.itemId}`,
      item,
      ordinalLabel: t('catalog.path.ordinal', {
        n: item.ordinal + 1,
        kind: PATH_ITEM_KIND_LABEL[item.kind],
      }),
      title: item.title ?? item.itemId,
      openability,
      stateLabel: STATE_LABEL[item.state],
      stateVariant: STATE_VARIANT[item.state],
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
  /** Câu chữ về số phần đã đạt. */
  readonly label: string;
  /** Câu về việc nên làm tiếp. `null` khi hệ thống KHÔNG biết. */
  readonly nextLabel: string | null;
  /** `true` khi mọi phần đều đã đạt. */
  readonly finished: boolean;
}

/**
 * Nhãn tiến độ lộ trình.
 *
 * ⚠ Bẫy P2 (`docs/learning-path.md` § "Nhãn tiến độ chỉ được nói thứ nó biết").
 * Hệ thống biết đúng ba điều: đã đạt bao nhiêu phần trên bao nhiêu, phần nào
 * nên làm tiếp, và lộ trình có tuần tự không. Nó KHÔNG biết người học đã bỏ ra
 * bao lâu hay còn bao nhiêu phút nữa — không nhãn nào ở đây được nói thế.
 *
 * Cái bẫy cụ thể ở hàm này: `nextItemId === null` KHÔNG đồng nghĩa "đã xong".
 * DTO ghi rõ nó cũng `null` *"khi mọi thứ còn lại đều locked"*. Đọc `null` thành
 * "hoàn thành" là đúng hình dạng lỗi P2 — kết luận nhiều hơn dữ liệu — nên
 * `finished` được suy từ `passedCount === itemCount`, và khi không suy được thì
 * `nextLabel` là `null` chứ không phải một câu chúc mừng sai.
 */
export function summarizePathProgress(
  detail: Pick<LearningPathDetail, 'passedCount' | 'itemCount' | 'nextItemId' | 'items'>,
): PathProgressSummary {
  const finished = detail.itemCount > 0 && detail.passedCount >= detail.itemCount;
  const label = t('catalog.path.progress', { passed: detail.passedCount, total: detail.itemCount });

  if (detail.nextItemId !== null) {
    // Hiện TIÊU ĐỀ, không hiện mã. `nextItemId` là một `scenarioId` như
    // `ckad-configmap-as-files`; dán nó ra màn hình là bắt người học đọc khoá
    // chính của bảng.
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
