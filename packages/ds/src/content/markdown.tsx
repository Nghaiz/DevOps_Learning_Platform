'use client';

import { Fragment, useMemo, useRef, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '../cn.ts';
import { Icon } from '../icons/icon.tsx';
import { embeddedHeadingLevel, type HeadingLevel } from './heading-level.ts';
import type { ContentLabels } from './labels.ts';

export interface MarkdownProps {
  readonly markdown: string;
  readonly labels: ContentLabels;
  readonly resolveAssetUrl?: ((relative: string) => string | null) | undefined;
  /**
   * Mở mọi liên kết ở tab mới. Bật trong khu thực hành: rời trang là đóng kết nối
   * terminal, và phiên đang chạy không gắn lại được từ một trang khác.
   */
  readonly linksInNewTab?: boolean;
  /** Cỡ chữ: `reading` cho bài học, `compact` cho đề bài/mô tả ngắn. */
  readonly density?: 'reading' | 'compact';
}

/**
 * Một đoạn markdown cắt ra từ giữa câu (quanh một khối lệnh nội dòng) không được bọc
 * `<p>`, nếu không chữ hai bên khối lệnh bị đẩy thành ba dòng riêng.
 */
const BLOCK_SYNTAX_START = /^[ \t]*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|```|\|)/m;
function isMidSentenceFragment(markdown: string): boolean {
  return !markdown.includes('\n\n') && !BLOCK_SYNTAX_START.test(markdown);
}

const REMOTE_SRC = /^([a-z][a-z0-9+.-]*:)?\/\//i;

function Image({
  src,
  alt,
  labels,
  resolveAssetUrl,
}: {
  src: string | undefined;
  alt: string | undefined;
  labels: ContentLabels;
  resolveAssetUrl: ((relative: string) => string | null) | undefined;
}) {
  if (src === undefined || src === '') return null;
  // CSP `img-src 'self' data:` chặn ảnh ngoài; nói thẳng và đưa link thay vì một ô vỡ.
  if (REMOTE_SRC.test(src)) {
    return (
      <span className="my-3 flex flex-col gap-1 rounded-md bg-well px-4 py-3 text-sm text-ink-2">
        <span>{labels.remoteImage}</span>
        <a href={src} target="_blank" rel="noopener noreferrer" className="w-fit text-acc-ink underline underline-offset-2">
          {labels.openRemoteImage(alt ?? '')}
        </a>
      </span>
    );
  }
  const resolved = resolveAssetUrl?.(src) ?? null;
  if (resolved === null) {
    return <span className="my-3 block rounded-md bg-well px-4 py-3 text-sm text-ink-2">{labels.brokenImage(alt ?? src)}</span>;
  }
  return <img src={resolved} alt={alt ?? ''} className="my-3 max-w-full rounded-md border border-rule" />;
}

function headingTag(markdown: string, level: HeadingLevel): 'h2' | 'h3' | 'h4' | 'h5' | 'h6' {
  return `h${String(embeddedHeadingLevel(markdown, level))}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export function Markdown({ markdown, labels, resolveAssetUrl, linksInNewTab = false, density = 'reading' }: MarkdownProps) {
  const inline = isMidSentenceFragment(markdown);
  const body = density === 'reading' ? 'text-md' : 'text-sm';
  /*
    ⛔ `components` phải GIỮ danh tính giữa các lượt render. react-markdown dùng các hàm trong đó
    làm kiểu phần tử: dựng lại mỗi lượt là gỡ rồi gắn lại toàn bộ cây bài, người học mất focus ở
    liên kết, ở vùng cuộn của bảng/khối mã và mất cả đoạn đang bôi đen (lab thăm dò mỗi 2s).
    `labels` và `resolveAssetUrl` hay đổi danh tính theo cha nên đọc qua ref, không làm khoá.
  */
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const resolveRef = useRef(resolveAssetUrl);
  resolveRef.current = resolveAssetUrl;
  const components = useMemo((): Components => {

  // Lớp chữ theo CẤP NGUỒN, thẻ theo cấp đã dời: trang đã có h1 của nó nên tiêu đề
  // trong bài bắt đầu từ h2, còn cỡ chữ vẫn giữ thứ bậc tác giả viết.
  const H = (level: HeadingLevel, className: string) =>
    function HeadingComponent({ children }: { children?: ReactNode }) {
      const Tag = headingTag(markdown, level);
      return <Tag className={cn('font-display font-semibold tracking-[-0.01em] text-ink', className)}>{children}</Tag>;
    };

  return {
    p: inline
      ? ({ children }) => <Fragment>{children}</Fragment>
      : ({ children }) => <p className={cn(body, 'leading-[1.7] text-ink')}>{children}</p>,
    h1: H(1, 'mt-6 mb-2 text-xl'),
    h2: H(2, 'mt-6 mb-2 text-lg'),
    h3: H(3, 'mt-5 mb-1.5 text-base'),
    h4: H(4, 'mt-4 mb-1 text-sm'),
    h5: H(5, 'mt-3 mb-1 text-sm'),
    h6: H(6, 'mt-3 mb-1 text-sm text-ink-2'),
    ul: ({ children }) => (
      <ul className={cn(body, 'my-1 flex list-disc flex-col gap-1.5 pl-5 text-ink marker:text-acc-mid')}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className={cn(body, 'my-1 flex list-decimal flex-col gap-1.5 pl-5 text-ink marker:text-acc-ink marker:font-medium')}>
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="pl-1 leading-[1.65]">{children}</li>,
    blockquote: ({ children }) => (
      <aside className="my-3 flex gap-3 rounded-md bg-acc-wash px-4 py-3 text-sm text-ink-2">
        <Icon name="lightbulb" size={18} tint="acc" className="mt-0.5 shrink-0 text-acc-ink" />
        <div className="flex min-w-0 flex-col gap-1.5 [&_p]:text-sm [&_p]:text-ink-2">{children}</div>
      </aside>
    ),
    a: ({ href, children }) => {
      const external = linksInNewTab || (href !== undefined && REMOTE_SRC.test(href));
      return (
        <a
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="inline-flex items-baseline gap-0.5 text-acc-ink underline decoration-acc-mid/50 underline-offset-[3px] transition-colors hover:decoration-acc-ink"
        >
          {children}
          {external ? (
            <>
              <Icon name="arrow-up-right" size={12} className="self-center" />
              <span className="sr-only">{labelsRef.current.opensInNewTab}</span>
            </>
          ) : null}
        </a>
      );
    },
    strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    hr: () => <hr className="my-6 border-rule" />,
    table: ({ children }) => (
      <div
        tabIndex={0}
        role="group"
        aria-label={labelsRef.current.tableRegion}
        className="relative my-3 overflow-x-auto outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-focus"
      >
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border-b border-rule-2 px-3 py-2 text-left text-xs font-medium text-ink-3">{children}</th>
    ),
    td: ({ children }) => <td className="border-b border-rule px-3 py-2 text-ink">{children}</td>,
    // `tabIndex`: khối mã dài cuộn ngang, và vùng cuộn phải tới được bằng bàn phím (axe
    // scrollable-region-focusable). Cùng cách với bảng ngay trên.
    pre: ({ children }) => (
      <pre
        tabIndex={0}
        role="group"
        aria-label={labelsRef.current.codeRegion('text')}
        className="relative my-4 overflow-x-auto rounded-md bg-[var(--code-bg)] px-4 py-3 text-[13px] leading-relaxed text-[var(--code-ink)] outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-focus"
      >
        {children}
      </pre>
    ),
    code: ({ className, children, node: _node, ...rest }) =>
      className ? (
        <code className={cn('font-mono', className)} {...rest}>
          {children}
        </code>
      ) : (
        <code className="rounded-xs bg-well-2 px-1.5 py-0.5 font-mono text-[0.88em] text-ink" {...rest}>
          {children}
        </code>
      ),
    img: ({ src, alt }) => (
      <Image
        src={typeof src === 'string' ? src : undefined}
        alt={alt}
        labels={labelsRef.current}
        resolveAssetUrl={resolveRef.current}
      />
    ),
  };
  }, [markdown, inline, body, linksInNewTab]);

  const Wrapper = inline ? 'span' : 'div';
  return (
    <Wrapper className={inline ? undefined : 'flex flex-col gap-3'}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={components}>
        {markdown}
      </ReactMarkdown>
    </Wrapper>
  );
}
