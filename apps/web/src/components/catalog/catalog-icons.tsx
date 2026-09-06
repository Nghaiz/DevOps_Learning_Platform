import type { ReactElement } from 'react';
import {
  Box,
  Check,
  ChevronRight,
  ChevronsLeft,
  CircleQuestionMark,
  Clock,
  Funnel,
  Layers,
  ListChecks,
  ListOrdered,
  Milestone,
  SlidersHorizontal,
  Tag,
  Target,
  Timer,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@devops-platform/ui';

/**
 * Bộ icon của trang danh mục — MỘT chỗ khai, và `aria-hidden` được đóng vào
 * chính thành phần bọc.
 *
 * ## Vì sao là một registry chứ không phải import thẳng ở nơi dùng
 *
 * Ràng buộc "icon `aria-hidden` khi đi kèm chữ" là thứ hỏng bằng cách QUÊN, chứ
 * không bằng cách làm sai — mỗi `<Clock />` viết tay là một dịp quên, và axe sẽ
 * đỏ `svg` không tên ở đúng chỗ ít ai mở lại. Ở đây `CatalogIcon` luôn đặt
 * `aria-hidden` + `focusable="false"`, nên KHÔNG có đường viết ra một icon thiếu
 * chúng mà vẫn qua được kiểu: không prop nào cho phép bật lại.
 *
 * Hệ quả có chủ ý: mọi icon trong lane này là TRANG TRÍ. Icon nào cần tự mang
 * nghĩa (không có chữ đi kèm) phải nằm trong một control có `aria-label` riêng —
 * `catalog-pager.tsx` làm đúng thế, và đó là lý do nút ở đó vẫn có chữ.
 *
 * ## Cái KHÔNG có ở đây: icon độ khó và icon trạng thái
 *
 * Bản đầu có `statusNotStarted`/`statusInProgress`/`statusCompleted`. Lane
 * primitive (`d636356`) đã đưa chúng vào chính `Badge` làm icon MẶC ĐỊNH theo
 * biến thể (vòng rỗng → nút play → dấu tích → ổ khoá; và sóng tín hiệu 1/2/3
 * vạch cho độ khó). Giữ bản của lane này song song sẽ là hai nguồn sự thật cho
 * cùng một bảo đảm WCAG 1.4.1, và tệ hơn: bản ở đây là OPT-IN nên nó biến một
 * bảo đảm-theo-mặc-định thành bảo đảm-nếu-nhớ.
 *
 * ## Vì sao lucide, và vì sao phải tra tên trên gói ĐÃ CÀI
 *
 * `lucide-react` có sẵn trong `apps/web/package.json` (`^1.38.0`) nhưng trước
 * lane này chưa được dùng lần nào. Bản thực cài là **1.40.0**, và lucide đã đổi
 * tên hàng loạt icon giữa các bản: `CircleHelp` và `Filter` KHÔNG còn tồn tại —
 * tên đúng là `CircleQuestionMark` và `Funnel`. Tra bằng trí nhớ thì hai import
 * đó sẽ chết lúc build; tên dưới đây được đối chiếu với `dist/lucide-react.d.ts`
 * của chính gói đang cài.
 */
const ICONS = {
  steps: ListOrdered,
  duration: Clock,
  topic: Tag,
  sandbox: Box,
  tasks: ListChecks,
  threshold: Target,
  questions: CircleQuestionMark,
  parts: Layers,
  ttl: Timer,
  leaderboard: Trophy,
  sequential: Milestone,
  filter: Funnel,
  sort: SlidersHorizontal,
  selected: Check,
  clear: X,
  first: ChevronsLeft,
  next: ChevronRight,
} satisfies Record<string, LucideIcon>;

export type CatalogIconName = keyof typeof ICONS;

/**
 * Một icon trang trí. Kích thước mặc định `size-3.5` khớp `text-xs` của chip —
 * icon to hơn chữ sẽ kéo mắt khỏi chính thông tin nó đang chú thích.
 */
export function CatalogIcon(props: {
  readonly name: CatalogIconName;
  readonly className?: string;
}): ReactElement {
  const Glyph = ICONS[props.name];
  return <Glyph aria-hidden="true" focusable="false" className={cn('size-3.5 shrink-0', props.className)} />;
}
