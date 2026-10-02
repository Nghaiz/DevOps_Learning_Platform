'use client';

import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import type { ContentBlock } from '@devops-platform/scenario/content-blocks';
import { cn } from '../cn.ts';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog.tsx';
import { CodeBlock, DEFAULT_CODE_BLOCK_LABELS, type CodeBlockLabels } from './code-block.tsx';
import { MarkdownView } from './markdown-view.tsx';

/** Câu chữ của khung nội dung. Gói `ui` không phụ thuộc `copy`, nên trang truyền vào. */
export interface ContentViewLabels extends CodeBlockLabels {
  /** Nhãn nút phóng to sơ đồ; tên đầy đủ là `${zoom}: ${alt}`. */
  readonly zoom: string;
}

const DEFAULT_LABELS: ContentViewLabels = { ...DEFAULT_CODE_BLOCK_LABELS, zoom: 'Phóng to sơ đồ' };

export interface ContentViewProps {
  readonly blocks: readonly ContentBlock[];
  /**
   * Sơ đồ TikZ đã dựng (`diagrams` của DTO bài). SVG đã làm sạch lúc build và
   * CI kiểm (`pnpm diagrams:check`), loader soi lại, nên chèn inline được để
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
   * `interrupt` = gửi Ctrl+C trước.
   */
  readonly onExec?: (command: string, interrupt: boolean) => void;
  /** `false` = nút chạy vẫn hiện nhưng bị khoá. Mặc định `true`. */
  readonly execEnabled?: boolean;
  /** Vì sao nút chạy đang khoá, hiện cạnh nút. Chỉ đọc khi `execEnabled === false`. */
  readonly execDisabledReason?: string | null;
  readonly labels?: ContentViewLabels;
}

type DiagramBlock = Extract<ContentBlock, { kind: 'diagram' }>;

/**
 * Một sơ đồ: hình rộng hết cột đọc, chú thích bên dưới, bấm để phóng to.
 *
 * Hình nằm TRONG nút: nút mang tên `${zoom}: ${alt}`, nên người dùng trình đọc
 * màn hình vẫn nghe được nội dung hình, và người dùng bàn phím mở được bản to.
 */
function DiagramFigure({
  block,
  svg,
  zoomLabel,
}: {
  readonly block: DiagramBlock;
  readonly svg: string | undefined;
  readonly zoomLabel: string;
}) {
  const [open, setOpen] = useState(false);

  if (svg === undefined) {
    return (
      <figure data-diagram={block.src} className="my-5">
        <p className="border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">{block.alt}</p>
        {block.caption !== null && (
          <figcaption className="mt-2 text-xs text-muted-foreground">{block.caption}</figcaption>
        )}
      </figure>
    );
  }

  return (
    <figure data-diagram={block.src} className="my-5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${zoomLabel}: ${block.alt}`}
        className={cn(
          'group relative block w-full cursor-zoom-in border border-border bg-card p-3 text-foreground',
          'transition-colors duration-[var(--motion-fast)] ease-out hover:border-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span
          aria-hidden="true"
          className="block [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-2 right-2 grid size-8 place-items-center bg-ink text-ink-foreground',
            'opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
        >
          <Maximize2 className="size-4" />
        </span>
      </button>
      {block.caption !== null && (
        <figcaption className="mt-2 text-xs text-muted-foreground">{block.caption}</figcaption>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] w-[min(96vw,1280px)] max-w-none overflow-auto">
          <DialogTitle>{block.caption ?? block.alt}</DialogTitle>
          <DialogDescription className="sr-only">{block.alt}</DialogDescription>
          <div
            data-diagram={block.src}
            role="img"
            aria-label={block.alt}
            className="text-foreground [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </DialogContent>
      </Dialog>
    </figure>
  );
}

/**
 * Vẽ toàn bộ nội dung một bài học từ `ContentBlock[]` (`parseContentBlocks`).
 * Tầng điều phối thuần: block nào đi MarkdownView, block nào đi CodeBlock, sơ
 * đồ nào đi DiagramFigure.
 *
 * Container là dòng chảy thường, không `flex`/`gap`: một `<CodeBlock inline>`
 * nằm giữa hai mảnh markdown của cùng một câu phải trôi cùng dòng với chữ.
 */
export function ContentView({
  blocks,
  diagrams,
  resolveAssetUrl,
  onExec,
  execEnabled,
  execDisabledReason = null,
  labels = DEFAULT_LABELS,
}: ContentViewProps) {
  return (
    <div className="text-base leading-relaxed text-foreground">
      {blocks.map((block, index) =>
        block.kind === 'markdown' ? (
          <MarkdownView key={index} markdown={block.markdown} resolveAssetUrl={resolveAssetUrl} />
        ) : block.kind === 'diagram' ? (
          <DiagramFigure
            key={index}
            block={block}
            svg={diagrams?.[block.src]?.svg}
            zoomLabel={labels.zoom}
          />
        ) : (
          <CodeBlock
            key={index}
            code={block.code}
            language={block.language}
            action={block.action}
            inline={block.inline}
            onExec={onExec}
            execEnabled={execEnabled}
            execDisabledReason={execDisabledReason}
            labels={labels}
          />
        ),
      )}
    </div>
  );
}
