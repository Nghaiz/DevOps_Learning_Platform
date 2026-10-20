import type { ReactNode } from 'react';
import { Icon, SectionArt, type IconName } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';

/**
 * Khung dùng chung của BỐN màn xác thực: `/login`, `/register`, `/forgot-password`,
 * `/reset-password`.
 *
 * Màn chia đôi, không thẻ nổi: trái là form đặt thẳng trên nền trang, phải (từ `lg`)
 * là một mảng màu nhấn nói nền tảng này làm gì. Người tới `/login` từ một liên kết được
 * gửi thường không đi qua trang chủ, nên đó là chỗ duy nhất họ đọc được điều này.
 *
 * ## Vì sao nó nằm trong `components/shell/**`
 *
 * Nó là vỏ, không phải nội dung. Bốn màn là bốn thư mục route rời nhau; khung sống
 * trong một thư mục route thì ba màn kia phải import ngược vào đó.
 *
 * ## KHÔNG `'use client'`, KHÔNG `<main>`
 *
 * Khung chỉ dựng bố cục và chữ tĩnh, nên là Server Component; bốn form bên trong tự
 * khai `'use client'`. Vỏ ứng dụng (`app-shell.tsx`) sở hữu `<main>` duy nhất.
 *
 * `flex-1` chứ không `min-h-screen`: `<main>` đã cao đúng phần còn lại của khung nhìn,
 * cộng thêm `min-h-screen` là sinh thanh cuộn dọc cho một trang không có gì để cuộn.
 */
export function AuthFrame({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <div data-full-bleed="" className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Neo form theo mép TRÊN, cùng khoảng đệm ở cả ba trang: căn giữa dọc làm tiêu đề nhảy chỗ giữa đăng nhập, đăng ký và quên mật khẩu. */}
      <div className="flex flex-col px-4 py-12 sm:px-8 lg:px-16 lg:pt-20 lg:pb-16">
        <div className="mx-auto w-full max-w-md animate-enter">
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-balance text-ink">{title}</h1>
          <p className="mt-2 text-md text-ink-2">{description}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <AuthAside />
    </div>
  );
}

/** Các mảng có bài trên nền tảng, vẽ bằng biểu tượng mang màu riêng của từng mảng. */
const TOPICS: readonly { readonly topic: string; readonly icon: IconName }[] = [
  { topic: 'kubernetes', icon: 'kube' },
  { topic: 'docker', icon: 'container' },
  { topic: 'git', icon: 'branch' },
  { topic: 'cicd', icon: 'pipeline' },
  { topic: 'linux', icon: 'penguin' },
  { topic: 'networking', icon: 'network' },
  { topic: 'observability', icon: 'activity' },
];

/**
 * Mảng phải: minh hoạ, một câu nói nền tảng làm gì, và hàng biểu tượng chủ đề.
 *
 * Ẩn dưới `lg`: ở màn hẹp nó đẩy form xuống dưới nếp gấp, và một lời giới thiệu đứng
 * trên ô mật khẩu là thứ người ta cuộn qua chứ không đọc.
 *
 * Hàng biểu tượng là trang trí (`aria-hidden`): nó nói bằng màu rằng có nhiều mảng,
 * nhưng không khẳng định số bài nào.
 */
function AuthAside() {
  return (
    <aside className="relative hidden overflow-hidden border-l border-rule bg-acc-wash lg:flex lg:flex-col lg:justify-center lg:gap-8 lg:px-14 lg:py-16 xl:px-20">
      <SectionArt kind="practice" width={300} className="animate-enter" />
      <div className="flex max-w-lg flex-col gap-4">
        <p className="font-display text-4xl font-semibold tracking-[-0.025em] text-balance text-ink">{t('auth.frame.headline')}</p>
        <p className="text-md leading-relaxed text-ink-2">{t('auth.frame.body')}</p>
      </div>
      <ul aria-hidden="true" className="flex flex-wrap gap-2">
        {TOPICS.map((item) => (
          <li
            key={item.topic}
            data-topic={item.topic}
            className="grid size-11 place-items-center rounded-full bg-tp-tint text-tp-ink transition-transform duration-200 hover:-translate-y-0.5"
          >
            <Icon name={item.icon} size={22} />
          </li>
        ))}
      </ul>
    </aside>
  );
}
