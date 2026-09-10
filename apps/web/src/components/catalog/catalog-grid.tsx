import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import type { ScenarioDifficulty } from '@devops-platform/shared-types/scenario';
import { t } from '@devops-platform/copy';
import { Badge, Card, Skeleton } from '@devops-platform/ui';
import { CatalogIcon, type CatalogIconName } from './catalog-icons';
import {
  DIFFICULTY_ACCENT,
  DIFFICULTY_BADGE,
  PROGRESS_STATUS_BADGE,
  difficultyLabel,
  progressStatusLabel,
} from './catalog-labels';

/** Lưới thẻ. `<ul role="list">` tường minh vì `list-style: none` của Tailwind gỡ vai trò list ở Safari/VoiceOver. */
export function CatalogGrid({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <ul role="list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {children}
    </ul>
  );
}

/** Một ô thông tin của thẻ: icon trang trí + chữ mang nghĩa. */
export interface CatalogMetaItem {
  readonly icon: CatalogIconName;
  readonly label: string;
}

/** Nhãn cho thuộc tính chỉ một số mục có (xếp hạng, học tuần tự). */
export interface CatalogCardFlag {
  readonly icon: CatalogIconName;
  readonly label: string;
}

/**
 * Một thẻ danh mục — cả thẻ là một link.
 *
 * ## Vì sao `meta` là DỮ LIỆU chứ không còn là `ReactNode`
 *
 * Bản trước nhận `meta={<>...</>}`, nên mỗi trang trong năm trang tự dựng hàng
 * nhãn của mình. Hệ quả đo được trên ảnh chụp `/lessons` ở 1440px: bốn pill xám
 * y hệt nhau (`Trung cấp` `6 bước` `~25 phút` `kubernetes`) — bốn LOẠI thông tin
 * khác hẳn nhau bị trình bày giống hệt nhau, nên mắt phải đọc hết chữ mới biết
 * mình đang nhìn gì. Chuyển sang dữ liệu là cách duy nhất để thẻ tự quyết icon
 * và thứ bậc; giữ `ReactNode` thì "icon cho từng loại thông tin" phải đúng ở năm
 * chỗ và sẽ lệch ngay ở lần sửa thứ hai.
 *
 * ## Màu và hình đều do `packages/ui` sở hữu, không dựng lại ở đây
 *
 * `interactive` PHẢI được truyền: `Card` mặc định `false` vì hiệu ứng nhấc là
 * tín hiệu "bấm được" và không được hứa suông trên một tấm bảng tĩnh. Bỏ sót nó
 * KHÔNG đỏ ở đâu cả — lưới chỉ đơn giản mất hover, và trông y như trước khi
 * sửa. Thẻ này nằm trong `<Link>` nên nó là chỗ hợp lệ để bật.
 *
 * `accent` cho dải độ khó (một `border-l-4` thật, không phải khối tuyệt đối tự
 * kê), và `Badge` cho chip độ khó + huy hiệu trạng thái. Cả hai đã mang sẵn
 * icon riêng theo biến thể, nên ràng buộc "phân biệt bằng cả màu lẫn hình" được
 * giữ ở tầng primitive theo MẶC ĐỊNH — không phụ thuộc vào việc chỗ gọi có nhớ
 * hay không.
 *
 * ## Thứ bậc: tiêu đề → chỉ dấu → mô tả
 *
 * Chỉ dấu (độ khó, trạng thái học) đứng TRƯỚC mô tả, không lẫn vào hàng nhãn
 * dưới đáy. Người học quét lưới để chọn, và thứ họ lọc bằng mắt là "khó cỡ nào,
 * mình học tới đâu rồi" — chôn hai thứ đó xuống cuối thẻ là bắt họ đọc mô tả của
 * cả những mục họ sẽ bỏ qua.
 *
 * ## Chiều cao đều nhau
 *
 * Mô tả vừa cắt `line-clamp-2` vừa GIỮ CHỖ `min-h-10` kể cả khi rỗng. Chỉ cắt
 * thôi không đủ: lưới "rách" trong ảnh chụp là do thẻ mô tả NGẮN, không phải thẻ
 * mô tả dài. `mt-auto` ở khối dưới lo phần đáy; hai thứ cộng lại cho các thẻ
 * cùng hàng một đường đáy chung.
 */
