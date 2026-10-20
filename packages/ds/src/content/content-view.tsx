'use client';

import { useState } from 'react';
import type { ContentBlock } from '@devops-platform/scenario/content-blocks';
import { Icon } from '../icons/icon.tsx';
import { Dialog, DialogContent } from '../overlay.tsx';
import { CodeBlock } from './code-block.tsx';
import { Markdown } from './markdown.tsx';
import type { ContentLabels } from './labels.ts';

export interface ContentViewProps {
  readonly blocks: readonly ContentBlock[];
  readonly labels: ContentLabels;
  readonly diagrams?: Readonly<Record<string, { readonly svg: string }>> | undefined;
  readonly resolveAssetUrl?: ((relative: string) => string | null) | undefined;
  readonly onExec?: ((command: string, interrupt: boolean) => void) | undefined;
  readonly execEnabled?: boolean | undefined;
  readonly execDisabledReason?: string | null | undefined;
  /** Bỏ tiêu đề đầu bài nếu nó trùng với tiêu đề trang (Killercoda hay lặp lại). */
  readonly leadingTitle?: string | undefined;
  readonly linksInNewTab?: boolean;
  readonly density?: 'reading' | 'compact';
}

function trimTrailingPunctuation(text: string): string {
  let end = text.length;
  while (end > 0 && '.:!?'.includes(text.charAt(end - 1))) end -= 1;
  return text.slice(0, end);
}

function normalizeTitle(text: string): string {
  return trimTrailingPunctuation(text.normalize('NFC').toLowerCase().replace(/[*_`]/g, '').replace(/\s+/g, ' ')).trim();
}

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

export function stripLeadingTitle(blocks: readonly ContentBlock[], title: string | undefined): readonly ContentBlock[] {
  const first = blocks[0];
  if (title === undefined || first === undefined || first.kind !== 'markdown') return blocks;
  const heading = leadingHeading(first.markdown);
  if (heading === null || normalizeTitle(heading.title) !== normalizeTitle(title)) return blocks;
  return [{ ...first, markdown: first.markdown.slice(heading.length) }, ...blocks.slice(1)];
}

type DiagramBlock = Extract<ContentBlock, { kind: 'diagram' }>;

function DiagramFigure({ block, svg, labels }: { block: DiagramBlock; svg: string | undefined; labels: ContentLabels }) {
  const [open, setOpen] = useState(false);
  if (svg === undefined) {
    return (
      <figure data-diagram={block.src} className="my-5">
        <p className="rounded-md bg-well px-4 py-6 text-sm text-ink-2">{block.alt}</p>
        {block.caption === null ? null : <figcaption className="mt-2 text-xs text-ink-3">{block.caption}</figcaption>}
      </figure>
    );
  }
  return (
    <figure data-diagram={block.src} className="my-5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${labels.zoomDiagram}: ${block.alt}`}
        className="group relative block w-full cursor-zoom-in rounded-md border border-rule bg-paper p-4 text-ink transition-colors duration-150 hover:border-rule-2"
      >
        <span aria-hidden className="block [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <span
          aria-hidden
          className="absolute right-2 top-2 grid size-8 place-items-center rounded-sm bg-paper text-ink-2 opacity-0 shadow-lift transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Icon name="expand" size={16} />
        </span>
      </button>
      {block.caption === null ? null : <figcaption className="mt-2 text-xs text-ink-3">{block.caption}</figcaption>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={block.caption ?? block.alt} closeLabel={labels.closeDiagram} size="lg" className="max-w-[min(96vw,1280px)]">
          <div
            data-diagram={block.src}
            role="img"
            aria-label={block.alt}
            className="text-ink [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </DialogContent>
      </Dialog>
    </figure>
  );
}

/** Nội dung bài học / lab: markdown, khối lệnh chạy được, sơ đồ phóng to được. */
export function ContentView({
  blocks,
  labels,
  diagrams,
  resolveAssetUrl,
  onExec,
  execEnabled,
  execDisabledReason = null,
  leadingTitle,
  linksInNewTab = false,
  density = 'reading',
}: ContentViewProps) {
  const shown = stripLeadingTitle(blocks, leadingTitle);
  return (
    <div className="flex flex-col gap-3 text-ink">
      {shown.map((block, index) =>
        block.kind === 'markdown' ? (
          <Markdown
            key={index}
            markdown={block.markdown}
            labels={labels}
            resolveAssetUrl={resolveAssetUrl}
            linksInNewTab={linksInNewTab}
            density={density}
          />
        ) : block.kind === 'diagram' ? (
          <DiagramFigure key={index} block={block} svg={diagrams?.[block.src]?.svg} labels={labels} />
        ) : (
          <CodeBlock
            key={index}
            code={block.code}
            language={block.language}
            action={block.action}
            inline={block.inline}
            labels={labels}
            onExec={onExec}
            execEnabled={execEnabled}
            execDisabledReason={execDisabledReason}
          />
        ),
      )}
    </div>
  );
}
