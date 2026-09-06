import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import type { ScenarioDifficulty } from '@devops-platform/shared-types/scenario';
import { Card, Skeleton, cn } from '@devops-platform/ui';
import { CatalogIcon, type CatalogIconName } from './catalog-icons';
import {
  DIFFICULTY_CHIP,
  DIFFICULTY_LABEL,
  DIFFICULTY_ACCENT,
  PROGRESS_STATUS_ICON,
  PROGRESS_STATUS_LABEL,
  PROGRESS_STATUS_STYLE,
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

/** Nhãn góc thẻ cho thuộc tính chỉ một số mục có (xếp hạng, học tuần tự). */
export interface CatalogCardFlag {
  readonly icon: CatalogIconName;
  readonly label: string;
}

/** Chip thông tin — icon nói LOẠI, chữ nói GIÁ TRỊ. Icon không bao giờ đứng một mình. */
function MetaChip(props: { readonly icon: CatalogIconName; readonly label: string }): ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <CatalogIcon name={props.icon} />
      {props.label}
    </span>
  );
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
 *
 * ## Dải màu độ khó là TRANG TRÍ, có chủ ý
 *
 * Dải bên trái không phải kênh thông tin duy nhất — ngay dưới nó là chip độ khó
 * mang đúng chữ đó. Nên nó thuộc ngoại lệ "pure decoration" của WCAG SC 1.4.11:
 * dù dải có tàng hình hoàn toàn thì không thông tin nào mất đi.
 *
 * Điều đó vẫn đáng ghi lại kể cả khi `95efe1f` đã đo và chốt cả sáu token ở hai
 * chế độ, vì hai câu hỏi khác nhau: lane nền bảo đảm cặp `--difficulty-X` với
 * `--difficulty-X-foreground` (nền-với-chữ-của-chính-nó), còn dải này nằm trên
 * `--card` — một cặp KHÁC. Lane này cố ý không tự phong cho mình một con số
 * chưa tự đo; nó dựa vào tính dư thừa, thứ đúng bất kể con số là bao nhiêu.
 * Thông tin thật đi qua chip.
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
  const statusLabel = status === undefined ? null : (PROGRESS_STATUS_LABEL[status] ?? status);
  const statusIcon = status === undefined ? undefined : PROGRESS_STATUS_ICON[status];
  const statusStyle =
    status === undefined ? undefined : (PROGRESS_STATUS_STYLE[status] ?? PROGRESS_STATUS_STYLE['not-started']);

  return (
    <li>
      <Link
        href={props.href}
        className="group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Card
          className={cn(
            'relative flex h-full flex-col gap-3 overflow-hidden p-5 pl-6 shadow-elevation-1',
            'transition-[box-shadow,transform,border-color] duration-(--motion-fast) ease-out',
            'group-hover:-translate-y-0.5 group-hover:border-input group-hover:shadow-elevation-2',
          )}
        >
          {props.difficulty !== undefined && (
            <span
              aria-hidden="true"
              className={cn('absolute inset-y-0 left-0 w-1', DIFFICULTY_ACCENT[props.difficulty])}
            />
          )}

          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base leading-snug font-semibold text-foreground">{props.title}</h3>
            {statusLabel !== null && statusIcon !== undefined && (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                  statusStyle,
                )}
              >
                <CatalogIcon name={statusIcon} />
                {statusLabel}
              </span>
            )}
          </div>

          {(props.difficulty !== undefined || props.flag !== undefined) && (
            <div className="flex flex-wrap items-center gap-2">
              {props.difficulty !== undefined && (
                <span
                  className={cn(
                    'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                    DIFFICULTY_CHIP[props.difficulty],
                  )}
                >
                  {DIFFICULTY_LABEL[props.difficulty]}
                </span>
              )}
              {props.flag !== undefined && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground">
                  <CatalogIcon name={props.flag.icon} />
                  {props.flag.label}
                </span>
              )}
            </div>
          )}

          <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{props.description ?? ''}</p>

          {(props.meta !== undefined || props.tags !== undefined) && (
            <div className="mt-auto flex flex-col gap-2">
              {props.meta !== undefined && props.meta.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {props.meta.map((item) => (
                    <MetaChip key={item.label} icon={item.icon} label={item.label} />
                  ))}
                </div>
              )}
              {props.tags !== undefined && props.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {props.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-foreground"
                    >
                      <CatalogIcon name="topic" />
                      {tag}
                    </span>
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
 * Các khối dưới đây lặp lại đúng bố cục thẻ mới: dải độ khó bên trái, hàng tiêu
 * đề + huy hiệu trạng thái, hàng chỉ dấu, hai dòng mô tả (đúng `min-h-10` mà thẻ
 * thật giữ chỗ), rồi hàng chip dưới đáy. Một khối chữ nhật trơn thì lúc dữ liệu
 * về, bố cục nhảy — và cú nhảy đó là thứ người dùng đọc thành "trang bị giật",
 * không phải "trang tải xong".
 */
export function CatalogGridSkeleton({ count = 6 }: { readonly count?: number }): ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Đang tải danh sách"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {Array.from({ length: count }, (_unused, index) => (
        <Card key={index} className="relative flex h-full flex-col gap-3 overflow-hidden p-5 pl-6">
          <Skeleton className="absolute inset-y-0 left-0 w-1 rounded-none" />
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
