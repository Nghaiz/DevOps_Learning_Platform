import type { ResourceKind } from '@devops-platform/games';
import { KIND_ACCENT } from '../arena-contract';

/**
 * Màu của từng loại tài nguyên, ở dạng CSS — dùng cho SVG, icon và badge.
 *
 * ## Vì sao không còn là một bảng hex
 *
 * Bản trước là 26 mã hex viết tay ngay tại đây, và nó có ba vấn đề cùng lúc:
 *
 * 1. **Nó là bảng màu THỨ HAI.** `KIND_ACCENT` trong hợp đồng đã ánh xạ đủ 26
 *    loại về tám token `--kind-*`, và `arena-palette.ts` đã dựng sẵn
 *    `palette.kind` từ chúng — nhưng KHÔNG AI ĐỌC. Toàn bộ đường token là mã
 *    chết, trong khi thứ người dùng thật sự nhìn thấy đến từ bảng hex này.
 * 2. **Nó không đổi theo theme.** Hex là hex; `--kind-pod` có hai giá trị cho
 *    hai theme, còn `#69a8ff` thì chỉ có một.
 * 3. **Nó vi phạm cổng `check-design-tokens.mjs`**, và đó là cổng nói đúng.
 *
 * Nay giá trị được SINH RA từ `KIND_ACCENT`, nên chỉ còn một bảng màu và nó
 * nằm ở hợp đồng.
 *
 * ⛔ Giá trị ở đây là chuỗi `var(--kind-…)`, nên nó chỉ dùng được ở nơi CSS
 * phân giải được: `style`, `className`, SVG `fill`/`stroke`. **`THREE.Color`
 * KHÔNG phân giải được `var()`** — nó nhận về một màu đen im lặng. Tầng 3D phải
 * đọc `ArenaColors.kind[…]`, thứ đã phân giải sẵn qua `scene-tokens.ts`.
 */
export const RESOURCE_COLOR = Object.fromEntries(
  Object.entries(KIND_ACCENT).map(([kind, token]) => [kind, `var(--${token})`]),
) as Record<ResourceKind, string>;

/** Mọi loại tài nguyên, theo thứ tự khai trong hợp đồng. */
export const RESOURCE_KINDS = Object.keys(KIND_ACCENT) as ResourceKind[];
