import { BookOpen, FlaskConical, ListChecks, SquareTerminal, type LucideIcon } from 'lucide-react';
import { t, type TextKey } from '@devops-platform/copy';
import { Skeleton } from '@devops-platform/ui';
import { HomeSection } from './home-section';
import { readCatalogCounts, type CatalogKind } from './catalog-stats.server';
import styles from './landing.module.css';

/**
 * "Trong nền tảng có gì" — bốn con số ĐỌC TỪ SERVER.
 *
 * Mô tả từng loại lấy lại nguyên ý các chuỗi đang hiện ở chính trang danh mục
 * tương ứng (`lessons-client.tsx`, `labs-client.tsx`, `playgrounds-client.tsx`,
 * `quiz-client.tsx`) — cùng một giọng, và người dùng gặp lại đúng câu đó khi
 * bấm vào. Hai trong bốn câu đó mang U+2014 và đã được viết lại bằng dấu phẩy
 * lúc chuyển sang `packages/copy`; ký tự cũ không được thay bằng một ký tự khác
 * trông giống nó.
 *
 * Bốn ô KHÔNG phải liên kết, cố ý: mọi đường danh mục đều sau cổng đăng nhập
 * (`proxy.ts` đẩy khách qua `/login`), nên một ô trông bấm được mà bấm vào lại
 * ra màn hình đăng nhập là hứa sai — đúng cái bẫy `home-cta.tsx` đã tránh khi
 * đổi nhãn nút thành "Đăng nhập để bắt đầu". Ở đây bốn ô làm việc của chúng:
 * nói nền tảng có gì.
 */
const TILES: readonly {
  readonly kind: CatalogKind;
  readonly label: TextKey;
  readonly note: TextKey;
  readonly icon: LucideIcon;
}[] = [
  {
    kind: 'lessons',
    label: 'home.catalog-label.lessons',
    note: 'home.catalog-note.lessons',
    icon: BookOpen,
  },
  {
    kind: 'labs',
    label: 'home.catalog-label.labs',
    note: 'home.catalog-note.labs',
    icon: FlaskConical,
  },
  {
    kind: 'playgrounds',
    label: 'home.catalog-label.playgrounds',
    note: 'home.catalog-note.playgrounds',
    icon: SquareTerminal,
  },
  {
    kind: 'quizzes',
    label: 'home.catalog-label.quizzes',
    note: 'home.catalog-note.quizzes',
    icon: ListChecks,
  },
];

const GRID = styles.catalogGrid;
const TILE = styles.catalogItem;

export async function CatalogStats() {
  const counts = await readCatalogCounts();

  // Cả bốn lượt đọc đều hỏng ⇒ ẩn hẳn dải. Bốn dấu gạch nối cạnh nhau không
  // nói được gì cho người đọc và trông như trang bị vỡ; sự cố đã nằm trong
  // `console.error` của tầng server, đúng nơi người vận hành nhìn.
  if (TILES.every((tile) => counts[tile.kind] === null)) {
    return null;
  }

  const somethingMissing = TILES.some((tile) => counts[tile.kind] === null);

  return (
    <HomeSection labelledBy="co-gi" innerClassName={styles.catalogInner}>
      <div className={styles.catalogHeading}>
        <h2 id="co-gi">{t('home.catalog.heading')}</h2>
        <p>{t('home.catalog.lede')}</p>
      </div>

      <div className={GRID}>
        {TILES.map(({ kind, label, note }) => (
          <div key={kind} className={TILE}>
            <p className={styles.catalogCount}>
              {counts[kind] === null ? (
                <>
                  <span aria-hidden="true">-</span>
                  <span className="sr-only">{t('home.catalog.unknown-count')}</span>
                </>
              ) : (
                counts[kind]
              )}
            </p>
            <p className={styles.catalogLabel}>{t(label)}</p>
            <p className={styles.catalogNote}>{t(note)}</p>
          </div>
        ))}
      </div>

      {somethingMissing ? (
        <p className="text-sm text-muted-foreground">{t('home.catalog.partial')}</p>
      ) : null}
    </HomeSection>
  );
}

/**
 * Khung chờ trong lúc lượt đọc server chạy.
 *
 * Có `<Suspense>` bọc dải này (xem `app/page.tsx`) nên phần hero hiện NGAY,
 * không phải đợi một lượt đọc DB. Khung chờ giữ đúng chiều cao của dải thật để
 * nội dung phía dưới không nhảy khi số về.
 */
export function CatalogStatsSkeleton() {
  return (
    <HomeSection innerClassName={styles.catalogInner}>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <div className={GRID}>
        {TILES.map(({ kind }) => (
          <div key={kind} className={TILE}>
            <Skeleton className="size-5" />
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
      <span className="sr-only">{t('home.catalog.loading')}</span>
    </HomeSection>
  );
}
