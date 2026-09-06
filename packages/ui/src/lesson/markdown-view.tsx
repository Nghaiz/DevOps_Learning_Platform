import { Fragment, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '../cn.ts';
import { SCROLL_REGION_FOCUS } from './scroll-region.ts';

export interface MarkdownViewProps {
  readonly markdown: string;
  /**
   * Đổi đường dẫn ảnh tương đối (`./assets/topology.png`) thành URL tải được.
   * `null` = không phục vụ được ảnh đó — component tự vẽ placeholder, KHÔNG
   * bao giờ tự chế URL hay bỏ qua trong im lặng.
   */
  readonly resolveAssetUrl: (relative: string) => string | null;
}

/**
 * Một khối markdown "trần trụi" — không dòng trắng ngăn đoạn, không mở đầu
 * bằng cú pháp khối (heading/list/quote/table/fence) — LÀ MẢNH GIỮA CÂU do
 * `parseContentBlocks` (packages/scenario) cắt quanh code span có `{{copy}}`/
 * `{{exec}}`. Ví dụ "Chạy lệnh `ls -la`{{copy}} để xem." tách thành BA
 * ContentBlock: markdown "Chạy lệnh ", code inline, markdown " để xem.".
 *
 * remark mặc định bọc MỌI text rời vào `<p>` — nếu render bình thường, ba
 * mảnh trên vỡ thành ba dòng dù gốc chỉ là một câu. Heuristic dưới đây phát
 * hiện ca "mảnh giữa câu" để bỏ khung `<p>` (render Fragment), giữ mảnh nằm
 * trong cùng dòng chảy với `<CodeBlock inline>` ở ContentView. Đây là heuristic
 * dựa trên hình dạng chuỗi, không phải phân tích ngữ nghĩa đầy đủ — sai số
 * chấp nhận được vì hậu quả tệ nhất là một câu ngắn bị xuống dòng, không phải
 * hỏng nội dung.
 */
const BLOCK_SYNTAX_START = /^[ \t]*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|```|\|)/m;
function isMidSentenceFragment(markdown: string): boolean {
  return !markdown.includes('\n\n') && !BLOCK_SYNTAX_START.test(markdown);
}

/** `<p>` render thật — dùng cho markdown khối bình thường (đoạn văn độc lập). */
function BlockParagraph({ children }: { children?: ReactNode }) {
  return <p className="text-sm leading-relaxed text-foreground">{children}</p>;
}

/** `<p>` render rỗng (Fragment) — dùng cho mảnh giữa câu, không tạo hộp khối. */
function InlineParagraph({ children }: { children?: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}

/**
 * Nhận diện ảnh tương đối (đi qua `resolveAssetUrl`) so với ảnh tuyệt đối/từ xa.
 * `//host/x.png` (protocol-relative) cũng tính là "từ xa" vì nó vẫn thoát ra
 * ngoài origin của app — CSP `img-src 'self' data:` chặn cả hai dạng scheme.
 */
const REMOTE_SRC = /^([a-z][a-z0-9+.-]*:)?\/\//i;

function MarkdownImage({
  src,
  alt,
  resolveAssetUrl,
}: {
  // `| undefined` tường minh — react-markdown truyền `src`/`alt` kiểu
  // `string | undefined`; với `exactOptionalPropertyTypes: true` của repo,
  // `?: string` (thiếu `| undefined`) từ chối nhận giá trị `undefined` tường
  // minh dù key có mặt, khác với "key vắng mặt".
  src?: string | undefined;
  alt?: string | undefined;
  resolveAssetUrl: (relative: string) => string | null;
}) {
  if (src === undefined || src === '') {
    return null;
  }

  if (REMOTE_SRC.test(src)) {
    // CSP `img-src 'self' data:` chặn ảnh này ở RUNTIME — vi phạm CSP không
    // bao giờ ném lỗi ở tầng React (nó là báo cáo bất đồng bộ của trình
    // duyệt), nên nếu ta cứ render <img src={src}> thì người học chỉ thấy
    // một icon ảnh vỡ không lời giải thích. Vẽ placeholder tường minh + link
    // mở tab mới để họ vẫn xem được ảnh, chỉ là không nhúng trực tiếp.
    return (
      <span className="my-2 flex flex-col gap-1 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        <span>Ảnh lưu trên máy chủ ngoài — chính sách bảo mật của nền tảng chặn hiển thị trực tiếp.</span>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit text-primary underline underline-offset-2 hover:text-primary/80"
        >
          Mở ảnh trong tab mới{alt ? `: ${alt}` : ''}
        </a>
      </span>
    );
  }

  const resolved = resolveAssetUrl(src);
  if (resolved === null) {
    return (
      <span className="my-2 block rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        Không tải được ảnh{alt ? `: ${alt}` : ` (${src})`}.
      </span>
    );
  }

  return <img src={resolved} alt={alt ?? ''} className="my-2 max-w-full rounded-md border border-border" />;
}

/** Render markdown thành React element thật — KHÔNG dangerouslySetInnerHTML. */
export function MarkdownView({ markdown, resolveAssetUrl }: MarkdownViewProps) {
  const inline = isMidSentenceFragment(markdown);

  const components: Components = {
    p: inline ? InlineParagraph : BlockParagraph,
    h1: ({ children }) => <h1 className="mt-4 mb-2 text-xl font-semibold text-foreground">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-4 mb-2 text-lg font-semibold text-foreground">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-3 mb-1 text-base font-semibold text-foreground">{children}</h3>,
    ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-border pl-3 text-muted-foreground italic">{children}</blockquote>
    ),
    a: ({ href, children }) => (
      <a href={href} className="text-primary underline underline-offset-2 hover:text-primary/80">
        {children}
      </a>
    ),
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    hr: () => <hr className="my-4 border-border" />,
    // Bọc cuộn ngang PHẢI vào được bằng bàn phím — xem `scroll-region.ts`.
    // Bảng markdown thường không có ô nào focus được, nên thiếu `tabIndex` thì
    // phần cột tràn ra ngoài là không đọc nổi nếu chỉ có bàn phím.
    table: ({ children }) => (
      <div
        tabIndex={0}
        role="group"
        aria-label="Bảng — cuộn ngang bằng phím mũi tên"
        className={cn('my-2 overflow-x-auto', SCROLL_REGION_FOCUS)}
      >
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-border bg-muted px-2 py-1 text-left font-medium text-foreground">
        {children}
      </th>
    ),
    td: ({ children }) => <td className="border border-border px-2 py-1 text-foreground">{children}</td>,
    // Fence THƯỜNG (không hậu tố hành động) — parseContentBlocks cố ý để nguyên
    // trong markdown. Vẫn phải hiển thị đẹp dù không có nút copy/chạy.
    pre: ({ children }) => (
      <pre
        tabIndex={0}
        role="group"
        aria-label="Khối mã — cuộn ngang bằng phím mũi tên"
        className={cn(
          'my-2 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground',
          SCROLL_REGION_FOCUS,
        )}
      >
        {children}
      </pre>
    ),
    // `className` (dạng `language-xxx`) chỉ xuất hiện trên code BÊN TRONG fence
    // — đây là cách duy nhất phân biệt inline/block từ react-markdown v9+ (prop
    // `inline` đã bị bỏ khỏi API `code`). Bóc riêng `node` (hast AST, đến từ
    // `ExtraProps` của react-markdown) rồi KHÔNG spread nó xuống DOM — spread
    // thẳng `...rest` sẽ nhét `node` vào `<code>` thật, React cảnh báo
    // "unknown prop" ở console mỗi lần render.
    code: ({ className, children, node: _node, ...rest }) =>
      className ? (
        <code className={cn('font-mono', className)} {...rest}>
          {children}
        </code>
      ) : (
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground" {...rest}>
          {children}
        </code>
      ),
    // `src` của react-markdown khai là `string | Blob | undefined`. Nhánh `Blob`
    // không tới được từ markdown (nó có trong type vì dùng chung với thuộc tính
    // DOM), nhưng ép kiểu để bỏ qua nó là bỏ qua sai chỗ: nếu một plugin rehype
    // sau này thay `src` bằng object URL, phép ép sẽ biến nó thành "[object
    // Blob]" trong DOM. Thu hẹp bằng `typeof` và coi mọi thứ không phải chuỗi là
    // "không có ảnh" — cùng nhánh với `src` vắng mặt.
    img: ({ src, alt }) => (
      <MarkdownImage
        src={typeof src === 'string' ? src : undefined}
        alt={alt}
        resolveAssetUrl={resolveAssetUrl}
      />
    ),
  };

  const Wrapper = inline ? 'span' : 'div';
  return (
    <Wrapper className={inline ? undefined : 'flex flex-col gap-1'}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={components}>
        {markdown}
      </ReactMarkdown>
    </Wrapper>
  );
}
