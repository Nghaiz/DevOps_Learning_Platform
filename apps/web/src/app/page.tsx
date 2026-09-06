import { Suspense } from 'react';
import { HomeCta } from './home-cta';
import { Hero } from '../components/marketing/hero';
import { CatalogStats, CatalogStatsSkeleton } from '../components/marketing/catalog-stats';
import { ValueProps } from '../components/marketing/value-props';
import { GettingStarted } from '../components/marketing/getting-started';

/**
 * Trang chủ — Server Component. Một trong hai màn hình người lạ thấy đầu tiên.
 *
 * KHÔNG render `<main>`: vỏ ứng dụng (`components/shell/app-shell.tsx`) sở hữu
 * landmark đó cho mọi trang, và `components/session/landmark-contract.test.ts`
 * gác việc này bằng một phép quét tĩnh. Cũng KHÔNG `min-h-screen`: vỏ đã là
 * `min-h-dvh flex flex-col` và trang là ô co giãn bên trong — cộng thêm một
 * chiều cao bằng cả màn hình vào đó là luôn có thanh cuộn dư đúng bằng chiều
 * cao thanh điều hướng.
 *
 * ## Vì sao trang này chỉ còn là phần dựng khung
 *
 * Bốn dải nội dung nằm trong `components/marketing/`. Không phải để chia nhỏ
 * cho đẹp: mỗi dải mang dữ liệu và chú thích riêng của nó (dải số liệu còn kéo
 * theo cả một tầng đọc server), và gộp hết vào một file route sẽ cho một
 * `page.tsx` mà không ai đọc hết trước khi sửa.
 *
 * ⛔ KHÔNG có `index.ts` gom trong `components/marketing/`. `catalog-stats.tsx`
 * kéo theo `catalog-stats.server.ts`, thứ import `pg`/drizzle; một barrel gom
 * chung sẽ khiến bất kỳ Client Component nào lỡ import từ đó kéo `node:*` vào
 * bundle trình duyệt — hỏng chỉ lộ ra ở `next build`, sau khi typecheck, lint
 * và test đều đã xanh.
 *
 * ## `<Suspense>` quanh dải số liệu
 *
 * Dải đó đọc DB. Không bọc thì cả trang — kể cả tiêu đề và nút hành động —
 * phải đợi lượt đọc đó xong mới có byte đầu tiên. Bọc rồi thì hero hiện ngay,
 * số điền vào sau.
 */
export default function HomePage() {
  return (
    <div className="flex w-full flex-col">
      <Hero>
        <HomeCta />
      </Hero>

      <Suspense fallback={<CatalogStatsSkeleton />}>
        <CatalogStats />
      </Suspense>

      <ValueProps />
      <GettingStarted />
    </div>
  );
}
