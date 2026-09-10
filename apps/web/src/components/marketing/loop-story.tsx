import { t } from '@devops-platform/copy';
import { HomeSection } from './home-section';
import { LoopStoryClient } from './loop-story-client';

/**
 * Dải "Một vòng, bảy chặng" — phần kể chuyện của trang chủ.
 *
 * Design §3 nói cả hệ dùng một hình duy nhất: vòng ellipse hở của logo PTIT,
 * cũng chính là hình của vòng lặp CI/CD và của vòng lặp đối chiếu mà Kubernetes
 * chạy. Dải này là chỗ hình đó được kể thành câu chuyện, và chặng sáu (một pod
 * chết, cụm tự vá) là chặng mọi trang chủ DevOps khác bỏ qua.
 *
 * Component này thuần server và chỉ giữ phần khung: tiêu đề, câu dẫn, rồi giao
 * phần còn lại cho `LoopStoryClient`. Ranh giới đặt ở đây vì `next/dynamic` với
 * `ssr: false` chỉ gọi được bên trong một component `'use client'`, và vì phần
 * khung không cần một dòng JavaScript nào ở trình duyệt.
 *
 * `tone="muted"` để dải này đọc ra là một khối tách khỏi hai dải chữ quanh nó.
 * Cặp màu đã có số đo trong chú thích của `home-section.tsx`.
 */
export function LoopStory() {
  return (
    <HomeSection tone="muted" labelledBy="mot-vong" innerClassName="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="mot-vong" className="text-xl font-semibold text-foreground">
          {t('home.loop.heading')}
        </h2>
        <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
          {t('home.loop.lede')}
        </p>
      </div>

      <LoopStoryClient />
    </HomeSection>
  );
}
