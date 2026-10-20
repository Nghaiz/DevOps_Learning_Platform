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
  /**
   * Tên bước/nhiệm vụ mà trang đã in phía trên. Nội dung thường mở đầu bằng
   * chính dòng `# Tên` đó; khớp hoàn toàn (sau chuẩn hoá) thì dòng đó bị bỏ để
   * tên không lặp hai lần. Khác dù một chữ thì giữ nguyên.
   */
  readonly leadingTitle?: string | undefined;
}

/**
 * Cắt dấu câu cuối bằng vòng lặp, không bằng `/[.:!?]+$/`: regex đó thử lại từ mỗi vị
 * trí trong một dãy dấu chấm nên chạy bậc hai (đo 32 000 dấu chấm ≈ 1 s).
 */
function trimTrailingPunctuation(text: string): string {
  let end = text.length;
  while (end > 0 && '.:!?'.includes(text.charAt(end - 1))) end -= 1;
  return text.slice(0, end);
}

function normalizeTitle(text: string): string {
  return trimTrailingPunctuation(
    text
      .normalize('NFC')
      .toLowerCase()
      .replace(/[*_`]/g, '')
      .replace(/\s+/g, ' '),
  ).trim();
}

/**
 * Dòng `# Tên` / `## Tên` mở đầu nội dung (sau khoảng trắng tuỳ ý): trả tên và số ký
 * tự phải cắt, kể cả dấu xuống dòng. Quét bằng `indexOf` thay cho regex cũ
 * `[^\n]+?[ \t]*`: hai nhóm đó cùng nuốt được tab nên regex chạy bậc hai trên một
 * dòng nhiều tab (CodeQL js/polynomial-redos, đo 32 000 tab ≈ 1,5 s), mà markdown ở
 * đây do người soạn bài gõ.
 */
function leadingHeading(markdown: string): { readonly title: string; readonly length: number } | null {
  const start = markdown.search(/\S/);
  if (start === -1) return null;
  const newline = markdown.indexOf('\n', start);
  const line = markdown.slice(start, newline === -1 ? markdown.length : newline);
  const hashes = line.startsWith('##') ? 2 : line.startsWith('#') ? 1 : 0;
  const separator = line.charAt(hashes);
  if (hashes === 0 || (separator !== ' ' && separator !== '\t')) return null;
  return { title: line.slice(hashes).trim(), length: newline === -1 ? markdown.length : newline + 1 };
}

/** Bỏ dòng tiêu đề đầu nội dung khi nó trùng tên đã in ở trên. Hàm thuần, có test. */
export function stripLeadingTitle(
  blocks: readonly ContentBlock[],
  title: string | undefined,
): readonly ContentBlock[] {
  const first = blocks[0];
  if (title === undefined || first === undefined || first.kind !== 'markdown') return blocks;
  const heading = leadingHeading(first.markdown);
  if (heading === null) return blocks;
  if (normalizeTitle(heading.title) !== normalizeTitle(title)) return blocks;
  return [{ ...first, markdown: first.markdown.slice(heading.length) }, ...blocks.slice(1)];
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
  leadingTitle,
}: ContentViewProps) {
  const shown = stripLeadingTitle(blocks, leadingTitle);
  return (
    <div className="text-base leading-relaxed text-foreground">
      {shown.map((block, index) =>
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