export function CatalogCard(props: {
  readonly href: string;
  readonly title: string;
  readonly description: string | null;
  readonly difficulty?: ScenarioDifficulty;
  /** Trạng thái tiến độ (`not-started` | `in-progress` | `completed`). Hiện chỉ `/lessons` có. */
  readonly status?: string;
  readonly flag?: CatalogCardFlag;
  readonly meta?: readonly CatalogMetaItem[];
  /** Thẻ chủ đề (`capabilities`) — trình bày khác chip thông tin vì nó là phân loại, không phải số đo. */
  readonly tags?: readonly string[];
}): ReactElement {
  const status = props.status;
  const statusLabel = status === undefined ? null : (progressStatusLabel(status) ?? status);

  // Spread có điều kiện, không `accent={... : undefined}`: repo bật
  // `exactOptionalPropertyTypes`, nên truyền tường minh `undefined` vào một prop
  // khai `accent?: CardAccent` là lỗi kiểu, không phải "bỏ prop".
  const accent = props.difficulty === undefined ? {} : { accent: DIFFICULTY_ACCENT[props.difficulty] };

  return (
    <li>
      <Link
        href={props.href}
        className="group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Card interactive {...accent} className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-xl leading-snug font-semibold text-balance text-foreground">{props.title}</h3>
            {statusLabel !== null && status !== undefined && (
              <Badge variant={PROGRESS_STATUS_BADGE[status] ?? 'status-todo'}>{statusLabel}</Badge>
            )}
          </div>

          {(props.difficulty !== undefined || props.flag !== undefined) && (
            <div className="flex flex-wrap items-center gap-2">
              {props.difficulty !== undefined && (
                <Badge variant={DIFFICULTY_BADGE[props.difficulty]}>{difficultyLabel(props.difficulty)}</Badge>
              )}
              {props.flag !== undefined && (
                <Badge variant="outline" icon={<CatalogIcon name={props.flag.icon} />}>
                  {props.flag.label}
                </Badge>
              )}
            </div>
          )}

          <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{props.description ?? ''}</p>

          {(props.meta !== undefined || props.tags !== undefined) && (
            <div className="mt-auto flex flex-col gap-2">
              {props.meta !== undefined && props.meta.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {props.meta.map((item) => (
                    <Badge key={item.label} variant="secondary" icon={<CatalogIcon name={item.icon} />}>
                      {item.label}
                    </Badge>
                  ))}
                </div>
              )}
              {props.tags !== undefined && props.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {props.tags.map((tag) => (
                    <Badge key={tag} variant="outline" icon={<CatalogIcon name="topic" />}>
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </Link>
    </li>
  );
}

/**
 * Khung chờ tải — phải khớp HÌNH DÁNG của thẻ thật.
 *
 * MỘT `role="status"` ở container, không phải một nhãn trên mỗi khối —
 * `Skeleton` cố ý `aria-hidden` (xem chú thích của nó) chính là để chỗ này phát
 * đúng một thông báo thay vì sáu.
 *
 * Các khối dưới đây lặp lại đúng bố cục thẻ mới: viền trái 4px thế chỗ `accent`,
 * hàng tiêu đề + huy hiệu trạng thái, hàng chỉ dấu, hai dòng mô tả (đúng
 * `min-h-10` mà thẻ thật giữ chỗ), rồi hàng chip dưới đáy. Một khối chữ nhật
 * trơn thì lúc dữ liệu về, bố cục nhảy — và cú nhảy đó là thứ người dùng đọc
 * thành "trang bị giật", không phải "trang tải xong".
 *
 * ⚠ KHÔNG truyền `interactive` ở đây: khung chờ không bấm được, và một thẻ nhấc
 * lên khi rê chuột lại chẳng dẫn tới đâu là đúng lời hứa suông mà mặc định
 * `false` của `Card` sinh ra để chặn.
 *
 * Viền trái dùng `border-l-muted` chứ không phải một `--difficulty-*` cụ thể:
 * lúc chưa có dữ liệu thì độ khó là thứ CHƯA BIẾT, và tô sẵn một màu độ khó là
 * đoán — người dùng sẽ thấy màu đổi khi dữ liệu về.
 */
export function CatalogGridSkeleton({ count = 6 }: { readonly count?: number }): ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t('catalog.loading.grid')}
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {Array.from({ length: count }, (_unused, index) => (
        <Card key={index} className="flex h-full flex-col gap-3 border-l-4 border-l-muted p-5">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-5 w-20 shrink-0" />
          </div>
          <Skeleton className="h-5 w-24" />
          <div className="flex min-h-10 flex-col gap-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="mt-auto flex gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-14" />
          </div>
        </Card>
      ))}
    </div>
  );
}
