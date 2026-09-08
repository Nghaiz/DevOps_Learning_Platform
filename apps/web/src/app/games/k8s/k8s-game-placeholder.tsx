import type { ReactElement } from 'react';
import Link from 'next/link';
import { Button, EmptyState } from '@devops-platform/ui';

/**
 * ⛔ **TẠM THỜI — XOÁ Ở BƯỚC NỐI LANE E.**
 *
 * Lane D (route + catalog) và lane E (renderer 3D + panel DOM) chạy song song.
 * Lúc lane D viết `/games/k8s`, thư mục `apps/web/src/components/games/` **chưa
 * tồn tại** (đo 2026-09-08), nên `page.tsx` không có gì để import và route sẽ
 * không typecheck.
 *
 * File này là chỗ đứng tạm để route lên được ngay trong đợt này. Nó KHÔNG chứa
 * logic game, KHÔNG import `@devops-platform/games`, KHÔNG giữ state — đúng
 * ranh giới đã chốt: `K8sGame` của lane E sở hữu toàn bộ phần đó.
 *
 * **Cách nối (hai dòng trong `page.tsx`, rồi xoá file này):**
 *
 *   - import  : `{ K8sGamePlaceholder } from './k8s-game-placeholder'`
 *               → `{ K8sGame } from '../../../components/games/k8s-game'`
 *   - render  : `<K8sGamePlaceholder />` → `<K8sGame />`
 *
 * ⚠ `../../../components/...` chứ KHÔNG phải `@/components/...`: repo này
 * **không có** alias `@/` — `tsconfig.base.json` và `apps/web/tsconfig.json`
 * đều không khai `paths`, `next.config` không đặt alias webpack nào, và không
 * một file nào trong `apps/web/src` import theo dạng đó (grep 2026-09-08: 0 kết
 * quả). Viết `@/` sẽ đỏ ở cả typecheck lẫn `next build`.
 *
 * ⚠ `<h1>` của trang đang nằm TRONG file này. Khi nối, `K8sGame` phải tự dựng
 * `<h1>` — nếu không, `/games/k8s` mất tiêu đề cấp một và cổng axe của lane F
 * đỏ ở `page-has-heading-one`.
 */
export function K8sGamePlaceholder(): ReactElement {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">K8s Game</h1>
        <p className="text-sm text-muted-foreground">
          Dựng rồi cứu một cluster qua từng level. Không tốn sandbox, không cần đăng nhập — tiến độ lưu
          ngay trên máy bạn.
        </p>
      </header>

      <EmptyState
        title="Bàn chơi đang được lắp"
        description="Phần khung 3D và bảng điều khiển đang trong cùng đợt phát triển này. Trong lúc chờ, xem ba game còn lại ở trang danh mục."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/games">Về danh mục game</Link>
          </Button>
        }
      />
    </div>
  );
}
