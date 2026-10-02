import type { ContentBlock } from '@devops-platform/scenario/content-blocks';
import { CodeBlock } from './code-block.tsx';
import { MarkdownView } from './markdown-view.tsx';

export interface ContentViewProps {
  readonly blocks: readonly ContentBlock[];
  /**
   * Sơ đồ TikZ đã dựng (`diagrams` của DTO bài). SVG đã làm sạch lúc build và
   * CI kiểm (`pnpm diagrams:check`), loader soi lại — nên chèn inline được, để
   * `currentColor` và class `dia-*` theo theme. Vắng ⇒ hiện alt thay hình.
   */
  readonly diagrams?: Readonly<Record<string, { readonly svg: string }>>;
  /**
   * Đổi đường dẫn ảnh tương đối trong markdown (`./assets/topology.png`) thành
   * URL tải được. Trả `null` = không phục vụ được ảnh đó.
   */
  readonly resolveAssetUrl: (relative: string) => string | null;
  /**
   * Bấm nút chạy trên code block. `undefined` = ẩn hẳn nút chạy.
   *
   * `interrupt` = gửi Ctrl+C trước. Chỉ hai tham số: sửa đổi 2 của hợp đồng
   * (§Y3) rút xuống MỘT terminal, nên không còn đích nào để mang theo.
   */
  readonly onExec?: (command: string, interrupt: boolean) => void;
  /** `false` = nút chạy vẫn hiện nhưng bị disable (terminal chưa sẵn sàng). Mặc định `true`. */
  readonly execEnabled?: boolean;
}

/**
 * Vẽ toàn bộ nội dung một bài học từ `ContentBlock[]` (packages/scenario —
 * `parseContentBlocks`). Đây là tầng orchestration THUẦN: quyết định block nào
 * đi MarkdownView, block nào đi CodeBlock, và truyền `onExec`/`execEnabled`
 * xuống — không tự vẽ markdown hay code, hai file kia lo phần đó.
 *
 * Không dùng `flex`/`gap` đều tay cho MỌI block: một `<CodeBlock inline>` nằm
 * GIỮA hai `ContentBlock.kind === 'markdown'` (mảnh trước + mảnh sau của cùng
 * một câu, xem markdown-view.tsx § isMidSentenceFragment) phải trôi cùng dòng
 * với văn bản xung quanh — bọc nó trong một hộp flex riêng sẽ ép nó xuống
 * dòng dù MarkdownView đã bỏ khung `<p>` cho hai mảnh kia. Container ở đây vì
 * vậy là DÒNG CHẢY THƯỜNG (block formatting context bình thường của trình
 * duyệt), không phải flex-column — mỗi block-level con (đoạn văn, code block
 * dạng fence) tự ngắt dòng theo đúng ngữ nghĩa CSS, còn span inline thì trôi
 * tự nhiên vào giữa.
 */
export function ContentView({ blocks, diagrams, resolveAssetUrl, onExec, execEnabled }: ContentViewProps) {
  return (
    <div className="max-w-[70ch] text-sm text-foreground">
      {blocks.map((block, index) =>
        block.kind === 'markdown' ? (
          <MarkdownView key={index} markdown={block.markdown} resolveAssetUrl={resolveAssetUrl} />
        ) : block.kind === 'diagram' ? (
          <figure key={index} data-diagram={block.src} className="my-4">
            {diagrams?.[block.src] === undefined ? (
              <p className="text-muted-foreground">{block.alt}</p>
            ) : (
              <div
                role="img"
                aria-label={block.alt}
                className="[&>svg]:h-auto [&>svg]:max-w-full"
                dangerouslySetInnerHTML={{ __html: diagrams[block.src]?.svg ?? '' }}
              />
            )}
            {block.caption !== null && (
              <figcaption className="mt-2 text-xs text-muted-foreground">{block.caption}</figcaption>
            )}
          </figure>
        ) : (
          <CodeBlock
            key={index}
            code={block.code}
            language={block.language}
            action={block.action}
            inline={block.inline}
            onExec={onExec}
            execEnabled={execEnabled}
          />
        ),
      )}
    </div>
  );
}
